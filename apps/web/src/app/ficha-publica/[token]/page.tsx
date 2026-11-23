import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { portraitsFor } from "@/server/avatars";
import { getPublicCharacterByToken } from "@/server/characters";
import { buildSheet } from "@/app/app/personagens/[id]/ficha/sheet-data";
import { CharacterSheet } from "@/app/app/personagens/[id]/ficha/sheet";
import { PrintButton } from "@/app/app/personagens/[id]/ficha/print-button";

export const metadata: Metadata = { title: "Ficha pública — RPG Forge" };

/** Rota dinâmica pública: valida token secreto por requisição. */
export const instant = false;

export default async function PublicSheetPage({ params }: PageProps<"/ficha-publica/[token]">) {
  const { token } = await params;
  const loaded = await getPublicCharacterByToken(decodeURIComponent(token));
  if (!loaded) notFound();

  const { record, data, catalog, playerName } = loaded;
  const sheet = buildSheet(data, record.rulesetId, catalog, playerName);
  const portrait = (await portraitsFor([record.id], "bust"))[record.id];

  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm print:hidden">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Eye className="size-4 text-gold" aria-hidden />
          <span>
            Visualização pública (somente leitura) ·{" "}
            <Link href="/" className="font-medium text-foreground underline-offset-4 hover:underline">
              RPG Forge
            </Link>
          </span>
        </div>
        <PrintButton />
      </div>
      <CharacterSheet sheet={sheet} portrait={portrait} />
    </main>
  );
}
