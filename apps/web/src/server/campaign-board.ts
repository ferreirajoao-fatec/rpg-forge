import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/characters";
import { CampaignError } from "@/server/campaigns";
import { publishCampaignEvent } from "@/server/realtime";

const BoardPayloadSchema = z.object({
  title: z.string().trim().min(1, "Informe um título.").max(100),
  description: z.string().trim().max(2000).default(""),
  tag: z.string().trim().max(40).default("Pista"),
  revealed: z.boolean().default(false),
});

export interface BoardItem {
  id: string;
  kind: "clue" | "npc";
  title: string;
  description: string;
  tag: string;
  revealed: boolean;
  createdAt: string;
}

async function requireMemberRole(campaignId: string, userId: string) {
  const m = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!m) throw new ForbiddenError("Campanha não encontrada.");
  return m;
}

export async function listBoardItems(campaignId: string, userId: string): Promise<BoardItem[]> {
  const me = await requireMemberRole(campaignId, userId);
  const rows = await db.campaignEvent.findMany({
    where: { campaignId, kind: { in: ["clue", "npc"] } },
    orderBy: { createdAt: "desc" },
  });
  const items: BoardItem[] = [];
  for (const row of rows) {
    const parsed = BoardPayloadSchema.safeParse(row.payload);
    if (!parsed.success) continue;
    if (me.role !== "gm" && !parsed.data.revealed) continue;
    items.push({
      id: row.id,
      kind: row.kind === "npc" ? "npc" : "clue",
      ...parsed.data,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return items;
}

export async function createBoardItem(
  campaignId: string,
  userId: string,
  kind: "clue" | "npc",
  input: unknown,
) {
  const me = await requireMemberRole(campaignId, userId);
  if (me.role !== "gm") throw new ForbiddenError("Só o mestre pode adicionar ao mural.");
  const parsed = BoardPayloadSchema.safeParse(input);
  if (!parsed.success) throw new CampaignError("Preencha o título (até 100 caracteres).");
  await db.campaignEvent.create({
    data: { campaignId, kind, payload: parsed.data },
  });
  publishCampaignEvent(campaignId, "board", userId);
}

export async function toggleBoardItemReveal(campaignId: string, eventId: string, userId: string) {
  const me = await requireMemberRole(campaignId, userId);
  if (me.role !== "gm") throw new ForbiddenError("Só o mestre pode revelar ou ocultar itens.");
  const ev = await db.campaignEvent.findFirst({ where: { id: eventId, campaignId, kind: { in: ["clue", "npc"] } } });
  if (!ev) throw new CampaignError("Item não encontrado no mural.");
  const payload = BoardPayloadSchema.parse(ev.payload);
  await db.campaignEvent.update({
    where: { id: ev.id },
    data: { payload: { ...payload, revealed: !payload.revealed } },
  });
  publishCampaignEvent(campaignId, "board", userId);
}

export async function deleteBoardItem(campaignId: string, eventId: string, userId: string) {
  const me = await requireMemberRole(campaignId, userId);
  if (me.role !== "gm") throw new ForbiddenError("Só o mestre pode excluir itens do mural.");
  const ev = await db.campaignEvent.findFirst({ where: { id: eventId, campaignId, kind: { in: ["clue", "npc"] } } });
  if (!ev) return;
  await db.campaignEvent.delete({ where: { id: ev.id } });
  publishCampaignEvent(campaignId, "board", userId);
}
