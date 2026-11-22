import { defaultCatalog, type PartCatalog } from "./catalog";
import { LINE_COLOR, shade } from "./color";
import { BUILDS, LAYER_ORDER, MARK_LIMITS, TOKEN_RE, type AssetLayerRef, type AssetPart, type AvatarConfig, type CatalogSlot, type LayerId, type SlotId } from "./model";

export const CANVAS = { width: 512, height: 768 } as const;

/** Enquadramentos prontos (seção 11: corpo inteiro e aproximação no rosto; seção 13: retrato e token). */
export const FRAMES = {
  full: { x: 0, y: 0, width: 512, height: 768 },
  portrait: { x: 136, y: 36, width: 240, height: 240 },
  bust: { x: 96, y: 24, width: 320, height: 400 },
} as const;
export type FrameId = keyof typeof FRAMES;

/** Uma camada pronta para desenhar: SVG completo (512×768) já com cores e transformações. */
export interface ComposedLayer {
  key: string;
  slot: CatalogSlot;
  partId: string;
  layer: LayerId;
  svg: string;
}

export interface Composition {
  layers: ComposedLayer[];
  /** Avisos de compatibilidade aplicados (ex.: variante do capuz para chifres). */
  notes: string[];
}

/** Ponto de apoio das transformações de cada slot ajustável (base dos chifres, no topo da cabeça). */
const PIVOT: Partial<Record<SlotId, [number, number]>> = { horns: [256, 112] };

const anchorTransform = (sx: number) => (sx === 1 ? "" : `translate(256 0) scale(${sx} 1) translate(-256 0)`);

/** Substitui os marcadores de cor de um SVG. Regiões sem cor definida caem num cinza neutro. */
export function colorize(svg: string, colors: Record<string, string | undefined>): string {
  return svg.replace(TOKEN_RE, (_m, region: string, variant?: string) => {
    if (region === "line") return LINE_COLOR;
    return shade(colors[region] ?? "#808080", variant);
  });
}

/** Prefixa ids internos (gradientes, filtros, padrões) para que camadas juntas num só documento não colidam. */
function scopeIds(svg: string, prefix: string): string {
  return svg.replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
}

function layerRefs(part: AssetPart, config: AvatarConfig, notes: string[]): AssetLayerRef[] {
  for (const v of part.variants ?? []) {
    if (config.slots[v.whenSlot]?.part) {
      if (v.note) notes.push(v.note);
      return v.layers;
    }
  }
  return part.layers;
}

/** Resolve as camadas do avatar na ordem de desenho, aplicando variantes, peças escondidas e ajustes. */
export function compose(config: AvatarConfig, catalog: PartCatalog = defaultCatalog): Composition {
  const notes: string[] = [];
  const build = BUILDS[config.build];
  const active: { slot: SlotId; part: AssetPart }[] = [];
  for (const [slot, choice] of Object.entries(config.slots) as [SlotId, NonNullable<AvatarConfig["slots"][SlotId]>][]) {
    const part = catalog.get(choice?.part);
    if (part && part.slot === slot) active.push({ slot, part });
  }
  const hidden = new Set<LayerId>(active.flatMap((a) => a.part.hides ?? []));
  for (const a of active) {
    for (const h of a.part.hides ?? []) {
      if (active.some((o) => o !== a && o.part.layers.some((l) => l.layer === h))) notes.push(`${a.part.name} esconde parte de outra peça (${h}).`);
    }
  }

  const layers: ComposedLayer[] = [];
  for (const { slot, part } of active) {
    const choice = config.slots[slot]!;
    const colors = { ...config.colors, ...part.defaults, ...choice.colors };
    for (const ref of layerRefs(part, config, notes)) {
      if (hidden.has(ref.layer)) continue;
      let svg = colorize(catalog.file(ref.file), colors);
      svg = svg
        .replace(/data-anchor="torso"/g, `transform="${anchorTransform(build.torso)}"`)
        .replace(/data-anchor="legs"/g, `transform="${anchorTransform(build.legs)}"`)
        .replace(/ transform=""/g, "");
      const t = choice.transform;
      const [px, py] = PIVOT[slot] ?? [256, 384];
      const scale = clampAdjust(t?.scale, part.adjust?.scale, 1);
      const dy = clampAdjust(t?.dy, part.adjust?.dy, 0);
      if (scale !== 1 || dy !== 0) {
        svg = svg.replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>\s*)$/, `$1<g transform="translate(0 ${dy}) translate(${px} ${py}) scale(${scale}) translate(${-px} ${-py})">$2</g>$3`);
      }
      const key = `${slot}:${ref.layer}`;
      layers.push({ key, slot, partId: part.id, layer: ref.layer, svg: scopeIds(svg, key.replace(":", "-")) });
    }
  }
  (config.marks ?? []).forEach((mark, i) => {
    const part = catalog.get(mark.part);
    if (!part || part.slot !== "marks") return;
    const [px, py] = part.pivot ?? [256, 192];
    const lim = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
    const colors = { ...config.colors, ...part.defaults, ...(mark.color ? { ink: mark.color } : {}) };
    const t = [
      mark.mirror ? "translate(512 0) scale(-1 1)" : "",
      `translate(${lim(mark.dx, MARK_LIMITS.dx)} ${lim(mark.dy, MARK_LIMITS.dy)})`,
      `translate(${px} ${py}) rotate(${lim(mark.rotate, MARK_LIMITS.rotate)}) scale(${lim(mark.scale, MARK_LIMITS.scale)}) translate(${-px} ${-py})`,
    ].join(" ").trim();
    const opacity = lim(mark.opacity, MARK_LIMITS.opacity);
    for (const ref of part.layers) {
      const svg = colorize(catalog.file(ref.file), colors).replace(
        /(<svg[^>]*>)([\s\S]*)(<\/svg>\s*)$/,
        `$1<g transform="${t}" opacity="${opacity}">$2</g>$3`,
      );
      const key = `marks:${i}`;
      layers.push({ key, slot: "marks", partId: part.id, layer: ref.layer, svg: scopeIds(svg, `marks-${i}`) });
    }
  });
  layers.sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
  return { layers, notes: [...new Set(notes)] };
}

/** Só aplica ajustes permitidos pela peça, dentro dos limites declarados no catálogo. */
function clampAdjust(value: number | undefined, range: [number, number] | undefined, neutral: number): number {
  if (value === undefined || !range) return neutral;
  return Math.min(range[1], Math.max(range[0], value));
}

const inner = (svg: string) => svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/**
 * O avatar inteiro como um único SVG (retrato da ficha, miniaturas, exportação vetorial).
 * O resultado só contém peças do catálogo e cores validadas: é seguro para embutir na página.
 */
export function composeSvg(
  config: AvatarConfig,
  /** `idPrefix`: obrigatório quando vários avatares aparecem na mesma página (evita ids repetidos). */
  opts: { frame?: FrameId; background?: boolean; catalog?: PartCatalog; title?: string; idPrefix?: string } = {},
): string {
  const f = FRAMES[opts.frame ?? "full"];
  const { layers } = compose(config, opts.catalog);
  const body = layers
    .filter((l) => opts.background !== false || l.layer !== "background")
    .map((l) => `<g data-layer="${l.key}">${inner(l.svg)}</g>`)
    .join("");
  const scoped = opts.idPrefix ? scopeIds(body, opts.idPrefix.replace(/[^a-zA-Z0-9_-]/g, "")) : body;
  const title = opts.title ? `<title>${opts.title.replace(/[<>&"]/g, "")}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.x} ${f.y} ${f.width} ${f.height}" role="img">${title}${scoped}</svg>`;
}
