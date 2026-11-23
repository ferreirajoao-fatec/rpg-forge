"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, FileSearch, Plus, Trash2, Users } from "lucide-react";
import { createBoardItemAction, deleteBoardItemAction, toggleBoardItemRevealAction } from "@/app/actions/campaigns";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";
import type { BoardItem } from "@/server/campaign-board";

export function InvestigationBoard({
  campaignId,
  isGm,
  items,
}: {
  campaignId: string;
  isGm: boolean;
  items: BoardItem[];
}) {
  const [filter, setFilter] = useState<"all" | "clue" | "npc">("all");
  const [kind, setKind] = useState<"clue" | "npc">("clue");
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("Pista");
  const [description, setDescription] = useState("");
  const [revealed, setRevealed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = items.filter((it) => filter === "all" || it.kind === filter);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    start(async () => {
      setError(null);
      const r = await createBoardItemAction(campaignId, kind, { title, description, tag, revealed });
      if (r?.message) {
        setError(r.message);
      } else {
        setTitle("");
        setDescription("");
      }
    });
  };

  return (
    <section aria-labelledby="mural-title" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="mural-title" className="flex items-center gap-2 text-base font-semibold">
          <FileSearch className="size-4 text-gold" aria-hidden /> Mural de Pistas e NPCs
        </h2>
        <div className="flex gap-1 text-xs">
          {(
            [
              ["all", "Tudo"],
              ["clue", "Pistas"],
              ["npc", "NPCs"],
            ] as const
          ).map(([id, label]) => (
            <Button key={id} type="button" size="xs" variant={filter === id ? "default" : "outline"} onClick={() => setFilter(id)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isGm && (
        <form onSubmit={submit} className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value === "npc" ? "npc" : "clue";
                setKind(k);
                setTag(k === "npc" ? "Suspeito / Aliado" : "Pista");
              }}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="Tipo de item"
            >
              <option value="clue">Pista / Documento</option>
              <option value="npc">NPC / Suspeito</option>
            </select>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "npc" ? "Nome do NPC ou suspeito" : "Título da pista ou evidência"}
              maxLength={100}
              className="h-8 min-w-44 flex-1"
            />
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Etiqueta"
              maxLength={40}
              className="h-8 w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="board-desc" className="sr-only">
              Descrição
            </Label>
            <textarea
              id="board-desc"
              rows={2}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes encontrados, local, conexão com o caso..."
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="size-4 accent-primary" checked={revealed} onChange={(e) => setRevealed(e.target.checked)} />
              Já revelar para os jogadores
            </label>
            <Button type="submit" size="sm" disabled={pending || !title.trim()}>
              <Plus /> Adicionar ao mural
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
      )}

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {isGm ? "Nenhuma pista ou NPC cadastrado ainda." : "Nenhuma pista ou NPC foi revelado pelo mestre ainda."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shown.map((it) => (
            <li key={it.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {it.kind === "npc" ? <Users className="size-3.5 text-muted-foreground" aria-hidden /> : <FileSearch className="size-3.5 text-muted-foreground" aria-hidden />}
                    {it.title}
                    {it.tag && <Badge variant="secondary">{it.tag}</Badge>}
                    {isGm && !it.revealed && (
                      <Badge variant="outline" className="gap-1">
                        <EyeOff className="size-2.5" /> oculto dos jogadores
                      </Badge>
                    )}
                  </p>
                </div>
                {isGm && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => start(async () => { await toggleBoardItemRevealAction(campaignId, it.id); })}
                      title={it.revealed ? "Ocultar dos jogadores" : "Revelar para os jogadores"}
                    >
                      {it.revealed ? <><EyeOff className="size-3.5" /> Ocultar</> : <><Eye className="size-3.5" /> Revelar</>}
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Excluir ${it.title}`}
                      onClick={() => start(async () => { await deleteBoardItemAction(campaignId, it.id); })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
              {it.description && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{it.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
