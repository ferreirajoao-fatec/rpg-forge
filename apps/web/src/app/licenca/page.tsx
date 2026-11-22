import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Licença do conteúdo",
  description: "Open Game License 1.0a e identificação do Conteúdo Open Game usado no RPG Forge.",
};

/**
 * A OGL exige que o texto completo da licença acompanhe o Conteúdo Open Game publicado.
 * O arquivo é lido no build (página estática), a partir do pacote de conteúdo.
 */
const OGL = readFileSync(path.join(process.cwd(), "../../content/tormenta20-2020/LICENSE-OGL.txt"), "utf8");

export default function LicensePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← RPG Forge
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Licença do conteúdo</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        As regras de Tormenta20 (livro básico de 2020) usadas aqui são Conteúdo Open Game, publicadas sob a Open Game License 1.0a. O cenário e
        a classe inventor são Identidade do Produto da Jambô Editora e não fazem parte do RPG Forge. O RPG Forge não é afiliado à Jambô
        Editora.
      </p>
      <pre className="mt-6 rounded-lg border bg-card p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">{OGL}</pre>
    </main>
  );
}
