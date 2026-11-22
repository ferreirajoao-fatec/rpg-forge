"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AvatarConfig } from "@rpg-forge/avatar-engine";
import { requireUser } from "@/server/auth/dal";
import { ConflictError, ForbiddenError } from "@/server/characters";
import { deletePreset, listPresets, restoreAvatar, saveAvatar, savePreset, snapshotAvatar } from "@/server/avatars";

export type AvatarResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean };

async function guard<T extends object>(fn: () => Promise<T>): Promise<AvatarResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: e.message, conflict: true };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Configuração de avatar inválida." };
    throw e;
  }
}

const refresh = (id: string) => {
  revalidatePath(`/app/personagens/${id}/avatar`);
  revalidatePath(`/app/personagens/${id}/ficha`);
  revalidatePath("/app");
};

export async function saveAvatarAction(characterId: string, config: unknown, revision: number) {
  const user = await requireUser();
  const r = await guard(async () => ({ ...(await saveAvatar(characterId, user.id, config, revision)), savedAt: new Date().toISOString() }));
  if (r.ok) refresh(characterId);
  return r;
}

export async function snapshotAvatarAction(characterId: string, label: string) {
  const user = await requireUser();
  return guard(async () => {
    const rev = await snapshotAvatar(characterId, user.id, label);
    return { revision: { number: rev.number, label: rev.label, createdAt: rev.createdAt } };
  });
}

export async function restoreAvatarAction(characterId: string, number: number): Promise<AvatarResult<{ config: AvatarConfig; revision: number }>> {
  const user = await requireUser();
  const r = await guard(() => restoreAvatar(characterId, user.id, number));
  if (r.ok) refresh(characterId);
  return r;
}

export async function listPresetsAction() {
  const user = await requireUser();
  return listPresets(user.id);
}

export async function savePresetAction(name: string, config: unknown) {
  const user = await requireUser();
  return guard(async () => {
    const p = await savePreset(user.id, name, config);
    return { preset: { id: p.id, name: p.name } };
  });
}

export async function deletePresetAction(id: string) {
  const user = await requireUser();
  return guard(async () => {
    await deletePreset(user.id, id);
    return {};
  });
}
