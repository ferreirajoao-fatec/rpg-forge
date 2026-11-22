import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente. */
export const instant = false;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/app");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center font-heading text-xl font-semibold text-gold">
          RPG Forge
        </Link>
        <div className="rounded-lg border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
