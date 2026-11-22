import { z } from "zod";

/** Slots de peça: cada um guarda no máximo uma peça escolhida. */
export const SLOT_IDS = [
  "background",
  "body",
  "head",
  "ears",
  "eyes",
  "brows",
  "nose",
  "mouth",
  "beard",
  "hair",
  "horns",
  "hood",
  "cape",
  "torso",
  "legs",
  "feet",
  "armor",
  "belt",
  "necklace",
  "earrings",
  "wings",
  "tail",
  "shield",
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/** Slots do catálogo: os de peça única mais "marks" (marcas, que podem ser várias por avatar). */
export const CATALOG_SLOTS = [...SLOT_IDS, "marks"] as const;
export type CatalogSlot = (typeof CATALOG_SLOTS)[number];

/** Máximo de marcas (cicatrizes, tatuagens, pinturas) por avatar. */
export const MAX_MARKS = 8;

/** Slots que sempre têm uma peça (o rosto e o corpo não podem ficar vazios). */
export const REQUIRED_SLOTS: readonly SlotId[] = ["body", "head", "ears", "eyes", "brows", "nose", "mouth"];

/**
 * Ordem de desenho das camadas, de trás para a frente (seção 12 da especificação, adaptada).
 * Uma peça pode ocupar várias camadas (ex.: cabelo longo atrás e franja na frente).
 */
export const LAYER_ORDER = [
  "background",
  "capeBack",
  "wings",
  "tail",
  "hairBack",
  "hoodBack",
  "body",
  "legs",
  "feet",
  "torso",
  "armor",
  "belt",
  "necklace",
  "capeFront",
  "shield",
  "ears",
  "earrings",
  "head",
  "eyes",
  "brows",
  "nose",
  "mouth",
  "marks",
  "beard",
  "hairFront",
  "hoodFront",
  "horns",
] as const;
export type LayerId = (typeof LAYER_ORDER)[number];

/** Cores globais do personagem, usadas por várias peças. */
export const GLOBAL_REGIONS = ["skin", "hair", "eyeL", "eyeR", "horn"] as const;
export type GlobalRegion = (typeof GLOBAL_REGIONS)[number];
/** Cores próprias de cada peça (roupas, metais, fundo). */
export const PART_REGIONS = ["primary", "secondary", "metal", "bg", "ink"] as const;
export type PartRegion = (typeof PART_REGIONS)[number];

/** Marcador de cor dentro dos SVGs: #{regiao} ou #{regiao-light|dark|deep|blush}. */
export const TOKEN_RE = /#\{([a-zA-Z]+)(?:-(light|dark|deep|blush))?\}/g;

export interface AssetLayerRef {
  layer: LayerId;
  file: string;
}
export interface AssetPart {
  id: string;
  slot: CatalogSlot;
  name: string;
  tags?: string[];
  defaults?: Partial<Record<PartRegion, string>>;
  /** Ajustes que o usuário pode fazer nesta peça (limites de escala e deslocamento vertical). */
  adjust?: { scale?: [number, number]; dy?: [number, number] };
  /** Camadas de outras peças que esta esconde (ex.: o capuz esconde o cabelo de trás). */
  hides?: LayerId[];
  layers: AssetLayerRef[];
  /** Versão alternativa usada quando outro slot está preenchido (ex.: capuz com aberturas para chifres). */
  variants?: { whenSlot: SlotId; note?: string; layers: AssetLayerRef[] }[];
  /** Marcas: ponto de apoio de rotação e escala (centro do desenho). */
  pivot?: [number, number];
  /** Regiões de cor que a peça usa (calculado ao gerar os assets). */
  regions: string[];
}
export interface AssetCatalog {
  version: string;
  parts: AssetPart[];
  files: Record<string, string>;
}

/** Tipos físicos: escala horizontal do tronco e das pernas em torno do eixo central. */
export const BUILDS = {
  esguio: { label: "Esguio", torso: 0.88, legs: 0.92 },
  medio: { label: "Médio", torso: 1, legs: 1 },
  robusto: { label: "Robusto", torso: 1.14, legs: 1.08 },
} as const;
export type BuildId = keyof typeof BUILDS;

/** Categorias do painel esquerdo do Avatar Studio (seção 11). */
export const CATEGORIES: { id: string; label: string; slots: SlotId[]; colors?: GlobalRegion[]; build?: boolean; marks?: boolean }[] = [
  { id: "corpo", label: "Corpo", slots: ["head", "ears"], build: true },
  { id: "pele", label: "Pele", slots: [], colors: ["skin"] },
  { id: "rosto", label: "Rosto", slots: ["brows", "nose", "mouth", "beard"] },
  { id: "olhos", label: "Olhos", slots: ["eyes"], colors: ["eyeL", "eyeR"] },
  { id: "cabelo", label: "Cabelo", slots: ["hair"], colors: ["hair"] },
  { id: "chifres", label: "Chifres", slots: ["horns"], colors: ["horn"] },
  { id: "extras", label: "Asas e cauda", slots: ["wings", "tail"] },
  { id: "marcas", label: "Marcas", slots: [], marks: true },
  { id: "roupas", label: "Roupas", slots: ["torso", "legs", "feet", "hood", "cape"] },
  { id: "armaduras", label: "Armaduras", slots: ["armor", "shield"] },
  { id: "acessorios", label: "Acessórios", slots: ["belt", "necklace", "earrings"] },
  { id: "fundo", label: "Fundo", slots: ["background"] },
];

export const SLOT_LABEL: Record<SlotId, string> = {
  background: "Fundo",
  body: "Corpo",
  head: "Formato da cabeça",
  ears: "Orelhas",
  eyes: "Olhos",
  brows: "Sobrancelhas",
  nose: "Nariz",
  mouth: "Boca",
  beard: "Barba",
  hair: "Cabelo",
  horns: "Chifres",
  hood: "Capuz",
  cape: "Capa",
  torso: "Roupa do tronco",
  legs: "Roupa das pernas",
  feet: "Calçados",
  armor: "Armadura",
  belt: "Cinto",
  necklace: "Colar",
  earrings: "Brincos",
  wings: "Asas",
  tail: "Cauda",
  shield: "Escudo",
};

export const REGION_LABEL: Record<GlobalRegion | PartRegion, string> = {
  skin: "Pele",
  hair: "Cabelo e pelos",
  eyeL: "Olho esquerdo",
  eyeR: "Olho direito",
  horn: "Chifres",
  primary: "Cor principal",
  secondary: "Detalhes",
  metal: "Metal",
  bg: "Cor do fundo",
  ink: "Cor da tinta",
};

/** Paletas sugeridas e usadas pela randomização. O seletor livre aceita qualquer cor. */
export const PALETTES = {
  skin: ["#f3d2b3", "#e8b98f", "#c98e6a", "#a86f4c", "#7d4f34", "#5a3624", "#3f2519"],
  skinFantasy: ["#b8423a", "#5a7fc4", "#5f9a55", "#7b5aa6", "#8c9098", "#e9edf2", "#2b2b33", "#b9a56a"],
  hair: ["#1f1712", "#3b2a20", "#6b4428", "#a3672f", "#d6b26e", "#e8e1d2", "#8a8f96", "#a3312b"],
  hairFantasy: ["#4a6fd1", "#6fbf73", "#c25ca8", "#f2f2f2", "#7c3fbf"],
  eyes: ["#4a7a3a", "#3e6aa0", "#6b4a2a", "#8a8a8a", "#2f8f80", "#c09a2a", "#9a3030", "#7b4fb0"],
  horn: ["#e8dcc4", "#3a302a", "#6b5a48", "#8a2f2f", "#2b2b2b", "#c9a66b"],
  cloth: ["#5b6e8c", "#6b2a34", "#4a5a3c", "#3c3a6b", "#6b4a32", "#2f3a40", "#8c6b3a", "#e8dcc4", "#7a3c5c"],
  metal: ["#a9b0b8", "#9aa0a6", "#b08d57", "#c9a66b", "#6f6a64"],
  bg: ["#d9c9a3", "#7d7468", "#2c3560", "#4a3b52", "#3f5a4a"],
  ink: ["#1f3a6b", "#2b2b2b", "#8a2f2f", "#3f8f7a", "#c9a66b", "#e9e4d6", "#6b2a7a"],
} as const;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Cor inválida (use #rrggbb).").transform((s) => s.toLowerCase());

export const slotChoiceSchema = z.object({
  part: z.string().regex(/^[a-z]+:[a-z0-9-]+$/).nullable(),
  colors: z.partialRecord(z.enum(PART_REGIONS), hex).default({}),
  transform: z.object({ scale: z.number().min(0.5).max(2).optional(), dy: z.number().min(-60).max(60).optional() }).optional(),
});
export type SlotChoice = z.infer<typeof slotChoiceSchema>;

/** Limites dos ajustes de uma marca (posição relativa ao desenho original). */
export const MARK_LIMITS = { dx: [-120, 120], dy: [-140, 140], scale: [0.5, 2], rotate: [-180, 180], opacity: [0.2, 1] } as const;

export const markSchema = z.object({
  part: z.string().regex(/^marks:[a-z0-9-]+$/),
  dx: z.number().min(MARK_LIMITS.dx[0]).max(MARK_LIMITS.dx[1]).default(0),
  dy: z.number().min(MARK_LIMITS.dy[0]).max(MARK_LIMITS.dy[1]).default(0),
  scale: z.number().min(MARK_LIMITS.scale[0]).max(MARK_LIMITS.scale[1]).default(1),
  rotate: z.number().min(MARK_LIMITS.rotate[0]).max(MARK_LIMITS.rotate[1]).default(0),
  opacity: z.number().min(MARK_LIMITS.opacity[0]).max(MARK_LIMITS.opacity[1]).default(1),
  /** Espelha a marca no eixo do rosto (lado esquerdo vira direito). */
  mirror: z.boolean().default(false),
  /** Cor da tinta (tatuagens e pinturas). Cicatrizes e sardas seguem a pele. */
  color: hex.optional(),
});
export type Mark = z.infer<typeof markSchema>;

/**
 * O avatar salvo: configuração estruturada e editável, nunca só a imagem (seção 13).
 * `assets` registra a versão do catálogo de peças usada.
 */
export const avatarConfigSchema = z.object({
  schema: z.literal(1),
  assets: z.string(),
  build: z.enum(Object.keys(BUILDS) as [BuildId, ...BuildId[]]),
  colors: z.object({ skin: hex, hair: hex, eyeL: hex, eyeR: hex, horn: hex }),
  slots: z.partialRecord(z.enum(SLOT_IDS), slotChoiceSchema),
  marks: z.array(markSchema).max(MAX_MARKS).default([]),
});
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;
