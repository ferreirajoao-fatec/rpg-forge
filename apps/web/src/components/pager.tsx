"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@rpg-forge/ui/components/button";

/** Páginas exibidas: primeira, última e vizinhas da atual, com reticências nos saltos. */
function pageList(page: number, pages: number): (number | "…")[] {
  const want = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...want].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { pages, current, slice: items.slice((current - 1) * size, current * size) };
}

export function Pager({ page, pages, total, onPage, label = "opções" }: { page: number; pages: number; total: number; onPage: (p: number) => void; label?: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        Página {page} de {pages} · {total} {label}
      </span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft />
        </Button>
        {pageList(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={p === page ? "default" : "ghost"}
              className="min-w-8 tabular-nums"
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Página ${p}`}
            >
              {p}
            </Button>
          ),
        )}
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Próxima página">
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
