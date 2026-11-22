import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta: abrem o app num navegador de verdade, contra o build de produção.
 *   pnpm build && pnpm test:e2e
 * Contra um site publicado (não sobe servidor local):
 *   PLAYWRIGHT_BASE_URL=https://… pnpm test:e2e   (com DATABASE_URL do banco desse site, para a limpeza)
 * Usa o banco do .env (local: o Postgres do Docker). Cria uma conta "e2e-…@rpgforge.test" e apaga no fim.
 */
const PORT = 3100;
const EXTERNAL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: EXTERNAL ?? `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "pt-BR" },
  globalTeardown: "./e2e/teardown.ts",
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" }, dependencies: ["setup"] },
  ],
  webServer: EXTERNAL
    ? undefined
    : {
        command: `pnpm exec next start -p ${PORT}`,
        url: `http://localhost:${PORT}/entrar`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
