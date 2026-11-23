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
