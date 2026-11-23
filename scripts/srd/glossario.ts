/**
 * Glossário da tradução do SRD 5.1 (2014) e 5.2.1 (2024) para o português do Brasil.
 *
 * Segue a terminologia que os jogadores brasileiros de D&D 5e já usam. Também converte as
 * unidades como as edições em português fazem: 1,5 metro a cada 5 pés, 1,5 km por milha e
 * meio quilo por libra.
 *
 * Usado pelo conversor (build.ts) para os campos padronizados e como referência para
 * quem traduz os textos longos (arquivos i18n/*.json de cada pacote).
 */

export const ABILITY: Record<string, { name: string; abbr: string }> = {
  str: { name: "Força", abbr: "FOR" },
  dex: { name: "Destreza", abbr: "DES" },
  con: { name: "Constituição", abbr: "CON" },
  int: { name: "Inteligência", abbr: "INT" },
  wis: { name: "Sabedoria", abbr: "SAB" },
  cha: { name: "Carisma", abbr: "CAR" },
};

export const SKILL: Record<string, string> = {
  acrobatics: "Acrobacia",
  "animal-handling": "Lidar com Animais",
  arcana: "Arcanismo",
  athletics: "Atletismo",
  deception: "Enganação",
  history: "História",
  insight: "Intuição",
  intimidation: "Intimidação",
  investigation: "Investigação",
  medicine: "Medicina",
  nature: "Natureza",
  perception: "Percepção",
  performance: "Atuação",
  persuasion: "Persuasão",
  religion: "Religião",
  "sleight-of-hand": "Prestidigitação",
  stealth: "Furtividade",
  survival: "Sobrevivência",
};

export const CLASS: Record<string, string> = {
  barbarian: "Bárbaro",
  bard: "Bardo",
  cleric: "Clérigo",
  druid: "Druida",
  fighter: "Guerreiro",
  monk: "Monge",
  paladin: "Paladino",
  ranger: "Patrulheiro",
  rogue: "Ladino",
  sorcerer: "Feiticeiro",
  warlock: "Bruxo",
  wizard: "Mago",
};

export const SCHOOL: Record<string, string> = {
  abjuration: "Abjuração",
  conjuration: "Conjuração",
  divination: "Adivinhação",
  enchantment: "Encantamento",
  evocation: "Evocação",
  illusion: "Ilusão",
  necromancy: "Necromancia",
  transmutation: "Transmutação",
};

export const DAMAGE: Record<string, string> = {
  acid: "ácido",
  bludgeoning: "concussão",
  cold: "frio",
  fire: "fogo",
  force: "energia",
  lightning: "elétrico",
  necrotic: "necrótico",
  piercing: "perfurante",
  poison: "veneno",
  psychic: "psíquico",
  radiant: "radiante",
  slashing: "cortante",
  thunder: "trovejante",
};

export const CONDITION: Record<string, string> = {
  blinded: "Cego",
  charmed: "Enfeitiçado",
  deafened: "Surdo",
  exhaustion: "Exaustão",
  frightened: "Amedrontado",
  grappled: "Agarrado",
  incapacitated: "Incapacitado",
  invisible: "Invisível",
  paralyzed: "Paralisado",
  petrified: "Petrificado",
  poisoned: "Envenenado",
  prone: "Caído",
  restrained: "Impedido",
  stunned: "Atordoado",
  unconscious: "Inconsciente",
};

export const SIZE: Record<string, string> = {
  Tiny: "Miúdo",
  Small: "Pequeno",
  Medium: "Médio",
  Large: "Grande",
  Huge: "Enorme",
  Gargantuan: "Imenso",
  "Medium or Small": "Médio ou Pequeno",
  "Small or Medium": "Pequeno ou Médio",
};

/** Moedas: pc (cobre), pp (prata), pe (electro), po (ouro), pl (platina). Valores em po. */
export const CURRENCY: Record<string, { key: string; label: string; abbr: string; value: number }> = {
  cp: { key: "pc", label: "Peças de cobre", abbr: "pc", value: 0.01 },
  sp: { key: "pp", label: "Peças de prata", abbr: "pp", value: 0.1 },
  ep: { key: "pe", label: "Peças de electro", abbr: "pe", value: 0.5 },
  gp: { key: "po", label: "Peças de ouro", abbr: "po", value: 1 },
  pp: { key: "pl", label: "Peças de platina", abbr: "pl", value: 10 },
};

/** Termos de regra recorrentes, para quem traduz os textos (não é aplicado automaticamente). */
export const TERMS: Record<string, string> = {
  "Hit Points": "pontos de vida",
  "Hit Dice / Hit Point Dice": "Dados de Vida",
  "Armor Class (AC)": "Classe de Armadura (CA)",
  "saving throw": "teste de resistência",
  "ability check": "teste de habilidade",
  "ability score / modifier": "valor / modificador de habilidade",
  "attack roll": "jogada de ataque",
  "Proficiency Bonus": "bônus de proficiência",
  "advantage / disadvantage": "vantagem / desvantagem",
  "spell slot": "espaço de magia",
  cantrip: "truque",
  "spell attack": "ataque mágico",
  "spell save DC": "CD de resistência das suas magias",
  "spellcasting ability": "habilidade de conjuração",
  "spellcasting focus": "foco de conjuração",
  concentration: "concentração",
  "Action / Bonus Action / Reaction": "ação / ação bônus / reação",
  "Short Rest / Long Rest": "descanso curto / descanso longo",
  "Opportunity Attack": "ataque de oportunidade",
  "Difficult Terrain": "terreno difícil",
  "Temporary Hit Points": "pontos de vida temporários",
  "Unarmed Strike": "ataque desarmado",
  "Weapon Mastery": "maestria em arma",
  "Heroic Inspiration": "Inspiração Heroica",
  "Origin feat": "talento de origem",
  feat: "talento",
  "Species / Race": "espécie (2024) / raça (2014)",
  background: "antecedente",
  subclass: "subclasse",
  "Ability Score Improvement": "Aumento no Valor de Habilidade",
  "Fighting Style": "Estilo de Luta",
  Darkvision: "Visão no Escuro",
  "bright light / dim light / darkness": "luz plena / penumbra / escuridão",
  "Lightly / Heavily Obscured": "levemente / densamente obscurecido",
  "cone / cube / cylinder / line / sphere / emanation": "cone / cubo / cilindro / linha / esfera / emanação",
  "Dash / Disengage / Dodge / Help / Hide / Ready / Search / Use an Object": "Disparada / Desengajar / Esquivar / Ajudar / Esconder / Preparar / Procurar / Usar um Objeto",
};

/* ------------------------------------------------------------------ unidades */

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/** 5 pés = 1,5 metro. */
export const feetToMeters = (ft: number) => num(Math.round(ft * 0.3 * 10) / 10);
/** 1 libra = 0,5 kg. */
export const poundsToKg = (lb: number) => num(Math.round(lb * 0.5 * 100) / 100);
/** 1 milha = 1,5 km. */
export const milesToKm = (mi: number) => num(mi * 1.5);

/* ------------------------------------------------------------------ campos de magia */

const CASTING: Record<string, string> = {
  action: "1 ação",
  "1 action": "1 ação",
  "bonus action": "1 ação bônus",
  "1 bonus action": "1 ação bônus",
  reaction: "1 reação",
  "1 reaction": "1 reação",
  "1 minute": "1 minuto",
  "10 minutes": "10 minutos",
  "1 hour": "1 hora",
  "8 hours": "8 horas",
  "12 hours": "12 horas",
  "24 hours": "24 horas",
};

/** Tempo de conjuração. Reações e ações bônus com condição vêm traduzidas à mão (i18n). */
export function castingTime(s: string): string | undefined {
  return CASTING[s.trim().toLowerCase()];
}

/** Alcance ("60 feet", "Self (15-foot cone)", "Touch"...). Corrige "Component: ..." colado por erro na fonte. */
export function range(s: string): string | undefined {
  const t = s.replace(/\s*Component:.*$/i, "").trim();
  const fixed: Record<string, string> = { Self: "Pessoal", Touch: "Toque", Sight: "Visão", Special: "Especial", Unlimited: "Ilimitado" };
  if (fixed[t]) return fixed[t];
  let m = /^(\d+) (feet|foot)$/.exec(t);
  if (m) return `${feetToMeters(Number(m[1]))} metros`;
  m = /^(\d+) miles?$/.exec(t);
  if (m) return `${milesToKm(Number(m[1]))} km`;
  return undefined;
}

/** Duração ("Up to 1 minute" = concentração, "Until dispelled"...). */
export function duration(s: string): string | undefined {
  const t = s.trim().replace(/^Concentration,?\s*/i, "");
  const fixed: Record<string, string> = {
    Instantaneous: "Instantânea",
    "Until dispelled": "Até ser dissipada",
    "Until dispelled or triggered": "Até ser dissipada ou ativada",
    Special: "Especial",
  };
  if (fixed[t]) return fixed[t];
  const unit = (n: number, u: string) => {
    const pt: Record<string, [string, string]> = {
      round: ["rodada", "rodadas"],
      minute: ["minuto", "minutos"],
      hour: ["hora", "horas"],
      day: ["dia", "dias"],
    };
    const [one, many] = pt[u.replace(/s$/, "")] ?? [u, u];
    return `${n} ${n === 1 ? one : many}`;
  };
  const m = /^(up to )?(\d+) (rounds?|minutes?|hours?|days?)$/i.exec(t);
  if (m) return `${m[1] ? "Até " : ""}${unit(Number(m[2]), m[3].toLowerCase())}`;
  return undefined;
}

export const COMPONENT_LABEL: Record<string, string> = { V: "V", S: "S", M: "M" };
