"use client";

import Link from "next/link";
import { Dices, FileText, Heart, Shield, Sparkles } from "lucide-react";
import { Badge } from "@rpg-forge/ui/components/badge";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { Progress } from "@rpg-forge/ui/components/progress";
import type { PartyMemberOverview } from "@/server/campaigns";

export function PartyScreen({
  members,
  currentUserId,
  isGm,
}: {
  members: PartyMemberOverview[];
  currentUserId: string;
  isGm: boolean;
}) {
  if (!members.length) {
    return (
      <section aria-labelledby="party-screen-title" className="rounded-lg border bg-card p-5">
        <h2 id="party-screen-title" className="flex items-center gap-2 text-base font-semibold">
          <Shield className="size-4 text-gold" aria-hidden /> Escudo da mesa (grupo ao vivo)
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Vincule fichas à campanha para acompanhar PV, energia/sanidade, Defesa e condições em tempo real.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="party-screen-title" className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="party-screen-title" className="flex items-center gap-2 text-base font-semibold">
          <Shield className="size-4 text-gold" aria-hidden /> Escudo da mesa ({members.length} personagem(ns))
        </h2>
        <span className="text-xs text-muted-foreground">Atualiza com alterações do Modo Mesa</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const hpPct = Math.max(0, Math.min(100, Math.round((m.hp.current / Math.max(1, m.hp.max)) * 100)));
          const secPct = m.secondary
            ? Math.max(0, Math.min(100, Math.round((m.secondary.current / Math.max(1, m.secondary.max)) * 100)))
            : 0;
          const sanPct = m.sanity
            ? Math.max(0, Math.min(100, Math.round((m.sanity.current / Math.max(1, m.sanity.max)) * 100)))
            : 0;
          const canAccessSheet = isGm || m.ownerId === currentUserId;

          return (
            <div key={m.id} className="flex flex-col justify-between gap-3 rounded-lg border bg-background/60 p-3.5">
              <div className="flex items-start gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-full border bg-muted">
                  {m.portrait ? (
                    <div className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: m.portrait }} />
                  ) : (
                    <div className="grid size-full place-items-center text-sm font-semibold text-muted-foreground">
                      {m.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <h3 className="truncate font-medium">{m.name}</h3>
                    {m.defense !== null && (
                      <Badge variant="outline" className="tabular-nums">
                        <Shield className="mr-1 size-3" aria-hidden /> {m.defense}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.levelLabel} · {m.ownerId === currentUserId ? "sua ficha" : m.ownerName}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="flex items-center gap-1 font-medium text-destructive">
                      <Heart className="size-3" aria-hidden /> PV
                    </span>
                    <span className="tabular-nums">
                      {m.hp.current}/{m.hp.max}
                    </span>
                  </div>
                  <Progress value={hpPct} className="h-1.5" aria-label={`PV de ${m.name}`} />
                </div>

                {m.secondary && (
                  <div>
                    <div className="mb-1 flex justify-between">
                      <span className="flex items-center gap-1 font-medium text-gold">
                        <Sparkles className="size-3" aria-hidden /> {m.secondary.label}
                      </span>
                      <span className="tabular-nums">
                        {m.secondary.current}/{m.secondary.max}
                      </span>
                    </div>
                    <Progress value={secPct} className="h-1.5" aria-label={`${m.secondary.label} de ${m.name}`} />
                  </div>
                )}

                {m.sanity && (
                  <div>
                    <div className="mb-1 flex justify-between">
                      <span className="font-medium text-muted-foreground">SAN</span>
                      <span className="tabular-nums">
                        {m.sanity.current}/{m.sanity.max}
                      </span>
                    </div>
                    <Progress value={sanPct} className="h-1.5" aria-label={`Sanidade de ${m.name}`} />
                  </div>
                )}

                {m.conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {m.conditions.map((cond) => (
                      <Badge key={cond} variant="secondary" className="text-[11px]">
                        {cond}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {canAccessSheet && (
                <div className="flex flex-wrap gap-1.5 border-t pt-2">
                  <Link href={`/app/personagens/${m.id}/ficha?modo=mesa`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    <Dices /> Modo Mesa
                  </Link>
                  <Link href={`/app/personagens/${m.id}/ficha`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                    <FileText /> Ficha
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
