import "server-only";
import { db } from "@/server/db";
import { applyLevelUp, CharacterDataSchema, getEngine, hasEngine, emptyCharacter, type CharacterData } from "@rpg-forge/rules-engine";
import { currentRulesetVersion, loadCatalog, syncRulesets } from "@/server/rulesets";
import type { Prisma } from "@/generated/prisma/client";

export class ForbiddenError extends Error {}
export class ConflictError extends Error {}

/**
 * Permissão de leitura: dono, ou mestre da campanha à qual o personagem está
 * vinculado. Escrita: somente o dono (o mestre age por aprovações/eventos).
 */
export async function loadWithAccess(characterId: string, userId: string, mode: "read" | "write") {
  const ch = await db.character.findUnique({
    where: { id: characterId },
    include: { campaign: { include: { members: { where: { userId } } } } },
  });
  if (!ch) throw new ForbiddenError("Personagem não encontrado.");
  if (ch.ownerId === userId) return ch;
  const isGm = ch.campaign?.members.some((m) => m.role === "gm");
  if (mode === "read" && isGm) return ch;
  // Mesmo erro para "não existe" e "sem acesso", para não vazar existência.
  throw new ForbiddenError("Personagem não encontrado.");
}

export async function listCharacters(userId: string) {
  return db.character.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, level: true, status: true, rulesetId: true, updatedAt: true, validation: true },
  });
}

export async function createCharacter(userId: string, rulesetId: string, name: string) {
  if (!hasEngine(rulesetId)) throw new Error("Sistema inválido.");
  await syncRulesets();
  const version = await currentRulesetVersion(rulesetId);
  const data = emptyCharacter({ name });
  const engine = getEngine(rulesetId);
  const catalog = await loadCatalog(rulesetId, version?.id);
  const validation = engine.validate(data, catalog);

  return db.$transaction(async (tx) => {
    const ch = await tx.character.create({
      data: {
        ownerId: userId,
        rulesetId,
        rulesetVersionId: version?.id,
        name: data.name,
        level: data.level,
        data: data as unknown as Prisma.InputJsonValue,
        validation: validation as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.characterVersion.create({
      data: { characterId: ch.id, number: 1, reason: "created", summary: "Rascunho criado", level: 1, data: data as unknown as Prisma.InputJsonValue, createdById: userId },
    });
    await tx.auditLog.create({ data: { userId, action: "character.create", entityType: "Character", entityId: ch.id } });
    return ch;
  });
}

export async function getCharacter(characterId: string, userId: string) {
  const ch = await loadWithAccess(characterId, userId, "read");
  const data = CharacterDataSchema.parse(ch.data);
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId);
  return { record: ch, data, catalog, canEdit: ch.ownerId === userId };
}

/**
 * Salvamento automático com controle de concorrência otimista.
 * O motor revalida no servidor — o cliente nunca é a autoridade.
 */
export async function saveCharacterData(characterId: string, userId: string, input: unknown, expectedRevision: number) {
  const ch = await loadWithAccess(characterId, userId, "write");
  const data: CharacterData = CharacterDataSchema.parse(input);
  const engine = getEngine(ch.rulesetId);
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId);
  const validation = engine.validate(data, catalog);

  const updated = await db.character.updateMany({
    where: { id: ch.id, revision: expectedRevision },
    data: {
      data: data as unknown as Prisma.InputJsonValue,
      validation: validation as unknown as Prisma.InputJsonValue,
      name: data.name,
      level: data.level,
      revision: { increment: 1 },
    },
  });
  if (updated.count === 0) throw new ConflictError("A ficha foi alterada em outra aba. Recarregue para continuar.");
  return { revision: expectedRevision + 1, validation };
}

/** Cria um snapshot nomeado (histórico de versões). */
export async function snapshotCharacter(characterId: string, userId: string, reason: string, summary: string) {
  const ch = await loadWithAccess(characterId, userId, "write");
  const last = await db.characterVersion.findFirst({ where: { characterId }, orderBy: { number: "desc" } });
  return db.characterVersion.create({
    data: { characterId, number: (last?.number ?? 0) + 1, reason, summary, level: ch.level, data: ch.data as Prisma.InputJsonValue, createdById: userId },
  });
}

/** Restaurar NÃO apaga o histórico: grava a versão antiga como uma nova versão. */
export async function restoreCharacterVersion(characterId: string, userId: string, versionNumber: number) {
  const ch = await loadWithAccess(characterId, userId, "write");
  const v = await db.characterVersion.findUnique({ where: { characterId_number: { characterId, number: versionNumber } } });
  if (!v) throw new ForbiddenError("Versão não encontrada.");
  const data = CharacterDataSchema.parse(v.data);
  const result = await saveCharacterData(characterId, userId, data, ch.revision);
  await snapshotCharacter(characterId, userId, "restore", `Restaurado a partir da versão ${versionNumber}`);
  await db.auditLog.create({ data: { userId, action: "character.restore", entityType: "Character", entityId: characterId, diff: { from: versionNumber } } });
  return result;
}

export class LevelUpError extends Error {}

/**
 * Sobe um nível. O servidor refaz o plano (nível máximo, XP) e aplica a subida —
 * o cliente só pede. Em progressão por XP, `experience` atualiza o XP antes de conferir.
 * Guarda a ficha de antes no histórico, para dar para desfazer restaurando a versão.
 */
export async function levelUpCharacter(characterId: string, userId: string, expectedRevision: number, experience?: number) {
  const ch = await loadWithAccess(characterId, userId, "write");
  let data = CharacterDataSchema.parse(ch.data);
  if (experience !== undefined && data.progressionMode === "xp") data = { ...data, experience: Math.max(0, Math.trunc(experience)) };
  const engine = getEngine(ch.rulesetId);
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId);
  const plan = engine.levelUpPlan(data, catalog);
  if (!plan.canLevelUp) throw new LevelUpError(plan.blockedReason ?? "Não é possível subir de nível agora.");

  await snapshotCharacter(characterId, userId, "edit", `Antes de subir para o ${plan.to}º nível`);
  const result = await saveCharacterData(characterId, userId, applyLevelUp(data), expectedRevision);
  await snapshotCharacter(characterId, userId, "level_up", `Subiu do ${plan.from}º para o ${plan.to}º nível`);
  await db.auditLog.create({ data: { userId, action: "character.level_up", entityType: "Character", entityId: characterId, diff: { from: plan.from, to: plan.to } } });
  return { ...result, plan };
}

export async function listVersions(characterId: string, userId: string) {
  await loadWithAccess(characterId, userId, "read");
  return db.characterVersion.findMany({
    where: { characterId },
    orderBy: { number: "desc" },
    select: { number: true, reason: true, summary: true, level: true, createdAt: true },
  });
}

export async function deleteCharacter(characterId: string, userId: string) {
  await loadWithAccess(characterId, userId, "write");
  await db.character.delete({ where: { id: characterId } });
  await db.auditLog.create({ data: { userId, action: "character.delete", entityType: "Character", entityId: characterId } });
}
