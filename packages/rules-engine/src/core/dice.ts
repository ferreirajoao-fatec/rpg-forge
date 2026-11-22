/**
 * Rolador de dados determinístico quando recebe um RNG injetado.
 *
 * Fórmulas suportadas (combináveis com + e -):
 *   NdX        ex.: 2d6, d20, 1d100
 *   NdXkhK     manter os K maiores (ex.: 4d6kh3, 2d20kh1 = vantagem)
 *   NdXklK     manter os K menores (ex.: 2d20kl1 = desvantagem)
 *   constantes ex.: +5, -1
 */

export const SUPPORTED_DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_DICE_PER_TERM = 100;
const MAX_TERMS = 20;

/** Retorna inteiro em [1, sides]. */
export type Rng = (sides: number) => number;

export const cryptoRng: Rng = (sides) => {
  // Amostragem por rejeição para evitar viés de módulo.
  const limit = Math.floor(0x1_0000_0000 / sides) * sides;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return (x % sides) + 1;
};

/** RNG reproduzível para testes e randomização com semente. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return (sides) => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * sides) + 1;
  };
}

export type DiceTerm =
  | { kind: "dice"; sign: 1 | -1; count: number; sides: number; keep?: { mode: "kh" | "kl"; n: number } }
  | { kind: "const"; sign: 1 | -1; value: number };

export class DiceFormulaError extends Error {}

const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$|^(\d+)$/;

export function parseFormula(formula: string): DiceTerm[] {
  const clean = formula.replace(/\s+/g, "").toLowerCase();
  if (!clean) throw new DiceFormulaError("Fórmula vazia.");
  const parts = clean.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join("") !== clean) throw new DiceFormulaError(`Fórmula inválida: "${formula}".`);
  if (parts.length > MAX_TERMS) throw new DiceFormulaError(`Máximo de ${MAX_TERMS} termos.`);

  return parts.map((raw) => {
    const sign: 1 | -1 = raw.startsWith("-") ? -1 : 1;
    const body = raw.replace(/^[+-]/, "");
    const m = TERM_RE.exec(body);
    if (!m) throw new DiceFormulaError(`Termo inválido: "${raw}".`);
    if (m[5] !== undefined) return { kind: "const", sign, value: Number(m[5]) };

    const count = m[1] === "" ? 1 : Number(m[1]);
    const sides = Number(m[2]);
    if (!SUPPORTED_DICE.includes(sides as (typeof SUPPORTED_DICE)[number])) {
      throw new DiceFormulaError(`Dado d${sides} não suportado. Use d4, d6, d8, d10, d12, d20 ou d100.`);
    }
    if (count < 1 || count > MAX_DICE_PER_TERM) {
      throw new DiceFormulaError(`Quantidade de dados deve estar entre 1 e ${MAX_DICE_PER_TERM}.`);
    }
    const term: DiceTerm = { kind: "dice", sign, count, sides };
    if (m[3]) {
      const n = Number(m[4]);
      if (n < 1 || n > count) throw new DiceFormulaError(`Não é possível manter ${n} de ${count} dados.`);
      term.keep = { mode: m[3] as "kh" | "kl", n };
    }
    return term;
  });
}

export interface TermResult {
  term: DiceTerm;
  rolls: number[];
  kept: boolean[];
  subtotal: number;
}

export interface RollResult {
  formula: string;
  total: number;
  terms: TermResult[];
  /** Explicação legível do cálculo, ex.: "2d6 [3, 5] + 3 = 11". */
  breakdown: string;
}

export function roll(formula: string, rng: Rng = cryptoRng): RollResult {
  const terms = parseFormula(formula);
  const results: TermResult[] = terms.map((term) => {
    if (term.kind === "const") {
      return { term, rolls: [], kept: [], subtotal: term.sign * term.value };
    }
    const rolls = Array.from({ length: term.count }, () => rng(term.sides));
    let kept = rolls.map(() => true);
    if (term.keep) {
      const order = rolls
        .map((v, i) => ({ v, i }))
        .sort((a, b) => (term.keep!.mode === "kh" ? b.v - a.v : a.v - b.v) || a.i - b.i);
      const keepIdx = new Set(order.slice(0, term.keep.n).map((o) => o.i));
      kept = rolls.map((_, i) => keepIdx.has(i));
    }
    const sum = rolls.reduce((acc, v, i) => (kept[i] ? acc + v : acc), 0);
    return { term, rolls, kept, subtotal: term.sign * sum };
  });

  const total = results.reduce((acc, r) => acc + r.subtotal, 0);
  const breakdown =
    results
      .map((r, idx) => {
        const signStr = r.term.sign < 0 ? "- " : idx === 0 ? "" : "+ ";
        if (r.term.kind === "const") return `${signStr}${r.term.value}`;
        const label = `${r.term.count}d${r.term.sides}${r.term.keep ? r.term.keep.mode + r.term.keep.n : ""}`;
        const dice = r.rolls.map((v, i) => (r.kept[i] ? `${v}` : `~${v}~`)).join(", ");
        return `${signStr}${label} [${dice}]`;
      })
      .join(" ") + ` = ${total}`;

  return { formula, total, terms: results, breakdown };
}

/** Monta a fórmula de um teste de d20 com modificador e vantagem/desvantagem. */
export function d20Formula(modifier: number, mode: "normal" | "advantage" | "disadvantage" = "normal"): string {
  const base = mode === "advantage" ? "2d20kh1" : mode === "disadvantage" ? "2d20kl1" : "1d20";
  if (modifier === 0) return base;
  return `${base}${modifier > 0 ? "+" : "-"}${Math.abs(modifier)}`;
}
