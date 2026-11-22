import type { CharacterData, InventoryItem } from "../core/character";
import type { ContentEntry } from "../core/content";
import type { Catalog, CurrencyDef, InventoryRow, InventorySummary } from "../core/engine";
import { moneyTotal } from "../core/money";
import type { SourceRef, ValidationIssue } from "../core/types";

/**
 * Inventário do Tormenta20 (2020): armaduras e escudos (p. 148), carga (p. 154),
 * itens superiores (p. 155), materiais especiais (p. 157) e itens mágicos (p. 319–321).
 */

// Mesmo formato de t20Source (tormenta20.ts importa este módulo; evitamos import circular).
const src = (page: number, section: string): SourceRef => ({ sourcebookId: "t20-2020", edition: "2020", version: "1ª edição (2020)", page, section });
const ARMOR_SRC = src(148, "Armaduras & Escudos");
const LOAD_SRC = src(154, "Carga");
const SUPERIOR_SRC = src(155, "Itens Superiores");
const MAGIC_SRC = src(319, "Itens Mágicos");
const WEALTH_SRC = src(138, "Equipamento Inicial");

/** Moedas (p. 138). Os preços do catálogo estão na moeda padrão. */
export const T20_CURRENCIES: CurrencyDef[] = [
  { key: "mc", label: "Moedas de cobre", abbr: "MC", value: 0.1 },
  { key: "m", label: "Moedas", abbr: "M", value: 1 },
  { key: "mo", label: "Moedas de ouro", abbr: "MO", value: 10 },
];

/** Dinheiro inicial por nível (p. 138). O 1º nível rola 4d6. */
export const T20_STARTING_WEALTH = [
  0, 0, 300, 600, 1000, 2000, 3000, 5000, 7000, 10000, 13000,
  19000, 27000, 36000, 49000, 66000, 88000, 110000, 150000, 200000, 260000,
];

export function t20StartingWealth(level: number): { amount?: number; formula?: string } {
  if (level <= 1) return { formula: "4d6" };
  return { amount: T20_STARTING_WEALTH[Math.min(level, 20)] };
}

/** Itens do equipamento inicial que todo personagem recebe (p. 138). */
export const T20_STARTING_KIT = ["equipment:mochila", "equipment:saco-de-dormir", "equipment:traje-de-viajante"];

/** Mesmas tabelas de tormenta20.ts (aumento de preço por número de modificações / encantos). */
const MOD_PRICE = [0, 100, 1000, 3000, 6000, 10000, 30000];
const ENCH_PRICE = [0, 10000, 20000, 45000, 70000];
const MAGIC_LIMIT = 3;

export interface T20ItemData {
  category: string;
  price?: number;
  weight?: number;
  proficiency?: string;
  grip?: string;
  defense?: number;
  armorPenalty?: number;
  armorType?: "leve" | "pesada" | "escudo";
  target?: string;
  encantos?: number;
  requiresEnchantment?: string;
  materialCost?: Record<string, number | null>;
  tier?: string;
  baseItemId?: string;
  modifications?: string[];
  enchantments?: string[];
  materialId?: string;
  bonuses?: { target: string; value: number; stacks?: boolean; noArmor?: boolean }[];
}

const dataOf = (e: ContentEntry | undefined) => e?.data as unknown as T20ItemData | undefined;

/** Categorias que se equipam e o espaço que ocupam. */
function slotOf(d: T20ItemData, base?: T20ItemData): string | undefined {
  switch (d.category) {
    case "arma":
    case "arma-magica":
      return "arma";
    case "armadura":
      return "armadura";
    case "escudo":
      return "escudo";
    case "armadura-magica":
      return base?.category === "escudo" ? "escudo" : "armadura";
    case "acessorio":
      return "acessorio";
    case "vestuario":
      return "vestuario";
    case "artefato":
      return "artefato";
    default:
      return undefined;
  }
}

export const T20_PROFICIENCY_LABEL: Record<string, string> = {
  simples: "armas simples",
  marciais: "armas marciais",
  exoticas: "armas exóticas",
  fogo: "armas de fogo",
};

/** Item resolvido: dados do catálogo + melhorias da ficha. */
interface Resolved {
  item: InventoryItem;
  entry?: ContentEntry;
  data?: T20ItemData;
  /** Arma, armadura ou escudo de base (o próprio item, ou o item base de um item mágico específico). */
  base?: T20ItemData;
  baseEntry?: ContentEntry;
  mods: ContentEntry[];
  enchants: ContentEntry[];
  material?: ContentEntry;
  slot?: string;
  magic: boolean;
}

function resolve(item: InventoryItem, catalog: Catalog): Resolved {
  const entry = item.contentId ? catalog.get(item.contentId) : undefined;
  const data = dataOf(entry);
  const baseEntry = data?.baseItemId ? catalog.get(data.baseItemId) : entry;
  const base = data?.baseItemId ? dataOf(baseEntry) : data;
  const ids = (own: string[] | undefined, extra: string[]) => [...(own ?? []), ...extra];
  const mods = ids(data?.modifications, item.modifications).map((id) => catalog.get(id)).filter((e): e is ContentEntry => !!e);
  const enchants = ids(data?.enchantments, item.enchantments).map((id) => catalog.get(id)).filter((e): e is ContentEntry => !!e);
  const matId = item.materialId ?? data?.materialId;
  const material = matId ? catalog.get(matId) : undefined;
  const slot = data ? slotOf(data, base) : undefined;
  const magic = !!data && (["arma-magica", "armadura-magica", "acessorio", "artefato"].includes(data.category) || enchants.length > 0);
  return { item, entry, data, base, baseEntry, mods, enchants, material, slot, magic };
}

const has = (list: ContentEntry[], id: string) => list.some((e) => e.id === id);
const encantoCount = (list: ContentEntry[]) => list.reduce((s, e) => s + (dataOf(e)?.encantos ?? 1), 0);

/** Valor unitário: preço do item, ou preço base + modificações + encantos + material. */
function unitValue(r: Resolved): number | undefined {
  if (!r.data) return undefined;
  if (r.data.price === undefined) return undefined;
  const extraMods = r.item.modifications.length + (r.item.materialId ? 1 : 0);
  const extraEnch = encantoCount(r.enchants.filter((e) => r.item.enchantments.includes(e.id)));
  if (!extraMods && !extraEnch) return r.data.price;
  // Itens específicos já incluem as melhorias próprias no preço; somamos só o aumento das novas.
  const ownMods = (r.data.modifications?.length ?? 0) + (r.data.materialId ? 1 : 0);
  const ownEnch = encantoCount(r.enchants.filter((e) => r.data!.enchantments?.includes(e.id)));
  const m = Math.min(ownMods + extraMods, MOD_PRICE.length - 1);
  const n = Math.min(ownEnch + extraEnch, ENCH_PRICE.length - 1);
  let value = r.data.price + MOD_PRICE[m] - MOD_PRICE[Math.min(ownMods, MOD_PRICE.length - 1)] + ENCH_PRICE[n] - ENCH_PRICE[Math.min(ownEnch, ENCH_PRICE.length - 1)];
  if (r.item.materialId && r.material) {
    const kind = materialKind(r.base);
    value += (kind && dataOf(r.material)?.materialCost?.[kind]) || 0;
  }
  return value;
}

function materialKind(base?: T20ItemData): string | undefined {
  if (!base) return undefined;
  if (base.category === "arma") return "arma";
  if (base.category === "escudo") return "escudo";
  if (base.category === "armadura") return base.armorType === "pesada" ? "armadura-pesada" : "armadura-leve";
  return undefined;
}

function unitWeight(r: Resolved): number | undefined {
  const w = r.data?.weight ?? r.base?.weight;
  if (w === undefined) return undefined;
  // Mitral tem metade do peso do aço (p. 157).
  return r.material?.id === "equipment:mitral" ? w / 2 : w;
}

export interface T20InventoryEffects {
  summary: InventorySummary;
  /** Bônus em atributos dos itens equipados (por chave). */
  abilityBonuses: Record<string, number>;
  /** Partes da Defesa vindas do equipamento. */
  armorDefense: number;
  shieldDefense: number;
  itemDefense: number;
  /** Destreza máxima aplicada na Defesa (undefined = sem limite). */
  maxDexToDefense?: number;
  /** Penalidade de armadura total (número ≤ 0), já com a de carga. */
  armorPenalty: number;
  /** Penalidade aplicada em todas as perícias de For e Des por falta de proficiência. */
  nonProficientPenalty: number;
  speedPenalty: number;
  saveBonus: number;
  /** Nomes dos itens que contribuíram, para o detalhe das estatísticas. */
  notes: string[];
  issues: ValidationIssue[];
}

/**
 * Calcula os efeitos do inventário. `strength` é a Força sem itens (a carga soma os bônus de
 * Força dos itens equipados); `proficiencies` usa os nomes do livro ("armas marciais", "escudos").
 */
export function t20Inventory(
  c: CharacterData,
  catalog: Catalog,
  opts: { strength?: number; proficiencies: Set<string> },
): T20InventoryEffects {
  const issues: ValidationIssue[] = [];
  const notes: string[] = [];
  const resolved = c.inventory.map((i) => resolve(i, catalog));

  // Limite de itens mágicos: armas empunhadas não contam; artefatos seguem regras próprias.
  let magicCount = 0;
  const ineffective = new Set<string>();
  for (const r of resolved) {
    if (!r.item.equipped || !r.magic || r.slot === "arma" || r.slot === "artefato") continue;
    magicCount++;
    if (magicCount > MAGIC_LIMIT) ineffective.add(r.item.entryId);
  }
  if (magicCount > MAGIC_LIMIT) {
    issues.push({
      code: "inventory.magic_limit",
      severity: "warning",
      message: `Há ${magicCount} itens mágicos equipados (armaduras, escudos e acessórios). Só ${MAGIC_LIMIT} funcionam ao mesmo tempo; os excedentes ficam sem efeito.`,
      path: "inventory",
      source: MAGIC_SRC,
    });
  }

  let armor: Resolved | undefined;
  let shield: Resolved | undefined;
  const abilityBonuses: Record<string, number> = {};
  let itemDefense = 0;
  let bracelets = 0;
  let accessorySave = 0;
  let saveBonus = 0;

  for (const r of resolved) {
    const name = r.entry?.name ?? r.item.customName ?? "Item";
    if (r.item.contentId && !r.entry) {
      issues.push({ code: "inventory.unknown_item", severity: "invalid", message: `O item "${r.item.contentId}" não existe neste sistema.`, path: "inventory" });
      continue;
    }
    issues.push(...improvementIssues(r, name));
    if (!r.item.equipped || !r.data || ineffective.has(r.item.entryId)) continue;

    if (r.slot === "armadura") {
      if (armor) {
        issues.push({ code: "inventory.two_armors", severity: "invalid", message: `Não é possível vestir duas armaduras (${armor.entry?.name} e ${name}).`, path: "inventory", source: ARMOR_SRC });
        continue;
      }
      armor = r;
    } else if (r.slot === "escudo") {
      if (shield) {
        issues.push({ code: "inventory.two_shields", severity: "invalid", message: `Não é possível usar dois escudos (${shield.entry?.name} e ${name}).`, path: "inventory", source: ARMOR_SRC });
        continue;
      }
      shield = r;
    }

    // Proficiência com armas, armaduras e escudos.
    if (r.slot === "arma" && r.base?.proficiency) {
      const need = T20_PROFICIENCY_LABEL[r.base.proficiency] ?? r.base.proficiency;
      const ok = opts.proficiencies.has(need) || (r.base.proficiency !== "simples" && r.base.proficiency !== "marciais" && opts.proficiencies.has("proficiencia"));
      if (!ok) {
        issues.push({
          code: "inventory.weapon_not_proficient",
          severity: "warning",
          message: `${name}: exige proficiência com ${need}. Sem ela, você sofre –5 nos testes de ataque com a arma.`,
          path: "inventory",
          source: src(140, "Proficiência"),
        });
      } else if (need === "armas exóticas" || need === "armas de fogo") {
        issues.push({
          code: "inventory.weapon_check_proficiency",
          severity: "warning",
          message: `${name}: confira se o poder Proficiência foi escolhido para esta arma.`,
          path: "inventory",
          source: src(140, "Proficiência"),
        });
      }
    }

    // Bônus fixos de itens mágicos (acessórios e itens específicos).
    for (const b of r.data.bonuses ?? []) {
      if (b.target.startsWith("ability:")) {
        const k = b.target.slice(8);
        abilityBonuses[k] = Math.max(abilityBonuses[k] ?? 0, b.value);
      } else if (b.target === "defense") {
        if (b.stacks) bracelets = Math.max(bracelets, b.value);
        else itemDefense = Math.max(itemDefense, b.value);
      } else if (b.target === "saves") {
        accessorySave = Math.max(accessorySave, b.value);
      }
      notes.push(name);
    }
  }

  // Armadura e escudo: bônus, penalidade, Destreza máxima.
  const piece = (r: Resolved | undefined) => {
    if (!r?.base) return { defense: 0, penalty: 0, save: 0 };
    let defense = r.base.defense ?? 0;
    let penalty = r.base.armorPenalty ?? 0;
    let save = 0;
    if (has(r.mods, "equipment:reforcada")) {
      defense += 1;
      penalty -= 1;
    }
    if (has(r.mods, "equipment:ajustada")) penalty += 1;
    if (has(r.mods, "equipment:sob-medida")) penalty += 2;
    if (r.material?.id === "equipment:mitral") penalty += 2;
    if (has(r.mods, "equipment:selada")) save += 1;
    if (has(r.enchants, "equipment:defensor")) defense += 2;
    if (has(r.enchants, "equipment:guardiao")) defense += 4;
    if (has(r.enchants, "equipment:protetor")) save += 2;
    return { defense, penalty: Math.min(0, penalty), save };
  };
  const a = piece(armor);
  const s = piece(shield);
  saveBonus = a.save + s.save + accessorySave;
  let armorDefense = a.defense;
  if (bracelets > armorDefense) {
    // "Cumulativo com outros itens mágicos, mas não com armaduras": vale o maior.
    armorDefense = bracelets;
  }
  if (armor) notes.push(armor.entry!.name);
  if (shield) notes.push(shield.entry!.name);

  let maxDexToDefense: number | undefined;
  let speedPenalty = 0;
  if (armor?.base?.armorType === "pesada") {
    maxDexToDefense = 0;
    if (has(armor.mods, "equipment:delicada")) maxDexToDefense = 1;
    if (armor.material?.id === "equipment:mitral") maxDexToDefense = 2;
    speedPenalty += 3;
  }

  // Sem proficiência: a penalidade de armadura vale em todas as perícias de Força e Destreza.
  let nonProficientPenalty = 0;
  if (armor?.base?.armorType === "pesada" && !opts.proficiencies.has("armaduras pesadas")) {
    nonProficientPenalty += a.penalty;
    issues.push({
      code: "inventory.armor_not_proficient",
      severity: "warning",
      message: `${armor.entry!.name}: sem proficiência com armaduras pesadas, a penalidade de armadura vale em todas as perícias de Força e Destreza.`,
      path: "inventory",
      source: ARMOR_SRC,
    });
  }
  if (shield && !opts.proficiencies.has("escudos")) {
    nonProficientPenalty += s.penalty;
    issues.push({
      code: "inventory.shield_not_proficient",
      severity: "warning",
      message: `${shield.entry!.name}: sem proficiência com escudos, a penalidade de armadura vale em todas as perícias de Força e Destreza.`,
      path: "inventory",
      source: ARMOR_SRC,
    });
  }

  // Linhas e totais.
  const rows: InventoryRow[] = resolved.map((r) => {
    const w = unitWeight(r);
    const v = unitValue(r);
    const detail = [
      ...r.mods.map((m) => m.name.split(" (")[0]),
      ...r.enchants.map((e) => e.name),
      ...(r.material ? [r.material.name] : []),
    ].join(", ");
    return {
      entryId: r.item.entryId,
      name: r.entry?.name ?? r.item.customName ?? "Item sem nome",
      quantity: r.item.quantity,
      equipped: r.item.equipped,
      weight: w === undefined ? undefined : round(w * r.item.quantity),
      value: v,
      slot: r.slot,
      magic: r.magic,
      effective: !ineffective.has(r.item.entryId),
      detail: detail || undefined,
    };
  });
  const totalWeight = round(rows.reduce((t, r) => t + (r.weight ?? 0), 0));
  const totalValue = round(rows.reduce((t, r) => t + (r.value ?? 0) * r.quantity, 0));
  const money = moneyTotal(c.currency, T20_CURRENCIES);

  let armorPenalty = a.penalty + s.penalty;
  let load: InventorySummary["load"];
  if (opts.strength !== undefined) {
    const str = opts.strength + (abilityBonuses.for ?? 0);
    const light = Math.max(0, str * 3);
    const max = Math.max(0, str * 10);
    const state = totalWeight > max ? "overloaded" : totalWeight > light ? "encumbered" : "normal";
    load = { light, max, state };
    if (state !== "normal") {
      armorPenalty -= 2;
      speedPenalty += 3;
    }
    if (state === "encumbered") {
      issues.push({
        code: "inventory.encumbered",
        severity: "warning",
        message: `Carga de ${fmtKg(totalWeight)} acima de ${fmtKg(light)} (3 × Força): penalidade de armadura –2 e deslocamento –3m.`,
        path: "inventory",
        source: LOAD_SRC,
      });
    } else if (state === "overloaded") {
      issues.push({
        code: "inventory.overloaded",
        severity: "invalid",
        message: `Carga de ${fmtKg(totalWeight)} acima do máximo de ${fmtKg(max)} (10 × Força).`,
        path: "inventory",
        source: LOAD_SRC,
      });
    }
  }

  return {
    summary: { rows, totalWeight, totalValue, money, load },
    abilityBonuses,
    armorDefense,
    shieldDefense: s.defense,
    itemDefense,
    maxDexToDefense,
    armorPenalty,
    nonProficientPenalty,
    speedPenalty,
    saveBonus,
    notes: [...new Set(notes)],
    issues,
  };
}

/** Modificações, encantos e material aplicados pela ficha precisam combinar com o item. */
function improvementIssues(r: Resolved, name: string): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!r.item.modifications.length && !r.item.enchantments.length && !r.item.materialId) return out;
  const kind = r.base?.category;
  const isGear = kind === "arma" || kind === "armadura" || kind === "escudo";
  const bad = (message: string, source: SourceRef = SUPERIOR_SRC) =>
    out.push({ code: "inventory.improvement_invalid", severity: "invalid", message: `${name}: ${message}`, path: "inventory", source });

  for (const id of r.item.modifications) {
    const m = r.mods.find((e) => e.id === id);
    const t = dataOf(m)?.target;
    if (!m) bad(`a modificação "${id}" não existe.`);
    else if (t === "arma" && kind !== "arma") bad(`${m.name} só se aplica a armas.`);
    else if (t === "armadura-escudo" && kind !== "armadura" && kind !== "escudo") bad(`${m.name} só se aplica a armaduras e escudos.`);
    else if (t === "outro" && !r.data) bad(`${m.name} exige um item do catálogo.`);
  }
  const totalMods = r.mods.length + (r.material ? 1 : 0);
  if (totalMods > MOD_PRICE.length - 1) bad(`no máximo ${MOD_PRICE.length - 1} modificações por item.`);
  if (r.item.materialId) {
    if (!r.material) bad(`o material "${r.item.materialId}" não existe.`);
    else if (!isGear) bad("materiais especiais só se aplicam a armas, armaduras e escudos.");
    else if (dataOf(r.material)?.materialCost?.[materialKind(r.base) ?? ""] == null) bad(`${r.material.name} não pode ser usado neste tipo de item.`);
  }
  for (const id of r.item.enchantments) {
    const e = r.enchants.find((x) => x.id === id);
    const d = dataOf(e);
    if (!e || !d) {
      bad(`o encanto "${id}" não existe.`, MAGIC_SRC);
      continue;
    }
    if (d.target === "arma" && kind !== "arma") bad(`${e.name} só se aplica a armas.`, MAGIC_SRC);
    else if (d.target === "escudo" && kind !== "escudo") bad(`${e.name} só se aplica a escudos.`, MAGIC_SRC);
    else if (d.target === "armadura-escudo" && kind !== "armadura" && kind !== "escudo") bad(`${e.name} só se aplica a armaduras e escudos.`, MAGIC_SRC);
    if (d.requiresEnchantment && !has(r.enchants, d.requiresEnchantment)) {
      bad(`${e.name} exige o encanto ${d.requiresEnchantment.replace("equipment:", "")}.`, MAGIC_SRC);
    }
  }
  if (encantoCount(r.enchants) > ENCH_PRICE.length - 1) bad(`no máximo ${ENCH_PRICE.length - 1} encantos por item.`, MAGIC_SRC);
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
const fmtKg = (n: number) => `${String(round(n)).replace(".", ",")}kg`;

/** Valor de venda: metade do preço (p. 138). */
export const t20SaleValue = (price: number) => round(price / 2);

/** Fonte usada pela interface ao exibir o dinheiro inicial. */
export const T20_WEALTH_SOURCE = WEALTH_SRC;
