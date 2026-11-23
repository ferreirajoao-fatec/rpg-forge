import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Crown } from "lucide-react";
import { getEngine, hasEngine } from "@rpg-forge/rules-engine";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { requireUser } from "@/server/auth/dal";
import { getCampaign, loadCampaignParty } from "@/server/campaigns";
import { listBoardItems } from "@/server/campaign-board";
import { listCampaignHomebrew } from "@/server/homebrew";
import { listCampaignApprovals } from "@/server/approvals";
import { listDiaryEntries } from "@/server/campaign-diary";
import { parseTacticalMap } from "@/server/campaign-map";
import { parseAmbientTrack } from "@/server/campaign-audio";
import { listCampaignRollsAction } from "@/app/actions/dice";
import { ForbiddenError } from "@/server/characters";
import { AttachCharacter, DangerZone, InvitePanel, MemberActions, DetachButton } from "./campaign-controls";
import { CampaignLiveSync } from "./campaign-live-sync";
import { CampaignWorkspace } from "./campaign-workspace";
import { Soundboard } from "./soundboard";

export const metadata: Metadata = { title: "Campanha" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

/** Origem do site para montar o link de convite (funciona local, em prévia e em produção). */
async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function CampaignPage({ params }: PageProps<"/app/campanhas/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  let loaded;
  try {
    loaded = await getCampaign(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const { campaign, isGm, attachable } = loaded;
  const [boardItems, campaignRolls, party, homebrewItems, approvals, diaryEntries] = await Promise.all([
    listBoardItems(id, user.id),
    listCampaignRollsAction(id),
    loadCampaignParty(id, user.id),
    listCampaignHomebrew(id, user.id),
    listCampaignApprovals(id, user.id),
    listDiaryEntries(id, user.id),
  ]);
  const inviteUrl = `${await siteOrigin()}/convite/${campaign.inviteCode}`;
  const engine = hasEngine(campaign.rulesetId) ? getEngine(campaign.rulesetId) : undefined;
  const systemName = engine ? engine.meta.name : campaign.rulesetId;

  const settingsObj = (campaign.settings && typeof campaign.settings === "object" ? campaign.settings : {}) as Record<string, unknown>;
  const optionalRules = Array.isArray(settingsObj.optionalRules) ? (settingsObj.optionalRules as string[]) : [];
  const initialMap = parseTacticalMap(campaign.settings);
  const syncedTrack = parseAmbientTrack(campaign.settings);

  const charactersSection = (
    <section aria-labelledby="fichas-title" className="rounded-lg border bg-card p-5">
      <h2 id="fichas-title" className="text-base font-semibold">
        Fichas na campanha
      </h2>
      {campaign.characters.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma ficha vinculada ainda.</p>
      ) : (
        <ul className="mt-3 divide-y">
          {campaign.characters.map((ch) => {
            const mine = ch.ownerId === user.id;
            return (
              <li key={ch.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{ch.name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">
                    {engine?.formatLevel ? engine.formatLevel(ch.level) : `Nível ${ch.level}`} · {mine ? "sua ficha" : ch.owner.displayName}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {(mine || isGm) && (
                    <Link href={`/app/personagens/${ch.id}/ficha`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      Ver ficha
                    </Link>
                  )}
                  {(mine || isGm) && <DetachButton campaignId={campaign.id} characterId={ch.id} name={ch.name || "esta ficha"} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AttachCharacter campaignId={campaign.id} options={attachable} systemName={systemName} />
    </section>
  );

  const membersSection = (
    <section aria-labelledby="mesa-title" className="rounded-lg border bg-card p-5">
      <h2 id="mesa-title" className="text-base font-semibold">
        Na mesa
      </h2>
      <ul className="mt-3 divide-y">
        {campaign.members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <span className="flex items-center gap-1.5">
              {m.user.displayName}
              {m.userId === user.id && <span className="text-xs text-muted-foreground">(você)</span>}
              {m.role === "gm" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-xs text-gold">
                  <Crown className="size-3" aria-hidden /> Mestre
                </span>
              )}
            </span>
            {m.role !== "gm" && (isGm || m.userId === user.id) && (
              <MemberActions campaignId={campaign.id} memberId={m.userId} name={m.user.displayName} self={m.userId === user.id} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/campanhas" className={buttonVariants({ variant: "outline" })}>
          <ChevronLeft /> Campanhas
        </Link>
        <CampaignLiveSync campaignId={campaign.id} />
      </div>
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{systemName}</p>
        <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        {campaign.description && <p className="mt-1 max-w-2xl text-sm whitespace-pre-line text-muted-foreground">{campaign.description}</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <CampaignWorkspace
          campaignId={campaign.id}
          rulesetId={campaign.rulesetId}
          currentUserId={user.id}
          isGm={isGm}
          party={party}
          boardItems={boardItems}
          campaignRolls={campaignRolls}
          initialMap={initialMap}
          diaryEntries={diaryEntries}
          optionalRules={optionalRules}
          homebrewItems={homebrewItems}
          approvals={approvals}
          charactersSection={charactersSection}
          membersSection={membersSection}
        />

        <aside className="space-y-6 lg:self-start">
          <Soundboard campaignId={campaign.id} isGm={isGm} syncedTrack={syncedTrack} />
          {isGm ? (
            <>
              <InvitePanel campaignId={campaign.id} url={inviteUrl} />
              <DangerZone campaignId={campaign.id} name={campaign.name} />
            </>
          ) : (
            <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
              O mestre vê as fichas da campanha. Você continua sendo o único que pode editar a sua.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
