import { describe, expect, it } from "vitest";
import { Catalog, getEngine, type Rng } from "../index";
import { generateCompleteCharacter } from "./generator";

function makeRng(seq: number[]): Rng {
  let i = 0;
  return (sides: number) => {
    const v = seq[i % seq.length];
    i += 1;
    return ((v - 1) % sides) + 1;
  };
}

describe("generateCompleteCharacter", () => {
  it("generates a valid Ordem Paranormal character across multiple seeds", () => {
    const engine = getEngine("ordem-paranormal-1e");
    const catalog = new Catalog("ordem-paranormal-1e", [
      {
        id: "class:combatente",
        kind: "class",
        name: "Combatente",
        summary: "Combatente",
        origin: "official",
        source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" },
        license: "proprietary",
        roles: [],
        data: {
          hp: { initial: 20, perLevel: 4, addAbilityPerLevel: true },
          pe: { initial: 2, perLevel: 2, addAbilityPerLevel: true },
          san: { initial: 12, perLevel: 3 },
          skills: { fixed: [], oneOf: [["skill:luta", "skill:pontaria"], ["skill:fortitude", "skill:reflexos"]], choose: 1, intBonus: true },
          proficiencies: ["armas táticas"],
          subclassLevel: 2,
          asiLevels: [4],
          powerLevels: [3],
          trainingLevels: [7],
          features: [],
        },
      },
      {
        id: "origin:policial",
        kind: "origin",
        name: "Policial",
        summary: "Policial",
        origin: "official",
        source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" },
        license: "proprietary",
        roles: [],
        data: { skills: ["skill:percepcao", "skill:pontaria"], power: { name: "Patrulha", summary: "+2 Defesa", text: "+2 Defesa" } },
      },
      { id: "skill:luta", kind: "skill", name: "Luta", summary: "", origin: "official", source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" }, license: "proprietary", roles: [], data: { ability: "for" } },
      { id: "skill:pontaria", kind: "skill", name: "Pontaria", summary: "", origin: "official", source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" }, license: "proprietary", roles: [], data: { ability: "agi" } },
      { id: "skill:fortitude", kind: "skill", name: "Fortitude", summary: "", origin: "official", source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" }, license: "proprietary", roles: [], data: { ability: "vig" } },
      { id: "skill:reflexos", kind: "skill", name: "Reflexos", summary: "", origin: "official", source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" }, license: "proprietary", roles: [], data: { ability: "agi" } },
      { id: "skill:percepcao", kind: "skill", name: "Percepção", summary: "", origin: "official", source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" }, license: "proprietary", roles: [], data: { ability: "pre" } },
      { id: "skill:atletismo", kind: "skill", name: "Atletismo", summary: "", origin: "official", source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" }, license: "proprietary", roles: [], data: { ability: "for" } },
      { id: "skill:vontade", kind: "skill", name: "Vontade", summary: "", origin: "official", source: { sourcebookId: "op-core-1.1", edition: "1", version: "1.1" }, license: "proprietary", roles: [], data: { ability: "pre" } },
    ]);

    const c = generateCompleteCharacter(engine, catalog, makeRng([1, 2, 1, 3, 2, 1, 2, 1, 1, 2, 3]));
    const report = engine.validate(c, catalog);
    expect(c.name.length).toBeGreaterThan(0);
    expect(c.classes[0]?.classId).toBe("class:combatente");
    expect(c.backgroundId).toBe("origin:policial");
    expect(report.issues.filter((i) => i.severity === "invalid")).toEqual([]);
  });

  it("generates a valid Tormenta20 character with species, class and origin", () => {
    const engine = getEngine("tormenta20-2020");
    const catalog = new Catalog("tormenta20-2020", [
      {
        id: "species:humano",
        kind: "species",
        name: "Humano",
        summary: "Versátil",
        origin: "official",
        source: { sourcebookId: "t20-2020", edition: "2020", version: "1" },
        license: "OGL",
        roles: [],
        data: { flexibleBonus: { count: 3, amount: 2 }, size: "Médio", speed: 9 },
      },
      {
        id: "class:guerreiro",
        kind: "class",
        name: "Guerreiro",
        summary: "Combatente",
        origin: "official",
        source: { sourcebookId: "t20-2020", edition: "2020", version: "1" },
        license: "OGL",
        roles: [],
        data: {
          hp: { initial: 20, perLevel: 5 },
          mpPerLevel: 3,
          skills: { fixed: ["skill:luta"], choose: 2, from: ["skill:atletismo", "skill:fortitude", "skill:iniciativa"] },
          proficiencies: ["armas marciais"],
        },
      },
      {
        id: "origin:soldado",
        kind: "origin",
        name: "Soldado",
        summary: "Ex-militar",
        origin: "official",
        source: { sourcebookId: "t20-2020", edition: "2020", version: "1" },
        license: "OGL",
        roles: [],
        data: { benefitsToChoose: 2, skillOptions: ["skill:fortitude", "skill:luta", "skill:guerra"], powerOptions: ["Estilo de Arma e Escudo"] },
      },
      { id: "skill:luta", kind: "skill", name: "Luta", summary: "", origin: "official", source: { sourcebookId: "t20-2020", edition: "2020", version: "1" }, license: "OGL", roles: [], data: { ability: "for" } },
      { id: "skill:fortitude", kind: "skill", name: "Fortitude", summary: "", origin: "official", source: { sourcebookId: "t20-2020", edition: "2020", version: "1" }, license: "OGL", roles: [], data: { ability: "con" } },
      { id: "skill:atletismo", kind: "skill", name: "Atletismo", summary: "", origin: "official", source: { sourcebookId: "t20-2020", edition: "2020", version: "1" }, license: "OGL", roles: [], data: { ability: "for" } },
      { id: "skill:iniciativa", kind: "skill", name: "Iniciativa", summary: "", origin: "official", source: { sourcebookId: "t20-2020", edition: "2020", version: "1" }, license: "OGL", roles: [], data: { ability: "des" } },
      { id: "skill:guerra", kind: "skill", name: "Guerra", summary: "", origin: "official", source: { sourcebookId: "t20-2020", edition: "2020", version: "1" }, license: "OGL", roles: [], data: { ability: "int" } },
    ]);

    const c = generateCompleteCharacter(engine, catalog, makeRng([1, 2, 3, 1, 2, 3, 1, 2, 3]));
    const report = engine.validate(c, catalog);
    expect(c.speciesId).toBe("species:humano");
    expect(Object.keys(c.assignedBonuses)).toHaveLength(3);
    expect(report.issues.filter((i) => i.severity === "invalid")).toEqual([]);
  });

  it("generates a valid D&D 5e 2014 character", () => {
    const engine = getEngine("dnd5e-2014");
    const catalog = new Catalog("dnd5e-2014", [
      {
        id: "species:elf",
        kind: "species",
        name: "Elfo",
        summary: "Ágil",
        origin: "official",
        source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" },
        license: "CC-BY-4.0",
        roles: [],
        data: { abilityBonuses: { dex: 2 }, size: "Médio", speed: 9, skills: ["skill:perception"] },
      },
      {
        id: "class:fighter",
        kind: "class",
        name: "Guerreiro",
        summary: "Marcial",
        origin: "official",
        source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" },
        license: "CC-BY-4.0",
        roles: [],
        data: {
          hitDie: 10,
          saves: ["str", "con"],
          armor: ["leve", "media", "pesada", "escudo"],
          subclassLevel: 3,
          levels: [{ level: 1, asi: false }],
          skills: { choose: 2, from: ["skill:athletics", "skill:intimidation", "skill:perception"] },
        },
      },
      {
        id: "background:acolyte",
        kind: "background",
        name: "Acólito",
        summary: "Templo",
        origin: "official",
        source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" },
        license: "CC-BY-4.0",
        roles: [],
        data: { skills: ["skill:insight", "skill:religion"] },
      },
      { id: "skill:athletics", kind: "skill", name: "Atletismo", summary: "", origin: "official", source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" }, license: "CC-BY-4.0", roles: [], data: { ability: "str" } },
      { id: "skill:intimidation", kind: "skill", name: "Intimidação", summary: "", origin: "official", source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" }, license: "CC-BY-4.0", roles: [], data: { ability: "cha" } },
      { id: "skill:perception", kind: "skill", name: "Percepção", summary: "", origin: "official", source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" }, license: "CC-BY-4.0", roles: [], data: { ability: "wis" } },
      { id: "skill:insight", kind: "skill", name: "Intuição", summary: "", origin: "official", source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" }, license: "CC-BY-4.0", roles: [], data: { ability: "wis" } },
      { id: "skill:religion", kind: "skill", name: "Religião", summary: "", origin: "official", source: { sourcebookId: "srd-5.1", edition: "2014", version: "5.1" }, license: "CC-BY-4.0", roles: [], data: { ability: "int" } },
    ]);

    const c = generateCompleteCharacter(engine, catalog, makeRng([1, 2, 3, 4, 5, 6, 1, 2]));
    const report = engine.validate(c, catalog);
    expect(c.classes[0]?.classId).toBe("class:fighter");
    expect(report.issues.filter((i) => i.severity === "invalid")).toEqual([]);
  });
});
