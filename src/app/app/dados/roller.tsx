"use client";

import { useState, useTransition } from "react";
import { rollDiceAction, type RollState } from "@/app/actions/dice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { d20Formula, SUPPORTED_DICE } from "@/rules";

type Entry = Extract<RollState, { ok: true }>;

export function DiceRoller({ initialHistory }: { initialHistory: Entry[] }) {
  const [formula, setFormula] = useState("1d20");
  const [label, setLabel] = useState("");
  const [modifier, setModifier] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Entry[]>(initialHistory);
  const [pending, start] = useTransition();

  const doRoll = (f: string, l = label) =>
    start(async () => {
      setError(null);
      const r = await rollDiceAction({ formula: f, label: l });
      if (r.ok) setHistory((h) => [r, ...h].slice(0, 30));
      else setError(r.error);
    });

  const last = history[0];

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Dados rápidos">
        {SUPPORTED_DICE.map((s) => (
          <Button key={s} variant="outline" disabled={pending} onClick={() => doRoll(`1d${s}`)}>
            d{s}
          </Button>
        ))}
      </div>

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
