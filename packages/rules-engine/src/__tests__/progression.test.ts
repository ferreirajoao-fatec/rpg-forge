/**
 * Subida de nível ("Meu próximo nível") com o catálogo real do SRD 5.1 e o motor do Tormenta20.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyCharacter, totalLevel, type CharacterData } from "../core/character";
import type { ContentEntry } from "../core/content";
import { Catalog } from "../core/engine";
import { applyLevelUp } from "../core/progression";
import { Dnd5e2014Engine } from "../systems/dnd5e-2014";
import { Tormenta20Engine } from "../systems/tormenta20";

const dir = path.resolve(__dirname, "../../../../content/dnd5e-2014/data");
const cat = new Catalog(
  "dnd5e-2014",
  readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ContentEntry[]),
);
const e = new Dnd5e2014Engine();
const char = (p: Partial<CharacterData>) =>
  emptyCharacter({
    name: "Teste",
    abilityMethod: "standard-array",
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    speciesId: "species:human",
    ...p,
  });
const gain = (plan: ReturnType<typeof e.levelUpPlan>, label: string) => plan.gains.find((g) => g.label === label);

describe("applyLevelUp", () => {
  it("sobe o nível declarado e o da classe principal juntos", () => {
    const c = applyLevelUp(char({ level: 3, classes: [{ classId: "class:fighter", levels: 3 }] }));
    expect(c.level).toBe(4);
    expect(c.classes[0].levels).toBe(4);
    expect(totalLevel(c)).toBe(4);
  });

  it("sem classe, sobe só o nível declarado", () => {
    expect(applyLevelUp(char({ level: 2 })).level).toBe(3);
  });
});

describe("plano de subida de nível — D&D 2014", () => {
  it("guerreiro 3 → 4: PV sobem pela média e ganha Aumento no Valor de Habilidade", () => {
    const plan = e.levelUpPlan(char({ level: 3, classes: [{ classId: "class:fighter", levels: 3 }] }), cat);
    expect(plan).toMatchObject({ from: 3, to: 4, canLevelUp: true });
    // Humano: CON 14 (+2). d10: média 6 + 2 = 8 por nível. 12 + 8×2 = 28 → 36.
    expect(gain(plan, "Pontos de vida")?.detail).toBe("28 → 36");
    expect(gain(plan, "Aumento no Valor de Habilidade")).toMatchObject({ kind: "choice", stepId: "abilities" });
  });

  it("bônus de proficiência muda no 5º nível e o guerreiro ganha Ataque Extra", () => {
    const plan = e.levelUpPlan(char({ level: 4, classes: [{ classId: "class:fighter", levels: 4 }] }), cat);
    expect(gain(plan, "Bônus de proficiência")?.detail).toBe("+2 → +3");
    expect(plan.gains.some((g) => g.kind === "feature" && /ataque extra/i.test(g.label))).toBe(true);
  });

  it("bárbaro 2 → 3 pede a subclasse", () => {
    const plan = e.levelUpPlan(char({ level: 2, classes: [{ classId: "class:barbarian", levels: 2 }] }), cat);
    expect(gain(plan, "Escolha a subclasse")).toMatchObject({ kind: "choice", stepId: "class" });
  });

  it("feiticeiro 3 → 4 aprende um truque e uma magia", () => {
    const plan = e.levelUpPlan(char({ level: 3, classes: [{ classId: "class:sorcerer", levels: 3 }] }), cat);
    expect(gain(plan, "Aprenda 1 truque(s)")).toBeDefined();
    expect(gain(plan, "Aprenda 1 magia(s)")).toBeDefined();
  });

  it("por XP: bloqueia sem XP suficiente e libera ao atingir o mínimo", () => {
    const base = { level: 1, classes: [{ classId: "class:fighter", levels: 1 }], progressionMode: "xp" as const };
    const short = e.levelUpPlan(char({ ...base, experience: 200 }), cat);
    expect(short).toMatchObject({ canLevelUp: false, xp: { current: 200, needed: 300 } });
    expect(short.blockedReason).toMatch(/Faltam 100 XP/);
    expect(e.levelUpPlan(char({ ...base, experience: 300 }), cat).canLevelUp).toBe(true);
  });

  it("não passa do nível máximo", () => {
    const plan = e.levelUpPlan(char({ level: 20, classes: [{ classId: "class:fighter", levels: 20 }] }), cat);
    expect(plan.canLevelUp).toBe(false);
  });
});

describe("plano de subida de nível — Tormenta20", () => {
  it("usa a tabela de XP do livro", () => {
    const t20 = new Tormenta20Engine();
    const plan = t20.levelUpPlan(emptyCharacter({ progressionMode: "xp", experience: 999 }), new Catalog("tormenta20-2020"));
    expect(plan).toMatchObject({ canLevelUp: false, xp: { needed: 1000 } });
  });
});
