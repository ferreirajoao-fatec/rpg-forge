import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ScrollText } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { ForbiddenError } from "@/server/characters";
import { getAvatar, listPresets } from "@/server/avatars";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { AvatarStudio } from "./studio";

export const metadata: Metadata = { title: "Avatar Studio" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function AvatarPage({ params }: PageProps<"/app/personagens/[id]/avatar">) {
  const { id } = await params;
  const user = await requireUser();
  let loaded;
  try {
    loaded = await getAvatar(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const presets = loaded.canEdit ? await listPresets(user.id) : [];
  const name = loaded.character.name || "Personagem sem nome";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/app/personagens/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ChevronLeft /> Voltar à ficha
          </Link>
          <Link href={`/app/personagens/${id}/ficha`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ScrollText /> Ver ficha pronta
          </Link>
        </div>
        <h1 className="font-heading text-xl font-semibold">Aparência de {name}</h1>
      </div>
      <AvatarStudio
        characterId={id}
        characterName={name}
        canEdit={loaded.canEdit}
        saved={loaded.saved}
        initialConfig={loaded.config}
        initialRevision={loaded.revision}
        initialRevisions={loaded.revisions.map((r) => ({ number: r.number, label: r.label, createdAt: r.createdAt.toISOString() }))}
        initialPresets={presets}
        hints={loaded.hints}
        equipped={loaded.equipped}
        suggestionNotes={loaded.notes}
      />
    </div>
  );
}
