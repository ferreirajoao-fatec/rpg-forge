import type { Metadata } from "next";
import { Cinzel, Geist_Mono, Source_Sans_3 } from "next/font/google";
import { TooltipProvider } from "@rpg-forge/ui/components/tooltip";
import "./globals.css";

const display = Cinzel({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "RPG Forge", template: "%s · RPG Forge" },
  description: "Crie, valide e evolua personagens de RPG de mesa com um assistente que explica cada regra.",
};

// Aplica o tema salvo antes da primeira pintura, sem ler cookies no servidor
// (o que mantém as páginas públicas estáticas). Padrão: escuro.
const THEME_SCRIPT =
  "try{var t=document.cookie.match(/(?:^|; )rf_theme=(light|dark)/);var d=!t||t[1]==='dark';" +
  "var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light'}catch(e){}";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${display.variable} ${body.variable} ${mono.variable} dark h-full antialiased`}
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
