/**
 * Lê assets/avatar/catalog.json e os SVGs, valida e gera src/generated/assets.ts.
 *   pnpm assets:build           gera o arquivo
 *   pnpm assets:build --check   só confere se o gerado está atualizado (usado nos testes)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildAssetModule } from "../src/asset-build";

const root = path.resolve(import.meta.dirname, "../../..");
const assetsDir = path.join(root, "assets/avatar");
const out = path.join(import.meta.dirname, "../src/generated/assets.ts");

const code = buildAssetModule(assetsDir, (file) => readFileSync(path.join(assetsDir, file), "utf8"));

if (process.argv.includes("--check")) {
  const current = readFileSync(out, "utf8");
  if (current !== code) {
    console.error("src/generated/assets.ts está desatualizado. Rode `pnpm assets:build`.");
    process.exit(1);
  }
  console.log("Assets do avatar atualizados.");
} else {
  writeFileSync(out, code);
  console.log(`Gerado ${path.relative(root, out)}`);
}
