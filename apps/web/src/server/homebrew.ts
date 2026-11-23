import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { CampaignError } from "@/server/campaigns";
import { ForbiddenError } from "@/server/characters";
import { currentRulesetVersion } from "@/server/rulesets";
import { publishCampaignEvent } from "@/server/realtime";
import type { Prisma } from "@/generated/prisma/client";

const HOMEBREW_KINDS = ["equipment", "power", "spell", "origin", "creature"] as const;
export type HomebrewKind = (typeof HOMEBREW_KINDS)[number];

const CreateHomebrewSchema = z.object({
  kind: z.enum(HOMEBREW_KINDS),
  name: z.string().trim().min(2, "Informe pelo menos 2 caracteres.").max(80),
  summary: z.string().trim().min(2, "Descreva resumidamente o efeito.").max(400),
  text: z.string().trim().max(4000).default(""),
  cost: z.string().trim().max(60).optional(),
  category: z.string().trim().max(40).optional(),
  circle: z.number().int().min(1).max(9).optional(),
  nd: z.string().trim().max(20).optional(),
  hp: z.number().int().min(1).max(99999).optional(),
  defense: z.number().int().min(0).max(99).optional(),
});

export interface CampaignHomebrewItem {
  pk: string;
  id: string;
  kind: HomebrewKind;
  name: string;
  summary: string;
  text: string;
  data: Record<string, unknown>;
}

async function requireMember(campaignId: string, userId: string) {
  const m = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!m) throw new ForbiddenError("Campanha não encontrada.");
  return m;
}

export async function listCampaignHomebrew(campaignId: string, userId: string): Promise<CampaignHomebrewItem[]> {
  await requireMember(campaignId, userId);
  const rows = await db.contentEntry.findMany({
    where: { campaignId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => {
    const d = (r.data ?? {}) as Record<string, unknown>;
    return {
      pk: r.pk,
      id: r.id,
      kind: (HOMEBREW_KINDS.includes(r.kind as HomebrewKind) ? r.kind : "equipment") as HomebrewKind,
      name: r.name,
      summary: r.summary,
      text: typeof d.text === "string" ? d.text : "",
      data: d,
    };
  });
}

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(3).toString("hex");
  return `${base || "item"}-${suffix}`;
}

export async function createCampaignHomebrew(campaignId: string, userId: string, input: unknown) {
  const me = await requireMember(campaignId, userId);
  if (me.role !== "gm") throw new ForbiddenError("Só o mestre pode criar conteúdo homebrew.");

  const parsed = CreateHomebrewSchema.safeParse(input);
  if (!parsed.success) {
    throw new CampaignError("Preencha nome (mín. 2 caracteres) e resumo do conteúdo homebrew.");
  }

  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { rulesetId: true } });
  const version = await currentRulesetVersion(campaign.rulesetId);
  if (!version) {
    throw new CampaignError("Importe o catálogo base do sistema antes de adicionar homebrew na campanha.");
  }

  const sbId = `homebrew-${campaign.rulesetId}`;
  await db.sourcebook.upsert({
    where: { id: sbId },
    create: {
      id: sbId,
      rulesetId: campaign.rulesetId,
      title: "Homebrew da Campanha",
      publisher: "Mestre da Campanha",
      version: "1.0",
      license: "Homebrew da mesa",
    },
    update: {},
  });

  const v = parsed.data;
  const logicalId = `${v.kind}:hb-${slugify(v.name)}`;
  const data: Record<string, unknown> = {
    text: v.text || v.summary,
    ...(v.category ? { category: v.category } : {}),
    ...(v.cost ? { costText: v.cost } : {}),
    ...(v.circle !== undefined ? { circle: v.circle } : {}),
    ...(v.nd ? { nd: v.nd } : {}),
    ...(v.hp !== undefined ? { hp: v.hp } : {}),
    ...(v.defense !== undefined ? { defense: v.defense } : {}),
  };

  await db.contentEntry.create({
    data: {
      id: logicalId,
      rulesetVersionId: version.id,
      kind: v.kind,
      name: v.name,
      summary: v.summary,
      origin: "homebrew",
      sourcebookId: sbId,
      section: "Homebrew da Campanha",
      license: "Homebrew da mesa",
      roles: [],
      data: data as Prisma.InputJsonValue,
      campaignId,
    },
  });

  await db.auditLog.create({
    data: { userId, action: "campaign.homebrew_create", entityType: "Campaign", entityId: campaignId, diff: { logicalId, kind: v.kind } },
  });
  publishCampaignEvent(campaignId, "homebrew", userId);
}

export async function deleteCampaignHomebrew(campaignId: string, pk: string, userId: string) {
  const me = await requireMember(campaignId, userId);
  if (me.role !== "gm") throw new ForbiddenError("Só o mestre pode remover conteúdo homebrew.");
  const entry = await db.contentEntry.findFirst({ where: { pk, campaignId } });
  if (!entry) return;
  await db.contentEntry.delete({ where: { pk: entry.pk } });
  publishCampaignEvent(campaignId, "homebrew", userId);
}
