"use client";

import { useTransition } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import { decideApprovalAction } from "@/app/actions/campaigns";
import type { ApprovalRow } from "@/server/approvals";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";

const STATUS_BADGE: Record<ApprovalRow["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  approved: { label: "Aprovado", variant: "default" },
  rejected: { label: "Recusado", variant: "destructive" },
};

export function ApprovalsPanel({
  campaignId,
  isGm,
  approvals,
}: {
  campaignId: string;
  isGm: boolean;
  approvals: ApprovalRow[];
}) {
  const [pending, startTransition] = useTransition();
  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <section aria-labelledby="approvals-title" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="approvals-title" className="flex items-center gap-2 text-base font-semibold">
          <ClipboardCheck className="size-4 text-gold" aria-hidden /> Aprovações do mestre
          {pendingCount > 0 && <Badge>{pendingCount} pendente(s)</Badge>}
        </h2>
        <span className="text-xs text-muted-foreground">Exceções de regra ou itens solicitados nas fichas</span>
      </div>

      {approvals.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido de aprovação enviado pelas fichas ainda.</p>
      ) : (
        <ul className="mt-3 divide-y">
          {approvals.map((a) => {
            const st = STATUS_BADGE[a.status];
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.characterName}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <span className="text-xs text-muted-foreground">{a.contentId}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.reason}</p>
                </div>
                {isGm && a.status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => startTransition(() => void decideApprovalAction(campaignId, a.id, "approved"))}
                    >
                      <Check /> Aprovar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => startTransition(() => void decideApprovalAction(campaignId, a.id, "rejected"))}
                    >
                      <X /> Recusar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
