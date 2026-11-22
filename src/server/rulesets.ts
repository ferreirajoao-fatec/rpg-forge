import "server-only";
import { db } from "@/server/db";
import { Catalog, getEngine, listEngines, type ContentEntry } from "@/rules";

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

/** Carrega o catálogo de uma versão específica (ou da atual). */
export async function loadCatalog(rulesetId: string, versionId?: string | null): Promise<Catalog> {
  const version = versionId
    ? await db.rulesetVersion.findUnique({ where: { id: versionId } })
    : await currentRulesetVersion(rulesetId);
  if (!version) return new Catalog(rulesetId);
  const rows = await db.contentEntry.findMany({ where: { rulesetVersionId: version.id, campaignId: null } });
  const entries: ContentEntry[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as ContentEntry["kind"],
    name: r.name,
    summary: r.summary,
    origin: r.origin,
    source: {
      sourcebookId: r.sourcebookId,
      edition: getEngine(rulesetId).meta.edition,
      version: version.packVersion,
      section: r.section ?? undefined,
      page: r.page ?? undefined,
    },
    license: r.license,
    prerequisites: (r.prerequisites ?? undefined) as ContentEntry["prerequisites"],
    roles: r.roles,
    data: r.data as Record<string, unknown>,
  }));
  return new Catalog(rulesetId, entries);
}
