"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { DiceFormulaError, roll } from "@/rules";

export type RollState =
  | { ok: true; id: string; formula: string; total: number; breakdown: string; label: string; createdAt: string }
  | { ok: false; error: string };

const RollSchema = z.object({
  formula: z.string().trim().min(1).max(120),
  label: z.string().trim().max(80).default(""),
});

/** A rolagem acontece no servidor (RNG criptográfico) para resultados confiáveis. */
export async function rollDiceAction(input: { formula: string; label?: string }): Promise<RollState> {
  const user = await requireUser();
  const parsed = RollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fórmula inválida." };
  try {
    const r = roll(parsed.data.formula);
    const saved = await db.diceRoll.create({
      data: {
        userId: user.id,
        formula: r.formula,
        label: parsed.data.label,
        total: r.total,
        breakdown: r.breakdown,
        detail: r.terms.map((t) => ({ term: t.term, rolls: t.rolls, kept: t.kept, subtotal: t.subtotal })),
      },
    });
    return { ok: true, id: saved.id, formula: r.formula, total: r.total, breakdown: r.breakdown, label: saved.label, createdAt: saved.createdAt.toISOString() };
  } catch (e) {
    if (e instanceof DiceFormulaError) return { ok: false, error: e.message };
    throw e;
  }
}
