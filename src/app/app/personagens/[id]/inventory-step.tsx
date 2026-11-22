"use client";

import { useMemo, useState } from "react";
import { Coins, Dices, PackagePlus, Plus, Trash2 } from "lucide-react";
import {
  cryptoRng,
  moneyTotal,
  payWith,
  receive,
  roll,
  type Catalog,
  type CharacterData,
  type ContentEntry,
  type DerivedStats,
  type InventoryItem,
  type RulesEngine,
  type ValidationIssue,
} from "@/rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IssueList } from "@/components/validation";
import { cn } from "@/lib/utils";

/** Rótulos das categorias do catálogo de equipamento (Tormenta20). */
const CATEGORY_LABEL: Record<string, string> = {
  arma: "Armas",
  municao: "Munição",
  armadura: "Armaduras",
  escudo: "Escudos",
  item: "Itens gerais",
  alquimico: "Itens alquímicos",
  vestuario: "Vestuário",
  alimentacao: "Alimentação",
  animal: "Animais",
  veiculo: "Veículos",
  "arma-magica": "Armas mágicas",
  "armadura-magica": "Armaduras mágicas",
  acessorio: "Acessórios mágicos",
  pocao: "Poções e óleos",
  artefato: "Artefatos",
};
/** Categorias que só existem para melhorar outros itens, ou que não são objetos. */
const NOT_ITEMS = new Set(["modificacao", "material", "encanto", "servico", "hospedagem"]);
const GEAR = new Set(["arma", "armadura", "escudo"]);

const SELECT_CLS =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function InventoryStep({
  data,
  update,
  engine,
  catalog,
  derived,
  issues,
  canEdit,
}: {
  data: CharacterData;
  update: (p: Partial<CharacterData>) => void;
  engine: RulesEngine;
  catalog: Catalog;
  derived: DerivedStats;
  issues: ValidationIssue[];
  canEdit: boolean;
}) {
  const currencies = engine.currencies ?? [];
  const summary = derived.inventory;
  const money = moneyTotal(data.currency, currencies);
  const std = currencies.find((c) => c.value === 1);
  const [message, setMessage] = useState<string>("");

  const entries = useMemo(
    () => catalog.ofKind("equipment").filter((e) => !NOT_ITEMS.has(String(e.data.category))),
    [catalog],
  );
  const price = (e: ContentEntry) => (typeof e.data.price === "number" ? e.data.price : undefined);

  const setInventory = (inventory: InventoryItem[]) => update({ inventory });
  const patchItem = (entryId: string, patch: Partial<InventoryItem>) =>
    setInventory(data.inventory.map((i) => (i.entryId === entryId ? { ...i, ...patch } : i)));

  const add = (e: ContentEntry, buy: boolean) => {
    const cost = price(e);
    let currency = data.currency;
    if (buy && cost !== undefined) {
      const paid = payWith(data.currency, currencies, cost);
      if (!paid) {
        setMessage(`Dinheiro insuficiente para ${e.name} (${fmtNum(cost)} moedas).`);
        return;
      }
      currency = paid;
    }
    // Itens iguais sem melhorias se acumulam na mesma linha.
    const same = data.inventory.find((i) => i.contentId === e.id && !i.modifications.length && !i.enchantments.length && !i.materialId);
    const inventory = same
      ? data.inventory.map((i) => (i === same ? { ...i, quantity: i.quantity + 1 } : i))
      : [...data.inventory, { entryId: newId(), contentId: e.id, quantity: 1, equipped: false, modifications: [], enchantments: [] }];
    update({ inventory, currency });
    setMessage(buy && cost !== undefined ? `${e.name} comprado por ${fmtNum(cost)} moedas.` : `${e.name} adicionado.`);
  };

  const sell = (entryId: string) => {
    const row = summary?.rows.find((r) => r.entryId === entryId);
    const item = data.inventory.find((i) => i.entryId === entryId);
    if (!row || !item) return;
    const value = Math.round(((row.value ?? 0) / 2) * 100) / 100;
    const rest = item.quantity > 1 ? data.inventory.map((i) => (i.entryId === entryId ? { ...i, quantity: i.quantity - 1 } : i)) : data.inventory.filter((i) => i.entryId !== entryId);
    update({ inventory: rest, currency: receive(data.currency, currencies, value) });
    setMessage(`${row.name} vendido por ${fmtNum(value)} moedas (metade do preço).`);
  };

  const wealth = engine.startingWealth?.(derived.level);
  const grantWealth = () => {
    if (!wealth) return;
    const amount = wealth.amount ?? (wealth.formula ? roll(wealth.formula, cryptoRng).total : 0);
    update({ currency: receive(data.currency, currencies, amount) });
    setMessage(wealth.formula ? `Rolagem de ${wealth.formula}: ${amount} moedas.` : `${fmtNum(amount)} moedas adicionadas.`);
  };

  const kit = ["equipment:mochila", "equipment:saco-de-dormir", "equipment:traje-de-viajante"].filter((id) => catalog.get(id));
  const addKit = () => {
    const missing = kit.filter((id) => !data.inventory.some((i) => i.contentId === id));
    setInventory([
      ...data.inventory,
      ...missing.map((id) => ({ entryId: newId(), contentId: id, quantity: 1, equipped: id === "equipment:traje-de-viajante", modifications: [], enchantments: [] })),
    ]);
    setMessage(missing.length ? "Mochila, saco de dormir e traje de viajante adicionados." : "O kit básico já está no inventário.");
  };

  return (
    <div className="space-y-6">
      {/* Dinheiro */}
      <section aria-labelledby="inv-money" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="inv-money" className="flex items-center gap-1.5 font-medium">
            <Coins className="size-4" aria-hidden /> Dinheiro
          </h2>
          <span className="text-sm text-muted-foreground">
            Total: <strong className="text-foreground tabular-nums">{fmtNum(money)}</strong> moedas
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {currencies.map((cur) => (
            <div key={cur.key} className="space-y-1">
              <Label htmlFor={`cur-${cur.key}`}>
                {cur.label} <span className="text-xs text-muted-foreground">({cur.value === 1 ? "padrão" : `${fmtNum(cur.value)} cada`})</span>
              </Label>
              <Input
                id={`cur-${cur.key}`}
                type="number"
                min={0}
                inputMode="numeric"
                disabled={!canEdit}
                value={data.currency[cur.key] ?? 0}
                onChange={(ev) => update({ currency: { ...data.currency, [cur.key]: Math.max(0, Math.floor(Number(ev.target.value) || 0)) } })}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {wealth && std && (
            <Button variant="outline" size="sm" onClick={grantWealth} disabled={!canEdit}>
              <Dices /> Dinheiro inicial ({wealth.formula ?? `${fmtNum(wealth.amount ?? 0)} moedas`}, nível {derived.level})
            </Button>
          )}
          {kit.length > 0 && (
            <Button variant="outline" size="sm" onClick={addKit} disabled={!canEdit}>
              <PackagePlus /> Kit básico
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Equipamento inicial (p. 138): mochila, saco de dormir e traje de viajante; uma arma simples (e uma marcial, se tiver proficiência);
          armadura de couro, couro batido ou gibão de peles (brunea, se tiver proficiência com armaduras pesadas); escudo leve, se tiver
          proficiência com escudos. Arcanistas começam sem armadura. Some os itens da origem.
        </p>
      </section>

      {/* Itens */}
      <section aria-labelledby="inv-items" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="inv-items" className="font-medium">
            Itens
          </h2>
          {summary && <LoadMeter summary={summary} />}
        </div>
        {!data.inventory.length ? (
          <p className="text-sm text-muted-foreground">Nenhum item ainda. Use o kit básico ou adicione itens do catálogo abaixo.</p>
        ) : (
          <ul className="space-y-2">
            {data.inventory.map((item) => {
              const row = summary?.rows.find((r) => r.entryId === item.entryId);
              const entry = item.contentId ? catalog.get(item.contentId) : undefined;
              return (
                <InventoryLine
                  key={item.entryId}
                  item={item}
                  row={row}
                  entry={entry}
                  catalog={catalog}
                  canEdit={canEdit}
                  onPatch={(p) => patchItem(item.entryId, p)}
                  onRemove={() => setInventory(data.inventory.filter((i) => i.entryId !== item.entryId))}
                  onSell={() => sell(item.entryId)}
                />
              );
            })}
          </ul>
        )}
        {summary && (
          <p className="text-xs text-muted-foreground">
            Peso total {fmtNum(summary.totalWeight)}kg · Valor estimado {fmtNum(summary.totalValue)} moedas
          </p>
        )}
        <IssueList issues={issues} empty="" />
      </section>

      {message && (
        <p role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {message}
        </p>
      )}

      {canEdit && <CatalogPicker entries={entries} money={money} onAdd={add} />}
      {canEdit && <CustomItem onAdd={(name) => setInventory([...data.inventory, { entryId: newId(), customName: name, quantity: 1, equipped: false, modifications: [], enchantments: [] }])} />}
    </div>
  );
}

function LoadMeter({ summary }: { summary: NonNullable<DerivedStats["inventory"]> }) {
  const load = summary.load;
  if (!load) return <span className="text-xs text-muted-foreground">Defina a Força para calcular a carga.</span>;
  const pct = load.max > 0 ? Math.min(100, (summary.totalWeight / load.max) * 100) : 100;
  const lightPct = load.max > 0 ? (load.light / load.max) * 100 : 0;
  const label = { normal: "Sem penalidade", encumbered: "Sobrecarregado", overloaded: "Acima do máximo" }[load.state];
  return (
    <div className="w-full max-w-xs space-y-1" title={`Sem penalidade até ${fmtNum(load.light)}kg; máximo ${fmtNum(load.max)}kg (p. 154).`}>
      <div className="flex justify-between text-xs">
        <span className={cn(load.state !== "normal" && "font-medium text-destructive")}>Carga: {label}</span>
        <span className="tabular-nums text-muted-foreground">
          {fmtNum(summary.totalWeight)} / {fmtNum(load.light)} / {fmtNum(load.max)}kg
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={load.max} aria-valuenow={summary.totalWeight} aria-label="Carga">
        <div className={cn("h-full", load.state === "normal" ? "bg-primary" : "bg-destructive")} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${lightPct}%` }} aria-hidden />
      </div>
    </div>
  );
}

function InventoryLine({
  item,
  row,
  entry,
  catalog,
  canEdit,
  onPatch,
  onRemove,
  onSell,
}: {
  item: InventoryItem;
  row?: NonNullable<DerivedStats["inventory"]>["rows"][number];
  entry?: ContentEntry;
  catalog: Catalog;
  canEdit: boolean;
  onPatch: (p: Partial<InventoryItem>) => void;
  onRemove: () => void;
  onSell: () => void;
}) {
  const category = String(entry?.data.category ?? "");
  const name = row?.name ?? entry?.name ?? item.customName ?? "Item";
  return (
    <li className={cn("rounded-md border p-3", item.equipped && "border-primary/50 bg-primary/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        {row?.magic && <Badge variant="secondary">mágico</Badge>}
        {item.equipped && row && !row.effective && <Badge variant="destructive">sem efeito</Badge>}
        {!entry && <Badge variant="outline">personalizado</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {row?.slot && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={item.equipped} disabled={!canEdit} onChange={(ev) => onPatch({ equipped: ev.target.checked })} className="size-4 accent-primary" />
              {row.slot === "arma" ? "Empunhada" : "Equipado"}
            </label>
          )}
          <Input
            type="number"
            min={0}
            aria-label={`Quantidade de ${name}`}
            className="h-7 w-16"
            disabled={!canEdit}
            value={item.quantity}
            onChange={(ev) => onPatch({ quantity: Math.max(0, Math.floor(Number(ev.target.value) || 0)) })}
          />
          {canEdit && row?.value !== undefined && (
            <Button variant="ghost" size="xs" onClick={onSell} title="Vender uma unidade pela metade do preço">
              Vender
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label={`Remover ${name}`}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {[
          entry?.summary,
          row?.detail,
          row?.weight !== undefined ? `${fmtNum(row.weight)}kg` : "",
          row?.value !== undefined ? `${fmtNum(row.value)} moedas cada` : "",
          entry?.source.page ? `p. ${entry.source.page}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {entry && GEAR.has(category) && canEdit && <Improvements item={item} category={category} catalog={catalog} onPatch={onPatch} />}
      <Input
        className="mt-2 h-7 text-xs"
        placeholder="Anotações (cargas, origem do item...)"
        aria-label={`Anotações de ${name}`}
        disabled={!canEdit}
        maxLength={300}
        value={item.notes ?? ""}
        onChange={(ev) => onPatch({ notes: ev.target.value || undefined })}
      />
    </li>
  );
}

/** Modificações, material especial e encantos aplicados a armas, armaduras e escudos. */
function Improvements({ item, category, catalog, onPatch }: { item: InventoryItem; category: string; catalog: Catalog; onPatch: (p: Partial<InventoryItem>) => void }) {
  const all = catalog.ofKind("equipment");
  const fits = (target: unknown) =>
    target === "outro" ||
    (target === "arma" && category === "arma") ||
    (target === "armadura-escudo" && category !== "arma") ||
    (target === "escudo" && category === "escudo");
  const mods = all.filter((e) => e.data.category === "modificacao" && e.id !== "equipment:material-especial" && fits(e.data.target));
  const enchants = all.filter((e) => e.data.category === "encanto" && fits(e.data.target));
  const materials = all.filter((e) => {
    if (e.data.category !== "material") return false;
    const cost = e.data.materialCost as Record<string, number | null> | undefined;
    return cost && Object.values(cost).some((v) => v !== null);
  });
  const name = (id: string) => catalog.get(id)?.name.split(" (")[0] ?? id;
  const chips = [
    ...item.modifications.map((id) => ({ id, kind: "modifications" as const })),
    ...item.enchantments.map((id) => ({ id, kind: "enchantments" as const })),
  ];
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground">Melhorias (itens superiores e encantos)</summary>
      <div className="mt-2 space-y-2">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={`${c.kind}-${c.id}`}
                type="button"
                onClick={() => onPatch({ [c.kind]: item[c.kind].filter((x) => x !== c.id) })}
                className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                aria-label={`Remover ${name(c.id)}`}
              >
                {name(c.id)} ×
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            className={SELECT_CLS}
            value=""
            aria-label="Adicionar modificação"
            onChange={(ev) => ev.target.value && onPatch({ modifications: [...item.modifications, ev.target.value] })}
          >
            <option value="">+ Modificação</option>
            {mods.filter((m) => !item.modifications.includes(m.id)).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {typeof m.data.effectSummary === "string" ? ` — ${m.data.effectSummary}` : ""}
              </option>
            ))}
          </select>
          <select
            className={SELECT_CLS}
            value={item.materialId ?? ""}
            aria-label="Material especial"
            onChange={(ev) => onPatch({ materialId: ev.target.value || undefined })}
          >
            <option value="">Material: comum</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            className={SELECT_CLS}
            value=""
            aria-label="Adicionar encanto"
            onChange={(ev) => ev.target.value && onPatch({ enchantments: [...item.enchantments, ev.target.value] })}
          >
            <option value="">+ Encanto</option>
            {enchants.filter((m) => !item.enchantments.includes(m.id)).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {typeof m.data.effectSummary === "string" ? ` — ${m.data.effectSummary}` : ""}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">O preço estimado soma o aumento por modificações (p. 155), encantos (p. 320) e o material (p. 157). Material especial conta como uma modificação.</p>
      </div>
    </details>
  );
}

function CatalogPicker({ entries, money, onAdd }: { entries: ContentEntry[]; money: number; onAdd: (e: ContentEntry, buy: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(entries.map((e) => String(e.data.category)))], [entries]);
  const q = query.trim().toLocaleLowerCase("pt-BR");
  const shown = entries.filter(
    (e) => (!category || e.data.category === category) && (!q || `${e.name} ${e.summary}`.toLocaleLowerCase("pt-BR").includes(q)),
  );
  const LIMIT = 40;
  return (
    <section aria-labelledby="inv-add" className="space-y-3 rounded-md border p-3">
      <h2 id="inv-add" className="font-medium">
        Adicionar do catálogo
      </h2>
      <div className="flex flex-wrap gap-2">
        <Input type="search" className="min-w-48 flex-1" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder={`Buscar entre ${entries.length} itens`} aria-label="Buscar itens" />
        <select className={SELECT_CLS} value={category} onChange={(ev) => setCategory(ev.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c] ?? c}
            </option>
          ))}
        </select>
      </div>
      <ul className="max-h-96 space-y-1 overflow-y-auto">
        {shown.slice(0, LIMIT).map((e) => {
          const price = typeof e.data.price === "number" ? e.data.price : undefined;
          const priceText = price !== undefined ? `${fmtNum(price)} moedas` : typeof e.data.priceText === "string" ? e.data.priceText : "";
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[CATEGORY_LABEL[String(e.data.category)], priceText, typeof e.data.weight === "number" ? `${fmtNum(e.data.weight)}kg` : "", e.summary].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button variant="ghost" size="xs" onClick={() => onAdd(e, false)} aria-label={`Adicionar ${e.name}`}>
                <Plus /> Adicionar
              </Button>
              {price !== undefined && (
                <Button variant="outline" size="xs" onClick={() => onAdd(e, true)} disabled={price > money} aria-label={`Comprar ${e.name}`}>
                  Comprar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length > LIMIT && <p className="text-xs text-muted-foreground">Mostrando {LIMIT} de {shown.length}. Refine a busca.</p>}
      {!shown.length && <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>}
    </section>
  );
}

function CustomItem({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (name.trim()) onAdd(name.trim());
        setName("");
      }}
    >
      <div className="min-w-48 flex-1 space-y-1">
        <Label htmlFor="inv-custom">Item personalizado</Label>
        <Input id="inv-custom" value={name} maxLength={80} onChange={(ev) => setName(ev.target.value)} placeholder="Ex.: carta da família, mapa rasgado" />
      </div>
      <Button type="submit" variant="outline" disabled={!name.trim()}>
        <Plus /> Adicionar
      </Button>
    </form>
  );
}
