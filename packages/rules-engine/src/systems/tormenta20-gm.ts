/**
 * Ferramentas do mestre para Tormenta20 (livro básico de 2020):
 *  - nível de desafio de um combate (Capítulo 7, "Vários Inimigos");
 *  - pontos de experiência (Capítulo 8, "Pontos de Experiência");
 *  - tesouro por ND (Capítulo 8, "Tesouro em Combate" e Tabelas 8-2 a 8-7).
 * As tabelas vêm do pacote de conteúdo (entrada `rule:tabelas-de-tesouro`), não deste código.
 */
import { z } from "zod";
import { cryptoRng, type Rng } from "../core/dice";

/**
 * Rolagem das tabelas de tesouro. Aceita qualquer dado (as tabelas usam d3, que o rolador geral
 * da mesa recusa de propósito) e expressões como "2d4", "1d4+1" ou "3".
 */
function roll(formula: string, rng: Rng): { total: number } {
  let total = 0;
  for (const term of formula.replace(/\s+/g, "").replace(/-/g, "+-").split("+").filter(Boolean)) {
    const m = /^(-?)(\d*)d(\d+)$/i.exec(term);
    if (m) {
      const n = Number(m[2] || 1);
      const sides = Number(m[3]);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += rng(sides);
      total += m[1] ? -sum : sum;
    } else if (/^-?\d+$/.test(term)) total += Number(term);
    else throw new Error(`Expressão de dados inválida na tabela: ${formula}`);
  }
  return { total };
}

/* ------------------------------------------------------------------ ND */

/** "1/4" → 0.25, "5" → 5. */
export function parseNd(nd: string | number): number {
  if (typeof nd === "number") return nd;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(nd);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(nd);
  if (!Number.isFinite(n)) throw new Error(`ND inválido: ${nd}`);
  return n;
}

const FRACTIONS: [number, string][] = [
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
];

/** 0.25 → "1/4"; valores fracionários fora da tabela ficam com uma casa decimal. */
export function formatNd(nd: number): string {
  for (const [v, s] of FRACTIONS) if (Math.abs(nd - v) < 1e-9) return s;
  return Number.isInteger(nd) ? String(nd) : nd.toFixed(1).replace(".", ",");
}

export interface EncounterGroup {
  nd: string | number;
  count: number;
}

export interface EncounterNd {
  nd: number;
  label: string;
  /**
   * true quando o resultado segue a regra do livro ao pé da letra (um único tipo de criatura).
   * Com criaturas de NDs diferentes o livro não traz fórmula; o valor é uma estimativa.
   */
  exact: boolean;
}

/**
 * ND de um grupo de criaturas iguais (regra do livro):
 * - ND menor que 1: ND × quantidade (quatro de ND 1/4 = ND 1);
 * - ND 1 ou maior: ND + 2 para cada vez que a quantidade dobra (dois de ND 5 = ND 7; quatro de ND 8 = ND 12).
 */
export function groupNd(nd: string | number, count: number): number {
  const v = parseNd(nd);
  if (count <= 0) return 0;
  if (v < 1) return v * count;
  return v + 2 * Math.floor(Math.log2(count));
}

/**
 * ND do combate. Com um só tipo de criatura, aplica a regra do livro. Com tipos diferentes,
 * estima generalizando a mesma regra (cada +2 de ND equivale a dobrar o grupo):
 * ND ≈ 2·log2(Σ 2^(NDᵢ/2)), arredondado para baixo. Isso coincide com a regra para grupos iguais.
 */
export function encounterNd(groups: EncounterGroup[]): EncounterNd {
  const valid = groups.filter((g) => g.count > 0);
  if (!valid.length) return { nd: 0, label: "—", exact: true };
  if (valid.length === 1) {
    const nd = groupNd(valid[0].nd, valid[0].count);
    return { nd, label: formatNd(nd), exact: true };
  }
  const per = valid.map((g) => groupNd(g.nd, g.count));
  const sum = per.reduce((t, nd) => t + 2 ** (nd / 2), 0);
  const raw = 2 * Math.log2(sum);
  const nd = raw >= 1 ? Math.floor(raw + 1e-9) : Math.max(...per);
  return { nd, label: formatNd(nd), exact: false };
}

/* ------------------------------------------------------------------ XP */

export type EncounterOutcome = "vitoria" | "empate" | "derrota";

/** Fração da XP por resultado: vencido rende tudo, empate metade, derrota um quarto. */
export const OUTCOME_FACTOR: Record<EncounterOutcome, number> = { vitoria: 1, empate: 0.5, derrota: 0.25 };

export interface XpResult {
  total: number;
  perCharacter: number;
  /** XP de cada grupo; `trivial` indica ND 5 ou mais pontos abaixo do nível do grupo (não rende XP). */
  groups: { nd: string | number; count: number; xp: number; trivial: boolean }[];
}

/** XP = ND × 1.000 por criatura (cada uma separadamente), dividida igualmente pelo grupo. */
export function encounterXp(groups: EncounterGroup[], party: { level: number; size: number }, outcome: EncounterOutcome = "vitoria"): XpResult {
  const factor = OUTCOME_FACTOR[outcome];
  const out = groups
    .filter((g) => g.count > 0)
    .map((g) => {
      const nd = parseNd(g.nd);
      const trivial = nd <= party.level - 5;
      return { nd: g.nd, count: g.count, trivial, xp: trivial ? 0 : Math.round(nd * 1000 * g.count * factor) };
    });
  const total = out.reduce((t, g) => t + g.xp, 0);
  return { total, perCharacter: party.size > 0 ? Math.floor(total / party.size) : total, groups: out };
}

/* ------------------------------------------------------------------ Tesouro */

const range = z.tuple([z.number(), z.number()]);
const rollSpec = z
  .object({
    type: z.string(),
    dice: z.string().optional(),
    multiplier: z.number().optional(),
    currency: z.string().optional(),
    count: z.string().optional(),
    tier: z.string().optional(),
    modifications: z.number().optional(),
  })
  .nullable();
const tableRow = z.object({ range, result: z.string(), roll: rollSpec });
const listRow = z.object({ range, result: z.string(), entryId: z.string().optional(), counts: z.number().optional() });

export const treasureTablesSchema = z.object({
  byNd: z.array(z.object({ nd: z.string(), money: z.array(tableRow), items: z.array(tableRow) })),
  wealth: z.array(
    z.object({ menor: range.nullable(), media: range.nullable(), maior: range.nullable(), dice: z.string(), multiplier: z.number(), average: z.number(), examples: z.string() }),
  ),
  misc: z.array(listRow),
  weapons: z.array(listRow),
  armors: z.array(listRow),
  weaponMods: z.array(listRow),
  armorMods: z.array(listRow),
});
export type TreasureTables = z.infer<typeof treasureTablesSchema>;

/** Indicação de tesouro na ficha da criatura (Padrão, Metade, Dobro ou Nenhum). */
export type TreasureMode = "padrao" | "metade" | "dobro" | "nenhum";
export const TREASURE_MODE_FACTOR: Record<TreasureMode, number> = { padrao: 1, metade: 0.5, dobro: 2, nenhum: 0 };

export interface TreasureLine {
  /** O que a linha da tabela diz (ex.: "3d8x10 moedas"). */
  table: string;
  /** O que saiu na rolagem, em texto pronto para ler na mesa. */
  text: string;
  /** Moedas obtidas, por moeda (mc, m, mo), já com Metade/Dobro aplicado. */
  coins?: Record<string, number>;
  /** Valor total em moedas (T$) de riquezas, já com Metade/Dobro aplicado. */
  value?: number;
  /** Ids de itens do catálogo sorteados (para abrir a descrição). */
  entryIds?: string[];
}

export interface TreasureResult {
  row: string;
  mode: TreasureMode;
  rolls: { money: number; items: number[] };
  money: TreasureLine | null;
  items: TreasureLine[];
  notes: string[];
}

const CURRENCY_LABEL: Record<string, string> = { mc: "TC", m: "T$", mo: "TO" };

const d100 = (rng: Rng) => roll("1d100", rng).total;
const pickRange = <T extends { range: [number, number] }>(rows: T[], r: number) => rows.find((row) => r >= row.range[0] && r <= row.range[1]);

/** Linha da tabela para um ND: frações usam a linha igual ou menor; acima de 20 usa a linha 20. */
export function treasureRowFor(tables: TreasureTables, nd: number) {
  const rows = tables.byNd.map((r) => ({ r, v: parseNd(r.nd) })).sort((a, b) => a.v - b.v);
  let chosen = rows[0];
  for (const row of rows) if (row.v <= nd + 1e-9) chosen = row;
  return chosen.r;
}

function rollList(rows: z.infer<typeof listRow>[], rng: Rng) {
  const r = d100(rng);
  return { roll: r, row: pickRange(rows, r) };
}

function weaponOrArmor(tables: TreasureTables, rng: Rng) {
  const kind = roll("1d6", rng).total <= 4 ? "arma" : "armadura";
  const { row } = rollList(kind === "arma" ? tables.weapons : tables.armors, rng);
  return { kind, row };
}

/**
 * Rola o tesouro de um combate: uma vez na coluna Dinheiro e outra na coluna Itens, na linha do ND.
 * Metade/Dobro reduzem ou dobram os valores (moedas e riquezas); no Dobro, a coluna Itens é rolada duas vezes.
 * Poções e itens mágicos indicam a tabela do livro a consultar (o pacote ainda não traz essas tabelas).
 */
export function rollTreasure(tables: TreasureTables, nd: number, mode: TreasureMode = "padrao", rng: Rng = cryptoRng): TreasureResult {
  const row = treasureRowFor(tables, nd);
  const notes: string[] = [];
  if (mode === "nenhum") return { row: row.nd, mode, rolls: { money: 0, items: [] }, money: null, items: [], notes: ["A criatura não traz tesouro."] };
  const factor = TREASURE_MODE_FACTOR[mode];

  // Dinheiro
  const moneyRoll = d100(rng);
  const moneyRow = pickRange(row.money, moneyRoll);
  let money: TreasureLine | null = null;
  const spec = moneyRow?.roll;
  if (moneyRow && spec?.type === "moedas" && spec.dice) {
    const amount = Math.round(roll(spec.dice, rng).total * (spec.multiplier ?? 1) * factor);
    const cur = spec.currency ?? "m";
    money = { table: moneyRow.result, text: `${amount.toLocaleString("pt-BR")} ${CURRENCY_LABEL[cur] ?? cur}`, coins: { [cur]: amount } };
  } else if (moneyRow && spec?.type === "riquezas") {
    const count = Math.max(1, roll(spec.count ?? "1", rng).total);
    const tier = (spec.tier ?? "menor") as "menor" | "media" | "maior";
    const pieces: string[] = [];
    let value = 0;
    for (let i = 0; i < count; i++) {
      const r = d100(rng);
      const w = tables.wealth.find((x) => x[tier] && r >= x[tier]![0] && r <= x[tier]![1]);
      if (!w) continue;
      const v = Math.round(roll(w.dice, rng).total * w.multiplier * factor);
      value += v;
      pieces.push(`riqueza de T$ ${v.toLocaleString("pt-BR")} (ex.: ${w.examples.split(";")[0].replace(/\.$/, "")})`);
    }
    money = { table: moneyRow.result, text: pieces.join("; ") || moneyRow.result, value };
  } else if (moneyRow) {
    money = { table: moneyRow.result, text: "Nada" };
  }

  // Itens
  const itemRolls: number[] = [];
  const items: TreasureLine[] = [];
  const times = mode === "dobro" ? 2 : 1;
  for (let t = 0; t < times; t++) {
    const r = d100(rng);
    itemRolls.push(r);
    const itemRow = pickRange(row.items, r);
    const s = itemRow?.roll;
    if (!itemRow || !s) {
      items.push({ table: itemRow?.result ?? "—", text: "Nada" });
      continue;
    }
    switch (s.type) {
      case "diverso": {
        const { row: m } = rollList(tables.misc, rng);
        items.push({ table: itemRow.result, text: m?.result ?? "Item diverso", entryIds: m?.entryId ? [m.entryId] : [] });
        break;
      }
      case "arma-armadura": {
        const { row: w } = weaponOrArmor(tables, rng);
        items.push({ table: itemRow.result, text: w?.result ?? "Arma ou armadura", entryIds: w?.entryId ? [w.entryId] : [] });
        break;
      }
      case "superior": {
        const { kind, row: w } = weaponOrArmor(tables, rng);
        const mods = kind === "arma" ? tables.weaponMods : tables.armorMods;
        const wanted = s.modifications ?? 1;
        const chosen: z.infer<typeof listRow>[] = [];
        let used = 0;
        for (let tries = 0; used < wanted && tries < 30; tries++) {
          const { row: m } = rollList(mods, rng);
          if (!m || chosen.some((c) => c.result === m.result)) continue;
          const cost = m.counts ?? 1;
          if (used + cost > wanted) continue; // não cabe: rola de novo
          chosen.push(m);
          used += cost;
        }
        items.push({
          table: itemRow.result,
          text: `${w?.result ?? "Item"} superior (${chosen.map((c) => c.result.toLowerCase()).join(", ") || "sem modificação"})`,
          entryIds: [w?.entryId, ...chosen.map((c) => c.entryId)].filter((x): x is string => !!x),
        });
        break;
      }
      case "pocao": {
        const n = Math.max(1, roll(s.count ?? "1", rng).total);
        items.push({ table: itemRow.result, text: `${n} ${n === 1 ? "poção" : "poções"}: role na tabela de poções do livro (Capítulo 8).` });
        break;
      }
      case "magico": {
        const k = roll("1d6", rng).total;
        const what = k <= 2 ? "arma" : k === 3 ? "armadura" : "acessório";
        items.push({ table: itemRow.result, text: `Item mágico ${s.tier ?? ""} (1d6 = ${k}: ${what}). Escolha ou role na tabela de ${what === "acessório" ? "acessórios" : `${what}s mágicas`} do livro.`.replace("  ", " ") });
        break;
      }
      default:
        items.push({ table: itemRow.result, text: itemRow.result });
    }
  }
  if (mode === "metade") notes.push("Metade: valores reduzidos pela metade. Itens não se dividem; decida se o grupo fica com eles.");
  if (mode === "dobro") notes.push("Dobro: valores dobrados e a coluna Itens rolada duas vezes.");
  return { row: row.nd, mode, rolls: { money: moneyRoll, items: itemRolls }, money, items, notes };
}
