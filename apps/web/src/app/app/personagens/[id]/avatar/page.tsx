import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, PencilRuler, ScrollText } from "lucide-react";
import { composeSvg } from "@rpg-forge/avatar-engine";
import { requireUser } from "@/server/auth/dal";
import { ForbiddenError } from "@/server/characters";
import { getAvatar, listPresets } from "@/server/avatars";
import { getPortraits, PORTRAIT_STYLES } from "@/server/portraits";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { AiPortrait } from "./ai-portrait";
import { AvatarStudio } from "./studio";

export const metadata: Metadata = { title: "Avatar Studio" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

export default async function AvatarPage({
  params,
}: PageProps<"/app/personagens/[id]/avatar">) {
  const { id } = await params;
  const user = await requireUser();
  let loaded;
  try {
    loaded = await getAvatar(id, user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const [presets, ai] = await Promise.all([
    loaded.canEdit ? listPresets(user.id) : Promise.resolve([]),
    getPortraits(id, user.id),
  ]);
  // Referência para a IA: só o avatar que o jogador já salvou (a sugestão automática pode não bater com a ideia dele).
  const referenceSvg = loaded.saved
    ? composeSvg(loaded.config, { frame: "full", idPrefix: "ref" })
    : undefined;
  const name = loaded.character.name || "Personagem sem nome";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/personagens/${id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ChevronLeft /> Voltar à ficha
          </Link>
          <Link
            href={`/app/personagens/${id}/ficha`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ScrollText /> Ver ficha pronta
          </Link>
        </div>
        <h1 className="font-heading text-xl font-semibold">
          Aparência de {name}
        </h1>
      </div>
      <AiPortrait
        characterId={id}
        canEdit={loaded.canEdit}
        enabled={ai.enabled}
        styles={Object.entries(PORTRAIT_STYLES).map(([sid, s]) => ({
          id: sid,
          label: s.label,
        }))}
        initialPortraits={ai.portraits}
        initialRemaining={ai.remaining}
        limit={ai.limit}
        referenceSvg={referenceSvg}
      />
      <details open={!ai.enabled} className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <PencilRuler className="size-4 text-gold" aria-hidden /> Ajustar
          manualmente (avatar desenhado)
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            Usado no token, na exportação e como referência para a IA
          </span>
        </summary>
        <div className="border-t p-4">
          <AvatarStudio
            characterId={id}
            characterName={name}
            canEdit={loaded.canEdit}
            saved={loaded.saved}
            initialConfig={loaded.config}
            initialRevision={loaded.revision}
            initialRevisions={loaded.revisions.map((r) => ({
              number: r.number,
              label: r.label,
              createdAt: r.createdAt.toISOString(),
            }))}
            initialPresets={presets}
            hints={loaded.hints}
            equipped={loaded.equipped}
            suggestionNotes={loaded.notes}
          />
        </div>
      </details>
    </div>
  );
}
