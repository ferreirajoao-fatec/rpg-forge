import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { ForbiddenError, getCharacter, listVersions } from "@/server/characters";
import { CharacterEditor } from "./editor";

export const metadata: Metadata = { title: "Personagem" };

/** Lê a sessão a cada requisição: rota bloqueante por decisão consciente (como o layout). */
export const instant = false;

async function load(id: string, userId: string) {
  try {
    const character = await getCharacter(id, userId);
    const versions = await listVersions(id, userId);
    return { ...character, versions };
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}

export default async function CharacterPage({ params, searchParams }: PageProps<"/app/personagens/[id]">) {
  const { id } = await params;
  const { etapa } = await searchParams;
  const user = await requireUser();
  const { record, data, catalog, canEdit, versions } = await load(id, user.id);
  return (
    <CharacterEditor
      characterId={record.id}
      rulesetId={record.rulesetId}
      initialData={data}
      initialStep={typeof etapa === "string" ? etapa : undefined}
      initialRevision={record.revision}
      entries={catalog.all()}
      canEdit={canEdit}
      versions={versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }))}
    />
  );
}
