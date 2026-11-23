"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { isMember } from "@/server/campaigns";
import { ForbiddenError, loadWithAccess } from "@/server/characters";
import { db } from "@/server/db";
import { publishCampaignEvent } from "@/server/realtime";
import { DiceFormulaError, roll } from "@rpg-forge/rules-engine";

export type RollState =
  | {
      ok: true;
      id: string;
      formula: string;
      total: number;
      breakdown: string;
      label: string;
      createdAt: string;
      shared?: boolean;
      campaignId?: string | null;
      authorName?: string;
      characterName?: string | null;
    }
  | { ok: false; error: string };

const RollSchema = z.object({
  formula: z.string().trim().min(1).max(120),
  label: z.string().trim().max(80).default(""),
  characterId: z.string().cuid().optional(),
  campaignId: z.string().cuid().optional(),
  shared: z.boolean().optional(),
});

/** A rolagem acontece no servidor (RNG criptográfico) para resultados confiáveis. */
export async function rollDiceAction(input: {
  formula: string;
  label?: string;
  characterId?: string;
  campaignId?: string;
  shared?: boolean;
}): Promise<RollState> {
  const user = await requireUser();
  const parsed = RollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fórmula inválida." };
  const { formula, label, characterId, campaignId } = parsed.data;
  const shared = campaignId ? (parsed.data.shared ?? true) : false;

  if (campaignId && !(await isMember(campaignId, user.id))) {
    return { ok: false, error: "Você não participa desta campanha." };
  }
  let characterName: string | null = null;
  if (characterId) {
    try {
      const ch = await loadWithAccess(characterId, user.id, "read");
      characterName = ch.name || null;
    } catch (e) {
      if (e instanceof ForbiddenError) return { ok: false, error: "Personagem sem acesso." };
      throw e;
    }
  }

  try {
    const r = roll(formula);
    const saved = await db.diceRoll.create({
      data: {
        userId: user.id,
        characterId: characterId ?? null,
        campaignId: campaignId ?? null,
        shared,
        formula: r.formula,
        label,
        total: r.total,
        breakdown: r.breakdown,
        detail: r.terms.map((t) => ({ term: t.term, rolls: t.rolls, kept: t.kept, subtotal: t.subtotal })),
      },
    });
    if (campaignId && shared) {
      publishCampaignEvent(campaignId, "roll", user.id);
    }
    return {
      ok: true,
      id: saved.id,
      formula: r.formula,
      total: r.total,
      breakdown: r.breakdown,
      label: saved.label,
      createdAt: saved.createdAt.toISOString(),
      shared: saved.shared,
      campaignId: saved.campaignId,
      authorName: user.displayName,
      characterName,
    };
  } catch (e) {
    if (e instanceof DiceFormulaError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function listCampaignRollsAction(campaignId: string) {
  const user = await requireUser();
  if (!(await isMember(campaignId, user.id))) return [];
  const rows = await db.diceRoll.findMany({
    where: {
      campaignId,
      OR: [{ shared: true }, { userId: user.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      formula: true,
      total: true,
      breakdown: true,
      label: true,
      shared: true,
      createdAt: true,
      user: { select: { displayName: true } },
      character: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    formula: r.formula,
    total: r.total,
    breakdown: r.breakdown,
    label: r.label,
    shared: r.shared,
    createdAt: r.createdAt.toISOString(),
    authorName: r.user.displayName,
    characterName: r.character?.name ?? null,
  }));
}
