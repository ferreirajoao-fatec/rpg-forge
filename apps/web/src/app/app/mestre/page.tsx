import type { Metadata } from "next";
import { requireUser } from "@/server/auth/dal";
import { loadGmData } from "@/server/gm";
import { GmTools } from "./gm-tools";

export const metadata: Metadata = { title: "Ferramentas do mestre" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function GmPage() {
  await requireUser();
  const data = await loadGmData();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Ferramentas do mestre</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monte combates com o nível de desafio e a experiência calculados pelas regras do livro, role o tesouro e consulte ameaças, perigos,
          regras e condições. Disponível para Tormenta20 (livro básico de 2020).
        </p>
      </div>
      {data && data.creatures.length > 0 ? (
        <GmTools creatures={data.creatures} entries={data.entries} packVersion={data.packVersion} />
      ) : (
        <p className="rounded-lg border bg-card p-5 text-sm">
          O catálogo atual não traz o conteúdo do mestre. Importe o pacote do Tormenta20 0.4.0 ou mais novo com{" "}
          <code className="font-mono">pnpm content:import content/tormenta20-2020/pack.ts</code>.
        </p>
      )}
    </div>
  );
}
