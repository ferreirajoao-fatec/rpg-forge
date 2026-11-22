import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// No monorepo, o .env fica na raiz (compartilhado com o Prisma e os scripts).
// O Next só lê o .env da pasta do app; carregamos o da raiz sem sobrescrever variáveis já definidas.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
