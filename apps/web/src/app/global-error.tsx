"use client"; // Limites de erro precisam ser componentes de cliente.

/**
 * Último recurso: só aparece quando o próprio layout raiz falha. Substitui o documento inteiro, então
 * não carrega globals.css nem as fontes; as cores do tema escuro ficam aqui, em estilo inline.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR" style={{ colorScheme: "dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          background: "oklch(0.15 0.006 290)",
          color: "oklch(0.93 0.012 290)",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>Erro · RPG Forge</title>
        <main>
          <h1 style={{ fontSize: 24, margin: 0 }}>O RPG Forge encontrou um erro</h1>
          <p style={{ color: "oklch(0.72 0.018 290)", maxWidth: 420 }}>Nada do que você já salvou foi perdido. Tente carregar de novo em instantes.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "oklch(0.72 0.018 290)" }}>Código do erro: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: 0, background: "oklch(0.55 0.2 298)", color: "white", fontSize: 14, cursor: "pointer" }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
