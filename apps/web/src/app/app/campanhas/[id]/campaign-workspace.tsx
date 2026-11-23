"use client";

import { useState } from "react";
import { BookOpen, ClipboardCheck, LayoutGrid, Map as MapIcon, Shield } from "lucide-react";
import type { TacticalMapState } from "@/server/campaign-map";
import type { PartyMemberOverview } from "@/server/campaigns";
import type { BoardItem } from "@/server/campaign-board";
import type { CampaignHomebrewItem } from "@/server/homebrew";
import type { ApprovalRow } from "@/server/approvals";
import type { DiaryEntry } from "@/server/campaign-diary";
import { PartyScreen } from "./party-screen";
import { InvestigationBoard } from "./investigation-board";
import { CampaignRolls } from "./campaign-rolls";
import { TacticalMap } from "./tactical-map";
import { SessionDiary } from "./session-diary";
import { HomebrewManager } from "./homebrew-manager";
import { ApprovalsPanel } from "./approvals-panel";
import { cn } from "@rpg-forge/ui/lib/utils";

type TabId = "mesa" | "escudo" | "mapa" | "diario" | "homebrew";

type RollRow = {
  id: string;
  formula: string;
  total: number;
  breakdown: string;
  label: string;
  shared: boolean;
  createdAt: string;
  authorName: string;
  characterName: string | null;
};

export function CampaignWorkspace({
  campaignId,
  rulesetId,
  currentUserId,
  isGm,
  party,
  boardItems,
  campaignRolls,
  initialMap,
  diaryEntries,
  optionalRules,
  homebrewItems,
  approvals,
  charactersSection,
  membersSection,
}: {
  campaignId: string;
  rulesetId: string;
  currentUserId: string;
  isGm: boolean;
  party: PartyMemberOverview[];
  boardItems: BoardItem[];
  campaignRolls: RollRow[];
  initialMap: TacticalMapState;
  diaryEntries: DiaryEntry[];
  optionalRules: string[];
  homebrewItems: CampaignHomebrewItem[];
  approvals: ApprovalRow[];
  charactersSection: React.ReactNode;
  membersSection: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("mesa");
  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "mesa", label: "Mesa ao vivo", icon: LayoutGrid },
    { id: "escudo", label: `Escudo da mesa (${party.length})`, icon: Shield },
    { id: "mapa", label: "Mapa tático", icon: MapIcon },
    { id: "diario", label: "Diário & Recompensas", icon: BookOpen },
    { id: "homebrew", label: pendingApprovals ? `Homebrew & Aprovações (${pendingApprovals})` : "Homebrew & Aprovações", icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Áreas da campanha" className="flex flex-wrap gap-1 rounded-lg border bg-muted/60 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "mesa" && (
        <div className="space-y-6">
          {charactersSection}
          <InvestigationBoard campaignId={campaignId} isGm={isGm} items={boardItems} />
          <CampaignRolls campaignId={campaignId} rulesetId={rulesetId} initialRolls={campaignRolls} />
          {membersSection}
        </div>
      )}

      {tab === "escudo" && (
        <PartyScreen members={party} currentUserId={currentUserId} isGm={isGm} />
      )}

      {tab === "mapa" && (
        <TacticalMap
          campaignId={campaignId}
          isGm={isGm}
          currentUserId={currentUserId}
          initialMap={initialMap}
          members={party}
        />
      )}

      {tab === "diario" && (
        <SessionDiary
          campaignId={campaignId}
          rulesetId={rulesetId}
          isGm={isGm}
          entries={diaryEntries}
          members={party}
          initialOptionalRules={optionalRules}
        />
      )}

      {tab === "homebrew" && (
        <div className="space-y-6">
          <ApprovalsPanel campaignId={campaignId} isGm={isGm} approvals={approvals} />
          <HomebrewManager campaignId={campaignId} isGm={isGm} items={homebrewItems} />
        </div>
      )}
    </div>
  );
}
