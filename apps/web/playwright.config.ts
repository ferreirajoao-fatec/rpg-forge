import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta: abrem o app num navegador de verdade, contra o build de produção.
 *   pnpm build && pnpm test:e2e
 * Usa o banco do .env (local: o Postgres do Docker). Cria uma conta "e2e-…@rpgforge.test" e apaga no fim.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "pt-BR" },
  globalTeardown: "./e2e/teardown.ts",
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" }, dependencies: ["setup"] },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/entrar`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
