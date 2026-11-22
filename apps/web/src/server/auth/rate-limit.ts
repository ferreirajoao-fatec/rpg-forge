import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/server/db";

/**
 * Limite de tentativas de login e cadastro, guardado no AuditLog (funciona com várias instâncias
 * do servidor). Só o hash do e-mail e do IP é gravado, nunca os valores.
 */
const RULES = {
  /** Falhas de login por e-mail: protege uma conta contra adivinhação de senha. */
  loginEmail: { action: "auth.login_failed", entityType: "LoginEmail", max: 5, windowMs: 15 * 60_000 },
  /** Falhas de login por IP: barra quem testa muitas contas diferentes. */
  loginIp: { action: "auth.login_failed", entityType: "LoginIp", max: 20, windowMs: 15 * 60_000 },
  /** Cadastros por IP. */
  signupIp: { action: "auth.signup_attempt", entityType: "SignupIp", max: 5, windowMs: 60 * 60_000 },
} as const;
type Rule = keyof typeof RULES;

const hash = (value: string) => createHash("sha256").update(`rpg-forge:${value}`).digest("hex");

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** true quando ainda há tentativas disponíveis para todas as chaves informadas. */
export async function underLimit(checks: [Rule, string][]): Promise<boolean> {
  const counts = await Promise.all(
    checks.map(([rule, value]) => {
      const r = RULES[rule];
      return db.auditLog.count({
        where: { action: r.action, entityType: r.entityType, entityId: hash(value), createdAt: { gte: new Date(Date.now() - r.windowMs) } },
      });
    }),
  );
  return counts.every((n, i) => n < RULES[checks[i][0]].max);
}

export async function recordAttempt(checks: [Rule, string][]): Promise<void> {
  await db.auditLog.createMany({
    data: checks.map(([rule, value]) => ({ action: RULES[rule].action, entityType: RULES[rule].entityType, entityId: hash(value) })),
  });
}

export const TOO_MANY = "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
