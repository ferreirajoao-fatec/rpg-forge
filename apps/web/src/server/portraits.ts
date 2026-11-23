import "server-only";
import { GoogleGenAI } from "@google/genai";
import { del, put } from "@vercel/blob";
import { z } from "zod";
import { loadCatalog } from "@/server/rulesets";
import { db } from "@/server/db";
import { loadWithAccess } from "@/server/characters";
import { buildPrompt, PORTRAIT_STYLES, STYLE_IDS } from "@/server/portrait-prompt";

export { PORTRAIT_STYLES };

/**
 * Retratos ilustrados gerados por IA (Gemini). A imagem fica no Vercel Blob; o banco guarda a URL e o pedido.
 * No máximo um retrato ativo por personagem: ele aparece na ficha e na lista no lugar do avatar desenhado.
 * O avatar desenhado continua existindo: serve de referência de aparência e para token e exportação.
 */

/** Erro com mensagem para mostrar ao jogador. */
export class PortraitError extends Error {}

/** Modelo de imagem do Gemini; dá para trocar sem mexer no código. */
const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";
/** Retratos guardados por personagem (os mais antigos, fora o ativo, saem primeiro). */
const MAX_PER_CHARACTER = 12;
const GENERATE_ACTION = "avatar.portrait.generate";

const dailyLimit = () => Math.max(0, Number(process.env.AI_PORTRAIT_DAILY_LIMIT ?? 10) || 0);

/** A geração só fica disponível quando o servidor tem a chave do Gemini e o token do Blob. */
export const portraitsEnabled = () => Boolean(process.env.GEMINI_API_KEY && process.env.BLOB_READ_WRITE_TOKEN);

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

const view = (p: { id: string; url: string; style: string; description: string; active: boolean; createdAt: Date }): PortraitView => ({
  id: p.id,
  url: p.url,
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
  return { portraits: rows.map(view), remaining: Math.max(0, limit - (await usedToday(userId))), limit, enabled: portraitsEnabled() };
}

/** "species:elf" → "elf", para quando o catálogo não tem o nome. */
const bareId = (prefixed: string) => prefixed.replace(/^[a-z]+:/, "");

/** Gera um retrato com o Gemini, guarda no Blob e o deixa ativo. */
export async function generatePortrait(characterId: string, userId: string, raw: unknown) {
  if (!portraitsEnabled()) throw new PortraitError("A geração de retratos por IA não está configurada neste servidor.");
  const parsed = generateInputSchema.safeParse(raw);
  if (!parsed.success) throw new PortraitError("Pedido inválido. Confira a descrição e o estilo.");
  const input = parsed.data;
  const ch = await requireOwner(characterId, userId);
  const limit = dailyLimit();
  if ((await usedToday(userId)) >= limit) throw new PortraitError(`Você atingiu o limite de ${limit} retratos por dia. Tente de novo amanhã.`);

  // A tentativa conta no limite mesmo se falhar (evita abuso repetindo pedidos bloqueados).
  await db.auditLog.create({ data: { userId, action: GENERATE_ACTION, entityType: "Character", entityId: characterId, diff: { style: input.style } } });

  const data = ch.data as { speciesId?: string | null; classes?: { classId: string }[] } | null;
  const catalog = await loadCatalog(ch.rulesetId, ch.rulesetVersionId);
  const nameOf = (id: string | null | undefined) => (id ? (catalog.get(id)?.name ?? bareId(id)) : undefined);
  const prompt = buildPrompt({
    name: ch.name,
    level: ch.level,
    species: nameOf(data?.speciesId),
    className: nameOf(data?.classes?.[0]?.classId),
    style: input.style,
    description: input.description,
    withReference: Boolean(input.reference),
  });

  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let image: { data?: string; mime_type?: string } | null | undefined;
  try {
    const interaction = await client.interactions.create({
      model: MODEL,
      input: [{ type: "text", text: prompt }, ...(input.reference ? [{ type: "image" as const, mime_type: "image/jpeg" as const, data: input.reference }] : [])],
      response_format: { type: "image", aspect_ratio: "3:4", image_size: "1K" },
      store: false,
    });
    image = interaction.output_image;
  } catch (e) {
    console.error("[portraits] falha no Gemini", e);
    throw new PortraitError("O Gemini não respondeu. Tente de novo em instantes.");
  }
  if (!image?.data) throw new PortraitError("A IA não gerou a imagem (o pedido pode ter sido barrado pelo filtro de segurança). Tente outra descrição.");

  const mime = image.mime_type === "image/jpeg" ? "image/jpeg" : image.mime_type === "image/webp" ? "image/webp" : "image/png";
  let blob: Awaited<ReturnType<typeof put>>;
  try {
    blob = await put(`portraits/${characterId}/retrato.${mime.split("/")[1]}`, Buffer.from(image.data, "base64"), {
      access: "public",
      contentType: mime,
      addRandomSuffix: true,
    });
  } catch (e) {
    console.error("[portraits] falha ao gravar no Blob", e);
    throw new PortraitError("A imagem foi gerada, mas não deu para guardá-la. Tente de novo.");
  }

  const created = await db.$transaction(async (tx) => {
    await tx.avatarPortrait.updateMany({ where: { characterId, active: true }, data: { active: false } });
    return tx.avatarPortrait.create({
      data: { characterId, ownerId: userId, url: blob.url, pathname: blob.pathname, style: input.style, description: input.description, model: MODEL, active: true },
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
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
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

/** URLs dos retratos ativos (para a ficha e a lista). */
export async function activePortraitUrls(characterIds: string[]): Promise<Record<string, string>> {
  if (!characterIds.length) return {};
  const rows = await db.avatarPortrait.findMany({ where: { characterId: { in: characterIds }, active: true }, select: { characterId: true, url: true } });
  return Object.fromEntries(rows.map((r) => [r.characterId, r.url]));
}
