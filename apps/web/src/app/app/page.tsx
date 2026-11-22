import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UserRound } from "lucide-react";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { SeverityBadge } from "@/components/validation";
import { requireUser } from "@/server/auth/dal";
import { listCharacters } from "@/server/characters";
import { portraitsFor } from "@/server/avatars";
import { getEngine, hasEngine, type ValidationReport } from "@rpg-forge/rules-engine";

export const metadata: Metadata = { title: "Personagens" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

const STATUS_LABEL = { draft: "Rascunho", active: "Ativo", retired: "Aposentado" } as const;

export default async function Dashboard() {
  const user = await requireUser();
  const characters = await listCharacters(user.id);
  const portraits = await portraitsFor(characters.map((c) => c.id));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Seus personagens</h1>
          <p className="mt-1 text-sm text-muted-foreground">Rascunhos são salvos automaticamente enquanto você edita.</p>
        </div>
        <Link href="/app/personagens/novo" className={buttonVariants()}>
          <Plus /> Novo personagem
        </Link>
      </div>

      {characters.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed p-10 text-center">
          <UserRound className="mx-auto size-8 text-gold" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Nenhum personagem ainda</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Comece pelo assistente: ele explica cada passo e avisa se alguma escolha não for permitida.
          </p>
          <Link href="/app/personagens/novo" className={buttonVariants({ className: "mt-5" })}>
            Criar meu primeiro personagem
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => {
            const report = c.validation as ValidationReport | null;
            return (
              <li key={c.id}>
                <Link
                  href={`/app/personagens/${c.id}`}
                  className="block h-full rounded-lg border bg-card p-4 transition-colors hover:border-gold/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start gap-3">
                    {portraits[c.id] ? (
                      <span className="block size-14 shrink-0 overflow-hidden rounded-full border bg-muted [&>svg]:size-full" aria-hidden dangerouslySetInnerHTML={{ __html: portraits[c.id] }} />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-full border bg-muted font-heading text-lg text-muted-foreground" aria-hidden>
                        {(c.name || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-semibold">{c.name || "Sem nome"}</h2>
                        {report && <SeverityBadge status={report.status} />}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hasEngine(c.rulesetId) ? getEngine(c.rulesetId).meta.name : c.rulesetId} · Nível {c.level}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {STATUS_LABEL[c.status]} · atualizado em {c.updatedAt.toLocaleDateString("pt-BR")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
