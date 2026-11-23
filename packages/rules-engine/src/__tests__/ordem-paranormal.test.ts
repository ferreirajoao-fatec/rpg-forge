import { describe, expect, it } from "vitest";
import {
  Catalog,
  emptyCharacter,
  getEngine,
  opDiceFormula,
  seededRng,
  validateContentPack,
  type InventoryItem,
} from "..";
import {
  calculateMissionPrestige,
  evaluateOpEncounter,
  levelOfNex,
  nexOfLevel,
  OP_OPTIONAL_RULES,
  OP_RULESET_ID,
  parseExtraPeCost,
  rankForPrestige,
  ritualCostSummary,
} from "../systems/ordem-paranormal";
import opPack from "../../../../content/ordem-paranormal-1e/pack";
import { opTestFixturePack } from "./ordem-paranormal-fixture";

const hasLocalPack = opPack.entries.length > 0;
const op = getEngine(OP_RULESET_ID);
const catalog = Catalog.fromPacks(OP_RULESET_ID, [hasLocalPack ? opPack : opTestFixturePack]);
const method = (id: string) => op.abilityMethods.find((m) => m.id === id)!;
const stat = (c: ReturnType<typeof emptyCharacter>, key: string) => op.derive(c, catalog).stats?.find((s) => s.key === key)?.value;
const codes = (c: ReturnType<typeof emptyCharacter>) => op.validate(c, catalog).issues.map((i) => i.code);
const item = (id: string, overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  entryId: id,
  contentId: id,
  quantity: 1,
  equipped: true,
  modifications: [],
  enchantments: [],
  ...overrides,
});

// Exemplo do livro (p. 15): Bianca — AGI 2, FOR 0, INT 3, PRE 3, VIG 1 (soma = 9).
const biancaAttrs = { agi: 2, for: 0, int: 3, pre: 3, vig: 1 };
const balancedAttrs = { agi: 2, for: 2, int: 2, pre: 2, vig: 1 };

describe("Ordem Paranormal RPG — pacote de conteúdo", () => {
  it("fixture mínimo de CI é válido", () => {
    expect(validateContentPack(opTestFixturePack).errors).toEqual([]);
  });

  it.skipIf(!hasLocalPack)("pacote completo local é válido com todas as seções principais", () => {
    const r = validateContentPack(opPack);
    expect(r.errors).toEqual([]);
    expect(catalog.ofKind("skill")).toHaveLength(28);
    expect(catalog.ofKind("class")).toHaveLength(4);
    expect(catalog.ofKind("origin").length).toBeGreaterThanOrEqual(40);
    expect(catalog.ofKind("subclass")).toHaveLength(27);
    expect(catalog.ofKind("power").length).toBeGreaterThan(100);
    expect(catalog.ofKind("spell").length).toBeGreaterThan(70);
    expect(catalog.ofKind("condition")).toHaveLength(36);
    expect(catalog.ofKind("creature").length).toBeGreaterThan(60);
  });
});

describe("Ordem Paranormal RPG — fórmulas base e dados", () => {
  it("mapeia nível 1..20 para NEX 5%..99%", () => {
    expect(nexOfLevel(1)).toBe(5);
    expect(nexOfLevel(2)).toBe(10);
    expect(nexOfLevel(10)).toBe(50);
    expect(nexOfLevel(19)).toBe(95);
    expect(nexOfLevel(20)).toBe(99);
    expect(levelOfNex(5)).toBe(1);
    expect(levelOfNex(50)).toBe(10);
    expect(levelOfNex(99)).toBe(20);
  });

  it("monta fórmulas de dados corretas (inclusive atributo 0)", () => {
    expect(opDiceFormula(3, 5)).toBe("3d20kh1+5");
    expect(opDiceFormula(1, 0)).toBe("1d20kh1");
    expect(opDiceFormula(0, 5)).toBe("2d20kl1+5");
    expect(opDiceFormula(0, 0, -1)).toBe("3d20kl1");
  });

  it("distribuição de atributos de Agente (4 pts) e Sobrevivente (3 pts)", () => {
    expect(method("op-agent").validate(biancaAttrs)).toEqual([]);
    expect(method("op-agent").validate(balancedAttrs)).toEqual([]);
    // Dois zeros não são permitidos
    expect(method("op-agent").validate({ agi: 3, for: 0, int: 3, pre: 3, vig: 0 }).map((i) => i.code)).toContain("abilities.op_too_many_zeros");
    // Acima de 3 inicial é inválido
    expect(method("op-agent").validate({ agi: 4, for: 1, int: 2, pre: 1, vig: 1 }).map((i) => i.code)).toContain("abilities.op_range");
    // Sobrevivente: soma 8
    expect(method("op-survivor").validate({ agi: 2, for: 1, int: 2, pre: 2, vig: 1 })).toEqual([]);
    // Geração aleatória sempre válida
    for (const id of ["op-agent", "op-survivor"]) {
      const m = method(id);
      for (let seed = 1; seed <= 100; seed++) {
        expect(m.validate(m.generate!(seededRng(seed)))).toEqual([]);
      }
    }
  });
});

describe("Ordem Paranormal RPG — classes, NEX, Transcender e perícias", () => {
  it("Combatente NEX 5% calcula PV, PE, SAN, Defesa e Limite de PE", () => {
    const c = emptyCharacter({
      name: "Joui",
      level: 1,
      abilityMethod: "op-agent",
      baseAbilities: { agi: 3, for: 2, int: 1, pre: 1, vig: 2 },
      classes: [{ classId: "class:combatente", levels: 1 }],
      backgroundId: "origin:policial", // +2 Defesa
      inventory: [item("equipment:protecao-leve")], // +5 Defesa
    });
    // PV: 20 + 2 = 22; PE: 2 + 1 = 3; SAN: 12; Defesa: 10 + 3 + 5 + 2 = 20
    expect(stat(c, "hp")).toBe(22);
    expect(stat(c, "mp")).toBe(3);
    expect(stat(c, "san")).toBe(12);
    expect(stat(c, "peLimit")).toBe(1);
    expect(stat(c, "defense")).toBe(20);
  });

  it("Ocultista NEX 25% (nível 5) libera 2º círculo e Transcender desconta SAN", () => {
    const base = emptyCharacter({
      name: "Dante",
      level: 5,
      abilityMethod: "op-agent",
      baseAbilities: { agi: 1, for: 0, int: 3, pre: 3, vig: 2 },
      levelBonuses: { pre: 1 }, // NEX 20% → PRE 4
      classes: [{ classId: "class:ocultista", levels: 5, subclassId: "subclass:conduite" }],
    });
    // SAN sem Transcender: 20 + 5*4 = 40; DT: 10 + 5 (limite PE) + 4 (PRE) = 19
    expect(stat(base, "san")).toBe(40);
    expect(stat(base, "spellDc")).toBe(19);
    // 2º círculo liberado, 3º futuro
    const r2 = catalog.ofKind("spell").find((s) => s.data.circle === 2)!;
    const r3 = catalog.ofKind("spell").find((s) => s.data.circle === 3)!;
    expect(op.evaluateOption(base, r2, catalog).availability).toBe("available_now");
    expect(op.evaluateOption(base, r3, catalog).availability).toBe("available_later");

    // Escolhendo um poder paranormal → 1× Transcender → perde 5 SAN (40 → 35)
    const para = catalog.get("power:potencial-aprimorado")!;
    const withTranscend = { ...base, choices: [{ slot: `power:${para.id}`, contentId: para.id, atLevel: 3, locked: false }] };
    expect(stat(withTranscend, "san")).toBe(35);
    // E Potencial Aprimorado dá +1 PE por NEX (+5 PE)
    expect(Number(stat(withTranscend, "mp"))).toBe(Number(stat(base, "mp")) + 5);
  });

  it("Cultista Arrependido começa com metade da SAN e 1 poder paranormal sem descontar Transcender", () => {
    const c = emptyCharacter({
      name: "Ex-Cultista",
      level: 1,
      abilityMethod: "op-agent",
      baseAbilities: balancedAttrs,
      backgroundId: "origin:cultista-arrependido",
      classes: [{ classId: "class:ocultista", levels: 1 }],
      choices: [{ slot: "power:visao-do-oculto", contentId: "power:visao-do-oculto", atLevel: 1, locked: false }],
    });
    // SAN inicial Ocultista = 20 → metade = 10
    expect(stat(c, "san")).toBe(10);
    expect(codes(c)).not.toContain("powers.too_many");
  });

  it("pré-requisito elemental bloqueia poder até ter outros poderes do mesmo elemento", () => {
    const surto = catalog.get("power:surto-temporal")!; // Morte 2
    const c = emptyCharacter({ level: 6, classes: [{ classId: "class:ocultista", levels: 6 }] });
    expect(op.evaluateOption(c, surto, catalog).availability).toBe("available_later");

    const withTwoMorte = {
      ...c,
      choices: [
        { slot: "power:1", contentId: "power:encarar-a-morte", atLevel: 3, locked: false },
        { slot: "power:2", contentId: "power:potencial-aprimorado", atLevel: 6, locked: false },
      ],
    };
    expect(op.evaluateOption(withTwoMorte, surto, catalog).availability).toBe("available_now");
  });

  it("Grau de Treinamento eleva perícia para Veterano (+10) e Expert (+15)", () => {
    const c = emptyCharacter({
      name: "Bianca",
      level: 14, // NEX 70%
      abilityMethod: "op-agent",
      baseAbilities: biancaAttrs,
      classes: [{ classId: "class:especialista", levels: 14, subclassId: "subclass:tecnico" }],
      backgroundId: "origin:investigador",
      choices: [
        { slot: "skill-rank:veterano:skill:investigacao", contentId: "skill:investigacao", atLevel: 7, locked: false },
        { slot: "skill-rank:expert:skill:investigacao", contentId: "skill:investigacao", atLevel: 14, locked: false },
      ],
    });
    const inv = op.derive(c, catalog).skills?.find((s) => s.id === "skill:investigacao");
    expect(inv?.rank).toBe("expert");
    expect(inv?.value).toBe(15);
  });

  it("Sobrevivente (SaH) usa estágios 1..5 e limite de PE 1", () => {
    const c = emptyCharacter({
      name: "Civil",
      level: 2,
      abilityMethod: "op-survivor",
      baseAbilities: { agi: 2, for: 1, int: 2, pre: 2, vig: 1 },
      classes: [{ classId: "class:sobrevivente", levels: 2, subclassId: "subclass:durao" }],
    });
    expect(op.formatLevel?.(2, c)).toBe("Estágio 2 (NEX 0%)");
    // PV: 8 + 1 (VIG) + 2 (estágio 2) + 4 (Durão) = 15; PE: 2 + 2 + 1 = 5; SAN: 8 + 2 = 10
    expect(stat(c, "hp")).toBe(15);
    expect(stat(c, "mp")).toBe(5);
    expect(stat(c, "san")).toBe(10);
    expect(stat(c, "peLimit")).toBe(1);
  });
});

describe("Ordem Paranormal RPG — inventário, Patente, Categorias e Maldições", () => {
  it("calcula Patente, Limite de Crédito (com Magnata) e valida limite de Categorias", () => {
    expect(rankForPrestige(0).rank.label).toBe("Recruta");
    expect(rankForPrestige(20).rank.label).toBe("Operador");
    expect(rankForPrestige(50).rank.label).toBe("Agente Especial");
    expect(rankForPrestige(0, 1).credit).toBe("Médio"); // Magnata sobe 1 nível

    // Recruta: no máximo 2 itens Cat I, 0 Cat II
    const over = emptyCharacter({
      name: "Recruta",
      abilityMethod: "op-agent",
      baseAbilities: balancedAttrs,
      classes: [{ classId: "class:combatente", levels: 1 }],
      currency: { pp: 0 },
      inventory: [item("equipment:fuzil-de-assalto")], // Cat II
    });
    expect(codes(over)).toContain("inventory.category_2_over");
  });

  it("impede itens amaldiçoados antes de Agente Especial e bloqueia elementos opressores", () => {
    const lowRank = emptyCharacter({
      name: "Operador",
      abilityMethod: "op-agent",
      baseAbilities: balancedAttrs,
      classes: [{ classId: "class:combatente", levels: 4 }],
      currency: { pp: 20 }, // Operador
      inventory: [item("equipment:espada", { enchantments: ["equipment:maldicao-lancinante"] })],
    });
    expect(codes(lowRank)).toContain("inventory.cursed_rank");

    const opposing = emptyCharacter({
      name: "Elite",
      abilityMethod: "op-agent",
      baseAbilities: balancedAttrs,
      classes: [{ classId: "class:combatente", levels: 15 }],
      currency: { pp: 200 },
      inventory: [
        item("equipment:faca", {
          enchantments: ["equipment:maldicao-lancinante", "equipment:maldicao-antielemento"], // Sangue + Conhecimento = opressores!
        }),
      ],
    });
    expect(codes(opposing)).toContain("inventory.opposing_curses");
  });

  it("calcula espaços (FOR 0 → 2 espaços) e aplica sobrecarga na Defesa e deslocamento", () => {
    const c = emptyCharacter({
      name: "Frágil",
      abilityMethod: "op-agent",
      baseAbilities: biancaAttrs, // FOR 0 → 2 espaços leves, 4 máx
      classes: [{ classId: "class:especialista", levels: 1 }],
      inventory: [item("equipment:faca", { quantity: 3 })], // 3 espaços → sobrecarregado
    });
    const d = op.derive(c, catalog);
    expect(d.inventory?.load).toEqual({ light: 2, max: 4, state: "encumbered" });
    expect(stat(c, "defense")).toBe(10 + 2 - 5);
    expect(stat(c, "speed")).toBe("6m");
  });
});

describe("Ordem Paranormal RPG — ferramentas do mestre (VD e Prestígio)", () => {
  it("avalia equilíbrio de combate pela regra da p. 177", () => {
    // 4 agentes NEX 10% = NEX 40 total
    expect(evaluateOpEncounter([{ vd: 20, count: 1 }], { size: 4, avgNex: 10 }).difficulty).toBe("facil");
    expect(evaluateOpEncounter([{ vd: 40, count: 1 }], { size: 4, avgNex: 10 }).difficulty).toBe("equilibrado");
    expect(evaluateOpEncounter([{ vd: 60, count: 1 }], { size: 4, avgNex: 10 }).difficulty).toBe("dificil");
    expect(evaluateOpEncounter([{ vd: 80, count: 1 }], { size: 4, avgNex: 10 }).difficulty).toBe("mortal");
    // Veteranos aguentam até 2x como difícil
    expect(evaluateOpEncounter([{ vd: 80, count: 1 }], { size: 4, avgNex: 10, veteran: true }).difficulty).toBe("dificil");
  });

  it("calcula Pontos de Prestígio pela Tabela 3.2", () => {
    const pp = calculateMissionPrestige({ solvedCase: true, extraClues: 2, innocentDeaths: 1, agentDeaths: 0 });
    expect(pp.total).toBe(12); // +10 +4 -2
  });
});

describe("Ordem Paranormal RPG — Sobrevivendo ao Horror (regras opcionais e rituais)", () => {
  it("calcula Pontos de Determinação (PD) no lugar de PE e Sanidade", () => {
    const mk = (classId: string, level: number, pre: number) =>
      emptyCharacter({
        level,
        abilityMethod: classId === "class:sobrevivente" ? "op-survivor" : "op-agent",
        baseAbilities: { agi: 1, for: 1, int: 1, pre, vig: 1 },
        classes: [{ classId, levels: level }],
        optionalRules: [OP_OPTIONAL_RULES.DETERMINATION_POINTS],
      });

    // Combatente N1 PRE 2: 6+2 = 8 PD; N2: +3+2 = 13 PD
    expect(stat(mk("class:combatente", 1, 2), "pd")).toBe(8);
    expect(stat(mk("class:combatente", 2, 2), "pd")).toBe(13);
    expect(stat(mk("class:combatente", 2, 2), "mp")).toBeUndefined();
    expect(stat(mk("class:combatente", 2, 2), "san")).toBeUndefined();

    // Especialista N1 PRE 2: 8+2 = 10 PD; Ocultista N1 PRE 3: 10+3 = 13 PD; Sobrevivente E2 PRE 1: 4+1 + 2 = 7 PD
    expect(stat(mk("class:especialista", 1, 2), "pd")).toBe(10);
    expect(stat(mk("class:ocultista", 1, 3), "pd")).toBe(13);
    expect(stat(mk("class:sobrevivente", 2, 1), "pd")).toBe(7);
  });

  it("separa Nível e NEX e libera Afinidade apenas com NEX >= 50%", () => {
    const c = emptyCharacter({
      level: 10,
      abilityMethod: "op-agent",
      baseAbilities: balancedAttrs,
      classes: [{ classId: "class:ocultista", levels: 10 }],
      optionalRules: [OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX],
      opSeparateNex: 25,
    });
    expect(op.formatLevel?.(10, c)).toBe("Nível 10 · NEX 25%");
    const af = catalog.get("feature:afinidade-morte")!;
    expect(op.evaluateOption(c, af, catalog).availability).toBe("available_later");

    const nex50 = { ...c, opSeparateNex: 50 };
    expect(op.evaluateOption(nex50, af, catalog).availability).toBe("available_now");
  });

  it("calcula Custo do Paranormal (Discente/Verdadeiro e regra de Medo)", () => {
    expect(parseExtraPeCost("+2 PE")).toBe(2);
    expect(parseExtraPeCost("+5 PD")).toBe(5);
    const sum = ritualCostSummary({ baseCost: 1, extraCost: 2, peLimit: 2, element: "morte", usePd: false });
    expect(sum).toEqual({
      totalPe: 3,
      exceedsLimit: true,
      requiresOcultismoTest: true,
      ocultismoDc: 23,
      failMentalLoss: 3,
      failBy5PermanentSanLoss: 1,
      failBy5ExtraPdLoss: 0,
    });
    const medo = ritualCostSummary({ baseCost: 6, extraCost: 0, peLimit: 10, element: "medo", usePd: true });
    expect(medo.requiresOcultismoTest).toBe(false);
    expect(medo.exceedsLimit).toBe(false);
    expect(medo.failBy5ExtraPdLoss).toBe(1);
  });
});
