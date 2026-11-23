import type { CharacterData } from "./character";
import { totalLevel } from "./character";
import type { SourceRef } from "./types";

/**
 * Progressão: o que muda quando o personagem sobe de nível.
 *
 * O plano é calculado comparando a ficha derivada antes e depois (vale para qualquer
 * sistema) e somando o que o motor do sistema sabe sobre aquele nível (habilidades
 * de classe, aumentos de atributo, subclasse...).
 */

export interface LevelUpGain {
  /** "stat" = número que muda sozinho; "feature" = habilidade ganha; "choice" = decisão do jogador. */
  kind: "stat" | "feature" | "choice";
  label: string;
  detail?: string;
  /** Etapa do editor onde a escolha é feita. */
  stepId?: string;
  source?: SourceRef;
}

export interface LevelUpPlan {
  from: number;
  to: number;
  /** Falso quando não dá para subir (nível máximo, XP insuficiente). */
  canLevelUp: boolean;
  /** Motivo de não poder subir, para mostrar ao jogador. */
  blockedReason?: string;
  /** Progressão por XP: XP atual e o mínimo do próximo nível. */
  xp?: { current: number; needed: number };
  gains: LevelUpGain[];
}

/**
 * Sobe um nível: o nível declarado e o da classe principal.
 * Multiclasse ainda não é tratada aqui: o nível vai sempre para a primeira classe.
 */
export function applyLevelUp(c: CharacterData): CharacterData {
  const to = totalLevel(c) + 1;
  return {
    ...c,
    level: to,
    classes: c.classes.map((cl, i) => (i === 0 ? { ...cl, levels: cl.levels + 1 } : cl)),
  };
}
