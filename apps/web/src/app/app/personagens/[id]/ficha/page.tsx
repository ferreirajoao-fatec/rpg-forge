import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileDown, UserRound } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { ForbiddenError, getCharacter } from "@/server/characters";
import { portraitsFor } from "@/server/avatars";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { PrintButton } from "./print-button";
import { buildSheet } from "./sheet-data";
import { CharacterSheet } from "./sheet";

export const metadata: Metadata = { title: "Ficha do personagem" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function SheetPage({ params }: PageProps<"/app/personagens/[id]/ficha">) {
  const { id } = await params;
  const user = await requireUser();
  let loaded;
  try {
    loaded = await getCharacter(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const { record, data, catalog } = loaded;
  const sheet = buildSheet(data, record.rulesetId, catalog, user.displayName);
  const portrait = (await portraitsFor([record.id], "bust"))[record.id];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/app/personagens/${record.id}`} className={buttonVariants({ variant: "outline" })}>
          <ChevronLeft /> Voltar à edição
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/app/personagens/${record.id}/avatar`} className={buttonVariants({ variant: "outline" })}>
            <UserRound /> {portrait ? "Editar avatar" : "Criar avatar"}
          </Link>
          <a href={`/app/personagens/${record.id}/exportar`} download className={buttonVariants({ variant: "outline" })} title="Ficha e avatar num arquivo JSON">
            <FileDown /> Baixar ficha e avatar
          </a>
          <PrintButton />
        </div>
      </div>
      <CharacterSheet sheet={sheet} portrait={portrait} />
    </div>
  );
}
