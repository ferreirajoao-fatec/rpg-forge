"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import {
  ConflictError,
  createCharacter,
  deleteCharacter,
  duplicateCharacter,
  ForbiddenError,
  importCharacter,
  ImportCharacterError,
  levelUpCharacter,
  loadWithAccess,
  LevelUpError,
  migrateCharacterCatalog,
  restoreCharacterVersion,
  saveCharacterData,
  saveCharacterSession,
  setPublicShare,
  snapshotCharacter,
} from "@/server/characters";
import { CampaignError } from "@/server/campaigns";
import { requestApproval } from "@/server/approvals";
import { hasEngine, type ValidationReport } from "@rpg-forge/rules-engine";
import { deletePortraitFiles } from "@/server/portraits";

export type CreateState = { errors?: Record<string, string[] | undefined>; message?: string } | undefined;

const CreateSchema = z.object({
  rulesetId: z.string().refine(hasEngine, "Escolha um sistema válido."),
  name: z.string().trim().max(80).default(""),
  randomize: z.string().optional(),
});

export async function createCharacterAction(_s: CreateState, formData: FormData): Promise<CreateState> {
  const user = await requireUser();
  const parsed = CreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const ch = await createCharacter(user.id, parsed.data.rulesetId, parsed.data.name, {
    randomize: parsed.data.randomize === "1",
  });
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

export type LevelUpResult = { ok: true; to: number } | { ok: false; error: string };

export async function levelUpAction(id: string, revision: number, experience?: number): Promise<LevelUpResult> {
  const user = await requireUser();
  try {
    const r = await levelUpCharacter(id, user.id, revision, experience);
    revalidatePath(`/app/personagens/${id}`);
    return { ok: true, to: r.plan.to };
  } catch (e) {
    if (e instanceof LevelUpError || e instanceof ConflictError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteCharacterAction(id: string) {
  const user = await requireUser();
  // Os arquivos dos retratos ficam no Blob: apaga antes, enquanto ainda dá para achá-los.
  await loadWithAccess(id, user.id, "write");
  await deletePortraitFiles(id);
  await deleteCharacter(id, user.id);
  redirect("/app");
}

export async function saveSessionAction(id: string, session: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await saveCharacterSession(id, user.id, session);
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Estado de sessão inválido." };
    throw e;
  }
}

export async function duplicateCharacterAction(id: string) {
  const user = await requireUser();
  const copy = await duplicateCharacter(id, user.id);
  revalidatePath("/app");
  redirect(`/app/personagens/${copy.id}`);
}

export async function importCharacterAction(rawJson: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const created = await importCharacter(user.id, rawJson);
    revalidatePath("/app");
    return { ok: true, id: created.id };
  } catch (e) {
    if (e instanceof ImportCharacterError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function migrateCharacterCatalogAction(id: string): Promise<{ ok: true; packVersion: string } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const r = await migrateCharacterCatalog(id, user.id);
    revalidatePath(`/app/personagens/${id}`);
    return { ok: true, packVersion: r.packVersion };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function togglePublicShareAction(id: string, enabled: boolean): Promise<{ ok: true; compositeToken: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const compositeToken = await setPublicShare(id, user.id, enabled);
    revalidatePath(`/app/personagens/${id}`);
    revalidatePath(`/app/personagens/${id}/ficha`);
    return { ok: true, compositeToken };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function requestApprovalAction(
  characterId: string,
  input: { slot: string; contentId: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await requestApproval(characterId, user.id, input);
    revalidatePath(`/app/personagens/${characterId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof CampaignError) return { ok: false, error: e.message };
    throw e;
  }
}
