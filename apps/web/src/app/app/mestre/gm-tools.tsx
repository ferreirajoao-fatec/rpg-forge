"use client";

import { useMemo, useState, useTransition } from "react";
import { Coins, Dices, Minus, Plus, Search, Swords, Trash2 } from "lucide-react";
import {
  encounterNd,
  encounterXp,
  formatNd,
  parseNd,
  type EncounterOutcome,
  type TreasureMode,
  type TreasureResult,
} from "@rpg-forge/rules-engine/systems/tormenta20-gm";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { cn } from "@rpg-forge/ui/lib/utils";
import { rollTreasureAction } from "@/app/actions/gm";
import { paginate, Pager } from "@/components/pager";
import type { GmCreature, GmEntry } from "@/server/gm";

type Tab = "encontro" | "ameacas" | "perigos" | "regras";

const TABS: [Tab, string][] = [
  ["encontro", "Encontro"],
  ["ameacas", "Ameaças"],
  ["perigos", "Perigos"],
  ["regras", "Regras e condições"],
];

const HAZARD_LABEL: Record<string, string> = { armadilha: "Armadilhas", veneno: "Venenos", doenca: "Doenças", complexo: "Perigos complexos" };
const OUTCOME_LABEL: Record<EncounterOutcome, string> = { vitoria: "Vitória", empate: "Empate", derrota: "Derrota" };
const MODE_LABEL: Record<TreasureMode, string> = { padrao: "Padrão", metade: "Metade", dobro: "Dobro", nenhum: "Nenhum" };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Tesouro indicado na ficha da criatura, quando é um dos quatro valores da tabela. */
function modeOf(treasure: string): TreasureMode | null {
  const t = norm(treasure.trim());
  if (t.startsWith("nenhum")) return "nenhum";
  if (t.startsWith("metade")) return "metade";
  if (t.startsWith("dobro")) return "dobro";
  if (t.startsWith("padrao")) return "padrao";
  return null;
}

function NumberField(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{props.label}</span>
      <span className="flex items-center gap-1">
        <Button size="icon" variant="outline" className="size-7" aria-label={`Diminuir ${props.label.toLowerCase()}`} onClick={() => props.onChange(Math.max(props.min, props.value - 1))}>
          <Minus />
        </Button>
        <span className="w-8 text-center font-mono" aria-live="polite">
          {props.value}
        </span>
        <Button size="icon" variant="outline" className="size-7" aria-label={`Aumentar ${props.label.toLowerCase()}`} onClick={() => props.onChange(Math.min(props.max, props.value + 1))}>
          <Plus />
        </Button>
      </span>
    </label>
  );
}

export function GmTools(props: { creatures: GmCreature[]; entries: GmEntry[]; packVersion: string }) {
  const [tab, setTab] = useState<Tab>("encontro");
  const [encounter, setEncounter] = useState<{ id: string; count: number }[]>([]);
  const byId = useMemo(() => new Map(props.creatures.map((c) => [c.id, c])), [props.creatures]);

  const add = (id: string) => {
    setEncounter((e) => (e.some((x) => x.id === id) ? e.map((x) => (x.id === id ? { ...x, count: x.count + 1 } : x)) : [...e, { id, count: 1 }]));
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Ferramentas" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
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
            {id === "encontro" && encounter.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({encounter.reduce((t, x) => t + x.count, 0)})</span>}
          </button>
        ))}
      </div>

      {tab === "encontro" && <EncounterBuilder creatures={props.creatures} byId={byId} encounter={encounter} setEncounter={setEncounter} onAdd={add} />}
      {tab === "ameacas" && <Bestiary creatures={props.creatures} onAdd={(id) => add(id)} />}
      {tab === "perigos" && <EntryList entries={props.entries.filter((e) => e.kind === "hazard")} groups={HAZARD_LABEL} label="perigos" />}
      {tab === "regras" && (
        <EntryList
          entries={props.entries.filter((e) => e.kind !== "hazard")}
          groups={{ condicao: "Condições", regra: "Regras do mestre", "habilidade-de-criatura": "Habilidades de criaturas", "traco-de-grupo": "Traços de grupos" }}
          label="regras"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Conteúdo do livro básico de Tormenta20 (2020) sob a OGL 1.0a, pacote {props.packVersion}. As páginas citadas são as do livro.
      </p>
    </div>
  );
}

function EncounterBuilder(props: {
  creatures: GmCreature[];
  byId: Map<string, GmCreature>;
  encounter: { id: string; count: number }[];
  setEncounter: React.Dispatch<React.SetStateAction<{ id: string; count: number }[]>>;
  onAdd: (id: string) => void;
}) {
  const [level, setLevel] = useState(1);
  const [size, setSize] = useState(4);
  const [outcome, setOutcome] = useState<EncounterOutcome>("vitoria");
  const [query, setQuery] = useState("");
  const [modeOverride, setModeOverride] = useState<TreasureMode | null>(null);
  const [treasure, setTreasure] = useState<TreasureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = props.encounter.flatMap((e) => {
    const c = props.byId.get(e.id);
    return c ? [{ creature: c, count: e.count }] : [];
  });
  const nd = encounterNd(groups.map((g) => ({ nd: g.creature.nd, count: g.count })));
  const xp = encounterXp(
    groups.map((g) => ({ nd: g.creature.nd, count: g.count })),
    { level, size },
    outcome,
  );
  const suggestedMode: TreasureMode = groups.length === 1 ? (modeOf(groups[0].creature.treasure) ?? "padrao") : "padrao";
  const mode = modeOverride ?? suggestedMode;
  const difference = groups.length ? nd.nd - level : 0;
  // O livro: ND igual ao nível do grupo (de quatro personagens) é um combate equilibrado.
  const difficulty = !groups.length
    ? null
    : difference === 0
      ? "No nível do grupo (equilibrado)"
      : difference < 0
        ? `${formatNd(-difference)} abaixo do nível do grupo`
        : `${formatNd(difference)} acima do nível do grupo`;
  const suggestions = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    return props.creatures.filter((c) => norm(c.name).includes(q)).slice(0, 6);
  }, [query, props.creatures]);

  const setCount = (id: string, count: number) => props.setEncounter((e) => (count <= 0 ? e.filter((x) => x.id !== id) : e.map((x) => (x.id === id ? { ...x, count } : x))));

  const rollTreasure = () =>
    startTransition(async () => {
      setError(null);
      const r = await rollTreasureAction(nd.nd, mode);
      if (r.ok) setTreasure(r.result);
      else setError(r.error);
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-labelledby="enc-title" className="space-y-3 rounded-xl border bg-card p-4">
        <h2 id="enc-title" className="font-heading text-lg font-semibold">
          Inimigos do combate
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ameaça para adicionar (ex.: goblin)" className="pl-8" aria-label="Buscar ameaça" />
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
                    <span className="text-xs text-muted-foreground">ND {c.nd}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum inimigo ainda. Busque acima ou use “Adicionar ao encontro” na aba Ameaças.</p>
        ) : (
          <ul className="divide-y">
            {groups.map(({ creature: c, count }, i) => {
              const g = xp.groups[i];
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ND {c.nd} · {c.type} {c.size} · tesouro: {c.treasure || "—"}
                      {g?.trivial && " · fácil demais: não rende XP"}
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
              );
            })}
          </ul>
        )}
      </section>

      <aside className="space-y-3">
        <section aria-labelledby="party-title" className="space-y-3 rounded-xl border bg-card p-4">
          <h2 id="party-title" className="font-heading text-lg font-semibold">
            Grupo
          </h2>
          <NumberField label="Nível dos personagens" value={level} min={1} max={20} onChange={setLevel} />
          <NumberField label="Personagens no grupo" value={size} min={1} max={10} onChange={setSize} />
          <fieldset className="space-y-1">
            <legend className="text-sm">Resultado do combate</legend>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(OUTCOME_LABEL) as EncounterOutcome[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={outcome === o}
                  onClick={() => setOutcome(o)}
                  className={cn("rounded-md border px-2 py-1 text-sm", outcome === o ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="result-title" className="space-y-2 rounded-xl border bg-card p-4" aria-live="polite">
          <h2 id="result-title" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Swords className="size-4" aria-hidden /> Resultado
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">ND do combate</dt>
              <dd className="font-heading text-2xl">{groups.length ? `${nd.exact ? "" : "≈ "}${nd.label}` : "—"}</dd>
            </div>
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">Comparação com o nível {level}</dt>
              <dd className="font-medium">{difficulty ?? "—"}</dd>
            </div>
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">XP total ({OUTCOME_LABEL[outcome].toLowerCase()})</dt>
              <dd className="font-medium">{xp.total.toLocaleString("pt-BR")}</dd>
            </div>
            <div className="rounded-md bg-muted p-2">
              <dt className="text-xs text-muted-foreground">XP por personagem</dt>
              <dd className="font-medium">{xp.perCharacter.toLocaleString("pt-BR")}</dd>
            </div>
          </dl>
          {!nd.exact && groups.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Com ameaças diferentes o livro não traz fórmula de ND; este valor é uma estimativa que segue a mesma lógica (+2 a cada vez que o poder
              dobra). A XP é exata: cada criatura conta separadamente.
            </p>
          )}
          {size !== 4 && groups.length > 0 && (
            <p className="text-xs text-muted-foreground">O ND considera grupos de quatro personagens; com {size}, ajuste os inimigos para {size < 4 ? "menos" : "mais"}.</p>
          )}
          <p className="text-xs text-muted-foreground">
            O livro sugere um ou dois combates do nível do grupo antes de descansar. Em aventuras com muitas lutas, reduza o ND de cada uma em 1 ou 2.
          </p>
        </section>

        <section aria-labelledby="treasure-title" className="space-y-2 rounded-xl border bg-card p-4">
          <h2 id="treasure-title" className="flex items-center gap-2 font-heading text-lg font-semibold">
            <Coins className="size-4" aria-hidden /> Tesouro
          </h2>
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(MODE_LABEL) as TreasureMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setModeOverride(m)}
                className={cn("rounded-md border px-1 py-1 text-xs", mode === m ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          {groups.length === 1 && !modeOverride && modeOf(groups[0].creature.treasure) && (
            <p className="text-xs text-muted-foreground">Modo vindo da ficha de {groups[0].creature.name}.</p>
          )}
          {groups.length === 1 && !modeOf(groups[0].creature.treasure) && groups[0].creature.treasure && (
            <p className="text-xs text-muted-foreground">Tesouro próprio da criatura: {groups[0].creature.treasure}.</p>
          )}
          <Button className="w-full" onClick={rollTreasure} disabled={!groups.length || pending}>
            <Dices /> {pending ? "Rolando…" : `Rolar tesouro (ND ${groups.length ? nd.label : "—"})`}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {treasure && (
            <div className="space-y-1 rounded-md border p-2 text-sm">
              <p className="text-xs text-muted-foreground">
                Linha ND {treasure.row} · d% dinheiro {treasure.rolls.money || "—"} · d% itens {treasure.rolls.items.join(", ") || "—"}
              </p>
              <p>
                <span className="font-medium">Dinheiro:</span> {treasure.money ? treasure.money.text : "Nada"}
                {treasure.money && treasure.money.table !== "—" && treasure.money.table !== treasure.money.text && <span className="text-muted-foreground"> ({treasure.money.table})</span>}
              </p>
              {treasure.items.map((it, i) => (
                <p key={i}>
                  <span className="font-medium">Item:</span> {it.text}
                </p>
              ))}
              {treasure.notes.map((n) => (
                <p key={n} className="text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

const ND_FILTERS: [string, (nd: number) => boolean][] = [
  ["Todos", () => true],
  ["Até 1", (n) => n <= 1],
  ["2 a 4", (n) => n >= 2 && n <= 4],
  ["5 a 8", (n) => n >= 5 && n <= 8],
  ["9 a 12", (n) => n >= 9 && n <= 12],
  ["13 ou mais", (n) => n >= 13],
];

function Bestiary(props: { creatures: GmCreature[]; onAdd: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [ndFilter, setNdFilter] = useState(0);
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(props.creatures.map((c) => c.group).filter(Boolean))].sort(), [props.creatures]);
  const filtered = useMemo(() => {
    const q = norm(query);
    return props.creatures
      .filter((c) => (!q || norm(`${c.name} ${c.type} ${c.group}`).includes(q)) && ND_FILTERS[ndFilter][1](parseNd(c.nd)) && (!group || c.group === group))
      .sort((a, b) => parseNd(a.nd) - parseNd(b.nd) || a.name.localeCompare(b.name));
  }, [props.creatures, query, ndFilter, group]);
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
            placeholder="Buscar por nome, tipo ou grupo"
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
          aria-label="Grupo de ameaças"
        >
          <option value="">Todos os grupos</option>
          {groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por ND">
        {ND_FILTERS.map(([label], i) => (
          <button
            key={label}
            type="button"
            aria-pressed={ndFilter === i}
            onClick={() => {
              setNdFilter(i);
              setPage(1);
            }}
            className={cn("rounded-full border px-3 py-1 text-xs", ndFilter === i ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}
          >
            ND {label.toLowerCase()}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} ameaça(s)
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {slice.map((c) => (
          <li key={c.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-heading text-base font-semibold">{c.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {c.type} {c.size}
                  {c.group && ` · ${c.group}`}
                  {c.page && ` · p. ${c.page}`}
                </p>
              </div>
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-primary">ND {c.nd}</span>
            </div>
            <p className="mt-2 text-sm">{c.text}</p>
            {c.actions.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Habilidades ({c.actions.length})</summary>
                <ul className="mt-1 space-y-1">
                  {c.actions.map((a) => (
                    <li key={a.name}>
                      <span className="font-medium">
                        {a.name}
                        {a.cost && ` (${a.cost})`}.
                      </span>{" "}
                      {a.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Tesouro: {c.treasure || "—"}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  props.onAdd(c.id);
                  setAdded(c.name);
                }}
              >
                <Plus /> Adicionar ao encontro
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {added && (
        <p className="text-sm text-muted-foreground" role="status">
          {added} adicionado ao encontro.
        </p>
      )}
      <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} label="ameaças" />
    </section>
  );
}

function EntryList(props: { entries: GmEntry[]; groups: Record<string, string>; label: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const categories = useMemo(() => [...new Set(props.entries.map((e) => e.category))].filter((c) => props.groups[c]), [props.entries, props.groups]);
  const filtered = useMemo(() => {
    const q = norm(query);
    return props.entries
      .filter((e) => (!category || e.category === category) && (!q || norm(`${e.name} ${e.text}`).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [props.entries, query, category]);
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
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Categoria">
        {[["", "Todas"] as const, ...categories.map((c) => [c, props.groups[c]] as const)].map(([id, label]) => (
          <button
            key={id || "all"}
            type="button"
            aria-pressed={category === id}
            onClick={() => {
              setCategory(id);
              setPage(1);
            }}
            className={cn("rounded-full border px-3 py-1 text-xs", category === id ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} resultado(s)
      </p>
      <ul className="space-y-2">
        {slice.map((e) => (
          <li key={e.id} className="rounded-lg border bg-card">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span className="font-medium">{e.name}</span>
                <span className="text-xs text-muted-foreground">
                  {props.groups[e.category] ?? e.category}
                  {e.nd && ` · ND ${e.nd}`}
                  {e.page && ` · p. ${e.page}`}
                </span>
              </summary>
              <p className="border-t px-4 py-3 text-sm whitespace-pre-line">{e.text || e.summary}</p>
            </details>
          </li>
        ))}
      </ul>
      <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} label={props.label} />
    </section>
  );
}
