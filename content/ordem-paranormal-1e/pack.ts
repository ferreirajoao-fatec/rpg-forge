/**
 * Pacote de conteúdo — Ordem Paranormal RPG (1ª edição v1.1 + Sobrevivendo ao Horror v1.3.1).
 *
 * Gerado localmente a partir dos PDFs do usuário via:
 *   python scripts/ordem-paranormal/extract.py "<ordem-paranormal-rpg-v1-1.pdf>" "[<sobrevivendo-ao-horror-v1-3-1.pdf>]"
 *
 * ATENÇÃO: Ordem Paranormal RPG é uma obra proprietária da Jambô Editora / Cellbit
 * (não possui licença aberta OGL/CC). Os JSONs em `./data/` ficam fora do Git:
 * use este pacote apenas localmente após extrair dos seus próprios PDFs.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentEntry, ContentPack } from "../../packages/rules-engine/src/core/content";

const DATA_FILES = [
  "skills.json",
  "origins.json",
  "classes.json",
  "subclasses.json",
  "features.json",
  "powers.json",
  "spells.json",
  "equipment.json",
  "conditions.json",
  "creatures.json",
  "hazards.json",
  "gm-rules.json",
] as const;

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "data");

function loadDataFile(filename: string): ContentEntry[] {
  const full = join(dataDir, filename);
  if (!existsSync(full)) return [];
  return JSON.parse(readFileSync(full, "utf8")) as ContentEntry[];
}

const pack: ContentPack = {
  format: "rpg-forge.content-pack",
  formatVersion: 1,
  rulesetId: "ordem-paranormal-1e",
  packVersion: "1.1.1",
  sourcebooks: [
    {
      id: "op-core-1.1",
      title: "Ordem Paranormal RPG — Livro de Regras",
      publisher: "Jambô Editora",
      version: "1.1",
      license: "Proprietário (importação local)",
    },
    {
      id: "op-sah-1.3.1",
      title: "Ordem Paranormal RPG — Sobrevivendo ao Horror",
      publisher: "Jambô Editora",
      version: "1.3.1",
      license: "Proprietário (importação local)",
    },
  ],
  entries: DATA_FILES.flatMap(loadDataFile),
};

export default pack;
