/**
 * Importa um pacote de conteúdo (JSON) como nova versão do catálogo.
 *   npm run content:import -- caminho/do/pacote.json ["changelog"]
 *   npm run content:import -- content/tormenta20-2020/pack.ts ["changelog"]
 * Pacotes em .ts devem exportar o pacote como `default`.
 * Use --dry-run para apenas validar.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getEngine, validateContentPack } from "../src/rules";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const [file, changelog = ""] = args.filter((a) => a !== "--dry-run");
  if (!file) throw new Error("Informe o caminho do pacote JSON.");

  const input = /\.(ts|mts|js|mjs)$/.test(file)
    ? await import(pathToFileURL(path.resolve(file)).href).then((m) => m.default?.default ?? m.default)
    : JSON.parse(await readFile(file, "utf8"));
  const result = validateContentPack(input);
  if (!result.ok || !result.pack) {
    console.error("Pacote inválido:\n- " + result.errors.join("\n- "));
    process.exit(1);
  }
  const pack = result.pack;
  getEngine(pack.rulesetId);
  console.log(`Pacote válido: ${pack.rulesetId} v${pack.packVersion} (${pack.entries.length} entradas).`);
  if (dry) return;

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const engine = getEngine(pack.rulesetId);
    await db.ruleset.upsert({
      where: { id: pack.rulesetId },
      update: {},
      create: {
        id: engine.meta.id,
        name: engine.meta.name,
        system: engine.meta.system,
        edition: engine.meta.edition,
        publisher: engine.meta.publisher,
        dataAvailability: engine.meta.dataAvailability === "licensed" ? "licensed" : "import_required",
      },
    });
    await db.$transaction(async (tx) => {
      for (const b of pack.sourcebooks) {
        const data = { title: b.title, publisher: b.publisher, version: b.version, license: b.license, url: b.url, attribution: b.attribution };
        await tx.sourcebook.upsert({ where: { id: b.id }, create: { id: b.id, rulesetId: pack.rulesetId, ...data }, update: data });
      }
      await tx.rulesetVersion.updateMany({ where: { rulesetId: pack.rulesetId }, data: { isCurrent: false } });
      const v = await tx.rulesetVersion.create({ data: { rulesetId: pack.rulesetId, packVersion: pack.packVersion, changelog, isCurrent: true } });
      await tx.contentEntry.createMany({
        data: pack.entries.map((e) => ({
          id: e.id,
          rulesetVersionId: v.id,
          kind: e.kind,
          name: e.name,
          summary: e.summary,
          origin: e.origin,
          sourcebookId: e.source.sourcebookId,
          section: e.source.section,
          page: e.source.page,
          license: e.license,
          prerequisites: e.prerequisites ?? undefined,
          roles: e.roles,
          data: e.data as object,
        })),
      });
    });
    console.log("Importado como versão atual. Personagens existentes continuam na versão anterior até migração explícita.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
