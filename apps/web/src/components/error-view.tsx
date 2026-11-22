"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@rpg-forge/ui/components/button";
import { StatusPage } from "@/components/status-page";

/** Conteúdo comum dos error.tsx. Mostra o código do erro (digest) para cruzar com o log do servidor. */
export function ErrorView({ error, retry, fullscreen }: { error: unknown; retry: () => void; fullscreen?: boolean }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <StatusPage
      fullscreen={fullscreen}
      title="Algo deu errado"
      actions={
        <>
          <Button onClick={() => retry()}>
            <RotateCcw /> Tentar de novo
          </Button>
          <Link href="/app" className={buttonVariants({ variant: "outline" })}>
            Ir para meus personagens
          </Link>
        </>
      }
    >
      <p>Não conseguimos carregar esta parte. Nada do que você já salvou foi perdido.</p>
      {digest && <p className="mt-2 font-mono text-xs">Código do erro: {digest}</p>}
    </StatusPage>
  );
}
