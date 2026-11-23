"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  Dices,
  Download,
  FileJson,
  History as HistoryIcon,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Shirt,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react";
import {
  avatarConfigSchema,
  BUILDS,
  CATEGORIES,
  checkAvatar,
  compose,
  composeSvg,
  defaultCatalog,
  PALETTES,
  randomize,
  record,
  redo,
  REGION_LABEL,
  REQUIRED_SLOTS,
  SLOT_LABEL,
  startHistory,
  suggestFromCharacter,
  dressFromEquipment,
  undo,
  type AvatarConfig,
  type EquippedItem,
  type BuildId,
  type FrameId,
  type GlobalRegion,
  type History,
  type PartRegion,
  type SlotId,
} from "@rpg-forge/avatar-engine";
import type { AvatarRenderer, ExportKind } from "@rpg-forge/avatar-engine/pixi";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { cn } from "@rpg-forge/ui/lib/utils";
import {
  deletePresetAction,
  restoreAvatarAction,
  saveAvatarAction,
  savePresetAction,
  snapshotAvatarAction,
} from "@/app/actions/avatars";
import { ColorField, LockToggle, PartPicker, Slider, type PartOption } from "./controls";
import { MarksEditor } from "./marks-editor";

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string }
  | { kind: "conflict"; message: string };

interface Revision {
  number: number;
  label: string;
  createdAt: string;
}
interface Preset {
  id: string;
  name: string;
  config: AvatarConfig;
}

export interface StudioProps {
  characterId: string;
  characterName: string;
  canEdit: boolean;
  /** O avatar já existe no banco (senão, a configuração inicial é uma sugestão ainda não salva). */
  saved: boolean;
  initialConfig: AvatarConfig;
  initialRevision: number;
  initialRevisions: Revision[];
  initialPresets: Preset[];
  hints: { species?: string; className?: string };
  /** Itens equipados na ficha (nome e categoria), para vestir o avatar. */
  equipped: EquippedItem[];
  suggestionNotes: string[];
}

/** Enquadramento das miniaturas de cada slot. */
const THUMB_FRAME: Partial<Record<SlotId, FrameId>> = {
  head: "portrait",
  ears: "portrait",
  eyes: "portrait",
  brows: "portrait",
  nose: "portrait",
  mouth: "portrait",
  beard: "portrait",
  hair: "portrait",
  horns: "portrait",
  hood: "portrait",
  earrings: "portrait",
  shield: "bust",
  torso: "bust",
  armor: "bust",
  belt: "bust",
  necklace: "bust",
  cape: "bust",
};

/** Peças escondidas nas miniaturas de um slot, para a opção não ficar coberta (ex.: armadura sobre a túnica). */
const THUMB_HIDE: Partial<Record<SlotId, SlotId[]>> = {
  torso: ["armor", "cape", "necklace", "belt"],
  legs: ["cape"],
  hair: ["hood"],
  ears: ["hood"],
  earrings: ["hood"],
  necklace: ["beard"],
};

const PART_PALETTE: Record<PartRegion, readonly string[]> = {
  primary: PALETTES.cloth,
  secondary: PALETTES.cloth,
  metal: PALETTES.metal,
  bg: PALETTES.bg,
  ink: PALETTES.ink,
};

const GLOBAL_PALETTE: Record<GlobalRegion, readonly string[]> = {
  skin: [...PALETTES.skin, ...PALETTES.skinFantasy],
  hair: [...PALETTES.hair, ...PALETTES.hairFantasy],
  eyeL: PALETTES.eyes,
  eyeR: PALETTES.eyes,
  horn: PALETTES.horn,
};

const withSlot = (c: AvatarConfig, slot: SlotId, part: string | null): AvatarConfig => ({ ...c, slots: { ...c.slots, [slot]: { part, colors: {} } } });

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "personagem";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exportação sem WebGL: rasteriza o SVG composto num canvas 2D. */
async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", `<svg width="${width}" height="${height}" `));
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar o PNG."))), "image/png"));
}

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && (el as HTMLInputElement).type !== "range";

const VTT_FRAMES = [
  { id: "gold", label: "Ouro Fantasia", outer: "#f5c451", inner: "#7c5a10" },
  { id: "ordem", label: "Carmesim Ordo Realitas", outer: "#dc2626", inner: "#450a0a" },
  { id: "tactical", label: "Aço Tático", outer: "#64748b", inner: "#0f172a" },
  { id: "silver", label: "Prata Élfica", outer: "#e2e8f0", inner: "#475569" },
  { id: "emerald", label: "Esmeralda Arcana", outer: "#10b981", inner: "#064e3b" },
] as const;
type VttFrameId = (typeof VTT_FRAMES)[number]["id"];

async function svgToFramedVttToken(svg: string, frameId: VttFrameId): Promise<Blob> {
  const size = 512;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", `<svg width="${size}" height="${size}" `));
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const half = size / 2;
  const radius = half - 18;

  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0, size, size);
  ctx.restore();

  const frame = VTT_FRAMES.find((f) => f.id === frameId) ?? VTT_FRAMES[0];
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, frame.outer);
  grad.addColorStop(0.5, frame.inner);
  grad.addColorStop(1, frame.outer);

  ctx.beginPath();
  ctx.arc(half, half, radius, 0, Math.PI * 2);
  ctx.lineWidth = 24;
  ctx.strokeStyle = grad;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(half, half, radius - 12, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.stroke();

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar token."))), "image/png"));
}

export function AvatarStudio(props: StudioProps) {
  const { canEdit } = props;
  const [history, setHistory] = useState<History<AvatarConfig>>(() => startHistory(props.initialConfig));
  const config = history.present;
  const deferred = useDeferredValue(config);
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [locked, setLocked] = useState<Set<string>>(() => new Set());
  const [fantasy, setFantasy] = useState(true);
  const [frame, setFrame] = useState<FrameId>("full");
  const [panel, setPanel] = useState<"edit" | "versions" | "presets" | "export">("edit");
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [saved, setSaved] = useState(props.saved);
  const [revisions, setRevisions] = useState<Revision[]>(props.initialRevisions);
  const [presets, setPresets] = useState<Preset[]>(props.initialPresets);
  const [message, setMessage] = useState<string | null>(props.saved ? null : props.suggestionNotes.length ? `Sugestão pela ficha: ${props.suggestionNotes.join(" ")}` : null);
  const [versionLabel, setVersionLabel] = useState("");
  const [presetName, setPresetName] = useState("");
  const [vttFrame, setVttFrame] = useState<VttFrameId>("gold");
  const [rendererState, setRendererState] = useState<"loading" | "ready" | "fallback">("loading");
  const [, startTransition] = useTransition();

  const revision = useRef(props.initialRevision);
  const dirty = useRef(false);
  const lastEdit = useRef<{ key: string; at: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<AvatarRenderer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Aplica uma alteração. Alterações seguidas na mesma propriedade (arrastar um seletor de cor ou um
   * controle deslizante) viram uma única entrada no histórico.
   */
  const commit = useCallback(
    (next: AvatarConfig, key?: string) => {
      if (!canEdit) return;
      dirty.current = true;
      const now = Date.now();
      const coalesce = key && lastEdit.current?.key === key && now - lastEdit.current.at < 1200;
      lastEdit.current = key ? { key, at: now } : null;
      setHistory((h) => (coalesce ? { ...h, present: next } : record(h, next)));
    },
    [canEdit],
  );

  const doUndo = useCallback(() => {
    if (!canEdit) return;
    dirty.current = true;
    lastEdit.current = null;
    setHistory(undo);
  }, [canEdit]);
  const doRedo = useCallback(() => {
    if (!canEdit) return;
    dirty.current = true;
    lastEdit.current = null;
    setHistory(redo);
  }, [canEdit]);

  // Atalhos: Ctrl+Z desfaz; Ctrl+Shift+Z ou Ctrl+Y refaz.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // Canvas PixiJS (carregado só no navegador). Sem WebGL, cai para o SVG composto.
  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    if (!host) return;
    import("@rpg-forge/avatar-engine/pixi")
      .then(({ AvatarRenderer }) => AvatarRenderer.create(host))
      .then((r) => {
        if (disposed) return r.destroy();
        rendererRef.current = r;
        setRendererState("ready");
      })
      .catch(() => !disposed && setRendererState("fallback"));
    return () => {
      disposed = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (rendererState === "ready") void rendererRef.current?.render(config);
  }, [config, rendererState]);

  useEffect(() => {
    if (rendererState === "ready") rendererRef.current?.setFrame(frame);
  }, [frame, rendererState]);

  /** Grava a configuração atual. Devolve se deu certo. */
  const persist = useCallback(
    async (current: AvatarConfig): Promise<boolean> => {
      dirty.current = false;
      setStatus({ kind: "saving" });
      try {
        const r = await saveAvatarAction(props.characterId, current, revision.current);
        if (r.ok) {
          revision.current = r.revision;
          setSaved(true);
          setStatus({ kind: "saved", at: r.savedAt });
          return true;
        }
        setStatus({ kind: r.conflict ? "conflict" : "error", message: r.error });
      } catch {
        dirty.current = true;
        setStatus({ kind: "error", message: "Sem conexão. Tentaremos de novo na próxima alteração." });
      }
      return false;
    },
    [props.characterId],
  );

  // Salvamento automático com atraso (debounce), como na ficha. Só depois da primeira edição.
  useEffect(() => {
    if (!canEdit || !dirty.current || status.kind === "conflict") return;
    const t = setTimeout(() => void persist(config), 900);
    return () => clearTimeout(t);
  }, [config, canEdit, persist, status.kind]);

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];
  const notes = useMemo(() => compose(config).notes, [config]);

  // Miniaturas: o próprio personagem com cada opção (usa o valor adiado para não travar ao arrastar cores).
  const options = useMemo(() => {
    const out: Partial<Record<SlotId, PartOption[]>> = {};
    for (const slot of category.slots) {
      const parts = defaultCatalog.forSlot(slot);
      let thumbBase = deferred;
      for (const h of THUMB_HIDE[slot] ?? []) thumbBase = withSlot(thumbBase, h, null);
      const thumb = (id: string | null, i: number) => composeSvg(withSlot(thumbBase, slot, id), { frame: THUMB_FRAME[slot] ?? "full", idPrefix: `t${slot}${i}` });
      const list: PartOption[] = parts.map((p, i) => ({ id: p.id, name: p.name, thumb: thumb(p.id, i) }));
      if (!REQUIRED_SLOTS.includes(slot)) list.unshift({ id: null, name: "Nenhum", thumb: thumb(null, parts.length) });
      out[slot] = list;
    }
    return out;
  }, [category, deferred]);

  const pickPart = useCallback(
    (slot: SlotId, id: string | null) => {
      const prev = config.slots[slot];
      const part = defaultCatalog.get(id);
      // Mantém as cores escolhidas que a nova peça também usa.
      const colors = Object.fromEntries(Object.entries(prev?.colors ?? {}).filter(([k]) => part?.regions.includes(k)));
      commit({ ...config, slots: { ...config.slots, [slot]: { part: id, colors, transform: part?.adjust ? prev?.transform : undefined } } });
    },
    [commit, config],
  );

  const setGlobal = (region: GlobalRegion, hex: string) => commit({ ...config, colors: { ...config.colors, [region]: hex } }, `color:${region}`);
  const setPartColor = (slot: SlotId, region: PartRegion, hex: string) => {
    const choice = config.slots[slot]!;
    commit({ ...config, slots: { ...config.slots, [slot]: { ...choice, colors: { ...choice.colors, [region]: hex } } } }, `part:${slot}:${region}`);
  };
  const setTransform = (slot: SlotId, patch: { scale?: number; dy?: number }) => {
    const choice = config.slots[slot]!;
    commit({ ...config, slots: { ...config.slots, [slot]: { ...choice, transform: { ...choice.transform, ...patch } } } }, `transform:${slot}:${Object.keys(patch)[0]}`);
  };

  const randomizeAll = () => commit(randomize(config, { locked, fantasy }));
  const randomizeCategory = () => commit(randomize(config, { categories: [category.id], locked, fantasy }));
  const applySuggestion = () => {
    const s = suggestFromCharacter(config, props.hints);
    if (!s.notes.length) return setMessage("A ficha ainda não tem raça ou classe com sugestão de aparência.");
    commit(s.config);
    setMessage(`Sugestão pela ficha: ${s.notes.join(" ")}`);
  };
  const applyEquipment = () => {
    const d = dressFromEquipment(config, props.equipped);
    commit(d.config);
    setMessage(`Equipamento da ficha: ${d.notes.join(" ")}`);
  };
  const toggleLock = (id: string) =>
    setLocked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const saveVersion = () => {
    const label = versionLabel.trim() || `Versão de ${new Date().toLocaleDateString("pt-BR")}`;
    startTransition(async () => {
      if ((dirty.current || !saved) && !(await persist(config))) return;
      const r = await snapshotAvatarAction(props.characterId, label);
      if (r.ok) {
        setRevisions((list) => [{ ...r.revision, createdAt: new Date(r.revision.createdAt).toISOString() }, ...list].slice(0, 30));
        setVersionLabel("");
        setMessage(`Versão "${r.revision.label}" salva.`);
      } else setMessage(r.error);
    });
  };

  const restore = (n: number) =>
    startTransition(async () => {
      const r = await restoreAvatarAction(props.characterId, n);
      if (!r.ok) return setMessage(r.error);
      revision.current = r.revision;
      dirty.current = false;
      lastEdit.current = null;
      setHistory((h) => record(h, r.config));
      setStatus({ kind: "saved", at: new Date().toISOString() });
      setMessage(`Versão ${n} restaurada. O estado anterior foi guardado como nova versão.`);
      setRevisions((list) => [{ number: (list[0]?.number ?? 0) + 1, label: `Antes de restaurar a versão ${n}`, createdAt: new Date().toISOString() }, ...list]);
    });

  const savePreset = () => {
    const name = presetName.trim() || props.characterName;
    startTransition(async () => {
      const r = await savePresetAction(name, config);
      if (r.ok) {
        setPresets((p) => [{ ...r.preset, config }, ...p]);
        setPresetName("");
        setMessage(`Visual "${r.preset.name}" salvo. Ele aparece em qualquer personagem seu.`);
      } else setMessage(r.error);
    });
  };
  const removePreset = (id: string) =>
    startTransition(async () => {
      const r = await deletePresetAction(id);
      if (r.ok) setPresets((p) => p.filter((x) => x.id !== id));
      else setMessage(r.error);
    });

  const exportPng = async (kind: ExportKind, transparent = false) => {
    const base = slug(props.characterName);
    const name = `${base}-${kind === "full" ? "corpo" : kind === "portrait" ? "retrato" : "token"}${transparent ? "-transparente" : ""}.png`;
    try {
      let blob: Blob;
      if (rendererRef.current) blob = await rendererRef.current.exportPng({ kind, transparent });
      else {
        const frameId: FrameId = kind === "full" ? "full" : "portrait";
        blob = await svgToPng(composeSvg(config, { frame: frameId, background: !transparent }), kind === "full" ? 1024 : 512, kind === "full" ? 1536 : 512);
      }
      download(blob, name);
    } catch {
      setMessage("Não foi possível gerar a imagem neste navegador.");
    }
  };
  const exportVttToken = async () => {
    try {
      const svg = composeSvg(config, { frame: "portrait", background: true });
      const blob = await svgToFramedVttToken(svg, vttFrame);
      download(blob, `${slug(props.characterName)}-token-vtt-${vttFrame}.png`);
    } catch {
      setMessage("Não foi possível gerar o token VTT neste navegador.");
    }
  };
  const exportJson = () => download(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }), `${slug(props.characterName)}-avatar.json`);
  const importJson = async (file: File) => {
    try {
      if (file.size > 64_000) throw new Error("big");
      const parsed = avatarConfigSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) return setMessage("Arquivo inválido: não é um avatar do RPG Forge.");
      const issues = checkAvatar(parsed.data);
      if (issues.length) return setMessage(`Arquivo incompatível: ${issues[0].message}`);
      commit({ ...parsed.data, assets: defaultCatalog.version });
      setMessage("Avatar importado. Use Desfazer se quiser voltar.");
    } catch {
      setMessage("Não foi possível ler o arquivo.");
    }
  };

  const statusText =
    status.kind === "saving"
      ? "Salvando…"
      : status.kind === "saved"
        ? `Salvo às ${new Date(status.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : status.kind === "error" || status.kind === "conflict"
          ? status.message
          : !saved && canEdit
            ? "Sugestão ainda não salva"
            : canEdit
              ? "Salvamento automático ativo"
              : "Somente leitura";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[190px_minmax(0,1fr)_360px]">
      {/* Categorias */}
      <nav aria-label="Categorias do avatar" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {CATEGORIES.map((c) => (
            <li key={c.id} className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setCategoryId(c.id);
                  setPanel("edit");
                }}
                aria-current={c.id === category.id && panel === "edit" ? "true" : undefined}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap hover:bg-muted",
                  c.id === category.id && panel === "edit" && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {c.label}
              </button>
              <LockToggle locked={locked.has(c.id)} label={c.label} onToggle={() => toggleLock(c.id)} disabled={!canEdit} />
            </li>
          ))}
        </ul>
        {canEdit && (
          <label className="mt-3 hidden items-center gap-2 text-sm lg:flex">
            <input type="checkbox" checked={fantasy} onChange={(e) => setFantasy(e.target.checked)} className="accent-primary" />
            Randomizar com traços fantásticos
          </label>
        )}
      </nav>

      {/* Palco */}
      <section aria-label="Pré-visualização do avatar" className="flex min-w-0 flex-col gap-2">
        <div className="relative h-[58vh] min-h-[420px] overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_50%_35%,var(--color-muted),transparent_70%)] lg:h-[calc(100vh-13rem)]">
          <div ref={hostRef} className={cn("absolute inset-0", rendererState === "fallback" && "hidden")} />
          {rendererState === "fallback" && (
            <div
              role="img"
              aria-label={`Avatar de ${props.characterName}`}
              className="absolute inset-0 grid place-items-center p-4 [&>svg]:max-h-full [&>svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: composeSvg(config, { frame, idPrefix: "main" }) }}
            />
          )}
          {rendererState === "loading" && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Carregando o estúdio…</p>}
          <p className="sr-only" aria-live="polite">
            Avatar de {props.characterName}: {Object.entries(config.slots)
              .filter(([, c]) => c?.part)
              .map(([s, c]) => `${SLOT_LABEL[s as SlotId]} ${defaultCatalog.get(c!.part)?.name}`)
              .join(", ")}
            .
          </p>
          <div className="absolute top-2 left-2 flex gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
            {(
              [
                ["full", "Corpo"],
                ["bust", "Busto"],
                ["portrait", "Rosto"],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={frame === f}
                onClick={() => {
                  setFrame(f);
                  rendererRef.current?.setFrame(f);
                }}
                className={cn("rounded-md px-2.5 py-1 text-xs", frame === f ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          {rendererState === "ready" && (
            <div className="absolute top-2 right-2 flex gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
              <Button size="icon" variant="ghost" className="size-7" aria-label="Aproximar" onClick={() => rendererRef.current?.zoomBy(1.2)}>
                <Plus />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Afastar" onClick={() => rendererRef.current?.zoomBy(1 / 1.2)}>
                <Minus />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label="Centralizar" onClick={() => rendererRef.current?.resetView()}>
                <Maximize2 />
              </Button>
            </div>
          )}
          {notes.length > 0 && (
            <ul className="absolute bottom-2 left-2 max-w-[80%] space-y-0.5 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Barra de ações */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
          <Button size="sm" variant="outline" onClick={doUndo} disabled={!canEdit || !history.past.length} title="Desfazer (Ctrl+Z)">
            <Undo2 /> <span className="max-sm:sr-only">Desfazer</span>
          </Button>
          <Button size="sm" variant="outline" onClick={doRedo} disabled={!canEdit || !history.future.length} title="Refazer (Ctrl+Shift+Z)">
            <Redo2 /> <span className="max-sm:sr-only">Refazer</span>
          </Button>
          <Button size="sm" onClick={randomizeAll} disabled={!canEdit} title="Randomiza tudo, menos as categorias travadas">
            <Dices /> Randomizar
          </Button>
          <Button size="sm" variant="secondary" onClick={applySuggestion} disabled={!canEdit} title="Monta a aparência a partir da raça e da classe da ficha">
            <Wand2 /> <span className="max-sm:sr-only">Sugerir pela ficha</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={applyEquipment} disabled={!canEdit} title="Veste armadura, escudo, capa e trajes equipados na ficha">
            <Shirt /> <span className="max-sm:sr-only">Vestir equipamento</span>
          </Button>
          {!saved && canEdit && status.kind === "idle" && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => void persist(config)}>
              <Save /> Usar esta aparência
            </Button>
          )}
          <span
            className={cn(!saved && canEdit && status.kind === "idle" ? "" : "ml-auto", "text-xs", status.kind === "error" || status.kind === "conflict" ? "text-destructive" : "text-muted-foreground")}
            role="status"
          >
            {(status.kind === "error" || status.kind === "conflict") && <AlertTriangle className="mr-1 inline size-3.5" aria-hidden />}
            {statusText}
          </span>
        </div>
        {message && (
          <p className="flex items-start justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
            <span>{message}</span>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMessage(null)}>
              Fechar
            </button>
          </p>
        )}
      </section>

      {/* Propriedades */}
      <aside aria-label="Propriedades" className="min-w-0 space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <div role="tablist" aria-label="Painel" className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 text-xs">
          {(
            [
              ["edit", "Editar"],
              ["versions", "Versões"],
              ["presets", "Visuais"],
              ["export", "Exportar"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={panel === id}
              onClick={() => setPanel(id)}
              className={cn("rounded-md px-2 py-1.5", panel === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>

        {panel === "edit" && (
          <div className="space-y-5 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold">{category.label}</h2>
              <Button size="sm" variant="ghost" onClick={randomizeCategory} disabled={!canEdit || locked.has(category.id)} title={locked.has(category.id) ? "Categoria travada" : `Randomizar só ${category.label}`}>
                <Dices /> Só esta
              </Button>
            </div>

            {category.build && (
              <fieldset className="space-y-1.5" disabled={!canEdit}>
                <legend className="text-sm font-medium">Tipo físico</legend>
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(BUILDS) as BuildId[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={config.build === b}
                      onClick={() => commit({ ...config, build: b })}
                      className={cn("rounded-md border px-2 py-1.5 text-sm", config.build === b ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}
                    >
                      {BUILDS[b].label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {(category.colors ?? []).map((region) => (
              <ColorField key={region} label={REGION_LABEL[region]} value={config.colors[region]} palette={GLOBAL_PALETTE[region]} disabled={!canEdit} onChange={(hex) => setGlobal(region, hex)} />
            ))}
            {category.id === "olhos" && config.colors.eyeL !== config.colors.eyeR && <p className="text-xs text-muted-foreground">Heterocromia: cada olho tem uma cor.</p>}

            {category.marks && <MarksEditor config={config} preview={deferred} disabled={!canEdit} onChange={(marks, key) => commit({ ...config, marks }, key)} />}

            {category.slots.map((slot) => {
              const choice = config.slots[slot];
              const part = defaultCatalog.get(choice?.part);
              const regions = (part?.regions ?? []).filter((r): r is PartRegion => r in PART_PALETTE);
              return (
                <div key={slot} className="space-y-3">
                  <PartPicker label={SLOT_LABEL[slot]} value={choice?.part ?? null} options={options[slot] ?? []} disabled={!canEdit} onPick={(id) => pickPart(slot, id)} />
                  {part &&
                    regions.map((region) => (
                      <ColorField
                        key={region}
                        label={`${SLOT_LABEL[slot]}: ${REGION_LABEL[region].toLowerCase()}`}
                        value={choice?.colors[region] ?? part.defaults?.[region] ?? "#808080"}
                        palette={PART_PALETTE[region]}
                        disabled={!canEdit}
                        onChange={(hex) => setPartColor(slot, region, hex)}
                      />
                    ))}
                  {part?.adjust?.scale && (
                    <Slider
                      label="Tamanho"
                      min={part.adjust.scale[0]}
                      max={part.adjust.scale[1]}
                      step={0.05}
                      value={choice?.transform?.scale ?? 1}
                      format={(n) => `${Math.round(n * 100)}%`}
                      disabled={!canEdit}
                      onChange={(n) => setTransform(slot, { scale: n })}
                    />
                  )}
                  {part?.adjust?.dy && (
                    <Slider
                      label="Altura"
                      min={part.adjust.dy[0]}
                      max={part.adjust.dy[1]}
                      step={2}
                      value={choice?.transform?.dy ?? 0}
                      format={(n) => (n > 0 ? `+${n}` : `${n}`)}
                      disabled={!canEdit}
                      onChange={(n) => setTransform(slot, { dy: n })}
                    />
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">A aparência é só visual: não muda atributos, poderes nem regras da ficha.</p>
          </div>
        )}

        {panel === "versions" && (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold">Versões</h2>
            {canEdit && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveVersion();
                }}
              >
                <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} maxLength={80} placeholder="Nome (ex.: antes da batalha)" aria-label="Nome da versão" className="h-8" />
                <Button size="sm" type="submit">
                  <Save /> Salvar versão
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground">O avatar é salvo sozinho. Versões são pontos que você pode restaurar depois (guardamos as 30 mais recentes).</p>
            {revisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma versão salva ainda.</p>
            ) : (
              <ol className="divide-y">
                {revisions.map((r) => (
                  <li key={r.number} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        <HistoryIcon className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />
                        {r.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Versão {r.number} · {new Date(r.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => restore(r.number)} disabled={!canEdit}>
                      <RotateCcw /> Restaurar
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {panel === "presets" && (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold">Meus visuais</h2>
            {canEdit && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  savePreset();
                }}
              >
                <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} maxLength={60} placeholder={props.characterName} aria-label="Nome do visual" className="h-8" />
                <Button size="sm" type="submit">
                  <Sparkles /> Salvar visual
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground">Visuais salvos podem ser aplicados a qualquer personagem seu.</p>
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não salvou nenhum visual.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {presets.map((p) => (
                  <li key={p.id} className="space-y-1 rounded-lg border p-1.5">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => {
                        commit({ ...p.config, assets: defaultCatalog.version });
                        setMessage(`Visual "${p.name}" aplicado. Use Desfazer se quiser voltar.`);
                      }}
                      className="block w-full rounded-md bg-muted [&>span>svg]:size-full"
                      aria-label={`Aplicar o visual ${p.name}`}
                    >
                      <span className="block aspect-square" aria-hidden dangerouslySetInnerHTML={{ __html: composeSvg(p.config, { frame: "portrait", idPrefix: `p${p.id}` }) }} />
                    </button>
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs">{p.name}</span>
                      <Button size="icon" variant="ghost" className="size-6" aria-label={`Apagar o visual ${p.name}`} onClick={() => removePreset(p.id)} disabled={!canEdit}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {panel === "export" && (
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold">Exportar</h2>
            <div className="grid gap-2">
              <Button variant="outline" className="justify-start" onClick={() => exportPng("full")}>
                <Download /> Corpo inteiro (PNG 1024×1536)
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => exportPng("full", true)}>
                <Download /> Corpo inteiro sem fundo (PNG transparente)
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => exportPng("portrait")}>
                <Download /> Retrato do rosto (PNG 512×512)
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => exportPng("token")}>
                <Download /> Token circular (PNG 512×512)
              </Button>
              <div className="space-y-2 rounded-md border p-2.5">
                <p className="text-xs font-medium">Token VTT com moldura (Roll20 / Foundry / Owlbear)</p>
                <div className="flex flex-wrap gap-1.5">
                  {VTT_FRAMES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setVttFrame(f.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px]",
                        vttFrame === f.id ? "border-gold bg-gold/10 font-medium" : "hover:bg-muted",
                      )}
                    >
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: f.outer }} />
                      {f.label}
                    </button>
                  ))}
                </div>
                <Button variant="outline" className="w-full justify-start" onClick={exportVttToken}>
                  <Download /> Baixar Token VTT com moldura (PNG 512×512)
                </Button>
              </div>
              <Button variant="outline" className="justify-start" onClick={exportJson}>
                <FileJson /> Configuração (JSON)
              </Button>
              {canEdit && (
                <>
                  <Button variant="ghost" className="justify-start" onClick={() => fileRef.current?.click()}>
                    <Upload /> Importar configuração (JSON)
                  </Button>
                  <Input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importJson(f);
                      e.target.value = "";
                    }}
                  />
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">O retrato aparece automaticamente na ficha para impressão e na lista de personagens.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
