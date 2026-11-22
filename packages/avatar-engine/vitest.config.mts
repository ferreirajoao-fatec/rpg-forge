import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "avatar-engine", include: ["src/**/*.test.ts"], environment: "node" },
});
