import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { db } from "@/server/db";

export const SESSION_COOKIE = "rf_session";
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  // Aproveita o login para apagar as sessões vencidas desta conta (a limpeza geral é `pnpm db:cleanup`).
  await db.$transaction([
    db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }),
    db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } }),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

/** Sessão verificada no banco (memoizada por requisição). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, displayName: true } } },
  });
  if (!session) return null;
  // A validade depende do relógio: só pode ser avaliada no momento da requisição.
  await connection();
  if (session.expiresAt < new Date()) return null;
  return session.user;
});
