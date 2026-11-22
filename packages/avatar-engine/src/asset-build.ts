/**
 * Validação do catálogo de peças e geração do módulo com os SVGs embutidos.
 * Separado do script para poder ser testado sem tocar no disco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CATALOG_SLOTS, LAYER_ORDER, PART_REGIONS, SLOT_IDS, TOKEN_RE } from "./model";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const layerRef = z.object({ layer: z.enum(LAYER_ORDER), file: z.string().regex(/^[a-z-]+\/[a-z0-9-]+\.svg$/) });

export const rawCatalogSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  parts: z.array(
    z.object({
      id: z.string().regex(/^[a-z]+:[a-z0-9-]+$/),
      slot: z.enum(CATALOG_SLOTS),
      name: z.string().min(1),
      tags: z.array(z.string()).optional(),
      defaults: z.partialRecord(z.enum(PART_REGIONS), hex).optional(),
      pivot: z.tuple([z.number(), z.number()]).optional(),
      adjust: z.object({ scale: z.tuple([z.number(), z.number()]).optional(), dy: z.tuple([z.number(), z.number()]).optional() }).optional(),
      hides: z.array(z.enum(LAYER_ORDER)).optional(),
      layers: z.array(layerRef).min(1),
      variants: z.array(z.object({ whenSlot: z.enum(SLOT_IDS), note: z.string().optional(), layers: z.array(layerRef).min(1) })).optional(),
    }),
  ),
});

const SVG_HEAD = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 768">\n/;

/** Confere um SVG de peça: cabeçalho padrão, sem scripts nem referências externas. */
export function checkSvg(file: string, svg: string): string[] {
  const errors: string[] = [];
  if (!SVG_HEAD.test(svg)) errors.push(`${file}: deve começar com o cabeçalho padrão 512×768.`);
  if (!svg.trimEnd().endsWith("</svg>")) errors.push(`${file}: deve terminar em </svg>.`);
  if (/<script|\son[a-z]+=|href="(?!#)|<image|<foreignObject/i.test(svg)) errors.push(`${file}: contém script, evento, imagem ou link externo.`);
  return errors;
}

/** Regiões de cor usadas por um SVG (marcadores #{regiao} e #{regiao-variacao}). */
export function regionsOf(svg: string): string[] {
  return [...new Set([...svg.matchAll(TOKEN_RE)].map((m) => m[1]))].sort();
}

export function buildAssetModule(assetsDir: string, read: (file: string) => string = (f) => readFileSync(path.join(assetsDir, f), "utf8")): string {
  const catalog = rawCatalogSchema.parse(JSON.parse(read("catalog.json")));
  const errors: string[] = [];
  const files: Record<string, string> = {};
  const ids = new Set<string>();
  for (const part of catalog.parts) {
    if (ids.has(part.id)) errors.push(`Peça repetida: ${part.id}`);
    ids.add(part.id);
    if (!part.id.startsWith(`${part.slot}:`)) errors.push(`${part.id}: o prefixo do id deve ser o slot (${part.slot}).`);
    if (part.slot === "marks" && (!part.pivot || part.layers.some((l) => l.layer !== "marks"))) errors.push(`${part.id}: marcas precisam de pivot e da camada "marks".`);
    for (const ref of [...part.layers, ...(part.variants ?? []).flatMap((v) => v.layers)]) {
      if (files[ref.file] !== undefined) continue;
      const svg = read(ref.file).replace(/\r\n/g, "\n");
      errors.push(...checkSvg(ref.file, svg));
      files[ref.file] = svg;
    }
  }
  if (errors.length) throw new Error("Catálogo de avatar inválido:\n- " + errors.join("\n- "));

  const parts = catalog.parts.map((p) => ({
    ...p,
    regions: regionsOf([...p.layers, ...(p.variants ?? []).flatMap((v) => v.layers)].map((l) => files[l.file]).join("\n")),
  }));
  const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return [
    "// Gerado por `pnpm assets:build` a partir de assets/avatar. Não edite à mão.",
    'import type { AssetCatalog } from "../model";',
    "",
    `export const ASSET_CATALOG: AssetCatalog = ${JSON.stringify({ version: catalog.version, parts, files: sortedFiles }, null, 2)};`,
    "",
  ].join("\n");
}
