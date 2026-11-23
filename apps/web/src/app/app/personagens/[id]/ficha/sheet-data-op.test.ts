import { describe, expect, it } from "vitest";
import { Catalog, emptyCharacter, type CharacterData } from "@rpg-forge/rules-engine";
import opPack from "../../../../../../../../content/ordem-paranormal-1e/pack";
import { opTestFixturePack } from "../../../../../../../../packages/rules-engine/src/__tests__/ordem-paranormal-fixture";
import { buildSheet } from "./sheet-data";

const catalog = Catalog.fromPacks("ordem-paranormal-1e", [opPack.entries.length > 0 ? opPack : opTestFixturePack]);

describe("buildSheet — Ordem Paranormal RPG", () => {
  it("monta o dossiê com PV/PE/SAN, pool de d20, T/V/E, Patente e Rituais", () => {
    const ch: CharacterData = emptyCharacter({
      name: "Dante",
      level: 7, // NEX 35%
      baseAbilities: { agi: 2, for: 1, int: 3, pre: 3, vig: 1 },
      levelBonuses: { pre: 1 }, // NEX 20%: PRE -> 4
      backgroundId: "origin:cultista-arrependido",
      classes: [{ classId: "class:ocultista", levels: 7, subclassId: "subclass:graduado" }],
      currency: { pp: 55 }, // Agente Especial
      choices: [
        { slot: "skill:investigacao", contentId: "skill:investigacao", atLevel: 1, locked: false },
        { slot: "skill-rank:veterano:skill:ocultismo", contentId: "skill:ocultismo", atLevel: 7, locked: false },
        { slot: "spell:cicatrizacao", contentId: "spell:cicatrizacao", atLevel: 1, locked: false },
      ],
      inventory: [
        { entryId: "inv-1", contentId: "equipment:faca", quantity: 1, equipped: true, modifications: ["equipment:mod-certeira"], enchantments: [] },
      ],
    });

    const sheet = buildSheet(ch, "ordem-paranormal-1e", catalog, "Arthur");
    expect(sheet.flavor).toBe("op");
    expect(sheet.levelLabel).toBe("NEX 35%");
    expect(sheet.className).toBe("Ocultista");
    expect(sheet.classOption).toBe("Graduado");
    expect(sheet.origin).toBe("Cultista Arrependido");
    expect(sheet.opMeta?.rank).toBe("Agente Especial");
    expect(sheet.opMeta?.credit).toBe("Médio");
    expect(sheet.stats.hp?.value).toBeTypeOf("number");
    expect(sheet.stats.mp?.value).toBeTypeOf("number");
    expect(sheet.stats.san?.value).toBeTypeOf("number");

    const pre = sheet.abilities.find((a) => a.key === "pre");
    expect(pre?.score).toBe(4);
    expect(pre?.rollLabel).toBe("4d20");

    const ocultismo = sheet.skills.find((s) => s.name === "Ocultismo");
    expect(ocultismo?.rank).toBe("veterano");
    expect(ocultismo?.dice).toBe("3d20kh1+10");

    const cic = sheet.spells.find((sp) => sp.name === "Cicatrização");
    expect(cic?.element).toBe("Morte");
    expect(cic?.execution).toBe("padrão");
    expect(cic?.duration).toBe("instantânea");
    expect(sheet.attacks[0]?.name).toBe("Faca");
    expect(sheet.attacks[0]?.roll).toBe("2d20kh1+2");
  });
});
