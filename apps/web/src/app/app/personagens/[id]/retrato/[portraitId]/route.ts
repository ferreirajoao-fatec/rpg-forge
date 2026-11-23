import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/characters";
import { openPortrait } from "@/server/portraits";

/**
 * Imagem de um retrato gerado por IA. O Blob é privado: a imagem passa por aqui, que confere se quem
 * pede pode ver o personagem (o dono ou o mestre da campanha).
 */
export async function GET(_req: Request, ctx: RouteContext<"/app/personagens/[id]/retrato/[portraitId]">) {
  const { id, portraitId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  try {
    const file = await openPortrait(id, user.id, portraitId);
    if (!file) return new NextResponse(null, { status: 404 });
    return new NextResponse(file.stream, {
      headers: {
        "content-type": file.contentType,
        // Cada retrato tem id próprio e nunca muda: pode ficar no cache do navegador, mas só dele.
        "cache-control": "private, max-age=86400, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse(null, { status: 404 });
    throw e;
  }
}
