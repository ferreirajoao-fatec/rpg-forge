import { describe, expect, it } from "vitest";
import { buildPrompt } from "./portrait-prompt";

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
