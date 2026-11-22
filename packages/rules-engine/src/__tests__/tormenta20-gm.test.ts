import { describe, expect, it } from "vitest";
import { seededRng } from "..";
import tormenta20Pack from "../../../../content/tormenta20-2020/pack";
import { encounterNd, encounterXp, formatNd, groupNd, parseNd, rollTreasure, treasureRowFor, treasureTablesSchema } from "../systems/tormenta20-gm";

const tables = treasureTablesSchema.parse(tormenta20Pack.entries.find((e) => e.id === "rule:tabelas-de-tesouro")!.data.treasure);

describe("Tormenta20: ND do combate (exemplos do livro)", () => {
  it("frações e formatação", () => {
    expect(parseNd("1/4")).toBe(0.25);
    expect(formatNd(0.5)).toBe("1/2");
    expect(formatNd(7)).toBe("7");
  });

  it("criaturas abaixo de ND 1: ND × quantidade", () => {
    expect(groupNd("1/4", 4)).toBe(1); // quatro de ND 1/4 = ND 1
  });

  it("ND 1 ou mais: +2 a cada vez que a quantidade dobra", () => {
    expect(groupNd(5, 2)).toBe(7); // dois de ND 5 = ND 7
    expect(groupNd(8, 4)).toBe(12); // quatro de ND 8 = ND 12
    expect(groupNd(3, 3)).toBe(5); // três ainda não dobraram duas vezes
    expect(encounterNd([{ nd: 5, count: 2 }])).toEqual({ nd: 7, label: "7", exact: true });
  });

  it("tipos diferentes viram estimativa marcada como tal", () => {
    const r = encounterNd([
      { nd: 5, count: 1 },
      { nd: 5, count: 1 },
    ]);
    expect(r).toEqual({ nd: 7, label: "7", exact: false }); // coincide com a regra para iguais
    const mixed = encounterNd([
      { nd: 6, count: 1 },
      { nd: 2, count: 2 },
    ]);
    expect(mixed.exact).toBe(false);
    expect(mixed.nd).toBeGreaterThanOrEqual(6);
    expect(mixed.nd).toBeLessThan(8);
  });
});

describe("Tormenta20: experiência (exemplos do livro)", () => {
  it("ogro (ND 5) rende 5.000 XP; 1.250 para cada um de quatro", () => {
    const r = encounterXp([{ nd: 5, count: 1 }], { level: 4, size: 4 });
    expect(r.total).toBe(5000);
    expect(r.perCharacter).toBe(1250);
  });

  it("empate rende metade, derrota um quarto", () => {
    expect(encounterXp([{ nd: 4, count: 1 }], { level: 4, size: 4 }, "empate").total).toBe(2000);
    expect(encounterXp([{ nd: 4, count: 1 }], { level: 4, size: 4 }, "derrota").total).toBe(1000);
  });

  it("XP conta cada criatura e zera as triviais (ND 5 ou mais abaixo do nível)", () => {
    const r = encounterXp(
      [
        { nd: "1/2", count: 4 },
        { nd: 1, count: 1 },
      ],
      { level: 6, size: 4 },
    );
    expect(r.groups[0]).toMatchObject({ trivial: true, xp: 0 });
    expect(r.groups[1]).toMatchObject({ trivial: true, xp: 0 });
    expect(encounterXp([{ nd: "1/2", count: 4 }], { level: 1, size: 4 }).total).toBe(2000);
  });
});

describe("Tormenta20: tesouro", () => {
  it("as tabelas do pacote cobrem ND 1/4 a 20", () => {
    expect(tables.byNd.map((r) => r.nd)).toContain("1/4");
    expect(treasureRowFor(tables, 0.3).nd).toBe("1/4");
    expect(treasureRowFor(tables, 7.5).nd).toBe("7");
    expect(treasureRowFor(tables, 40).nd).toBe("20");
  });

  it("rolagens sempre caem numa linha e geram texto legível", () => {
    for (let seed = 1; seed < 200; seed++) {
      const nd = [0.25, 1, 3, 7, 12, 20][seed % 6];
      const r = rollTreasure(tables, nd, "padrao", seededRng(seed));
      expect(r.money).not.toBeNull();
      expect(r.items).toHaveLength(1);
      for (const line of [r.money!, ...r.items]) expect(line.text.length).toBeGreaterThan(0);
      if (r.money?.coins) for (const v of Object.values(r.money.coins)) expect(v).toBeGreaterThan(0);
    }
  });

  it("Dobro rola itens duas vezes e dobra moedas; Nenhum não rola", () => {
    const a = rollTreasure(tables, 5, "padrao", seededRng(42));
    const b = rollTreasure(tables, 5, "dobro", seededRng(42));
    expect(b.items).toHaveLength(2);
    if (a.money?.coins && b.money?.coins) {
      const [k] = Object.keys(a.money.coins);
      expect(b.money.coins[k]).toBe(a.money.coins[k] * 2);
    }
    expect(rollTreasure(tables, 5, "nenhum").money).toBeNull();
  });
});

describe("pacote 0.4.0: conteúdo do mestre", () => {
  it("traz criaturas, perigos, regras e condições", () => {
    const kinds = new Set(tormenta20Pack.entries.map((e) => e.kind));
    for (const k of ["creature", "hazard", "rule", "condition"]) expect(kinds.has(k as never)).toBe(true);
    const ids = tormenta20Pack.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
