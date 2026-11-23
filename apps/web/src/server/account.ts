import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { SESSION_COOKIE } from "@/server/auth/session";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class AccountError extends Error {}

export async function getAccountSummary(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : null;
  const now = new Date();

  const [user, charCount, campCount, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, createdAt: true },
    }),
    db.character.count({ where: { ownerId: userId } }),
    db.campaignMember.count({ where: { userId } }),
    db.session.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { id: true, tokenHash: true, createdAt: true, expiresAt: true },
    }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
    },
    counts: { characters: charCount, campaigns: campCount },
    sessions: sessions.map((s) => ({
      id: s.id,
      isCurrent: currentHash !== null && s.tokenHash === currentHash,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    })),
  };
}

export async function updateDisplayName(userId: string, displayName: string) {
  const clean = displayName.trim();
  if (clean.length < 2 || clean.length > 60) {
    throw new AccountError("O nome de exibição deve ter entre 2 e 60 caracteres.");
  }
  await db.user.update({ where: { id: userId }, data: { displayName: clean } });
  await db.auditLog.create({ data: { userId, action: "account.update_name", entityType: "User", entityId: userId } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) {
    throw new AccountError("A nova senha deve ter pelo menos 8 caracteres.");
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    throw new AccountError("A senha atual não confere.");
  }
  const nextHash = await hashPassword(newPassword);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : "";

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: nextHash } }),
    db.session.deleteMany({ where: { userId, tokenHash: { not: currentHash } } }),
    db.auditLog.create({ data: { userId, action: "account.change_password", entityType: "User", entityId: userId } }),
  ]);
}

export async function revokeOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : "";
  await db.session.deleteMany({ where: { userId, tokenHash: { not: currentHash } } });
  await db.auditLog.create({ data: { userId, action: "account.revoke_sessions", entityType: "User", entityId: userId } });
}
