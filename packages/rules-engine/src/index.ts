/**
 * Ponto de entrada público do motor de regras.
 * Novos sistemas são adicionados registrando um motor aqui — a interface
 * consome apenas o contrato RulesEngine.
 */
import type { RulesEngine } from "./core/engine";
import type { RulesetId } from "./core/types";
import { Dnd5e2014Engine } from "./systems/dnd5e-2014";
import { Dnd5e2024Engine } from "./systems/dnd5e-2024";
import { OrdemParanormalEngine } from "./systems/ordem-paranormal";
import { Tormenta20Engine } from "./systems/tormenta20";

const engines = new Map<string, RulesEngine>();

export function registerEngine(engine: RulesEngine): void {
  if (engines.has(engine.meta.id)) throw new Error(`Motor "${engine.meta.id}" já registrado.`);
  engines.set(engine.meta.id, engine);
}

export function getEngine(id: RulesetId): RulesEngine {
  const e = engines.get(id);
  if (!e) throw new Error(`Conjunto de regras desconhecido: ${id}`);
  return e;
}

export function hasEngine(id: string): boolean {
  return engines.has(id);
}

export function listEngines(): RulesEngine[] {
  return [...engines.values()];
}

registerEngine(new Dnd5e2014Engine());
registerEngine(new Dnd5e2024Engine());
registerEngine(new Tormenta20Engine());
registerEngine(new OrdemParanormalEngine());

export * from "./core/types";
export * from "./core/character";
export * from "./core/content";
export * from "./core/engine";
export * from "./core/progression";
export * from "./core/dice";
export * from "./core/money";
export { generateCompleteCharacter } from "./core/generator";
export { T20_XP_THRESHOLDS } from "./systems/tormenta20";
export { DND_XP_THRESHOLDS } from "./systems/dnd5e-common";
export {
  DND_CR_LIST,
  DND_CR_XP,
  DND_XP_THRESHOLDS_BY_LEVEL,
  DND_SRD_MONSTER_PRESETS,
  dndEncounterMultiplier,
  evaluateDndEncounter,
  type DndCrInfo,
  type DndEncounterDifficulty,
  type DndEncounterEvaluation,
  type DndMonsterPreset,
} from "./systems/dnd5e-gm";
export {
  OP_NEX_BY_LEVEL,
  OP_OPTIONAL_RULES,
  nexOfLevel,
  levelOfNex,
  formatOpCategory,
  OP_RANKS,
  evaluateOpEncounter,
  calculateMissionPrestige,
  parseExtraPeCost,
  ritualCostSummary,
} from "./systems/ordem-paranormal";
