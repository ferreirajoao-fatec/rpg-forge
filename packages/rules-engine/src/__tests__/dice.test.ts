import { describe, expect, it } from "vitest";
import { d20Formula, DiceFormulaError, parseFormula, roll, seededRng, type Rng } from "../core/dice";

const fixed = (values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("dados", () => {
  it("rola fórmula com modificador e explica o cálculo", () => {
    const r = roll("2d6+3", fixed([3, 5]));
    expect(r.total).toBe(11);
    expect(r.breakdown).toBe("2d6 [3, 5] + 3 = 11");
  });

  it("vantagem mantém o maior, desvantagem o menor", () => {
    expect(roll(d20Formula(2, "advantage"), fixed([4, 17])).total).toBe(19);
    expect(roll(d20Formula(2, "disadvantage"), fixed([4, 17])).total).toBe(6);
  });

  it("4d6kh3 descarta o menor", () => {
    expect(roll("4d6kh3", fixed([1, 6, 4, 5])).total).toBe(15);
  });

  it("suporta todos os dados exigidos", () => {
    for (const s of [4, 6, 8, 10, 12, 20, 100]) {
      const rng = seededRng(s);
      for (let i = 0; i < 500; i++) {
        const t = roll(`d${s}`, rng).total;
        expect(t).toBeGreaterThanOrEqual(1);
        expect(t).toBeLessThanOrEqual(s);
      }
    }
  });

  it("subtração e constantes negativas", () => {
    expect(roll("1d8-1", fixed([1])).total).toBe(0);
    expect(d20Formula(-2)).toBe("1d20-2");
  });

  it("rejeita fórmulas inválidas", () => {
    for (const f of ["", "d7", "2d", "abc", "1000d6", "2d6kh3", "1d20++2"]) {
      expect(() => parseFormula(f), f).toThrow(DiceFormulaError);
    }
  });

  it("RNG com semente é reproduzível", () => {
    expect(roll("10d20", seededRng(42)).total).toBe(roll("10d20", seededRng(42)).total);
  });
});
