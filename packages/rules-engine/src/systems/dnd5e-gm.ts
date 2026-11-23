/**
 * Calculadora de encontros e tabela de ND (CR) para D&D 5e (SRD 5.1 / DMG).
 */

export interface DndCrInfo {
  cr: string;
  xp: number;
  numeric: number;
}

export const DND_CR_LIST: DndCrInfo[] = [
  { cr: "0", xp: 10, numeric: 0 },
  { cr: "1/8", xp: 25, numeric: 0.125 },
  { cr: "1/4", xp: 50, numeric: 0.25 },
  { cr: "1/2", xp: 100, numeric: 0.5 },
  { cr: "1", xp: 200, numeric: 1 },
  { cr: "2", xp: 450, numeric: 2 },
  { cr: "3", xp: 700, numeric: 3 },
  { cr: "4", xp: 1100, numeric: 4 },
  { cr: "5", xp: 1800, numeric: 5 },
  { cr: "6", xp: 2300, numeric: 6 },
  { cr: "7", xp: 2900, numeric: 7 },
  { cr: "8", xp: 3900, numeric: 8 },
  { cr: "9", xp: 5000, numeric: 9 },
  { cr: "10", xp: 5900, numeric: 10 },
  { cr: "11", xp: 7200, numeric: 11 },
  { cr: "12", xp: 8400, numeric: 12 },
  { cr: "13", xp: 10000, numeric: 13 },
  { cr: "14", xp: 11500, numeric: 14 },
  { cr: "15", xp: 13000, numeric: 15 },
  { cr: "16", xp: 15000, numeric: 16 },
  { cr: "17", xp: 18000, numeric: 17 },
  { cr: "18", xp: 20000, numeric: 18 },
  { cr: "19", xp: 22000, numeric: 19 },
  { cr: "20", xp: 25000, numeric: 20 },
  { cr: "21", xp: 33000, numeric: 21 },
  { cr: "22", xp: 41000, numeric: 22 },
  { cr: "23", xp: 50000, numeric: 23 },
  { cr: "24", xp: 62000, numeric: 24 },
  { cr: "25", xp: 75000, numeric: 25 },
  { cr: "26", xp: 90000, numeric: 26 },
  { cr: "27", xp: 105000, numeric: 27 },
  { cr: "28", xp: 120000, numeric: 28 },
  { cr: "29", xp: 135000, numeric: 29 },
  { cr: "30", xp: 155000, numeric: 30 },
];

export const DND_CR_XP: Record<string, number> = Object.fromEntries(DND_CR_LIST.map((x) => [x.cr, x.xp]));

/** Limites de XP por nível de personagem (Fácil, Médio, Difícil, Mortal, Orçamento diário). */
export const DND_XP_THRESHOLDS_BY_LEVEL: Record<
  number,
  { easy: number; medium: number; hard: number; deadly: number; daily: number }
> = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100, daily: 300 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200, daily: 600 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400, daily: 1200 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500, daily: 1700 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100, daily: 3500 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400, daily: 4000 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700, daily: 5000 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100, daily: 6000 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400, daily: 7500 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800, daily: 9000 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600, daily: 10500 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500, daily: 11500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100, daily: 13500 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700, daily: 15000 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400, daily: 18000 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200, daily: 20000 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800, daily: 25000 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500, daily: 27000 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900, daily: 30000 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700, daily: 40000 },
};

const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

function multiplierIndex(monsterCount: number): number {
  if (monsterCount <= 1) return 1;
  if (monsterCount === 2) return 2;
  if (monsterCount <= 6) return 3;
  if (monsterCount <= 10) return 4;
  if (monsterCount <= 14) return 5;
  return 6;
}

export function dndEncounterMultiplier(monsterCount: number, partySize: number): number {
  if (monsterCount <= 0) return 1;
  let idx = multiplierIndex(monsterCount);
  if (partySize < 3) idx = Math.min(MULTIPLIERS.length - 1, idx + 1);
  else if (partySize >= 6) idx = Math.max(0, idx - 1);
  return MULTIPLIERS[idx];
}

export type DndEncounterDifficulty = "trivial" | "easy" | "medium" | "hard" | "deadly";

const DIFFICULTY_LABEL: Record<DndEncounterDifficulty, string> = {
  trivial: "Trivial",
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
  deadly: "Mortal",
};

export interface DndEncounterEvaluation {
  partySize: number;
  monsterCount: number;
  rawXp: number;
  multiplier: number;
  adjustedXp: number;
  xpPerPlayer: number;
  thresholds: { easy: number; medium: number; hard: number; deadly: number; daily: number };
  difficulty: DndEncounterDifficulty;
  difficultyLabel: string;
}

export function evaluateDndEncounter(input: {
  partyLevels: number[];
  monsters: { cr: string; count: number }[];
}): DndEncounterEvaluation {
  const levels = input.partyLevels.length ? input.partyLevels : [1];
  const partySize = levels.length;

  const thresholds = levels.reduce(
    (acc, lvl) => {
      const clamped = Math.max(1, Math.min(20, Math.trunc(lvl)));
      const t = DND_XP_THRESHOLDS_BY_LEVEL[clamped];
      return {
        easy: acc.easy + t.easy,
        medium: acc.medium + t.medium,
        hard: acc.hard + t.hard,
        deadly: acc.deadly + t.deadly,
        daily: acc.daily + t.daily,
      };
    },
    { easy: 0, medium: 0, hard: 0, deadly: 0, daily: 0 },
  );

  let monsterCount = 0;
  let rawXp = 0;
  for (const m of input.monsters) {
    const count = Math.max(0, Math.trunc(m.count));
    const unitXp = DND_CR_XP[m.cr] ?? 0;
    monsterCount += count;
    rawXp += unitXp * count;
  }

  const multiplier = dndEncounterMultiplier(monsterCount, partySize);
  const adjustedXp = Math.round(rawXp * multiplier);
  const xpPerPlayer = Math.round(rawXp / Math.max(1, partySize));

  let difficulty: DndEncounterDifficulty = "trivial";
  if (adjustedXp >= thresholds.deadly) difficulty = "deadly";
  else if (adjustedXp >= thresholds.hard) difficulty = "hard";
  else if (adjustedXp >= thresholds.medium) difficulty = "medium";
  else if (adjustedXp >= thresholds.easy) difficulty = "easy";

  return {
    partySize,
    monsterCount,
    rawXp,
    multiplier,
    adjustedXp,
    xpPerPlayer,
    thresholds,
    difficulty,
    difficultyLabel: DIFFICULTY_LABEL[difficulty],
  };
}

export interface DndMonsterPreset {
  name: string;
  cr: string;
  hp: number;
  ac: number;
  initBonus: number;
  type: string;
}

/** Exemplos rápidos de referência do SRD 5.1 para montar combates em segundos. */
export const DND_SRD_MONSTER_PRESETS: DndMonsterPreset[] = [
  { name: "Kobold", cr: "1/8", hp: 5, ac: 12, initBonus: 2, type: "Humanoide" },
  { name: "Bandido", cr: "1/8", hp: 11, ac: 12, initBonus: 1, type: "Humanoide" },
  { name: "Goblin", cr: "1/4", hp: 7, ac: 15, initBonus: 2, type: "Humanoide" },
  { name: "Esqueleto", cr: "1/4", hp: 13, ac: 13, initBonus: 2, type: "Morto-vivo" },
  { name: "Lobo", cr: "1/4", hp: 11, ac: 13, initBonus: 2, type: "Besta" },
  { name: "Orc", cr: "1/2", hp: 15, ac: 13, initBonus: 1, type: "Humanoide" },
  { name: "Hobgoblin", cr: "1/2", hp: 11, ac: 18, initBonus: 1, type: "Humanoide" },
  { name: "Bugbear", cr: "1", hp: 27, ac: 16, initBonus: 2, type: "Humanoide" },
  { name: "Lobo Atroz", cr: "1", hp: 37, ac: 14, initBonus: 2, type: "Besta" },
  { name: "Ogro", cr: "2", hp: 59, ac: 11, initBonus: -1, type: "Gigante" },
  { name: "Mímico", cr: "2", hp: 58, ac: 12, initBonus: 1, type: "Monstruosidade" },
  { name: "Urso-Coruja", cr: "3", hp: 59, ac: 13, initBonus: 1, type: "Monstruosidade" },
  { name: "Cavaleiro", cr: "3", hp: 52, ac: 18, initBonus: 0, type: "Humanoide" },
  { name: "Ettin", cr: "4", hp: 85, ac: 12, initBonus: -1, type: "Gigante" },
  { name: "Troll", cr: "5", hp: 84, ac: 15, initBonus: 1, type: "Gigante" },
  { name: "Golem de Carne", cr: "5", hp: 93, ac: 9, initBonus: -1, type: "Constructo" },
  { name: "Mago (Arcanista)", cr: "6", hp: 40, ac: 12, initBonus: 2, type: "Humanoide" },
  { name: "Dragão Vermelho Jovem", cr: "10", hp: 178, ac: 18, initBonus: 0, type: "Dragão" },
  { name: "Vampiro", cr: "13", hp: 144, ac: 16, initBonus: 4, type: "Morto-vivo" },
  { name: "Lich", cr: "21", hp: 135, ac: 17, initBonus: 3, type: "Morto-vivo" },
];
