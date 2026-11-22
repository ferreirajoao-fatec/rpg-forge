"use client";

import { memo, useId, useState } from "react";
import { Check, Lock, LockOpen } from "lucide-react";
import { cn } from "@rpg-forge/ui/lib/utils";

const HEX = /^#[0-9a-f]{6}$/i;

/** Cor com amostras sugeridas, seletor nativo e campo hexadecimal (aceita qualquer cor válida). */
export function ColorField(props: { label: string; value: string; palette: readonly string[]; disabled?: boolean; onChange: (hex: string) => void }) {
  const id = useId();
  const [text, setText] = useState(props.value);
  const [shown, setShown] = useState(props.value);
  // Quando a cor muda por fora (paleta, desfazer), o campo de texto acompanha.
  if (shown !== props.value) {
    setShown(props.value);
    setText(props.value);
  }
  const commit = (v: string) => {
    const hex = v.startsWith("#") ? v : `#${v}`;
    if (HEX.test(hex)) props.onChange(hex.toLowerCase());
    else setText(props.value);
  };
  return (
    <fieldset className="space-y-1.5" disabled={props.disabled}>
      <legend className="text-sm font-medium">{props.label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {props.palette.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => props.onChange(c)}
            aria-label={`Usar ${c}`}
            aria-pressed={props.value === c}
            className={cn(
              "grid size-7 place-items-center rounded-full border border-black/20 shadow-sm outline-offset-2 transition-transform hover:scale-110 disabled:opacity-50",
              props.value === c && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            style={{ backgroundColor: c }}
          >
            {props.value === c && <Check className="size-3.5 text-white mix-blend-difference" aria-hidden />}
          </button>
        ))}
        <label htmlFor={`${id}-picker`} className="sr-only">
          {props.label}: escolher qualquer cor
        </label>
        <input
          id={`${id}-picker`}
          type="color"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.toLowerCase())}
          className="size-7 cursor-pointer rounded-full border border-black/20 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch-wrapper]:p-0"
        />
        <label htmlFor={`${id}-hex`} className="sr-only">
          {props.label}: código hexadecimal
        </label>
        <input
          id={`${id}-hex`}
          value={text}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
          className="h-7 w-[5.5rem] rounded-md border bg-background px-2 font-mono text-xs uppercase"
        />
      </div>
    </fieldset>
  );
}

export interface PartOption {
  id: string | null;
  name: string;
  /** SVG da miniatura (gerado pelo motor a partir do catálogo e de cores validadas). */
  thumb: string;
}

/** Galeria de peças de um slot, com miniaturas do próprio personagem usando cada opção. */
export const PartPicker = memo(function PartPicker(props: {
  label: string;
  value: string | null;
  options: PartOption[];
  disabled?: boolean;
  onPick: (id: string | null) => void;
}) {
  return (
    <fieldset className="space-y-1.5" disabled={props.disabled}>
      <legend className="text-sm font-medium">{props.label}</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
        {props.options.map((o) => {
          const active = o.id === props.value;
          return (
            <button
              key={o.id ?? "none"}
              type="button"
              aria-pressed={active}
              onClick={() => props.onPick(o.id)}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-lg border bg-card p-1 text-center text-xs transition-colors hover:border-primary/60 disabled:opacity-60",
                active && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <span
                className="block aspect-square w-full overflow-hidden rounded-md bg-muted [&>svg]:size-full"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: o.thumb }}
              />
              <span className="line-clamp-2 leading-tight">{o.name}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
});

/** Controle deslizante com valor exibido (ajustes permitidos pela peça). */
export function Slider(props: { label: string; min: number; max: number; step: number; value: number; format?: (n: number) => string; disabled?: boolean; onChange: (n: number) => void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id}>{props.label}</label>
        <output htmlFor={id} className="font-mono text-xs text-muted-foreground">
          {props.format ? props.format(props.value) : props.value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

/** Botão de trava de uma categoria (a randomização não mexe em categorias travadas). */
export function LockToggle(props: { locked: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  const Icon = props.locked ? Lock : LockOpen;
  return (
    <button
      type="button"
      onClick={props.onToggle}
      disabled={props.disabled}
      aria-pressed={props.locked}
      title={props.locked ? `${props.label}: travada (não muda ao randomizar)` : `${props.label}: destravada`}
      aria-label={props.locked ? `Destravar ${props.label}` : `Travar ${props.label}`}
      className={cn("grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", props.locked && "text-primary")}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
