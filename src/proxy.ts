import { NextResponse, type NextRequest } from "next/server";

/**
 * Verificação OTIMISTA: só checa a presença do cookie para redirecionar cedo.
 * A autorização real acontece no servidor (requireUser / checagens por recurso).
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("rf_session");
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/app") && !hasSession) {
    return NextResponse.redirect(new URL("/entrar", request.url));
  }
  // Não redirecionamos /entrar quando há cookie: um cookie expirado causaria
  // um ciclo /entrar -> /app -> /entrar. A página de login verifica a sessão real.
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
