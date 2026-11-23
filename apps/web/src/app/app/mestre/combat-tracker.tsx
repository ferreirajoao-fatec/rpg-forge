"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Dices, Plus, RotateCcw, Shield, Trash2, Users, X } from "lucide-react";
import { cryptoRng, roll } from "@rpg-forge/rules-engine";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Progress } from "@rpg-forge/ui/components/progress";
import { cn } from "@rpg-forge/ui/lib/utils";
import type { GmParty } from "@/server/gm";

export interface Combatant {
  id: string;
  name: string;
  kind: "pc" | "enemy" | "npc";
  initiative: number;
  initFormula: string;
  hp: number;
  maxHp: number;
  defense: number | null;
  conditions: string[];
}

export interface CombatState {
  round: number;
  activeId: string | null;
  combatants: Combatant[];
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function CombatTracker({
  storageKey,
  parties,
  state,
  onChange,
}: {
  storageKey: string;
  parties: GmParty[];
  state: CombatState;
  onChange: (next: CombatState) => void;
}) {
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.campaignId ?? "");
  const [customName, setCustomName] = useState("");
  const [customHp, setCustomHp] = useState(20);
  const [customDef, setCustomDef] = useState(15);
  const [customInit, setCustomInit] = useState("1d20+2");
  const [condInput, setCondInput] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Sem acesso a localStorage
    }
  }, [storageKey, state]);

  const sorted = [...state.combatants].sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name, "pt-BR"));
  const activeIdx = state.activeId ? sorted.findIndex((c) => c.id === state.activeId) : -1;

  const setCombatants = (combatants: Combatant[], nextActiveId = state.activeId, round = state.round) => {
    onChange({ round, activeId: nextActiveId, combatants });
  };

  const rollAllInitiatives = () => {
    const rolled = state.combatants.map((c) => {
      try {
        const res = roll(c.initFormula || "1d20", cryptoRng);
        return { ...c, initiative: res.total };
      } catch {
        return { ...c, initiative: Math.floor(Math.random() * 20) + 1 };
      }
    });
    const order = [...rolled].sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name, "pt-BR"));
    setCombatants(rolled, order[0]?.id ?? null, 1);
  };

  const nextTurn = () => {
    if (!sorted.length) return;
    if (activeIdx < 0 || activeIdx + 1 >= sorted.length) {
      const nextRound = activeIdx < 0 ? state.round : state.round + 1;
      setCombatants(state.combatants, sorted[0].id, nextRound);
    } else {
      setCombatants(state.combatants, sorted[activeIdx + 1].id, state.round);
    }
  };

  const importParty = () => {
    const party = parties.find((p) => p.campaignId === selectedPartyId);
    if (!party) return;
    const added: Combatant[] = party.members.map((m) => ({
      id: `pc-${m.id}-${uid().slice(0, 6)}`,
      name: m.name,
      kind: "pc",
      initiative: 0,
      initFormula: m.initFormula,
      hp: m.hp,
      maxHp: m.hp,
      defense: m.defense,
      conditions: [],
    }));
    setCombatants([...state.combatants, ...added]);
  };

  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    const hpVal = Math.max(1, Math.trunc(customHp) || 1);
    const added: Combatant = {
      id: `c-${uid()}`,
      name: customName.trim(),
      kind: "npc",
      initiative: 0,
      initFormula: customInit.trim() || "1d20",
      hp: hpVal,
      maxHp: hpVal,
      defense: Number.isFinite(customDef) ? customDef : null,
      conditions: [],
    };
    setCombatants([...state.combatants, added]);
    setCustomName("");
  };

  const restoreSaved = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CombatState;
      if (Array.isArray(parsed?.combatants)) onChange(parsed);
    } catch {
      // Ignora JSON inválido
    }
  };

  const updateOne = (id: string, fn: (c: Combatant) => Combatant) => {
    setCombatants(state.combatants.map((c) => (c.id === id ? fn(c) : c)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="px-2.5 py-1 text-sm font-semibold">
            Rodada {state.round}
          </Badge>
          <Button type="button" size="sm" onClick={nextTurn} disabled={!sorted.length}>
            <ArrowRight className="size-4" /> Próximo turno
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={rollAllInitiatives} disabled={!sorted.length}>
            <Dices className="size-4" /> Rolar iniciativas
          </Button>
          {state.combatants.length === 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={restoreSaved}>
              Carregar último combate salvo
            </Button>
          )}
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={!sorted.length} onClick={() => onChange({ round: 1, activeId: null, combatants: [] })}>
          <RotateCcw className="size-4" /> Limpar combate
        </Button>
      </div>

      {/* Importar grupo ou adicionar combatente */}
      <div className="grid gap-3 md:grid-cols-2">
        {parties.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            <select
              value={selectedPartyId}
              onChange={(e) => setSelectedPartyId(e.target.value)}
              className="h-8 min-w-44 flex-1 rounded-md border bg-background px-2 text-sm"
              aria-label="Escolher campanha para importar fichas"
            >
              {parties.map((p) => (
                <option key={p.campaignId} value={p.campaignId}>
                  {p.campaignName} ({p.members.length} ficha(s))
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={importParty}>
              <Plus /> Importar grupo
            </Button>
          </div>
        )}

        <form onSubmit={addCustom} className={cn("flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3", !parties.length && "md:col-span-2")}>
          <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nome do combatente" className="h-8 min-w-36 flex-1" />
          <Input
            type="number"
            min={1}
            value={customHp}
            onChange={(e) => setCustomHp(Number(e.target.value) || 1)}
            className="h-8 w-16"
            title="PV máximo"
            aria-label="PV máximo"
          />
          <Input
            type="number"
            value={customDef}
            onChange={(e) => setCustomDef(Number(e.target.value) || 10)}
            className="h-8 w-16"
            title="Defesa"
            aria-label="Defesa"
          />
          <Input
            value={customInit}
            onChange={(e) => setCustomInit(e.target.value)}
            className="h-8 w-24"
            title="Fórmula de iniciativa"
            aria-label="Iniciativa"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!customName.trim()}>
            <Plus /> Adicionar
          </Button>
        </form>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum combatente na cena. Importe uma campanha, adicione combatentes avulsos ou clique em &ldquo;Enviar para o rastreador&rdquo; no montador de encontros.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((c) => {
            const isActive = c.id === state.activeId;
            const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((c.hp / c.maxHp) * 100))) : 0;
            const condDraft = condInput[c.id] ?? "";
            return (
              <li key={c.id} className={cn("rounded-lg border bg-card p-3", isActive && "border-gold ring-2 ring-gold/40")}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Inic.</span>
                    <Input
                      type="number"
                      value={c.initiative}
                      onChange={(e) => updateOne(c.id, (x) => ({ ...x, initiative: Math.trunc(Number(e.target.value) || 0) }))}
                      className="h-8 w-16 text-center font-mono"
                      aria-label={`Iniciativa de ${c.name}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {c.name}
                      <Badge variant={c.kind === "pc" ? "default" : "secondary"}>{c.kind === "pc" ? "Personagem" : c.kind === "enemy" ? "Ameaça" : "NPC"}</Badge>
                      {isActive && <Badge variant="outline" className="border-gold text-gold">Turno atual</Badge>}
                      {c.defense != null && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Shield className="size-3" aria-hidden /> Def {c.defense}
                        </span>
                      )}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={pct} className="max-w-48 [&>[data-slot=progress-indicator]]:bg-destructive" />
                      <span className="font-mono text-xs tabular-nums">
                        {c.hp}/{c.maxHp} PV
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {[-10, -5, -1, 1, 5].map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => updateOne(c.id, (x) => ({ ...x, hp: Math.max(0, Math.min(x.maxHp, x.hp + d)) }))}
                      >
                        {d > 0 ? `+${d}` : d}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remover ${c.name}`}
                      onClick={() => setCombatants(state.combatants.filter((x) => x.id !== c.id))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {c.conditions.map((cond) => (
                    <Badge key={cond} variant="secondary" className="gap-1 text-xs">
                      {cond}
                      <button
                        type="button"
                        aria-label={`Remover condição ${cond}`}
                        onClick={() => updateOne(c.id, (x) => ({ ...x, conditions: x.conditions.filter((k) => k !== cond) }))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  <form
                    className="inline-flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clean = condDraft.trim();
                      if (!clean) return;
                      updateOne(c.id, (x) => ({ ...x, conditions: x.conditions.includes(clean) ? x.conditions : [...x.conditions, clean] }));
                      setCondInput((p) => ({ ...p, [c.id]: "" }));
                    }}
                  >
                    <Input
                      value={condDraft}
                      onChange={(e) => setCondInput((p) => ({ ...p, [c.id]: e.target.value }))}
                      placeholder="+ condição"
                      className="h-6 w-28 text-xs"
                    />
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
