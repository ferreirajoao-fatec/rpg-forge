/**
 * Ponto de entrada público do motor de regras.
 * Novos sistemas são adicionados registrando um motor aqui — a interface
 * consome apenas o contrato RulesEngine.
 */
import type { RulesEngine } from "./core/engine";
import type { RulesetId } from "./core/types";
import { Dnd5e2014Engine } from "./systems/dnd5e-2014";
import { Dnd5e2024Engine } from "./systems/dnd5e-2024";
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

export * from "./core/types";
export * from "./core/character";
export * from "./core/content";
export * from "./core/engine";
export * from "./core/dice";
export * from "./core/money";
export { T20_XP_THRESHOLDS } from "./systems/tormenta20";
export { DND_XP_THRESHOLDS } from "./systems/dnd5e-common";
