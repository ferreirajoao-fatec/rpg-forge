"use client";

import { useState } from "react";
import { Dices, Printer } from "lucide-react";
import type { CharacterData } from "@rpg-forge/rules-engine";
import { Button } from "@rpg-forge/ui/components/button";
import { CharacterSheet } from "./sheet";
import type { SheetData } from "./sheet-data";
import { PlayMode } from "./play-mode";

export function SheetView({
  characterId,
  campaignId,
  canEdit,
  initialMode,
  sheet,
  portrait,
  initialSession,
  conditionsCatalog,
}: {
  characterId: string;
  campaignId: string | null;
  canEdit: boolean;
  initialMode: "ficha" | "mesa";
  sheet: SheetData;
  portrait?: string;
  initialSession: CharacterData["session"];
  conditionsCatalog: { id: string; name: string; summary: string }[];
}) {
  const [mode, setMode] = useState<"ficha" | "mesa">(initialMode);
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Modo de visualização" className="inline-flex rounded-lg border bg-muted p-1 print:hidden">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ficha"}
          onClick={() => setMode("ficha")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            mode === "ficha" ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Printer className="size-4" aria-hidden /> Ficha para impressão
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "mesa"}
          onClick={() => setMode("mesa")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            mode === "mesa" ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Dices className="size-4" aria-hidden /> Modo Mesa (interativo)
        </button>
      </div>

      {mode === "mesa" ? (
        <>
          <PlayMode
            characterId={characterId}
            campaignId={campaignId}
            canEdit={canEdit}
            sheet={sheet}
            initialSession={initialSession}
            conditionsCatalog={conditionsCatalog}
          />
          <div className="hidden print:block">
            <CharacterSheet sheet={sheet} portrait={portrait} />
          </div>
          <p className="text-center text-xs text-muted-foreground print:hidden">
            <Button type="button" variant="link" size="sm" onClick={() => setMode("ficha")}>
              Voltar para a ficha em página única
            </Button>
          </p>
        </>
      ) : (
        <CharacterSheet sheet={sheet} portrait={portrait} />
      )}
    </div>
  );
}
