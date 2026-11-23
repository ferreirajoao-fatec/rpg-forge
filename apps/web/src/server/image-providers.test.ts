import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { activeProvider, parseCloudflareResponse, ProviderError, supportsReference } = await import("./image-providers");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");

describe("escolha do provedor", () => {
  afterEach(() => vi.unstubAllEnvs());
  const env = (vars: Record<string, string>) => {
    for (const k of ["AI_PORTRAIT_PROVIDER", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "GEMINI_API_KEY"]) vi.stubEnv(k, vars[k] ?? "");
  };

  it("sem credenciais, nenhum", () => {
    env({});
    expect(activeProvider()).toBeNull();
  });
  it("prefere o Cloudflare quando os dois estão configurados", () => {
    env({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t", GEMINI_API_KEY: "g" });
    expect(activeProvider()).toBe("cloudflare");
  });
  it("cai no Gemini quando só ele tem chave", () => {
    env({ GEMINI_API_KEY: "g" });
    expect(activeProvider()).toBe("gemini");
  });
  it("respeita AI_PORTRAIT_PROVIDER, mas só se tiver credenciais", () => {
    env({ AI_PORTRAIT_PROVIDER: "gemini", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_API_TOKEN: "t", GEMINI_API_KEY: "g" });
    expect(activeProvider()).toBe("gemini");
    env({ AI_PORTRAIT_PROVIDER: "cloudflare", GEMINI_API_KEY: "g" });
    expect(activeProvider()).toBeNull();
  });
  it("só o Gemini aceita imagem de referência", () => {
    expect(supportsReference("gemini")).toBe(true);
    expect(supportsReference("cloudflare")).toBe(false);
  });
});

describe("resposta do Cloudflare", () => {
  const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("lê a imagem do envelope result", () => {
    const r = parseCloudflareResponse(200, { success: true, result: { image: JPEG }, errors: [] });
    expect(r.mime).toBe("image/jpeg");
    expect(r.data.length).toBe(7);
  });
  it("reconhece PNG pelos bytes", () => {
    expect(parseCloudflareResponse(200, { result: { image: PNG } }).mime).toBe("image/png");
  });
  it("cota grátis esgotada vira erro de cota", () => {
    silence();
    const call = () => parseCloudflareResponse(429, { success: false, errors: [{ code: 3036, message: "daily free allocation exceeded" }] });
    expect(call).toThrow(ProviderError);
    try {
      call();
    } catch (e) {
      expect((e as InstanceType<typeof ProviderError>).kind).toBe("quota");
    }
  });
  it("filtro de conteúdo vira bloqueio; o resto, falha", () => {
    silence();
    const kind = (status: number, body: unknown) => {
      try {
        parseCloudflareResponse(status, body);
      } catch (e) {
        return (e as InstanceType<typeof ProviderError>).kind;
      }
    };
    expect(kind(400, { errors: [{ code: 3030, message: "NSFW content detected" }] })).toBe("blocked");
    expect(kind(401, { errors: [{ code: 10000, message: "Authentication error" }] })).toBe("failed");
    expect(kind(200, { result: {} })).toBe("failed");
    expect(kind(500, null)).toBe("failed");
  });
});
