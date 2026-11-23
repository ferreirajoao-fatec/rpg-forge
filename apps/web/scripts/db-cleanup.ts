/**
 * Limpeza periódica do banco:
 *   pnpm db:cleanup             apaga
 *   pnpm db:cleanup --dry-run   só conta
 *   (--e2e)                     usado pelos testes de ponta a ponta: apaga as contas "e2e-…@rpgforge.test"
 *                               e as tentativas de login/cadastro dos últimos 30 minutos
 *
 * Remove sessões vencidas e os registros de tentativas de login/cadastro (rate limit) com mais de 1 dia.
 * O restante do AuditLog (histórico de ações) é mantido.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/** As ações gravadas pelo limitador (apps/web/src/server/auth/rate-limit.ts). */
const RATE_LIMIT_ACTIONS = ["auth.login_failed", "auth.signup_attempt"];
const RATE_LIMIT_KEEP_MS = 24 * 60 * 60_000;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const dryRun = process.argv.includes("--dry-run");
  const now = new Date();
  const sessions = { where: { expiresAt: { lt: now } } };
  const attempts = { where: { action: { in: RATE_LIMIT_ACTIONS }, createdAt: { lt: new Date(now.getTime() - RATE_LIMIT_KEEP_MS) } } };
  try {
    if (process.argv.includes("--e2e")) {
      const e2eUsers = { email: { startsWith: "e2e-", endsWith: "@rpgforge.test" } };
      // Campanhas do mestre de teste antes das contas (a relação com o dono não apaga em cascata);
      // o homebrew delas primeiro, para não ficar órfão e virar conteúdo global.
      const owned = { owner: e2eUsers };
      await db.contentEntry.deleteMany({ where: { campaign: owned } });
      await db.campaign.deleteMany({ where: owned });
      const users = await db.user.deleteMany({ where: e2eUsers });
      await db.auditLog.deleteMany({ where: { action: { in: RATE_LIMIT_ACTIONS }, createdAt: { gte: new Date(now.getTime() - 30 * 60_000) } } });
      console.log(`Limpeza dos testes: ${users.count} conta(s) de teste apagada(s).`);
      return;
    }
    if (dryRun) {
      const [s, a] = await Promise.all([db.session.count(sessions), db.auditLog.count(attempts)]);
      console.log(`Seriam apagados: ${s} sessão(ões) vencida(s) e ${a} registro(s) antigo(s) de tentativas.`);
      return;
    }
    const [s, a] = await db.$transaction([db.session.deleteMany(sessions), db.auditLog.deleteMany(attempts)]);
    console.log(`Apagados: ${s.count} sessão(ões) vencida(s) e ${a.count} registro(s) antigo(s) de tentativas.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
