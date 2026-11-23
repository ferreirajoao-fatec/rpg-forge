"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { createHomebrewAction, deleteHomebrewAction } from "@/app/actions/campaigns";
import type { CampaignHomebrewItem, HomebrewKind } from "@/server/homebrew";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";

const KIND_LABELS: Record<HomebrewKind, string> = {
  equipment: "Equipamento / Item",
  power: "Poder / Habilidade",
  spell: "Magia / Ritual",
  origin: "Origem / Antecedente",
  creature: "Ameaça / Criatura",
};

export function HomebrewManager({
  campaignId,
  isGm,
  items,
}: {
  campaignId: string;
  isGm: boolean;
  items: CampaignHomebrewItem[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<HomebrewKind>("equipment");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("geral");
  const [circle, setCircle] = useState(1);
  const [nd, setNd] = useState("1");
  const [hp, setHp] = useState(30);
  const [defense, setDefense] = useState(14);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload: Record<string, unknown> = { kind, name, summary, text };
      if (kind === "equipment") payload.category = category;
      if (kind === "spell") payload.circle = circle;
      if (kind === "creature") {
        payload.nd = nd;
        payload.hp = hp;
        payload.defense = defense;
      }
      const res = await createHomebrewAction(campaignId, payload);
      if (res?.message) {
        setError(res.message);
        return;
      }
      setName("");
      setSummary("");
      setText("");
      setOpen(false);
    });
  };

  return (
    <section aria-labelledby="homebrew-title" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="homebrew-title" className="flex items-center gap-2 text-base font-semibold">
            <FlaskConical className="size-4 text-gold" aria-hidden /> Homebrew da campanha ({items.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Itens, poderes, magias, origens e ameaças exclusivos desta mesa — aparecem automaticamente nas fichas vinculadas.
          </p>
        </div>
        {isGm && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            <Plus /> {open ? "Fechar" : "Novo homebrew"}
          </Button>
        )}
      </div>

      {isGm && open && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border bg-background/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="hb-kind">Categoria</Label>
              <select
                id="hb-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as HomebrewKind)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              >
                {Object.entries(KIND_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hb-name">Nome</Label>
              <Input id="hb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Adaga de Obsidiana" required />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="hb-summary">Resumo mecânico</Label>
            <Input
              id="hb-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={400}
              placeholder="Ex.: +1 em ataques furtivos, 1d6 de dano perfurante."
              required
            />
          </div>

          {kind === "equipment" && (
            <div className="max-w-xs space-y-1">
              <Label htmlFor="hb-cat">Tipo de item</Label>
              <select
                id="hb-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              >
                <option value="geral">Item geral / acessório</option>
                <option value="arma">Arma</option>
                <option value="armadura">Armadura / Proteção</option>
                <option value="escudo">Escudo</option>
                <option value="consumivel">Consumível</option>
              </select>
            </div>
          )}

          {kind === "spell" && (
            <div className="max-w-36 space-y-1">
              <Label htmlFor="hb-circle">Círculo / Nível</Label>
              <Input id="hb-circle" type="number" min={1} max={9} value={circle} onChange={(e) => setCircle(Number(e.target.value) || 1)} />
            </div>
          )}

          {kind === "creature" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="hb-nd">ND / VD</Label>
                <Input id="hb-nd" value={nd} onChange={(e) => setNd(e.target.value)} maxLength={20} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hb-hp">PV</Label>
                <Input id="hb-hp" type="number" min={1} value={hp} onChange={(e) => setHp(Number(e.target.value) || 1)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hb-def">Defesa / CA</Label>
                <Input id="hb-def" type="number" min={0} value={defense} onChange={(e) => setDefense(Number(e.target.value) || 10)} />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="hb-text">Descrição completa (opcional)</Label>
            <textarea
              id="hb-text"
              rows={3}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              Salvar homebrew
            </Button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum conteúdo homebrew criado nesta campanha.</p>
      ) : (
        <ul className="mt-3 divide-y">
          {items.map((item) => (
            <li key={item.pk} className="flex items-start justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant="outline" className="text-[11px]">
                    {KIND_LABELS[item.kind]}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
                {item.text && item.text !== item.summary && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Ver texto completo</summary>
                    <p className="mt-1 whitespace-pre-line text-xs">{item.text}</p>
                  </details>
                )}
              </div>
              {isGm && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  aria-label={`Remover ${item.name}`}
                  disabled={pending}
                  onClick={() => startTransition(() => void deleteHomebrewAction(campaignId, item.pk))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
