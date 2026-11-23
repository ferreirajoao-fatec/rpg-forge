import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { getAccountSummary } from "@/server/account";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: "Minha conta" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente. */
export const instant = false;

export default async function AccountPage() {
  const user = await requireUser();
  const summary = await getAccountSummary(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app" className={buttonVariants({ variant: "outline" })}>
        <ChevronLeft /> Personagens
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Minha conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gerencie seu nome de exibição, senha e sessões conectadas.</p>
      </header>
      <AccountForm
        initialDisplayName={summary.user.displayName}
        email={summary.user.email}
        counts={summary.counts}
        sessions={summary.sessions}
      />
    </div>
  );
}
