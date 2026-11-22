/** Esqueleto mostrado enquanto a página dentro de /app carrega (o menu continua visível). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">Carregando…</span>
      <div className="h-8 w-64 rounded-md bg-muted" />
      <div className="h-4 w-full max-w-xl rounded bg-muted" />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  );
}
