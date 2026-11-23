"use client";

import { useActionState } from "react";
import { createCampaignAction } from "@/app/actions/campaigns";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";

export function NewCampaignForm({ systems }: { systems: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createCampaignAction, undefined);
  const err = (k: string) => state?.errors?.[k]?.join(" ");
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Nome</Label>
        <Input id="c-name" name="name" maxLength={80} required aria-invalid={!!err("name")} aria-describedby={err("name") ? "c-name-error" : undefined} />
        {err("name") && (
          <p id="c-name-error" className="text-xs text-destructive">
            {err("name")}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-ruleset">Sistema de regras</Label>
        <select
          id="c-ruleset"
          name="rulesetId"
          defaultValue={systems[0]?.id}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {err("rulesetId") && <p className="text-xs text-destructive">{err("rulesetId")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-desc">Descrição (opcional)</Label>
        <textarea
          id="c-desc"
          name="description"
          rows={3}
          maxLength={500}
          placeholder="Ex.: sessões quinzenais, começando no 1º nível."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Criando…" : "Criar campanha"}
      </Button>
    </form>
  );
}
