/**
 * Gera PNGs de alguns avatares de exemplo para revisar os desenhos.
 *   pnpm --filter @rpg-forge/avatar-engine exec tsx scripts/preview.ts <pasta-de-saida>
 * Lê os SVGs direto de assets/avatar (não precisa rodar assets:build antes).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildAssetModule } from "../src/asset-build";
import { PartCatalog, defaultAvatar } from "../src/catalog";
import { composeSvg } from "../src/compose";
import type { AssetCatalog, AvatarConfig } from "../src/model";

const root = path.resolve(import.meta.dirname, "../../..");
const assetsDir = path.join(root, "assets/avatar");
const out = path.resolve(process.argv[2] ?? "avatar-preview");
mkdirSync(out, { recursive: true });

const code = buildAssetModule(assetsDir);
const json = code.slice(code.indexOf("= ") + 2, code.lastIndexOf(";"));
const catalog = new PartCatalog(JSON.parse(json) as AssetCatalog);

const base = defaultAvatar(catalog);
const set = (c: AvatarConfig, patch: Partial<Record<string, string | null>>, colors: Partial<AvatarConfig["colors"]> = {}, build?: AvatarConfig["build"]): AvatarConfig => ({
  ...c,
  build: build ?? c.build,
  colors: { ...c.colors, ...colors },
  slots: { ...c.slots, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { part: v ?? null, colors: {} }])) },
});

const samples: Record<string, AvatarConfig> = {
  "00-nu": set(base, { torso: null, legs: null, feet: null, belt: null, hair: null }),
  "01-padrao": base,
  "02-guerreira": set(base, { head: "head:angular", hair: "hair:longo", eyes: "eyes:estreitos", brows: "brows:franzidas", mouth: "mouth:seria", armor: "armor:peitoral", shield: "shield:heraldico", cape: "cape:capa" }, { skin: "#e8b98f", hair: "#a3312b" }, "robusto"),
  "03-elfo-mago": set(base, { ears: "ears:longa", hair: "hair:longo", torso: "torso:manto-longo", hood: "hood:capuz", eyes: "eyes:amendoados", nose: "nose:aquilino", background: "background:estrelado" }, { skin: "#f3d2b3", hair: "#e8e1d2", eyeL: "#3e6aa0", eyeR: "#3e6aa0" }, "esguio"),
  "04-anao": set(base, { head: "head:redonda", beard: "beard:longa-trancada", hair: "hair:curto", brows: "brows:grossas", nose: "nose:arrebitado", armor: "armor:cota-de-malha", shield: "shield:redondo" }, { skin: "#a86f4c", hair: "#6b4428" }, "robusto"),
  "05-tiefling": set(base, { horns: "horns:curvados", tail: "tail:demoniaca", eyes: "eyes:brilhantes", mouth: "mouth:sorriso", hair: "hair:moicano", torso: "torso:camisa-colete", wings: "wings:morcego", background: "background:arco" }, { skin: "#b8423a", hair: "#1f1712", eyeL: "#c09a2a", eyeR: "#c09a2a" }),
  "06-draconato": set(base, { eyes: "eyes:reptilianos", mouth: "mouth:presas", horns: "horns:para-tras", tail: "tail:reptiliana", armor: "armor:couro", hair: null }, { skin: "#5f9a55", eyeL: "#c09a2a", eyeR: "#c09a2a" }),
};

const require = createRequire(path.join(root, "apps/web/package.json"));
/** sharp vem do app web (não é dependência deste pacote); tipagem mínima do que usamos. */
interface Img {
  resize(w: number | { width: number }, h?: number): Img;
  png(): Img;
  composite(layers: { input: Buffer; left: number; top: number }[]): Img;
  toFile(file: string): Promise<unknown>;
  toBuffer(): Promise<Buffer>;
}
const sharp = require("sharp") as (input: Buffer | string | { create: { width: number; height: number; channels: number; background: string } }) => Img;
for (const [name, cfg] of Object.entries(samples)) {
  for (const p of Object.values(cfg.slots)) if (p?.part && !catalog.get(p.part)) console.warn(`${name}: peça inexistente ${p.part}`);
  for (const frame of ["full", "portrait"] as const) {
    const svg = composeSvg(cfg, { frame, catalog });
    const size = frame === "full" ? { width: 512 } : { width: 480 };
    await sharp(Buffer.from(svg)).resize(size).png().toFile(path.join(out, `${name}-${frame}.png`));
  }
}
const names = Object.keys(samples);
const strip = async (frame: string, w: number, h: number, file: string) => {
  const imgs = await Promise.all(names.map((n) => sharp(path.join(out, `${n}-${frame}.png`)).resize(w, h).toBuffer()));
  await sharp({ create: { width: w * imgs.length, height: h, channels: 4, background: "#ffffff" } })
    .composite(imgs.map((input, i) => ({ input, left: i * w, top: 0 })))
    .png()
    .toFile(path.join(out, file));
};
await strip("full", 256, 384, "_grade.png");
await strip("portrait", 240, 240, "_rostos.png");

/** Uma faixa por slot com todas as peças dele, para revisar variações lado a lado. */
const FACE = new Set(["head", "ears", "eyes", "brows", "nose", "mouth", "beard", "hair", "horns", "earrings", "marks"]);
for (const slot of [...new Set(catalog.data.parts.map((p) => p.slot))]) {
  const parts = catalog.forSlot(slot);
  const face = FACE.has(slot);
  const [w, h] = face ? [240, 240] : [256, 384];
  const imgs = await Promise.all(
    parts.map((p) => {
      const cfg: AvatarConfig =
        slot === "marks"
          ? { ...base, marks: [{ part: p.id, dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 1, mirror: false }] }
          : set(base, { [slot]: p.id, ...(slot === "hood" || slot === "horns" ? { hair: null } : {}) });
      return sharp(Buffer.from(composeSvg(cfg, { frame: face ? "portrait" : "full", catalog }))).resize(w, h).png().toBuffer();
    }),
  );
  await sharp({ create: { width: w * imgs.length, height: h, channels: 4, background: "#ffffff" } })
    .composite(imgs.map((input, i) => ({ input, left: i * w, top: 0 })))
    .png()
    .toFile(path.join(out, `slot-${slot}.png`));
}
console.log(`Prévia em ${out}`);
