import type { CharacterData } from "../core/character";
import { totalLevel } from "../core/character";
import type { Rng } from "../core/dice";
import {
  BaseEngine,
  type AbilityDef,
  type AbilityMethod,
  type Catalog,
  type CreationStep,
  type DerivedStats,
  type RulesetMeta,
} from "../core/engine";
import type { PrerequisiteFacts } from "../core/prerequisites";
import type { ContentEntry } from "../core/content";
import type { SourceRef, ValidationIssue } from "../core/types";
import { T20_CURRENCIES, t20Inventory, t20StartingWealth, type T20InventoryEffects } from "./tormenta20-inventory";

export * from "./tormenta20-inventory";

/**
 * Tormenta20 — livro básico, 1ª edição (Jambô Editora, agosto de 2020).
 *
 * O livro é publicado sob a Open Game License 1.0a (p. 391): todo o texto de
 * regras é Conteúdo Open Game, exceto o que foi declarado Identidade do
 * Produto (Introdução, Capítulo 9, termos do cenário, ilustrações e as regras
 * da classe inventor). As fórmulas abaixo são regras do livro, citadas por
 * página. O conteúdo (raças, classes, origens, perícias) está no pacote
 * content/tormenta20-2020, com a licença em LICENSE-OGL.txt.
 */

export const T20_RULESET_ID = "tormenta20-2020";

export const T20_BOOK = { sourcebookId: "t20-2020", edition: "2020", version: "1ª edição (2020)" } as const;

export function t20Source(page: number, section: string): SourceRef {
  return { ...T20_BOOK, page, section };
}

const ATTRIBUTES_SRC = t20Source(17, "Atributos Básicos");
const RACES_SRC = t20Source(18, "Características das Raças");
const LEVELS_SRC = t20Source(35, "Nível de Personagem");
const SKILLS_SRC = t20Source(114, "Perícias");
const DERIVED_SRC = t20Source(106, "Características Derivadas");

export const T20_ABILITIES: AbilityDef[] = [
  { key: "for", abbr: "FOR", label: "Força", description: "Poder muscular: Atletismo, Luta e dano corpo a corpo ou de arremesso." },
  { key: "des", abbr: "DES", label: "Destreza", description: "Agilidade e reflexos: Defesa, Pontaria, Reflexos, Furtividade e Iniciativa." },
  { key: "con", abbr: "CON", label: "Constituição", description: "Saúde e vigor: pontos de vida e Fortitude." },
  { key: "int", abbr: "INT", label: "Inteligência", description: "Raciocínio: Conhecimento, Misticismo e perícias treinadas adicionais." },
  { key: "sab", abbr: "SAB", label: "Sabedoria", description: "Percepção e força de vontade: Percepção, Intuição e Vontade." },
  { key: "car", abbr: "CAR", label: "Carisma", description: "Personalidade e persuasão: Diplomacia, Enganação e Intimidação." },
];
const KEYS = T20_ABILITIES.map((a) => a.key);
const LABEL = new Map(T20_ABILITIES.map((a) => [a.key, a.label]));

/** Tabela 1-1 (p. 17): 10–11 = 0; cada 2 pontos acima ou abaixo = ±1. */
export function t20Modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** "Bônus" de atributo ignora modificadores negativos (p. 17). */
const bonus = (score: number) => Math.max(0, t20Modifier(score));
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
/** Testes de resistência são perícias no Tormenta20. */
const SAVES = new Set(["skill:fortitude", "skill:reflexos", "skill:vontade"]);

/** Tabela 1-2 (p. 17): custo por valor na geração por pontos. */
export const T20_POINT_COST: Record<number, number> = {
  8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 4, 15: 6, 16: 8, 17: 11, 18: 14,
};
export const T20_POINT_BUDGET = 20;

/** Tabela 1-3 (p. 35): XP mínimo por nível (índice 0 = 1º nível). */
export const T20_XP_THRESHOLDS = [
  0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000, 55000, 66000, 78000, 91000, 105000, 120000,
  136000, 153000, 171000, 190000,
];

export function t20LevelForXp(xp: number): number {
  let level = 1;
  T20_XP_THRESHOLDS.forEach((t, i) => {
    if (xp >= t) level = i + 1;
  });
  return level;
}

/** Bônus de treinamento (p. 114): +2; +4 a partir do 7º nível; +6 a partir do 15º. */
export function t20TrainingBonus(level: number): number {
  return level >= 15 ? 6 : level >= 7 ? 4 : 2;
}

/** Modificador de perícia (p. 114): metade do nível + atributo-chave (+ treinamento). */
export function t20SkillModifier(level: number, abilityScore: number, trained: boolean): number {
  return Math.floor(level / 2) + t20Modifier(abilityScore) + (trained ? t20TrainingBonus(level) : 0);
}

/* ------------------------------------------------------------------ */
/* Itens superiores e mágicos (p. 155 e 319–321)                       */
/* ------------------------------------------------------------------ */

/** Tabela 3-6: aumento no custo e na CD de Ofício por número de modificações (índice = número). */
export const T20_MODIFICATION_COST = [
  { cost: 0, dc: 0 },
  { cost: 100, dc: 5 },
  { cost: 1000, dc: 5 },
  { cost: 3000, dc: 10 },
  { cost: 6000, dc: 10 },
  { cost: 10000, dc: 15 },
  { cost: 30000, dc: 20 },
] as const;

/** Aumento no custo e na CD de Ofício por número de encantos (índice = número), p. 320. */
export const T20_ENCHANTMENT_COST = [
  { cost: 0, dc: 0 },
  { cost: 10000, dc: 5 },
  { cost: 20000, dc: 10 },
  { cost: 45000, dc: 15 },
  { cost: 70000, dc: 20 },
] as const;

export type T20ItemTier = "menor" | "medio" | "maior";

/** Propriedades de itens mágicos permanentes por categoria (p. 319–321). */
export const T20_MAGIC_TIERS: Record<T20ItemTier, {
  maxEnchantments: number;
  /** CD de testes de resistência contra efeitos do item. */
  saveDc: number;
  /** CD de Ofício para fabricar itens específicos. */
  craftDc: number;
  /** PM sacrificados para fabricar um item permanente. */
  manaSacrifice: number;
  /** Bônus em PV e RD do item. */
  durabilityBonus: number;
  /** Bônus nos testes de resistência do próprio item. */
  saveBonus: number;
}> = {
  menor: { maxEnchantments: 2, saveDc: 20, craftDc: 30, manaSacrifice: 1, durabilityBonus: 10, saveBonus: 5 },
  medio: { maxEnchantments: 3, saveDc: 25, craftDc: 40, manaSacrifice: 2, durabilityBonus: 20, saveBonus: 10 },
  maior: { maxEnchantments: 4, saveDc: 30, craftDc: 50, manaSacrifice: 3, durabilityBonus: 40, saveBonus: 20 },
};

/** Além das armas empunhadas, um personagem usa no máximo três itens mágicos entre armaduras, escudos e acessórios. */
export const T20_MAGIC_ITEM_LIMIT = 3;

/**
 * Fabricação de item superior e/ou encantado: um terço do preço do item normal mais o aumento
 * das modificações e dos encantos. A CD é a do item normal mais os dois aumentos (p. 155 e 320).
 */
export function t20CraftItem(opts: { basePrice: number; baseDc: number; modifications?: number; enchantments?: number }) {
  const mods = opts.modifications ?? 0;
  const ench = opts.enchantments ?? 0;
  if (mods < 0 || mods >= T20_MODIFICATION_COST.length) throw new RangeError("Um item tem de 0 a 6 modificações.");
  if (ench < 0 || ench >= T20_ENCHANTMENT_COST.length) throw new RangeError("Um item tem de 0 a 4 encantos.");
  return {
    cost: opts.basePrice / 3 + T20_MODIFICATION_COST[mods].cost + T20_ENCHANTMENT_COST[ench].cost,
    dc: opts.baseDc + T20_MODIFICATION_COST[mods].dc + T20_ENCHANTMENT_COST[ench].dc,
  };
}

/** Poções e pergaminhos: custo = (PM da magia)² × 10 moedas; CD = 20 + PM (p. 320). Preço de venda = 3 × custo (Tabela de poções). */
export function t20CraftConsumable(spellMana: number) {
  const cost = spellMana * spellMana * 10;
  return { cost, dc: 20 + spellMana, price: cost * 3 };
}

/* ------------------------------------------------------------------ */
/* Dados do pacote (formato do campo `data`)                           */
/* ------------------------------------------------------------------ */

export interface T20SpeciesData {
  abilityBonuses?: Record<string, number>;
  /** "+2 em três atributos diferentes" e variações. */
  flexibleBonus?: { count: number; amount: number; exclude?: string[] };
  size?: string;
  speed?: number;
  creatureType?: string;
  hpBonus?: { first: number; perLevel: number };
  mpPerLevel?: number;
  defenseBonus?: number;
  noOrigin?: boolean;
  traits?: { name: string; summary: string }[];
}

export interface T20ClassData {
  hp: { initial: number; perLevel: number };
  mpPerLevel: number;
  /** Atributo cujo bônus é somado ao total de PM. "path" = definido pelo Caminho do Arcanista. */
  mpKeyAbility?: string;
  /** Soma o bônus do atributo aos PM apenas uma vez, no 1º nível (Abençoado, do paladino). */
  mpKeyAbilityOnce?: string;
  skills: { fixed: string[]; oneOf?: string[][]; choose: number; from: string[] };
  proficiencies: string[];
  restricted?: boolean;
}

export interface T20SkillData {
  ability: string;
  trainedOnly: boolean;
  armorPenalty: boolean;
}

const speciesData = (c: CharacterData, catalog: Catalog) =>
  ((c.speciesId ? catalog.get(c.speciesId)?.data : undefined) ?? {}) as T20SpeciesData;

/* ------------------------------------------------------------------ */
/* Métodos de geração de atributos (p. 17)                             */
/* ------------------------------------------------------------------ */

function missing(scores: Record<string, number>): ValidationIssue[] {
  return KEYS.filter((k) => scores[k] === undefined).map((k) => ({
    code: "abilities.missing",
    severity: "invalid" as const,
    message: `Defina o valor de ${LABEL.get(k)}.`,
    path: `abilities.${k}`,
  }));
}

const modTotal = (scores: Record<string, number>) => KEYS.reduce((s, k) => s + t20Modifier(scores[k]), 0);

function roll4d6(rng: Rng): number {
  const r = [rng(6), rng(6), rng(6), rng(6)].sort((a, b) => b - a);
  return r[0] + r[1] + r[2];
}

export const T20_ABILITY_METHODS: AbilityMethod[] = [
  {
    id: "point-buy",
    label: "Geração por pontos",
    description: `Você tem ${T20_POINT_BUDGET} pontos. Cada atributo começa em 10 (custo 0), pode baixar até 8 para ganhar pontos e subir até 18. Recomendado para iniciantes.`,
    source: ATTRIBUTES_SRC,
    validate(scores) {
      const m = missing(scores);
      if (m.length) return m;
      const issues: ValidationIssue[] = [];
      let spent = 0;
      for (const k of KEYS) {
        const cost = T20_POINT_COST[scores[k]];
        if (cost === undefined) {
          issues.push({
            code: "abilities.point_buy_range",
            severity: "invalid",
            message: `Na geração por pontos, ${LABEL.get(k)} deve ficar entre 8 e 18 antes dos modificadores de raça.`,
            path: `abilities.${k}`,
            source: ATTRIBUTES_SRC,
          });
        } else spent += cost;
      }
      if (issues.length) return issues;
      if (spent > T20_POINT_BUDGET) {
        issues.push({
          code: "abilities.point_buy_over",
          severity: "invalid",
          message: `Você gastou ${spent} pontos; o limite é ${T20_POINT_BUDGET}.`,
          path: "abilities",
          source: ATTRIBUTES_SRC,
        });
      } else if (spent < T20_POINT_BUDGET) {
        issues.push({
          code: "abilities.point_buy_unspent",
          severity: "warning",
          message: `Ainda restam ${T20_POINT_BUDGET - spent} pontos para distribuir.`,
          path: "abilities",
          source: ATTRIBUTES_SRC,
        });
      }
      return issues;
    },
    generate(rng) {
      for (;;) {
        const scores: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, 10]));
        let budget = T20_POINT_BUDGET;
        // Às vezes baixa um atributo para ganhar pontos, como um jogador faria.
        if (rng(2) === 1) {
          const k = KEYS[rng(KEYS.length) - 1];
          scores[k] = 8;
          budget += 2;
        }
        let guard = 0;
        while (budget > 0 && guard++ < 300) {
          const k = KEYS[rng(KEYS.length) - 1];
          const next = scores[k] + 1;
          const delta = (T20_POINT_COST[next] ?? Infinity) - T20_POINT_COST[scores[k]];
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
    description:
      "Role 4d6 para cada atributo e some os três maiores. Se a soma dos modificadores ficar abaixo de +6, você pode rolar novamente o menor valor até alcançar +6.",
    source: ATTRIBUTES_SRC,
    validate(scores) {
      const m = missing(scores);
      if (m.length) return m;
      const issues: ValidationIssue[] = KEYS.filter((k) => scores[k] < 3 || scores[k] > 18).map((k) => ({
        code: "abilities.roll_range",
        severity: "invalid" as const,
        message: "Com 4d6 (descartando o menor), cada valor fica entre 3 e 18.",
        path: `abilities.${k}`,
        source: ATTRIBUTES_SRC,
      }));
      if (!issues.length && modTotal(scores) < 6) {
        issues.push({
          code: "abilities.roll_low_total",
          severity: "warning",
          message: `A soma dos modificadores é ${modTotal(scores)}. Pela regra, você pode rolar novamente o menor valor até a soma chegar a +6.`,
          path: "abilities",
          source: ATTRIBUTES_SRC,
        });
      }
      return issues;
    },
    generate(rng) {
      const scores: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, roll4d6(rng)]));
      // Aplica a regra de rolar de novo o menor valor enquanto a soma for menor que +6.
      for (let guard = 0; modTotal(scores) < 6 && guard < 100; guard++) {
        const lowest = KEYS.reduce((a, b) => (scores[b] < scores[a] ? b : a));
        scores[lowest] = roll4d6(rng);
      }
      return scores;
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

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

export class Tormenta20Engine extends BaseEngine {
  readonly meta: RulesetMeta = {
    id: T20_RULESET_ID,
    name: "Fantasia d20 (2020)",
    system: "Fantasia d20",
    edition: "1ª edição (2020)",
    publisher: "Conteúdo Open Game (OGL 1.0a)",
    dataAvailability: "licensed",
    limitations: [
      "Baseado no livro básico de 2020, publicado sob a Open Game License 1.0a. Edições revisadas posteriores não são suportadas.",
      "Termos do cenário (deuses, lugares, povos e fenômenos) são Identidade do Produto. Raças e habilidades com esses nomes aparecem com nomes genéricos e com a página do livro como referência.",
      "As regras de uma das classes do livro são Identidade do Produto. Ela aparece como \"Artífice\", só com nome e página, e exige aprovação do mestre.",
      "O pacote inclui raças, classes, origens, perícias, poderes, magias, divindades, equipamento, itens superiores e itens mágicos. Ameaças e regras do mestre não estão incluídas.",
      "Artefatos trazem só as regras: a história e a mitologia ligadas a eles são Identidade do Produto.",
      "O inventário aplica na ficha: armadura e escudo (Defesa, penalidade, Destreza máxima, deslocamento), modificações e encantos de Defesa e resistência, bônus fixos de acessórios, carga e o limite de três itens mágicos. Bônus situacionais, de perícia específica (como +5 em Furtividade) e efeitos de armas não são somados; consulte o texto do item.",
      "Pré-requisitos que o sistema não consegue verificar (como \"outro poder aberrante\") ficam para aprovação do mestre. Restrições de escola de magia do bardo e do druida não são verificadas.",
    ],
    sources: [
      {
        id: T20_BOOK.sourcebookId,
        title: "Livro básico (1ª edição, 2020)",
        license: "OGL-1.0a",
      },
    ],
    levelRange: { min: 1, max: 20 },
  };

  readonly abilities = T20_ABILITIES;
  readonly abilityMethods = T20_ABILITY_METHODS;

  abilityModifier = t20Modifier;
  levelForXp = t20LevelForXp;
  readonly currencies = T20_CURRENCIES;
  startingWealth = t20StartingWealth;

  /** Proficiências por nome do livro ("armas marciais") e o poder Proficiência, se escolhido. */
  private proficiencyNames(c: CharacterData, catalog: Catalog): Set<string> {
    const out = new Set<string>();
    for (const p of this.facts(c, catalog).proficiencies) if (p.startsWith("prof:")) out.add(p.slice(5));
    if (c.choices.some((ch) => ch.contentId === "power:proficiencia")) out.add("proficiencia");
    return out;
  }

  inventoryEffects(c: CharacterData, catalog: Catalog): T20InventoryEffects {
    const finals = this.finalAbilities(c, catalog);
    return t20Inventory(c, catalog, {
      strength: c.baseAbilities.for !== undefined ? finals.for : undefined,
      proficiencies: this.proficiencyNames(c, catalog),
    });
  }

  /** Multiclasse é regra básica do Tormenta20 (p. 35), não opcional. */
  protected multiclassAllowed(): boolean {
    return true;
  }

  protected abilityBonuses(c: CharacterData, catalog: Catalog): Record<string, number> {
    const sp = speciesData(c, catalog);
    const out: Record<string, number> = { ...(sp.abilityBonuses ?? {}) };
    if (sp.flexibleBonus) {
      for (const [k, v] of Object.entries(c.assignedBonuses)) out[k] = (out[k] ?? 0) + v;
    }
    return out;
  }

  /** "Um modificador de raça nunca baixa um valor de atributo para menos de 3" (p. 18). */
  finalAbilities(c: CharacterData, catalog: Catalog): Record<string, number> {
    const b = this.abilityBonuses(c, catalog);
    return Object.fromEntries(
      KEYS.map((k) => {
        const base = c.baseAbilities[k] ?? 0;
        const mod = b[k] ?? 0;
        return [k, mod < 0 ? Math.max(Math.min(base, 3), base + mod) : base + mod];
      }),
    );
  }

  /** Perícias treinadas: fixas da classe inicial + escolhidas na ficha. */
  trainedSkills(c: CharacterData, catalog: Catalog): Set<string> {
    const trained = new Set<string>();
    const first = c.classes[0] ? catalog.get(c.classes[0].classId) : undefined;
    for (const s of (first?.data as T20ClassData | undefined)?.skills?.fixed ?? []) trained.add(s);
    for (const ch of c.choices) if (ch.contentId.startsWith("skill:")) trained.add(ch.contentId);
    return trained;
  }

  /**
   * Fatos para pré-requisitos: perícias treinadas e proficiências ("prof:...") contam
   * como proficiências. Todo personagem é proficiente com armas simples e armaduras leves (p. 139 e 148).
   */
  protected facts(c: CharacterData, catalog: Catalog): PrerequisiteFacts {
    const f = super.facts(c, catalog);
    const profs = new Set<string>([...this.trainedSkills(c, catalog), "prof:armas simples", "prof:armaduras leves"]);
    for (const cl of c.classes) {
      const d = catalog.get(cl.classId)?.data as T20ClassData | undefined;
      for (const p of d?.proficiencies ?? []) profs.add(`prof:${p}`);
    }
    const content = f.labels.content;
    return {
      ...f,
      proficiencies: profs,
      labels: { ...f.labels, content: (id) => (id.startsWith("prof:") ? id.slice(5) : content(id)) },
    };
  }

  /** Atributo-chave de PM do arcanista, conforme o Caminho escolhido. */
  private arcanistKey(c: CharacterData, catalog: Catalog): string | undefined {
    for (const ch of c.choices) {
      const e = catalog.get(ch.contentId);
      const key = e?.data.arcanistPathKey;
      if (typeof key === "string") return key;
    }
    return undefined;
  }

  derive(c: CharacterData, catalog: Catalog): DerivedStats {
    const base = super.derive(c, catalog);
    const level = totalLevel(c);
    const inv = this.inventoryEffects(c, catalog);
    // Bônus de atributo de itens equipados valem para as estatísticas derivadas
    // (mas não contam para pré-requisitos nem para perícias treinadas extras).
    const pure = this.finalAbilities(c, catalog);
    const finals: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, pure[k] + (inv.abilityBonuses[k] ?? 0)]));
    const pending: string[] = [];
    const stats: NonNullable<DerivedStats["stats"]> = [];
    const sp = speciesData(c, catalog);
    const hasAbilities = KEYS.every((k) => c.baseAbilities[k] !== undefined);
    const conMod = t20Modifier(finals.con);

    const classes = c.classes
      .map((cl) => ({ cl, entry: catalog.get(cl.classId) }))
      .filter((x): x is { cl: (typeof c.classes)[number]; entry: ContentEntry } => !!x.entry);

    if (!classes.length || !hasAbilities) {
      pending.push(
        !classes.length
          ? "Escolha uma classe para calcular pontos de vida e de mana."
          : "Defina os atributos para calcular pontos de vida e de mana.",
      );
    } else if (classes.some((x) => (x.entry.data as unknown as T20ClassData).restricted)) {
      pending.push("A classe escolhida não tem regras incluídas; calcule PV e PM pelo livro.");
    } else {
      // PV (p. 35 e p. 106): 1º nível da classe inicial; níveis seguintes, e o 1º de
      // cada nova classe, dão os PV por nível. Sempre pelo menos 1 PV por nível.
      let hp = 0;
      let mp = 0;
      classes.forEach(({ cl, entry }, i) => {
        const d = entry.data as unknown as T20ClassData;
        const levels = cl.levels;
        if (i === 0) {
          hp += d.hp.initial + conMod;
          hp += Math.max(1, d.hp.perLevel + conMod) * (levels - 1);
        } else {
          hp += Math.max(1, d.hp.perLevel + conMod) * levels;
        }
        mp += d.mpPerLevel * levels;
      });
      if (sp.hpBonus) hp += sp.hpBonus.first + sp.hpBonus.perLevel * (level - 1);
      if (sp.mpPerLevel) mp += sp.mpPerLevel * level;

      // Bônus de atributo-chave nos PM, uma vez por fonte.
      const keys = new Set<string>();
      for (const { entry } of classes) {
        const d = entry.data as unknown as T20ClassData;
        if (d.mpKeyAbility === "path") {
          const k = this.arcanistKey(c, catalog);
          if (k) keys.add(k);
          else pending.push("Escolha o Caminho do Arcanista para somar o atributo-chave aos PM.");
        } else if (d.mpKeyAbility) keys.add(d.mpKeyAbility);
        if (d.mpKeyAbilityOnce) keys.add(d.mpKeyAbilityOnce);
      }
      for (const k of keys) mp += bonus(finals[k]);

      stats.push({ key: "hp", label: "Pontos de vida", value: hp, source: DERIVED_SRC });
      stats.push({ key: "mp", label: "Pontos de mana", value: mp, source: DERIVED_SRC });
    }

    if (hasAbilities) {
      const desMod = t20Modifier(finals.des);
      const dex = inv.maxDexToDefense === undefined ? desMod : Math.min(desMod, inv.maxDexToDefense);
      const defense = 10 + dex + (sp.defenseBonus ?? 0) + inv.armorDefense + inv.shieldDefense + inv.itemDefense;
      const parts = [
        "10",
        `Destreza ${fmt(dex)}${inv.maxDexToDefense !== undefined && desMod > inv.maxDexToDefense ? " (limitada pela armadura pesada)" : ""}`,
        sp.defenseBonus ? `raça ${fmt(sp.defenseBonus)}` : "",
        inv.armorDefense ? `armadura ${fmt(inv.armorDefense)}` : "",
        inv.shieldDefense ? `escudo ${fmt(inv.shieldDefense)}` : "",
        inv.itemDefense ? `itens ${fmt(inv.itemDefense)}` : "",
      ].filter(Boolean);
      stats.push({
        key: "defense",
        label: "Defesa",
        value: defense,
        detail: `${parts.join(" + ")}. Habilidades de classe e poderes não estão incluídos.`,
        source: DERIVED_SRC,
      });
      if (inv.armorPenalty < 0) {
        stats.push({
          key: "armorPenalty",
          label: "Penalidade de armadura",
          value: inv.armorPenalty,
          detail: "Aplicada em Acrobacia, Furtividade e Ladinagem (e em Atletismo para nadar). Inclui a penalidade de carga, se houver.",
          source: t20Source(148, "Penalidade de Armadura"),
        });
      }
    }
    if (c.speciesId) {
      const speed = Math.max(0, (sp.speed ?? 9) - inv.speedPenalty);
      stats.push({
        key: "speed",
        label: "Deslocamento",
        value: `${speed}m`,
        detail: inv.speedPenalty ? `Reduzido em ${inv.speedPenalty}m por armadura pesada ou carga.` : undefined,
        source: RACES_SRC,
      });
      stats.push({ key: "size", label: "Tamanho", value: sp.size ?? "Médio", source: RACES_SRC });
    }

    const trainedSet = this.trainedSkills(c, catalog);
    const skills =
      hasAbilities && catalog.ofKind("skill").length
        ? catalog.ofKind("skill").map((e) => {
            const d = e.data as unknown as T20SkillData;
            const trained = trainedSet.has(e.id);
            // Atletismo só sofre a penalidade para nadar; fica de fora do valor geral.
            const penalty = d.armorPenalty && e.id !== "skill:atletismo"
              ? inv.armorPenalty + inv.nonProficientPenalty
              : d.ability === "for" || d.ability === "des" ? inv.nonProficientPenalty : 0;
            const save = SAVES.has(e.id) ? inv.saveBonus : 0;
            return { id: e.id, name: e.name, trained, value: t20SkillModifier(level, finals[d.ability], trained) + penalty + save };
          })
        : undefined;

    const abilities = Object.fromEntries(KEYS.map((k) => [k, { score: finals[k], modifier: t20Modifier(finals[k]) }]));
    return { ...base, abilities, pending, stats, skills, inventory: inv.summary };
  }

  creationSteps(): CreationStep[] {
    return [
      { id: "concept", title: "Nome e conceito", help: "Quem é seu personagem? Um nome e uma ideia curta já bastam.", requiresContent: false },
      { id: "level", title: "Nível inicial", help: "Personagens começam no 1º nível. Confirme com o mestre.", requiresContent: false },
      { id: "abilities", title: "Atributos", help: "Seis valores que descrevem as capacidades básicas do personagem.", requiresContent: false },
      { id: "species", title: "Raça", help: "Sua raça modifica atributos e concede habilidades, tamanho e deslocamento.", contentKind: "species", requiresContent: true },
      { id: "class", title: "Classe", help: "A classe define pontos de vida, pontos de mana, perícias e habilidades.", contentKind: "class", requiresContent: true },
      { id: "origin", title: "Origem", help: "O que seu personagem fazia antes de ser aventureiro. Escolha dois benefícios da lista.", contentKind: "origin", requiresContent: true },
      { id: "deity", title: "Divindade", help: "Opcional. Ser devoto dá acesso aos poderes concedidos da divindade, em troca de obrigações e restrições.", contentKind: "deity", requiresContent: true },
      { id: "skills", title: "Perícias", help: "Perícias treinadas da classe, da Inteligência, da raça e da origem.", contentKind: "skill", requiresContent: true },
      { id: "powers", title: "Poderes", help: "Poderes gerais, de classe e concedidos. Opções com pré-requisitos ainda não cumpridos aparecem como disponíveis mais tarde.", contentKind: "power", requiresContent: true },
      { id: "spells", title: "Magias", help: "Magias da tradição da sua classe (arcana ou divina) e universais, até o círculo que você já pode lançar.", contentKind: "spell", requiresContent: true },
      { id: "equipment", title: "Inventário", help: "Dinheiro, equipamento inicial e itens. Marque o que está equipado: armadura, escudo e acessórios mudam Defesa, perícias e deslocamento. Preços em moedas, como no livro.", contentKind: "equipment", requiresContent: true, ui: "inventory" },
      { id: "narrative", title: "Histórico e personalidade", help: "Detalhes que dão vida ao personagem.", requiresContent: false },
      { id: "review", title: "Revisão", help: "Confira a ficha antes de concluir.", requiresContent: false },
    ];
  }

  protected validateSystem(c: CharacterData, catalog: Catalog): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (catalog.size === 0) {
      issues.push({
        code: "ruleset.content_not_imported",
        severity: "warning",
        message: "O pacote de conteúdo deste sistema ainda não foi importado. A ficha pode ser preenchida, mas raças e classes não serão verificadas.",
      });
    }

    // Modificadores de raça flexíveis (+2 em três atributos diferentes etc.).
    const species = c.speciesId ? catalog.get(c.speciesId) : undefined;
    const sp = (species?.data ?? {}) as T20SpeciesData;
    const assigned = Object.entries(c.assignedBonuses).filter(([, v]) => v !== 0);
    if (species && sp.flexibleBonus) {
      const { count, amount, exclude = [] } = sp.flexibleBonus;
      const src = species.source;
      const bad = assigned.filter(([k, v]) => v !== amount || exclude.includes(k) || !KEYS.includes(k));
      if (bad.length) {
        const excl = exclude.length ? ` (exceto ${exclude.map((k) => LABEL.get(k)).join(", ")})` : "";
        issues.push({
          code: "species.flexible_invalid",
          severity: "invalid",
          message: `${species.name}: distribua +${amount} em ${count} atributos diferentes${excl}.`,
          path: "assignedBonuses",
          source: src,
        });
      } else if (assigned.length !== count) {
        issues.push({
          code: assigned.length < count ? "species.flexible_pending" : "species.flexible_invalid",
          severity: assigned.length < count ? "warning" : "invalid",
          message: `${species.name}: escolha exatamente ${count} atributos para receber +${amount} (escolhidos: ${assigned.length}).`,
          path: "assignedBonuses",
          source: src,
        });
      }
    } else if (assigned.length) {
      issues.push({
        code: "species.flexible_unused",
        severity: "warning",
        message: "A raça escolhida não permite distribuir modificadores de atributo; os valores distribuídos serão ignorados.",
        path: "assignedBonuses",
        source: RACES_SRC,
      });
    }

    // Golem: "Sem Origem" (p. 27).
    if (species && sp.noOrigin && c.backgroundId) {
      issues.push({
        code: "species.no_origin",
        severity: "invalid",
        message: `${species.name} não tem direito a escolher uma origem.`,
        path: "backgroundId",
        source: species.source,
      });
    }

    // Referências da ficha que precisam existir no catálogo.
    if (catalog.size > 0) {
      if (c.speciesId && !species) {
        issues.push({ code: "species.unknown", severity: "invalid", message: "A raça escolhida não existe neste sistema.", path: "speciesId" });
      }
      if (c.backgroundId && !catalog.get(c.backgroundId)) {
        issues.push({ code: "origin.unknown", severity: "invalid", message: "A origem escolhida não existe neste sistema.", path: "backgroundId" });
      }
      for (const cl of c.classes) {
        const e = catalog.get(cl.classId);
        if (!e) {
          issues.push({ code: "class.unknown", severity: "invalid", message: `A classe "${cl.classId}" não existe neste sistema.`, path: "classes" });
        } else if ((e.data as unknown as T20ClassData).restricted) {
          issues.push({
            code: "class.restricted",
            severity: "gm_approval",
            message: `${e.name}: as regras desta classe não estão incluídas (Identidade do Produto). Use o livro${e.source.page ? `, p. ${e.source.page}` : ""}, com aprovação do mestre.`,
            path: "classes",
            source: e.source,
          });
        }
      }
    }

    // Inventário: armaduras, escudos, proficiências, melhorias, carga e itens mágicos.
    issues.push(...this.inventoryEffects(c, catalog).issues);

    // Progressão por XP (Tabela 1-3).
    if (c.progressionMode === "xp" && c.experience > 0) {
      const expected = t20LevelForXp(c.experience);
      if (expected !== totalLevel(c)) {
        issues.push({
          code: "progression.xp_level_mismatch",
          severity: "warning",
          message: `Com ${c.experience} XP o nível esperado é ${expected}, mas a ficha indica nível ${totalLevel(c)}.`,
          path: "level",
          source: LEVELS_SRC,
        });
      }
    }

    // Perícias escolhidas além do máximo possível (classe + Int + raça + origem).
    const first = c.classes[0] ? catalog.get(c.classes[0].classId) : undefined;
    const cd = first?.data as T20ClassData | undefined;
    if (cd?.skills) {
      const chosen = c.choices.filter((ch) => ch.contentId.startsWith("skill:") && !cd.skills.fixed.includes(ch.contentId));
      const intBonus = bonus(this.finalAbilities(c, catalog).int);
      const max = (cd.skills.oneOf?.length ?? 0) + cd.skills.choose + intBonus + 2 /* origem */ + 2; /* raça (máx.) */
      if (chosen.length > max) {
        issues.push({
          code: "skills.too_many",
          severity: "warning",
          message: `Há ${chosen.length} perícias treinadas escolhidas; o esperado é no máximo ${max}. Confira classe, Inteligência, raça e origem.`,
          path: "choices",
          source: SKILLS_SRC,
        });
      }
    }

    return issues;
  }
}
