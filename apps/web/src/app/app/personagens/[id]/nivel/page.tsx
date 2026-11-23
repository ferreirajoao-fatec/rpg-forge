import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { ForbiddenError, getCharacter } from "@/server/characters";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { LevelUp } from "./level-up";

export const metadata: Metadata = { title: "Subir de nível" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function LevelUpPage({ params }: PageProps<"/app/personagens/[id]/nivel">) {
  const { id } = await params;
  const user = await requireUser();
  let loaded;
  try {
    loaded = await getCharacter(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const { record, data, catalog, canEdit } = loaded;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/app/personagens/${record.id}`} className={buttonVariants({ variant: "outline" })}>
        <ChevronLeft /> Voltar à edição
      </Link>
      <LevelUp
        characterId={record.id}
        rulesetId={record.rulesetId}
        data={data}
        revision={record.revision}
        entries={catalog.all()}
        canEdit={canEdit}
      />
    </div>
  );
}
