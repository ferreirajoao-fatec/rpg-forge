"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/dal";
import { ForbiddenError } from "@/server/characters";
import { deletePortrait, generatePortrait, PortraitError, remainingToday, setActivePortrait, type PortraitView } from "@/server/portraits";

export type PortraitResult = { ok: true; portrait?: PortraitView; remaining?: number } | { ok: false; error: string; remaining?: number };

/** Erros esperados viram mensagem para a tela; o resto sobe para a tela de erro. */
async function run(characterId: string, fn: () => Promise<Omit<Extract<PortraitResult, { ok: true }>, "ok"> | void>): Promise<PortraitResult> {
  try {
    const r = await fn();
    revalidatePath(`/app/personagens/${characterId}`, "layout");
    return { ok: true, ...(r ?? {}) };
  } catch (e) {
    if (e instanceof PortraitError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function generatePortraitAction(characterId: string, input: { style: string; description: string; reference?: string }) {
  const user = await requireUser();
  const r = await run(characterId, () => generatePortrait(characterId, user.id, input));
  // A tentativa que falhou também conta no limite: devolve o saldo para a tela.
  return r.ok ? r : { ...r, remaining: await remainingToday(user.id) };
}

export async function setActivePortraitAction(characterId: string, portraitId: string | null) {
  const user = await requireUser();
  return run(characterId, () => setActivePortrait(characterId, user.id, portraitId));
}

export async function deletePortraitAction(characterId: string, portraitId: string) {
  const user = await requireUser();
  return run(characterId, () => deletePortrait(characterId, user.id, portraitId));
}
