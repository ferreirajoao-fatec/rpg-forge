import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError, getCharacter } from "@/server/characters";
import { getAvatar } from "@/server/avatars";
import { db } from "@/server/db";

/**
 * Exportação conjunta (fase 5): ficha e avatar num só arquivo JSON, com a versão do
 * catálogo de regras e do catálogo de peças usadas. Serve como cópia de segurança e para
 * levar o personagem a outra mesa.
 */
export async function GET(_req: Request, ctx: RouteContext<"/app/personagens/[id]/exportar">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  try {
    const { record, data } = await getCharacter(id, user.id);
    const avatar = await getAvatar(id, user.id);
    const version = record.rulesetVersionId ? await db.rulesetVersion.findUnique({ where: { id: record.rulesetVersionId }, select: { packVersion: true } }) : null;
    const body = {
      format: "rpg-forge/personagem",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      ruleset: { id: record.rulesetId, packVersion: version?.packVersion ?? null },
      character: { name: record.name, level: record.level, status: record.status, data },
      avatar: avatar.saved ? { assetsVersion: avatar.config.assets, config: avatar.config } : null,
    };
    const file = `${(record.name || "personagem").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "personagem"}.rpgforge.json`;
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "Personagem não encontrado." }, { status: 404 });
    throw e;
  }
}
