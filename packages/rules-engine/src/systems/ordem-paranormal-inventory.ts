import type { CharacterData, InventoryItem } from "../core/character";
import type { ContentEntry } from "../core/content";
import type { Catalog, CategoryBudget, InventoryRow, InventorySummary } from "../core/engine";
import type { SourceRef, ValidationIssue } from "../core/types";

/**
 * Inventário de Ordem Paranormal RPG (Capítulo 3, p. 51–67; Itens Amaldiçoados, p. 144–151):
 *  - Patente e Pontos de Prestígio (Tabela 3.1, p. 52);
 *  - Limite de itens por Categoria (0, I, II, III, IV);
 *  - Capacidade de carga em espaços: 5 × Força (mínimo 2 se FOR 0), máximo o dobro (sobrecarga: –5 Defesa/carga, –3m);
 *  - Modificações (+I na categoria cada) e Maldições (+II a primeira, +I as seguintes; elementos opressores proibidos);
 *  - Proteções e Escudo (Defesa, RD, penalidade de carga e proficiência).
 */

const OP_BOOK = { sourcebookId: "op-core-1.1", edition: "1ª edição", version: "1.1" } as const;
const opSrc = (page: number, section: string): SourceRef => ({ ...OP_BOOK, page, section });

const PATENTE_SRC = opSrc(52, "Patente");
const LOAD_SRC = opSrc(53, "Capacidade de Carga");
const ARMOR_SRC = opSrc(62, "Proteções");
const MOD_SRC = opSrc(60, "Modificações");
const CURSE_SRC = opSrc(144, "Itens Amaldiçoados");

export const OP_CATEGORY_ROMAN = ["0", "I", "II", "III", "IV", "V", "VI"] as const;

export function formatOpCategory(cat: number): string {
  const n = Math.max(0, Math.trunc(cat));
  return OP_CATEGORY_ROMAN[n] ?? String(n);
}

export interface OpRankDef {
  id: string;
  label: string;
  minPrestige: number;
  credit: string;
  limits: Record<number, number>;
  cursedAllowed: boolean;
}

/** Tabela 3.1: Patentes (p. 52). */
export const OP_RANKS: OpRankDef[] = [
  { id: "recruta", label: "Recruta", minPrestige: 0, credit: "Baixo", limits: { 1: 2, 2: 0, 3: 0, 4: 0 }, cursedAllowed: false },
  { id: "operador", label: "Operador", minPrestige: 20, credit: "Médio", limits: { 1: 3, 2: 1, 3: 0, 4: 0 }, cursedAllowed: false },
  { id: "agente-especial", label: "Agente Especial", minPrestige: 50, credit: "Médio", limits: { 1: 3, 2: 2, 3: 1, 4: 0 }, cursedAllowed: true },
  { id: "oficial-de-operacoes", label: "Oficial de Operações", minPrestige: 100, credit: "Alto", limits: { 1: 3, 2: 3, 3: 2, 4: 1 }, cursedAllowed: true },
  { id: "agente-de-elite", label: "Agente de Elite", minPrestige: 200, credit: "Ilimitado", limits: { 1: 3, 2: 3, 3: 3, 4: 2 }, cursedAllowed: true },
];

const CREDIT_ORDER = ["Baixo", "Médio", "Alto", "Ilimitado"] as const;

export function rankForPrestige(prestige: number, creditBump = 0): { rank: OpRankDef; nextPrestige?: number; credit: string } {
  const pp = Math.max(0, Math.floor(prestige || 0));
  let idx = 0;
  for (let i = 0; i < OP_RANKS.length; i++) {
    if (pp >= OP_RANKS[i].minPrestige) idx = i;
  }
  const rank = OP_RANKS[idx];
  const nextPrestige = OP_RANKS[idx + 1]?.minPrestige;
  const cIdx = CREDIT_ORDER.indexOf(rank.credit as (typeof CREDIT_ORDER)[number]);
  const credit = CREDIT_ORDER[Math.min(CREDIT_ORDER.length - 1, Math.max(0, cIdx) + creditBump)];
  return { rank, nextPrestige, credit };
}

/** Elementos opressores (p. 118): não podem coexistir no mesmo item amaldiçoado. */
export const OP_OPPOSING_ELEMENT: Record<string, string> = {
  sangue: "conhecimento",
  conhecimento: "energia",
  energia: "morte",
  morte: "sangue",
};

export function areOpposingElements(a: string, b: string): boolean {
  return OP_OPPOSING_ELEMENT[a] === b || OP_OPPOSING_ELEMENT[b] === a;
}

export interface OpItemData {
  category: string;
  itemCategory?: number;
  spaces?: number;
  weight?: number;
  damage?: string;
  critical?: string;
  range?: string;
  damageType?: string;
  proficiency?: string;
  weaponType?: string;
  grip?: string;
  handGrip?: string;
  agile?: boolean;
  automatic?: boolean;
  defense?: number;
  armorPenalty?: number;
  damageReduction?: number;
  armorType?: "leve" | "pesada" | "escudo";
  extraSpaces?: number;
  target?: string;
  element?: string;
  cursed?: boolean;
  effectSummary?: string;
}

const dataOf = (e: ContentEntry | undefined) => e?.data as unknown as OpItemData | undefined;

function slotOf(d: OpItemData): string | undefined {
  switch (d.category) {
    case "arma":
      return "arma";
    case "armadura":
      return "armadura";
    case "escudo":
      return "escudo";
    case "acessorio":
      return "acessorio";
    case "vestuario":
      return "vestuario";
    case "paranormal":
    case "item-amaldicoado":
      return "acessorio";
    default:
      return undefined;
  }
}

export interface OpInventoryEffects {
  summary: InventorySummary;
  abilityBonuses: Record<string, number>;
  armorDefense: number;
  shieldDefense: number;
  itemDefense: number;
  damageReduction: number;
  loadPenalty: number;
  speedPenalty: number;
  speedBonus: number;
  ritualDcBonus: number;
  hpBonus: number;
  peBonus: number;
  notes: string[];
  issues: ValidationIssue[];
}

export function opInventory(
  c: CharacterData,
  catalog: Catalog,
  opts: {
    strength?: number;
    intellect?: number;
    proficiencies: Set<string>;
    isSurvivor?: boolean;
    creditBump?: number;
    /** Técnico NEX 10% (Inventário Otimizado) ou Inventário Organizado soma INT à carga. */
    addIntToSpaces?: boolean;
    /** Técnico NEX 40% (Remendão): equipamentos gerais reduzem categoria em I. */
    reduceGeneralCategory?: boolean;
    /** Tanque de Guerra: +2 Defesa e +2 RD em proteção pesada. */
    warTank?: boolean;
    /** Ferramentas Paranormais: reduz categoria de 1 item paranormal em I. */
    paranormalToolsDiscount?: boolean;
  },
): OpInventoryEffects {
  const issues: ValidationIssue[] = [];
  const notes: string[] = [];

  const prestige = Math.max(0, Math.floor(c.currency.pp ?? 0));
  const { rank, nextPrestige, credit } = rankForPrestige(prestige, opts.creditBump ?? 0);

  let armorEntry: { item: InventoryItem; entry: ContentEntry; data: OpItemData; mods: ContentEntry[]; curses: ContentEntry[] } | undefined;
  let shieldEntry: { item: InventoryItem; entry: ContentEntry; data: OpItemData; mods: ContentEntry[]; curses: ContentEntry[] } | undefined;

  const abilityBonuses: Record<string, number> = {};
  let itemDefense = 0;
  let speedBonus = 0;
  let ritualDcBonus = 0;
  let hpBonus = 0;
  let peBonus = 0;
  let extraSpacesFromItems = 0;
  let vestimentaCount = 0;
  let usedParanormalDiscount = false;

  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const rows: InventoryRow[] = [];
  let totalSpaces = 0;

  for (const item of c.inventory) {
    const entry = item.contentId ? catalog.get(item.contentId) : undefined;
    const d = dataOf(entry);
    const name = item.customName || entry?.name || "Item";

    if (item.contentId && !entry) {
      issues.push({
        code: "inventory.unknown_item",
        severity: "invalid",
        message: `O item "${item.contentId}" não existe neste sistema.`,
        path: "inventory",
      });
      continue;
    }

    const mods = item.modifications.map((id) => catalog.get(id)).filter((e): e is ContentEntry => !!e);
    const curses = item.enchantments.map((id) => catalog.get(id)).filter((e): e is ContentEntry => !!e);
    const isCursed = Boolean(d?.cursed || curses.length > 0);
    const slot = d ? slotOf(d) : undefined;

    // Espaços unitários
    let unitSpaces = d?.spaces ?? d?.weight ?? 1;
    if (mods.some((m) => m.id === "equipment:mod-discreta")) unitSpaces = Math.max(0, unitSpaces - 1);
    if (mods.some((m) => m.id === "equipment:mod-reforcada")) unitSpaces += 1;
    if (mods.some((m) => m.id === "equipment:mod-blindada")) unitSpaces += 1;
    const rowSpaces = round(unitSpaces * item.quantity);
    totalSpaces += rowSpaces;

    if (d?.extraSpaces) extraSpacesFromItems += d.extraSpaces;

    // Categoria efetiva: base + 1 por modificação + (2 na 1ª maldição + 1 nas seguintes)
    let effCat = d?.itemCategory ?? 0;
    effCat += mods.length;
    if (curses.length > 0) effCat += 2 + (curses.length - 1);
    if (opts.reduceGeneralCategory && d && ["acessorio", "vestuario", "explosivo", "item", "alquimico", "paranormal"].includes(d.category)) {
      effCat = Math.max(0, effCat - 1);
    }
    if (opts.paranormalToolsDiscount && !usedParanormalDiscount && d?.category === "paranormal" && effCat > 0) {
      effCat -= 1;
      usedParanormalDiscount = true;
    }

    // Validação de modificações e maldições
    if (mods.some((m) => m.id === "equipment:mod-reforcada") && mods.some((m) => m.id === "equipment:mod-discreta")) {
      issues.push({
        code: "inventory.mod_conflict",
        severity: "invalid",
        message: `${name}: uma proteção não pode ser Reforçada e Discreta ao mesmo tempo.`,
        path: "inventory",
        source: ARMOR_SRC,
      });
    }
    for (const m of mods) {
      const target = dataOf(m)?.target;
      if (target === "arma" && d?.category !== "arma" && entry?.id !== "equipment:soqueira") {
        issues.push({ code: "inventory.mod_target", severity: "invalid", message: `${name}: ${m.name} só se aplica a armas.`, path: "inventory", source: MOD_SRC });
      } else if (target === "arma-fogo" && d?.weaponType !== "fogo") {
        issues.push({ code: "inventory.mod_target", severity: "invalid", message: `${name}: ${m.name} só se aplica a armas de fogo.`, path: "inventory", source: MOD_SRC });
      } else if (target === "municao" && d?.category !== "municao") {
        issues.push({ code: "inventory.mod_target", severity: "invalid", message: `${name}: ${m.name} só se aplica a munições.`, path: "inventory", source: MOD_SRC });
      } else if (target === "protecao-pesada" && d?.armorType !== "pesada") {
        issues.push({ code: "inventory.mod_target", severity: "invalid", message: `${name}: ${m.name} só se aplica a proteções pesadas.`, path: "inventory", source: ARMOR_SRC });
      } else if (target === "protecao" && d?.category !== "armadura" && d?.category !== "escudo") {
        issues.push({ code: "inventory.mod_target", severity: "invalid", message: `${name}: ${m.name} só se aplica a proteções.`, path: "inventory", source: ARMOR_SRC });
      } else if (target === "acessorio" && d?.category !== "acessorio" && d?.category !== "vestuario") {
        issues.push({ code: "inventory.mod_target", severity: "invalid", message: `${name}: ${m.name} só se aplica a acessórios e vestimentas.`, path: "inventory", source: MOD_SRC });
      }
    }

    // Elementos opressores nas maldições do mesmo item
    const curseElems = curses.map((cu) => dataOf(cu)?.element).filter((x): x is string => Boolean(x && x !== "variavel"));
    for (let i = 0; i < curseElems.length; i++) {
      for (let j = i + 1; j < curseElems.length; j++) {
        if (areOpposingElements(curseElems[i], curseElems[j])) {
          issues.push({
            code: "inventory.opposing_curses",
            severity: "invalid",
            message: `${name}: não pode combinar maldições de elementos opressores (${curseElems[i]} e ${curseElems[j]}).`,
            path: "inventory",
            source: CURSE_SRC,
          });
        }
      }
    }

    if (isCursed && !rank.cursedAllowed && !opts.isSurvivor && item.quantity > 0) {
      issues.push({
        code: "inventory.cursed_rank",
        severity: "invalid",
        message: `${name}: itens amaldiçoados só são liberados a partir da patente Agente Especial (atual: ${rank.label}).`,
        path: "inventory",
        source: CURSE_SRC,
      });
    }

    if (effCat > 4 && item.quantity > 0) {
      issues.push({
        code: "inventory.category_over_4",
        severity: "invalid",
        message: `${name}: categoria efetiva ${formatOpCategory(effCat)} ultrapassa o limite IV (reduza a categoria com uma habilidade ou remova melhorias).`,
        path: "inventory",
        source: PATENTE_SRC,
      });
    } else if (effCat >= 1 && item.quantity > 0) {
      counts[effCat] = (counts[effCat] ?? 0) + item.quantity;
    }

    // Efeitos de itens equipados
    let effective = true;
    if (item.equipped && d && entry) {
      if (slot === "armadura") {
        if (armorEntry) {
          effective = false;
          issues.push({
            code: "inventory.two_armors",
            severity: "invalid",
            message: `Não é possível vestir duas proteções ao mesmo tempo (${armorEntry.entry.name} e ${name}).`,
            path: "inventory",
            source: ARMOR_SRC,
          });
        } else {
          armorEntry = { item, entry, data: d, mods, curses };
        }
      } else if (slot === "escudo") {
        if (shieldEntry) {
          effective = false;
          issues.push({
            code: "inventory.two_shields",
            severity: "invalid",
            message: `Não é possível usar dois escudos ao mesmo tempo (${shieldEntry.entry.name} e ${name}).`,
            path: "inventory",
            source: ARMOR_SRC,
          });
        } else {
          shieldEntry = { item, entry, data: d, mods, curses };
        }
      } else if (d.category === "vestuario") {
        vestimentaCount++;
        if (vestimentaCount > 2) {
          effective = false;
          issues.push({
            code: "inventory.vestimenta_limit",
            severity: "warning",
            message: "Você só recebe benefícios de no máximo 2 vestimentas ao mesmo tempo.",
            path: "inventory",
            source: opSrc(63, "Acessórios"),
          });
        }
      }

      // Proficiência com armas
      if (slot === "arma" && d.proficiency) {
        const need = d.proficiency === "taticas" ? "armas táticas" : d.proficiency === "pesadas" ? "armas pesadas" : "armas simples";
        if (!opts.proficiencies.has(need)) {
          issues.push({
            code: "inventory.weapon_not_proficient",
            severity: "warning",
            message: `${name}: exige proficiência com ${need}. Sem ela, você sofre –2d20 nos testes de ataque.`,
            path: "inventory",
            source: opSrc(54, "Armas"),
          });
        }
      }

      // Maldições com bônus passivos em itens equipados
      if (effective) {
        for (const cu of curses) {
          switch (cu.id) {
            case "equipment:maldicao-repulsora":
              itemDefense = Math.max(itemDefense, 2);
              notes.push(`${name} (Repulsora)`);
              break;
            case "equipment:maldicao-defesa-maldicao":
              itemDefense = Math.max(itemDefense, 5);
              notes.push(`${name} (Defesa)`);
              break;
            case "equipment:maldicao-destreza":
              abilityBonuses.agi = Math.max(abilityBonuses.agi ?? 0, 1);
              break;
            case "equipment:maldicao-pujanca":
              abilityBonuses.for = Math.max(abilityBonuses.for ?? 0, 1);
              break;
            case "equipment:maldicao-disposicao":
              abilityBonuses.vig = Math.max(abilityBonuses.vig ?? 0, 1);
              break;
            case "equipment:maldicao-sagacidade":
              abilityBonuses.int = Math.max(abilityBonuses.int ?? 0, 1);
              break;
            case "equipment:maldicao-carisma":
              abilityBonuses.pre = Math.max(abilityBonuses.pre ?? 0, 1);
              break;
            case "equipment:maldicao-potencia":
              ritualDcBonus = Math.max(ritualDcBonus, 1);
              break;
            case "equipment:maldicao-vitalidade":
              hpBonus = Math.max(hpBonus, 15);
              break;
            case "equipment:maldicao-esforco-adicional":
              peBonus = Math.max(peBonus, 5);
              break;
            case "equipment:maldicao-lepida":
              speedBonus = Math.max(speedBonus, 3);
              break;
          }
        }
      }
    }

    const detailParts = [
      `Cat. ${formatOpCategory(effCat)}`,
      ...mods.map((m) => m.name),
      ...curses.map((cu) => cu.name),
    ];
    rows.push({
      entryId: item.entryId,
      name,
      quantity: item.quantity,
      equipped: item.equipped,
      weight: rowSpaces,
      itemCategory: effCat,
      slot,
      magic: isCursed,
      effective,
      detail: detailParts.join(" · "),
    });
  }

  // Proteção e Escudo: Defesa, RD e penalidade de carga/proficiência
  let armorDefense = 0;
  let shieldDefense = 0;
  let damageReduction = 0;
  let loadPenalty = 0;

  if (armorEntry) {
    armorDefense = armorEntry.data.defense ?? 0;
    damageReduction = armorEntry.data.damageReduction ?? 0;
    if (armorEntry.mods.some((m) => m.id === "equipment:mod-reforcada")) armorDefense += 2;
    if (armorEntry.mods.some((m) => m.id === "equipment:mod-blindada")) damageReduction = Math.max(damageReduction, 5);
    if (armorEntry.curses.some((cu) => cu.id === "equipment:maldicao-cinetica")) {
      armorDefense += 2;
      damageReduction += armorEntry.data.armorType === "pesada" ? 5 : 2;
    }
    if (armorEntry.curses.some((cu) => cu.id === "equipment:maldicao-letargica")) armorDefense += 2;
    if (armorEntry.data.armorType === "pesada" && opts.warTank) {
      armorDefense += 2;
      damageReduction += 2;
    }
    loadPenalty += armorEntry.data.armorPenalty ?? 0;
    notes.push(armorEntry.entry.name);

    const need = armorEntry.data.armorType === "pesada" ? "proteções pesadas" : "proteções leves";
    if (!opts.proficiencies.has(need)) {
      issues.push({
        code: "inventory.armor_not_proficient",
        severity: "warning",
        message: `${armorEntry.entry.name}: exige proficiência com ${need}. Sem ela, você sofre –2d20 em testes de Força e Agilidade.`,
        path: "inventory",
        source: ARMOR_SRC,
      });
    }
  }

  if (shieldEntry) {
    shieldDefense = shieldEntry.data.defense ?? 2;
    if (shieldEntry.mods.some((m) => m.id === "equipment:mod-reforcada")) shieldDefense += 2;
    if (shieldEntry.curses.some((cu) => cu.id === "equipment:maldicao-cinetica")) {
      shieldDefense += 2;
      damageReduction += 2;
    }
    if (shieldEntry.curses.some((cu) => cu.id === "equipment:maldicao-letargica")) shieldDefense += 2;
    notes.push(shieldEntry.entry.name);
    if (!opts.proficiencies.has("proteções pesadas")) {
      issues.push({
        code: "inventory.shield_not_proficient",
        severity: "warning",
        message: "Escudo exige proficiência com proteções pesadas. Sem ela, você sofre –2d20 em testes de Força e Agilidade.",
        path: "inventory",
        source: ARMOR_SRC,
      });
    }
  }

  // Validação de Limite de Itens por Categoria (Patente ou Sobrevivente)
  const limits = opts.isSurvivor ? { 1: 1, 2: 0, 3: 0, 4: 0 } : rank.limits;
  for (const cat of [1, 2, 3, 4] as const) {
    const used = counts[cat] ?? 0;
    const lim = limits[cat] ?? 0;
    if (used > lim) {
      issues.push({
        code: `inventory.category_${cat}_over`,
        severity: "invalid",
        message: opts.isSurvivor
          ? `Sobreviventes podem levar no máximo ${lim} item de categoria ${formatOpCategory(cat)} (atual: ${used}).`
          : `Na patente ${rank.label}, o limite de itens de categoria ${formatOpCategory(cat)} é ${lim} (atual: ${used}).`,
        path: "inventory",
        source: PATENTE_SRC,
      });
    }
  }

  // Capacidade de carga em espaços (p. 53)
  let load: InventorySummary["load"];
  let speedPenalty = 0;
  totalSpaces = round(totalSpaces);
  if (opts.strength !== undefined) {
    const str = opts.strength + (abilityBonuses.for ?? 0);
    const intVal = opts.addIntToSpaces ? Math.max(0, (opts.intellect ?? 0) + (abilityBonuses.int ?? 0)) : 0;
    const baseSpaces = str <= 0 ? 2 : str * 5;
    const light = baseSpaces + intVal * 5 + extraSpacesFromItems;
    const max = light * 2;
    const state = totalSpaces > max ? "overloaded" : totalSpaces > light ? "encumbered" : "normal";
    load = { light, max, state };
    if (state !== "normal") {
      loadPenalty -= 5;
      speedPenalty += 3;
    }
    if (state === "encumbered") {
      issues.push({
        code: "inventory.encumbered",
        severity: "warning",
        message: `Sobrecarregado (${totalSpaces} de ${light} espaços): –5 na Defesa e em perícias de carga, e –3m de deslocamento.`,
        path: "inventory",
        source: LOAD_SRC,
      });
    } else if (state === "overloaded") {
      issues.push({
        code: "inventory.overloaded",
        severity: "invalid",
        message: `Carga (${totalSpaces} espaços) acima do limite máximo de ${max} espaços (dobro da capacidade).`,
        path: "inventory",
        source: LOAD_SRC,
      });
    }
  }

  const categoryBudget: CategoryBudget = {
    rank: opts.isSurvivor ? "Sobrevivente (Civil)" : rank.label,
    credit: opts.isSurvivor ? "Pessoal" : credit,
    prestige,
    nextPrestige: opts.isSurvivor ? undefined : nextPrestige,
    counts,
    limits,
    cursedAllowed: opts.isSurvivor ? false : rank.cursedAllowed,
    isSurvivor: opts.isSurvivor,
  };

  return {
    summary: {
      rows,
      totalWeight: totalSpaces,
      totalValue: 0,
      money: prestige,
      loadUnit: "espaços",
      load,
      categoryBudget,
    },
    abilityBonuses,
    armorDefense,
    shieldDefense,
    itemDefense,
    damageReduction,
    loadPenalty,
    speedPenalty,
    speedBonus,
    ritualDcBonus,
    hpBonus,
    peBonus,
    notes: [...new Set(notes)],
    issues,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
