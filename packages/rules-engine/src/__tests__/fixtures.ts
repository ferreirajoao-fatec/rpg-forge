/**
 * Conteúdo de TESTE. Não é conteúdo de regras real: ids e nomes são
 * deliberadamente fictícios ("test-*") e marcados como homebrew/test, para
 * exercitar o motor sem afirmar nada sobre os livros.
 */
import type { ContentPack } from "../core/content";

export function testPack(rulesetId: string): ContentPack {
  const source = { sourcebookId: "test-book", edition: "test", version: "0.0.0" };
  return {
    format: "rpg-forge.content-pack",
    formatVersion: 1,
    rulesetId,
    packVersion: "0.0.1",
    sourcebooks: [{ id: "test-book", title: "Livro de testes", publisher: "RPG Forge", version: "0.0.0", license: "test-only" }],
    entries: [
      { id: "class:test-fighter", kind: "class", name: "Guerreiro de Teste", summary: "", origin: "authorized", source, license: "test-only", roles: [], data: {} },
      { id: "class:test-mage", kind: "class", name: "Mago de Teste", summary: "", origin: "authorized", source, license: "test-only", roles: [], data: {} },
      { id: "species:test-elf", kind: "species", name: "Elfo de Teste", summary: "", origin: "authorized", source, license: "test-only", roles: [], data: { abilityBonuses: { dex: 2 } } },
      {
        id: "background:test-sage",
        kind: "background",
        name: "Sábio de Teste",
        summary: "",
        origin: "authorized",
        source,
        license: "test-only",
        roles: [],
        data: { abilityOptions: ["int", "wis", "con"] },
      },
      {
        id: "power:test-lvl6",
        kind: "power",
        name: "Poder de Nível 6",
        summary: "",
        origin: "authorized",
        source,
        license: "test-only",
        roles: [],
        prerequisites: { type: "minLevel", level: 6 },
        data: {},
      },
      {
        id: "spell:test-mage-only",
        kind: "spell",
        name: "Magia Exclusiva de Mago",
        summary: "",
        origin: "authorized",
        source,
        license: "test-only",
        roles: [],
        prerequisites: { type: "hasClass", classId: "class:test-mage" },
        data: {},
      },
      {
        id: "feat:test-elf-only",
        kind: "feat",
        name: "Talento Élfico",
        summary: "",
        origin: "authorized",
        source,
        license: "test-only",
        roles: [],
        prerequisites: { type: "hasSpecies", speciesId: "species:test-elf" },
        data: {},
      },
      {
        id: "feat:test-strong",
        kind: "feat",
        name: "Talento de Força",
        summary: "",
        origin: "authorized",
        source,
        license: "test-only",
        roles: [],
        prerequisites: { type: "minAbility", ability: "str", value: 13 },
        data: {},
      },
      { id: "feat:test-homebrew", kind: "feat", name: "Talento Caseiro", summary: "", origin: "homebrew", source, license: "test-only", roles: [], data: {} },
    ],
  };
}
