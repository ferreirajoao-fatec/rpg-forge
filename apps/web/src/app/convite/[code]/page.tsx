import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { getEngine, hasEngine } from "@rpg-forge/rules-engine";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { getCurrentUser } from "@/server/auth/session";
import { isMember, previewInvite } from "@/server/campaigns";
import { JoinButton } from "./join-button";

export const metadata: Metadata = { title: "Convite para campanha", robots: { index: false } };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente. */
export const instant = false;

/** Página pública do link de convite: mostra a campanha e leva ao login ou à entrada. */
export default async function InvitePage({ params }: PageProps<"/convite/[code]">) {
  const { code } = await params;
  const [invite, user] = await Promise.all([previewInvite(code), getCurrentUser()]);
  const member = invite && user ? await isMember(invite.id, user.id) : false;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 block text-center font-heading text-xl font-semibold text-gold">
          RPG Forge
        </Link>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          {!invite ? (
            <>
              <h1 className="text-xl font-semibold">Convite inválido</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Este link não vale mais: o mestre pode ter gerado um novo ou excluído a campanha. Peça o link atualizado.
              </p>
              <Link href={user ? "/app" : "/"} className={buttonVariants({ variant: "outline", className: "mt-5" })}>
                {user ? "Ir para meus personagens" : "Página inicial"}
              </Link>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Convite para campanha</p>
              <h1 className="mt-1 text-xl font-semibold">{invite.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasEngine(invite.rulesetId) ? getEngine(invite.rulesetId).meta.name : invite.rulesetId} · mestre: {invite.owner.displayName}
              </p>
              {invite.description && <p className="mt-3 text-sm whitespace-pre-line">{invite.description}</p>}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden /> {invite._count.members} pessoa(s) na mesa
              </p>
              <div className="mt-5">
                {member ? (
                  <>
                    <p className="text-sm">Você já está nesta campanha.</p>
                    <Link href={`/app/campanhas/${invite.id}`} className={buttonVariants({ className: "mt-3" })}>
                      Abrir a campanha
                    </Link>
                  </>
                ) : user ? (
                  <JoinButton code={code} />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/entrar?convite=${code}`} className={buttonVariants()}>
                      Entrar para aceitar
                    </Link>
                    <Link href={`/cadastro?convite=${code}`} className={buttonVariants({ variant: "outline" })}>
                      Criar conta
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
