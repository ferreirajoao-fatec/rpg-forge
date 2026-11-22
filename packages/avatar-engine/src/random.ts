import { defaultCatalog, type PartCatalog } from "./catalog";
import { CATEGORIES, PALETTES, REQUIRED_SLOTS, type AvatarConfig, type BuildId, type GlobalRegion, type Mark, type SlotId } from "./model";

export type Rng = () => number;

/** Gerador determinístico (mulberry32): a mesma semente gera o mesmo avatar, útil em testes e no "regenerar". */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

/** Chance de um slot opcional ficar preenchido na randomização. */
const FILL_CHANCE: Partial<Record<SlotId, number>> = {
  beard: 0.35,
  horns: 0.3,
  hood: 0.2,
  cape: 0.35,
  armor: 0.45,
  belt: 0.7,
  necklace: 0.35,
  earrings: 0.3,
  wings: 0.12,
  tail: 0.15,
  shield: 0.25,
  hair: 0.92,
  background: 1,
  torso: 1,
  legs: 1,
  feet: 0.9,
};

export interface RandomizeOptions {
  /** Categorias a randomizar (ids de CATEGORIES). Padrão: todas. */
  categories?: string[];
  /** Categorias travadas: nunca mudam, mesmo se pedidas. */
  locked?: Iterable<string>;
  /** Permite peças e cores fantásticas (pele azul, chifres, olhos reptilianos...). Padrão: sim. */
  fantasy?: boolean;
  rng?: Rng;
  catalog?: PartCatalog;
}

/**
 * Randomiza só as categorias pedidas e não travadas, preservando todo o resto (seção 3.3).
 * Slots obrigatórios nunca ficam vazios.
 */
export function randomize(config: AvatarConfig, opts: RandomizeOptions = {}): AvatarConfig {
  const rng = opts.rng ?? Math.random;
  const catalog = opts.catalog ?? defaultCatalog;
  const fantasy = opts.fantasy ?? true;
  const locked = new Set(opts.locked ?? []);
  const wanted = new Set(opts.categories ?? CATEGORIES.map((c) => c.id));
  const next: AvatarConfig = { ...config, colors: { ...config.colors }, slots: { ...config.slots }, marks: [...(config.marks ?? [])] };

  const colorFor = (region: GlobalRegion): string => {
    switch (region) {
      case "skin":
        return fantasy && rng() < 0.3 ? pick(rng, PALETTES.skinFantasy) : pick(rng, PALETTES.skin);
      case "hair":
        return fantasy && rng() < 0.15 ? pick(rng, PALETTES.hairFantasy) : pick(rng, PALETTES.hair);
      case "horn":
        return pick(rng, PALETTES.horn);
      default:
        return pick(rng, PALETTES.eyes);
    }
  };

  for (const cat of CATEGORIES) {
    if (!wanted.has(cat.id) || locked.has(cat.id)) continue;
    if (cat.build) next.build = pick(rng, ["esguio", "medio", "robusto"] as BuildId[]);
    for (const region of cat.colors ?? []) next.colors[region] = colorFor(region);
    if (cat.marks) {
      const options = catalog.forSlot("marks");
      const count = !options.length ? 0 : rng() < 0.55 ? 0 : rng() < 0.75 ? 1 : 2;
      next.marks = Array.from({ length: count }, (): Mark => {
        const part = pick(rng, options);
        return {
          part: part.id,
          dx: Math.round((rng() - 0.5) * 16),
          dy: Math.round((rng() - 0.5) * 16),
          scale: 1,
          rotate: Math.round((rng() - 0.5) * 20),
          opacity: 1,
          mirror: rng() < 0.5,
          color: part.regions.includes("ink") ? pick(rng, PALETTES.ink) : undefined,
        };
      });
    }
    if (cat.id === "olhos") next.colors.eyeR = rng() < 0.08 ? colorFor("eyeR") : next.colors.eyeL; // heterocromia é rara
    for (const slot of cat.slots) {
      const options = catalog.forSlot(slot).filter((p) => fantasy || !p.tags?.includes("fantastico"));
      const required = REQUIRED_SLOTS.includes(slot);
      if (!options.length || (!required && rng() > (FILL_CHANCE[slot] ?? 0.5))) {
        if (!required) next.slots[slot] = { part: null, colors: {} };
        continue;
      }
      const part = pick(rng, options);
      const colors: Record<string, string> = {};
      if (part.regions.includes("primary")) colors.primary = pick(rng, PALETTES.cloth);
      if (part.regions.includes("secondary")) colors.secondary = pick(rng, PALETTES.cloth);
      if (part.regions.includes("metal")) colors.metal = pick(rng, PALETTES.metal);
      if (part.regions.includes("bg")) colors.bg = pick(rng, PALETTES.bg);
      if (slot === "wings" && fantasy) colors.primary = pick(rng, ["#efe9dc", "#5a2a34", "#9fd8e8", "#2b2b33", "#c9a66b"]);
      next.slots[slot] = { part: part.id, colors };
    }
  }
  return next;
}
