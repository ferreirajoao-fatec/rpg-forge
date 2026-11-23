import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/characters";
import { publishCampaignEvent } from "@/server/realtime";
import type { Prisma } from "@/generated/prisma/client";

export const MapTokenSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(40),
  x: z.number().int().min(0).max(39),
  y: z.number().int().min(0).max(39),
  color: z.string().max(24).default("#d4af37"),
  kind: z.enum(["pc", "enemy", "npc"]).default("pc"),
  size: z.number().int().min(1).max(3).default(1),
  characterId: z.string().optional(),
  avatarSvg: z.string().max(80_000).optional(),
});

export const TacticalMapStateSchema = z.object({
  cols: z.number().int().min(8).max(32).default(16),
  rows: z.number().int().min(6).max(24).default(12),
  cellMeters: z.number().min(0.5).max(10).default(1.5),
  bgUrl: z.string().max(500).default(""),
  tokens: z.array(MapTokenSchema).max(60).default([]),
  fog: z.array(z.string().max(12)).max(800).default([]),
});

export type MapToken = z.infer<typeof MapTokenSchema>;
export type TacticalMapState = z.infer<typeof TacticalMapStateSchema>;

export const DEFAULT_TACTICAL_MAP: TacticalMapState = {
  cols: 16,
  rows: 12,
  cellMeters: 1.5,
  bgUrl: "",
  tokens: [],
  fog: [],
};

export function parseTacticalMap(settings: unknown): TacticalMapState {
  if (!settings || typeof settings !== "object") return DEFAULT_TACTICAL_MAP;
  const raw = (settings as Record<string, unknown>).tacticalMap;
  const parsed = TacticalMapStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_TACTICAL_MAP;
}

export async function saveTacticalMap(campaignId: string, userId: string, input: unknown) {
  const me = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!me) throw new ForbiddenError("Campanha não encontrada.");

  const next = TacticalMapStateSchema.parse(input);
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { characters: { select: { id: true, ownerId: true } } },
  });
  const settingsObj = (campaign.settings && typeof campaign.settings === "object" ? campaign.settings : {}) as Record<string, unknown>;
  const prev = parseTacticalMap(settingsObj);

  if (me.role !== "gm") {
    // Jogador só pode alterar posição x/y de tokens vinculados às suas próprias fichas.
    const myCharIds = new Set(campaign.characters.filter((c) => c.ownerId === userId).map((c) => c.id));
    const movedMap = new Map(next.tokens.map((t) => [t.id, t]));
    const updatedTokens = prev.tokens.map((orig) => {
      const m = movedMap.get(orig.id);
      if (!m || !orig.characterId || !myCharIds.has(orig.characterId)) return orig;
      return {
        ...orig,
        x: Math.max(0, Math.min(prev.cols - 1, m.x)),
        y: Math.max(0, Math.min(prev.rows - 1, m.y)),
      };
    });
    const merged: TacticalMapState = { ...prev, tokens: updatedTokens };
    await db.campaign.update({
      where: { id: campaignId },
      data: { settings: { ...settingsObj, tacticalMap: merged } as unknown as Prisma.InputJsonValue },
    });
    publishCampaignEvent(campaignId, "map", userId);
    return merged;
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { settings: { ...settingsObj, tacticalMap: next } as unknown as Prisma.InputJsonValue },
  });
  publishCampaignEvent(campaignId, "map", userId);
  return next;
}
