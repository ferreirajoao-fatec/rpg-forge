"use client";

import { useState, useTransition } from "react";
import { Award, BookOpen, Plus, Settings2, Trash2 } from "lucide-react";
import { OP_OPTIONAL_RULES } from "@rpg-forge/rules-engine";
import {
  createDiaryEntryAction,
  deleteDiaryEntryAction,
  distributeRewardAction,
  updateCampaignOptionalRulesAction,
} from "@/app/actions/campaigns";
import type { DiaryEntry } from "@/server/campaign-diary";
import type { PartyMemberOverview } from "@/server/campaigns";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";

export function SessionDiary({
  campaignId,
  rulesetId,
  isGm,
  entries,
  members,
  initialOptionalRules,
}: {
  campaignId: string;
  rulesetId: string;
  isGm: boolean;
  entries: DiaryEntry[];
  members: PartyMemberOverview[];
  initialOptionalRules: string[];
}) {
  const isOp = rulesetId === "ordem-paranormal-1e";
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<"session" | "milestone">("session");
  const [showDiaryForm, setShowDiaryForm] = useState(false);

  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(isOp ? 5 : 300);
  const [rewardNote, setRewardNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => members.map((m) => m.id));

  const [optionalRules, setOptionalRules] = useState<string[]>(initialOptionalRules);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitDiary = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const r = await createDiaryEntryAction(campaignId, kind, { title, notes });
      if (r?.message) {
        setMsg(r.message);
        return;
      }
      setTitle("");
      setNotes("");
      setShowDiaryForm(false);
    });
  };

  const submitReward = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const targets = selectedIds.length ? selectedIds : members.map((m) => m.id);
    startTransition(async () => {
      const r = await distributeRewardAction(campaignId, {
        mode: isOp ? "prestige" : "xp",
        amount: rewardAmount,
        characterIds: targets,
        note: rewardNote,
      });
      if (r?.message) {
        setMsg(r.message);
        return;
      }
      setRewardNote("");
      setRewardOpen(false);
      setMsg(isOp ? "Prestígio distribuído para as fichas selecionadas." : "XP distribuído para as fichas selecionadas.");
    });
  };

  const toggleRule = (ruleId: string, checked: boolean) => {
    const next = checked ? [...new Set([...optionalRules, ruleId])] : optionalRules.filter((x) => x !== ruleId);
    setOptionalRules(next);
    startTransition(async () => {
      await updateCampaignOptionalRulesAction(campaignId, next);
    });
  };

  return (
    <section aria-labelledby="diary-title" className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="diary-title" className="flex items-center gap-2 text-base font-semibold">
            <BookOpen className="size-4 text-gold" aria-hidden /> Diário de sessões e recompensas
          </h2>
          <p className="text-xs text-muted-foreground">
            Histórico de sessões, marcos e distribuição em lote de {isOp ? "Pontos de Prestígio (PP)" : "XP"} para a equipe.
          </p>
        </div>
        {isGm && (
          <div className="flex flex-wrap gap-1.5">
            {members.length > 0 && (
              <Button type="button" size="sm" variant="outline" onClick={() => setRewardOpen((v) => !v)}>
                <Award /> {isOp ? "Distribuir Prestígio" : "Distribuir XP"}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setShowDiaryForm((v) => !v)}>
              <Plus /> Registrar sessão
            </Button>
          </div>
        )}
      </div>

      {msg && <p className="text-xs text-gold">{msg}</p>}

      {isGm && rewardOpen && members.length > 0 && (
        <form onSubmit={submitReward} className="space-y-3 rounded-md border bg-background/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rew-amount">{isOp ? "Pontos de Prestígio (+PP)" : "Experiência (+XP)"}</Label>
              <Input
                id="rew-amount"
                type="number"
                min={1}
                value={rewardAmount}
                onChange={(e) => setRewardAmount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rew-note">Motivo / Missão (opcional)</Label>
              <Input
                id="rew-note"
                value={rewardNote}
                onChange={(e) => setRewardNote(e.target.value)}
                maxLength={200}
                placeholder={isOp ? "Ex.: Missão concluída com evidências" : "Ex.: Derrotou o chefe da masmorra"}
              />
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Aplicar em:</legend>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label key={m.id} className="flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? [...new Set([...prev, m.id])] : prev.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <span>{m.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRewardOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending || selectedIds.length === 0}>
              Aplicar recompensa
            </Button>
          </div>
        </form>
      )}

      {isGm && showDiaryForm && (
        <form onSubmit={submitDiary} className="space-y-3 rounded-md border bg-background/60 p-4">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div className="space-y-1">
              <Label htmlFor="diary-kind">Tipo</Label>
              <select
                id="diary-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as "session" | "milestone")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              >
                <option value="session">Sessão</option>
                <option value="milestone">Marco narrativo</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="diary-title-inp">Título</Label>
              <Input
                id="diary-title-inp"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Ex.: Sessão 04 — O porão do sanatório"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="diary-notes">Resumo dos acontecimentos</Label>
            <textarea
              id="diary-notes"
              rows={3}
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowDiaryForm(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              Salvar registro
            </Button>
          </div>
        </form>
      )}

      {isOp && (
        <details className="rounded-md border p-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden /> Regras opcionais da campanha (Sobrevivendo ao Horror)
          </summary>
          <div className="mt-2.5 space-y-2 text-xs">
            {(
              [
                [OP_OPTIONAL_RULES.DETERMINATION_POINTS, "Jogando sem Sanidade (Pontos de Determinação — PD)"],
                [OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX, "Separando Nível e NEX (0%–99%)"],
                [OP_OPTIONAL_RULES.DEBILITATING_INJURIES, "Ferimentos Debilitantes"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!isGm || pending}
                  checked={optionalRules.includes(id)}
                  onChange={(e) => toggleRule(id, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </details>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sessão ou recompensa registrada ainda.</p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.title}</span>
                  <Badge variant={e.kind === "reward" ? "default" : "outline"} className="text-[11px]">
                    {e.kind === "session" ? "Sessão" : e.kind === "milestone" ? "Marco" : "Recompensa"}
                  </Badge>
                </div>
                {e.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{e.notes}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              {isGm && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  aria-label={`Excluir ${e.title}`}
                  disabled={pending}
                  onClick={() => startTransition(() => void deleteDiaryEntryAction(campaignId, e.id))}
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
