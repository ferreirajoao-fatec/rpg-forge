import type { Metadata } from "next";
import { requireUser } from "@/server/auth/dal";
import { listCampaigns } from "@/server/campaigns";
import { db } from "@/server/db";
import { DiceRoller } from "./roller";

export const metadata: Metadata = { title: "Dados" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function DicePage() {
  const user = await requireUser();
  const [history, campaigns] = await Promise.all([
    db.diceRoll.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, formula: true, total: true, breakdown: true, label: true, shared: true, campaignId: true, createdAt: true },
    }),
    listCampaigns(user.id),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Rolagem de dados</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        As rolagens são feitas no servidor com gerador criptográfico e ficam registradas no seu histórico (ou compartilhadas na campanha escolhida).
      </p>
      <DiceRoller
        initialHistory={history.map((h) => ({ ...h, ok: true as const, createdAt: h.createdAt.toISOString() }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
