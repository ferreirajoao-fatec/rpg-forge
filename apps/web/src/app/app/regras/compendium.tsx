"use client";

import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import type { CompendiumItem } from "@/server/rulesets";
import { Pager, paginate } from "@/components/pager";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Input } from "@rpg-forge/ui/components/input";
import { cn } from "@rpg-forge/ui/lib/utils";

const KIND_LABELS: Record<string, string> = {
  all: "Tudo",
  class: "Classes",
  subclass: "Subclasses / Trilhas",
  species: "Raças / Espécies",
  origin: "Origens",
  background: "Antecedentes",
  skill: "Perícias",
  power: "Poderes",
  feat: "Talentos",
  spell: "Magias / Rituais",
  equipment: "Equipamentos",
  condition: "Condições",
  creature: "Ameaças / Criaturas",
  hazard: "Perigos",
  rule: "Regras",
};

const PAGE_SIZE = 24;

export function Compendium({
  catalogs,
}: {
  catalogs: { rulesetId: string; name: string; version: string; items: CompendiumItem[] }[];
}) {
  const [systemId, setSystemId] = useState(catalogs[0]?.rulesetId ?? "");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const active = catalogs.find((c) => c.rulesetId === systemId) ?? catalogs[0];

  const availableKinds = useMemo(() => {
    if (!active) return [];
    const set = new Set(active.items.map((i) => i.kind));
    return ["all", ...Object.keys(KIND_LABELS).filter((k) => k !== "all" && set.has(k))];
  }, [active]);

  const filtered = useMemo(() => {
    if (!active) return [];
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return active.items.filter((it) => {
      if (kind !== "all" && it.kind !== kind) return false;
      if (!q) return true;
      return `${it.name} ${it.summary} ${it.text}`.toLocaleLowerCase("pt-BR").includes(q);
    });
  }, [active, kind, query]);

  const { pages, current, slice } = paginate(filtered, page, PAGE_SIZE);

  if (!catalogs.length) {
    return null;
  }

  return (
    <section aria-labelledby="compendium-title" className="mt-8 rounded-lg border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="compendium-title" className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="size-4 text-gold" aria-hidden /> Compêndio pesquisável
          </h2>
          <p className="text-xs text-muted-foreground">
            Consulte classes, origens, perícias, poderes, magias, rituais, itens, condições e ameaças dos catálogos importados.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {catalogs.map((c) => (
            <button
              key={c.rulesetId}
              type="button"
              onClick={() => {
                setSystemId(c.rulesetId);
                setKind("all");
                setPage(1);
              }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                active?.rulesetId === c.rulesetId ? "border-gold bg-gold/15 font-medium" : "hover:bg-muted",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={`Buscar em ${active?.name ?? ""}…`}
            aria-label="Buscar no compêndio"
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} resultado(s)</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {availableKinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              kind === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {KIND_LABELS[k] ?? k}
          </button>
        ))}
      </div>

      {slice.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhum registro encontrado com este filtro.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {slice.map((item) => (
            <li key={`${item.rulesetId}:${item.id}`} className="p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant="outline" className="text-[11px]">
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </Badge>
                </div>
                {(item.section || item.page) && (
                  <span className="text-xs text-muted-foreground">
                    {item.section}
                    {item.section && item.page ? " · " : ""}
                    {item.page ? `p. ${item.page}` : ""}
                  </span>
                )}
              </div>
              {item.summary && <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>}
              {item.text && item.text !== item.summary && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-gold hover:underline">Ler texto completo</summary>
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{item.text}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <Pager page={current} pages={pages} total={filtered.length} onPage={setPage} />
    </section>
  );
}
