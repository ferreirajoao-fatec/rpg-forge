import "server-only";
import { randomBytes } from "node:crypto";
import { CharacterDataSchema, getEngine, hasEngine } from "@rpg-forge/rules-engine";
import { db } from "@/server/db";
import { portraitsFor } from "@/server/avatars";
import { ForbiddenError } from "@/server/characters";
import { publishCampaignEvent } from "@/server/realtime";
import { loadCatalog } from "@/server/rulesets";

/**
 * Campanhas: o mestre cria, convida por link e os jogadores entram e vinculam fichas
 * sem precisar de aprovação. Leitura: membros. Gestão (convite, membros, excluir): o mestre.
 * Para não vazar existência, "não existe" e "sem acesso" dão o mesmo erro.
 */

export class CampaignError extends Error {}

const NOT_FOUND = "Campanha não encontrada.";
/** Código do convite: 12 caracteres base64url (72 bits), difícil de adivinhar. */
export const INVITE_CODE = /^[A-Za-z0-9_-]{12}$/;
const newInviteCode = () => randomBytes(9).toString("base64url");

async function membership(campaignId: string, userId: string) {
  const m = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } } });
  if (!m) throw new ForbiddenError(NOT_FOUND);
  return m;
}

async function requireGm(campaignId: string, userId: string) {
  const m = await membership(campaignId, userId);
  if (m.role !== "gm") throw new ForbiddenError("Só o mestre pode fazer isso.");
  return m;
}

export async function createCampaign(userId: string, input: { name: string; description: string; rulesetId: string }) {
  if (!hasEngine(input.rulesetId)) throw new CampaignError("Sistema inválido.");
  return db.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        name: input.name,
        description: input.description,
        rulesetId: input.rulesetId,
        ownerId: userId,
        inviteCode: newInviteCode(),
        members: { create: { userId, role: "gm" } },
      },
    });
    await tx.auditLog.create({ data: { userId, action: "campaign.create", entityType: "Campaign", entityId: c.id } });
    return c;
  });
}

export async function listCampaigns(userId: string) {
  const rows = await db.campaignMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    include: { campaign: { include: { _count: { select: { members: true, characters: true } } } } },
  });
  return rows.map((r) => ({ role: r.role, ...r.campaign }));
}

export async function getCampaign(campaignId: string, userId: string) {
  const me = await membership(campaignId, userId);
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      members: { orderBy: { joinedAt: "asc" }, include: { user: { select: { id: true, displayName: true } } } },
      characters: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, level: true, ownerId: true, rulesetId: true, owner: { select: { displayName: true } } },
      },
    },
  });
  // Fichas do próprio usuário que ainda podem entrar (mesmo sistema, fora de outra campanha).
  const attachable = await db.character.findMany({
    where: { ownerId: userId, rulesetId: campaign.rulesetId, campaignId: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, level: true },
  });
  return { campaign, role: me.role, attachable, isGm: me.role === "gm" };
}

/** Dados mostrados na página pública do convite. Código inválido = null. */
export async function previewInvite(code: string) {
  if (!INVITE_CODE.test(code)) return null;
  const c = await db.campaign.findUnique({
    where: { inviteCode: code },
    select: { id: true, name: true, description: true, rulesetId: true, owner: { select: { displayName: true } }, _count: { select: { members: true } } },
  });
  return c;
}

export async function isMember(campaignId: string, userId: string) {
  return !!(await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId, userId } }, select: { role: true } }));
}

/** Entra na campanha pelo código. Quem já é membro continua como está. */
export async function joinCampaign(code: string, userId: string) {
  const c = await previewInvite(code);
  if (!c) throw new CampaignError("Este convite não vale mais. Peça um link novo ao mestre.");
  const existing = await db.campaignMember.findUnique({ where: { campaignId_userId: { campaignId: c.id, userId } } });
  if (!existing) {
    await db.campaignMember.create({ data: { campaignId: c.id, userId, role: "player" } });
    await db.auditLog.create({ data: { userId, action: "campaign.join", entityType: "Campaign", entityId: c.id } });
  }
  return c.id;
}

export async function attachCharacter(campaignId: string, characterId: string, userId: string) {
  await membership(campaignId, userId);
  const [campaign, ch] = await Promise.all([
    db.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { rulesetId: true } }),
    db.character.findUnique({ where: { id: characterId }, select: { ownerId: true, rulesetId: true, campaignId: true } }),
  ]);
  if (!ch || ch.ownerId !== userId) throw new ForbiddenError("Personagem não encontrado.");
  if (ch.rulesetId !== campaign.rulesetId) throw new CampaignError("A ficha é de outro sistema de regras.");
  if (ch.campaignId && ch.campaignId !== campaignId) throw new CampaignError("A ficha já está em outra campanha. Tire-a de lá primeiro.");
  await db.character.update({ where: { id: characterId }, data: { campaignId } });
  await db.auditLog.create({ data: { userId, action: "campaign.attach_character", entityType: "Campaign", entityId: campaignId, diff: { characterId } } });
  publishCampaignEvent(campaignId, "party", userId);
}

/** Tira a ficha da campanha: o dono da ficha ou o mestre. */
export async function detachCharacter(campaignId: string, characterId: string, userId: string) {
  const me = await membership(campaignId, userId);
  const ch = await db.character.findUnique({ where: { id: characterId }, select: { ownerId: true, campaignId: true } });
  if (!ch || ch.campaignId !== campaignId) throw new ForbiddenError("Personagem não encontrado.");
  if (ch.ownerId !== userId && me.role !== "gm") throw new ForbiddenError("Só o dono da ficha ou o mestre pode tirá-la.");
  await db.character.update({ where: { id: characterId }, data: { campaignId: null } });
  await db.auditLog.create({ data: { userId, action: "campaign.detach_character", entityType: "Campaign", entityId: campaignId, diff: { characterId } } });
  publishCampaignEvent(campaignId, "party", userId);
}

/** Tira um jogador (pelo mestre) ou sai da campanha (o próprio jogador). As fichas dele saem junto. */
export async function removeMember(campaignId: string, memberId: string, userId: string) {
  const me = await membership(campaignId, userId);
  if (memberId !== userId && me.role !== "gm") throw new ForbiddenError("Só o mestre pode tirar jogadores.");
  const target = await membership(campaignId, memberId);
  if (target.role === "gm") throw new CampaignError("O mestre não sai da campanha; para encerrá-la, exclua a campanha.");
  await db.$transaction([
    db.character.updateMany({ where: { campaignId, ownerId: memberId }, data: { campaignId: null } }),
    db.campaignMember.delete({ where: { campaignId_userId: { campaignId, userId: memberId } } }),
    db.auditLog.create({
      data: { userId, action: memberId === userId ? "campaign.leave" : "campaign.remove_member", entityType: "Campaign", entityId: campaignId, diff: { memberId } },
    }),
  ]);
}

/** Gera um link novo; o antigo deixa de funcionar. */
export async function regenerateInvite(campaignId: string, userId: string) {
  await requireGm(campaignId, userId);
  await db.campaign.update({ where: { id: campaignId }, data: { inviteCode: newInviteCode() } });
}

/** Exclui a campanha. As fichas continuam com os donos; o homebrew da campanha é apagado. */
export async function deleteCampaign(campaignId: string, userId: string) {
  await requireGm(campaignId, userId);
  await db.$transaction([
    // Sem isto, o homebrew ficaria sem campanha e passaria a aparecer para todo mundo.
    db.contentEntry.deleteMany({ where: { campaignId } }),
    db.campaign.delete({ where: { id: campaignId } }),
    db.auditLog.create({ data: { userId, action: "campaign.delete", entityType: "Campaign", entityId: campaignId } }),
  ]);
}

export interface PartyMemberOverview {
  id: string;
  name: string;
  ownerName: string;
  ownerId: string;
  levelLabel: string;
  portrait?: string;
  hp: { current: number; max: number };
  secondary?: { key: string; label: string; current: number; max: number };
  sanity?: { current: number; max: number };
  defense: number | null;
  conditions: string[];
  prestige: number;
  xp: number;
}

/** Carrega o painel ao vivo do grupo para o Escudo do Mestre na campanha. */
export async function loadCampaignParty(campaignId: string, userId: string): Promise<PartyMemberOverview[]> {
  await membership(campaignId, userId);
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: {
      rulesetId: true,
      characters: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          level: true,
          ownerId: true,
          rulesetVersionId: true,
          data: true,
          owner: { select: { displayName: true } },
        },
      },
    },
  });
  if (!campaign.characters.length || !hasEngine(campaign.rulesetId)) return [];

  const engine = getEngine(campaign.rulesetId);
  const portraits = await portraitsFor(
    campaign.characters.map((c) => c.id),
    "portrait",
  );
  const versionIds = [...new Set(campaign.characters.map((c) => c.rulesetVersionId).filter((v): v is string => !!v))];
  const catalogs = new Map(
    await Promise.all(versionIds.map(async (vid) => [vid, await loadCatalog(campaign.rulesetId, vid, campaignId)] as const)),
  );
  const fallbackCatalog = await loadCatalog(campaign.rulesetId, undefined, campaignId);

  return campaign.characters.map((ch) => {
    const parsed = CharacterDataSchema.safeParse(ch.data);
    const data = parsed.success ? parsed.data : CharacterDataSchema.parse({});
    const catalog = (ch.rulesetVersionId && catalogs.get(ch.rulesetVersionId)) || fallbackCatalog;
    const derived = engine.derive(data, catalog);

    const numStat = (k: string) => {
      const val = derived.stats?.find((s) => s.key === k)?.value;
      const n = typeof val === "number" ? val : Number(val);
      return Number.isFinite(n) ? n : null;
    };

    const maxHp = Math.max(1, numStat("hp") ?? 10);
    const curHp = data.session.currentHp ?? maxHp;
    const spent = data.session.spent ?? {};

    let secondary: PartyMemberOverview["secondary"];
    const pdMax = numStat("pd");
    const mpMax = numStat("mp");
    if (pdMax !== null) {
      secondary = { key: "pd", label: "PD", max: pdMax, current: Math.max(0, pdMax - (spent.pd ?? 0)) };
    } else if (mpMax !== null) {
      const lbl = campaign.rulesetId === "ordem-paranormal-1e" ? "PE" : "PM";
      secondary = { key: "mp", label: lbl, max: mpMax, current: Math.max(0, mpMax - (spent.mp ?? 0)) };
    }

    const sanMax = numStat("san");
    const sanity =
      sanMax !== null ? { max: sanMax, current: Math.max(0, sanMax - (spent.san ?? 0)) } : undefined;

    const conditions = (data.session.conditions ?? []).map((id) => catalog.get(id)?.name ?? id);

    return {
      id: ch.id,
      name: ch.name || "Sem nome",
      ownerName: ch.owner.displayName,
      ownerId: ch.ownerId,
      levelLabel: engine.formatLevel ? engine.formatLevel(derived.level, data) : `Nível ${derived.level}`,
      portrait: portraits[ch.id],
      hp: { current: curHp, max: maxHp },
      secondary,
      sanity,
      defense: numStat("defense"),
      conditions,
      prestige: data.currency?.pp ?? 0,
      xp: data.experience ?? 0,
    };
  });
}
