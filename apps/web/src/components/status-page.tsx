import type { ReactNode } from "react";
import { cn } from "@rpg-forge/ui/lib/utils";

/** Layout comum das telas de erro, "não encontrado" e afins. Sem hooks: serve a componentes de servidor e de cliente. */
export function StatusPage(props: { code?: string; title: string; children: ReactNode; actions: ReactNode; fullscreen?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 text-center", props.fullscreen ? "min-h-svh py-16" : "py-16")}>
      {props.code && <p className="font-heading text-5xl font-semibold text-gold">{props.code}</p>}
      <h1 className="mt-3 text-2xl font-semibold">{props.title}</h1>
      <div className="mt-2 max-w-md text-sm text-muted-foreground">{props.children}</div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{props.actions}</div>
    </div>
  );
}
