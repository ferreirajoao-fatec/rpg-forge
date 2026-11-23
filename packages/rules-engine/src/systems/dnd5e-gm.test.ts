import { describe, expect, it } from "vitest";
import { DND_CR_XP, dndEncounterMultiplier, evaluateDndEncounter } from "./dnd5e-gm";

describe("dnd5e-gm encounter calculator", () => {
  it("calculates thresholds and single-monster difficulty for a 4-player level 1 party", () => {
    const res = evaluateDndEncounter({
      partyLevels: [1, 1, 1, 1],
      monsters: [{ cr: "1", count: 1 }],
    });
    expect(res.thresholds).toEqual({ easy: 100, medium: 200, hard: 300, deadly: 400, daily: 1200 });
    expect(res.rawXp).toBe(200);
    expect(res.multiplier).toBe(1);
    expect(res.adjustedXp).toBe(200);
    expect(res.difficulty).toBe("medium");
  });

  it("applies enemy count and small/large party multipliers accurately", () => {
    expect(dndEncounterMultiplier(1, 4)).toBe(1);
    expect(dndEncounterMultiplier(2, 4)).toBe(1.5);
    expect(dndEncounterMultiplier(4, 4)).toBe(2);
    expect(dndEncounterMultiplier(4, 2)).toBe(2.5);
    expect(dndEncounterMultiplier(4, 6)).toBe(1.5);

    const horde = evaluateDndEncounter({
      partyLevels: [3, 3, 3, 3],
      monsters: [{ cr: "1/4", count: 6 }],
    });
    expect(horde.rawXp).toBe(DND_CR_XP["1/4"] * 6);
    expect(horde.multiplier).toBe(2);
    expect(horde.adjustedXp).toBe(600);
    expect(horde.difficulty).toBe("medium");
  });

  it("classifies deadly encounters above deadly threshold", () => {
    const boss = evaluateDndEncounter({
      partyLevels: [5, 5, 5, 5],
      monsters: [{ cr: "10", count: 1 }],
    });
    expect(boss.adjustedXp).toBe(5900);
    expect(boss.thresholds.deadly).toBe(4400);
    expect(boss.difficulty).toBe("deadly");
  });
});
