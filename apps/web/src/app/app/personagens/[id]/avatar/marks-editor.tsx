"use client";

import { useMemo, useState } from "react";
import { FlipHorizontal2, Plus, Trash2 } from "lucide-react";
import { composeSvg, defaultCatalog, MARK_LIMITS, MAX_MARKS, PALETTES, type AvatarConfig, type Mark } from "@rpg-forge/avatar-engine";
import { Button } from "@rpg-forge/ui/components/button";
import { cn } from "@rpg-forge/ui/lib/utils";
import { ColorField, PartPicker, Slider, type PartOption } from "./controls";

/**
 * Marcas do rosto (cicatrizes, sardas, tatuagens, pinturas): várias por avatar, cada uma com
 * posição, tamanho, rotação, opacidade, espelho e cor da tinta.
 */
export function MarksEditor(props: {
  config: AvatarConfig;
  preview: AvatarConfig;
  disabled?: boolean;
  onChange: (marks: Mark[], key?: string) => void;
}) {
  const marks = props.config.marks;
  const [selected, setSelected] = useState(0);
  const current = marks[Math.min(selected, marks.length - 1)];
  const index = Math.min(selected, marks.length - 1);
  const part = current ? defaultCatalog.get(current.part) : undefined;

  const options: PartOption[] = useMemo(
    () =>
      defaultCatalog.forSlot("marks").map((p, i) => ({
        id: p.id,
        name: p.name,
        thumb: composeSvg({ ...props.preview, marks: [{ part: p.id, dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 1, mirror: false }] }, { frame: "portrait", idPrefix: `mk${i}` }),
      })),
    [props.preview],
  );

  const add = (id: string | null) => {
    if (!id || marks.length >= MAX_MARKS) return;
    props.onChange([...marks, { part: id, dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 1, mirror: false }]);
    setSelected(marks.length);
  };
  const patch = (p: Partial<Mark>, key: string) => props.onChange(marks.map((m, i) => (i === index ? { ...m, ...p } : m)), `mark:${index}:${key}`);
  const remove = () => {
    props.onChange(marks.filter((_, i) => i !== index));
    setSelected(Math.max(0, index - 1));
  };

  return (
    <div className="space-y-4">
      {marks.length > 0 && (
        <fieldset className="space-y-1.5" disabled={props.disabled}>
          <legend className="text-sm font-medium">
            Marcas do personagem ({marks.length}/{MAX_MARKS})
          </legend>
          <div className="flex flex-wrap gap-1">
            {marks.map((m, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={i === index}
                onClick={() => setSelected(i)}
                className={cn("rounded-md border px-2 py-1 text-xs", i === index ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}
              >
                {i + 1}. {defaultCatalog.get(m.part)?.name ?? m.part}
                {m.mirror ? " (espelhada)" : ""}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {current && part && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{part.name}</p>
            <div className="flex gap-1">
              <Button size="sm" variant={current.mirror ? "secondary" : "ghost"} aria-pressed={current.mirror} onClick={() => patch({ mirror: !current.mirror }, "mirror")} disabled={props.disabled}>
                <FlipHorizontal2 /> Espelhar
              </Button>
              <Button size="sm" variant="ghost" onClick={remove} disabled={props.disabled} aria-label={`Remover ${part.name}`}>
                <Trash2 />
              </Button>
            </div>
          </div>
          <Slider label="Horizontal" min={MARK_LIMITS.dx[0]} max={MARK_LIMITS.dx[1]} step={1} value={current.dx} disabled={props.disabled} onChange={(n) => patch({ dx: n }, "dx")} />
          <Slider label="Vertical" min={MARK_LIMITS.dy[0]} max={MARK_LIMITS.dy[1]} step={1} value={current.dy} disabled={props.disabled} onChange={(n) => patch({ dy: n }, "dy")} />
          <Slider label="Tamanho" min={MARK_LIMITS.scale[0]} max={MARK_LIMITS.scale[1]} step={0.05} value={current.scale} format={(n) => `${Math.round(n * 100)}%`} disabled={props.disabled} onChange={(n) => patch({ scale: n }, "scale")} />
          <Slider label="Rotação" min={MARK_LIMITS.rotate[0]} max={MARK_LIMITS.rotate[1]} step={1} value={current.rotate} format={(n) => `${n}°`} disabled={props.disabled} onChange={(n) => patch({ rotate: n }, "rotate")} />
          <Slider label="Opacidade" min={MARK_LIMITS.opacity[0]} max={MARK_LIMITS.opacity[1]} step={0.05} value={current.opacity} format={(n) => `${Math.round(n * 100)}%`} disabled={props.disabled} onChange={(n) => patch({ opacity: n }, "opacity")} />
          {part.regions.includes("ink") && (
            <ColorField label="Cor da tinta" value={current.color ?? part.defaults?.ink ?? "#1f3a6b"} palette={PALETTES.ink} disabled={props.disabled} onChange={(hex) => patch({ color: hex }, "color")} />
          )}
        </div>
      )}

      <div className="space-y-1">
        <p className="flex items-center gap-1 text-sm font-medium">
          <Plus className="size-3.5" aria-hidden /> Adicionar marca
        </p>
        {marks.length >= MAX_MARKS ? (
          <p className="text-xs text-muted-foreground">Limite de {MAX_MARKS} marcas. Remova uma para adicionar outra.</p>
        ) : (
          <PartPicker label="Tipo de marca" value={null} options={options} disabled={props.disabled} onPick={add} />
        )}
      </div>
    </div>
  );
}
