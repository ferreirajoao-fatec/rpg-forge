"use client";

import { useState, useTransition } from "react";
import { rollDiceAction, type RollState } from "@/app/actions/dice";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";
import { d20Formula, opDiceFormula, SUPPORTED_DICE } from "@rpg-forge/rules-engine";

type Entry = Extract<RollState, { ok: true }>;

export function DiceRoller({
  initialHistory,
  campaigns = [],
}: {
  initialHistory: Entry[];
  campaigns?: { id: string; name: string }[];
}) {
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("");
  const [modifier, setModifier] = useState(0);
  const [opAttr, setOpAttr] = useState(2);
  const [opBonus, setOpBonus] = useState(5);
  const [opExtra, setOpExtra] = useState(0);
  const [campaignId, setCampaignId] = useState("");
  const [secretRoll, setSecretRoll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Entry[]>(initialHistory);
  const [pending, start] = useTransition();

  const opPreview = opDiceFormula(opAttr, opBonus, opExtra);

  const doRoll = (f: string, l = label) =>
    start(async () => {
      setError(null);
      const r = await rollDiceAction({
        formula: f,
        label: l,
        campaignId: campaignId || undefined,
        shared: campaignId ? !secretRoll : false,
      });
      if (r.ok) setHistory((h) => [r, ...h].slice(0, 30));
      else setError(r.error);
    });

  const last = history[0];

  return (
    <div className="mt-6 space-y-6">
      {campaigns.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Campanha:</span>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Somente meu histórico</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {campaignId && (
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="size-4 accent-primary" checked={secretRoll} onChange={(e) => setSecretRoll(e.target.checked)} />
              Rolagem oculta (não compartilhar na mesa)
            </label>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Dados rápidos">
        {SUPPORTED_DICE.map((s) => (
          <Button key={s} variant="outline" disabled={pending} onClick={() => doRoll(`1d${s}`)}>
            d{s}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Teste de d20</h2>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="mod">Modificador</Label>
              <Input id="mod" type="number" className="w-20" value={modifier} onChange={(e) => setModifier(Math.trunc(Number(e.target.value) || 0))} />
            </div>
            <Button disabled={pending} onClick={() => doRoll(d20Formula(modifier))}>Normal</Button>
            <Button variant="outline" disabled={pending} onClick={() => doRoll(d20Formula(modifier, "advantage"), label || "Com vantagem")}>Vantagem</Button>
            <Button variant="outline" disabled={pending} onClick={() => doRoll(d20Formula(modifier, "disadvantage"), label || "Com desvantagem")}>Desvantagem</Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Teste de Ordem Paranormal</h2>
            <span className="font-mono text-xs text-muted-foreground">{opPreview}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="op-attr">Atributo</Label>
              <Input
                id="op-attr"
                type="number"
                min={0}
                max={10}
                className="w-16"
                value={opAttr}
                onChange={(e) => setOpAttr(Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0))))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="op-bonus">Treino/Bônus</Label>
              <Input
                id="op-bonus"
                type="number"
                className="w-20"
                value={opBonus}
                onChange={(e) => setOpBonus(Math.trunc(Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="op-extra">±d20</Label>
              <Input
                id="op-extra"
                type="number"
                min={-5}
                max={5}
                className="w-16"
                value={opExtra}
                onChange={(e) => setOpExtra(Math.max(-5, Math.min(5, Math.trunc(Number(e.target.value) || 0))))}
              />
            </div>
            <Button
              disabled={pending}
              onClick={() =>
                doRoll(
                  opPreview,
                  label || `Teste OP (Atrib. ${opAttr}${opExtra ? ` ${opExtra > 0 ? `+${opExtra}` : opExtra}d20` : ""}, ${opBonus >= 0 ? `+${opBonus}` : opBonus})`,
                )
              }
            >
              Rolar OP
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {[
              { label: "Destreinado (0)", val: 0 },
              { label: "Treinado (+5)", val: 5 },
              { label: "Veterano (+10)", val: 10 },
              { label: "Expert (+15)", val: 15 },
            ].map((g) => (
              <Button key={g.val} type="button" size="xs" variant={opBonus === g.val ? "secondary" : "ghost"} onClick={() => setOpBonus(g.val)}>
                {g.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <form
        className="rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          doRoll(formula);
        }}
      >
        <h2 className="text-sm font-semibold">Fórmula livre</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="formula">Fórmula</Label>
            <Input id="formula" value={formula} onChange={(e) => setFormula(e.target.value)} aria-describedby="formula-help" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label">Descrição (opcional)</Label>
            <Input id="label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: dano da espada" />
          </div>
          <Button type="submit" disabled={pending}>Rolar</Button>
        </div>
        <p id="formula-help" className="mt-2 text-xs text-muted-foreground">
          Exemplos: 2d6+3, 1d20-1, 4d6kh3 (manter os 3 maiores), 2d20kl1 (manter o menor).
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      </form>

      <div aria-live="polite">
        {last && (
          <div className="rounded-lg border border-gold/50 bg-card p-5 text-center">
            <p className="text-xs text-muted-foreground">{last.label || last.formula}</p>
            <p className="font-heading text-5xl text-gold">{last.total}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{last.breakdown}</p>
          </div>
        )}
      </div>

      <section>
        <h2 className="text-sm font-semibold">Histórico</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma rolagem ainda.</p>
        ) : (
          <ol className="mt-2 divide-y rounded-md border">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{h.label || h.formula}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{h.breakdown}</p>
                </div>
                <span className="font-heading text-lg">{h.total}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
