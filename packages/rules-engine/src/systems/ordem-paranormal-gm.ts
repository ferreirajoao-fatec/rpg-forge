/**
 * Ferramentas do mestre para Ordem Paranormal RPG (v1.1):
 *  - Construindo Combates por Valor de Desafio (VD) comparado à soma do NEX do grupo (p. 177);
 *  - Cálculo de Pontos de Prestígio por Missão (Tabela 3.2, p. 53).
 */

export interface OpEncounterGroup {
  vd: number;
  count: number;
}

export type OpDifficulty = "trivial" | "facil" | "equilibrado" | "dificil" | "mortal";

export interface OpEncounterBalance {
  totalVd: number;
  partyNex: number;
  ratio: number;
  difficulty: OpDifficulty;
  label: string;
  guidance: string;
}

/**
 * Avalia o equilíbrio do combate pela regra da p. 177:
 *  - Soma o VD de todas as ameaças e compara com a soma do NEX do grupo;
 *  - ≈ 0,5× = Fácil; ≈ 1× = Equilibrado; ≈ 1,5× = Difícil (veteranos: até 2×).
 */
export function evaluateOpEncounter(
  groups: OpEncounterGroup[],
  party: { size: number; avgNex: number; veteran?: boolean },
): OpEncounterBalance {
  const totalVd = groups.reduce((acc, g) => acc + Math.max(0, g.vd) * Math.max(0, g.count), 0);
  const partyNex = Math.max(1, party.size * party.avgNex);
  const ratio = totalVd / partyNex;

  if (totalVd === 0) {
    return {
      totalVd: 0,
      partyNex,
      ratio: 0,
      difficulty: "trivial",
      label: "—",
      guidance: "Adicione ameaças para calcular o Valor de Desafio do combate.",
    };
  }

  // Jogadores veteranos lidam com encontros uma categoria acima (difícil = 2× o NEX do grupo).
  const hardLimit = party.veteran ? 2.0 : 1.5;
  const balancedHigh = party.veteran ? 1.5 : 1.25;
  const easyHigh = 0.75;
  const trivialHigh = 0.35;

  let difficulty: OpDifficulty;
  let label: string;
  let guidance: string;
  if (ratio < trivialHigh) {
    difficulty = "trivial";
    label = "Muito fácil";
    guidance = `VD ${totalVd} está bem abaixo da metade do NEX do grupo (${Math.round(partyNex * 0.5)}).`;
  } else if (ratio <= easyHigh) {
    difficulty = "facil";
    label = "Fácil";
    guidance = `Próximo da metade do NEX do grupo (${Math.round(partyNex * 0.5)}): bom para aquecimento ou missões com vários combates.`;
  } else if (ratio <= balancedHigh) {
    difficulty = "equilibrado";
    label = "Equilibrado";
    guidance = `Equivalente ao NEX total do grupo (${partyNex}): um grupo suporta 1 ou 2 combates assim antes de descansar.`;
  } else if (ratio <= hardLimit) {
    difficulty = "dificil";
    label = "Difícil";
    guidance = party.veteran
      ? `Entre 1,5× e 2× o NEX do grupo (regra para jogadores veteranos): clímax perigoso.`
      : `Próximo de 1,5× o NEX do grupo (${Math.round(partyNex * 1.5)}): indicado para o clímax da missão.`;
  } else {
    difficulty = "mortal";
    label = "Extremo / Mortal";
    guidance = `Acima de ${hardLimit}× o NEX do grupo (${Math.round(partyNex * hardLimit)}): risco elevado de mortes — considere fuga ou Enigma de Medo.`;
  }

  return { totalVd, partyNex, ratio, difficulty, label, guidance };
}

export interface MissionPrestigeInput {
  solvedCase: boolean;
  extraClues: number;
  innocentDeaths: number;
  agentDeaths: number;
}

/** Tabela 3.2: Pontos de Prestígio por Missão (p. 53). */
export function calculateMissionPrestige(input: MissionPrestigeInput): { total: number; breakdown: string[] } {
  const parts: string[] = [];
  let total = 0;
  if (input.solvedCase) {
    total += 10;
    parts.push("Solução do caso (+10)");
  }
  if (input.extraClues > 0) {
    const v = input.extraClues * 2;
    total += v;
    parts.push(`${input.extraClues} pista(s) adicional(is) (+${v})`);
  }
  if (input.innocentDeaths > 0) {
    const v = input.innocentDeaths * 2;
    total -= v;
    parts.push(`${input.innocentDeaths} morte(s) de inocente (–${v})`);
  }
  if (input.agentDeaths > 0) {
    const v = input.agentDeaths * 5;
    total -= v;
    parts.push(`${input.agentDeaths} morte(s) de agente (–${v})`);
  }
  return { total, breakdown: parts };
}
