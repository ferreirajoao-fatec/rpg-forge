import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

/**
 * Apaga as contas criadas pelos testes (personagens e avatares vão junto, em cascata) e as tentativas de
 * login/cadastro da execução, para que rodar os testes várias vezes não esbarre no limite de tentativas.
 * Roda o script pelo tsx porque o cliente do Prisma é ESM e o Playwright carrega este arquivo como CommonJS.
 */
export default function teardown() {
  execFileSync("pnpm", ["exec", "tsx", "scripts/db-cleanup.ts", "--e2e"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    // O .env fica na raiz do monorepo (no CI a variável DATABASE_URL já vem do ambiente).
    env: { ...process.env, DOTENV_CONFIG_PATH: "../../.env" },
  });
  if (existsSync("e2e/.auth")) rmSync("e2e/.auth", { recursive: true, force: true });
}
