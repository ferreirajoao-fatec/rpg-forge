"use client";

import { useState, useTransition } from "react";
import { Check, ImageOff, Loader2, Sparkles, Trash2 } from "lucide-react";
import { deletePortraitAction, generatePortraitAction, setActivePortraitAction, type PortraitResult } from "@/app/actions/portraits";
import { Button } from "@rpg-forge/ui/components/button";
import { Label } from "@rpg-forge/ui/components/label";
import { cn } from "@rpg-forge/ui/lib/utils";

interface Portrait {
  id: string;
  url: string;
  style: string;
  description: string;
  active: boolean;
  createdAt: string;
}

/** Avatar desenhado → JPEG em base64 (sem prefixo), para a IA usar como referência de aparência. */
async function svgToJpegBase64(svg: string): Promise<string> {
  const w = 512;
  const h = 768;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", `<svg width="${w}" height="${h}" `));
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export function AiPortrait(props: {
  characterId: string;
  canEdit: boolean;
  enabled: boolean;
  styles: { id: string; label: string }[];
  initialPortraits: Portrait[];
  initialRemaining: number;
  limit: number;
  /** SVG do avatar desenhado, se ele já foi salvo. */
  referenceSvg?: string;
}) {
  const [portraits, setPortraits] = useState(props.initialPortraits);
  const [remaining, setRemaining] = useState(props.initialRemaining);
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState(props.styles[0]?.id ?? "");
  const [useReference, setUseReference] = useState(Boolean(props.referenceSvg));
  const [error, setError] = useState<string>();
  const [generating, startGenerate] = useTransition();
  const [busy, startBusy] = useTransition();
  /** Retrato esperando o segundo clique para ser apagado. */
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const active = portraits.find((p) => p.active);
  const styleLabel = (id: string) => props.styles.find((s) => s.id === id)?.label ?? id;

  const handle = (r: PortraitResult, after: () => void) => {
    if (!r.ok) setError(r.error);
    else {
      setError(undefined);
      after();
    }
  };

  const generate = () =>
    startGenerate(async () => {
      setError(undefined);
      let reference: string | undefined;
      if (useReference && props.referenceSvg) {
        try {
          reference = await svgToJpegBase64(props.referenceSvg);
        } catch {
          reference = undefined; // Sem referência, a geração segue só com a descrição.
        }
      }
      const r = await generatePortraitAction(props.characterId, { style, description, reference });
      if (r.remaining !== undefined) setRemaining(r.remaining);
      handle(r, () => {
        if (r.ok && r.portrait) setPortraits((ps) => [r.portrait!, ...ps.map((p) => ({ ...p, active: false }))].slice(0, 12));
      });
    });

  const activate = (id: string | null) =>
    startBusy(async () => {
      const r = await setActivePortraitAction(props.characterId, id);
      handle(r, () => setPortraits((ps) => ps.map((p) => ({ ...p, active: p.id === id }))));
    });

  const remove = (id: string) =>
    startBusy(async () => {
      const r = await deletePortraitAction(props.characterId, id);
      setConfirmDelete(undefined);
      handle(r, () => setPortraits((ps) => ps.filter((p) => p.id !== id)));
    });

  if (!props.enabled) {
    return (
      <section aria-labelledby="ia-title" className="rounded-lg border border-dashed bg-card p-5">
        <h2 id="ia-title" className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4 text-gold" aria-hidden /> Retrato com IA
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A geração de retratos por IA não está configurada neste servidor. Monte a aparência no editor abaixo.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="ia-title" className="rounded-lg border bg-card p-5">
      <div className="grid gap-6 md:grid-cols-[1fr_220px]">
        <div className="min-w-0 space-y-4">
          <div>
            <h2 id="ia-title" className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-gold" aria-hidden /> Retrato com IA
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Descreva a aparência e escolha um estilo. O retrato gerado aparece na ficha e na lista de personagens.
            </p>
          </div>

          {props.canEdit ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ia-desc">Descreva seu personagem</Label>
                <textarea
                  id="ia-desc"
                  rows={4}
                  maxLength={600}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: elfa de cabelo prateado preso numa trança, olhos verdes, cicatriz no queixo, capa azul gasta e armadura de couro."
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <p className="text-xs text-muted-foreground">{description.length}/600 · pode escrever em português.</p>
              </div>

              <fieldset>
                <legend className="text-sm font-medium">Estilo</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {props.styles.map((s) => (
                    <Button key={s.id} type="button" size="sm" variant={style === s.id ? "default" : "outline"} aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>
                      {s.label}
                    </Button>
                  ))}
                </div>
              </fieldset>

              {props.referenceSvg && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={useReference} onChange={(e) => setUseReference(e.target.checked)} />
                  <span>
                    Usar o avatar desenhado como referência
                    <span className="block text-xs text-muted-foreground">Mantém pele, cabelo, chifres e roupas parecidos entre um retrato e outro.</span>
                  </span>
                </label>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={generate} disabled={generating || remaining <= 0 || (!description.trim() && !(useReference && props.referenceSvg))}>
                  {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} {generating ? "Gerando… (pode levar alguns segundos)" : "Gerar com IA"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {remaining}/{props.limit} hoje
                </span>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Só o dono do personagem pode gerar retratos.</p>
          )}
        </div>

        <figure className="space-y-2">
          <div className="aspect-[3/4] overflow-hidden rounded-lg border bg-muted">
            {active ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem do nosso Blob, sem otimização do Next
              <img src={active.url} alt="Retrato em uso na ficha" className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center p-4 text-center text-xs text-muted-foreground">
                <span>
                  <ImageOff className="mx-auto mb-2 size-6" aria-hidden />
                  A ficha está usando o avatar desenhado.
                </span>
              </div>
            )}
          </div>
          <figcaption className="text-xs text-muted-foreground">{active ? `Em uso na ficha · ${styleLabel(active.style)}` : "Nenhum retrato de IA em uso"}</figcaption>
        </figure>
      </div>

      {portraits.length > 0 && (
        <div className="mt-6 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Retratos gerados</h3>
            {active && props.canEdit && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => activate(null)}>
                Usar o avatar desenhado na ficha
              </Button>
            )}
          </div>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {portraits.map((p) => (
              <li key={p.id} className="space-y-1.5">
                <button
                  type="button"
                  disabled={!props.canEdit || busy || p.active}
                  onClick={() => activate(p.id)}
                  title={p.description || styleLabel(p.style)}
                  className={cn(
                    "relative block aspect-[3/4] w-full overflow-hidden rounded-md border bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                    p.active ? "border-gold ring-2 ring-gold" : "hover:border-gold/60",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem do nosso Blob */}
                  <img src={p.url} alt={p.active ? "Retrato em uso" : "Usar este retrato na ficha"} loading="lazy" className="size-full object-cover" />
                  {p.active && (
                    <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-gold text-background">
                      <Check className="size-3" aria-hidden />
                    </span>
                  )}
                </button>
                {props.canEdit &&
                  (confirmDelete === p.id ? (
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant="destructive" className="flex-1" disabled={busy} onClick={() => remove(p.id)}>
                        Apagar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(undefined)} aria-label="Cancelar">
                        ×
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" className="w-full" disabled={busy} onClick={() => setConfirmDelete(p.id)} aria-label="Apagar retrato">
                      <Trash2 />
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
