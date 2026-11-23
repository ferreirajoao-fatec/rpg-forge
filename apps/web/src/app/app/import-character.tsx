"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { importCharacterAction } from "@/app/actions/characters";
import { Button } from "@rpg-forge/ui/components/button";

export function ImportCharacter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (raw: string) => {
    start(async () => {
      setError(null);
      const r = await importCharacterAction(raw);
      if (r.ok) {
        setOpen(false);
        setJsonText("");
        router.push(`/app/personagens/${r.id}`);
      } else {
        setError(r.error);
      }
    });
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Upload /> Importar JSON
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Importar ficha (.rpgforge.json)</p>
        <Button type="button" size="icon-xs" variant="ghost" aria-label="Fechar importação" onClick={() => setOpen(false)}>
          <X />
        </Button>
      </div>
      <div className="mt-3 space-y-3">
        <input
          type="file"
          accept=".json,.rpgforge.json,application/json"
          disabled={pending}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const txt = await file.text();
            submit(txt);
          }}
          className="block text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Ou colar o conteúdo JSON</summary>
          <div className="mt-2 space-y-2">
            <textarea
              rows={4}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{"format": "rpg-forge/personagem", ...}'
              className="w-full rounded-md border border-input bg-transparent p-2 font-mono text-xs outline-none focus-visible:border-ring"
            />
            <Button type="button" size="sm" disabled={pending || !jsonText.trim()} onClick={() => submit(jsonText)}>
              {pending ? "Importando…" : "Importar ficha"}
            </Button>
          </div>
        </details>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
