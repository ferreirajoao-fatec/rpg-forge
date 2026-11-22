import { describe, expect, it } from "vitest";
import { Catalog, emptyCharacter, getEngine, seededRng, validateContentPack } from "../index";
import { dndModifier, dndProficiencyBonus, dndLevelForXp } from "../systems/dnd5e-common";
import { testPack } from "./fixtures";

const d14 = getEngine("dnd5e-2014");
const d24 = getEngine("dnd5e-2024");
const t20 = getEngine("tormenta20-2020");
const cat14 = Catalog.fromPacks("dnd5e-2014", [testPack("dnd5e-2014")]);
const cat24 = Catalog.fromPacks("dnd5e-2024", [testPack("dnd5e-2024")]);

const standard = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

describe("fórmulas D&D 5e (SRD)", () => {
  it("modificador de atributo", () => {
    expect([1, 8, 9, 10, 11, 12, 15, 20, 30].map(dndModifier)).toEqual([-5, -1, -1, 0, 0, 1, 2, 5, 10]);
  });
  it("bônus de proficiência por nível", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(dndProficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  });
  it("nível por XP", () => {
    expect(dndLevelForXp(0)).toBe(1);
    expect(dndLevelForXp(299)).toBe(1);
    expect(dndLevelForXp(300)).toBe(2);
    expect(dndLevelForXp(355000)).toBe(20);
  });
});

describe("personagem iniciante válido", () => {
  it("conjunto padrão sem problemas", () => {
    const c = emptyCharacter({ name: "Aria", abilityMethod: "standard-array", baseAbilities: standard });
    expect(d14.validate(c, cat14).status).toBe("valid");
  });

  it("alteração de atributo atualiza modificadores", () => {
    const c = emptyCharacter({ baseAbilities: { ...standard } });
    expect(d14.derive(c, cat14).abilities.str.modifier).toBe(2);
    c.baseAbilities.str = 8;
    expect(d14.derive(c, cat14).abilities.str.modifier).toBe(-1);
  });

  it("bônus racial (2014) entra nos atributos finais", () => {
    const c = emptyCharacter({ baseAbilities: standard, speciesId: "species:test-elf" });
    expect(d14.derive(c, cat14).abilities.dex).toEqual({ score: 16, modifier: 3 });
  });
});

describe("métodos de atributos", () => {
  it("compra de pontos acima do orçamento é inválida", () => {
    const c = emptyCharacter({ name: "X", abilityMethod: "point-buy", baseAbilities: { str: 15, dex: 15, con: 15, int: 10, wis: 8, cha: 8 } });
    const r = d14.validate(c, cat14);
    expect(r.status).toBe("invalid");
    expect(r.issues.map((i) => i.code)).toContain("abilities.point_buy_over");
  });
  it("compra de pontos com sobra gera atenção", () => {
    const c = emptyCharacter({ name: "X", abilityMethod: "point-buy", baseAbilities: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } });
    expect(d14.validate(c, cat14).status).toBe("warning");
  });
  it("conjunto padrão com valores repetidos é inválido", () => {
    const c = emptyCharacter({ name: "X", abilityMethod: "standard-array", baseAbilities: { ...standard, cha: 15 } });
    expect(d14.validate(c, cat14).status).toBe("invalid");
  });
  it("valores livres exigem aprovação do mestre", () => {
    const c = emptyCharacter({ name: "X", abilityMethod: "custom", baseAbilities: standard });
    expect(d14.validate(c, cat14).status).toBe("gm_approval");
  });
  it("randomização sempre produz resultados válidos", () => {
    for (const method of d14.abilityMethods.filter((m) => m.generate)) {
      for (let seed = 1; seed <= 200; seed++) {
        const scores = method.generate!(seededRng(seed));
        const issues = method.validate(scores).filter((i) => i.severity === "invalid");
        expect(issues, `${method.id} seed ${seed}`).toEqual([]);
      }
    }
  });
});

describe("pré-requisitos e disponibilidade", () => {
  const power = cat14.get("power:test-lvl6")!;

  it("habilidade de nível 6 no nível 2 fica disponível futuramente, com mensagem amigável", () => {
    const c = emptyCharacter({ level: 2 });
    const ev = d14.evaluateOption(c, power, cat14);
    expect(ev.availability).toBe("available_later");
    expect(ev.issues[0].message).toContain("O requisito mínimo é nível 6");
    expect(ev.issues[0].message).toContain("quando cumprir os requisitos necessários");
  });

  it("selecionar habilidade antes do nível invalida a ficha", () => {
    const c = emptyCharacter({ name: "X", level: 2, choices: [{ slot: "power:1", contentId: power.id, atLevel: 2, locked: false }] });
    const r = d14.validate(c, cat14);
    expect(r.status).toBe("invalid");
    expect(r.issues.some((i) => i.code === "prereq.min_level")).toBe(true);
  });

  it("no nível 6 a habilidade fica disponível agora", () => {
    expect(d14.evaluateOption(emptyCharacter({ level: 6 }), power, cat14).availability).toBe("available_now");
  });

  it("magia de outra classe é indisponível sem multiclasse e futura com multiclasse", () => {
    const spell = cat14.get("spell:test-mage-only")!;
    const fighter = emptyCharacter({ classes: [{ classId: "class:test-fighter", levels: 1 }] });
    expect(d14.evaluateOption(fighter, spell, cat14).availability).toBe("unavailable");
    fighter.optionalRules.push("multiclass");
    expect(d14.evaluateOption(fighter, spell, cat14).availability).toBe("available_later");
  });

  it("talento de espécie é indisponível para outras espécies", () => {
    const feat = cat14.get("feat:test-elf-only")!;
    expect(d14.evaluateOption(emptyCharacter(), feat, cat14).availability).toBe("unavailable");
    expect(d14.evaluateOption(emptyCharacter({ speciesId: "species:test-elf" }), feat, cat14).availability).toBe("available_now");
  });

  it("requisito de atributo pode ser cumprido no futuro", () => {
    const feat = cat14.get("feat:test-strong")!;
    const weak = emptyCharacter({ baseAbilities: { ...standard, str: 8 } });
    expect(d14.evaluateOption(weak, feat, cat14).availability).toBe("available_later");
  });

  it("opção já adquirida aparece como adquirida", () => {
    const c = emptyCharacter({ level: 6, choices: [{ slot: "power:1", contentId: power.id, atLevel: 6, locked: false }] });
    expect(d14.evaluateOption(c, power, cat14).availability).toBe("acquired");
  });
});

describe("aprovação do mestre", () => {
  it("homebrew sem aprovação fica pendente; com aprovação é válido", () => {
    const base = { name: "X", abilityMethod: "standard-array", baseAbilities: standard };
    const pending = emptyCharacter({ ...base, choices: [{ slot: "feat:1", contentId: "feat:test-homebrew", atLevel: 1, locked: false }] });
    expect(d14.validate(pending, cat14).status).toBe("gm_approval");
    const approved = emptyCharacter({
      ...base,
      choices: [{ slot: "feat:1", contentId: "feat:test-homebrew", atLevel: 1, locked: false, gmApprovalId: "ap_1" }],
    });
    expect(d14.validate(approved, cat14).status).toBe("valid");
  });
});

describe("D&D 2024 — bônus de antecedente", () => {
  const base = { name: "X", abilityMethod: "standard-array", baseAbilities: standard, backgroundId: "background:test-sage" };
  it("+2/+1 em atributos permitidos é válido", () => {
    const c = emptyCharacter({ ...base, assignedBonuses: { int: 2, wis: 1 } });
    expect(d24.validate(c, cat24).status).toBe("valid");
    expect(d24.derive(c, cat24).abilities.int.score).toBe(14);
  });
  it("padrão incorreto é inválido", () => {
    const c = emptyCharacter({ ...base, assignedBonuses: { int: 2, wis: 2 } });
    expect(d24.validate(c, cat24).issues.map((i) => i.code)).toContain("abilities.background_bonus_pattern");
  });
  it("atributo fora das opções do antecedente é inválido", () => {
    const c = emptyCharacter({ ...base, assignedBonuses: { str: 2, int: 1 } });
    expect(d24.validate(c, cat24).issues.map((i) => i.code)).toContain("abilities.background_bonus_ability");
  });
});

describe("isolamento entre sistemas", () => {
  it("não carrega pacote de outro sistema", () => {
    expect(() => Catalog.fromPacks("dnd5e-2014", [testPack("dnd5e-2024")])).toThrow();
  });
  it("escolha de conteúdo inexistente no catálogo do sistema é inválida", () => {
    const c = emptyCharacter({ name: "X", choices: [{ slot: "class", contentId: "class:outro-sistema", atLevel: 1, locked: false }] });
    expect(d14.validate(c, cat14).issues.map((i) => i.code)).toContain("choice.unknown_content");
  });
  it("Tormenta20 sem conteúdo importado sinaliza a falta do pacote", () => {
    const r = t20.validate(emptyCharacter({ name: "X" }), new Catalog("tormenta20-2020"));
    expect(r.issues.map((i) => i.code)).toContain("ruleset.content_not_imported");
  });
});

describe("validação de pacotes de conteúdo", () => {
  it("aceita pacote bem formado", () => {
    expect(validateContentPack(testPack("dnd5e-2014")).ok).toBe(true);
  });
  it("rejeita ids duplicados, fonte não declarada e referências quebradas", () => {
    const p = testPack("dnd5e-2014");
    p.entries.push({ ...p.entries[0] });
    p.entries.push({ ...p.entries[1], id: "class:x", source: { ...p.entries[1].source, sourcebookId: "nope" } });
    p.entries.push({ ...p.entries[4], id: "power:y", prerequisites: { type: "hasContent", contentId: "feat:missing" } });
    const r = validateContentPack(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/duplicado/);
    expect(r.errors.join("\n")).toMatch(/não declarada/);
    expect(r.errors.join("\n")).toMatch(/inexistente/);
  });
});
