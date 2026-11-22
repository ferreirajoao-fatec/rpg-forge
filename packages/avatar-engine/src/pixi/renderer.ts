/**
 * Renderizador do avatar com PixiJS v8 (só no navegador).
 * Cada camada composta (SVG 512×768 já colorido) vira uma textura rasterizada em alta resolução;
 * texturas são reaproveitadas entre edições, então mudar uma cor só refaz a camada afetada.
 */
import { Application, Container, Rectangle, Sprite, Texture } from "pixi.js";
import { CANVAS, compose, FRAMES, type FrameId } from "../compose";
import type { PartCatalog } from "../catalog";
import type { AvatarConfig } from "../model";

/** Resolução de rasterização das camadas (2× a tela base: 1024×1536). */
const RASTER = 2;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

export type ExportKind = "full" | "portrait" | "token";

export interface ExportOptions {
  kind: ExportKind;
  /** Remove o fundo (PNG transparente). O token sempre usa fundo. */
  transparent?: boolean;
  /** Lado maior da imagem em pixels (padrão: 1536 no corpo inteiro, 512 no retrato e no token). */
  size?: number;
}

async function rasterize(svg: string): Promise<Texture> {
  const sized = svg.replace("<svg ", `<svg width="${CANVAS.width * RASTER}" height="${CANVAS.height * RASTER}" `);
  const img = new Image();
  img.decoding = "async";
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized);
  await img.decode();
  return Texture.from(img);
}

export class AvatarRenderer {
  private readonly world = new Container();
  private readonly sprites = new Map<string, Sprite>();
  private readonly textures = new Map<string, Promise<Texture>>();
  private layerOrder: { key: string; svg: string }[] = [];
  private frame: FrameId = "full";
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  private renderSeq = 0;
  private readonly cleanup: (() => void)[] = [];

  private constructor(
    private readonly app: Application,
    private readonly catalog?: PartCatalog,
  ) {}

  /** Cria o canvas dentro de `host`. Lança erro se o navegador não tiver WebGL/WebGPU. */
  static async create(host: HTMLElement, opts: { catalog?: PartCatalog; background?: string } = {}): Promise<AvatarRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: opts.background ? 1 : 0,
      background: opts.background,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio ?? 1, 2),
      preference: "webgl",
    });
    app.canvas.style.display = "block";
    app.canvas.style.touchAction = "none";
    app.canvas.setAttribute("aria-hidden", "true");
    host.appendChild(app.canvas);
    const r = new AvatarRenderer(app, opts.catalog);
    app.stage.addChild(r.world);
    r.bindInput();
    const ro = new ResizeObserver(() => requestAnimationFrame(() => r.layout()));
    ro.observe(host);
    r.cleanup.push(() => ro.disconnect());
    return r;
  }

  /** Atualiza o avatar. Chamadas rápidas em sequência são seguras: só a última é aplicada. */
  async render(config: AvatarConfig): Promise<void> {
    const seq = ++this.renderSeq;
    const { layers } = compose(config, this.catalog);
    const loaded = await Promise.all(layers.map(async (l) => ({ key: l.key, svg: l.svg, texture: await this.texture(l.svg) })));
    if (seq !== this.renderSeq || this.app.renderer === null) return;

    const keep = new Set(loaded.map((l) => l.key));
    for (const [key, sprite] of this.sprites) {
      if (!keep.has(key)) {
        sprite.destroy();
        this.sprites.delete(key);
      }
    }
    loaded.forEach((l, i) => {
      let sprite = this.sprites.get(l.key);
      if (!sprite) {
        sprite = new Sprite(l.texture);
        this.sprites.set(l.key, sprite);
        this.world.addChild(sprite);
      } else if (sprite.texture !== l.texture) {
        sprite.texture = l.texture;
      }
      sprite.width = CANVAS.width;
      sprite.height = CANVAS.height;
      sprite.label = l.key;
      this.world.setChildIndex(sprite, i);
    });
    this.layerOrder = loaded.map(({ key, svg }) => ({ key, svg }));
    this.pruneTextures();
    this.layout();
  }

  /** Enquadramento: corpo inteiro, busto ou rosto. Zera zoom e deslocamento. */
  setFrame(frame: FrameId) {
    this.frame = frame;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.layout();
  }

  zoomBy(factor: number) {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.layout();
  }

  resetView() {
    this.setFrame(this.frame);
  }

  /** Gera um PNG (Blob) do avatar: corpo inteiro, retrato (rosto) ou token circular. */
  async exportPng(opts: ExportOptions): Promise<Blob> {
    const frame = opts.kind === "full" ? FRAMES.full : FRAMES.portrait;
    const longest = Math.max(frame.width, frame.height);
    const size = opts.size ?? (opts.kind === "full" ? 1536 : 512);
    const scene = new Container();
    for (const { key } of this.layerOrder) {
      const src = this.sprites.get(key);
      if (!src) continue;
      if (opts.transparent && opts.kind !== "token" && key.startsWith("background:")) continue;
      const s = new Sprite(src.texture);
      s.width = CANVAS.width;
      s.height = CANVAS.height;
      scene.addChild(s);
    }
    const canvas = this.app.renderer.extract.canvas({
      target: scene,
      frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
      resolution: size / longest,
      clearColor: [0, 0, 0, 0],
      antialias: true,
    }) as HTMLCanvasElement;
    scene.destroy({ children: true });
    const out = opts.kind === "token" ? tokenize(canvas) : canvas;
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar o PNG."))), "image/png"));
  }

  destroy() {
    this.renderSeq++;
    for (const c of this.cleanup) c();
    for (const t of this.textures.values()) void t.then((tex) => tex.destroy(true)).catch(() => undefined);
    this.textures.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }

  private texture(svg: string): Promise<Texture> {
    let t = this.textures.get(svg);
    if (!t) {
      t = rasterize(svg);
      this.textures.set(svg, t);
      t.catch(() => this.textures.delete(svg));
    }
    return t;
  }

  /** Libera texturas que nenhuma camada usa (mantém algumas recentes para desfazer rápido). */
  private pruneTextures() {
    const used = new Set(this.layerOrder.map((l) => l.svg));
    const unused = [...this.textures.keys()].filter((k) => !used.has(k));
    for (const key of unused.slice(0, Math.max(0, unused.length - 24))) {
      const t = this.textures.get(key)!;
      this.textures.delete(key);
      void t.then((tex) => tex.destroy(true)).catch(() => undefined);
    }
  }

  private layout() {
    if (!this.app.renderer) return;
    const { width, height } = this.app.screen;
    const f = FRAMES[this.frame];
    const pad = 0.94;
    const scale = Math.min((width * pad) / f.width, (height * pad) / f.height) * this.zoom;
    this.world.scale.set(scale);
    this.world.position.set(width / 2 - (f.x + f.width / 2) * scale + this.pan.x, height / 2 - (f.y + f.height / 2) * scale + this.pan.y);
  }

  /** Roda do mouse aproxima; arrastar com o ponteiro move a vista. */
  private bindInput() {
    const el = this.app.canvas;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    let drag: { x: number; y: number; px: number; py: number } | null = null;
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      this.pan = { x: drag.px + e.clientX - drag.x, y: drag.py + e.clientY - drag.y };
      this.layout();
    };
    const onUp = () => {
      drag = null;
      el.style.cursor = "grab";
    };
    el.style.cursor = "grab";
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    this.cleanup.push(() => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    });
  }
}

/** Recorte circular com borda, no formato de token de mesa virtual. */
function tokenize(src: HTMLCanvasElement): HTMLCanvasElement {
  const size = Math.min(src.width, src.height);
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const ctx = out.getContext("2d")!;
  const r = size / 2;
  const ring = Math.max(4, size * 0.035);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - ring / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(src, 0, 0, size, size, 0, 0, size, size);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(r, r, r - ring / 2, 0, Math.PI * 2);
  ctx.lineWidth = ring;
  ctx.strokeStyle = "#2b1d16";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r, r, r - ring * 1.1, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, ring * 0.25);
  ctx.strokeStyle = "#c9a66b";
  ctx.stroke();
  return out;
}
