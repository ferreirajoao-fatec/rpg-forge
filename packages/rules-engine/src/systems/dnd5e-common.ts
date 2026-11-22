/**
 * Fórmulas compartilhadas por D&D 5e (2014) e D&D 5e revisado (2024).
 *
 * Todos os valores abaixo constam do System Reference Document 5.1 e do
 * SRD 5.2.1, ambos publicados pela Wizards of the Coast sob CC-BY-4.0.
 * Seções citadas pelo nome; páginas não são informadas por não terem sido
 * conferidas no documento.
 */
import type { AbilityDef, AbilityMethod } from "../core/engine";
import type { Rng } from "../core/dice";
import type { SourceRef, ValidationIssue } from "../core/types";

export const DND_ABILITIES: AbilityDef[] = [
  { key: "str", abbr: "FOR", label: "Força", description: "Potência física: ataques corpo a corpo, atletismo e carga." },
  { key: "dex", abbr: "DES", label: "Destreza", description: "Agilidade e reflexos: ataques à distância, furtividade e iniciativa." },
  { key: "con", abbr: "CON", label: "Constituição", description: "Saúde e resistência: aumenta seus pontos de vida." },
  { key: "int", abbr: "INT", label: "Inteligência", description: "Raciocínio e memória: conhecimento e magia arcana de magos." },
  { key: "wis", abbr: "SAB", label: "Sabedoria", description: "Percepção e intuição: percepção, intuição e magia divina." },
  { key: "cha", abbr: "CAR", label: "Carisma", description: "Presença e persuasão: interação social e magia de bardos e feiticeiros." },
];

export const ABILITY_KEYS = DND_ABILITIES.map((a) => a.key);

/** Modificador = arredondar para baixo((valor − 10) / 2). */
export function dndModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Bônus de proficiência por nível de personagem (1–20). */
export function dndProficiencyBonus(level: number): number {
  return Math.ceil(Math.max(1, Math.min(level, 20)) / 4) + 1;
}

/** XP mínimo para cada nível (índice 0 = nível 1). */
export const DND_XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000,
  225000, 265000, 305000, 355000,
];

export function dndLevelForXp(xp: number): number {
  let level = 1;
  DND_XP_THRESHOLDS.forEach((t, i) => {
    if (xp >= t) level = i + 1;
  });
  return level;
}

export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

function missing(scores: Record<string, number>): ValidationIssue[] {
  return ABILITY_KEYS.filter((k) => scores[k] === undefined).map((k) => ({
    code: "abilities.missing",
    severity: "invalid" as const,
    message: `Defina o valor de ${DND_ABILITIES.find((a) => a.key === k)!.label}.`,
    path: `abilities.${k}`,
  }));
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1) - 1;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dndAbilityMethods(source: SourceRef): AbilityMethod[] {
  return [
    {
      id: "standard-array",
      label: "Conjunto padrão",
      description: "Distribua os valores 15, 14, 13, 12, 10 e 8 entre os seis atributos. Recomendado para iniciantes.",
      source,
      validate(scores) {
        const m = missing(scores);
        if (m.length) return m;
        const got = ABILITY_KEYS.map((k) => scores[k]).sort((a, b) => b - a);
        const ok = got.every((v, i) => v === STANDARD_ARRAY[i]);
        return ok
          ? []
          : [
              {
                code: "abilities.standard_array",
                severity: "invalid",
                message: "Use cada valor do conjunto padrão (15, 14, 13, 12, 10, 8) exatamente uma vez.",
                path: "abilities",
                source,
              },
            ];
      },
      generate(rng) {
        const vals = shuffle(STANDARD_ARRAY, rng);
        return Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, vals[i]]));
      },
    },
    {
      id: "point-buy",
      label: "Compra de pontos",
      description: `Você tem ${POINT_BUY_BUDGET} pontos. Todos os atributos começam em 8 e podem chegar a 15 antes dos bônus.`,
      source,
      validate(scores) {
        const m = missing(scores);
        if (m.length) return m;
        const issues: ValidationIssue[] = [];
        let spent = 0;
        for (const k of ABILITY_KEYS) {
          const cost = POINT_BUY_COST[scores[k]];
          if (cost === undefined) {
            issues.push({
              code: "abilities.point_buy_range",
              severity: "invalid",
              message: `Na compra de pontos, cada atributo deve ficar entre 8 e 15 antes dos bônus.`,
              path: `abilities.${k}`,
              source,
            });
          } else spent += cost;
        }
        if (spent > POINT_BUY_BUDGET) {
          issues.push({
            code: "abilities.point_buy_over",
            severity: "invalid",
            message: `Você gastou ${spent} pontos; o limite é ${POINT_BUY_BUDGET}.`,
            path: "abilities",
            source,
          });
        } else if (!issues.length && spent < POINT_BUY_BUDGET) {
          issues.push({
            code: "abilities.point_buy_unspent",
            severity: "warning",
            message: `Ainda restam ${POINT_BUY_BUDGET - spent} pontos para distribuir.`,
            path: "abilities",
            source,
          });
        }
        return issues;
      },
      generate(rng) {
        // Compra aleatória que sempre gasta exatamente o orçamento.
        for (;;) {
          const scores: Record<string, number> = Object.fromEntries(ABILITY_KEYS.map((k) => [k, 8]));
          let budget = POINT_BUY_BUDGET;
          let guard = 0;
          while (budget > 0 && guard++ < 200) {
            const k = ABILITY_KEYS[rng(ABILITY_KEYS.length) - 1];
            const next = scores[k] + 1;
            const delta = (POINT_BUY_COST[next] ?? Infinity) - POINT_BUY_COST[scores[k]];
            if (delta <= budget) {
              scores[k] = next;
              budget -= delta;
            }
          }
          if (budget === 0) return scores;
        }
      },
    },
    {
      id: "roll-4d6",
      label: "Rolagem (4d6, descartar o menor)",
      description: "Role 4d6 para cada atributo e some os três maiores. Gera personagens mais variados.",
      source,
      validate(scores) {
        const m = missing(scores);
        if (m.length) return m;
        return ABILITY_KEYS.filter((k) => scores[k] < 3 || scores[k] > 18).map((k) => ({
          code: "abilities.roll_range",
          severity: "invalid" as const,
          message: "Com 4d6 (descartando o menor), cada valor fica entre 3 e 18.",
          path: `abilities.${k}`,
          source,
        }));
      },
      generate(rng) {
        return Object.fromEntries(
          ABILITY_KEYS.map((k) => {
            const r = [rng(6), rng(6), rng(6), rng(6)].sort((a, b) => b - a);
            return [k, r[0] + r[1] + r[2]];
          }),
        );
      },
    },
    {
      id: "custom",
      label: "Valores definidos pelo mestre",
      description: "Valores livres combinados com a mesa. Requer aprovação do mestre.",
      validate(scores) {
        const m = missing(scores);
        if (m.length) return m;
        return [
          {
            code: "abilities.custom",
            severity: "gm_approval",
            message: "Atributos definidos livremente precisam ser aprovados pelo mestre.",
            path: "abilities",
          },
        ];
      },
    },
  ];
}
