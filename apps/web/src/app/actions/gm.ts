"use server";

import { z } from "zod";
import { rollTreasure, type TreasureResult } from "@rpg-forge/rules-engine/systems/tormenta20-gm";
import { requireUser } from "@/server/auth/dal";
import { loadTreasureTables } from "@/server/gm";

const input = z.object({ nd: z.number().min(0).max(40), mode: z.enum(["padrao", "metade", "dobro", "nenhum"]) });

/** Rola o tesouro no servidor, com gerador criptográfico, como as demais rolagens da plataforma. */
export async function rollTreasureAction(nd: number, mode: string): Promise<{ ok: true; result: TreasureResult } | { ok: false; error: string }> {
  await requireUser();
  const parsed = input.safeParse({ nd, mode });
  if (!parsed.success) return { ok: false, error: "ND ou modo de tesouro inválido." };
  const tables = await loadTreasureTables();
  if (!tables) return { ok: false, error: "As tabelas de tesouro não estão no catálogo. Importe o pacote 0.4.0 ou mais novo." };
  return { ok: true, result: rollTreasure(tables, parsed.data.nd, parsed.data.mode) };
}
