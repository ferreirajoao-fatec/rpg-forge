import "server-only";
import { del, get, put } from "@vercel/blob";
import { z } from "zod";
import { loadCatalog } from "@/server/rulesets";
import { db } from "@/server/db";
import { loadWithAccess } from "@/server/characters";
import { buildPrompt, PORTRAIT_STYLES, STYLE_IDS } from "@/server/portrait-prompt";
import { activeProvider, generateImage, ProviderError, supportsReference } from "@/server/image-providers";

export { PORTRAIT_STYLES };

/**
 * Retratos ilustrados gerados por IA (Cloudflare Workers AI ou Gemini, ver image-providers.ts). A imagem fica num Vercel Blob PRIVADO; o banco guarda o endereço
 * no Blob e o pedido. A página nunca vê o endereço do Blob: a imagem passa pela rota
 * /app/personagens/[id]/retrato/[portraitId], que confere a permissão (dono ou mestre da campanha).
 * No máximo um retrato ativo por personagem: ele aparece na ficha e na lista no lugar do avatar desenhado.
 * O avatar desenhado continua existindo: serve de referência de aparência e para token e exportação.
 */

/** Erro com mensagem para mostrar ao jogador. */
export class PortraitError extends Error {}

/** Retratos guardados por personagem (os mais antigos, fora o ativo, saem primeiro). */
const MAX_PER_CHARACTER = 12;
const GENERATE_ACTION = "avatar.portrait.generate";

const dailyLimit = () => Math.max(0, Number(process.env.AI_PORTRAIT_DAILY_LIMIT ?? 10) || 0);

/**
 * Credenciais do Blob: na Vercel, o store conectado ao projeto usa OIDC (BLOB_STORE_ID + o token OIDC que a
 * Vercel injeta). Fora dela, vale um BLOB_READ_WRITE_TOKEN.
 */
const blobConfigured = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

/** A geração só fica disponível quando o servidor tem um provedor de imagem e acesso ao Blob. */
export const portraitsEnabled = () => Boolean(activeProvider() && blobConfigured());

/** Endereço da imagem para as páginas (a rota que confere permissão), nunca o do Blob. */
export const portraitSrc = (characterId: string, portraitId: string) => `/app/personagens/${characterId}/retrato/${portraitId}`;

export const generateInputSchema = z.object({
  style: z.enum(STYLE_IDS),
  description: z.string().trim().max(600).default(""),
  /** Avatar desenhado em JPEG (base64, sem o prefixo data:), usado como referência de aparência. */
  reference: z
    .string()
    .max(700_000)
    .regex(/^[A-Za-z0-9+/]+=*$/)
    .optional(),
});

export interface PortraitView {
  id: string;
  url: string;
  style: string;
  description: string;
  active: boolean;
  createdAt: string;
}

const view = (p: { id: string; characterId: string; style: string; description: string; active: boolean; createdAt: Date }): PortraitView => ({
  id: p.id,
  url: portraitSrc(p.characterId, p.id),
  style: p.style,
  description: p.description,
  active: p.active,
  createdAt: p.createdAt.toISOString(),
});

async function usedToday(userId: string) {
  return db.auditLog.count({ where: { userId, action: GENERATE_ACTION, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
}

async function requireOwner(characterId: string, userId: string) {
  const ch = await loadWithAccess(characterId, userId, "write");
  if (ch.ownerId !== userId) throw new PortraitError("Só o dono do personagem pode mexer nos retratos.");
  return ch;
}

/** Gerações que o usuário ainda tem nas últimas 24 h. */
export async function remainingToday(userId: string) {
  return Math.max(0, dailyLimit() - (await usedToday(userId)));
}

/** Retratos do personagem e quantas gerações o usuário ainda tem hoje. */
export async function getPortraits(characterId: string, userId: string) {
  await loadWithAccess(characterId, userId, "read");
  const rows = await db.avatarPortrait.findMany({ where: { characterId }, orderBy: { createdAt: "desc" } });
  const limit = dailyLimit();
  return {
    portraits: rows.map(view),
    remaining: Math.max(0, limit - (await usedToday(userId))),
    limit,
    enabled: portraitsEnabled(),
    supportsReference: supportsReference(activeProvider()),
  };
}

/** "species:elf" → "elf", para quando o catálogo não tem o nome. */
const bareId = (prefixed: string) => prefixed.replace(/^[a-z]+:/, "");

/** Gera um retrato com o Gemini, guarda no Blob e o deixa ativo. */
export async function generatePortrait(characterId: string, userId: string, raw: unknown) {
  const provider = activeProvider();
  if (!provider || !blobConfigured()) throw new PortraitError("A geração de retratos por IA não está configurada neste servidor.");
  const parsed = generateInputSchema.safeParse(raw);
  if (!parsed.success) throw new PortraitError("Pedido inválido. Confira a descrição e o estilo.");
  const input = parsed.data;
  const ch = await requireOwner(characterId, userId);
  const limit = dailyLimit();
  if ((await usedToday(userId)) >= limit) throw new PortraitError(`Você atingiu o limite de ${limit} retratos por dia. Tente de novo amanhã.`);

  // A tentativa conta no limite mesmo se falhar (evita abuso repetindo pedidos bloqueados).
  const attempt = await db.auditLog.create({ data: { userId, action: GENERATE_ACTION, entityType: "Character", entityId: characterId, diff: { style: input.style } } });

  const data = ch.data as {
    speciesId?: string | null;
    classes?: { classId: string }[];
    inventory?: { contentId?: string; customName?: string; equipped?: boolean }[];
  } | null;
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId);
  const nameOf = (id: string | null | undefined) => (id ? (catalog.get(id)?.name ?? bareId(id)) : undefined);
  const prompt = buildPrompt({
    name: ch.name,
    level: ch.level,
    species: nameOf(data?.speciesId),
    className: nameOf(data?.classes?.[0]?.classId),
    gear: (data?.inventory ?? []).filter((it) => it.equipped).map((it) => it.customName || nameOf(it.contentId) || ""),
    style: input.style,
    description: input.description,
    withReference: Boolean(input.reference) && supportsReference(provider),
  });

  let image: Awaited<ReturnType<typeof generateImage>>;
  try {
    image = await generateImage(provider, prompt, supportsReference(provider) ? input.reference : undefined);
  } catch (e) {
    if (!(e instanceof ProviderError)) {
      console.error("[portraits] falha inesperada", e);
      throw new PortraitError("A IA não respondeu. Tente de novo em instantes.");
    }
    if (e.kind === "quota") {
      // A cota é do servidor, não do jogador: a tentativa não conta no limite dele.
      await db.auditLog.delete({ where: { id: attempt.id } }).catch(() => {});
      throw new PortraitError("A cota de geração de imagens do servidor acabou por hoje. Tente de novo amanhã.");
    }
    if (e.kind === "blocked") throw new PortraitError("A IA não gerou a imagem (o pedido pode ter sido barrado pelo filtro de segurança). Tente outra descrição.");
    throw new PortraitError("A IA não respondeu. Tente de novo em instantes.");
  }

  let blob: Awaited<ReturnType<typeof put>>;
  try {
    blob = await put(`portraits/${characterId}/retrato.${image.mime.split("/")[1]}`, image.data, {
      access: "private",
      contentType: image.mime,
      addRandomSuffix: true,
    });
  } catch (e) {
    console.error("[portraits] falha ao gravar no Blob", e);
    throw new PortraitError("A imagem foi gerada, mas não deu para guardá-la. Tente de novo.");
  }

  const created = await db.$transaction(async (tx) => {
    await tx.avatarPortrait.updateMany({ where: { characterId, active: true }, data: { active: false } });
    return tx.avatarPortrait.create({
      data: { characterId, ownerId: userId, url: blob.url, pathname: blob.pathname, style: input.style, description: input.description, model: image.model, active: true },
    });
  });

  // Mantém só os mais recentes.
  const old = await db.avatarPortrait.findMany({
    where: { characterId, active: false },
    orderBy: { createdAt: "desc" },
    skip: MAX_PER_CHARACTER - 1,
    select: { id: true, url: true },
  });
  if (old.length) {
    await db.avatarPortrait.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    await removeFiles(old.map((o) => o.url));
  }
  return { portrait: view(created), remaining: Math.max(0, limit - (await usedToday(userId))) };
}

async function removeFiles(urls: string[]) {
  if (!urls.length || !blobConfigured()) return;
  await del(urls).catch((e) => console.error("[portraits] falha ao apagar do Blob", e));
}

/** Define o retrato usado na ficha; `null` volta ao avatar desenhado. */
export async function setActivePortrait(characterId: string, userId: string, portraitId: string | null) {
  await requireOwner(characterId, userId);
  if (portraitId && !(await db.avatarPortrait.findFirst({ where: { id: portraitId, characterId }, select: { id: true } }))) {
    throw new PortraitError("Retrato não encontrado.");
  }
  await db.$transaction([
    db.avatarPortrait.updateMany({ where: { characterId, active: true }, data: { active: false } }),
    ...(portraitId ? [db.avatarPortrait.update({ where: { id: portraitId }, data: { active: true } })] : []),
  ]);
}

export async function deletePortrait(characterId: string, userId: string, portraitId: string) {
  await requireOwner(characterId, userId);
  const p = await db.avatarPortrait.findFirst({ where: { id: portraitId, characterId } });
  if (!p) throw new PortraitError("Retrato não encontrado.");
  await db.avatarPortrait.delete({ where: { id: p.id } });
  await removeFiles([p.url]);
}

/** Apaga os arquivos do Blob de um personagem (as linhas saem em cascata quando ele é excluído). */
export async function deletePortraitFiles(characterId: string) {
  const rows = await db.avatarPortrait.findMany({ where: { characterId }, select: { url: true } });
  await removeFiles(rows.map((r) => r.url));
}

/** Endereços dos retratos ativos (para a ficha e a lista). */
export async function activePortraitUrls(characterIds: string[]): Promise<Record<string, string>> {
  if (!characterIds.length) return {};
  const rows = await db.avatarPortrait.findMany({ where: { characterId: { in: characterIds }, active: true }, select: { id: true, characterId: true } });
  return Object.fromEntries(rows.map((r) => [r.characterId, portraitSrc(r.characterId, r.id)]));
}

/** Abre a imagem de um retrato para quem pode ver o personagem (dono ou mestre). null = não existe. */
export async function openPortrait(characterId: string, userId: string, portraitId: string) {
  await loadWithAccess(characterId, userId, "read");
  const p = await db.avatarPortrait.findFirst({ where: { id: portraitId, characterId }, select: { pathname: true } });
  if (!p || !blobConfigured()) return null;
  const file = await get(p.pathname, { access: "private" });
  if (!file?.stream) return null;
  return { stream: file.stream, contentType: file.blob.contentType ?? "image/png" };
}
