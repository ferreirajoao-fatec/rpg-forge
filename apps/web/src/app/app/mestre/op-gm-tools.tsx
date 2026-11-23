"use client";

import { useMemo, useState } from "react";
import { Award, Compass, Eye, Footprints, Minus, Plus, Search, Skull, Swords, Trash2 } from "lucide-react";
import {
  calculateMissionPrestige,
  evaluateOpEncounter,
  OP_NEX_BY_LEVEL,
  OP_RANKS,
} from "@rpg-forge/rules-engine";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { cn } from "@rpg-forge/ui/lib/utils";
import { paginate, Pager } from "@/components/pager";
import type { GmCreature, GmEntry, GmParty } from "@/server/gm";
import { CombatTracker, type Combatant, type CombatState } from "./combat-tracker";

type Tab = "encontro" | "combate" | "cenas" | "ameacas" | "perigos" | "regras";

const TABS: [Tab, string][] = [
  ["encontro", "Combate e Prestígio"],
  ["combate", "Rastreador"],
  ["cenas", "Cenas (SaH)"],
  ["ameacas", "Ameaças"],
  ["perigos", "Perigos"],
  ["regras", "Regras e condições"],
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function NumberField(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{props.label}</span>
      <span className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label={`Diminuir ${props.label.toLowerCase()}`}
          onClick={() => props.onChange(Math.max(props.min, props.value - 1))}
        >
          <Minus />
        </Button>
        <span className="w-8 text-center font-mono" aria-live="polite">
          {props.value}
        </span>
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label={`Aumentar ${props.label.toLowerCase()}`}
          onClick={() => props.onChange(Math.min(props.max, props.value + 1))}
        >
          <Plus />
        </Button>
      </span>
    </label>
  );
}

const DIFFICULTY_STYLE: Record<string, string> = {
  trivial: "text-muted-foreground",
  facil: "text-success",
  equilibrado: "text-foreground",
  dificil: "text-warning",
  mortal: "text-destructive",
};

export function OpGmTools(props: { creatures: GmCreature[]; entries: GmEntry[]; packVersion: string; parties?: GmParty[] }) {
  const [tab, setTab] = useState<Tab>("encontro");
  const [encounter, setEncounter] = useState<{ id: string; count: number }[]>([]);
  const [combat, setCombat] = useState<CombatState>({ round: 1, activeId: null, combatants: [] });
  const byId = useMemo(() => new Map(props.creatures.map((c) => [c.id, c])), [props.creatures]);

  const add = (id: string) => {
    setEncounter((e) => (e.some((x) => x.id === id) ? e.map((x) => (x.id === id ? { ...x, count: x.count + 1 } : x)) : [...e, { id, count: 1 }]));
  };

  const sendToTracker = () => {
    const added: Combatant[] = [];
    for (const item of encounter) {
      const c = byId.get(item.id);
      if (!c) continue;
      const hp = c.hp ?? 20;
      for (let i = 1; i <= item.count; i++) {
        added.push({
          id: `${c.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: item.count > 1 ? `${c.name} #${i}` : c.name,
          kind: "enemy",
          initiative: 0,
          initFormula: "2d20kh1+5",
          hp,
          maxHp: hp,
          defense: c.defense ?? null,
          conditions: [],
        });
      }
    }
    if (added.length) {
      setCombat((prev) => ({ ...prev, combatants: [...prev.combatants, ...added] }));
      setTab("combate");
    }
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Ferramentas de Ordem Paranormal" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("rounded-md px-3 py-1.5", tab === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
            {id === "encontro" && encounter.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({encounter.reduce((t, x) => t + x.count, 0)})</span>
            )}
            {id === "combate" && combat.combatants.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({combat.combatants.length})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "encontro" && <OpEncounterBuilder creatures={props.creatures} byId={byId} encounter={encounter} setEncounter={setEncounter} onAdd={add} onSendToTracker={sendToTracker} />}
      {tab === "combate" && <CombatTracker storageKey="rpgforge:combat:op" parties={props.parties ?? []} state={combat} onChange={setCombat} />}
      {tab === "cenas" && <SahScenesTracker />}
      {tab === "ameacas" && <OpBestiary creatures={props.creatures} onAdd={add} />}
      {tab === "perigos" && <OpEntryList entries={props.entries.filter((e) => e.kind === "hazard")} label="perigos" />}
      {tab === "regras" && (
        <OpEntryList
          entries={props.entries.filter((e) => e.kind !== "hazard")}
          groups={{ condicao: "Condições", regra: "Regras do mestre" }}
          label="regras e condições"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Conteúdo de Ordem Paranormal RPG (v1.1 + Sobrevivendo ao Horror v1.3.1), pacote {props.packVersion}. Uso local/privado.
      </p>
    </div>
  );
}

function OpEncounterBuilder(props: {
  creatures: GmCreature[];
  byId: Map<string, GmCreature>;
  encounter: { id: string; count: number }[];
  setEncounter: React.Dispatch<React.SetStateAction<{ id: string; count: number }[]>>;
  onAdd: (id: string) => void;
  onSendToTracker: () => void;
}) {
  const [avgNex, setAvgNex] = useState(15);
  const [size, setSize] = useState(4);
  const [veteran, setVeteran] = useState(false);
  const [query, setQuery] = useState("");

  // Calculadora de Prestígio por Missão (Tabela 3.2)
  const [solvedCase, setSolvedCase] = useState(true);
  const [extraClues, setExtraClues] = useState(0);
  const [innocentDeaths, setInnocentDeaths] = useState(0);
  const [agentDeaths, setAgentDeaths] = useState(0);

  const groups = props.encounter.flatMap((e) => {
    const c = props.byId.get(e.id);
    return c ? [{ creature: c, count: e.count }] : [];
  });
  const balance = evaluateOpEncounter(
    groups.map((g) => ({ vd: g.creature.vd ?? (Number(g.creature.nd) || 0), count: g.count })),
    { size, avgNex, veteran },
  );
  const prestige = calculateMissionPrestige({ solvedCase, extraClues, innocentDeaths, agentDeaths });

  const suggestions = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    return props.creatures.filter((c) => norm(`${c.name} ${c.group} ${c.element ?? ""}`).includes(q)).slice(0, 6);
  }, [query, props.creatures]);

  const setCount = (id: string, count: number) =>
    props.setEncounter((e) => (count <= 0 ? e.filter((x) => x.id !== id) : e.map((x) => (x.id === id ? { ...x, count } : x))));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="op-enc-title" className="space-y-3 rounded-xl border bg-card p-4">
        <h2 id="op-enc-title" className="font-heading text-lg font-semibold">
          Ameaças do combate
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ameaça (ex.: Zumbi de Sangue, Esqueleto de Lodo)"
            className="pl-8"
            aria-label="Buscar ameaça"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      props.onAdd(c.id);
                      setQuery("");
                    }}
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      VD {c.vd ?? c.nd} · {c.group}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ameaça adicionada. Busque acima ou use “Adicionar ao combate” na aba Ameaças.</p>
        ) : (
          <ul className="divide-y">
            {groups.map(({ creature: c, count }) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    VD {c.vd ?? c.nd}
                    {c.group && ` · ${c.group}`}
                    {c.defense != null && ` · Defesa ${c.defense}`}
                    {c.hp != null && ` · ${c.hp} PV`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="size-7" aria-label={`Um ${c.name} a menos`} onClick={() => setCount(c.id, count - 1)}>
                    <Minus />
                  </Button>
                  <span className="w-8 text-center font-mono">{count}</span>
                  <Button size="icon" variant="outline" className="size-7" aria-label={`Um ${c.name} a mais`} onClick={() => setCount(c.id, count + 1)}>
                    <Plus />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Remover ${c.name}`} onClick={() => setCount(c.id, 0)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-3">
        <section aria-labelledby="op-party-title" className="space-y-3 rounded-xl border bg-card p-4">
          <h2 id="op-party-title" className="font-heading text-lg font-semibold">
            Equipe de agentes
          </h2>
          <NumberField label="Agentes na equipe" value={size} min={1} max={10} onChange={setSize} />
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>NEX médio</span>
            <select
              value={avgNex}
              onChange={(e) => setAvgNex(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 font-mono text-sm"
              aria-label="NEX médio do grupo"
            >
              {OP_NEX_BY_LEVEL.map((nex) => (
                <option key={nex} value={nex}>
                  NEX {nex}%
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={veteran} onChange={(e) => setVeteran(e.target.checked)} />
            <span>Jogadores veteranos (difícil até 2× NEX)</span>
          </label>
        </section>

        <section aria-labelledby="op-balance-title" className="space-y-2 rounded-xl border bg-card p-4" aria-live="polite">
          <h2 id="op-balance-title" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Swords className="size-4" aria-hidden /> Equilíbrio (VD × NEX)
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">VD total</dt>
              <dd className="font-heading text-2xl tabular-nums">{balance.totalVd || "—"}</dd>
            </div>
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Soma de NEX</dt>
              <dd className="font-heading text-2xl tabular-nums">{balance.partyNex}</dd>
            </div>
            <div className="col-span-2 rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Dificuldade estimada</dt>
              <dd className={cn("font-semibold", DIFFICULTY_STYLE[balance.difficulty])}>{balance.label}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">{balance.guidance}</p>
          <Button type="button" variant="outline" className="w-full" disabled={!groups.length} onClick={props.onSendToTracker}>
            <Swords className="size-4" /> Enviar para o rastreador
          </Button>
        </section>

        <section aria-labelledby="op-prestige-title" className="space-y-3 rounded-xl border bg-card p-4">
          <h2 id="op-prestige-title" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Award className="size-4" aria-hidden /> Prestígio da missão
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={solvedCase} onChange={(e) => setSolvedCase(e.target.checked)} />
            <span>Solução do caso (+10 PP)</span>
          </label>
          <NumberField label="Pistas adicionais (+2 PP)" value={extraClues} min={0} max={20} onChange={setExtraClues} />
          <NumberField label="Mortes de inocentes (–2 PP)" value={innocentDeaths} min={0} max={20} onChange={setInnocentDeaths} />
          <NumberField label="Mortes de agentes (–5 PP)" value={agentDeaths} min={0} max={10} onChange={setAgentDeaths} />
          <div className="rounded-md bg-muted p-2.5 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Total por agente</span>
              <span className="font-heading text-xl font-bold tabular-nums">
                {prestige.total >= 0 ? `+${prestige.total}` : prestige.total} PP
              </span>
            </div>
            {prestige.breakdown.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{prestige.breakdown.join(" · ")}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Patentes (p. 52): {OP_RANKS.map((r) => `${r.label} (${r.minPrestige} PP)`).join(" · ")}.
          </p>
        </section>
      </aside>
    </div>
  );
}

const VD_FILTERS: [string, (vd: number) => boolean][] = [
  ["Todos", () => true],
  ["Até 40", (v) => v <= 40],
  ["60 a 120", (v) => v >= 60 && v <= 120],
  ["140 a 240", (v) => v >= 140 && v <= 240],
  ["260 a 340", (v) => v >= 260 && v <= 340],
  ["360+ / Relíquias", (v) => v >= 360],
];

function OpBestiary(props: { creatures: GmCreature[]; onAdd: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [vdFilter, setVdFilter] = useState(0);
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(props.creatures.map((c) => c.group).filter(Boolean))].sort(), [props.creatures]);
  const vdOf = (c: GmCreature) => c.vd ?? (Number(c.nd) || 0);

  const filtered = useMemo(() => {
    const q = norm(query);
    return props.creatures
      .filter((c) => (!q || norm(`${c.name} ${c.group} ${c.element ?? ""} ${c.type}`).includes(q)) && VD_FILTERS[vdFilter][1](vdOf(c)) && (!group || c.group === group))
      .sort((a, b) => vdOf(a) - vdOf(b) || a.name.localeCompare(b.name, "pt-BR"));
  }, [props.creatures, query, vdFilter, group]);

  const { pages, current, slice } = paginate(filtered, page, 8);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar ameaça por nome ou elemento"
            className="pl-8"
            aria-label="Buscar ameaça"
          />
        </div>
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Elemento ou grupo"
        >
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por VD">
        {VD_FILTERS.map(([label], i) => (
          <Button
            key={label}
            size="sm"
            variant={vdFilter === i ? "default" : "outline"}
            onClick={() => {
              setVdFilter(i);
              setPage(1);
            }}
          >
            {label === "Todos" ? label : `VD ${label}`}
          </Button>
        ))}
      </div>
      {slice.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nenhuma ameaça encontrada com esses filtros.</p>
      ) : (
        <ul className="space-y-2">
          {slice.map((c) => (
            <li key={c.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="flex flex-wrap items-center gap-2 font-medium">
                    <Skull className="size-4 text-muted-foreground" aria-hidden />
                    {c.name}
                    <Badge variant="outline">VD {c.vd ?? c.nd}</Badge>
                    {c.group && <Badge variant="secondary">{c.group}</Badge>}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      c.type,
                      c.defense != null ? `Defesa ${c.defense}` : "",
                      c.hp != null ? `${c.hp} PV` : "",
                      c.presence ? `Presença Perturbadora: ${c.presence}` : "",
                      c.page ? `p. ${c.page}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    props.onAdd(c.id);
                    setAdded(c.id);
                  }}
                >
                  <Plus /> {added === c.id ? "Adicionada" : "Adicionar ao combate"}
                </Button>
              </div>
              {c.enigma && (
                <p className="mt-2 rounded bg-muted/60 px-2.5 py-1.5 text-xs">
                  <span className="font-semibold">Enigma de Medo:</span> {c.enigma}
                </p>
              )}
              {c.text && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Ver ficha da ameaça</summary>
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{c.text}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} label="ameaças" />
    </section>
  );
}

function OpEntryList(props: { entries: GmEntry[]; groups?: Record<string, string>; label: string }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = norm(query);
    return props.entries
      .filter((e) => (!q || norm(`${e.name} ${e.summary} ${e.text}`).includes(q)) && (!group || e.category === group))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [props.entries, query, group]);
  const { pages, current, slice } = paginate(filtered, page, 10);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={`Buscar ${props.label}`}
            className="pl-8"
            aria-label={`Buscar ${props.label}`}
          />
        </div>
        {props.groups && (
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos</option>
            {Object.entries(props.groups).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </div>
      {slice.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Nada encontrado com esse filtro.</p>
      ) : (
        <ul className="space-y-2">
          {slice.map((e) => (
            <li key={e.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{e.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {[e.section, e.page ? `p. ${e.page}` : ""].filter(Boolean).join(" · ")}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{e.summary}</p>
              {e.text && e.text !== e.summary && (
                <details className="mt-1.5 text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Texto completo</summary>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{e.text}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} label={props.label} />
    </section>
  );
}

/** Rastreadores de Furtividade, Perseguição e Investigação com Urgência (Sobrevivendo ao Horror, pp. 84, 91–94). */
function SahScenesTracker() {
  const [visibility, setVisibility] = useState(0);
  const [chaseGoal, setChaseGoal] = useState<3 | 5>(3);
  const [chaseSuccesses, setChaseSuccesses] = useState(0);
  const [chaseFailures, setChaseFailures] = useState(0);
  const [invRounds, setInvRounds] = useState(4);
  const [invCurrent, setInvCurrent] = useState(1);

  const visLabel =
    visibility === 0
      ? "Despercebido (sem penalidades)"
      : visibility === 1
        ? "Suspeita (ameaça procura sinais)"
        : visibility === 2
          ? "Alerta (testes de Furtividade com –1d20)"
          : "Detectado (inicia combate ou perseguição!)";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Furtividade (SaH p. 93) */}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
          <Eye className="size-4" aria-hidden /> Furtividade (SaH p. 93)
        </h2>
        <div className="rounded-md bg-muted p-3 text-center">
          <p className="text-xs text-muted-foreground">Nível de Visibilidade</p>
          <p className={cn("font-heading text-3xl font-bold tabular-nums", visibility >= 3 && "text-destructive")}>
            {visibility} / 3
          </p>
          <p className="mt-1 text-xs font-medium">{visLabel}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setVisibility((v) => Math.max(0, v - 1))}>
            −1 Visibilidade
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setVisibility((v) => Math.min(3, v + 1))}>
            +1 Visibilidade
          </Button>
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><strong>Esconder-se (Furtividade):</strong> reduz 1 ponto de Visibilidade.</li>
          <li><strong>Distrair (Enganação/Crime):</strong> evita aumento em área vigiada.</li>
          <li><strong>Chamar atenção (ação livre):</strong> atrai foco para si (+1 Visib.).</li>
          <li><strong>Fugir:</strong> sai da cena quando Visibilidade = 0 ou com cobertura.</li>
        </ul>
      </section>

      {/* Perseguição (SaH p. 91) */}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
            <Footprints className="size-4" aria-hidden /> Perseguição (SaH p. 91)
          </h2>
          <div className="flex gap-1">
            <Button type="button" size="xs" variant={chaseGoal === 3 ? "default" : "outline"} onClick={() => setChaseGoal(3)}>
              Menor (3)
            </Button>
            <Button type="button" size="xs" variant={chaseGoal === 5 ? "default" : "outline"} onClick={() => setChaseGoal(5)}>
              Maior (5)
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Sucessos</p>
            <p className={cn("font-heading text-2xl font-bold tabular-nums", chaseSuccesses >= chaseGoal && "text-success")}>
              {chaseSuccesses} / {chaseGoal}
            </p>
            <div className="mt-1 flex justify-center gap-1">
              <Button type="button" size="xs" variant="outline" onClick={() => setChaseSuccesses((s) => Math.max(0, s - 1))}>−</Button>
              <Button type="button" size="xs" variant="outline" onClick={() => setChaseSuccesses((s) => Math.min(chaseGoal, s + 1))}>+</Button>
            </div>
          </div>
          <div className="rounded-md bg-muted p-2.5 text-center">
            <p className="text-xs text-muted-foreground">Falhas (máx. 3)</p>
            <p className={cn("font-heading text-2xl font-bold tabular-nums", chaseFailures >= 3 && "text-destructive")}>
              {chaseFailures} / 3
            </p>
            <div className="mt-1 flex justify-center gap-1">
              <Button type="button" size="xs" variant="outline" onClick={() => setChaseFailures((f) => Math.max(0, f - 1))}>−</Button>
              <Button type="button" size="xs" variant="outline" onClick={() => setChaseFailures((f) => Math.min(3, f + 1))}>+</Button>
            </div>
          </div>
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><strong>Correr / Esforço extra:</strong> Atletismo ou Fortitude (–2 PV para +1d20).</li>
          <li><strong>Cortar caminho / Despistar:</strong> Acrobacia, Furtividade ou Sobrevivência.</li>
          <li><strong>3 falhas antes da meta:</strong> a presa é alcançada pelo algoz.</li>
        </ul>
      </section>

      {/* Investigação e Urgência (SaH p. 84) */}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
          <Compass className="size-4" aria-hidden /> Investigação (SaH p. 84)
        </h2>
        <div className="rounded-md bg-muted p-3 text-center">
          <p className="text-xs text-muted-foreground">Rodada atual da cena</p>
          <p className={cn("font-heading text-3xl font-bold tabular-nums", invCurrent > invRounds && "text-destructive")}>
            {invCurrent} / {invRounds}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            Limite:
            <Input
              type="number"
              min={1}
              max={12}
              className="h-7 w-14"
              value={invRounds}
              onChange={(e) => setInvRounds(Math.max(1, Math.min(12, Number(e.target.value) || 4)))}
            />
          </label>
          <div className="flex gap-1">
            <Button type="button" size="xs" variant="outline" onClick={() => setInvCurrent(1)}>Reiniciar</Button>
            <Button type="button" size="xs" onClick={() => setInvCurrent((r) => r + 1)}>Avançar rodada</Button>
          </div>
        </div>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li><strong>Procurar pistas:</strong> DT padrão 15 (básica), 20 (importante), 25 (oculta).</li>
          <li><strong>Facilitar investigação:</strong> sucesso dá +2 ou +1d20 ao aliado na cena.</li>
          <li><strong>Sucesso a qualquer custo:</strong> passa na busca, mas dispara evento ou perda de recurso.</li>
        </ul>
      </section>
    </div>
  );
}
