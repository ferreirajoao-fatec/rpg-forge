/**
 * Baixa o 5e-database (SRD 5.1 e 5.2.1 em JSON, licença MIT; textos do SRD sob CC-BY-4.0)
 * no commit fixado abaixo, para .cache/srd/. Uso: pnpm srd:fetch
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const SRD_COMMIT = "a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f";
export const SRD_DIR = path.resolve(".cache/srd/5e-database");

async function main() {
  if (existsSync(path.join(SRD_DIR, "COMMIT"))) {
    console.log(`Já baixado em ${SRD_DIR}.`);
    return;
  }
  const base = path.dirname(SRD_DIR);
  mkdirSync(base, { recursive: true });
  const url = `https://codeload.github.com/5e-bits/5e-database/tar.gz/${SRD_COMMIT}`;
  console.log(`Baixando ${url}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar: HTTP ${res.status}`);
  const tarball = path.join(base, "db.tar.gz");
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xzf", "db.tar.gz"], { cwd: base }); // caminho relativo: o tar do Git Bash lê "C:" como host remoto
  rmSync(tarball);
  const extracted = path.join(base, `5e-database-${SRD_COMMIT}`);
  if (existsSync(SRD_DIR)) rmSync(SRD_DIR, { recursive: true, force: true });
  renameSync(extracted, SRD_DIR);
  writeFileSync(path.join(SRD_DIR, "COMMIT"), SRD_COMMIT);
  console.log(`Pronto: ${SRD_DIR}`);
}

if (process.argv[1]?.endsWith("fetch.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
