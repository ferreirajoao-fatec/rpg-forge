"use client";

import { useState, useTransition } from "react";
import { Dices, EyeOff, RefreshCw } from "lucide-react";
import { opDiceFormula } from "@rpg-forge/rules-engine";
import { listCampaignRollsAction, rollDiceAction } from "@/app/actions/dice";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";

export interface CampaignRollRow {
  id: string;
  formula: string;
  total: number;
  breakdown: string;
  label: string;
  shared: boolean;
  createdAt: string;
  authorName: string;
  characterName: string | null;
}

export function CampaignRolls({
  campaignId,
  rulesetId,
  initialRolls,
}: {
  campaignId: string;
  rulesetId: string;
  initialRolls: CampaignRollRow[];
}) {
  const isOp = rulesetId === "ordem-paranormal-1e";
  const [prevInitial, setPrevInitial] = useState(initialRolls);
  const [rolls, setRolls] = useState<CampaignRollRow[]>(initialRolls);
  if (prevInitial !== initialRolls) {
    setPrevInitial(initialRolls);
    setRolls(initialRolls);
  }
  const [formula, setFormula] = useState(isOp ? "2d20kh1+5" : "1d20");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState(false);
  const [opAttr, setOpAttr] = useState(2);
  const [opBonus, setOpBonus] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () =>
    start(async () => {
      const list = await listCampaignRollsAction(campaignId);
      setRolls(list);
    });

  const submitRoll = (f: string, l: string) =>
    start(async () => {
      setError(null);
      const r = await rollDiceAction({ formula: f, label: l, campaignId, shared: !secret });
      if (r.ok) {
        setRolls((prev) => [
          {
            id: r.id,
            formula: r.formula,
            total: r.total,
            breakdown: r.breakdown,
            label: r.label,
            shared: Boolean(r.shared),
            createdAt: r.createdAt,
            authorName: r.authorName ?? "Você",
            characterName: r.characterName ?? null,
          },
          ...prev,
        ].slice(0, 30));
      } else {
        setError(r.error);
      }
    });

  return (
    <section aria-labelledby="mesa-dados-title" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mesa-dados-title" className="flex items-center gap-2 text-base font-semibold">
          <Dices className="size-4 text-gold" aria-hidden /> Rolagens da mesa
        </h2>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={refresh}>
          <RefreshCw className={pending ? "animate-spin" : ""} /> Atualizar
        </Button>
      </div>

      <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
        {isOp && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              Atrib.
              <Input
                type="number"
                min={0}
                max={10}
                className="mt-0.5 h-8 w-16"
                value={opAttr}
                onChange={(e) => setOpAttr(Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0))))}
              />
            </label>
            <label className="text-xs">
              Bônus
              <Input
                type="number"
                className="mt-0.5 h-8 w-20"
                value={opBonus}
                onChange={(e) => setOpBonus(Math.trunc(Number(e.target.value) || 0))}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => submitRoll(opDiceFormula(opAttr, opBonus), label || `Teste OP (${opAttr}d + ${opBonus})`)}
            >
              Rolar {opDiceFormula(opAttr, opBonus)}
            </Button>
          </div>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitRoll(formula, label);
          }}
        >
          <Input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="Ex.: 1d20+5" className="h-8 w-36" aria-label="Fórmula de dado" />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Descrição (ex.: Investigação)" className="h-8 min-w-40 flex-1" aria-label="Descrição da rolagem" />
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" className="size-4 accent-primary" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
            Oculta
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Rolar
          </Button>
        </form>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {rolls.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma rolagem compartilhada ainda.</p>
      ) : (
        <ul className="mt-3 max-h-80 divide-y overflow-y-auto">
          {rolls.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 truncate font-medium">
                  <span>{r.characterName || r.authorName}</span>
                  {r.label && <span className="font-normal text-muted-foreground">· {r.label}</span>}
                  {!r.shared && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <EyeOff className="size-2.5" /> oculta
                    </Badge>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {r.formula} → {r.breakdown}
                </p>
              </div>
              <span className="font-heading text-xl font-bold text-gold tabular-nums">{r.total}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
