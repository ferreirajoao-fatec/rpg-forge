import Link from "next/link";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { StatusPage } from "@/components/status-page";

/** Usado quando um personagem não existe ou pertence a outra pessoa (as páginas chamam notFound()). */
export default function AppNotFound() {
  return (
    <StatusPage
      code="404"
      title="Não encontramos isso"
      actions={
        <Link href="/app" className={buttonVariants()}>
          Voltar para meus personagens
        </Link>
      }
    >
      O personagem ou a página não existe, ou não está disponível para a sua conta.
    </StatusPage>
  );
}
