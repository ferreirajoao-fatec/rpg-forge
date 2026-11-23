/**
 * Motor comum do D&D 5e (2014 e 2024): pontos de vida, Classe de Armadura, testes de resistência,
 * perícias, conjuração, inventário e validações que não mudam entre as edições.
 *
 * Regras do SRD 5.1 e do SRD 5.2.1 (CC-BY-4.0). Os dados (dados de vida, perícias da classe,
 * espaços de magia por nível, armaduras...) vêm do catálogo, não deste arquivo.
 */
import type { CharacterData } from "../core/character";
import { totalLevel } from "../core/character";
import type { ContentEntry } from "../core/content";
import {
  BaseEngine,
  type Catalog,
  type CurrencyDef,
  type DerivedStats,
  type InventoryRow,
  type StartingPackage,
} from "../core/engine";
import { moneyTotal } from "../core/money";
import type { LevelUpGain } from "../core/progression";
import type { OptionEvaluation, SourceRef, ValidationIssue } from "../core/types";
import { DND_ABILITIES, DND_XP_THRESHOLDS, dndLevelForXp, dndModifier, dndProficiencyBonus } from "./dnd5e-common";

/* ------------------------------------------------------------------ dados do catálogo */

export interface DndTrait {
  id: string;
  name: string;
  summary: string;
  text: string[];
}

export interface DndClassLevel {
  level: number;
  prof: number;
  asi: boolean;
  /** Espaços de magia do 1º ao 9º nível. */
  slots: number[];
  cantrips?: number;
  /** Magias conhecidas (2014: bardo, feiticeiro, bruxo, patrulheiro). */
  known?: number;
  /** Magias preparadas (2024). */
  prepared?: number;
  special?: Record<string, unknown>;
}

export interface DndClassData {
  hitDie: number;
  saves: string[];
  primaryAbility: string[];
  proficiencies: string[];
  /** Armaduras que a classe sabe usar: "leve", "media", "pesada", "escudo". */
  armor: string[];
  skills: { choose: number; from: string[] };
  spellcasting?: { ability: string; startLevel: number; type: "known" | "prepared" };
  subclassLevel: number;
  levels: DndClassLevel[];
  features: (DndTrait & { level: number })[];
  startingEquipment: Omit<StartingPackage, "source">;
}

export interface DndSpeciesData {
  size: string;
  /** Em metros. */
  speed: number;
  abilityBonuses: Record<string, number>;
  flexibleBonus?: { count: number; amount: number; exclude?: string[] };
  skills: string[];
  /** Perícias à escolha concedidas pela raça/espécie (ex.: meio-elfo, humano de 2024). */
  flexibleSkills?: number;
  traits: DndTrait[];
  subspecies: string[];
  darkvision?: boolean;
}

export interface DndSubspeciesData {
  parent: string;
  abilityBonuses: Record<string, number>;
  hpPerLevel?: number;
  traits: DndTrait[];
}

export interface DndBackgroundData {
  skills: string[];
  tools: string[];
  /** 2024: atributos que o antecedente permite aumentar. */
  abilityScores: string[];
  /** 2024: talento de origem concedido. */
  featId?: string;
  featNote?: string;
  feature?: { name: string; text: string[] };
  startingEquipment: Omit<StartingPackage, "source">;
}

export interface DndItemData {
  category: string;
  price?: number;
  weight?: number;
  armorType?: "leve" | "media" | "pesada";
  ac?: number;
  dexBonus?: boolean;
  maxDex?: number;
  strMin?: number;
  stealthDisadvantage?: boolean;
  proficiency?: "simples" | "marciais";
  damage?: string;
  damageType?: string;
  versatile?: string;
  range?: string;
  properties?: string[];
}

/* ------------------------------------------------------------------ constantes */

/** Peças de cobre, prata, electro, ouro e platina; preços do catálogo em peças de ouro. */
export const DND_CURRENCIES: CurrencyDef[] = [
  { key: "pc", label: "Peças de cobre", abbr: "pc", value: 0.01 },
  { key: "pp", label: "Peças de prata", abbr: "pp", value: 0.1 },
  { key: "pe", label: "Peças de electro", abbr: "pe", value: 0.5 },
  { key: "po", label: "Peças de ouro", abbr: "po", value: 1 },
  { key: "pl", label: "Peças de platina", abbr: "pl", value: 10 },
];

export const ABILITY_SCORE_MAX = 20;
const KEYS = DND_ABILITIES.map((a) => a.key);
const label = (k: string) => DND_ABILITIES.find((a) => a.key === k)?.label ?? k;
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const fmtM = (m: number) => `${Number.isInteger(m) ? m : m.toFixed(1).replace(".", ",")} m`;

export const SLOT_SUBSPECIES = "subspecies";

/* ------------------------------------------------------------------ motor */

export abstract class Dnd5eEngine extends BaseEngine {
  readonly abilities = DND_ABILITIES;
  readonly currencies = DND_CURRENCIES;
  abilityModifier = dndModifier;
  levelForXp = dndLevelForXp;
  readonly xpThresholds = DND_XP_THRESHOLDS;
  protected proficiencyBonus(level: number) {
    return dndProficiencyBonus(level);
  }

  /** Fonte citada nas estatísticas derivadas. */
  protected abstract readonly rulesSource: SourceRef;
  /** Bônus de atributo da edição (raça em 2014, antecedente em 2024), antes dos aumentos por nível. */
  protected abstract originBonuses(c: CharacterData, catalog: Catalog): Record<string, number>;

  protected abilityBonuses(c: CharacterData, catalog: Catalog): Record<string, number> {
    const out = { ...this.originBonuses(c, catalog) };
    for (const [k, v] of Object.entries(c.levelBonuses ?? {})) out[k] = (out[k] ?? 0) + v;
    return out;
  }

  /* ---------------- leitura do catálogo ---------------- */

  protected classOf(c: CharacterData, catalog: Catalog) {
    const cl = c.classes[0];
    const entry = cl ? catalog.get(cl.classId) : undefined;
    if (!cl || !entry) return undefined;
    const data = entry.data as unknown as DndClassData;
    // Classe sem dados de regras (ex.: conteúdo de teste ou importado à mão): sem cálculos.
    if (!data.hitDie || !Array.isArray(data.levels)) return undefined;
    const level = Math.max(1, Math.min(cl.levels, 20));
    const row = data.levels.find((l) => l.level === level);
    const sub = cl.subclassId ? catalog.get(cl.subclassId) : undefined;
    return { cl, entry, data, level, row, sub };
  }

  protected speciesOf(c: CharacterData, catalog: Catalog) {
    const entry = c.speciesId ? catalog.get(c.speciesId) : undefined;
    if (!entry) return undefined;
    const subId = c.choices.find((ch) => ch.slot === SLOT_SUBSPECIES)?.contentId;
    const sub = subId ? catalog.get(subId) : undefined;
    return {
      entry,
      data: entry.data as unknown as DndSpeciesData,
      sub: sub && (sub.data as unknown as DndSubspeciesData).parent === entry.id ? sub : undefined,
    };
  }

  protected backgroundOf(c: CharacterData, catalog: Catalog) {
    const entry = c.backgroundId ? catalog.get(c.backgroundId) : undefined;
    return entry ? { entry, data: entry.data as unknown as DndBackgroundData } : undefined;
  }

  /** Perícias que vêm prontas (antecedente e raça/espécie), sem contar as escolhidas da classe. */
  grantedSkills(c: CharacterData, catalog: Catalog): Set<string> {
    return new Set([...(this.backgroundOf(c, catalog)?.data.skills ?? []), ...(this.speciesOf(c, catalog)?.data.skills ?? [])]);
  }

  trainedSkills(c: CharacterData, catalog: Catalog): Set<string> {
    const s = this.grantedSkills(c, catalog);
    for (const ch of c.choices) if (ch.contentId.startsWith("skill:")) s.add(ch.contentId);
    return s;
  }

  /** Maior nível de magia que o personagem já pode lançar (0 = só truques ou nenhum). */
  maxSpellLevel(c: CharacterData, catalog: Catalog): number {
    const k = this.classOf(c, catalog);
    if (!k?.row) return 0;
    let max = 0;
    k.row.slots.forEach((n, i) => {
      if (n > 0) max = i + 1;
    });
    return max;
  }

  /** Limite de magias de nível 1+ na lista do personagem e como ele se chama. */
  spellLimit(c: CharacterData, catalog: Catalog, finals: Record<string, number>): { limit: number; label: string } | undefined {
    const k = this.classOf(c, catalog);
    const sc = k?.data.spellcasting;
    if (!k || !sc || !k.row) return undefined;
    if (typeof k.row.prepared === "number") return { limit: k.row.prepared, label: "preparadas" };
    if (typeof k.row.known === "number") return { limit: k.row.known, label: "conhecidas" };
    if (k.level < sc.startLevel) return { limit: 0, label: "preparadas" };
    const mod = dndModifier(finals[sc.ability] ?? 10);
    // 2014: mago anota 6 magias no grimório no 1º nível e mais 2 a cada nível.
    if (k.entry.id === "class:wizard") return { limit: 6 + 2 * (k.level - 1), label: "no grimório" };
    const lv = k.entry.id === "class:paladin" ? Math.floor(k.level / 2) : k.level;
    return { limit: Math.max(1, mod + lv), label: "preparadas" };
  }

  /* ---------------- aumentos de atributo por nível ---------------- */

  /** Níveis de classe já alcançados que dão Aumento no Valor de Habilidade (ou um talento). */
  asiCount(c: CharacterData, catalog: Catalog): number {
    const k = this.classOf(c, catalog);
    return k ? k.data.levels.filter((l) => l.asi && l.level <= k.level).length : 0;
  }

  /** Talentos que ocupam um aumento de atributo (o de origem e os de estilo de luta não ocupam). */
  protected featsUsingAsi(c: CharacterData, catalog: Catalog): ContentEntry[] {
    const originFeat = this.backgroundOf(c, catalog)?.data.featId;
    return c.choices
      .filter((ch) => ch.contentId.startsWith("feat:") && ch.contentId !== originFeat)
      .map((ch) => catalog.get(ch.contentId))
      .filter((e): e is ContentEntry => !!e && !["fighting-style", "origin"].includes(String(e.data.type)) && e.id !== "feat:ability-score-improvement");
  }

  levelBonusBudget(c: CharacterData, catalog: Catalog) {
    const asi = this.asiCount(c, catalog);
    const feats = this.featsUsingAsi(c, catalog).length;
    const points = Math.max(0, asi - feats) * 2;
    const detail = asi
      ? `${asi} Aumento(s) no Valor de Habilidade até o nível atual${feats ? `, ${feats} trocado(s) por talento` : ""}: +2 em um atributo ou +1 em dois, sem passar de ${ABILITY_SCORE_MAX}.`
      : "Os aumentos de atributo chegam no 4º nível (e em outros, conforme a classe).";
    return { points, max: ABILITY_SCORE_MAX, detail };
  }

  /* ---------------- progressão ---------------- */

  /** Habilidades de classe e subclasse do novo nível, aumento de atributo, subclasse e novas magias. */
  protected levelGains(before: CharacterData, after: CharacterData, catalog: Catalog): LevelUpGain[] {
    const k = this.classOf(after, catalog);
    if (!k) return [];
    const prev = this.classOf(before, catalog);
    const gains: LevelUpGain[] = [];
    const src = k.entry.source;
    const asiFeature = (name: string) => /aumento no valor de habilidade|ability score improvement/i.test(name);

    for (const f of k.data.features ?? []) {
      if (f.level !== k.level || asiFeature(f.name)) continue;
      gains.push({ kind: "feature", label: f.name, detail: f.summary, source: src });
    }
    if (k.sub) {
      const subFeatures = ((k.sub.data as { features?: (DndTrait & { level: number })[] }).features ?? []).filter((f) => f.level === k.level);
      for (const f of subFeatures) gains.push({ kind: "feature", label: `${f.name} (${k.sub.name})`, detail: f.summary, source: k.sub.source });
    }
    if (k.level === k.data.subclassLevel && !k.cl.subclassId) {
      gains.push({ kind: "choice", label: "Escolha a subclasse", detail: `${k.entry.name} escolhe a subclasse no ${k.level}º nível.`, stepId: "class", source: src });
    }
    if (k.row?.asi) {
      gains.push({
        kind: "choice",
        label: "Aumento no Valor de Habilidade",
        detail: "+2 em um atributo ou +1 em dois (máximo 20). Com a regra de talentos, pode trocar por um talento.",
        stepId: "abilities",
        source: this.rulesSource,
      });
    }
    const cantrips = (k.row?.cantrips ?? 0) - (prev?.row?.cantrips ?? 0);
    if (cantrips > 0) gains.push({ kind: "choice", label: `Aprenda ${cantrips} truque(s)`, stepId: "spells", source: src });
    const known = (k.row?.known ?? 0) - (prev?.row?.known ?? 0);
    const prepared = (k.row?.prepared ?? 0) - (prev?.row?.prepared ?? 0);
    if (known > 0) gains.push({ kind: "choice", label: `Aprenda ${known} magia(s)`, stepId: "spells", source: src });
    else if (prepared > 0) gains.push({ kind: "choice", label: `Prepare mais ${prepared} magia(s)`, stepId: "spells", source: src });
    else if (k.entry.id === "class:wizard" && k.data.spellcasting && k.level > 1) {
      gains.push({ kind: "choice", label: "Anote 2 magias no grimório", stepId: "spells", source: src });
    }
    return gains;
  }

  /* ---------------- equipamento ---------------- */

  startingPackages(c: CharacterData, catalog: Catalog): StartingPackage[] {
    const out: StartingPackage[] = [];
    const k = this.classOf(c, catalog);
    if (k?.data.startingEquipment) out.push({ source: k.entry.name, ...k.data.startingEquipment });
    const b = this.backgroundOf(c, catalog);
    if (b?.data.startingEquipment && (b.data.startingEquipment.fixed.length || b.data.startingEquipment.groups.length)) {
      out.push({ source: b.entry.name, ...b.data.startingEquipment });
    }
    return out;
  }

  /** Armadura e escudo equipados, peso e valor carregados. */
  protected inventoryEffects(c: CharacterData, catalog: Catalog, finals: Record<string, number>) {
    const rows: InventoryRow[] = [];
    let armor: { entry: ContentEntry; d: DndItemData } | undefined;
    let shield: { entry: ContentEntry; d: DndItemData } | undefined;
    let totalWeight = 0;
    let totalValue = 0;
    for (const item of c.inventory) {
      const entry = item.contentId ? catalog.get(item.contentId) : undefined;
      const d = (entry?.data ?? {}) as unknown as DndItemData;
      const weight = typeof d.weight === "number" ? Math.round(d.weight * item.quantity * 100) / 100 : undefined;
      if (weight) totalWeight += weight;
      if (typeof d.price === "number") totalValue += d.price * item.quantity;
      const slot = d.category === "armadura" ? "armadura" : d.category === "escudo" ? "escudo" : d.category === "arma" ? "arma" : undefined;
      let effective = true;
      if (item.equipped && entry && slot === "armadura") {
        if (armor) effective = false;
        else armor = { entry, d };
      }
      if (item.equipped && entry && slot === "escudo") {
        if (shield) effective = false;
        else shield = { entry, d };
      }
      rows.push({
        entryId: item.entryId,
        name: item.customName || entry?.name || "Item",
        quantity: item.quantity,
        equipped: item.equipped,
        weight,
        value: d.price,
        slot,
        magic: false,
        effective,
        detail: entry?.summary,
      });
    }
    const str = finals.str ?? 10;
    // Capacidade de carga: Força × 15 libras = Força × 7,5 kg.
    const max = str * 7.5;
    totalWeight = Math.round(totalWeight * 100) / 100;
    return {
      armor,
      shield,
      summary: {
        rows,
        totalWeight,
        totalValue: Math.round(totalValue * 100) / 100,
        money: moneyTotal(c.currency, DND_CURRENCIES),
        load: { light: max, max, state: totalWeight > max ? ("overloaded" as const) : ("normal" as const) },
      },
    };
  }

  /* ---------------- estatísticas ---------------- */

  derive(c: CharacterData, catalog: Catalog): DerivedStats {
    const base = super.derive(c, catalog);
    const level = totalLevel(c);
    const finals = this.finalAbilities(c, catalog);
    const mod = (k: string) => dndModifier(finals[k] ?? 10);
    const prof = dndProficiencyBonus(level);
    const hasAbilities = KEYS.every((k) => c.baseAbilities[k] !== undefined);
    const k = this.classOf(c, catalog);
    const sp = this.speciesOf(c, catalog);
    const inv = this.inventoryEffects(c, catalog, finals);
    const src = this.rulesSource;
    const stats: NonNullable<DerivedStats["stats"]> = [];
    const pending: string[] = [];

    if (!k) pending.push("Escolha uma classe para calcular pontos de vida, testes de resistência e magias.");
    if (!hasAbilities) pending.push("Defina os atributos para calcular os valores da ficha.");

    if (k && hasAbilities) {
      // PV: máximo do dado no 1º nível; depois a média fixa (metade do dado + 1). Sempre ao menos 1 por nível.
      const con = mod("con");
      const avg = k.data.hitDie / 2 + 1;
      const traitIds = new Set([...(sp?.data.traits ?? []), ...((sp?.sub?.data.traits as DndTrait[] | undefined) ?? [])].map((t) => t.id));
      const extra = (sp?.sub ? Number((sp.sub.data as unknown as DndSubspeciesData).hpPerLevel ?? 0) : 0) || (traitIds.has("dwarven-toughness") ? 1 : 0);
      const hp = Math.max(1, k.data.hitDie + con) + Math.max(1, avg + con) * (k.level - 1) + extra * k.level;
      stats.push({
        key: "hp",
        label: "Pontos de vida",
        value: hp,
        detail: `d${k.data.hitDie} + Constituição no 1º nível; ${avg} + Constituição por nível depois (valor fixo)${extra ? `; +${extra} por nível (Robustez Anã)` : ""}.`,
        source: src,
      });
      stats.push({ key: "hitDice", label: "Dados de Vida", value: `${k.level}d${k.data.hitDie}`, source: src });

      // Classe de Armadura.
      const dex = mod("dex");
      const shieldAc = inv.shield ? (inv.shield.d.ac ?? 2) : 0;
      let ac: number;
      let detail: string;
      if (inv.armor) {
        const a = inv.armor.d;
        const dexPart = a.dexBonus ? (a.maxDex !== undefined ? Math.min(dex, a.maxDex) : dex) : 0;
        ac = (a.ac ?? 10) + dexPart + shieldAc;
        detail = `${inv.armor.entry.name} ${a.ac}${a.dexBonus ? ` + Destreza ${signed(dexPart)}${a.maxDex !== undefined ? ` (máx. ${a.maxDex})` : ""}` : ""}`;
      } else if (k.entry.id === "class:barbarian") {
        ac = 10 + dex + mod("con") + shieldAc;
        detail = `Defesa sem Armadura: 10 + Destreza ${signed(dex)} + Constituição ${signed(mod("con"))}`;
      } else if (k.entry.id === "class:monk" && !inv.shield) {
        ac = 10 + dex + mod("wis");
        detail = `Defesa sem Armadura: 10 + Destreza ${signed(dex)} + Sabedoria ${signed(mod("wis"))}`;
      } else {
        ac = 10 + dex + shieldAc;
        detail = `Sem armadura: 10 + Destreza ${signed(dex)}`;
      }
      if (inv.shield) detail += ` + escudo ${signed(shieldAc)}`;
      stats.push({ key: "defense", label: "Classe de Armadura", value: ac, detail: `${detail}. Magias e itens mágicos não estão incluídos.`, source: src });
    }

    if (hasAbilities) {
      stats.push({ key: "initiative", label: "Iniciativa", value: signed(mod("dex")), detail: "Modificador de Destreza.", source: src });
      stats.push({ key: "proficiency", label: "Bônus de proficiência", value: signed(prof), source: src });
    }

    if (sp && typeof sp.data.speed === "number") {
      let speed = sp.data.speed;
      const a = inv.armor?.d;
      const slow = a?.armorType === "pesada" && a.strMin && (finals.str ?? 0) < a.strMin;
      if (slow) speed = Math.max(0, speed - 3);
      stats.push({
        key: "speed",
        label: "Deslocamento",
        value: fmtM(speed),
        detail: slow ? `Reduzido em 3 m: a armadura pesada exige Força ${a!.strMin}.` : undefined,
        source: src,
      });
      stats.push({ key: "size", label: "Tamanho", value: sp.data.size, source: src });
    }

    // Testes de resistência.
    if (hasAbilities) {
      const saves = new Set(k?.data.saves ?? []);
      for (const key of KEYS) {
        const v = mod(key) + (saves.has(key) ? prof : 0);
        stats.push({ key: `save-${key}`, label: `Resistência de ${label(key)}`, value: signed(v), detail: saves.has(key) ? "Proficiente" : undefined, source: src });
      }
    }

    // Conjuração.
    const sc = k?.data.spellcasting;
    if (k && sc && hasAbilities && k.level >= sc.startLevel) {
      const m = mod(sc.ability);
      stats.push({ key: "spellDc", label: "CD das magias", value: 8 + prof + m, detail: `8 + proficiência + ${label(sc.ability)}.`, source: src });
      stats.push({ key: "spellAttack", label: "Ataque mágico", value: signed(prof + m), source: src });
      const slots = (k.row?.slots ?? []).map((n, i) => (n ? `${i + 1}º: ${n}` : "")).filter(Boolean);
      if (slots.length) stats.push({ key: "spellSlots", label: "Espaços de magia", value: slots.join(" · "), source: src });
    }

    // Perícias.
    const trained = this.trainedSkills(c, catalog);
    const skillEntries = catalog.ofKind("skill");
    const skills =
      hasAbilities && skillEntries.length
        ? skillEntries
            .map((e) => {
              const ab = String(e.data.ability);
              const t = trained.has(e.id);
              return { id: e.id, name: e.name, trained: t, value: mod(ab) + (t ? prof : 0) };
            })
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        : undefined;
    const perception = skills?.find((s) => s.id === "skill:perception");
    if (perception) stats.push({ key: "passivePerception", label: "Percepção passiva", value: 10 + perception.value, source: src });

    if (inv.armor?.d.stealthDisadvantage) {
      stats.push({ key: "stealth", label: "Furtividade", value: "Desvantagem", detail: `Por causa de ${inv.armor.entry.name}.`, source: src });
    }

    const abilities = Object.fromEntries(KEYS.map((key) => [key, { score: finals[key], modifier: mod(key) }]));
    return { ...base, abilities, proficiencyBonus: prof, pending, stats, skills, inventory: inv.summary };
  }

  /* ---------------- opções ---------------- */

  evaluateOption(c: CharacterData, entry: ContentEntry, catalog: Catalog): OptionEvaluation {
    const ev = super.evaluateOption(c, entry, catalog);
    if (entry.kind === "subspecies" && c.choices.some((ch) => ch.slot === SLOT_SUBSPECIES && ch.contentId === entry.id)) {
      return { availability: "acquired", issues: [] };
    }
    if (entry.kind === "spell" && ev.availability === "available_now") {
      const lvl = Number(entry.data.level) || 0;
      const k = this.classOf(c, catalog);
      if (k && lvl > 0 && lvl > this.maxSpellLevel(c, catalog)) {
        return {
          availability: "available_later",
          issues: [
            ...ev.issues,
            {
              code: "spell.level_too_high",
              severity: "invalid",
              message: `Magia de ${lvl}º nível: ${k.entry.name} só lança magias desse nível mais adiante.`,
              satisfiableLater: true,
            },
          ],
        };
      }
    }
    return ev;
  }

  /* ---------------- validação comum ---------------- */

  protected validateDnd(c: CharacterData, catalog: Catalog): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const src = this.rulesSource;
    const finals = this.finalAbilities(c, catalog);
    const k = this.classOf(c, catalog);
    const sp = this.speciesOf(c, catalog);

    if (c.classes.length > 1 && !this.multiclassAllowed(c)) {
      issues.push({ code: "class.multiclass", severity: "invalid", message: "Multiclasse é uma regra opcional; ative-a com o mestre antes de usar.", path: "classes", source: src });
    }

    // Subespécie / sub-raça.
    if (sp?.data.subspecies?.length && !sp.sub) {
      issues.push({ code: "species.subspecies_missing", severity: "warning", message: `Escolha a variação de ${sp.entry.name}.`, path: "speciesId", source: sp.entry.source });
    }

    // Subclasse.
    if (k && k.level >= k.data.subclassLevel) {
      if (!k.sub) {
        issues.push({ code: "class.subclass_missing", severity: "warning", message: `${k.entry.name} escolhe a subclasse no ${k.data.subclassLevel}º nível.`, path: "classes", source: k.entry.source });
      } else if (String(k.sub.data.classId) !== k.entry.id) {
        issues.push({ code: "class.subclass_wrong_class", severity: "invalid", message: `${k.sub.name} não é uma subclasse de ${k.entry.name}.`, path: "classes", source: k.sub.source });
      }
    } else if (k?.sub) {
      issues.push({ code: "class.subclass_too_early", severity: "invalid", message: `A subclasse só é escolhida no ${k.data.subclassLevel}º nível.`, path: "classes", source: k.entry.source });
    }

    // Perícias: as da classe saem da lista dela; as do antecedente e da raça vêm prontas.
    if (k) {
      const granted = this.grantedSkills(c, catalog);
      const chosen = c.choices.filter((ch) => ch.contentId.startsWith("skill:") && !granted.has(ch.contentId));
      const outside = chosen.filter((ch) => !k.data.skills.from.includes(ch.contentId));
      const max = k.data.skills.choose + (sp?.data.flexibleSkills ?? 0);
      if (chosen.length > max) {
        issues.push({ code: "skills.too_many", severity: "invalid", message: `${k.entry.name} escolhe ${max} perícia(s); há ${chosen.length} marcada(s).`, path: "choices", source: k.entry.source });
      } else if (chosen.length < k.data.skills.choose) {
        issues.push({ code: "skills.missing", severity: "warning", message: `Escolha mais ${k.data.skills.choose - chosen.length} perícia(s) da lista de ${k.entry.name}.`, path: "choices", source: k.entry.source });
      }
      if (outside.length > (sp?.data.flexibleSkills ?? 0)) {
        issues.push({
          code: "skills.outside_list",
          severity: "warning",
          message: `${outside.map((ch) => catalog.get(ch.contentId)?.name ?? ch.contentId).join(", ")}: fora da lista de ${k.entry.name}.`,
          path: "choices",
          source: k.entry.source,
        });
      }
    }

    // Magias.
    const spells = c.choices.map((ch) => catalog.get(ch.contentId)).filter((e): e is ContentEntry => e?.kind === "spell");
    if (spells.length) {
      const sc = k?.data.spellcasting;
      if (!k || !sc) {
        issues.push({ code: "spells.no_caster", severity: "warning", message: "Sua classe não lança magias; confira se as magias escolhidas vêm de um talento ou traço.", path: "choices" });
      } else {
        const cantrips = spells.filter((s) => Number(s.data.level) === 0).length;
        const leveled = spells.length - cantrips;
        const maxC = k.row?.cantrips ?? 0;
        if (cantrips > maxC) {
          issues.push({ code: "spells.cantrips_over", severity: "warning", message: `${k.entry.name} no ${k.level}º nível conhece ${maxC} truque(s); há ${cantrips} na lista.`, path: "choices", source: k.entry.source });
        }
        const lim = this.spellLimit(c, catalog, finals);
        if (lim && leveled > lim.limit) {
          issues.push({ code: "spells.over", severity: "warning", message: `Limite de magias ${lim.label}: ${lim.limit}; há ${leveled} na lista.`, path: "choices", source: k.entry.source });
        }
      }
    }

    // Aumentos de atributo por nível.
    const budget = this.levelBonusBudget(c, catalog);
    const used = Object.values(c.levelBonuses ?? {}).reduce((t, v) => t + v, 0);
    if (used > budget.points) {
      issues.push({ code: "abilities.level_bonus_over", severity: "invalid", message: `Aumentos de atributo: ${used} ponto(s) usados, ${budget.points} disponíveis. ${budget.detail}`, path: "levelBonuses", source: src });
    }
    if (this.featsUsingAsi(c, catalog).length > this.asiCount(c, catalog)) {
      issues.push({ code: "feats.too_many", severity: "invalid", message: "Cada talento além do de origem ocupa um Aumento no Valor de Habilidade, e não sobram aumentos para tantos talentos.", path: "choices", source: src });
    }
    for (const a of DND_ABILITIES) {
      if ((finals[a.key] ?? 0) > ABILITY_SCORE_MAX) {
        issues.push({ code: "abilities.max_20", severity: "invalid", message: `${a.label} não pode passar de ${ABILITY_SCORE_MAX}.`, path: `abilities.${a.key}`, source: src });
      }
    }

    // Armadura sem proficiência.
    const inv = this.inventoryEffects(c, catalog, finals);
    if (k && inv.armor?.d.armorType && !k.data.armor.includes(inv.armor.d.armorType)) {
      issues.push({ code: "armor.not_proficient", severity: "warning", message: `${k.entry.name} não é proficiente com ${inv.armor.entry.name}: desvantagem em testes e ataques de Força e Destreza, e não pode lançar magias.`, path: "inventory", source: src });
    }
    if (k && inv.shield && !k.data.armor.includes("escudo")) {
      issues.push({ code: "shield.not_proficient", severity: "warning", message: `${k.entry.name} não é proficiente com escudos.`, path: "inventory", source: src });
    }
    if (inv.summary.load.state === "overloaded") {
      issues.push({ code: "inventory.over_capacity", severity: "warning", message: `Carga de ${inv.summary.totalWeight} kg passa da capacidade (${inv.summary.load.max} kg = Força × 7,5).`, path: "inventory", source: src });
    }

    if (c.progressionMode === "xp" && c.experience > 0) {
      const expected = dndLevelForXp(c.experience);
      if (expected !== c.level) {
        issues.push({ code: "progression.xp_level_mismatch", severity: "warning", message: `Com ${c.experience} XP o nível esperado é ${expected}, mas a ficha indica nível ${c.level}.`, path: "level", source: src });
      }
    }
    return issues;
  }
}
