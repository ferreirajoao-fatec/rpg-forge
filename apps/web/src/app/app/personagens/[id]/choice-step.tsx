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

/** Slot da sub-raça (D&D 2014) ou da linhagem/legado/ancestralidade (D&D 2024). */
const SUBSPECIES_SLOT = "subspecies";

/** Texto completo de uma opção: string (Tormenta20) ou parágrafos (D&D). */
export function fullTextOf(e: ContentEntry): string {
  const t = e.data.text;
  const text = Array.isArray(t) ? (t as string[]).join("\n\n") : typeof t === "string" ? t : "";
  return text && text !== e.summary ? text : "";
}

/** Alteração na ficha ao marcar ou desmarcar uma opção. */
export function toggleOption(kind: string, entry: ContentEntry, data: CharacterData): Partial<CharacterData> {
  const isSelected = selectedIds(kind, data).includes(entry.id);
  switch (kind) {
    case "species":
      // Trocar de raça zera os bônus distribuídos e a sub-raça/linhagem da raça anterior.
      return {
        speciesId: isSelected ? undefined : entry.id,
        assignedBonuses: {},
        choices: data.choices.filter((ch) => ch.slot !== SUBSPECIES_SLOT),
      };
    case "class":
      return {
        classes: isSelected ? [] : [{ classId: entry.id, levels: data.level }],
        // Escolhas próprias da classe anterior (ex.: Caminho do Arcanista) deixam de valer.
        choices: data.choices.filter((ch) => !ch.slot.startsWith("class-option:")),
      };
    case "origin":
    case "background":
      // Benefícios escolhidos da origem anterior deixam de valer (e, no D&D 2024, o bônus de atributo dela).
      return {
        backgroundId: isSelected ? undefined : entry.id,
        choices: data.choices.filter((ch) => !ch.slot.startsWith("origin-benefit:")),
        ...(Array.isArray(entry.data.abilityScores) && (entry.data.abilityScores as string[]).length ? { assignedBonuses: {} } : {}),
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
  // Perícias e poderes têm limite por nível (quando o sistema informa).
  const limit = kind === "skill" || kind === "power" ? engine.choiceLimits?.(data, catalog).find((l) => l.kind === kind) : undefined;
  const full = !!limit && limit.used >= limit.max;
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
      {kind === "species" && <SubspeciesPicker data={data} update={update} catalog={catalog} canEdit={canEdit} />}
      {kind === "class" && <SubclassPicker data={data} update={update} catalog={catalog} canEdit={canEdit} />}
      {kind === "skill" && <GrantedSkills data={data} catalog={catalog} />}
      {limit && (
        <p
          role="status"
          className={cn(
            "rounded-md border p-3 text-sm",
            limit.used > limit.max ? "border-destructive/50 bg-destructive/5 text-destructive" : full ? "border-primary/40 bg-primary/5" : "",
          )}
        >
          <span className="font-medium">
            {kind === "skill" ? "Perícias escolhidas" : "Poderes escolhidos"}: {limit.used} de {limit.max}
          </span>{" "}
          <span className="text-muted-foreground">
            no {data.level}º nível ({limit.detail}).
            {limit.used > limit.max
              ? ` Remova ${limit.used - limit.max} para a ficha ficar válida.`
              : limit.max === 0
                ? kind === "power"
                  ? " Ainda não há poderes livres: o poder de classe começa no 2º nível (ou escolha uma divindade para receber um poder concedido)."
                  : " Ainda não há perícias livres: escolha a classe primeiro."
                : full
                  ? " Limite atingido: para trocar, remova uma escolha antes."
                  : ""}
            {kind === "power" && " Benefícios da origem não entram nesta conta."}
          </span>
        </p>
      )}
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
            const fullText = fullTextOf(e);
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
                          disabled={blocked || (!chosen && full)}
                          title={blocked ? "Pré-requisitos ainda não cumpridos" : !chosen && full ? "Limite deste nível atingido" : undefined}
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
  // Antecedente do D&D: perícias fixas, bônus de atributo (2024), talento de origem e característica.
  if (Array.isArray(origin.data.skills)) return <DndBackground origin={origin} data={data} update={update} catalog={catalog} canEdit={canEdit} />;
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

/* ------------------------------------------------------------------ D&D 5e */

/** Escolha entre opções curtas, em grade (sub-raça, subclasse...). */
function OptionGrid({
  legend,
  options,
  current,
  onPick,
  canEdit,
}: {
  legend: string;
  options: ContentEntry[];
  current?: string;
  onPick: (id: string | undefined) => void;
  canEdit: boolean;
}) {
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {options.map((e) => {
          const on = current === e.id;
          const text = fullTextOf(e);
          return (
            <div key={e.id} className={cn("rounded-md border p-2 text-sm", on && "border-primary bg-primary/5")}>
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={on}
                onClick={() => onPick(on ? undefined : e.id)}
                className="w-full text-left hover:underline disabled:no-underline"
              >
                <span className="font-medium">{e.name}</span>
                {on && <Check className="ml-1 inline size-3.5 text-primary" aria-label="escolhido" />}
                {e.summary && <span className="mt-1 block text-xs text-muted-foreground">{e.summary}</span>}
              </button>
              {text && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Texto completo</summary>
                  <p className="mt-1 whitespace-pre-line text-xs">{text}</p>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Sub-raça (2014) ou linhagem, legado e ancestralidade (2024). */
function SubspeciesPicker({ data, update, catalog, canEdit }: { data: CharacterData; update: Update; catalog: Catalog; canEdit: boolean }) {
  const species = data.speciesId ? catalog.get(data.speciesId) : undefined;
  const ids = (species?.data.subspecies as string[] | undefined) ?? [];
  const options = ids.map((id) => catalog.get(id)).filter((e): e is ContentEntry => !!e);
  if (!species || !options.length) return null;
  const current = data.choices.find((ch) => ch.slot === SUBSPECIES_SLOT)?.contentId;
  const rest = data.choices.filter((ch) => ch.slot !== SUBSPECIES_SLOT);
  return (
    <OptionGrid
      legend={`Variação de ${species.name} (escolha uma)`}
      options={options}
      current={current}
      canEdit={canEdit}
      onPick={(id) => update({ choices: id ? [...rest, choice(SUBSPECIES_SLOT, id, data.level)] : rest })}
    />
  );
}

/** Subclasse, a partir do nível indicado pela classe. */
function SubclassPicker({ data, update, catalog, canEdit }: { data: CharacterData; update: Update; catalog: Catalog; canEdit: boolean }) {
  const cl = data.classes[0];
  const cls = cl ? catalog.get(cl.classId) : undefined;
  const at = Number(cls?.data.subclassLevel ?? 0);
  if (!cl || !cls || !at) return null;
  const options = catalog.ofKind("subclass").filter((e) => e.data.classId === cls.id);
  if (!options.length) return null;
  if (cl.levels < at) {
    return (
      <p className="rounded-md border p-3 text-sm text-muted-foreground">
        {cls.name} escolhe a subclasse no {at}º nível ({options.map((o) => o.name).join(", ")}).
      </p>
    );
  }
  return (
    <OptionGrid
      legend={`Subclasse de ${cls.name}`}
      options={options}
      current={cl.subclassId}
      canEdit={canEdit}
      onPick={(id) => update({ classes: [{ ...cl, subclassId: id }, ...data.classes.slice(1)] })}
    />
  );
}

/** Perícias que já vêm treinadas pelo antecedente e pela raça (não contam na escolha da classe). */
function GrantedSkills({ data, catalog }: { data: CharacterData; catalog: Catalog }) {
  const bg = data.backgroundId ? catalog.get(data.backgroundId) : undefined;
  const sp = data.speciesId ? catalog.get(data.speciesId) : undefined;
  const cls = data.classes[0] ? catalog.get(data.classes[0].classId) : undefined;
  const fromBg = Array.isArray(bg?.data.skills) ? (bg.data.skills as string[]) : [];
  const fromSp = Array.isArray(sp?.data.skills) ? (sp.data.skills as string[]) : [];
  const skills = cls?.data.skills as { choose?: number; from?: string[] } | undefined;
  const flex = Number(sp?.data.flexibleSkills ?? 0);
  // Só no D&D: lá a lista da classe é "escolha N de", e antecedente/raça dão perícias fixas.
  if (!Array.isArray(skills?.from) || skills.choose === undefined || "fixed" in (skills ?? {})) return null;
  const names = (ids: string[]) => ids.map((id) => catalog.get(id)?.name ?? slug(id)).join(", ");
  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      {cls && (
        <p>
          <span className="font-medium">{cls.name}:</span> escolha {skills.choose} da lista da classe
          {flex && sp ? `, mais ${flex} à sua escolha (${sp.name})` : ""}.
        </p>
      )}
      {bg && fromBg.length > 0 && (
        <p className="text-muted-foreground">
          Já treinadas pelo antecedente ({bg.name}): {names(fromBg)}.
        </p>
      )}
      {sp && fromSp.length > 0 && (
        <p className="text-muted-foreground">
          Já treinadas pela raça ({sp.name}): {names(fromSp)}.
        </p>
      )}
    </div>
  );
}

interface DndBackgroundData {
  skills: string[];
  tools?: string[];
  abilityScores?: string[];
  featId?: string;
  featNote?: string;
  feature?: { name: string; text: string[] };
}

const DND_ABILITY_LABEL: Record<string, string> = { str: "Força", dex: "Destreza", con: "Constituição", int: "Inteligência", wis: "Sabedoria", cha: "Carisma" };

/** Antecedente do D&D: o que ele concede e, em 2024, a distribuição do bônus de atributo. */
function DndBackground({ origin, data, update, catalog, canEdit }: { origin: ContentEntry; data: CharacterData; update: Update; catalog: Catalog; canEdit: boolean }) {
  const d = origin.data as unknown as DndBackgroundData;
  const feat = d.featId ? catalog.get(d.featId) : undefined;
  const abilities = d.abilityScores ?? [];
  const set = (k: string, v: number) => {
    const next = { ...data.assignedBonuses };
    if (v) next[k] = v;
    else delete next[k];
    update({ assignedBonuses: next });
  };
  const pattern = abilities
    .map((k) => data.assignedBonuses[k] ?? 0)
    .filter(Boolean)
    .sort((a, b) => b - a)
    .join(",");
  const ok = pattern === "2,1" || pattern === "1,1,1";
  return (
    <div className="space-y-3">
      <div className="space-y-1 rounded-md border p-3 text-sm">
        <p>
          <span className="font-medium">Perícias:</span> {d.skills.map((id) => catalog.get(id)?.name ?? slug(id)).join(", ")}
        </p>
        {d.tools?.length ? (
          <p>
            <span className="font-medium">Ferramenta:</span> {d.tools.join(", ")}
          </p>
        ) : null}
        {feat && (
          <p>
            <span className="font-medium">Talento de origem:</span> {feat.name}
            {d.featNote ? ` (${d.featNote})` : ""} — {feat.summary}
          </p>
        )}
        {d.feature && (
          <details>
            <summary className="cursor-pointer">
              <span className="font-medium">Característica:</span> {d.feature.name}
            </summary>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{d.feature.text.join("\n\n")}</p>
          </details>
        )}
      </div>
      {abilities.length > 0 && (
        <fieldset className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Bônus de atributo: +2 e +1, ou +1 nos três {ok && <Check className="ml-1 inline size-3.5 text-primary" aria-label="completo" />}
          </legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {abilities.map((k) => {
              const v = data.assignedBonuses[k] ?? 0;
              const name = DND_ABILITY_LABEL[k] ?? k;
              return (
                <div key={k} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span>{name}</span>
                  <div role="group" aria-label={`Bônus em ${name}`} className="inline-flex rounded-md border p-0.5">
                    {[0, 1, 2].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={v === n}
                        onClick={() => set(k, n)}
                        className={cn("rounded px-2 py-0.5 text-xs tabular-nums", v === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                      >
                        {n ? `+${n}` : "0"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
