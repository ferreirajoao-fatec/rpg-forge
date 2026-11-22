// Encerra servidores Next.js que sobraram DESTE projeto (ex.: depois de um terminal fechado à força),
// sem tocar em outros processos Node da máquina. Usado por `pnpm dev:clean`.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const norm = (s) => s.replaceAll("\\", "/").toLowerCase();
const rootKey = norm(root);

function listNodeProcesses() {
  if (process.platform === "win32") {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"],
      { encoding: "utf8" },
    ).trim();
    if (!out) return [];
    const list = JSON.parse(out);
    return (Array.isArray(list) ? list : [list]).map((p) => ({ pid: p.ProcessId, cmd: p.CommandLine ?? "" }));
  }
  return execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), cmd: m[2] }));
}

const mine = listNodeProcesses().filter(
  (p) => p.pid !== process.pid && norm(p.cmd).includes(rootKey) && /next[\\/]dist[\\/]/i.test(p.cmd),
);
for (const p of mine) {
  try {
    process.kill(p.pid);
    console.log(`Encerrado servidor Next antigo (PID ${p.pid}).`);
  } catch {
    // já tinha saído
  }
}
if (!mine.length) console.log("Nenhum servidor Next antigo deste projeto em execução.");
