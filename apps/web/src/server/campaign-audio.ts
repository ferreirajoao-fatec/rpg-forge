import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/characters";
import { publishCampaignEvent } from "@/server/realtime";
import type { Prisma } from "@/generated/prisma/client";

export const AMBIENT_TRACKS = ["none", "rain", "paranormal", "tavern", "forest", "combat"] as const;
export type AmbientTrackId = (typeof AMBIENT_TRACKS)[number];

const AmbientSchema = z.object({
  track: z.enum(AMBIENT_TRACKS),
});

export function parseAmbientTrack(settings: unknown): AmbientTrackId {
  if (!settings || typeof settings !== "object") return "none";
  const parsed = AmbientSchema.safeParse({ track: (settings as Record<string, unknown>).ambientTrack ?? "none" });
  return parsed.success ? parsed.data.track : "none";
}

export async function setCampaignAmbientTrack(campaignId: string, userId: string, track: AmbientTrackId) {
  const me = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!me || me.role !== "gm") throw new ForbiddenError("Só o mestre pode sincronizar a trilha sonora da mesa.");
  const parsed = AmbientSchema.parse({ track });
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { settings: true } });
  const prev = (campaign.settings && typeof campaign.settings === "object" ? campaign.settings : {}) as Record<string, unknown>;
  await db.campaign.update({
    where: { id: campaignId },
    data: { settings: { ...prev, ambientTrack: parsed.track } as Prisma.InputJsonValue },
  });
  publishCampaignEvent(campaignId, "audio", userId);
  return parsed.track;
}
