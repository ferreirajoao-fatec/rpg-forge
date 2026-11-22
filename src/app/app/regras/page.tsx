import type { Metadata } from "next";
import { listEngines } from "@/rules";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Regras e fontes" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function RulesPage() {
  const engines = listEngines();
  const versions = await db.rulesetVersion.findMany({
    where: { isCurrent: true },
    include: { _count: { select: { entries: true } } },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">Regras e fontes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A plataforma só usa conteúdo cuja reprodução é permitida. Toda regra registra fonte, edição e versão.
      </p>
      <div className="mt-6 space-y-4">
        {engines.map((e) => {
          const v = versions.find((x) => x.rulesetId === e.meta.id);
          return (
            <section key={e.meta.id} className="rounded-lg border bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{e.meta.name}</h2>
                <span className="text-xs text-muted-foreground">{e.meta.publisher}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Situação dos dados</dt>
                  <dd>
                    {e.meta.dataAvailability === "licensed"
                      ? `Licença aberta (${e.meta.sources.map((s) => s.license).join(", ")})`
                      : "Requer importação autorizada"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Catálogo importado</dt>
                  <dd>{v ? `Versão ${v.packVersion} · ${v._count.entries} entradas` : "Nenhum pacote importado"}</dd>
                </div>
              </dl>
              {e.meta.sources.length > 0 && (
                <ul className="mt-3 text-sm">
                  {e.meta.sources.map((s) => (
                    <li key={s.id}>
                      {s.url ? <a href={s.url} className="text-gold underline-offset-4 hover:underline" rel="noreferrer" target="_blank">{s.title}</a> : s.title} · {s.license}
                    </li>
                  ))}
                </ul>
              )}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {e.meta.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
