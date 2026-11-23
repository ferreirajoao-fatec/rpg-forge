"use client";

import { useState, useTransition } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import {
  attachCharacterAction,
  deleteCampaignAction,
  detachCharacterAction,
  regenerateInviteAction,
  removeMemberAction,
  type CampaignState,
} from "@/app/actions/campaigns";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";

/** Roda uma ação do servidor e guarda a mensagem de erro, se houver. */
function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<CampaignState>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r?.message) setError(r.message);
    });
  return { pending, error, run };
}

function ErrorText({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  );
}

/** Botão que pede um segundo clique antes de agir (sem diálogo do navegador). */
function ConfirmButton({ label, confirmLabel, onConfirm, pending }: { label: string; confirmLabel: string; onConfirm: () => void; pending: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(true)} disabled={pending}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button type="button" size="sm" variant="destructive" onClick={onConfirm} disabled={pending}>
        {pending ? "Aguarde…" : confirmLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
        Cancelar
      </Button>
    </span>
  );
}

export function InvitePanel({ campaignId, url }: { campaignId: string; url: string }) {
  const { pending, error, run } = useAction();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o campo fica selecionável para copiar à mão.
    }
  };
  return (
    <section aria-labelledby="convite-title" className="rounded-lg border bg-card p-5">
      <h2 id="convite-title" className="text-base font-semibold">
        Link de convite
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Quem abrir este link entra na mesa na hora, sem precisar de aprovação.</p>
      <Label htmlFor="invite-url" className="sr-only">
        Link de convite
      </Label>
      <div className="mt-3 flex gap-2">
        <Input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button type="button" variant="outline" onClick={copy} aria-label="Copiar link">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <p role="status" className="mt-1 h-4 text-xs text-success">
        {copied ? "Link copiado." : ""}
      </p>
      <Button type="button" variant="ghost" size="sm" className="mt-1" disabled={pending} onClick={() => run(() => regenerateInviteAction(campaignId))}>
        <RefreshCw /> Gerar link novo
      </Button>
      <p className="text-xs text-muted-foreground">O link antigo para de funcionar. Quem já entrou continua na mesa.</p>
      <ErrorText error={error} />
    </section>
  );
}

export function AttachCharacter({
  campaignId,
  options,
  systemName,
}: {
  campaignId: string;
  options: { id: string; name: string; level: number }[];
  systemName: string;
}) {
  const { pending, error, run } = useAction();
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  if (!options.length) {
    return <p className="mt-4 text-xs text-muted-foreground">Para vincular uma ficha sua, crie um personagem de {systemName} que não esteja em outra campanha.</p>;
  }
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) run(() => attachCharacterAction(campaignId, selected));
      }}
    >
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="attach">Vincular uma ficha sua</Label>
        <select
          id="attach"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name || "Sem nome"} (nível {o.level})
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending || !selected}>
        {pending ? "Vinculando…" : "Vincular"}
      </Button>
      <div className="basis-full">
        <ErrorText error={error} />
      </div>
    </form>
  );
}

export function DetachButton({ campaignId, characterId, name }: { campaignId: string; characterId: string; name: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end">
      <ConfirmButton label="Tirar" confirmLabel={`Tirar ${name}`} pending={pending} onConfirm={() => run(() => detachCharacterAction(campaignId, characterId))} />
      <ErrorText error={error} />
    </span>
  );
}

export function MemberActions({ campaignId, memberId, name, self }: { campaignId: string; memberId: string; name: string; self: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end">
      <ConfirmButton
        label={self ? "Sair da campanha" : "Tirar da mesa"}
        confirmLabel={self ? "Sair e tirar minhas fichas" : `Tirar ${name}`}
        pending={pending}
        onConfirm={() => run(() => removeMemberAction(campaignId, memberId))}
      />
      <ErrorText error={error} />
    </span>
  );
}

export function DangerZone({ campaignId, name }: { campaignId: string; name: string }) {
  const { pending, error, run } = useAction();
  return (
    <section aria-labelledby="excluir-title" className="rounded-lg border border-destructive/30 bg-card p-5">
      <h2 id="excluir-title" className="text-base font-semibold">
        Excluir campanha
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        As fichas continuam com os donos, só saem da campanha. O conteúdo personalizado da campanha é apagado. Não dá para desfazer.
      </p>
      <div className="mt-3">
        <ConfirmButton label="Excluir campanha" confirmLabel={`Excluir ${name}`} pending={pending} onConfirm={() => run(() => deleteCampaignAction(campaignId))} />
      </div>
      <ErrorText error={error} />
    </section>
  );
}
