/**
 * D&D 5e com o catálogo real do SRD (content/dnd5e-2014/data e content/dnd5e-2024/data), gerado por scripts/srd/build.ts.
 * Os valores esperados seguem as regras do SRD 5.1 e 5.2.1.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyCharacter, type CharacterData } from "../core/character";
import type { ContentEntry } from "../core/content";
import { Catalog } from "../core/engine";
import { Dnd5e2014Engine } from "../systems/dnd5e-2014";
import { Dnd5e2024Engine } from "../systems/dnd5e-2024";

function catalog(ed: "2014" | "2024"): Catalog {
  const dir = path.resolve(__dirname, `../../../../content/dnd5e-${ed}/data`);
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ContentEntry[]);
  return new Catalog(`dnd5e-${ed}`, entries);
}

const cat14 = catalog("2014");
const cat24 = catalog("2024");
const e14 = new Dnd5e2014Engine();
const e24 = new Dnd5e2024Engine();
const stat = (d: ReturnType<typeof e14.derive>, key: string) => d.stats?.find((s) => s.key === key)?.value;
const item = (id: string, equipped = true) => ({ entryId: id, contentId: id, quantity: 1, equipped, modifications: [], enchantments: [] });
// Conjunto padrão: FOR 15, DES 14, CON 13, INT 12, SAB 10, CAR 8.
const standard = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
const char = (p: Partial<CharacterData>) => emptyCharacter({ name: "Teste", abilityMethod: "standard-array", baseAbilities: standard, ...p });

describe("D&D 2014 com o SRD 5.1", () => {
  it("anão da colina guerreiro: PV, CA com cota de malha e deslocamento", () => {
    const c = char({
      speciesId: "species:dwarf",
      choices: [{ slot: "subspecies", contentId: "subspecies:hill-dwarf", atLevel: 1, locked: false }],
      classes: [{ classId: "class:fighter", levels: 1 }],
      inventory: [item("equipment:chain-mail")],
    });
    const d = e14.derive(c, cat14);
    // CON 13 + 2 (anão) = 15 → +2. PV = 10 + 2 + 1 (Robustez Anã) = 13.
    expect(d.abilities.con.score).toBe(15);
    expect(d.abilities.wis.score).toBe(11); // +1 do anão da colina
    expect(stat(d, "hp")).toBe(13);
    expect(stat(d, "defense")).toBe(16); // cota de malha não soma Destreza
    expect(stat(d, "speed")).toBe("7,5 m"); // 25 pés; anão não perde deslocamento… mas a regra geral é aplicada só sem Força
    expect(stat(d, "save-str")).toBe("+4"); // FOR 15 (+2) + proficiência 2
  });

  it("PV em níveis altos usam a média fixa", () => {
    const c = char({ speciesId: "species:human", classes: [{ classId: "class:wizard", levels: 5 }] });
    const d = e14.derive(c, cat14);
    // Humano: +1 em tudo → CON 14 (+2). Mago d6: 6+2 no 1º, (4+2)×4 depois = 32.
    expect(stat(d, "hp")).toBe(32);
    expect(stat(d, "hitDice")).toBe("5d6");
  });

  it("mago de 3º nível: espaços 4/2, CD e magias de nível alto ficam para depois", () => {
    const c = char({ speciesId: "species:human", classes: [{ classId: "class:wizard", levels: 3 }] });
    const d = e14.derive(c, cat14);
    // INT 12 + 1 = 13 (+1). CD = 8 + 2 + 1.
    expect(stat(d, "spellDc")).toBe(11);
    expect(stat(d, "spellSlots")).toBe("1º: 4 · 2º: 2");
    expect(e14.maxSpellLevel(c, cat14)).toBe(2);
    expect(e14.evaluateOption(c, cat14.get("spell:fireball")!, cat14).availability).toBe("available_later");
    expect(e14.evaluateOption(c, cat14.get("spell:magic-missile")!, cat14).availability).toBe("available_now");
    // Magia de outra classe não entra na lista do mago.
    expect(e14.evaluateOption(c, cat14.get("spell:cure-wounds")!, cat14).availability).toBe("unavailable");
  });

  it("bárbaro sem armadura usa Defesa sem Armadura", () => {
    const c = char({ speciesId: "species:half-orc", classes: [{ classId: "class:barbarian", levels: 1 }] });
    // Meio-orc: FOR +2, CON +1 → CON 14 (+2); DES 14 (+2). CA = 10 + 2 + 2.
    expect(stat(e14.derive(c, cat14), "defense")).toBe(14);
  });

  it("perícias: as do antecedente vêm prontas; a classe escolhe da própria lista", () => {
    const base = { speciesId: "species:human", backgroundId: "background:acolyte", classes: [{ classId: "class:fighter", levels: 1 }] };
    const c = char({ ...base, choices: [
      { slot: "skill:athletics", contentId: "skill:athletics", atLevel: 1, locked: false },
      { slot: "skill:perception", contentId: "skill:perception", atLevel: 1, locked: false },
    ] });
    const d = e14.derive(c, cat14);
    expect(d.skills?.find((s) => s.id === "skill:religion")?.trained).toBe(true); // Acólito
    expect(d.skills?.find((s) => s.id === "skill:athletics")?.value).toBe(5); // FOR 16 (+3) + 2
    expect(e14.validate(c, cat14).issues.map((i) => i.code)).not.toContain("skills.missing");
    const tooMany = char({ ...base, choices: ["athletics", "perception", "history"].map((s) => ({ slot: `skill:${s}`, contentId: `skill:${s}`, atLevel: 1, locked: false })) });
    expect(e14.validate(tooMany, cat14).issues.map((i) => i.code)).toContain("skills.too_many");
  });

  it("subclasse: obrigatória no nível certo, proibida antes", () => {
    const early = char({ speciesId: "species:human", classes: [{ classId: "class:fighter", levels: 2, subclassId: "subclass:champion" }] });
    expect(e14.validate(early, cat14).issues.map((i) => i.code)).toContain("class.subclass_too_early");
    const missing = char({ speciesId: "species:human", classes: [{ classId: "class:fighter", levels: 3 }] });
    expect(e14.validate(missing, cat14).issues.map((i) => i.code)).toContain("class.subclass_missing");
  });

  it("Aumentos no Valor de Habilidade: guerreiro de 6º nível tem dois (4 pontos)", () => {
    const c = char({ speciesId: "species:human", classes: [{ classId: "class:fighter", levels: 6 }], levelBonuses: { str: 2, con: 2 } });
    expect(e14.levelBonusBudget(c, cat14).points).toBe(4);
    expect(e14.derive(c, cat14).abilities.str.score).toBe(18);
    const over = char({ ...c, levelBonuses: { str: 2, con: 4 } });
    expect(e14.validate(over, cat14).issues.map((i) => i.code)).toContain("abilities.level_bonus_over");
  });

  it("meio-elfo distribui +1 em dois atributos (fora Carisma)", () => {
    const ok = char({ speciesId: "species:half-elf", assignedBonuses: { str: 1, con: 1 } });
    expect(e14.derive(ok, cat14).abilities.cha.score).toBe(10);
    expect(e14.validate(ok, cat14).issues.map((i) => i.code)).not.toContain("abilities.flexible_bonus");
    const bad = char({ speciesId: "species:half-elf", assignedBonuses: { cha: 1, con: 1 } });
    expect(e14.validate(bad, cat14).issues.map((i) => i.code)).toContain("abilities.flexible_bonus");
  });
});

describe("D&D 2024 com o SRD 5.2.1", () => {
  it("antecedente Acólito: +2/+1 em Inteligência, Sabedoria ou Carisma", () => {
    const c = char({ backgroundId: "background:acolyte", assignedBonuses: { wis: 2, cha: 1 } });
    expect(e24.validate(c, cat24).issues.map((i) => i.code)).not.toContain("abilities.background_bonus_ability");
    expect(e24.derive(c, cat24).abilities.wis.score).toBe(12);
    const bad = char({ backgroundId: "background:acolyte", assignedBonuses: { str: 2, cha: 1 } });
    expect(e24.validate(bad, cat24).issues.map((i) => i.code)).toContain("abilities.background_bonus_ability");
  });

  it("talento de origem do antecedente conta como adquirido e não gasta aumento", () => {
    const c = char({ backgroundId: "background:acolyte", classes: [{ classId: "class:cleric", levels: 1 }], choices: [] });
    expect(e24.levelBonusBudget(c, cat24).points).toBe(0);
    const withFeat = char({ backgroundId: "background:acolyte", classes: [{ classId: "class:cleric", levels: 1 }], choices: [{ slot: "feat:magic-initiate", contentId: "feat:magic-initiate", atLevel: 1, locked: false }] });
    expect(e24.validate(withFeat, cat24).issues.map((i) => i.code)).not.toContain("feats.too_many");
  });

  it("talentos gerais exigem 4º nível; estilo de luta exige a característica", () => {
    const l1 = char({ classes: [{ classId: "class:fighter", levels: 1 }] });
    expect(e24.evaluateOption(l1, cat24.get("feat:grappler")!, cat24).availability).toBe("available_later");
    expect(e24.evaluateOption(l1, cat24.get("feat:archery")!, cat24).availability).toBe("available_now");
    const wizard = char({ classes: [{ classId: "class:wizard", levels: 1 }] });
    expect(e24.evaluateOption(wizard, cat24.get("feat:archery")!, cat24).availability).not.toBe("available_now");
  });

  it("guerreiro com escudo e sem armadura; deslocamento de 9 m", () => {
    const c = char({ speciesId: "species:human", classes: [{ classId: "class:fighter", levels: 1 }], inventory: [item("equipment:shield")] });
    const d = e24.derive(c, cat24);
    expect(stat(d, "defense")).toBe(14); // 10 + DES 2 + escudo 2
    expect(stat(d, "speed")).toBe("9 m");
    expect(stat(d, "hp")).toBe(11); // d10 + CON 1
  });

  it("armadura pesada sem a Força mínima reduz o deslocamento em 3 m", () => {
    const weak = char({ baseAbilities: { ...standard, str: 8, cha: 15 }, speciesId: "species:human", classes: [{ classId: "class:fighter", levels: 1 }], inventory: [item("equipment:plate-armor")] });
    const d = e24.derive(weak, cat24);
    expect(stat(d, "speed")).toBe("6 m");
    expect(stat(d, "defense")).toBe(18);
  });

  it("pacotes iniciais: classe (A ou B) e antecedente", () => {
    const c = char({ classes: [{ classId: "class:fighter", levels: 1 }], backgroundId: "background:soldier" });
    const packs = e24.startingPackages(c, cat24);
    expect(packs).toHaveLength(2);
    expect(packs[0].groups[0].options.at(-1)?.gold).toBeGreaterThan(0);
    for (const p of packs) for (const g of p.groups) for (const o of g.options) for (const i of o.items) expect(cat24.get(i.id), i.id).toBeDefined();
  });

  it("clérigo de 1º nível: truques e magias preparadas da tabela da classe", () => {
    const c = char({ classes: [{ classId: "class:cleric", levels: 1 }] });
    const finals = e24.finalAbilities(c, cat24);
    expect(e24.spellLimit(c, cat24, finals)).toEqual({ limit: 4, label: "preparadas" });
  });
});
