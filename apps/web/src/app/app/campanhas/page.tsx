import type { Metadata } from "next";
import Link from "next/link";
import { Crown, Swords, Users } from "lucide-react";
import { getEngine, hasEngine, listEngines } from "@rpg-forge/rules-engine";
import { requireUser } from "@/server/auth/dal";
import { listCampaigns } from "@/server/campaigns";
import { NewCampaignForm } from "./new-campaign-form";

export const metadata: Metadata = { title: "Campanhas" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function CampaignsPage() {
  const user = await requireUser();
  const campaigns = await listCampaigns(user.id);
  const systems = listEngines().map((e) => ({ id: e.meta.id, name: e.meta.name }));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="campanhas-title">
        <h1 id="campanhas-title" className="text-2xl font-semibold">
          Campanhas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mesas que você mestra ou joga. Para entrar na mesa de outra pessoa, abra o link de convite que o mestre mandou.
        </p>
        {campaigns.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
            <Swords className="mx-auto size-8 text-gold" aria-hidden />
            <h2 className="mt-3 text-lg font-semibold">Nenhuma campanha ainda</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Crie uma ao lado e mande o link de convite para os jogadores. Eles entram e vinculam as fichas na hora.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/campanhas/${c.id}`}
                  className="block h-full rounded-lg border bg-card p-4 transition-colors hover:border-gold/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{c.name}</h2>
                    {c.role === "gm" && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-xs text-gold">
                        <Crown className="size-3" aria-hidden /> Mestre
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{hasEngine(c.rulesetId) ? getEngine(c.rulesetId).meta.name : c.rulesetId}</p>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" aria-hidden /> {c._count.members} na mesa · {c._count.characters} ficha(s)
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-labelledby="nova-title" className="rounded-lg border bg-card p-5 lg:self-start">
        <h2 id="nova-title" className="text-base font-semibold">
          Nova campanha
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Você será o mestre. As fichas precisam ser do mesmo sistema da campanha.</p>
        <NewCampaignForm systems={systems} />
      </aside>
    </div>
  );
}
