import "server-only";
import { avatarConfigSchema, checkAvatar, composeSvg, defaultAvatar, defaultCatalog, suggestFromCharacter, type AvatarConfig, type EquippedItem } from "@rpg-forge/avatar-engine";
import { loadCatalog } from "@/server/rulesets";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, loadWithAccess } from "@/server/characters";
import { activePortraitUrls } from "@/server/portraits";
import type { Prisma } from "@/generated/prisma/client";

/** Quantas versões nomeadas guardar por avatar (as mais antigas saem primeiro). */
const MAX_REVISIONS = 30;
const MAX_PRESETS = 40;

const json = (c: AvatarConfig) => c as unknown as Prisma.InputJsonValue;

/**
 * Lê uma configuração salva. Peças que deixaram de existir no catálogo são removidas
 * (e o slot obrigatório volta ao padrão) para o avatar continuar abrindo após atualizações de assets.
 */
export function parseAvatar(raw: unknown): AvatarConfig {
  const parsed = avatarConfigSchema.safeParse(raw);
  if (!parsed.success) return defaultAvatar();
  const config = parsed.data;
  const issues = checkAvatar(config);
  if (!issues.length) return config;
  const fallback = defaultAvatar();
  const slots = { ...config.slots };
  for (const issue of issues) if (issue.slot) slots[issue.slot] = fallback.slots[issue.slot] ?? { part: null, colors: {} };
  const marks = config.marks.filter((m) => defaultCatalog.get(m.part)?.slot === "marks");
  return { ...config, assets: defaultCatalog.version, slots, marks };
}

/** Valida o que veio do cliente: esquema estrito e só peças do catálogo. */
function validateInput(input: unknown): AvatarConfig {
  const config = avatarConfigSchema.parse(input);
  const issues = checkAvatar(config);
  if (issues.length) throw new ForbiddenError(issues[0].message);
  return { ...config, assets: defaultCatalog.version };
}

const idOf = (prefixed: string | null | undefined) => (prefixed ? prefixed.replace(/^[a-z]+:/, "") : undefined);

/** Itens equipados na ficha, só com nome e categoria (o avatar não conhece regras). */
async function equippedItems(rulesetId: string, versionId: string | null, inventory: { contentId: string; equipped?: boolean }[]): Promise<EquippedItem[]> {
  const worn = inventory.filter((i) => i.equipped);
  if (!worn.length) return [];
  const catalog = await loadCatalog(rulesetId, versionId);
  return worn.flatMap((i) => {
    const e = catalog.get(i.contentId);
    return e ? [{ name: e.name, category: String(e.data.category ?? "") }] : [];
  });
}

/** Avatar de um personagem (ou sugestão inicial, ainda não salva, a partir da raça e da classe). */
export async function getAvatar(characterId: string, userId: string) {
  const ch = await loadWithAccess(characterId, userId, "read");
  const avatar = await db.avatar.findUnique({
    where: { characterId },
    include: { revisions: { orderBy: { number: "desc" }, select: { number: true, label: true, createdAt: true } } },
  });
  const data = ch.data as { speciesId?: string | null; classes?: { classId: string }[]; inventory?: { contentId: string; equipped?: boolean }[] } | null;
  const hints = { species: idOf(data?.speciesId), className: idOf(data?.classes?.[0]?.classId) };
  const equipped = await equippedItems(ch.rulesetId, ch.rulesetVersionId, data?.inventory ?? []);
  if (avatar) {
    return { saved: true as const, config: parseAvatar(avatar.config), revision: avatar.revision, revisions: avatar.revisions, hints, equipped, notes: [], canEdit: ch.ownerId === userId, character: ch };
  }
  const suggested = suggestFromCharacter(defaultAvatar(), hints);
  return { saved: false as const, config: suggested.config, revision: 0, revisions: [], hints, equipped, notes: suggested.notes, canEdit: ch.ownerId === userId, character: ch };
}

/** Salvamento (automático ou manual) com concorrência otimista. Cria o avatar na primeira vez. */
export async function saveAvatar(characterId: string, userId: string, input: unknown, expectedRevision: number) {
  const ch = await loadWithAccess(characterId, userId, "write");
  const config = validateInput(input);
  const existing = await db.avatar.findUnique({ where: { characterId }, select: { id: true } });
  if (!existing) {
    if (expectedRevision !== 0) throw new ConflictError("O avatar foi removido em outra aba. Recarregue a página.");
    const created = await db.avatar.create({
      data: { characterId, ownerId: ch.ownerId, config: json(config), assetsVersion: config.assets, revision: 1 },
    });
    await db.auditLog.create({ data: { userId, action: "avatar.create", entityType: "Avatar", entityId: created.id } });
    return { revision: created.revision };
  }
  const updated = await db.avatar.updateMany({
    where: { characterId, revision: expectedRevision },
    data: { config: json(config), assetsVersion: config.assets, revision: { increment: 1 } },
  });
  if (updated.count === 0) throw new ConflictError("O avatar foi alterado em outra aba. Recarregue para ver a versão mais recente.");
  return { revision: expectedRevision + 1 };
}

async function ownAvatar(characterId: string, userId: string) {
  await loadWithAccess(characterId, userId, "write");
  const avatar = await db.avatar.findUnique({ where: { characterId } });
  if (!avatar) throw new ForbiddenError("Salve o avatar antes de criar versões.");
  return avatar;
}

/** Guarda a configuração atual como uma versão nomeada. */
export async function snapshotAvatar(characterId: string, userId: string, label: string) {
  const avatar = await ownAvatar(characterId, userId);
  return db.$transaction(async (tx) => {
    const last = await tx.avatarRevision.findFirst({ where: { avatarId: avatar.id }, orderBy: { number: "desc" }, select: { number: true } });
    const rev = await tx.avatarRevision.create({
      data: { avatarId: avatar.id, number: (last?.number ?? 0) + 1, label: label.trim().slice(0, 80) || "Versão salva", config: avatar.config as Prisma.InputJsonValue },
    });
    const old = await tx.avatarRevision.findMany({ where: { avatarId: avatar.id }, orderBy: { number: "desc" }, skip: MAX_REVISIONS, select: { id: true } });
    if (old.length) await tx.avatarRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return rev;
  });
}

/** Restaura uma versão: ela vira o avatar atual, e o estado anterior é guardado como nova versão. */
export async function restoreAvatar(characterId: string, userId: string, number: number) {
  const avatar = await ownAvatar(characterId, userId);
  const rev = await db.avatarRevision.findUnique({ where: { avatarId_number: { avatarId: avatar.id, number } } });
  if (!rev) throw new ForbiddenError("Versão não encontrada.");
  await snapshotAvatar(characterId, userId, `Antes de restaurar a versão ${number}`);
  const config = parseAvatar(rev.config);
  const updated = await db.avatar.update({ where: { id: avatar.id }, data: { config: json(config), assetsVersion: config.assets, revision: { increment: 1 } } });
  await db.auditLog.create({ data: { userId, action: "avatar.restore", entityType: "Avatar", entityId: avatar.id, diff: { number } } });
  return { config, revision: updated.revision };
}

export async function listPresets(userId: string) {
  const rows = await db.avatarPreset.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, config: true } });
  return rows.map((r) => ({ id: r.id, name: r.name, config: parseAvatar(r.config) }));
}

export async function savePreset(userId: string, name: string, input: unknown) {
  const config = validateInput(input);
  const count = await db.avatarPreset.count({ where: { ownerId: userId } });
  if (count >= MAX_PRESETS) throw new ForbiddenError(`Limite de ${MAX_PRESETS} visuais salvos. Apague algum antes.`);
  return db.avatarPreset.create({ data: { ownerId: userId, name: name.trim().slice(0, 60) || "Meu visual", config: json(config) } });
}

export async function deletePreset(userId: string, presetId: string) {
  const r = await db.avatarPreset.deleteMany({ where: { id: presetId, ownerId: userId } });
  if (!r.count) throw new ForbiddenError("Visual não encontrado.");
}

/**
 * Retratos de vários personagens, para a ficha e a lista: o retrato gerado por IA em uso, se houver;
 * senão o SVG do avatar salvo. O SVG vem do catálogo e de cores validadas, e a URL do retrato vem do
 * nosso Blob (e é escapada), então o HTML pode ser embutido na página.
 */
export async function portraitsFor(characterIds: string[], frame: "portrait" | "bust" | "full" = "portrait"): Promise<Record<string, string>> {
  if (!characterIds.length) return {};
  const [rows, ai] = await Promise.all([
    db.avatar.findMany({ where: { characterId: { in: characterIds } }, select: { characterId: true, config: true } }),
    activePortraitUrls(characterIds),
  ]);
  const out: Record<string, string> = Object.fromEntries(
    rows.map((r) => [r.characterId, composeSvg(parseAvatar(r.config), { frame, idPrefix: `av${r.characterId}` })]),
  );
  for (const [id, url] of Object.entries(ai)) {
    // O retrato é um busto 3:4: no recorte do rosto, sobe o enquadramento.
    const pos = frame === "portrait" ? "50% 22%" : "50% 30%";
    out[id] = `<img src="${escapeAttr(url)}" alt="" loading="lazy" style="display:block;width:100%;height:100%;object-fit:cover;object-position:${pos}" />`;
  }
  return out;
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
