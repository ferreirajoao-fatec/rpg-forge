import { describe, expect, it } from "vitest";
import { Catalog, emptyCharacter } from "@rpg-forge/rules-engine";
import tormenta20Pack from "../../../../../../../content/tormenta20-2020/pack";
import { fitContext, fitOf, isForYou } from "./relevance";

const catalog = Catalog.fromPacks("tormenta20-2020", [tormenta20Pack]);
const fit = (kind: string, id: string, c: ReturnType<typeof emptyCharacter>) => fitOf(kind, catalog.get(id)!, fitContext(c, catalog), catalog);

const ladina = emptyCharacter({ name: "L", speciesId: "species:meia-driade", classes: [{ classId: "class:ladino", levels: 1 }], backgroundId: "origin:soldado" });

describe("seleção filtrada pelas escolhas anteriores", () => {
  it("poderes: os da classe escolhida aparecem; os de outra classe ficam no “Catálogo completo”", () => {
    expect(fit("power", "power:ladino-emboscar", ladina).fit).toBe("class");
    const other = fit("power", "power:guerreiro-arqueiro", ladina);
    expect(other.fit).toBe("other");
    expect(isForYou(other.fit)).toBe(false);
    expect(fit("power", "power:acuidade-com-arma", ladina).fit).toBe("general");
  });

  it("poderes concedidos só aparecem para quem é devoto daquela divindade", () => {
    const id = "power:anfibio";
    expect(fit("power", id, ladina).fit).toBe("other");
    const devota = { ...ladina, choices: [{ slot: "deity", contentId: "deity:deus-dos-mares", atLevel: 1, locked: false }] };
    expect(fit("power", id, devota).fit).toBe("deity");
  });

  it("magias: a raça que concede uma magia a destaca; magias de outras classes ficam no “Catálogo completo”", () => {
    expect(fit("spell", "spell:controlar-plantas", ladina).fit).toBe("species");
    const arcanista = { ...ladina, speciesId: "species:humano", classes: [{ classId: "class:arcanista", levels: 1 }] };
    const arcana = catalog.ofKind("spell").find((s) => s.data.tradition === "arcana")!;
    expect(fit("spell", arcana.id, arcanista).fit).toBe("class");
    expect(fit("spell", arcana.id, ladina).fit).toBe("other");
  });

  it("perícias: lista da classe e da origem", () => {
    expect(fit("skill", "skill:furtividade", ladina).fit).toBe("class");
    expect(fit("skill", "skill:guerra", ladina).fit).toBe("origin");
    expect(fit("skill", "skill:misticismo", ladina).fit).toBe("other");
  });

  it("equipamento: armas e armaduras conforme as proficiências da classe", () => {
    expect(fit("equipment", "equipment:adaga", ladina).fit).toBe("general");
    expect(fit("equipment", "equipment:arco-longo", ladina).fit).toBe("other");
    expect(fit("equipment", "equipment:brunea", ladina).fit).toBe("other");
    const guerreiro = { ...ladina, classes: [{ classId: "class:guerreiro", levels: 1 }] };
    expect(fit("equipment", "equipment:arco-longo", guerreiro).fit).toBe("class");
    expect(fit("equipment", "equipment:brunea", guerreiro).fit).toBe("class");
    expect(fit("equipment", "equipment:escudo-pesado", guerreiro).fit).toBe("class");
  });
});
