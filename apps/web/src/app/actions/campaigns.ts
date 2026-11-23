"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasEngine } from "@rpg-forge/rules-engine";
import { requireUser } from "@/server/auth/dal";
import {
  attachCharacter,
  CampaignError,
  createCampaign,
  deleteCampaign,
  detachCharacter,
  joinCampaign,
  regenerateInvite,
  removeMember,
} from "@/server/campaigns";
import { createBoardItem, deleteBoardItem, toggleBoardItemReveal } from "@/server/campaign-board";
import { createCampaignHomebrew, deleteCampaignHomebrew } from "@/server/homebrew";
import { decideApproval } from "@/server/approvals";
import {
  createDiaryEntry,
  deleteDiaryEntry,
  distributeCampaignReward,
  updateCampaignOptionalRules,
} from "@/server/campaign-diary";
import { saveTacticalMap } from "@/server/campaign-map";
import { setCampaignAmbientTrack, type AmbientTrackId } from "@/server/campaign-audio";
import { ForbiddenError } from "@/server/characters";

export type CampaignState = { errors?: Record<string, string[] | undefined>; message?: string } | undefined;

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Use pelo menos 2 caracteres.").max(80),
  description: z.string().trim().max(500).default(""),
  rulesetId: z.string().refine(hasEngine, "Escolha um sistema válido."),
});

export async function createCampaignAction(_s: CampaignState, formData: FormData): Promise<CampaignState> {
  const user = await requireUser();
  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const c = await createCampaign(user.id, parsed.data);
  redirect(`/app/campanhas/${c.id}`);
}

/** Erros esperados viram mensagem; o resto sobe para a tela de erro. */
async function run(fn: () => Promise<void>, path: string): Promise<CampaignState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof CampaignError || e instanceof ForbiddenError) return { message: e.message };
    throw e;
  }
  revalidatePath(path);
  return undefined;
}

export async function joinCampaignAction(code: string): Promise<CampaignState> {
  const user = await requireUser();
  let id: string;
  try {
    id = await joinCampaign(code, user.id);
  } catch (e) {
    if (e instanceof CampaignError) return { message: e.message };
    throw e;
  }
  redirect(`/app/campanhas/${id}`);
}

export async function attachCharacterAction(campaignId: string, characterId: string) {
  const user = await requireUser();
  return run(() => attachCharacter(campaignId, characterId, user.id), `/app/campanhas/${campaignId}`);
}

export async function detachCharacterAction(campaignId: string, characterId: string) {
  const user = await requireUser();
  return run(() => detachCharacter(campaignId, characterId, user.id), `/app/campanhas/${campaignId}`);
}

export async function removeMemberAction(campaignId: string, memberId: string) {
  const user = await requireUser();
  const r = await run(() => removeMember(campaignId, memberId, user.id), `/app/campanhas/${campaignId}`);
  if (!r && memberId === user.id) redirect("/app/campanhas");
  return r;
}

export async function regenerateInviteAction(campaignId: string) {
  const user = await requireUser();
  return run(() => regenerateInvite(campaignId, user.id), `/app/campanhas/${campaignId}`);
}

export async function deleteCampaignAction(campaignId: string) {
  const user = await requireUser();
  const r = await run(() => deleteCampaign(campaignId, user.id), "/app/campanhas");
  if (!r) redirect("/app/campanhas");
  return r;
}

export async function createBoardItemAction(
  campaignId: string,
  kind: "clue" | "npc",
  input: { title: string; description: string; tag: string; revealed: boolean },
) {
  const user = await requireUser();
  return run(() => createBoardItem(campaignId, user.id, kind, input), `/app/campanhas/${campaignId}`);
}

export async function toggleBoardItemRevealAction(campaignId: string, eventId: string) {
  const user = await requireUser();
  return run(() => toggleBoardItemReveal(campaignId, eventId, user.id), `/app/campanhas/${campaignId}`);
}

export async function deleteBoardItemAction(campaignId: string, eventId: string) {
  const user = await requireUser();
  return run(() => deleteBoardItem(campaignId, eventId, user.id), `/app/campanhas/${campaignId}`);
}

export async function createHomebrewAction(campaignId: string, input: unknown) {
  const user = await requireUser();
  return run(() => createCampaignHomebrew(campaignId, user.id, input), `/app/campanhas/${campaignId}`);
}

export async function deleteHomebrewAction(campaignId: string, pk: string) {
  const user = await requireUser();
  return run(() => deleteCampaignHomebrew(campaignId, pk, user.id), `/app/campanhas/${campaignId}`);
}

export async function decideApprovalAction(campaignId: string, approvalId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  return run(() => decideApproval(campaignId, approvalId, user.id, decision), `/app/campanhas/${campaignId}`);
}

export async function createDiaryEntryAction(
  campaignId: string,
  kind: "session" | "milestone",
  input: { title: string; notes: string; sessionNumber?: number },
) {
  const user = await requireUser();
  return run(() => createDiaryEntry(campaignId, user.id, kind, input), `/app/campanhas/${campaignId}`);
}

export async function deleteDiaryEntryAction(campaignId: string, eventId: string) {
  const user = await requireUser();
  return run(() => deleteDiaryEntry(campaignId, eventId, user.id), `/app/campanhas/${campaignId}`);
}

export async function distributeRewardAction(
  campaignId: string,
  input: { mode: "xp" | "prestige"; amount: number; characterIds: string[]; note: string },
) {
  const user = await requireUser();
  return run(() => distributeCampaignReward(campaignId, user.id, input), `/app/campanhas/${campaignId}`);
}

export async function updateCampaignOptionalRulesAction(campaignId: string, rules: string[]) {
  const user = await requireUser();
  return run(() => updateCampaignOptionalRules(campaignId, user.id, rules), `/app/campanhas/${campaignId}`);
}

export async function saveTacticalMapAction(campaignId: string, mapState: unknown) {
  const user = await requireUser();
  try {
    const saved = await saveTacticalMap(campaignId, user.id, mapState);
    revalidatePath(`/app/campanhas/${campaignId}`);
    return { ok: true as const, map: saved };
  } catch (e) {
    if (e instanceof CampaignError || e instanceof ForbiddenError) return { ok: false as const, error: e.message };
    throw e;
  }
}

export async function setAmbientTrackAction(campaignId: string, track: AmbientTrackId) {
  const user = await requireUser();
  return run(async () => {
    await setCampaignAmbientTrack(campaignId, user.id, track);
  }, `/app/campanhas/${campaignId}`);
}
