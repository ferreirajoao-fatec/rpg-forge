import "server-only";
import { GoogleGenAI } from "@google/genai";

/**
 * Provedores de imagem para os retratos. Escolha por AI_PORTRAIT_PROVIDER ("cloudflare" ou "gemini");
 * sem ela, usa o primeiro que tiver credenciais, nesta ordem: Cloudflare (tem cota grátis diária), Gemini.
 */

export type ProviderId = "cloudflare" | "gemini";

/** Falha do provedor. `kind` decide a mensagem para o jogador. */
export class ProviderError extends Error {
  constructor(
    readonly kind: "quota" | "blocked" | "failed",
    message: string,
  ) {
    super(message);
  }
}

export interface GeneratedImage {
  data: Buffer;
  mime: "image/png" | "image/jpeg" | "image/webp";
  /** Modelo que gerou, guardado junto do retrato. */
  model: string;
}

const cloudflareConfigured = () => Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

export function activeProvider(): ProviderId | null {
  const wanted = process.env.AI_PORTRAIT_PROVIDER?.trim().toLowerCase();
  if (wanted === "cloudflare") return cloudflareConfigured() ? "cloudflare" : null;
  if (wanted === "gemini") return geminiConfigured() ? "gemini" : null;
  if (cloudflareConfigured()) return "cloudflare";
  if (geminiConfigured()) return "gemini";
  return null;
}

/** Só o Gemini aceita a imagem do avatar desenhado como referência. */
export const supportsReference = (p: ProviderId | null) => p === "gemini";

export async function generateImage(provider: ProviderId, prompt: string, reference?: string): Promise<GeneratedImage> {
  return provider === "cloudflare" ? generateWithCloudflare(prompt) : generateWithGemini(prompt, reference);
}

// ---------- Cloudflare Workers AI (FLUX.1 schnell) ----------

const CLOUDFLARE_MODEL = () => process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
/** O FLUX.1 schnell aceita até 8 passos; mais passos, mais detalhe (e mais cota). */
const CLOUDFLARE_STEPS = 8;
/** Limite de tamanho do prompt no modelo. */
const CLOUDFLARE_PROMPT_MAX = 2048;

async function generateWithCloudflare(prompt: string): Promise<GeneratedImage> {
  const model = CLOUDFLARE_MODEL();
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID!)}/ai/run/${model}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, CLOUDFLARE_PROMPT_MAX), steps: CLOUDFLARE_STEPS }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    console.error("[portraits] Cloudflare sem resposta", e);
    throw new ProviderError("failed", "cloudflare: sem resposta");
  }
  const body = await res.json().catch(() => null);
  return { ...parseCloudflareResponse(res.status, body), model };
}

/** Interpreta a resposta da API REST do Workers AI (separada para dar para testar). */
export function parseCloudflareResponse(status: number, body: unknown): Omit<GeneratedImage, "model"> {
  const b = (body ?? {}) as { success?: boolean; result?: { image?: unknown }; image?: unknown; errors?: { code?: number; message?: string }[] };
  const image = b.result?.image ?? b.image;
  if (status >= 200 && status < 300 && typeof image === "string" && image.length > 0) {
    const data = Buffer.from(image, "base64");
    return { data, mime: sniffMime(data) };
  }
  const errors = b.errors ?? [];
  const detail = errors.map((e) => `${e.code ?? "?"} ${e.message ?? ""}`.trim()).join("; ") || `HTTP ${status}`;
  console.error("[portraits] Cloudflare recusou", status, detail);
  // 3036 = cota diária grátis esgotada; 429 = limite de uso.
  if (status === 429 || errors.some((e) => e.code === 3036)) throw new ProviderError("quota", detail);
  if (errors.some((e) => /nsfw|safety|filter/i.test(e.message ?? ""))) throw new ProviderError("blocked", detail);
  throw new ProviderError("failed", detail);
}

/** O FLUX devolve JPEG, mas confere pelos primeiros bytes para gravar o tipo certo. */
function sniffMime(data: Buffer): GeneratedImage["mime"] {
  if (data[0] === 0x89 && data[1] === 0x50) return "image/png";
  if (data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "image/jpeg";
}

// ---------- Gemini ----------

const GEMINI_MODEL = () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";

async function generateWithGemini(prompt: string, reference?: string): Promise<GeneratedImage> {
  const model = GEMINI_MODEL();
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let image: { data?: string; mime_type?: string } | null | undefined;
  try {
    const interaction = await client.interactions.create({
      model,
      // API v1: a entrada é uma lista de passos; o texto e a imagem vão dentro de um passo "user_input".
      input: [
        {
          type: "user_input",
          content: [{ type: "text", text: prompt }, ...(reference ? [{ type: "image" as const, mime_type: "image/jpeg" as const, data: reference }] : [])],
        },
      ],
      response_format: { type: "image", aspect_ratio: "3:4", image_size: "1K" },
      store: false,
    });
    // A imagem vem em output_image; por garantia, procura também no último passo do modelo.
    image =
      interaction.output_image ??
      interaction.steps
        ?.filter((st) => st.type === "model_output")
        .flatMap((st) => st.content ?? [])
        .findLast((c) => c.type === "image");
  } catch (e) {
    console.error("[portraits] falha no Gemini", e);
    const status = (e as { status?: number }).status;
    throw new ProviderError(status === 429 ? "quota" : "failed", `gemini: ${status ?? "erro"}`);
  }
  if (!image?.data) throw new ProviderError("blocked", "gemini: sem imagem");
  const mime = image.mime_type === "image/jpeg" ? "image/jpeg" : image.mime_type === "image/webp" ? "image/webp" : "image/png";
  return { data: Buffer.from(image.data, "base64"), mime, model };
}
