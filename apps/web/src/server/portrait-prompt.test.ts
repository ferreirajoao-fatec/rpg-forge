import { describe, expect, it } from "vitest";
import { buildPrompt, PORTRAIT_STYLES } from "./portrait-prompt";

const base = { name: "Lyra", level: 3, species: "Elfo", className: "Mago", style: "aquarela" as const, description: "", withReference: false };

describe("pedido de retrato para o Gemini", () => {
  it("leva nome, nível, espécie, classe e o estilo escolhido", () => {
    const p = buildPrompt(base);
    expect(p).toContain("Lyra, a level 3 Elfo Mago");
    expect(p).toContain("watercolor");
  });

  it("cita a descrição do jogador entre aspas e só fala da referência quando há imagem", () => {
    expect(buildPrompt(base)).not.toContain("attached image");
    const p = buildPrompt({ ...base, description: "cabelo prateado", withReference: true });
    expect(p).toContain('"""cabelo prateado"""');
    expect(p).toContain("attached image");
  });

  it("não usa marcas registradas e pede imagem sem texto", () => {
    const p = buildPrompt(base);
    expect(p).not.toMatch(/dungeons|d&d|tormenta/i);
    expect(p).toMatch(/no(t include)? any text/i);
  });
});

describe("corpo inteiro e equipamento", () => {
  it("pede a figura inteira, da cabeça aos pés", () => {
    expect(buildPrompt(base)).toMatch(/full-length/);
    expect(buildPrompt(base)).toMatch(/head to feet/);
  });
  it("cita os itens equipados, sem vazios e com limite", () => {
    expect(buildPrompt(base)).not.toContain("Equipment");
    const p = buildPrompt({ ...base, gear: ["Espada longa", " ", "Cota de malha", "Escudo"] });
    expect(p).toContain("Equipment the character is carrying or wearing (may be in Portuguese): Espada longa, Cota de malha, Escudo.");
    const many = buildPrompt({ ...base, gear: Array.from({ length: 20 }, (_, i) => `Item ${i}`) });
    expect(many).toContain("Item 7.");
    expect(many).not.toContain("Item 8");
  });
});

describe("texto aceito pelos filtros de conteúdo", () => {
  // O filtro do Cloudflare barrou o pedido por "NSFW" quando o texto fixo dizia "bust" (busto).
  it("o texto fixo não usa palavras que disparam alarme falso", () => {
    for (const style of Object.keys(PORTRAIT_STYLES) as (keyof typeof PORTRAIT_STYLES)[]) {
      const p = buildPrompt({ ...base, style }).toLowerCase();
      for (const w of ["bust", "skin", "nude", "naked", "body"]) expect(p, `${style}: ${w}`).not.toMatch(new RegExp(`\\b${w}\\b`));
    }
  });
});

