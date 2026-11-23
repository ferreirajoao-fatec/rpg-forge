"use client";

import { useActionState, useState } from "react";
import { createCharacterAction } from "@/app/actions/characters";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";
import { cn } from "@rpg-forge/ui/lib/utils";

interface SystemOption {
  id: string;
  name: string;
  publisher: string;
  availability: "licensed" | "import-required";
  limitations: string[];
}

export function NewCharacterForm({ systems }: { systems: SystemOption[] }) {
  const [state, action, pending] = useActionState(createCharacterAction, undefined);
  const [selected, setSelected] = useState(systems[0]?.id ?? "");
  const current = systems.find((s) => s.id === selected);

  return (
    <form action={action} className="mt-6 space-y-6">
      <fieldset>
        <legend className="sr-only">Sistema de regras</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {systems.map((s) => (
            <label
              key={s.id}
              className={cn(
                "cursor-pointer rounded-lg border bg-card p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
                selected === s.id ? "border-gold ring-1 ring-gold" : "hover:border-gold/50",
              )}
            >
              <input
                type="radio"
                name="rulesetId"
                value={s.id}
                checked={selected === s.id}
                onChange={() => setSelected(s.id)}
                className="sr-only"
              />
              <span className="block font-medium">{s.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{s.publisher}</span>
              <span
                className={cn(
                  "mt-3 inline-block rounded-full px-2 py-0.5 text-xs",
                  s.availability === "licensed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
                )}
              >
                {s.availability === "licensed" ? "Regras abertas (SRD)" : "Requer importação"}
              </span>
            </label>
          ))}
        </div>
        {state?.errors?.rulesetId && <p className="mt-2 text-sm text-destructive">{state.errors.rulesetId.join(" ")}</p>}
      </fieldset>

      {current && current.limitations.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium text-warning">Limitações deste sistema na plataforma</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {current.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="name">Nome do personagem (opcional)</Label>
        <Input id="name" name="name" maxLength={80} placeholder="Você pode decidir depois" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !selected}>
          {pending ? "Criando…" : "Criar rascunho"}
        </Button>
        <Button type="submit" name="randomize" value="1" variant="outline" disabled={pending || !selected}>
          {pending ? "Gerando…" : "Criar já preenchido aleatoriamente"}
        </Button>
      </div>
    </form>
  );
}
