import { defineConfig } from "vitest/config";

// Roda os testes de todos os pacotes do monorepo: `pnpm test`.
export default defineConfig({
  test: { projects: ["apps/*/vitest.config.mts", "packages/*/vitest.config.mts"] },
});
