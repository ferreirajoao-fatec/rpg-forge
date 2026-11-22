"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import type { Catalog, CharacterData, Choice, ContentEntry, getEngine } from "@rpg-forge/rules-engine";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { IssueList, SeverityBadge } from "@/components/validation";
import { cn } from "@rpg-forge/ui/lib/utils";
import { Pager, paginate } from "@/components/pager";
import { FIT_ORDER, FIT_TITLE, fitContext, fitOf, isForYou, type Fit, type FitInfo } from "./relevance";

type Engine = ReturnType<typeof getEngine>;
type Update = (p: Partial<CharacterData>) => void;

/** Etapas de escolha única; as demais (perícias, poderes, magias...) aceitam várias opções. */
const SINGLE = new Set(["species", "class", "origin", "background", "deity"]);

const slug = (id: string) => id.slice(id.indexOf(":") + 1);

/** Opções do catálogo já escolhidas na ficha para este tipo de conteúdo. */
export function selectedIds(kind: string, data: CharacterData): string[] {
  switch (kind) {
    case "species":
      return data.speciesId ? [data.speciesId] : [];
    case "class":
      return data.classes.map((c) => c.classId);
    case "origin":
    case "background":
      return data.backgroundId ? [data.backgroundId] : [];
    default:
      return data.choices.filter((ch) => ch.contentId.startsWith(`${kind}:`)).map((ch) => ch.contentId);
  }
}

const choice = (slot: string, contentId: string, atLevel: number): Choice => ({ slot, contentId, atLevel, locked: false });

/** Alteração na ficha ao marcar ou desmarcar uma opção. */
export function toggleOption(kind: string, entry: ContentEntry, data: CharacterData): Partial<CharacterData> {
  const isSelected = selectedIds(kind, data).includes(entry.id);
  switch (kind) {
    case "species":
      // Trocar de raça zera os bônus distribuídos da raça anterior.
      return { speciesId: isSelected ? undefined : entry.id, assignedBonuses: {} };
    case "class":
      return {
        classes: isSelected ? [] : [{ classId: entry.id, levels: data.level }],
        // Escolhas próprias da classe anterior (ex.: Caminho do Arcanista) deixam de valer.
        choices: data.choices.filter((ch) => !ch.slot.startsWith("class-option:")),
      };
    case "origin":
    case "background":
      // Benefícios escolhidos da origem anterior deixam de valer.
      return {
        backgroundId: isSelected ? undefined : entry.id,
        choices: data.choices.filter((ch) => !ch.slot.startsWith("origin-benefit:")),
      };
    case "deity": {
      const rest = data.choices.filter((ch) => ch.slot !== "deity");
      return { choices: isSelected ? rest : [...rest, choice("deity", entry.id, data.level)] };
    }
    default: {
      if (isSelected) return { choices: data.choices.filter((ch) => ch.contentId !== entry.id) };
      return { choices: [...data.choices, choice(`${kind}:${slug(entry.id)}`, entry.id, data.level)] };
    }
  }
}

export function ChoiceStep({
  kind,
  entries,
  data,
  update,
  engine,
  catalog,
  canEdit,
}: {
  kind: string;
  entries: ContentEntry[];
  data: CharacterData;
  update: Update;
  engine: Engine;
  catalog: Catalog;
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const single = SINGLE.has(kind);
  // Escolhas múltiplas (poderes, magias, perícias) abrem no que serve para o personagem agora.
  const [tab, setTab] = useState<Tab>(single ? "all" : "available_now");
  const [forYou, setForYou] = useState(true);
  const [page, setPage] = useState(1);
  const q = query.trim().toLocaleLowerCase("pt-BR");
  // Raça, classe e origem são a base: listar todas. Nas demais, filtrar pelas escolhas anteriores.
  const filterByFit = FIT_KINDS.has(kind);
  const ctx = useMemo(() => fitContext(data, catalog), [data, catalog]);

  const rows = useMemo(() => {
    const selected = new Set(selectedIds(kind, data));
    return entries.map((e) => {
      const ev = engine.evaluateOption(data, e, catalog);
      const chosen = selected.has(e.id);
      const fit: FitInfo = filterByFit ? fitOf(kind, e, ctx, catalog) : { fit: "general", label: "" };
      return { entry: e, ev, chosen, fit, tab: (chosen ? "acquired" : ev.availability) as Tab };
    });
  }, [entries, data, catalog, engine, kind, ctx, filterByFit]);
  const inScope = rows.filter((r) => !filterByFit || !forYou || r.chosen || isForYou(r.fit.fit));
  const matches = inScope.filter((r) => !q || `${r.entry.name} ${r.entry.summary}`.toLocaleLowerCase("pt-BR").includes(q));
  const count = (t: Tab) => (t === "all" ? matches.length : matches.filter((r) => r.tab === t).length);
  const shown = matches
    .filter((r) => tab === "all" || r.tab === tab)
    .sort((a, b) => FIT_ORDER.indexOf(a.fit.fit) - FIT_ORDER.indexOf(b.fit.fit) || a.entry.name.localeCompare(b.entry.name, "pt-BR"));
  const { pages, current, slice } = paginate(shown, page, PAGE_SIZE);
  const hiddenOther = filterByFit && forYou ? rows.filter((r) => !r.chosen && !isForYou(r.fit.fit)).length : 0;
  const chosenEntries = rows.filter((r) => r.chosen).map((r) => r.entry);
  const go = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/50 p-3 text-sm">
        {chosenEntries.length ? (
          <p>
            <span className="text-muted-foreground">{single ? "Escolhido: " : `Escolhidos (${chosenEntries.length}): `}</span>
            <span className="font-medium">{chosenEntries.map((e) => e.name).join(", ")}</span>
          </p>
        ) : (
          <p className="text-muted-foreground">
            {kind === "deity"
              ? "Nenhuma divindade escolhida. Ser devoto é opcional."
              : single
                ? "Nada escolhido ainda. Clique em “Escolher” na opção desejada."
                : "Nada escolhido ainda. Clique em “Adicionar” nas opções desejadas."}
          </p>
        )}
      </div>

      {kind === "species" && <FlexibleBonus data={data} update={update} engine={engine} catalog={catalog} canEdit={canEdit} />}
      {(kind === "origin" || kind === "background") && <OriginBenefits data={data} update={update} catalog={catalog} canEdit={canEdit} />}
      {kind === "class" && <ClassOptions data={data} update={update} engine={engine} catalog={catalog} canEdit={canEdit} />}

      {filterByFit && (
        <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {ctx.className || ctx.speciesName
              ? `Mostrando primeiro o que combina com ${[ctx.speciesName, ctx.className, ctx.originName && `origem ${ctx.originName}`, ctx.deityName].filter(Boolean).join(", ")}.`
              : "Escolha raça e classe nas etapas anteriores para ver primeiro as opções feitas para o seu personagem."}
            {kind === "spell" && ctx.className && !ctx.classCasts && ` ${ctx.className} não lança magias: aqui aparecem só as que a raça ou outra habilidade concede.`}
            {hiddenOther > 0 && ` ${hiddenOther} opção(ões) de outras classes ou divindades estão ocultas.`}
          </span>
        </p>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {entries.length > 12 && (
            <Input
              type="search"
              value={query}
              onChange={(ev) => go(() => setQuery(ev.target.value))}
              placeholder={`Buscar entre ${inScope.length} opções`}
              aria-label="Buscar opções"
              className="max-w-sm"
            />
          )}
          {filterByFit && <ScopeToggle forYou={forYou} onChange={(v) => go(() => setForYou(v))} />}
        </div>

        {!single && (
          <>
            <div role="tablist" aria-label="Disponibilidade" className="flex flex-wrap gap-1 border-b">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => go(() => setTab(t.id))}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-1.5 text-sm",
                    tab === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label} <span className="text-xs tabular-nums text-muted-foreground">({count(t.id)})</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{TABS.find((t) => t.id === tab)?.hint}</p>
          </>
        )}
      </div>

      {slice.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {q ? "Nenhuma opção encontrada para essa busca." : tab === "acquired" ? "Você ainda não escolheu nada aqui." : "Nenhuma opção nesta aba."}
          {filterByFit && forYou && hiddenOther > 0 && " Experimente o “Catálogo completo”."}
        </p>
      ) : (
        <ul className="space-y-2">
          {slice.map(({ entry: e, ev, chosen, fit }, i) => {
            const fullText = typeof e.data.text === "string" && e.data.text !== e.summary ? e.data.text : "";
            const blocked = !chosen && ev.availability !== "available_now";
            const newGroup = filterByFit && (i === 0 || slice[i - 1].fit.fit !== fit.fit);
            return (
              <li key={e.id} className="space-y-2">
                {newGroup && <h3 className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{FIT_TITLE[fit.fit]}</h3>}
                <div className={cn("rounded-md border p-3", chosen && "border-primary bg-primary/5")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium">{e.name}</span>
                      {fit.label && <FitChip fit={fit.fit} label={fit.label} />}
                    </div>
                    <div className="flex items-center gap-2">
                      {chosen ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary px-2 py-0.5 text-xs font-medium text-primary">
                          <Check className="size-3.5" aria-hidden /> Escolhido
                        </span>
                      ) : (
                        <SeverityBadge status={ev.availability === "available_now" ? "valid" : ev.availability === "available_later" ? "warning" : "invalid"} />
                      )}
                      {canEdit && (
                        <Button
                          type="button"
                          size="sm"
                          variant={chosen ? "outline" : "default"}
                          disabled={blocked}
                          title={blocked ? "Pré-requisitos ainda não cumpridos" : undefined}
                          onClick={() => update(toggleOption(kind, e, data))}
                          aria-pressed={chosen}
                        >
                          {chosen ? "Remover" : single ? "Escolher" : "Adicionar"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {e.summary && <p className="mt-1 text-sm text-muted-foreground">{e.summary}</p>}
                  {fullText && (
                    <details className="mt-1 text-sm">
                      <summary className="cursor-pointer text-xs text-muted-foreground">Texto completo</summary>
                      <p className="mt-1 whitespace-pre-line">{fullText}</p>
                    </details>
                  )}
                  {e.source.page && <p className="mt-1 text-xs text-muted-foreground">Fonte: p. {e.source.page}</p>}
                  <IssueList issues={ev.issues} empty="" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pager page={current} pages={pages} total={shown.length} onPage={setPage} />
    </div>
  );
}

const PAGE_SIZE = 8;
/** Etapas em que a lista é filtrada pelas escolhas anteriores (classe, raça, origem, divindade). */
const FIT_KINDS = new Set(["power", "spell", "skill"]);

type Tab = "available_now" | "available_later" | "unavailable" | "acquired" | "all";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "available_now", label: "Disponíveis", hint: "Você já cumpre os pré-requisitos e pode escolher agora." },
  { id: "available_later", label: "Futuras", hint: "Ficam disponíveis quando você subir de nível ou cumprir outro requisito." },
  { id: "unavailable", label: "Indisponíveis", hint: "Incompatíveis com o personagem como ele está (classe, divindade, atributo...)." },
  { id: "acquired", label: "Escolhidas", hint: "O que você já escolheu nesta etapa." },
  { id: "all", label: "Tudo", hint: "Todas as opções, de qualquer disponibilidade." },
];

const FIT_STYLE: Record<Fit, string> = {
  class: "border-primary/40 bg-primary/10 text-primary",
  species: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  deity: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  origin: "border-sky-600/40 bg-sky-600/10 text-sky-700 dark:text-sky-400",
  general: "border-border bg-muted text-muted-foreground",
  other: "border-dashed border-border text-muted-foreground",
};

export function FitChip({ fit, label }: { fit: Fit; label: string }) {
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11px] leading-none", FIT_STYLE[fit])}>{label}</span>;
}

/** Alterna entre só o que combina com o personagem e o catálogo inteiro. */
export function ScopeToggle({ forYou, onChange }: { forYou: boolean; onChange: (v: boolean) => void }) {
  return (
    <div role="group" aria-label="Quais opções mostrar" className="inline-flex rounded-lg border p-0.5">
      {[
        { v: true, label: "Para você" },
        { v: false, label: "Catálogo completo" },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={forYou === o.v}
          onClick={() => onChange(o.v)}
          className={cn("rounded-md px-3 py-1 text-sm", forYou === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bônus de atributo que a raça deixa o jogador distribuir (ex.: +1 em três atributos). */
function FlexibleBonus({ data, update, engine, catalog, canEdit }: { data: CharacterData; update: Update; engine: Engine; catalog: Catalog; canEdit: boolean }) {
  const species = data.speciesId ? catalog.get(data.speciesId) : undefined;
  const flex = species?.data.flexibleBonus as { count: number; amount: number; exclude?: string[] } | undefined;
  if (!species || !flex) return null;
  const chosen = Object.entries(data.assignedBonuses).filter(([, v]) => v !== 0).map(([k]) => k);
  const sign = flex.amount > 0 ? `+${flex.amount}` : `${flex.amount}`;
  const toggle = (key: string) => {
    const next = { ...data.assignedBonuses };
    if (next[key]) delete next[key];
    else next[key] = flex.amount;
    update({ assignedBonuses: next });
  };
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">
        {species.name}: escolha {flex.count} atributos para {sign} ({chosen.length}/{flex.count})
      </legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {engine.abilities.map((a) => {
          const on = chosen.includes(a.key);
          const excluded = flex.exclude?.includes(a.key);
          return (
            <Button
              key={a.key}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              disabled={!canEdit || excluded || (!on && chosen.length >= flex.count)}
              onClick={() => toggle(a.key)}
            >
              {a.label} {on && sign}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Escolhas obrigatórias da classe (grupos exclusivos, como o Caminho do Arcanista). */
function ClassOptions({ data, update, engine, catalog, canEdit }: { data: CharacterData; update: Update; engine: Engine; catalog: Catalog; canEdit: boolean }) {
  if (!data.classes.length) return null;
  const options = catalog
    .ofKind("feature")
    .filter((e) => typeof e.data.exclusiveGroup === "string" && engine.evaluateOption(data, e, catalog).availability !== "unavailable");
  const groups = new Map<string, ContentEntry[]>();
  for (const e of options) {
    const g = e.data.exclusiveGroup as string;
    if (engine.evaluateOption(data, e, catalog).availability === "available_later") continue;
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  if (!groups.size) return null;
  return (
    <>
      {[...groups].map(([group, list]) => {
        const slot = `class-option:${group}`;
        const current = data.choices.find((ch) => ch.slot === slot)?.contentId;
        return (
          <fieldset key={group} className="rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Escolha da classe</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {list.map((e) => {
                const on = current === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        choices: [...data.choices.filter((ch) => ch.slot !== slot), ...(on ? [] : [choice(slot, e.id, data.level)])],
                      })
                    }
                    className={cn("rounded-md border p-2 text-left text-sm hover:bg-muted", on && "border-primary bg-primary/5")}
                  >
                    <span className="font-medium">{e.name.replace(/^.*?:\s*/, "")}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{e.summary}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}

interface OriginData {
  benefitsToChoose?: number;
  skillOptions?: string[];
  powerOptions?: string[];
  uniquePower?: { name: string; summary: string };
}

/**
 * Benefícios da origem (p. 85): perícias e poderes da lista ou o poder único da origem.
 * Perícias e poderes entram como escolhas normais da ficha; o poder único é registrado
 * com o id da própria origem, e um "poder à escolha" é completado na etapa Poderes.
 */
function OriginBenefits({ data, update, catalog, canEdit }: { data: CharacterData; update: Update; catalog: Catalog; canEdit: boolean }) {
  const origin = data.backgroundId ? catalog.get(data.backgroundId) : undefined;
  if (!origin) return null;
  const od = origin.data as OriginData;
  const max = od.benefitsToChoose ?? 2;
  if (max === 0) {
    return <p className="rounded-md border p-3 text-sm text-muted-foreground">{origin.summary}</p>;
  }
  const powers = catalog.ofKind("power");
  const options: { key: string; label: string; contentId: string; hint?: string }[] = [
    ...(od.skillOptions ?? []).map((id) => ({ key: id, label: catalog.get(id)?.name ?? slug(id), contentId: id })),
    ...(od.powerOptions ?? []).map((name) => {
      const found = powers.find((pw) => pw.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"));
      return found
        ? { key: found.id, label: found.name, contentId: found.id }
        : { key: `open:${name}`, label: name[0].toUpperCase() + name.slice(1), contentId: origin.id, hint: "Escolha o poder na etapa Poderes." };
    }),
    ...(od.uniquePower ? [{ key: "unique", label: od.uniquePower.name, contentId: origin.id, hint: od.uniquePower.summary }] : []),
  ];
  const slotOf = (key: string) => `origin-benefit:${key}`;
  const chosen = new Set(data.choices.filter((ch) => ch.slot.startsWith("origin-benefit:")).map((ch) => ch.slot));
  const toggle = (o: (typeof options)[number]) => {
    const slot = slotOf(o.key);
    if (chosen.has(slot)) {
      update({ choices: data.choices.filter((ch) => ch.slot !== slot) });
    } else {
      // Se a perícia/poder já foi escolhido em outra etapa, a escolha passa a contar como benefício da origem.
      const rest = data.choices.filter((ch) => o.contentId === origin.id || ch.contentId !== o.contentId);
      update({ choices: [...rest, choice(slot, o.contentId, data.level)] });
    }
  };
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">
        Benefícios de {origin.name}: escolha {max} ({chosen.size}/{max})
      </legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const on = chosen.has(slotOf(o.key));
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              disabled={!canEdit || (!on && chosen.size >= max)}
              onClick={() => toggle(o)}
              className={cn("rounded-md border p-2 text-left text-sm hover:bg-muted disabled:opacity-50", on && "border-primary bg-primary/5")}
            >
              <span className="font-medium">{o.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {o.contentId.startsWith("skill:") ? "perícia" : o.key === "unique" ? "poder da origem" : "poder"}
              </span>
              {o.hint && <span className="mt-1 block text-xs text-muted-foreground">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
