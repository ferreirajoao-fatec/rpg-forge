"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/dal";
import { AccountError, changePassword, revokeOtherSessions, updateDisplayName } from "@/server/account";

export type AccountActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function updateDisplayNameAction(displayName: string): Promise<AccountActionResult> {
  const user = await requireUser();
  try {
    await updateDisplayName(user.id, displayName);
    revalidatePath("/app", "layout");
    revalidatePath("/app/conta");
    return { ok: true, message: "Nome atualizado." };
  } catch (e) {
    if (e instanceof AccountError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function changePasswordAction(currentPassword: string, newPassword: string): Promise<AccountActionResult> {
  const user = await requireUser();
  try {
    await changePassword(user.id, currentPassword, newPassword);
    revalidatePath("/app/conta");
    return { ok: true, message: "Senha alterada. Outras sessões foram encerradas." };
  } catch (e) {
    if (e instanceof AccountError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function revokeOtherSessionsAction(): Promise<AccountActionResult> {
  const user = await requireUser();
  await revokeOtherSessions(user.id);
  revalidatePath("/app/conta");
  return { ok: true, message: "Outras sessões encerradas." };
}
