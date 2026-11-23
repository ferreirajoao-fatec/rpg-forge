"use client";

import { useActionState } from "react";
import { joinCampaignAction } from "@/app/actions/campaigns";
import { Button } from "@rpg-forge/ui/components/button";

export function JoinButton({ code }: { code: string }) {
  const [state, action, pending] = useActionState(() => joinCampaignAction(code), undefined);
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar na campanha"}
      </Button>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
