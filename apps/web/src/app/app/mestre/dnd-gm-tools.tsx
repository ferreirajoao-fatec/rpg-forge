"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Swords, Trash2 } from "lucide-react";
import {
  DND_CR_LIST,
  DND_CR_XP,
  DND_SRD_MONSTER_PRESETS,
  evaluateDndEncounter,
  type DndMonsterPreset,
} from "@rpg-forge/rules-engine";
import type { GmEntry, GmParty } from "@/server/gm";
import { CombatTracker, type CombatState } from "./combat-tracker";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";
import { cn } from "@rpg-forge/ui/lib/utils";

interface EncounterMonster {
  key: string;
  name: string;
  cr: string;
  hp: number;
  ac: number;
  initBonus: number;
  count: number;
}

const DIFF_STYLE: Record<string, string> = {
  trivial: "bg-muted text-muted-foreground",
  easy: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-gold/15 text-gold border-gold/40",
  hard: "bg-amber-500/15 text-amber-500 border-amber-500/40",
  deadly: "bg-destructive/15 text-destructive border-destructive/40",
};

export function DndGmTools({
  entries,
  packVersion,
  parties,
}: {
  entries: GmEntry[];
  packVersion: string;
  parties: GmParty[];
}) {
  const [tab, setTab] = useState<"encounter" | "combat" | "ref">("encounter");
  const [partyCount, setPartyCount] = useState(4);
  const [partyLevel, setPartyLevel] = useState(1);
  const [monsters, setMonsters] = useState<EncounterMonster[]>([
    { key: "goblin", name: "Goblin", cr: "1/4", hp: 7, ac: 15, initBonus: 2, count: 4 },
  ]);

  const [newName, setNewName] = useState("");
  const [newCr, setNewCr] = useState("1");
  const [newHp, setNewHp] = useState(27);
  const [newAc, setNewAc] = useState(15);

  const [combatState, setCombatState] = useState<CombatState>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("rpgforge:combat:dnd5e") : null;
      if (raw) return JSON.parse(raw) as CombatState;
    } catch {
      // Sem localStorage
    }
    return { round: 1, activeId: null, combatants: [] };
  });

  const [refKind, setRefKind] = useState<"condition" | "spell" | "equipment">("condition");
  const [refQuery, setRefQuery] = useState("");

  const evaluation = useMemo(() => {
    const levels = Array.from({ length: Math.max(1, partyCount) }, () => partyLevel);
    return evaluateDndEncounter({
      partyLevels: levels,
      monsters: monsters.map((m) => ({ cr: m.cr, count: m.count })),
    });
  }, [partyCount, partyLevel, monsters]);

  const addPreset = (p: DndMonsterPreset) => {
    setMonsters((prev) => {
      const idx = prev.findIndex((m) => m.name === p.name && m.cr === p.cr);
      if (idx >= 0) return prev.map((m, i) => (i === idx ? { ...m, count: m.count + 1 } : m));
      return [...prev, { key: `${p.name}-${Date.now()}`, ...p, count: 1 }];
    });
  };

  const addCustomMonster = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setMonsters((prev) => [
      ...prev,
      {
        key: `${newName}-${Date.now()}`,
        name: newName.trim(),
        cr: newCr,
        hp: newHp,
        ac: newAc,
        initBonus: 1,
        count: 1,
      },
    ]);
    setNewName("");
  };

  const sendToCombat = () => {
    const expanded = monsters.flatMap((m) =>
      Array.from({ length: m.count }, (_, idx) => ({
        id: `dnd-${m.key}-${idx}-${Date.now()}`,
        name: m.count > 1 ? `${m.name} #${idx + 1}` : m.name,
        kind: "enemy" as const,
        initiative: 0,
        initFormula: `1d20${m.initBonus >= 0 ? `+${m.initBonus}` : m.initBonus}`,
        hp: m.hp,
        maxHp: m.hp,
        defense: m.ac,
        conditions: [],
      })),
    );
    setCombatState((prev) => ({
      ...prev,
      combatants: [...prev.combatants, ...expanded],
    }));
    setTab("combat");
  };

  const filteredRef = useMemo(() => {
    const q = refQuery.trim().toLocaleLowerCase("pt-BR");
    return entries
      .filter((e) => e.kind === refKind && (!q || `${e.name} ${e.summary}`.toLocaleLowerCase("pt-BR").includes(q)))
      .slice(0, 40);
  }, [entries, refKind, refQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="inline-flex rounded-lg border bg-muted p-1">
          {(
            [
              ["encounter", "Calculadora de encontro (ND / XP)"],
              ["combat", "Rastreador de combate"],
              ["ref", "Referência SRD 5.1"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">SRD 5.1 v{packVersion}</span>
      </div>

      {tab === "encounter" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <section className="rounded-lg border bg-card p-4 space-y-3">
              <h2 className="text-base font-semibold">Grupo de aventureiros</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="dnd-party-count">Jogadores no grupo</Label>
                  <Input
                    id="dnd-party-count"
                    type="number"
                    min={1}
                    max={12}
                    value={partyCount}
                    onChange={(e) => setPartyCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dnd-party-lvl">Nível médio (1–20)</Label>
                  <Input
                    id="dnd-party-lvl"
                    type="number"
                    min={1}
                    max={20}
                    value={partyLevel}
                    onChange={(e) => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-1 text-center text-xs">
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Fácil</p>
                  <p className="font-semibold tabular-nums">{evaluation.thresholds.easy} XP</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Médio</p>
                  <p className="font-semibold tabular-nums">{evaluation.thresholds.medium} XP</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Difícil</p>
                  <p className="font-semibold tabular-nums">{evaluation.thresholds.hard} XP</p>
                </div>
                <div className="rounded border p-2">
                  <p className="text-muted-foreground">Mortal</p>
                  <p className="font-semibold tabular-nums">{evaluation.thresholds.deadly} XP</p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Criaturas do encontro</h2>
                {monsters.length > 0 && (
                  <Button type="button" size="sm" onClick={sendToCombat}>
                    <Swords /> Enviar ao combate
                  </Button>
                )}
              </div>

              {monsters.length === 0 ? (
                <p className="text-sm text-muted-foreground">Adicione monstros pelos presets ou abaixo.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {monsters.map((m) => (
                    <li key={m.key} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                      <div>
                        <span className="font-medium">{m.name}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          (ND {m.cr} · {DND_CR_XP[m.cr] ?? 0} XP · CA {m.ac} · {m.hp} PV)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setMonsters((prev) =>
                              prev
                                .map((x) => (x.key === m.key ? { ...x, count: x.count - 1 } : x))
                                .filter((x) => x.count > 0),
                            )
                          }
                        >
                          −
                        </Button>
                        <span className="w-6 text-center tabular-nums">{m.count}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setMonsters((prev) => prev.map((x) => (x.key === m.key ? { ...x, count: x.count + 1 } : x)))}
                        >
                          +
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Remover ${m.name}`}
                          onClick={() => setMonsters((prev) => prev.filter((x) => x.key !== m.key))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addCustomMonster} className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_90px_80px_80px_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="dnd-m-name">Criatura personalizada</Label>
                  <Input id="dnd-m-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Cultista" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dnd-m-cr">ND (CR)</Label>
                  <select
                    id="dnd-m-cr"
                    value={newCr}
                    onChange={(e) => setNewCr(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                  >
                    {DND_CR_LIST.map((c) => (
                      <option key={c.cr} value={c.cr}>
                        {c.cr} ({c.xp} XP)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dnd-m-hp">PV</Label>
                  <Input id="dnd-m-hp" type="number" min={1} value={newHp} onChange={(e) => setNewHp(Number(e.target.value) || 1)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dnd-m-ac">CA</Label>
                  <Input id="dnd-m-ac" type="number" min={1} value={newAc} onChange={(e) => setNewAc(Number(e.target.value) || 10)} />
                </div>
                <Button type="submit" size="sm">
                  <Plus /> Incluir
                </Button>
              </form>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Dificuldade estimada</h3>
                <Badge className={DIFF_STYLE[evaluation.difficulty]}>{evaluation.difficultyLabel}</Badge>
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">XP bruto (recompensa)</dt>
                  <dd className="font-medium tabular-nums">{evaluation.rawXp.toLocaleString("pt-BR")} XP</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Multiplicador ({evaluation.monsterCount} inimigo(s))</dt>
                  <dd className="font-medium tabular-nums">×{evaluation.multiplier}</dd>
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <dt className="font-medium">XP ajustado (desafio)</dt>
                  <dd className="font-semibold text-gold tabular-nums">{evaluation.adjustedXp.toLocaleString("pt-BR")} XP</dd>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <dt>XP por jogador (recompensa)</dt>
                  <dd className="tabular-nums">{evaluation.xpPerPlayer.toLocaleString("pt-BR")} XP</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-2">
              <h3 className="text-sm font-semibold">Presets rápidos (SRD 5.1)</h3>
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
                {DND_SRD_MONSTER_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => addPreset(p)}
                    className="flex items-center justify-between rounded border px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span>
                      <strong>{p.name}</strong> · {p.type}
                    </span>
                    <span className="text-muted-foreground tabular-nums">ND {p.cr}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === "combat" && (
        <CombatTracker storageKey="rpgforge:combat:dnd5e" parties={parties} state={combatState} onChange={setCombatState} />
      )}

      {tab === "ref" && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["condition", "Condições"],
                ["spell", "Magias"],
                ["equipment", "Equipamentos"],
              ] as const
            ).map(([k, lbl]) => (
              <Button key={k} type="button" size="sm" variant={refKind === k ? "default" : "outline"} onClick={() => setRefKind(k)}>
                {lbl}
              </Button>
            ))}
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={refQuery} onChange={(e) => setRefQuery(e.target.value)} placeholder="Filtrar..." className="h-8 pl-8 text-sm" />
            </div>
          </div>
          <ul className="divide-y rounded-md border">
            {filteredRef.map((e) => (
              <li key={e.id} className="p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{e.category}</span>
                </div>
                {e.summary && <p className="mt-0.5 text-xs text-muted-foreground">{e.summary}</p>}
                {e.text && e.text !== e.summary && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-gold">Texto completo</summary>
                    <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{e.text}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
