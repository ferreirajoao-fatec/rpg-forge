import "server-only";
import { treasureTablesSchema, type TreasureTables } from "@rpg-forge/rules-engine/systems/tormenta20-gm";
import { currentRulesetVersion, loadCatalog } from "@/server/rulesets";

/** Por ora só o Tormenta20 (2020) traz ameaças, perigos e tabelas de tesouro no pacote. */
export const GM_RULESET = "tormenta20-2020";

export interface GmCreature {
  id: string;
  name: string;
  nd: string;
  type: string;
  size: string;
  group: string;
  level: number | null;
  treasure: string;
  text: string;
  actions: { name: string; text: string; cost?: string }[];
  page: number | null;
}
export interface GmEntry {
  id: string;
  kind: "hazard" | "rule" | "condition";
  name: string;
  summary: string;
  text: string;
  category: string;
  nd: string | null;
  page: number | null;
  section: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Dados do mestre da versão atual do catálogo, em formato simples para o cliente. */
export async function loadGmData() {
  const version = await currentRulesetVersion(GM_RULESET);
  if (!version) return null;
  const catalog = await loadCatalog(GM_RULESET, version.id);
  const creatures: GmCreature[] = catalog.ofKind("creature").map((e) => {
    const d = e.data as Record<string, unknown>;
    return {
      id: e.id,
      name: e.name,
      nd: str(d.nd),
      type: str(d.creatureType),
      size: str(d.size),
      group: str(d.group),
      level: typeof d.level === "number" ? d.level : null,
      treasure: str(d.treasure),
      text: str(d.text),
      actions: Array.isArray(d.actions) ? (d.actions as GmCreature["actions"]) : [],
      page: e.source.page ?? null,
    };
  });
  const entries: GmEntry[] = (["hazard", "rule", "condition"] as const).flatMap((kind) =>
    catalog
      .ofKind(kind)
      .filter((e) => kind !== "rule" || (str(e.data.text).length > 0 && e.data.category !== "tabela"))
      .map((e) => ({
        id: e.id,
        kind,
        name: e.name,
        summary: e.summary,
        text: str(e.data.text),
        category: kind === "hazard" ? str(e.data.hazardType) : kind === "rule" ? str(e.data.category) : "condicao",
        nd: e.data.nd ? str(e.data.nd) : null,
        page: e.source.page ?? null,
        section: e.source.section ?? "",
      })),
  );
  return { packVersion: version.packVersion, creatures, entries };
}

export async function loadTreasureTables(): Promise<TreasureTables | null> {
  const catalog = await loadCatalog(GM_RULESET);
  const entry = catalog.get("rule:tabelas-de-tesouro");
  if (!entry) return null;
  return treasureTablesSchema.parse(entry.data.treasure);
}
