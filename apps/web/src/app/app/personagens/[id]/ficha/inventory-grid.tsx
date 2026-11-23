"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Backpack, FlaskConical, Package, Shield, Sword, Wrench } from "lucide-react";
import { cn } from "@rpg-forge/ui/lib/utils";
import type { ItemGroup, SheetItem } from "./sheet-items";

export const GROUP_ICON: Record<ItemGroup, LucideIcon> = {
  arma: Sword,
  protecao: Shield,
  consumivel: FlaskConical,
  ferramenta: Wrench,
  outro: Package,
};

const TABS: { id: ItemGroup | "todos"; label: string; icon: LucideIcon }[] = [
  { id: "todos", label: "Tudo", icon: Backpack },
  { id: "arma", label: "Armas", icon: Sword },
  { id: "protecao", label: "Proteção", icon: Shield },
  { id: "consumivel", label: "Consumíveis", icon: FlaskConical },
  { id: "ferramenta", label: "Ferramentas", icon: Wrench },
  { id: "outro", label: "Outros", icon: Package },
];

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * Grade de inventário 10 × 4 com abas por tipo. As abas só filtram na tela;
 * na impressão aparecem todos os itens.
 */
export function InventoryGrid({ items }: { items: SheetItem[] }) {
  const [tab, setTab] = useState<ItemGroup | "todos">("todos");
  const count = (id: ItemGroup | "todos") => (id === "todos" ? items.length : items.filter((i) => i.group === id).length);
  const cells = Math.max(40, Math.ceil(items.length / 10) * 10);
  return (
    <div>
      <div role="tablist" aria-label="Filtrar inventário" className="mb-1.5 flex flex-wrap gap-1 print:hidden">
        {TABS.map((t) => {
          const n = count(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              disabled={t.id !== "todos" && n === 0}
              onClick={() => setTab(t.id)}
              className="ficha-tab"
            >
              <t.icon aria-hidden className="size-3" />
              {t.label}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <ul className="ficha-inventory" aria-label="Itens carregados">
        {Array.from({ length: cells }, (_, i) => {
          const it = items[i];
          if (!it) return <li key={i} className="ficha-slot" aria-hidden />;
          const Icon = GROUP_ICON[it.group];
          const hidden = tab !== "todos" && it.group !== tab;
          return (
            <li
              key={i}
              className={cn("ficha-slot ficha-slot-full", it.equipped && "ficha-slot-equipped", it.magic && "ficha-slot-magic", hidden && "opacity-20 print:opacity-100")}
              title={[it.name, it.detail, it.weight ? `peso ${fmt(it.weight)}` : ""].filter(Boolean).join(" · ")}
            >
              <Icon aria-hidden className="size-3.5 shrink-0 text-[var(--sheet-bronze)]" />
              <span className="line-clamp-2 text-center leading-[1.1]">{it.name}</span>
              {it.quantity > 1 && <span className="ficha-slot-qty">{it.quantity}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
