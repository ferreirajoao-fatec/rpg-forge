import Link from "next/link";
import { ShieldCheck, Sparkles, ScrollText } from "lucide-react";
import { buttonVariants } from "@rpg-forge/ui/components/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { listEngines } from "@rpg-forge/rules-engine";

const FEATURES = [
  { icon: ShieldCheck, title: "Regras verificadas", text: "Um motor determinístico valida cada escolha e cita a fonte da regra." },
  { icon: Sparkles, title: "Explicado para iniciantes", text: "Cada etapa diz o que significa e por que importa, sem precisar ler o livro antes." },
  { icon: ScrollText, title: "Histórico completo", text: "Versões da ficha, evolução por nível e restauração de qualquer ponto anterior." },
];

export default function Home() {
  const engines = listEngines();
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <span className="font-heading text-lg font-semibold text-gold">RPG Forge</span>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/entrar" className={buttonVariants({ variant: "ghost" })}>
            Entrar
          </Link>
          <Link href="/cadastro" className={buttonVariants()}>
            Criar conta
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:py-20">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Seu primeiro personagem, <span className="text-gold">sem medo de errar.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Um assistente que explica cada decisão, impede escolhas incompatíveis com as regras e acompanha o personagem do
          nível 1 ao fim da campanha.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/cadastro" className={buttonVariants({ size: "lg" })}>
            Começar agora
          </Link>
          <Link href="/entrar" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Já tenho conta
          </Link>
        </div>

        <section className="mt-16 grid gap-6 sm:grid-cols-3" aria-label="Recursos">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-lg border bg-card p-5">
              <Icon className="size-5 text-gold" aria-hidden />
              <h2 className="mt-3 text-base font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-semibold">Sistemas</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {engines.map((e) => (
              <li key={e.meta.id} className="rounded-lg border bg-card p-4">
                <p className="font-medium">{e.meta.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.meta.dataAvailability === "licensed"
                    ? `Regras sob licença aberta (${e.meta.sources.map((s) => s.license).join(", ")})`
                    : "Requer importação de conteúdo autorizado"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-muted-foreground">
        Inclui material do System Reference Document 5.1 e 5.2.1 da Wizards of the Coast LLC, licenciado sob CC-BY-4.0, e
        Conteúdo Open Game sob a Open Game License 1.0a (
        <Link href="/licenca" className="underline underline-offset-4 hover:text-foreground">
          texto da licença e avisos de copyright
        </Link>
        ).
        RPG Forge não é afiliado à Wizards of the Coast nem à Jambô Editora.
      </footer>
    </div>
  );
}
