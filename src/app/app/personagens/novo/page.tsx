import type { Metadata } from "next";
import { listEngines } from "@/rules";
import { NewCharacterForm } from "./form";

export const metadata: Metadata = { title: "Novo personagem" };

export default function NewCharacterPage() {
  const systems = listEngines().map((e) => ({
    id: e.meta.id,
    name: e.meta.name,
    publisher: e.meta.publisher,
    availability: e.meta.dataAvailability,
    limitations: e.meta.limitations,
  }));
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">Etapa 1</p>
      <h1 className="text-2xl font-semibold">Qual sistema de regras sua mesa usa?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Cada sistema tem suas próprias regras, cálculos e opções. Na dúvida, pergunte ao mestre qual livro ele vai usar.
      </p>
      <NewCharacterForm systems={systems} />
    </div>
  );
}
