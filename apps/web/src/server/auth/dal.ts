import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";

/** Exige usuário autenticado; redireciona para o login caso contrário. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  return user;
}
