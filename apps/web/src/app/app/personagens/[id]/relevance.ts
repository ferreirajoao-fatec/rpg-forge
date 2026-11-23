import type { Catalog, CharacterData, ContentEntry } from "@rpg-forge/rules-engine";

/**
 * De onde vem a afinidade de uma opção com o personagem. Serve só para ordenar e
 * filtrar a lista (o que "é para você"); quem decide se a escolha é válida continua
 * sendo o motor de regras (evaluateOption).
 */
export type Fit = "class" | "species" | "deity" | "origin" | "general" | "other";

export const FIT_ORDER: Fit[] = ["class", "species", "deity", "origin", "general", "other"];

export interface FitInfo {
  fit: Fit;
  /** Texto curto exibido no cartão (ex.: "Da sua classe: Ladino"). */
  label: string;
}

/** Contexto calculado uma vez por lista. */
export interface FitContext {
  classId?: string;
  className?: string;
  /** A classe escolhida lança magias? */
  classCasts: boolean;
  speciesName?: string;
  /** Texto das habilidades da raça, para achar magias e poderes que ela concede. */
  speciesText: string;
  deityId?: string;
  deityName?: string;
  originName?: string;
  originSkills: Set<string>;
  originPowerNames: Set<string>;
  classSkills: Set<string>;
  proficiencies: Set<string>;
  /**
   * D&D 5e: armaduras que a classe sabe usar ("leve", "media", "pesada", "escudo"). No D&D ninguém
   * tem proficiência por padrão; no Tormenta20 todos sabem usar armas simples e armaduras leves.
   */
  dndArmor?: Set<string>;
  /** Perícias que a raça concede (D&D). */
  speciesSkills: Set<string>;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

export function fitContext(data: CharacterData, catalog: Catalog): FitContext {
  const cls = data.classes[0] ? catalog.get(data.classes[0].classId) : undefined;
  const sp = data.speciesId ? catalog.get(data.speciesId) : undefined;
  const deityId = data.choices.find((c) => c.slot === "deity")?.contentId;
  const origin = data.backgroundId ? catalog.get(data.backgroundId) : undefined;
  const skills = (cls?.data.skills ?? {}) as { fixed?: string[]; from?: string[]; oneOf?: string[][] };
  const traits = (sp?.data.traits as { name: string; summary: string }[] | undefined) ?? [];
  const dndArmor = Array.isArray(cls?.data.armor) ? new Set(cls.data.armor as string[]) : undefined;
  const baseProfs = dndArmor ? [] : ["armas simples", "armaduras leves"];
  return {
    classId: cls?.id,
    className: cls?.name,
    classCasts: !!cls?.data.spellcasting,
    speciesName: sp?.name,
    speciesText: norm(traits.map((t) => `${t.name}. ${t.summary}`).join(" ")),
    deityId,
    deityName: deityId ? catalog.get(deityId)?.name : undefined,
    originName: origin?.name,
    // Tormenta20: perícias que a origem oferece; D&D: perícias que o antecedente dá.
    originSkills: new Set([...((origin?.data.skillOptions as string[] | undefined) ?? []), ...(Array.isArray(origin?.data.skills) ? (origin.data.skills as string[]) : [])]),
    originPowerNames: new Set(((origin?.data.powerOptions as string[] | undefined) ?? []).map(norm)),
    classSkills: new Set([...(skills.fixed ?? []), ...(skills.from ?? []), ...(skills.oneOf ?? []).flat()]),
    proficiencies: new Set([...baseProfs, ...((cls?.data.proficiencies as string[] | undefined) ?? [])]),
    dndArmor,
    speciesSkills: new Set(Array.isArray(sp?.data.skills) ? (sp.data.skills as string[]) : []),
  };
}

/** Classes e conteúdos citados nos pré-requisitos de uma opção. */
function prereqRefs(entry: ContentEntry): { classes: Set<string>; content: Set<string> } {
  const classes = new Set<string>();
  const content = new Set<string>();
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.classId === "string") classes.add(o.classId);
      if (typeof o.contentId === "string") content.add(o.contentId);
      Object.values(o).forEach(walk);
    }
  };
  walk((entry as { prerequisites?: unknown }).prerequisites);
  return { classes, content };
}

/** A raça cita esta opção pelo nome (ex.: meia-dríade e a magia Controlar Plantas)? */
const citedBySpecies = (entry: ContentEntry, ctx: FitContext) => ctx.speciesText !== "" && ctx.speciesText.includes(norm(entry.name));

const MAGIC_ITEMS = new Set(["arma-magica", "armadura-magica", "acessorio", "pocao", "artefato"]);

export function fitOf(kind: string, entry: ContentEntry, ctx: FitContext, catalog: Catalog): FitInfo {
  const general: FitInfo = { fit: "general", label: "Geral" };
  const species: FitInfo = { fit: "species", label: `Da sua raça: ${ctx.speciesName}` };
  const fromClass: FitInfo = { fit: "class", label: `Da sua classe: ${ctx.className}` };

  if (kind === "power") {
    const { classes, content } = prereqRefs(entry);
    if (ctx.originPowerNames.has(norm(entry.name))) return { fit: "origin", label: `Da sua origem: ${ctx.originName}` };
    if (citedBySpecies(entry, ctx)) return species;
    if (entry.data.group === "concedido") {
      if (ctx.deityId && content.has(ctx.deityId)) return { fit: "deity", label: `Concedido por ${ctx.deityName}` };
      return { fit: "other", label: "Concedido por outra divindade" };
    }
    if (classes.size) {
      if (ctx.classId && classes.has(ctx.classId)) return fromClass;
      const names = [...classes].map((id) => catalog.get(id)?.name ?? id).join(", ");
      return { fit: "other", label: `De outra classe: ${names}` };
    }
    if (entry.data.group === "aberrante") return { fit: "general", label: "Poder da Tormenta (geral, com penalidade)" };
    return { fit: "general", label: entry.data.group === "destino" ? "Poder geral de destino" : entry.data.group === "combate" ? "Poder geral de combate" : "Poder geral" };
  }

  if (kind === "spell") {
    if (citedBySpecies(entry, ctx)) return species;
    const { classes } = prereqRefs(entry);
    if (ctx.classId && classes.has(ctx.classId)) return fromClass;
    if (!classes.size) return general;
    const names = [...classes].map((id) => catalog.get(id)?.name ?? id).join(", ");
    return { fit: "other", label: `Magia de: ${names}` };
  }

  if (kind === "skill") {
    if (ctx.dndArmor) {
      // D&D: antecedente e raça dão perícias prontas; a classe escolhe da própria lista.
      if (ctx.originSkills.has(entry.id)) return { fit: "origin", label: `Já vem do antecedente: ${ctx.originName}` };
      if (ctx.speciesSkills.has(entry.id)) return { fit: "species", label: `Já vem da raça: ${ctx.speciesName}` };
      if (ctx.classSkills.has(entry.id)) return fromClass;
      return { fit: "other", label: "Fora da lista da classe" };
    }
    if (ctx.classSkills.has(entry.id)) return fromClass;
    if (ctx.originSkills.has(entry.id)) return { fit: "origin", label: `Da sua origem: ${ctx.originName}` };
    if (citedBySpecies(entry, ctx)) return species;
    return { fit: "other", label: "Fora da lista da classe (só pelo bônus de Inteligência)" };
  }

  if (kind === "equipment" && ctx.dndArmor) return dndEquipmentFit(entry, ctx);

  if (kind === "equipment") {
    const cat = String(entry.data.category);
    if (MAGIC_ITEMS.has(cat)) return { fit: "other", label: "Item mágico (normalmente obtido em aventuras)" };
    if (cat === "arma") {
      const p = String(entry.data.proficiency ?? "");
      const need = { simples: "armas simples", marciais: "armas marciais", exoticas: "armas exóticas", fogo: "armas de fogo" }[p];
      if (!need || need === "armas simples") return { fit: "general", label: "Arma simples (todos sabem usar)" };
      if (ctx.proficiencies.has(need)) return { fit: "class", label: `Sua classe sabe usar (${need})` };
      return { fit: "other", label: `Exige proficiência com ${need} (–5 no ataque sem ela)` };
    }
    if (cat === "armadura") {
      if (entry.data.armorType !== "pesada") return { fit: "general", label: "Armadura leve (todos sabem usar)" };
      if (ctx.proficiencies.has("armaduras pesadas")) return { fit: "class", label: "Sua classe sabe usar (armaduras pesadas)" };
      return { fit: "other", label: "Exige proficiência com armaduras pesadas" };
    }
    if (cat === "escudo") {
      if (ctx.proficiencies.has("escudos")) return { fit: "class", label: "Sua classe sabe usar (escudos)" };
      return { fit: "other", label: "Exige proficiência com escudos" };
    }
    return general;
  }

  return general;
}

/** Equipamento no D&D 5e: proficiências da classe com armas (simples/marciais) e armaduras. */
function dndEquipmentFit(entry: ContentEntry, ctx: FitContext): FitInfo {
  const cat = String(entry.data.category);
  const armor = ctx.dndArmor ?? new Set<string>();
  if (cat === "arma") {
    const need = entry.data.proficiency === "marciais" ? "armas marciais" : "armas simples";
    const name = entry.name.toLocaleLowerCase("pt-BR");
    if (ctx.proficiencies.has(need) || ctx.proficiencies.has(name)) return { fit: "class", label: `Sua classe sabe usar (${ctx.proficiencies.has(need) ? need : name})` };
    return { fit: "other", label: `Sem proficiência (${need}): não soma o bônus de proficiência no ataque` };
  }
  if (cat === "armadura") {
    const type = String(entry.data.armorType);
    const label = { leve: "armaduras leves", media: "armaduras médias", pesada: "armaduras pesadas" }[type] ?? "armaduras";
    if (armor.has(type)) return { fit: "class", label: `Sua classe sabe usar (${label})` };
    return { fit: "other", label: `Sem proficiência com ${label}: desvantagem e sem magias` };
  }
  if (cat === "escudo") {
    if (armor.has("escudo")) return { fit: "class", label: "Sua classe sabe usar (escudos)" };
    return { fit: "other", label: "Sem proficiência com escudos" };
  }
  return { fit: "general", label: "Geral" };
}

/** Opções que aparecem no modo "Para você": tudo menos o que é de outra classe, divindade etc. */
export const isForYou = (f: Fit) => f !== "other";

export const FIT_TITLE: Record<Fit, string> = {
  class: "Da sua classe",
  species: "Da sua raça",
  deity: "Da sua divindade",
  origin: "Da sua origem",
  general: "Gerais (qualquer personagem)",
  other: "Outras opções",
};
