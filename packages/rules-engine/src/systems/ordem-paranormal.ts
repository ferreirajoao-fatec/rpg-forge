import type { CharacterData } from "../core/character";
import { totalLevel } from "../core/character";
import type { ContentEntry } from "../core/content";
import { opDiceFormula, type Rng } from "../core/dice";
import {
  BaseEngine,
  type AbilityDef,
  type AbilityMethod,
  type Catalog,
  type ChoiceLimit,
  type CreationStep,
  type DerivedStats,
  type RulesetMeta,
  type SkillUpgradeBudget,
} from "../core/engine";
import type { PrerequisiteFacts } from "../core/prerequisites";
import type { LevelUpGain } from "../core/progression";
import type { OptionEvaluation, SourceRef, ValidationIssue } from "../core/types";
import { opInventory } from "./ordem-paranormal-inventory";

export * from "./ordem-paranormal-inventory";
export * from "./ordem-paranormal-gm";

/**
 * Ordem Paranormal RPG — 1ª edição (Livro de Regras v1.1 + suplemento Sobrevivendo ao Horror v1.3.1).
 *
 * Mapeamento de progressão:
 *  - Agentes (Combatente, Especialista, Ocultista): `level` 1..20 ↔ NEX 5%, 10%, ..., 95%, 99% (Tabela 1.2, p. 23).
 *  - Sobrevivente (Sobrevivendo ao Horror, p. 30): `level` 1..5 ↔ Estágio 1..5 (NEX 0%).
 */

export const OP_RULESET_ID = "ordem-paranormal-1e";

/** Regras opcionais de Sobrevivendo ao Horror suportadas pelo motor. */
export const OP_OPTIONAL_RULES = {
  DETERMINATION_POINTS: "op:determination-points",
  SEPARATE_LEVEL_NEX: "op:separate-level-nex",
  DEBILITATING_INJURIES: "op:debilitating-injuries",
} as const;

const PD_FORMULA: Record<string, { initial: number; perLevel: number; addPrePerLevel: boolean }> = {
  "class:combatente": { initial: 6, perLevel: 3, addPrePerLevel: true },
  "class:especialista": { initial: 8, perLevel: 4, addPrePerLevel: true },
  "class:ocultista": { initial: 10, perLevel: 5, addPrePerLevel: true },
  "class:sobrevivente": { initial: 4, perLevel: 2, addPrePerLevel: false },
};

export function parseExtraPeCost(costText?: string): number {
  if (!costText) return 0;
  const m = costText.match(/\+(\d+)\s*P[ED]/i);
  return m ? Number(m[1]) : 0;
}

export function ritualCostSummary(opts: {
  baseCost: number;
  extraCost?: number;
  peLimit: number;
  element?: string;
  usePd?: boolean;
}) {
  const totalPe = Math.max(1, opts.baseCost + (opts.extraCost ?? 0));
  const exceedsLimit = totalPe > opts.peLimit;
  const requiresOcultismoTest = opts.element !== "medo";
  const ocultismoDc = 20 + totalPe;
  return {
    totalPe,
    exceedsLimit,
    requiresOcultismoTest,
    ocultismoDc,
    failMentalLoss: totalPe,
    failBy5PermanentSanLoss: opts.usePd ? 0 : 1,
    failBy5ExtraPdLoss: opts.usePd ? 1 : 0,
  };
}

export const OP_BOOK = { sourcebookId: "op-core-1.1", edition: "1ª edição", version: "1.1" } as const;
export const OP_SAH_BOOK = { sourcebookId: "op-sah-1.3.1", edition: "1ª edição", version: "1.3.1" } as const;

export function opSource(page: number, section: string): SourceRef {
  return { ...OP_BOOK, page, section };
}

const ATTR_SRC = opSource(14, "Atributos");
const NEX_SRC = opSource(23, "Exposição Paranormal");
const SKILLS_SRC = opSource(40, "Perícias");
const POWERS_SRC = opSource(22, "Poderes");
const PARANORMAL_SRC = opSource(114, "Poderes Paranormais");
const RITUALS_SRC = opSource(119, "Rituais");
const DERIVED_SRC = opSource(36, "Características Derivadas");

/** Tabela 1.2 (p. 23): NEX por nível interno (índice 0 = nível 1 = NEX 5%). */
export const OP_NEX_BY_LEVEL = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99] as const;

export function nexOfLevel(level: number): number {
  const idx = Math.max(0, Math.min(OP_NEX_BY_LEVEL.length - 1, Math.trunc(level) - 1));
  return OP_NEX_BY_LEVEL[idx];
}

export function levelOfNex(nex: number): number {
  const idx = OP_NEX_BY_LEVEL.indexOf(nex as (typeof OP_NEX_BY_LEVEL)[number]);
  if (idx >= 0) return idx + 1;
  return Math.max(1, Math.min(20, Math.round(nex / 5)));
}

/** Bônus de perícia por grau de treinamento (p. 40). */
export const OP_RANK_BONUS = { destreinado: 0, treinado: 5, veterano: 10, expert: 15 } as const;
export type OpSkillRank = keyof typeof OP_RANK_BONUS;

export const OP_ABILITIES: AbilityDef[] = [
  { key: "agi", abbr: "AGI", label: "Agilidade", description: "Coordenação motora e reflexos: Defesa, Acrobacia, Crime, Furtividade, Iniciativa, Pilotagem, Pontaria e Reflexos." },
  { key: "for", abbr: "FOR", label: "Força", description: "Potência muscular: Atletismo, Luta, dano corpo a corpo/arremesso e capacidade de carga (5 espaços por ponto)." },
  { key: "int", abbr: "INT", label: "Intelecto", description: "Raciocínio e estudo: perícias treinadas extras (+INT), limite de rituais por Aprender Ritual e perícias mentais." },
  { key: "pre", abbr: "PRE", label: "Presença", description: "Sentidos e força de vontade: Pontos de Esforço (+PRE por NEX), DT de rituais/habilidades e perícias sociais." },
  { key: "vig", abbr: "VIG", label: "Vigor", description: "Saúde e resistência física: Pontos de Vida (+VIG por NEX) e Fortitude." },
];

const KEYS = OP_ABILITIES.map((a) => a.key);
const LABEL = new Map(OP_ABILITIES.map((a) => [a.key, a.label]));

/* ------------------------------------------------------------------ */
/* Dados estruturados do catálogo                                      */
/* ------------------------------------------------------------------ */

export interface OpClassData {
  isSurvivor?: boolean;
  maxLevel?: number;
  hp: { initial: number; perLevel: number; addAbilityPerLevel?: boolean };
  pe: { initial: number; perLevel: number; addAbilityPerLevel?: boolean };
  san: { initial: number; perLevel: number };
  skills: { fixed: string[]; oneOf?: string[][]; choose: number; intBonus?: boolean };
  trainingUpgradeBase?: number;
  proficiencies: string[];
  spellcasting?: { ability: string; initialRituals: number; ritualsPerLevel: number; circleLevels: Record<number, number> };
  subclassLevel: number;
  asiLevels: number[];
  asiMax?: number;
  powerLevels: number[];
  trainingLevels: number[];
  versatilityLevel?: number;
  features: { level: number; name: string; summary: string }[];
}

export interface OpOriginData {
  skills: string[];
  skillsNote?: string;
  power?: { name: string; summary: string; text: string };
  halfInitialSanity?: boolean;
  bonusParanormalPower?: number;
  hpPerNex?: number;
  defenseBonus?: number;
  peBonus?: number;
  pePerOddNex?: boolean;
  peLimitBonus?: number;
  sanPerNex?: number;
  creditBump?: number;
  mentalRdInt?: boolean;
  freeSkills?: number;
}

export interface OpSkillData {
  ability: string;
  trainedOnly: boolean;
  loadPenalty: boolean;
  needsKit: boolean;
}

/* ------------------------------------------------------------------ */
/* Métodos de geração de atributos (p. 14 e SaH p. 30)                 */
/* ------------------------------------------------------------------ */

function missingScores(scores: Record<string, number>): ValidationIssue[] {
  return KEYS.filter((k) => scores[k] === undefined).map((k) => ({
    code: "abilities.missing",
    severity: "invalid" as const,
    message: `Defina o valor de ${LABEL.get(k)}.`,
    path: `abilities.${k}`,
  }));
}

function makeDistributionMethod(id: string, label: string, points: number, description: string, source: SourceRef): AbilityMethod {
  // Todos os 5 atributos começam em 1 (soma 5) + `points` distribuíveis.
  // Reduzir 1 atributo para 0 devolve +1 ponto, então a soma total final é sempre `5 + points`.
  const targetSum = 5 + points;
  return {
    id,
    label,
    description,
    source,
    validate(scores) {
      const m = missingScores(scores);
      if (m.length) return m;
      const issues: ValidationIssue[] = [];
      let zeros = 0;
      let sum = 0;
      for (const k of KEYS) {
        const v = scores[k];
        if (v < 0 || v > 3) {
          issues.push({
            code: "abilities.op_range",
            severity: "invalid",
            message: `${LABEL.get(k)} deve ficar entre 0 e 3 na criação (antes dos aumentos por NEX).`,
            path: `abilities.${k}`,
            source,
          });
        }
        if (v === 0) zeros++;
        sum += v;
      }
      if (zeros > 1) {
        issues.push({
          code: "abilities.op_too_many_zeros",
          severity: "invalid",
          message: "Você só pode reduzir um único atributo para 0 para ganhar 1 ponto adicional.",
          path: "abilities",
          source,
        });
      }
      if (issues.length) return issues;
      if (sum > targetSum) {
        issues.push({
          code: "abilities.op_over",
          severity: "invalid",
          message: `Você distribuiu ${sum - 5} pontos acima do base 1; o limite é ${points} pontos (soma total ${targetSum}).`,
          path: "abilities",
          source,
        });
      } else if (sum < targetSum) {
        issues.push({
          code: "abilities.op_unspent",
          severity: "warning",
          message: `Ainda restam ${targetSum - sum} ponto(s) de atributo para distribuir.`,
          path: "abilities",
          source,
        });
      }
      return issues;
    },
    generate(rng: Rng) {
      const scores: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, 1]));
      let budget = points;
      if (rng(2) === 1) {
        const zeroKey = KEYS[rng(KEYS.length) - 1];
        scores[zeroKey] = 0;
        budget += 1;
      }
      let guard = 0;
      while (budget > 0 && guard++ < 200) {
        const k = KEYS[rng(KEYS.length) - 1];
        if (scores[k] < 3 && (scores[k] > 0 || budget > 1)) {
          scores[k] += 1;
          budget -= 1;
        }
      }
      return scores;
    },
  };
}

export const OP_ABILITY_METHODS: AbilityMethod[] = [
  makeDistributionMethod(
    "op-agent",
    "Distribuição padrão de Agente (4 pontos)",
    4,
    "Todos os 5 atributos começam em 1 e você tem 4 pontos para distribuir (máximo 3 por atributo). Pode reduzir um atributo para 0 para ganhar +1 ponto.",
    ATTR_SRC,
  ),
  makeDistributionMethod(
    "op-survivor",
    "Sobrevivente — NEX 0% (3 pontos)",
    3,
    "Regra de Sobrevivendo ao Horror: atributos começam em 1 com 3 pontos para distribuir (máximo 3; pode reduzir um atributo para 0 para ganhar +1 ponto).",
    { ...OP_SAH_BOOK, page: 30, section: "Nova Classe: O Sobrevivente" },
  ),
  {
    id: "custom",
    label: "Valores definidos pelo mestre",
    description: "Atributos livres combinados com a mesa. Requer aprovação do mestre.",
    validate(scores) {
      const m = missingScores(scores);
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

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

export class OrdemParanormalEngine extends BaseEngine {
  readonly meta: RulesetMeta = {
    id: OP_RULESET_ID,
    name: "Ordem Paranormal RPG",
    system: "Ordem Paranormal",
    edition: "1ª edição (v1.1 + Sobrevivendo ao Horror)",
    publisher: "Jambô Editora",
    dataAvailability: "import-required",
    limitations: [
      "Obra proprietária: o catálogo é importado localmente a partir dos seus PDFs (Livro de Regras v1.1 e Sobrevivendo ao Horror v1.3.1).",
      "Progressão padrão de Agente de NEX 5% a 99% (níveis 1 a 20), além da classe opcional Sobrevivente (NEX 0%, Estágios 1 a 5).",
      "Cada poder paranormal escolhido (além do da origem Cultista Arrependido) conta como um uso de Transcender e desconta automaticamente a Sanidade daquele aumento de NEX.",
      "Reduções situacionais de categoria em itens específicos (como A Favorita de Aniquilador ou Mochila de Utilidades) devem ser verificadas com o mestre.",
    ],
    sources: [
      { id: OP_BOOK.sourcebookId, title: "Ordem Paranormal RPG — Livro de Regras v1.1", license: "Proprietário (importação local)" },
      { id: OP_SAH_BOOK.sourcebookId, title: "Sobrevivendo ao Horror v1.3.1", license: "Proprietário (importação local)" },
    ],
    levelRange: { min: 1, max: 20 },
  };

  readonly abilities = OP_ABILITIES;
  readonly abilityMethods = OP_ABILITY_METHODS;
  readonly inventoryMode = "op-patente" as const;
  readonly portraitGenre = "modern paranormal investigation and contemporary urban horror tabletop RPG";

  /** Em Ordem Paranormal não há modificador derivado: o próprio valor do atributo é o número de d20. */
  abilityModifier(score: number): number {
    return score;
  }

  abilityRollLabel(score: number): string {
    return score <= 0 ? `${2 - score}d20↓` : `${score}d20`;
  }

  /** NEX efetivo do agente (ou separado via regra opcional de Sobrevivendo ao Horror, p. 99). */
  effectiveNex(c?: CharacterData): number {
    if (!c) return 5;
    if (c.optionalRules?.includes(OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX)) {
      return Math.max(0, Math.min(99, Math.trunc(c.opSeparateNex ?? 0)));
    }
    if (c.classes[0]?.classId === "class:sobrevivente") return 0;
    return nexOfLevel(totalLevel(c));
  }

  formatLevel(level: number, c?: CharacterData): string {
    const isSurv = c?.classes[0]?.classId === "class:sobrevivente";
    if (c?.optionalRules?.includes(OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX)) {
      const nex = this.effectiveNex(c);
      return isSurv ? `Estágio ${Math.min(5, Math.max(1, level))} · NEX ${nex}%` : `Nível ${level} · NEX ${nex}%`;
    }
    if (isSurv) return `Estágio ${Math.min(5, Math.max(1, level))} (NEX 0%)`;
    return `NEX ${nexOfLevel(level)}%`;
  }

  protected multiclassAllowed(): boolean {
    return false;
  }

  protected classOf(c: CharacterData, catalog: Catalog) {
    const cl = c.classes[0];
    const entry = cl ? catalog.get(cl.classId) : undefined;
    if (!cl || !entry) return undefined;
    const data = entry.data as unknown as OpClassData;
    const sub = cl.subclassId ? catalog.get(cl.subclassId) : undefined;
    return { cl, entry, data, sub };
  }

  protected originOf(c: CharacterData, catalog: Catalog) {
    const entry = c.backgroundId ? catalog.get(c.backgroundId) : undefined;
    return entry ? { entry, data: entry.data as unknown as OpOriginData } : undefined;
  }

  protected abilityBonuses(c: CharacterData): Record<string, number> {
    return { ...(c.levelBonuses ?? {}) };
  }

  /** Proficiências da classe + poderes + trilha. */
  private proficiencyNames(c: CharacterData, catalog: Catalog): Set<string> {
    const out = new Set<string>(["armas simples"]);
    const k = this.classOf(c, catalog);
    for (const p of k?.data.proficiencies ?? []) out.add(p);
    const chosen = new Set(c.choices.map((ch) => ch.contentId));
    if (chosen.has("power:armamento-pesado")) out.add("armas pesadas");
    if (chosen.has("power:protecao-pesada")) out.add("proteções pesadas");
    if (chosen.has("power:balistica-avancada") || chosen.has("power:ninja-urbano")) out.add("armas táticas");
    return out;
  }

  /** Grau de treinamento de cada perícia (Destreinado / Treinado / Veterano / Expert). */
  skillRanks(c: CharacterData, catalog: Catalog): Map<string, OpSkillRank> {
    const map = new Map<string, OpSkillRank>();
    const setAtLeast = (id: string, rank: OpSkillRank) => {
      const order: OpSkillRank[] = ["destreinado", "treinado", "veterano", "expert"];
      const prev = map.get(id) ?? "destreinado";
      if (order.indexOf(rank) > order.indexOf(prev)) map.set(id, rank);
    };

    const k = this.classOf(c, catalog);
    const org = this.originOf(c, catalog);
    for (const s of k?.data.skills.fixed ?? []) setAtLeast(s, "treinado");
    for (const s of org?.data.skills ?? []) setAtLeast(s, "treinado");

    for (const ch of c.choices) {
      if (!ch.contentId.startsWith("skill:")) continue;
      if (ch.slot.startsWith("skill-rank:expert:")) setAtLeast(ch.contentId, "expert");
      else if (ch.slot.startsWith("skill-rank:veterano:")) setAtLeast(ch.contentId, "veterano");
      else setAtLeast(ch.contentId, "treinado");
    }
    return map;
  }

  /** Contagem de poderes paranormais escolhidos por elemento (para pré-requisitos como "Morte 2"). */
  paranormalCounts(c: CharacterData, catalog: Catalog): { total: number; byElement: Record<string, number> } {
    const byElement: Record<string, number> = {};
    let total = 0;
    for (const ch of c.choices) {
      if (!ch.contentId.startsWith("power:")) continue;
      const e = catalog.get(ch.contentId);
      if (e?.data.group !== "paranormal") continue;
      total++;
      const el = String(e.data.element ?? "");
      if (el && el !== "variavel") byElement[el] = (byElement[el] ?? 0) + 1;
    }
    return { total, byElement };
  }

  /** Quantas vezes o agente transcendeu (perde a SAN do aumento de NEX a cada vez). */
  transcendCount(c: CharacterData, catalog: Catalog): number {
    const para = this.paranormalCounts(c, catalog).total;
    const freeFromOrigin = this.originOf(c, catalog)?.data.bonusParanormalPower ?? 0;
    return Math.max(0, para - freeFromOrigin);
  }

  /** Maior círculo de ritual acessível ao personagem (0 = nenhum). */
  maxRitualCircle(c: CharacterData, catalog: Catalog): number {
    const k = this.classOf(c, catalog);
    const lvl = totalLevel(c);
    let max = 0;
    if (k?.data.spellcasting) {
      for (const [circleStr, minLvl] of Object.entries(k.data.spellcasting.circleLevels)) {
        if (lvl >= minLvl) max = Math.max(max, Number(circleStr));
      }
    }
    // Trilha Esotérico de Sobrevivente (Estágio 4): 1º círculo
    if (k?.sub?.id === "subclass:esoterico" && lvl >= 4) max = Math.max(max, 1);
    // Poder paranormal Aprender Ritual: 1º (qualquer NEX), 2º (NEX 45% = lvl 9), 3º (NEX 75% = lvl 15)
    if (c.choices.some((ch) => ch.contentId === "power:aprender-ritual")) {
      max = Math.max(max, lvl >= 15 ? 3 : lvl >= 9 ? 2 : 1);
    }
    return max;
  }

  /** Orçamento de Aumentos de Atributo por NEX (20%, 50%, 80%, 95%, máx. 5; Sobrevivente Estágio 3, máx. 3). */
  levelBonusBudget(c: CharacterData, catalog: Catalog) {
    const k = this.classOf(c, catalog);
    const lvl = totalLevel(c);
    const levels = k?.data.asiLevels ?? [4, 10, 16, 19];
    const max = k?.data.asiMax ?? 5;
    const points = levels.filter((l) => l <= lvl).length;
    const detail = k?.data.isSurvivor
      ? points
        ? "Estágio 3: +1 em um atributo (máximo 3)."
        : "Sobreviventes recebem +1 em um atributo no 3º estágio."
      : points
        ? `${points} Aumento(s) de Atributo até ${this.formatLevel(lvl, c)} (NEX 20%, 50%, 80% e 95%; teto ${max}).`
        : "Os aumentos de atributo (+1) chegam em NEX 20%, 50%, 80% e 95%.";
    return { points, max, detail };
  }

  /** Orçamento de aumentos de Grau de Treinamento (Veterano em NEX 35%, Expert em NEX 70%). */
  skillUpgradeBudget(c: CharacterData, catalog: Catalog): SkillUpgradeBudget {
    const k = this.classOf(c, catalog);
    const lvl = totalLevel(c);
    const finals = this.finalAbilities(c, catalog);
    const intVal = Math.max(0, finals.int ?? 0);
    const trainingTimes = (k?.data.trainingLevels ?? []).filter((l) => l <= lvl).length;
    const perTime = (k?.data.trainingUpgradeBase ?? 0) + intVal;
    const max = trainingTimes * perTime;
    const used = c.choices.filter((ch) => ch.slot.startsWith("skill-rank:")).length;
    const maxRank: SkillUpgradeBudget["maxRank"] = lvl >= 14 ? "expert" : lvl >= 7 ? "veterano" : "treinado";
    const detail =
      trainingTimes === 0
        ? "Grau de Treinamento chega em NEX 35% (Veterano +10) e NEX 70% (Expert +15)."
        : `${trainingTimes}× (${k?.data.trainingUpgradeBase ?? 0} + INT ${intVal}) aprimoramentos de grau até ${this.formatLevel(lvl, c)}.`;
    return { used, max, maxRank, detail };
  }

  protected facts(c: CharacterData, catalog: Catalog): PrerequisiteFacts {
    const f = super.facts(c, catalog);
    const ranks = this.skillRanks(c, catalog);
    const profs = new Set<string>();
    for (const [id, r] of ranks) {
      if (r !== "destreinado") profs.add(id);
    }
    for (const p of this.proficiencyNames(c, catalog)) profs.add(`prof:${p}`);
    const content = f.labels.content;
    return {
      ...f,
      proficiencies: profs,
      labels: { ...f.labels, content: (id) => (id.startsWith("prof:") ? id.slice(5) : content(id)) },
    };
  }

  private inventoryEffects(c: CharacterData, catalog: Catalog) {
    const finals = this.finalAbilities(c, catalog);
    const k = this.classOf(c, catalog);
    const org = this.originOf(c, catalog);
    const lvl = totalLevel(c);
    const chosen = new Set(c.choices.map((ch) => ch.contentId));
    const addIntToSpaces = (k?.sub?.id === "subclass:tecnico" && lvl >= 2) || chosen.has("power:inventario-organizado");
    return opInventory(c, catalog, {
      strength: c.baseAbilities.for !== undefined ? finals.for : undefined,
      intellect: c.baseAbilities.int !== undefined ? finals.int : undefined,
      proficiencies: this.proficiencyNames(c, catalog),
      isSurvivor: Boolean(k?.data.isSurvivor),
      creditBump: org?.data.creditBump ?? 0,
      addIntToSpaces,
      reduceGeneralCategory: k?.sub?.id === "subclass:tecnico" && lvl >= 8,
      warTank: chosen.has("power:tanque-de-guerra"),
      paranormalToolsDiscount: chosen.has("power:ferramentas-paranormais"),
    });
  }

  derive(c: CharacterData, catalog: Catalog): DerivedStats {
    const base = super.derive(c, catalog);
    const level = totalLevel(c);
    const inv = this.inventoryEffects(c, catalog);
    const pure = this.finalAbilities(c, catalog);
    const finals: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, pure[k] + (inv.abilityBonuses[k] ?? 0)]));
    const hasAbilities = KEYS.every((k) => c.baseAbilities[k] !== undefined);
    const k = this.classOf(c, catalog);
    const org = this.originOf(c, catalog);
    const chosen = new Set(c.choices.map((ch) => ch.contentId));

    const stats: NonNullable<DerivedStats["stats"]> = [];
    const pending: string[] = [];

    if (!k) pending.push("Escolha uma classe para calcular PV, PE, Sanidade e limite de PE.");
    if (!hasAbilities) pending.push("Defina os cinco atributos para calcular as estatísticas da ficha.");

    if (k && hasAbilities) {
      const vig = finals.vig;
      const pre = finals.pre;
      const isSurv = Boolean(k.data.isSurvivor);
      const effectiveLvl = isSurv ? Math.min(5, level) : level;

      // PV
      const addVigPerLvl = k.data.hp.addAbilityPerLevel !== false;
      let hp = k.data.hp.initial + vig + (k.data.hp.perLevel + (addVigPerLvl ? vig : 0)) * (effectiveLvl - 1);
      if (org?.data.hpPerNex) hp += org.data.hpPerNex * effectiveLvl;
      if (k.sub?.id === "subclass:tropa-de-choque" && effectiveLvl >= 2) hp += effectiveLvl; // Casca Grossa
      if (k.sub?.id === "subclass:durao" && effectiveLvl >= 2) hp += effectiveLvl >= 3 ? 6 : 4;
      if (chosen.has("power:sangue-de-ferro")) hp += 2 * effectiveLvl;
      hp += inv.hpBonus;
      hp = Math.max(1, hp);

      // Limite de PE/PD por turno (Tabela 1.2)
      let peLimit = isSurv ? 1 : effectiveLvl;
      if (org?.data.peLimitBonus) peLimit += org.data.peLimitBonus;
      if (chosen.has("power:encarar-a-morte")) peLimit += 1;

      const usePd = c.optionalRules?.includes(OP_OPTIONAL_RULES.DETERMINATION_POINTS) ?? false;
      stats.push({ key: "hp", label: "Pontos de vida", value: hp, detail: `${Math.floor(hp / 2)} machucado`, source: DERIVED_SRC });

      if (usePd) {
        const pdSpec = PD_FORMULA[k.entry.id] ?? PD_FORMULA["class:combatente"];
        let pd = pdSpec.initial + pre + (pdSpec.perLevel + (pdSpec.addPrePerLevel ? pre : 0)) * (effectiveLvl - 1);
        if (org?.data.peBonus) pd += org.data.peBonus;
        if (org?.data.pePerOddNex && effectiveLvl >= 3) pd += Math.floor((effectiveLvl - 1) / 2);
        if (chosen.has("power:potencial-aprimorado")) pd += effectiveLvl;
        pd += inv.peBonus;
        pd = Math.max(1, pd);
        stats.push({
          key: "pd",
          label: "Pontos de determinação",
          value: pd,
          detail: `Regra sem Sanidade · limite por turno: ${peLimit} PD (SaH p. 104)`,
          source: opSource(104, "Jogando sem Sanidade"),
        });
        stats.push({ key: "peLimit", label: "Limite de PD/turno", value: peLimit, source: NEX_SRC });
      } else {
        // PE
        const addPrePerLvl = k.data.pe.addAbilityPerLevel !== false;
        let pe = k.data.pe.initial + pre + (k.data.pe.perLevel + (addPrePerLvl ? pre : 0)) * (effectiveLvl - 1);
        if (org?.data.peBonus) pe += org.data.peBonus;
        if (org?.data.pePerOddNex && effectiveLvl >= 3) pe += Math.floor((effectiveLvl - 1) / 2); // NEX ímpar (15%, 25%...)
        if (chosen.has("power:potencial-aprimorado")) pe += effectiveLvl;
        pe += inv.peBonus;
        pe = Math.max(1, pe);

        // SAN
        const initSan = org?.data.halfInitialSanity ? Math.floor(k.data.san.initial / 2) : k.data.san.initial;
        const transcends = this.transcendCount(c, catalog);
        const sanLevels = Math.max(0, effectiveLvl - 1 - transcends);
        let san = initSan + k.data.san.perLevel * sanLevels;
        if (org?.data.sanPerNex) san += org.data.sanPerNex * effectiveLvl;
        san = Math.max(1, san);

        stats.push({ key: "mp", label: "Pontos de esforço", value: pe, detail: `Limite por turno: ${peLimit} PE`, source: DERIVED_SRC });
        stats.push({ key: "san", label: "Sanidade", value: san, detail: transcends ? `${transcends}× Transcender descontado(s)` : `${Math.floor(san / 2)} perturbado`, source: DERIVED_SRC });
        stats.push({ key: "peLimit", label: "Limite de PE/turno", value: peLimit, source: NEX_SRC });
      }

      if (c.optionalRules?.includes(OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX)) {
        const nex = this.effectiveNex(c);
        const marks: string[] = [];
        if (nex >= 25) marks.push("25% (Ocultismo +2 / –5 social)");
        if (nex >= 35) marks.push("35% (+atributo em PE/PD / –5 físico)");
        if (nex >= 50) marks.push("50% (Afinidade Elemental)");
        stats.push({
          key: "nex",
          label: "NEX separado",
          value: `${nex}%`,
          detail: marks.length ? `Alterações ativas: ${marks.join("; ")}` : "Nenhuma alteração de NEX ativa (<25%)",
          source: opSource(99, "Separando Nível e NEX"),
        });
      }

      // DT de habilidades e rituais: 10 + limite de PE base (sem bônus que não afetam DT) + Presença
      const basePeLimit = isSurv ? 1 : effectiveLvl;
      let dt = 10 + basePeLimit + pre + inv.ritualDcBonus;
      if (k.sub?.id === "subclass:graduado" && effectiveLvl >= 13) dt += 5; // Rituais Eficientes
      stats.push({ key: "spellDc", label: "DT de rituais/hab.", value: dt, detail: `10 + limite de PE (${basePeLimit}) + Presença (${pre})`, source: RITUALS_SRC });
    }

    if (hasAbilities) {
      const agi = finals.agi;
      let defense = 10 + agi + inv.armorDefense + inv.shieldDefense + inv.itemDefense;
      if (org?.data.defenseBonus) defense += org.data.defenseBonus;
      if (chosen.has("power:reflexos-defensivos")) defense += 2;
      if (chosen.has("power:precognicao")) defense += 2;
      if (inv.summary.load && inv.summary.load.state !== "normal") defense -= 5;
      stats.push({
        key: "defense",
        label: "Defesa",
        value: defense,
        detail: `10 + Agilidade (${agi})${inv.armorDefense ? ` + proteção (${inv.armorDefense})` : ""}${inv.shieldDefense ? ` + escudo (${inv.shieldDefense})` : ""}`,
        source: DERIVED_SRC,
      });

      if (inv.damageReduction > 0) {
        stats.push({ key: "rd", label: "RD física", value: inv.damageReduction, detail: "Contra balístico, corte, impacto e perfuração.", source: opSource(62, "Proteções") });
      }
      if (org?.data.mentalRdInt && finals.int > 0) {
        stats.push({ key: "mentalRd", label: "RD mental", value: finals.int, detail: "Eu Já Sabia (Teórico da Conspiração).", source: opSource(21, "Origens") });
      }

      let speed = 9 - inv.speedPenalty + inv.speedBonus;
      if (chosen.has("power:atletico")) speed += 3;
      stats.push({ key: "speed", label: "Deslocamento", value: `${Math.max(1.5, speed)}m`, source: DERIVED_SRC });
    }

    if (inv.summary.categoryBudget) {
      stats.push({ key: "rank", label: "Patente", value: inv.summary.categoryBudget.rank, detail: `Crédito: ${inv.summary.categoryBudget.credit}`, source: opSource(52, "Patente") });
      stats.push({ key: "credit", label: "Crédito", value: inv.summary.categoryBudget.credit, source: opSource(52, "Patente") });
    }

    // Perícias com grau de treinamento e pool de dados
    const ranks = this.skillRanks(c, catalog);
    const skills =
      hasAbilities && catalog.ofKind("skill").length
        ? catalog.ofKind("skill").map((e) => {
            const d = e.data as unknown as OpSkillData;
            const rank = ranks.get(e.id) ?? "destreinado";
            let bonusVal = OP_RANK_BONUS[rank];
            if (d.loadPenalty) bonusVal += inv.loadPenalty;
            if (e.id === "skill:iniciativa" && k?.sub?.id === "subclass:operacoes-especiais" && level >= 2) bonusVal += 5;
            if ((e.id === "skill:atletismo" || e.id === "skill:crime") && k?.sub?.id === "subclass:infiltrador" && level >= 8) bonusVal += 5;
            if (e.id === "skill:percepcao" && chosen.has("power:visao-do-oculto")) bonusVal += 5;
            if ((e.id === "skill:diplomacia" || e.id === "skill:intimidacao" || e.id === "skill:intuicao") && chosen.has("power:sensitivo")) bonusVal += 5;
            const attrVal = finals[d.ability] ?? 1;
            return {
              id: e.id,
              name: e.name,
              trained: rank !== "destreinado",
              rank,
              value: bonusVal,
              dice: opDiceFormula(attrVal, bonusVal),
            };
          })
        : undefined;

    const abilities = Object.fromEntries(KEYS.map((key) => [key, { score: finals[key], modifier: finals[key] }]));
    return { ...base, abilities, pending, stats, skills, inventory: inv.summary };
  }

  creationSteps(): CreationStep[] {
    return [
      { id: "concept", title: "Conceito do agente", help: "Defina o nome e a ideia central do seu agente antes de enfrentar o Outro Lado.", requiresContent: false },
      { id: "level", title: "NEX / Estágio", help: "Agentes iniciantes começam em NEX 5% (ou Estágio 1 para Sobreviventes).", requiresContent: false },
      { id: "abilities", title: "Atributos", help: "Cinco atributos de 0 a 5 (começam em 1, com 4 pontos para distribuir; máximo inicial 3). Cada ponto equivale a 1d20 rolado nos testes.", requiresContent: false },
      { id: "origin", title: "Origem", help: "O que seu personagem fazia antes da Ordem. Concede 2 perícias treinadas e 1 poder exclusivo.", contentKind: "origin", requiresContent: true },
      { id: "class", title: "Classe e Trilha", help: "Combatente, Especialista, Ocultista (ou Sobrevivente). A trilha é escolhida em NEX 10% e a Afinidade Elemental em NEX 50%.", contentKind: "class", requiresContent: true },
      { id: "skills", title: "Perícias", help: "Perícias treinadas (+5) da origem, classe e Intelecto. Em NEX 35% e 70%, promova perícias para Veterano (+10) e Expert (+15).", contentKind: "skill", requiresContent: true },
      { id: "powers", title: "Poderes", help: "Poderes de classe, poderes gerais e poderes paranormais (via Transcender, que troca a Sanidade do aumento de NEX pelo poder).", contentKind: "power", requiresContent: true },
      { id: "spells", title: "Rituais", help: "Rituais de Conhecimento, Energia, Morte, Sangue e Medo (para Ocultistas, Esotéricos ou quem tem Aprender Ritual).", contentKind: "spell", requiresContent: true },
      { id: "equipment", title: "Equipamento e Patente", help: "Defina seus Pontos de Prestígio (Patente), escolha armas, proteções, equipamentos, modificações e maldições respeitando Categorias e Espaços.", contentKind: "equipment", requiresContent: true, ui: "inventory" },
      { id: "narrative", title: "Personalidade e histórico", help: "Aparência, personalidade, histórico e objetivos do agente.", requiresContent: false },
      { id: "review", title: "Revisão", help: "Confira a ficha completa, valide as regras e salve uma versão.", requiresContent: false },
    ];
  }

  choiceLimits(c: CharacterData, catalog: Catalog): ChoiceLimit[] {
    const k = this.classOf(c, catalog);
    const org = this.originOf(c, catalog);
    const lvl = totalLevel(c);
    const finals = this.finalAbilities(c, catalog);
    const intVal = Math.max(0, finals.int ?? 0);

    // Perícias fixas (origem + classe) não gastam cota livre
    const granted = new Set<string>([...(k?.data.skills.fixed ?? []), ...(org?.data.skills ?? [])]);
    const usedSkills = c.choices.filter(
      (ch) => ch.contentId.startsWith("skill:") && !ch.slot.startsWith("skill-rank:") && !granted.has(ch.contentId),
    ).length;

    const skillParts: string[] = [];
    let maxSkills = 0;
    if (k?.data.skills) {
      const fromCls = (k.data.skills.oneOf?.length ?? 0) + k.data.skills.choose;
      if (fromCls > 0) {
        maxSkills += fromCls;
        skillParts.push(`classe ${fromCls}`);
      }
      if (k.data.skills.intBonus && intVal > 0) {
        maxSkills += intVal;
        skillParts.push(`Intelecto ${intVal}`);
      }
    }
    if (org?.data.freeSkills) {
      maxSkills += org.data.freeSkills;
      skillParts.push(`origem ${org.data.freeSkills}`);
    }
    if (k?.sub?.id === "subclass:esperto" && lvl >= 2) {
      maxSkills += 1;
      skillParts.push("Esperto 1");
    }
    // Poder Treinamento em Perícia (+2 perícias por escolha)
    const trainPowers = c.choices.filter((ch) => ch.contentId === "power:treinamento-em-pericia").length;
    if (trainPowers > 0) {
      maxSkills += trainPowers * 2;
      skillParts.push(`Treinamento em Perícia ${trainPowers * 2}`);
    }

    // Poderes: níveis de Poder de Classe (15, 30, 45, 60, 75, 90%) + Versatilidade (NEX 50%) + Cultista Arrependido (+1 paranormal)
    const usedPowers = c.choices.filter((ch) => ch.contentId.startsWith("power:") && ch.contentId !== "power:transcender").length;
    const powerParts: string[] = [];
    let maxPowers = 0;
    if (k) {
      const clsPowers = (k.data.powerLevels ?? []).filter((l) => l <= lvl).length;
      if (clsPowers > 0) {
        maxPowers += clsPowers;
        powerParts.push(`classe ${clsPowers}`);
      }
      if (k.data.versatilityLevel && lvl >= k.data.versatilityLevel) {
        maxPowers += 1;
        powerParts.push("Versatilidade 1");
      }
    }
    if (org?.data.bonusParanormalPower) {
      maxPowers += org.data.bonusParanormalPower;
      powerParts.push("origem 1 (paranormal)");
    }

    // Rituais: Ocultista (3 iniciais + 1 por NEX) + Graduado + Esotérico (1) + Aprender Ritual (até INT)
    const usedSpells = c.choices.filter((ch) => ch.contentId.startsWith("spell:")).length;
    const spellParts: string[] = [];
    let maxSpells = 0;
    if (k?.data.spellcasting) {
      const sc = k.data.spellcasting;
      const baseRituals = sc.initialRituals + sc.ritualsPerLevel * Math.max(0, lvl - 1);
      maxSpells += baseRituals;
      spellParts.push(`Ocultista ${baseRituals}`);
      if (k.sub?.id === "subclass:graduado" && lvl >= 2) {
        const circles = Object.values(sc.circleLevels).filter((minL) => lvl >= minL).length;
        maxSpells += circles;
        spellParts.push(`Saber Ampliado ${circles}`);
        if (lvl >= 8) {
          const grim = intVal + (lvl >= 11 ? 1 : 0) + (lvl >= 17 ? 1 : 0);
          maxSpells += grim;
          spellParts.push(`Grimório ${grim}`);
        }
      }
    }
    if (k?.sub?.id === "subclass:esoterico" && lvl >= 4) {
      maxSpells += 1;
      spellParts.push("Esotérico 1");
    }
    if (c.choices.some((ch) => ch.contentId === "power:aprender-ritual")) {
      const learnCount = Math.max(1, intVal);
      maxSpells += learnCount;
      spellParts.push(`Aprender Ritual (máx. INT ${intVal})`);
    }

    const fmt = (parts: string[]) => (parts.length ? parts.join(" + ") : "nenhuma escolha livre");
    return [
      { kind: "skill", used: usedSkills, max: maxSkills, detail: fmt(skillParts) },
      { kind: "power", used: usedPowers, max: maxPowers, detail: fmt(powerParts) },
      { kind: "spell", used: usedSpells, max: maxSpells, detail: fmt(spellParts) },
    ];
  }

  evaluateOption(c: CharacterData, entry: ContentEntry, catalog: Catalog): OptionEvaluation {
    const baseEval = super.evaluateOption(c, entry, catalog);
    if (baseEval.availability === "acquired" || baseEval.availability === "unavailable") return baseEval;

    const issues = [...baseEval.issues];

    // Afinidade Elemental quando "Separando Nível e NEX" está ativo usa effectiveNex >= 50
    if (entry.kind === "feature" && entry.data.exclusiveGroup === "afinidade" && c.optionalRules?.includes(OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX)) {
      const filtered = issues.filter((i) => i.code !== "prereq.min_level");
      issues.length = 0;
      issues.push(...filtered);
      if (this.effectiveNex(c) < 50) {
        issues.push({
          code: "prereq.op_nex_affinity",
          severity: "invalid",
          message: "Afinidade Elemental exige NEX 50% ou maior.",
          satisfiableLater: true,
          source: PARANORMAL_SRC,
        });
      }
    }

    // Pré-requisito elemental de Poder Paranormal (ex.: "Morte 2" = ter 2 outros poderes de Morte)
    if (entry.kind === "power" && entry.data.elementPrereq) {
      const req = entry.data.elementPrereq as { element: string; count: number };
      const counts = this.paranormalCounts(c, catalog).byElement;
      const own = String(entry.data.element) === req.element && c.choices.some((ch) => ch.contentId === entry.id) ? 1 : 0;
      const have = (counts[req.element] ?? 0) - own;
      if (have < req.count) {
        issues.push({
          code: "prereq.op_element",
          severity: "invalid",
          message: `Requer ${req.count} outro(s) poder(es) paranormal(is) de ${req.element} (atual: ${have}).`,
          satisfiableLater: true,
          source: entry.source,
        });
      }
    }

    // Círculo de Ritual permitido
    if (entry.kind === "spell") {
      const circle = Number(entry.data.circle ?? 1);
      const maxCircle = this.maxRitualCircle(c, catalog);
      if (maxCircle === 0) {
        issues.push({
          code: "prereq.op_ritual_caster",
          severity: "invalid",
          message: "Para aprender rituais, seja Ocultista, escolha o poder paranormal Aprender Ritual ou a trilha Esotérico (Estágio 4).",
          satisfiableLater: true,
          source: RITUALS_SRC,
        });
      } else if (circle > maxCircle) {
        issues.push({
          code: "prereq.op_ritual_circle",
          severity: "invalid",
          message: `Ritual de ${circle}º círculo; no momento você pode conjurar até o ${maxCircle}º círculo.`,
          satisfiableLater: true,
          source: RITUALS_SRC,
        });
      }
    }

    const blocking = issues.filter((i) => i.severity === "invalid");
    if (!blocking.length) return { availability: "available_now", issues };
    const later = blocking.every((i) => i.satisfiableLater);
    return { availability: later ? "available_later" : "unavailable", issues };
  }

  protected levelGains(before: CharacterData, after: CharacterData, catalog: Catalog): LevelUpGain[] {
    const k = this.classOf(after, catalog);
    if (!k) return [];
    const to = totalLevel(after);
    const gains: LevelUpGain[] = [];
    const src = k.entry.source;

    for (const f of k.data.features ?? []) {
      if (f.level !== to) continue;
      if (/^Aumento de Atributo/.test(f.name) || /^Poder de /.test(f.name) || /^Grau de Treinamento/.test(f.name) || /^Habilidade de Trilha/.test(f.name)) {
        continue;
      }
      gains.push({ kind: "feature", label: f.name, detail: f.summary, source: src });
    }
    if (k.sub) {
      const subFeats = ((k.sub.data as { features?: { level: number; name: string; summary: string }[] }).features ?? []).filter((f) => f.level === to);
      for (const f of subFeats) {
        gains.push({ kind: "feature", label: `${f.name} (${k.sub.name})`, detail: f.summary, source: k.sub.source });
      }
    }
    if (to === k.data.subclassLevel && !k.cl.subclassId) {
      gains.push({
        kind: "choice",
        label: "Escolha sua Trilha",
        detail: `${k.entry.name} escolhe uma trilha em ${this.formatLevel(to, after)}.`,
        stepId: "class",
        source: src,
      });
    }
    if (k.data.asiLevels.includes(to)) {
      gains.push({
        kind: "choice",
        label: "Aumento de Atributo (+1)",
        detail: `Aumente um atributo em +1 (máximo ${k.data.asiMax ?? 5}).`,
        stepId: "abilities",
        source: src,
      });
    }
    if (k.data.powerLevels.includes(to)) {
      gains.push({
        kind: "choice",
        label: `Novo Poder de ${k.entry.name}`,
        detail: "Escolha um poder de classe, poder geral ou Transcender (poder paranormal, abrindo mão da SAN deste NEX).",
        stepId: "powers",
        source: src,
      });
    }
    if (k.data.versatilityLevel === to) {
      gains.push({
        kind: "choice",
        label: "Versatilidade e Afinidade Elemental (NEX 50%)",
        detail: "Escolha um poder adicional (ou 1ª habilidade de outra trilha) e escolha seu elemento de Afinidade na etapa Classe.",
        stepId: "class",
        source: PARANORMAL_SRC,
      });
    }
    if (k.data.trainingLevels.includes(to)) {
      gains.push({
        kind: "choice",
        label: `Grau de Treinamento (${to >= 14 ? "Expert +15" : "Veterano +10"})`,
        detail: `Aumente o grau de treinamento de ${(k.data.trainingUpgradeBase ?? 2) + Math.max(0, this.finalAbilities(after, catalog).int ?? 0)} perícias.`,
        stepId: "skills",
        source: SKILLS_SRC,
      });
    }
    if (k.data.spellcasting) {
      gains.push({
        kind: "choice",
        label: "Aprenda +1 Ritual",
        detail: `Ocultistas aprendem 1 ritual a cada aumento de NEX (até ${this.maxRitualCircle(after, catalog)}º círculo).`,
        stepId: "spells",
        source: RITUALS_SRC,
      });
    }
    return gains;
  }

  protected validateSystem(c: CharacterData, catalog: Catalog): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const k = this.classOf(c, catalog);
    const lvl = totalLevel(c);

    if (catalog.size === 0) {
      issues.push({
        code: "ruleset.content_not_imported",
        severity: "warning",
        message: "O catálogo de Ordem Paranormal ainda não foi importado. Execute pnpm content:import content/ordem-paranormal-1e/pack.ts.",
      });
      return issues;
    }

    if (k?.data.isSurvivor && lvl > 5) {
      issues.push({
        code: "class.survivor_max_stage",
        severity: "invalid",
        message: "Sobreviventes evoluem do Estágio 1 ao 5 (NEX 0%). Para continuar evoluindo, mude para Combatente, Especialista ou Ocultista.",
        path: "level",
        source: k.entry.source,
      });
    }

    // Subclasse / Trilha
    if (k) {
      if (k.cl.subclassId && lvl < k.data.subclassLevel) {
        issues.push({
          code: "class.subclass_too_early",
          severity: "invalid",
          message: `${k.entry.name} só escolhe trilha a partir de ${this.formatLevel(k.data.subclassLevel, c)}.`,
          path: "classes",
          source: k.entry.source,
        });
      } else if (!k.cl.subclassId && lvl >= k.data.subclassLevel) {
        issues.push({
          code: "class.subclass_missing",
          severity: "warning",
          message: `Escolha uma trilha de ${k.entry.name} (${this.formatLevel(k.data.subclassLevel, c)}+).`,
          path: "classes",
          source: k.entry.source,
        });
      } else if (k.sub && k.sub.prerequisites) {
        const ev = this.evaluateOption(c, k.sub, catalog);
        for (const i of ev.issues) issues.push({ ...i, path: "classes", message: `${k.sub.name}: ${i.message}` });
      }
    }

    // Aumentos de atributo por NEX (levelBonuses)
    const budget = this.levelBonusBudget(c, catalog);
    const finals = this.finalAbilities(c, catalog);
    const usedAsi = Object.values(c.levelBonuses ?? {}).reduce((s, v) => s + v, 0);
    if (usedAsi > budget.points) {
      issues.push({
        code: "abilities.level_bonus_over",
        severity: "invalid",
        message: `Você distribuiu ${usedAsi} Aumento(s) de Atributo, mas até ${this.formatLevel(lvl, c)} tem direito a ${budget.points}.`,
        path: "levelBonuses",
        source: NEX_SRC,
      });
    } else if (usedAsi < budget.points && k) {
      issues.push({
        code: "abilities.level_bonus_pending",
        severity: "warning",
        message: `Você ainda tem ${budget.points - usedAsi} Aumento(s) de Atributo (+1) para distribuir em ${this.formatLevel(lvl, c)}.`,
        path: "levelBonuses",
        source: NEX_SRC,
      });
    }
    for (const key of KEYS) {
      if ((c.levelBonuses?.[key] ?? 0) > 0 && finals[key] > budget.max) {
        issues.push({
          code: "abilities.level_bonus_cap",
          severity: "invalid",
          message: `${LABEL.get(key)} não pode passar de ${budget.max} com Aumentos de Atributo.`,
          path: `abilities.${key}`,
          source: NEX_SRC,
        });
      }
    }

    // Limites de perícias, poderes e rituais
    for (const lim of this.choiceLimits(c, catalog)) {
      if (lim.used <= lim.max) continue;
      const what = lim.kind === "skill" ? "perícias treinadas" : lim.kind === "power" ? "poderes" : "rituais";
      issues.push({
        code: `${lim.kind}s.too_many`,
        severity: "invalid",
        message: `Há ${lim.used} ${what} escolhidos, mas em ${this.formatLevel(lvl, c)} o máximo é ${lim.max} (${lim.detail}). Remova ${lim.used - lim.max}.`,
        path: "choices",
        source: lim.kind === "skill" ? SKILLS_SRC : lim.kind === "power" ? POWERS_SRC : RITUALS_SRC,
      });
    }

    // Grau de Treinamento (Veterano / Expert)
    const upg = this.skillUpgradeBudget(c, catalog);
    if (upg.used > upg.max) {
      issues.push({
        code: "skills.upgrade_over",
        severity: "invalid",
        message: `Há ${upg.used} aprimoramentos de Grau de Treinamento, mas o limite atual é ${upg.max}.`,
        path: "choices",
        source: SKILLS_SRC,
      });
    }
    for (const ch of c.choices) {
      if (ch.slot.startsWith("skill-rank:veterano:") && lvl < 7) {
        issues.push({ code: "skills.veterano_early", severity: "invalid", message: "Grau Veterano (+10) exige NEX 35%.", path: "choices", source: SKILLS_SRC });
      }
      if (ch.slot.startsWith("skill-rank:expert:") && lvl < 14) {
        issues.push({ code: "skills.expert_early", severity: "invalid", message: "Grau Expert (+15) exige NEX 70%.", path: "choices", source: SKILLS_SRC });
      }
    }

    // Pré-requisitos elementais de Poderes Paranormais e círculos de Rituais já escolhidos
    for (const ch of c.choices) {
      const entry = catalog.get(ch.contentId);
      if (!entry) continue;
      if (entry.kind === "power" && entry.data.elementPrereq) {
        const req = entry.data.elementPrereq as { element: string; count: number };
        const counts = this.paranormalCounts(c, catalog).byElement;
        const own = String(entry.data.element) === req.element ? 1 : 0;
        const have = (counts[req.element] ?? 0) - own;
        if (have < req.count) {
          issues.push({
            code: "prereq.op_element",
            severity: "invalid",
            message: `${entry.name}: requer ${req.count} outro(s) poder(es) de ${req.element} (atual: ${have}).`,
            path: `choices.${ch.slot}`,
            source: entry.source,
          });
        }
      }
      if (entry.kind === "spell") {
        const circle = Number(entry.data.circle ?? 1);
        const maxCircle = this.maxRitualCircle(c, catalog);
        if (circle > maxCircle) {
          issues.push({
            code: "prereq.op_ritual_circle",
            severity: "invalid",
            message: `${entry.name}: ritual de ${circle}º círculo, mas seu limite atual é ${maxCircle === 0 ? "nenhum" : `${maxCircle}º círculo`}.`,
            path: `choices.${ch.slot}`,
            source: RITUALS_SRC,
          });
        }
      }
    }

    // Inventário (Patente, Categorias, Espaços, Proteções, Maldições)
    issues.push(...this.inventoryEffects(c, catalog).issues);

    return issues;
  }
}
