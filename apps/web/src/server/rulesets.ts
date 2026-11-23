import "server-only";
import { db } from "@/server/db";
import { Catalog, getEngine, listEngines, type ContentEntry } from "@rpg-forge/rules-engine";

/** Garante que cada motor registrado tenha seu registro de Ruleset no banco. */
export async function syncRulesets(): Promise<void> {
  for (const e of listEngines()) {
    const m = e.meta;
    const data = {
      name: m.name,
      system: m.system,
      edition: m.edition,
      publisher: m.publisher,
      dataAvailability: m.dataAvailability === "licensed" ? ("licensed" as const) : ("import_required" as const),
    };
    await db.ruleset.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
  }
}

export async function currentRulesetVersion(rulesetId: string) {
  return db.rulesetVersion.findFirst({ where: { rulesetId, isCurrent: true } });
}

type DbContentRow = {
  id: string;
  kind: string;
  name: string;
  summary: string;
  origin: ContentEntry["origin"];
  sourcebookId: string;
  section: string | null;
  page: number | null;
  license: string;
  prerequisites: unknown;
  roles: string[];
  data: unknown;
};

function rowToEntry(r: DbContentRow, edition: string, packVersion: string): ContentEntry {
  return {
    id: r.id,
    kind: r.kind as ContentEntry["kind"],
    name: r.name,
    summary: r.summary,
    origin: r.origin,
    source: {
      sourcebookId: r.sourcebookId,
      edition,
      version: packVersion,
      section: r.section ?? undefined,
      page: r.page ?? undefined,
    },
    license: r.license,
    prerequisites: (r.prerequisites ?? undefined) as ContentEntry["prerequisites"],
    roles: r.roles,
    data: r.data as Record<string, unknown>,
  };
}

/** Carrega o catálogo de uma versão específica (ou da atual), mesclando homebrew da campanha quando informado. */
export async function loadCatalog(rulesetId: string, versionId?: string | null, campaignId?: string | null): Promise<Catalog> {
  const version = versionId
    ? await db.rulesetVersion.findUnique({ where: { id: versionId } })
    : await currentRulesetVersion(rulesetId);
  if (!version) return new Catalog(rulesetId);

  const key = `${rulesetId}:${version.id}`;
  let pending = catalogCache.get(key);
  if (!pending) {
    pending = readCatalog(rulesetId, version);
    catalogCache.set(key, pending);
    pending.catch(() => catalogCache.delete(key));
    while (catalogCache.size > MAX_CACHED_VERSIONS) catalogCache.delete(catalogCache.keys().next().value!);
  } else {
    catalogCache.delete(key);
    catalogCache.set(key, pending);
  }
  const baseCatalog = await pending;
  if (!campaignId) return baseCatalog;

  const hbRows = await db.contentEntry.findMany({ where: { campaignId } });
  if (!hbRows.length) return baseCatalog;
  const edition = getEngine(rulesetId).meta.edition;
  const merged = [...baseCatalog.all(), ...hbRows.map((r) => rowToEntry(r, edition, "homebrew"))];
  return new Catalog(rulesetId, merged);
}

/**
 * Cache em memória por versão do catálogo. Uma versão importada nunca muda (cada importação cria
 * outra versão com outro id), então não há o que invalidar. Evita reler ~1.300 entradas do banco
 * a cada salvamento de ficha.
 */
const MAX_CACHED_VERSIONS = 4;
const catalogCache = new Map<string, Promise<Catalog>>();

async function readCatalog(rulesetId: string, version: { id: string; packVersion: string }): Promise<Catalog> {
  const rows = await db.contentEntry.findMany({ where: { rulesetVersionId: version.id, campaignId: null } });
  const edition = getEngine(rulesetId).meta.edition;
  return new Catalog(
    rulesetId,
    rows.map((r) => rowToEntry(r, edition, version.packVersion)),
  );
}

export interface CompendiumItem {
  id: string;
  rulesetId: string;
  kind: string;
  name: string;
  summary: string;
  text: string;
  page: number | null;
  section: string;
}

/** Carrega as entradas resumidas dos catálogos atuais para o Compêndio pesquisável (/app/regras). */
export async function loadCompendiumData(): Promise<{ rulesetId: string; name: string; version: string; items: CompendiumItem[] }[]> {
  const engines = listEngines();
  const versions = await db.rulesetVersion.findMany({ where: { isCurrent: true } });
  const results = await Promise.all(
    engines.map(async (engine) => {
      const v = versions.find((x) => x.rulesetId === engine.meta.id);
      if (!v) return null;
      const catalog = await loadCatalog(engine.meta.id, v.id);
      const items: CompendiumItem[] = catalog.all().map((e) => {
        const rawText = e.data.text;
        const text = Array.isArray(rawText) ? (rawText as string[]).join("\n\n") : typeof rawText === "string" ? rawText : "";
        return {
          id: e.id,
          rulesetId: engine.meta.id,
          kind: e.kind,
          name: e.name,
          summary: e.summary,
          text,
          page: e.source.page ?? null,
          section: e.source.section ?? "",
        };
      });
      items.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      return {
        rulesetId: engine.meta.id,
        name: engine.meta.name,
        version: v.packVersion,
        items,
      };
    }),
  );
  return results.filter((x): x is NonNullable<typeof x> => x !== null);
}
