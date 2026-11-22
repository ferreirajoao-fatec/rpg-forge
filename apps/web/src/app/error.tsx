"use client"; // Limites de erro precisam ser componentes de cliente.

import { ErrorView } from "@/components/error-view";

export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} fullscreen />;
}
