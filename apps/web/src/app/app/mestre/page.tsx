import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/dal";
import { GM_RULESET, GM_RULESETS, loadGmCampaignParties, loadGmData, type GmRulesetId } from "@/server/gm";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { GmTools } from "./gm-tools";
import { OpGmTools } from "./op-gm-tools";
import { DndGmTools } from "./dnd-gm-tools";

export const metadata: Metadata = { title: "Ferramentas do mestre" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

const SYSTEM_TABS: { id: GmRulesetId; label: string; importCmd: string }[] = [
  { id: "tormenta20-2020", label: "Tormenta20 (2020)", importCmd: "pnpm content:import content/tormenta20-2020/pack.ts" },
  { id: "ordem-paranormal-1e", label: "Ordem Paranormal RPG", importCmd: "pnpm content:import content/ordem-paranormal-1e/pack.ts" },
  { id: "dnd5e-2014", label: "D&D 5e (2014)", importCmd: "pnpm content:import content/dnd5e-2014/pack.ts" },
];

export default async function GmPage({ searchParams }: PageProps<"/app/mestre">) {
  const user = await requireUser();
  const { sistema } = await searchParams;
  const active: GmRulesetId =
    typeof sistema === "string" && (GM_RULESETS as readonly string[]).includes(sistema) ? (sistema as GmRulesetId) : GM_RULESET;
  const [data, parties] = await Promise.all([loadGmData(active), loadGmCampaignParties(user.id, active)]);
  const meta = SYSTEM_TABS.find((t) => t.id === active) ?? SYSTEM_TABS[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ferramentas do mestre</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {active === "ordem-paranormal-1e"
              ? "Monte combates por Valor de Desafio (VD × NEX), calcule Pontos de Prestígio da missão e consulte ameaças, perigos, regras e condições."
              : "Monte combates com o nível de desafio e a experiência calculados pelas regras do livro, role o tesouro e consulte ameaças, perigos, regras e condições."}
          </p>
        </div>
        <nav aria-label="Sistema das ferramentas do mestre" className="flex flex-wrap gap-1.5">
          {SYSTEM_TABS.map((t) => (
            <Link
              key={t.id}
              href={t.id === GM_RULESET ? "/app/mestre" : `/app/mestre?sistema=${t.id}`}
              aria-current={active === t.id ? "page" : undefined}
              className={buttonVariants({ variant: active === t.id ? "default" : "outline", size: "sm" })}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {data && (data.creatures.length > 0 || active === "dnd5e-2014") ? (
        active === "ordem-paranormal-1e" ? (
          <OpGmTools creatures={data.creatures} entries={data.entries} packVersion={data.packVersion} parties={parties} />
        ) : active === "dnd5e-2014" ? (
          <DndGmTools entries={data.entries} packVersion={data.packVersion} parties={parties} />
        ) : (
          <GmTools creatures={data.creatures} entries={data.entries} packVersion={data.packVersion} parties={parties} />
        )
      ) : (
        <p className="rounded-lg border bg-card p-5 text-sm">
          O catálogo atual de <strong>{meta.label}</strong> ainda não foi importado no banco. Importe com{" "}
          <code className="font-mono">{meta.importCmd}</code>.
        </p>
      )}
    </div>
  );
}
