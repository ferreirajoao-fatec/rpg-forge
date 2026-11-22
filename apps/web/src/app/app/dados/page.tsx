import type { Metadata } from "next";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { DiceRoller } from "./roller";

export const metadata: Metadata = { title: "Dados" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function DicePage() {
  const user = await requireUser();
  const history = await db.diceRoll.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, formula: true, total: true, breakdown: true, label: true, createdAt: true },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Rolagem de dados</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        As rolagens são feitas no servidor com gerador criptográfico e ficam registradas no seu histórico.
      </p>
      <DiceRoller initialHistory={history.map((h) => ({ ...h, ok: true as const, createdAt: h.createdAt.toISOString() }))} />
    </div>
  );
}
