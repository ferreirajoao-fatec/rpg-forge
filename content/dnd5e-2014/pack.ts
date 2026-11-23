/**
 * Pacote de conteúdo — D&D 5e (2014), a partir do System Reference Document 5.1 (CC-BY-4.0).
 *
 * Gerado por scripts/srd/build.ts a partir do 5e-database (MIT); a atribuição exigida e as
 * alterações feitas (tradução, unidades métricas) estão em LICENSE.md, nesta pasta.
 *
 * Só é carregado com tradução completa: data/_status.json conta o que falta traduzir.
 * Em desenvolvimento, RPG_FORGE_ALLOW_UNTRANSLATED=1 permite importar mesmo assim.
 */
import type { ContentEntry, ContentPack } from "../../packages/rules-engine/src/core/content";
import status from "./data/_status.json";
import backgrounds from "./data/backgrounds.json";
import classes from "./data/classes.json";
import conditions from "./data/conditions.json";
import equipment from "./data/equipment.json";
import feats from "./data/feats.json";
import skills from "./data/skills.json";
import species from "./data/species.json";
import spells from "./data/spells.json";
import subclasses from "./data/subclasses.json";
import subspecies from "./data/subspecies.json";

if (status.pending > 0 && process.env.RPG_FORGE_ALLOW_UNTRANSLATED !== "1") {
  throw new Error(`D&D 5e (2014): ${status.pending} registro(s) ainda sem tradução (veja data/_status.json). Rode pnpm srd:build.`);
}

/** Atribuição exigida pela CC-BY-4.0 (texto indicado pela Wizards of the Coast). */
const ATTRIBUTION =
  "This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode." +
  " Tradução não oficial para o português e conversão para unidades métricas: RPG Forge.";

const pack: ContentPack = {
  format: "rpg-forge.content-pack",
  formatVersion: 1,
  rulesetId: "dnd5e-2014",
  packVersion: "1.0.0",
  sourcebooks: [
    {
      id: "srd-5.1",
      title: "System Reference Document 5.1",
      publisher: "Wizards of the Coast",
      version: "5.1",
      license: "CC-BY-4.0",
      url: "https://dnd.wizards.com/resources/systems-reference-document",
      attribution: ATTRIBUTION,
    },
  ],
  entries: [species, subspecies, classes, subclasses, backgrounds, feats, skills, spells, equipment, conditions].flat() as ContentEntry[],
};

export default pack;
