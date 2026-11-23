import type { Catalog, InventoryRow } from "@rpg-forge/rules-engine";

/** Grupos das abas do inventário na ficha. */
export type ItemGroup = "arma" | "protecao" | "consumivel" | "ferramenta" | "outro";

const GROUP_OF: Record<string, ItemGroup> = {
  arma: "arma",
  "arma-magica": "arma",
  municao: "arma",
  "simple-weapons": "arma",
  "simple-melee-weapons": "arma",
  "martial-weapons": "arma",
  "martial-melee-weapons": "arma",
  armadura: "protecao",
  "armadura-magica": "protecao",
  escudo: "protecao",
  vestuario: "protecao",
  acessorio: "protecao",
  alquimico: "consumivel",
  alimentacao: "consumivel",
  pocao: "consumivel",
  ferramenta: "ferramenta",
  kit: "ferramenta",
  "arcane-foci": "ferramenta",
  "druidic-foci": "ferramenta",
  "holy-symbols": "ferramenta",
  "musical-instruments": "ferramenta",
};

export interface SheetItem {
  name: string;
  quantity: number;
  equipped: boolean;
  weight?: number;
  detail?: string;
  /** Onde fica equipado: arma, armadura, escudo, acessório... */
  slot?: string;
  group: ItemGroup;
  magic: boolean;
}

export function sheetItems(rows: InventoryRow[] | undefined, catalog: Catalog): SheetItem[] {
  return (rows ?? []).map((r) => {
    const category = catalog.get(r.entryId)?.data.category;
    const group = (typeof category === "string" && GROUP_OF[category]) || (r.slot === "arma" ? "arma" : r.slot ? "protecao" : "outro");
    return { name: r.name, quantity: r.quantity, equipped: r.equipped, weight: r.weight, detail: r.detail, slot: r.slot, group, magic: r.magic };
  });
}

/** XP do próximo nível, para a barra de experiência (undefined no nível máximo). */
export function nextLevelXp(thresholds: number[], level: number): { from: number; to?: number } {
  return { from: thresholds[level - 1] ?? 0, to: thresholds[level] };
}
