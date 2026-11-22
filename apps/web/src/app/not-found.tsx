import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { StatusPage } from "@/components/status-page";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <StatusPage
      fullscreen
      code="404"
      title="Página não encontrada"
      actions={
        <Link href="/app" className={buttonVariants()}>
          Ir para meus personagens
        </Link>
      }
    >
      O endereço pode estar errado ou a página pode ter sido removida.
    </StatusPage>
  );
}
