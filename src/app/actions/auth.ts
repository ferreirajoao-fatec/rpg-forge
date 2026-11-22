"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";

export type AuthState = { errors?: Record<string, string[] | undefined>; message?: string } | undefined;

const SignupSchema = z.object({
  displayName: z.string().trim().min(2, "Use pelo menos 2 caracteres.").max(50),
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  password: z
    .string()
    .min(10, "Use pelo menos 10 caracteres.")
    .max(200)
    .regex(/[a-zA-Z]/, "Inclua pelo menos uma letra.")
    .regex(/[0-9]/, "Inclua pelo menos um número."),
});

const LoginSchema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  password: z.string().min(1, "Informe a senha."),
});

// Hash fictício para igualar o tempo de resposta quando o usuário não existe.
const DUMMY_HASH_PROMISE = hashPassword("dummy-password-for-timing");

export async function signup(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const { displayName, email, password } = parsed.data;

  const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { message: "Não foi possível criar a conta com esses dados. Se você já tem conta, entre." };

  const user = await db.user.create({ data: { displayName, email, passwordHash: await hashPassword(password) } });
  await db.auditLog.create({ data: { userId: user.id, action: "user.signup", entityType: "User", entityId: user.id } });
  await createSession(user.id);
  redirect("/app");
}

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const { email, password } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH_PROMISE));
  if (!user || !ok) return { message: "E-mail ou senha incorretos." };

  await createSession(user.id);
  redirect("/app");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
