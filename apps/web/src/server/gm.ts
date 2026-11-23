import "server-only";
import { getEngine, type CharacterData } from "@rpg-forge/rules-engine";
import { treasureTablesSchema, type TreasureTables } from "@rpg-forge/rules-engine/systems/tormenta20-gm";
import { currentRulesetVersion, loadCatalog } from "@/server/rulesets";
import { db } from "@/server/db";

/** Sistemas que trazem conteúdo de mestre (ameaças, perigos, regras, encontros e condições). */
export const GM_RULESET = "tormenta20-2020";
export const GM_RULESETS = ["tormenta20-2020", "ordem-paranormal-1e", "dnd5e-2014"] as const;
export type GmRulesetId = (typeof GM_RULESETS)[number];

export interface GmCreature {
  id: string;
  name: string;
  nd: string;
  vd?: number | null;
  element?: string;
  defense?: number | null;
  hp?: number | null;
  initiative?: number | null;
  presence?: string;
  enigma?: string;
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
  kind: "hazard" | "rule" | "condition" | "spell" | "equipment";
  name: string;
  summary: string;
  text: string;
  category: string;
  nd: string | null;
  page: number | null;
  section: string;
}

const str = (v: unknown) => {
  if (Array.isArray(v)) return v.join("\n\n");
  return typeof v === "string" ? v : v == null ? "" : String(v);
};

/** Dados do mestre da versão atual do catálogo, em formato simples para o cliente. */
export async function loadGmData(rulesetId: GmRulesetId = GM_RULESET) {
  const version = await currentRulesetVersion(rulesetId);
  if (!version) return null;
  const catalog = await loadCatalog(rulesetId, version.id);
  const creatures: GmCreature[] = catalog.ofKind("creature").map((e) => {
    const d = e.data as Record<string, unknown>;
    return {
      id: e.id,
      name: e.name,
      nd: str(d.nd),
      vd: typeof d.vd === "number" ? d.vd : null,
      element: typeof d.element === "string" ? d.element : undefined,
      defense: typeof d.defense === "number" ? d.defense : null,
      hp: typeof d.hp === "number" ? d.hp : null,
      initiative: typeof d.initiative === "number" ? d.initiative : null,
      presence: typeof d.presence === "string" ? d.presence : undefined,
      enigma: typeof d.enigma === "string" ? d.enigma : undefined,
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
  const kinds: GmEntry["kind"][] =
    rulesetId === "dnd5e-2014"
      ? ["condition", "spell", "equipment"]
      : ["hazard", "rule", "condition"];
  const entries: GmEntry[] = kinds.flatMap((kind) =>
    catalog
      .ofKind(kind)
      .filter((e) => kind !== "rule" || (str(e.data.text).length > 0 && e.data.category !== "tabela"))
      .map((e) => ({
        id: e.id,
        kind,
        name: e.name,
        summary: e.summary,
        text: str(e.data.text),
        category:
          kind === "hazard"
            ? str(e.data.hazardType)
            : kind === "rule"
              ? str(e.data.category)
              : kind === "spell"
                ? `Nível ${e.data.level ?? 0}`
                : kind === "equipment"
                  ? str(e.data.category || "equipamento")
                  : "condicao",
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

export interface GmPartyMember {
  id: string;
  name: string;
  levelLabel: string;
  hp: number;
  defense: number | null;
  initFormula: string;
}

export interface GmParty {
  campaignId: string;
  campaignName: string;
  members: GmPartyMember[];
}

/** Carrega os personagens das campanhas onde o usuário é mestre, prontos para o rastreador de combate. */
export async function loadGmCampaignParties(userId: string, rulesetId: GmRulesetId): Promise<GmParty[]> {
  const campaigns = await db.campaign.findMany({
    where: {
      rulesetId,
      members: { some: { userId, role: "gm" } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      characters: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, level: true, data: true, rulesetVersionId: true },
      },
    },
  });
  if (!campaigns.length) return [];

  const engine = getEngine(rulesetId);
  const versionIds = [...new Set(campaigns.flatMap((c) => c.characters.map((ch) => ch.rulesetVersionId)).filter((x): x is string => !!x))];
  const catalogs = new Map(await Promise.all(versionIds.map(async (vid) => [vid, await loadCatalog(rulesetId, vid)] as const)));
  const fallbackCatalog = await loadCatalog(rulesetId);

  return campaigns.map((c) => ({
    campaignId: c.id,
    campaignName: c.name,
    members: c.characters.map((ch) => {
      const data = ch.data as unknown as CharacterData;
      const catalog = (ch.rulesetVersionId && catalogs.get(ch.rulesetVersionId)) || fallbackCatalog;
      const derived = engine.derive(data, catalog);
      const statVal = (k: string) => {
        const s = derived.stats?.find((x) => x.key === k)?.value;
        return typeof s === "number" ? s : Number(s);
      };
      const hpRaw = statVal("hp");
      const defRaw = statVal("defense");
      const ini = derived.skills?.find((sk) => sk.id === "skill:iniciativa");
      const initFormula = ini?.dice ?? `1d20${(ini?.value ?? 0) >= 0 ? `+${ini?.value ?? 0}` : ini?.value ?? 0}`;
      return {
        id: ch.id,
        name: ch.name || "Sem nome",
        levelLabel: engine.formatLevel ? engine.formatLevel(derived.level, data) : `Nível ${derived.level}`,
        hp: Number.isFinite(hpRaw) && hpRaw > 0 ? hpRaw : 10,
        defense: Number.isFinite(defRaw) ? defRaw : null,
        initFormula,
      };
    }),
  }));
}
