import "server-only";
import { z } from "zod";
import { CharacterDataSchema, getEngine, type CharacterData } from "@rpg-forge/rules-engine";
import { db } from "@/server/db";
import { CampaignError } from "@/server/campaigns";
import { ForbiddenError } from "@/server/characters";
import { loadCatalog } from "@/server/rulesets";
import { publishCampaignEvent } from "@/server/realtime";
import type { Prisma } from "@/generated/prisma/client";

const DiaryPayloadSchema = z.object({
  title: z.string().trim().min(1, "Informe um título.").max(120),
  notes: z.string().trim().max(4000).default(""),
  sessionNumber: z.number().int().min(1).max(999).optional(),
  rewardSummary: z.string().trim().max(300).optional(),
});

export interface DiaryEntry {
  id: string;
  kind: "session" | "milestone" | "reward";
  title: string;
  notes: string;
  sessionNumber?: number;
  rewardSummary?: string;
  createdAt: string;
}

async function requireMember(campaignId: string, userId: string) {
  const m = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!m) throw new ForbiddenError("Campanha não encontrada.");
  return m;
}

async function requireGm(campaignId: string, userId: string) {
  const m = await requireMember(campaignId, userId);
  if (m.role !== "gm") throw new ForbiddenError("Só o mestre pode gerenciar o diário e recompensas.");
  return m;
}

export async function listDiaryEntries(campaignId: string, userId: string): Promise<DiaryEntry[]> {
  await requireMember(campaignId, userId);
  const rows = await db.campaignEvent.findMany({
    where: { campaignId, kind: { in: ["session", "milestone", "reward"] } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const out: DiaryEntry[] = [];
  for (const r of rows) {
    const parsed = DiaryPayloadSchema.safeParse(r.payload);
    if (!parsed.success) continue;
    out.push({
      id: r.id,
      kind: (r.kind === "milestone" || r.kind === "reward" ? r.kind : "session") as DiaryEntry["kind"],
      ...parsed.data,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return out;
}

export async function createDiaryEntry(
  campaignId: string,
  userId: string,
  kind: "session" | "milestone",
  input: unknown,
) {
  await requireGm(campaignId, userId);
  const parsed = DiaryPayloadSchema.safeParse(input);
  if (!parsed.success) throw new CampaignError("Preencha o título do registro.");
  await db.campaignEvent.create({
    data: { campaignId, kind, payload: parsed.data as unknown as Prisma.InputJsonValue },
  });
  publishCampaignEvent(campaignId, "diary", userId);
}

export async function deleteDiaryEntry(campaignId: string, eventId: string, userId: string) {
  await requireGm(campaignId, userId);
  const ev = await db.campaignEvent.findFirst({
    where: { id: eventId, campaignId, kind: { in: ["session", "milestone", "reward"] } },
  });
  if (!ev) return;
  await db.campaignEvent.delete({ where: { id: ev.id } });
  publishCampaignEvent(campaignId, "diary", userId);
}

const RewardSchema = z.object({
  mode: z.enum(["xp", "prestige"]),
  amount: z.number().int().min(1).max(1_000_000),
  characterIds: z.array(z.string()).min(1, "Selecione ao menos um personagem."),
  note: z.string().trim().max(200).default(""),
});

/** Distribui XP (T20/D&D) ou Pontos de Prestígio (OP) em lote para os personagens da campanha. */
export async function distributeCampaignReward(campaignId: string, userId: string, input: unknown) {
  await requireGm(campaignId, userId);
  const parsed = RewardSchema.safeParse(input);
  if (!parsed.success) throw new CampaignError("Informe um valor positivo e selecione ao menos uma ficha.");

  const { mode, amount, characterIds, note } = parsed.data;
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { rulesetId: true } });
  const engine = getEngine(campaign.rulesetId);

  const chars = await db.character.findMany({
    where: { campaignId, id: { in: characterIds } },
    select: { id: true, name: true, rulesetVersionId: true, data: true },
  });
  if (!chars.length) throw new CampaignError("Nenhum personagem válido selecionado.");

  const catalog = await loadCatalog(campaign.rulesetId, chars[0]?.rulesetVersionId, campaignId);

  await db.$transaction(async (tx) => {
    for (const ch of chars) {
      const current = CharacterDataSchema.parse(ch.data);
      const next: CharacterData =
        mode === "xp"
          ? {
              ...current,
              progressionMode: "xp",
              experience: Math.max(0, (current.experience ?? 0) + amount),
            }
          : {
              ...current,
              currency: {
                ...current.currency,
                pp: Math.max(0, (current.currency?.pp ?? 0) + amount),
              },
            };
      const validation = engine.validate(next, catalog);
      await tx.character.update({
        where: { id: ch.id },
        data: {
          data: next as unknown as Prisma.InputJsonValue,
          validation: validation as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
        },
      });
    }
    const label = mode === "xp" ? `+${amount} XP` : `+${amount} PP (Prestígio)`;
    const names = chars.map((c) => c.name || "Sem nome").join(", ");
    await tx.campaignEvent.create({
      data: {
        campaignId,
        kind: "reward",
        payload: {
          title: `Recompensa distribuída: ${label}`,
          notes: note || `Aplicado em: ${names}`,
          rewardSummary: `${label} · ${chars.length} personagem(ns)`,
        },
      },
    });
    await tx.auditLog.create({
      data: { userId, action: "campaign.distribute_reward", entityType: "Campaign", entityId: campaignId, diff: { mode, amount, count: chars.length } },
    });
  });

  publishCampaignEvent(campaignId, "diary", userId);
  publishCampaignEvent(campaignId, "party", userId);
}

/** Salva as regras opcionais recomendadas da campanha em Campaign.settings. */
export async function updateCampaignOptionalRules(campaignId: string, userId: string, rules: string[]) {
  await requireGm(campaignId, userId);
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { settings: true } });
  const prev = (campaign.settings && typeof campaign.settings === "object" ? campaign.settings : {}) as Record<string, unknown>;
  await db.campaign.update({
    where: { id: campaignId },
    data: { settings: { ...prev, optionalRules: [...new Set(rules)] } as Prisma.InputJsonValue },
  });
  publishCampaignEvent(campaignId, "diary", userId);
}
