import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { ForbiddenError, getCharacter } from "@/server/characters";
import { buttonVariants } from "@/components/ui/button";
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/app/personagens/${record.id}`} className={buttonVariants({ variant: "outline" })}>
          <ChevronLeft /> Voltar à edição
        </Link>
        <PrintButton />
      </div>
      <CharacterSheet sheet={sheet} />
    </div>
  );
}
