import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { avatarConfigSchema, checkAvatar, defaultCatalog } from "@rpg-forge/avatar-engine";
import { db } from "@/server/db";
import {
  applyLevelUp,
  CharacterDataSchema,
  cryptoRng,
  emptyCharacter,
  generateCompleteCharacter,
  getEngine,
  hasEngine,
  SessionStateSchema,
  type CharacterData,
} from "@rpg-forge/rules-engine";
import { currentRulesetVersion, loadCatalog, syncRulesets } from "@/server/rulesets";
import { publishCampaignEvent } from "@/server/realtime";
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

export async function createCharacter(userId: string, rulesetId: string, name: string, opts?: { randomize?: boolean }) {
  if (!hasEngine(rulesetId)) throw new Error("Sistema inválido.");
  await syncRulesets();
  const version = await currentRulesetVersion(rulesetId);
  const engine = getEngine(rulesetId);
  const catalog = await loadCatalog(rulesetId, version?.id);
  const data = opts?.randomize
    ? generateCompleteCharacter(engine, catalog, cryptoRng, { name: name.trim() || undefined })
    : emptyCharacter({ name });
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
      data: {
        characterId: ch.id,
        number: 1,
        reason: "created",
        summary: opts?.randomize ? "Ficha completa gerada aleatoriamente" : "Rascunho criado",
        level: data.level,
        data: data as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    await tx.auditLog.create({ data: { userId, action: "character.create", entityType: "Character", entityId: ch.id } });
    return ch;
  });
}

export async function getCharacter(characterId: string, userId: string) {
  const ch = await loadWithAccess(characterId, userId, "read");
  const data = CharacterDataSchema.parse(ch.data);
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId, ch.campaignId ?? undefined);
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
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId, ch.campaignId ?? undefined);
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
  if (ch.campaignId) publishCampaignEvent(ch.campaignId, "party", userId);
  return { revision: expectedRevision + 1, validation };
}

/** Atualiza apenas o estado de sessão do Modo Mesa (PV/PE/SAN atuais, condições e notas). */
export async function saveCharacterSession(characterId: string, userId: string, sessionInput: unknown) {
  const ch = await loadWithAccess(characterId, userId, "write");
  const session = SessionStateSchema.parse(sessionInput);
  const current = CharacterDataSchema.parse(ch.data);
  const next: CharacterData = { ...current, session };
  await db.character.update({
    where: { id: ch.id },
    data: { data: next as unknown as Prisma.InputJsonValue },
  });
  if (ch.campaignId) publishCampaignEvent(ch.campaignId, "party", userId);
  return session;
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
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId, ch.campaignId ?? undefined);
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

export class ImportCharacterError extends Error {}

const ImportSchema = z.object({
  format: z.literal("rpg-forge/personagem"),
  formatVersion: z.literal(1),
  ruleset: z.object({ id: z.string().refine(hasEngine, "Sistema de regras desconhecido ou não suportado.") }),
  character: z.object({
    name: z.string().max(80).optional(),
    data: CharacterDataSchema,
  }),
  avatar: z
    .object({
      assetsVersion: z.string().optional(),
      config: z.unknown(),
    })
    .nullable()
    .optional(),
});

/** Duplica um personagem do usuário (e o avatar, se houver), sem vinculá-lo a campanha. */
export async function duplicateCharacter(characterId: string, userId: string) {
  const src = await loadWithAccess(characterId, userId, "write");
  const avatar = await db.avatar.findUnique({ where: { characterId: src.id } });
  const parsed = CharacterDataSchema.parse(src.data);
  const copyName = `${(parsed.name || src.name || "Personagem").slice(0, 70)} (cópia)`;
  const nextData: CharacterData = { ...parsed, name: copyName };
  const engine = getEngine(src.rulesetId);
  const catalog = await loadCatalog(src.rulesetId, src.rulesetVersionId);
  const validation = engine.validate(nextData, catalog);

  return db.$transaction(async (tx) => {
    const ch = await tx.character.create({
      data: {
        ownerId: userId,
        rulesetId: src.rulesetId,
        rulesetVersionId: src.rulesetVersionId,
        name: copyName,
        level: nextData.level,
        status: src.status,
        data: nextData as unknown as Prisma.InputJsonValue,
        validation: validation as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.characterVersion.create({
      data: {
        characterId: ch.id,
        number: 1,
        reason: "created",
        summary: `Duplicado de ${parsed.name || src.name || "rascunho"}`,
        level: nextData.level,
        data: nextData as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    if (avatar) {
      await tx.avatar.create({
        data: {
          characterId: ch.id,
          ownerId: userId,
          config: avatar.config as Prisma.InputJsonValue,
          assetsVersion: avatar.assetsVersion,
          revision: 1,
        },
      });
    }
    await tx.auditLog.create({ data: { userId, action: "character.duplicate", entityType: "Character", entityId: ch.id, diff: { from: src.id } } });
    return ch;
  });
}

/** Importa um arquivo JSON exportado pelo RPG Forge (ficha + avatar opcional). */
export async function importCharacter(userId: string, rawJson: string) {
  if (rawJson.length > 500_000) throw new ImportCharacterError("Arquivo muito grande (máximo 500 KB).");
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch {
    throw new ImportCharacterError("O arquivo não contém um JSON válido.");
  }
  const parsed = ImportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ImportCharacterError("Formato inválido. Use um arquivo .rpgforge.json exportado pelo RPG Forge.");
  }

  const rulesetId = parsed.data.ruleset.id;
  await syncRulesets();
  const version = await currentRulesetVersion(rulesetId);
  const data = parsed.data.character.data;
  const name = (data.name || parsed.data.character.name || "Personagem importado").slice(0, 80);
  const finalData: CharacterData = { ...data, name };
  const engine = getEngine(rulesetId);
  const catalog = await loadCatalog(rulesetId, version?.id);
  const validation = engine.validate(finalData, catalog);

  let validAvatarConfig: ReturnType<typeof avatarConfigSchema.parse> | null = null;
  if (parsed.data.avatar?.config) {
    const av = avatarConfigSchema.safeParse(parsed.data.avatar.config);
    if (av.success && checkAvatar(av.data).length === 0) {
      validAvatarConfig = { ...av.data, assets: defaultCatalog.version };
    }
  }

  return db.$transaction(async (tx) => {
    const ch = await tx.character.create({
      data: {
        ownerId: userId,
        rulesetId,
        rulesetVersionId: version?.id,
        name,
        level: finalData.level,
        data: finalData as unknown as Prisma.InputJsonValue,
        validation: validation as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.characterVersion.create({
      data: {
        characterId: ch.id,
        number: 1,
        reason: "created",
        summary: "Importado de arquivo JSON",
        level: finalData.level,
        data: finalData as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    if (validAvatarConfig) {
      await tx.avatar.create({
        data: {
          characterId: ch.id,
          ownerId: userId,
          config: validAvatarConfig as unknown as Prisma.InputJsonValue,
          assetsVersion: defaultCatalog.version,
          revision: 1,
        },
      });
    }
    await tx.auditLog.create({ data: { userId, action: "character.import", entityType: "Character", entityId: ch.id } });
    return ch;
  });
}

/** Atualiza a ficha para a versão atual do catálogo do sistema, preservando snapshot anterior no histórico. */
export async function migrateCharacterCatalog(characterId: string, userId: string) {
  const ch = await loadWithAccess(characterId, userId, "write");
  const current = await currentRulesetVersion(ch.rulesetId);
  if (!current) throw new Error("Nenhuma versão atual do catálogo encontrada.");
  if (ch.rulesetVersionId === current.id) {
    return { updated: false, packVersion: current.packVersion };
  }
  const data = CharacterDataSchema.parse(ch.data);
  const engine = getEngine(ch.rulesetId);
  const catalog = await loadCatalog(ch.rulesetId, current.id, ch.campaignId ?? undefined);
  const validation = engine.validate(data, catalog);

  await snapshotCharacter(characterId, userId, "migration", `Antes de atualizar catálogo para v${current.packVersion}`);
  await db.character.update({
    where: { id: ch.id },
    data: {
      rulesetVersionId: current.id,
      validation: validation as unknown as Prisma.InputJsonValue,
      revision: { increment: 1 },
    },
  });
  await db.auditLog.create({
    data: {
      userId,
      action: "character.migrate_catalog",
      entityType: "Character",
      entityId: characterId,
      diff: { from: ch.rulesetVersionId, to: current.id, packVersion: current.packVersion },
    },
  });
  return { updated: true, packVersion: current.packVersion };
}

/** Gera, rotaciona ou revoga o token de link público somente leitura da ficha. */
export async function setPublicShare(characterId: string, userId: string, enabled: boolean): Promise<string | null> {
  const ch = await loadWithAccess(characterId, userId, "write");
  const current = CharacterDataSchema.parse(ch.data);
  const token = enabled ? randomBytes(12).toString("base64url") : undefined;
  const next: CharacterData = { ...current, publicShareToken: token };
  await db.character.update({
    where: { id: ch.id },
    data: { data: next as unknown as Prisma.InputJsonValue, revision: { increment: 1 } },
  });
  await db.auditLog.create({
    data: { userId, action: enabled ? "character.share_enable" : "character.share_revoke", entityType: "Character", entityId: characterId },
  });
  return token ? `${ch.id}.${token}` : null;
}

/** Carrega uma ficha pública somente leitura pelo token composto `<id>.<segredo>`. */
export async function getPublicCharacterByToken(compositeToken: string) {
  const dot = compositeToken.indexOf(".");
  if (dot <= 0) return null;
  const id = compositeToken.slice(0, dot);
  const secret = compositeToken.slice(dot + 1);
  if (!secret || secret.length > 64) return null;

  const ch = await db.character.findUnique({
    where: { id },
    include: { owner: { select: { displayName: true } } },
  });
  if (!ch) return null;
  const data = CharacterDataSchema.parse(ch.data);
  if (!data.publicShareToken) return null;

  const a = Buffer.from(data.publicShareToken, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId, ch.campaignId ?? undefined);
  return { record: ch, data, catalog, playerName: ch.owner.displayName };
}
