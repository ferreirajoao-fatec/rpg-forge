"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import {
  ConflictError,
  createCharacter,
  deleteCharacter,
  ForbiddenError,
  restoreCharacterVersion,
  saveCharacterData,
  snapshotCharacter,
} from "@/server/characters";
import { hasEngine, type ValidationReport } from "@/rules";

export type CreateState = { errors?: Record<string, string[] | undefined>; message?: string } | undefined;

const CreateSchema = z.object({
  rulesetId: z.string().refine(hasEngine, "Escolha um sistema válido."),
  name: z.string().trim().max(80).default(""),
});

export async function createCharacterAction(_s: CreateState, formData: FormData): Promise<CreateState> {
  const user = await requireUser();
  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const ch = await createCharacter(user.id, parsed.data.rulesetId, parsed.data.name);
  redirect(`/app/personagens/${ch.id}`);
}

export type SaveResult =
  | { ok: true; revision: number; validation: ValidationReport; savedAt: string }
  | { ok: false; error: string; conflict?: boolean };

export async function saveCharacterAction(id: string, data: unknown, revision: number): Promise<SaveResult> {
  const user = await requireUser();
  try {
    const r = await saveCharacterData(id, user.id, data, revision);
    return { ok: true, revision: r.revision, validation: r.validation, savedAt: new Date().toISOString() };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: e.message, conflict: true };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Dados da ficha inválidos." };
    throw e;
  }
}

export async function snapshotAction(id: string, summary: string) {
  const user = await requireUser();
  await snapshotCharacter(id, user.id, "edit", summary.slice(0, 200) || "Ponto de salvamento manual");
  revalidatePath(`/app/personagens/${id}`);
}

export async function restoreVersionAction(id: string, versionNumber: number) {
  const user = await requireUser();
  await restoreCharacterVersion(id, user.id, versionNumber);
  revalidatePath(`/app/personagens/${id}`);
}

export async function deleteCharacterAction(id: string) {
  const user = await requireUser();
  await deleteCharacter(id, user.id);
  redirect("/app");
}
