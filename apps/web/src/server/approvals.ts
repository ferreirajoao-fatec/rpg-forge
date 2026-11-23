import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { CampaignError } from "@/server/campaigns";
import { ForbiddenError, loadWithAccess } from "@/server/characters";
import { publishCampaignEvent } from "@/server/realtime";

const RequestSchema = z.object({
  slot: z.string().trim().min(1).max(80),
  contentId: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(2, "Explique brevemente o pedido ao mestre.").max(400),
});

export interface ApprovalRow {
  id: string;
  characterId: string;
  characterName: string;
  slot: string;
  contentId: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedByName: string;
  approvedByName: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export async function requestApproval(characterId: string, userId: string, input: unknown) {
  const ch = await loadWithAccess(characterId, userId, "write");
  if (!ch.campaignId) {
    throw new CampaignError("Vincule a ficha a uma campanha antes de enviar pedidos ao mestre.");
  }
  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new CampaignError("Preencha o item/exceção e a justificativa para o mestre.");
  }
  const created = await db.gmApproval.create({
    data: {
      characterId: ch.id,
      slot: parsed.data.slot,
      contentId: parsed.data.contentId,
      reason: parsed.data.reason,
      requestedById: userId,
    },
  });
  await db.auditLog.create({
    data: { userId, action: "approval.request", entityType: "GmApproval", entityId: created.id, diff: { characterId, slot: parsed.data.slot } },
  });
  publishCampaignEvent(ch.campaignId, "approval", userId);
  return created;
}

export async function listCharacterApprovals(characterId: string, userId: string): Promise<ApprovalRow[]> {
  await loadWithAccess(characterId, userId, "read");
  const rows = await db.gmApproval.findMany({
    where: { characterId },
    orderBy: { createdAt: "desc" },
    include: {
      character: { select: { name: true } },
      requestedBy: { select: { displayName: true } },
      approvedBy: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    characterId: r.characterId,
    characterName: r.character.name || "Sem nome",
    slot: r.slot,
    contentId: r.contentId,
    reason: r.reason,
    status: r.status,
    requestedByName: r.requestedBy.displayName,
    approvedByName: r.approvedBy?.displayName ?? null,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
}

export async function listCampaignApprovals(campaignId: string, userId: string): Promise<ApprovalRow[]> {
  const me = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!me) throw new ForbiddenError("Campanha não encontrada.");

  const rows = await db.gmApproval.findMany({
    where: { character: { campaignId } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      character: { select: { name: true } },
      requestedBy: { select: { displayName: true } },
      approvedBy: { select: { displayName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    characterId: r.characterId,
    characterName: r.character.name || "Sem nome",
    slot: r.slot,
    contentId: r.contentId,
    reason: r.reason,
    status: r.status,
    requestedByName: r.requestedBy.displayName,
    approvedByName: r.approvedBy?.displayName ?? null,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
  }));
}

export async function decideApproval(campaignId: string, approvalId: string, userId: string, decision: "approved" | "rejected") {
  const me = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!me || me.role !== "gm") throw new ForbiddenError("Só o mestre pode aprovar ou recusar pedidos.");

  const row = await db.gmApproval.findFirst({
    where: { id: approvalId, character: { campaignId } },
  });
  if (!row) throw new CampaignError("Pedido não encontrado nesta campanha.");

  await db.gmApproval.update({
    where: { id: row.id },
    data: {
      status: decision,
      approvedById: userId,
      decidedAt: new Date(),
    },
  });
  await db.auditLog.create({
    data: { userId, action: `approval.${decision}`, entityType: "GmApproval", entityId: row.id },
  });
  publishCampaignEvent(campaignId, "approval", userId);
}
