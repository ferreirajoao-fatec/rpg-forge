"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2Off, Share2 } from "lucide-react";
import { togglePublicShareAction } from "@/app/actions/characters";
import { Button } from "@rpg-forge/ui/components/button";

export function ShareSheetButton({
  characterId,
  initialToken,
  canEdit,
}: {
  characterId: string;
  initialToken?: string;
  canEdit: boolean;
}) {
  const [token, setToken] = useState<string | null>(initialToken ? `${characterId}.${initialToken}` : null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const sharePath = token ? `/ficha-publica/${token}` : null;

  const copyLink = async (composite: string) => {
    const url = `${window.location.origin}/ficha-publica/${composite}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem clipboard disponível
    }
  };

  if (!canEdit && !sharePath) return null;

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 print:hidden">
      {!sharePath ? (
        canEdit && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await togglePublicShareAction(characterId, true);
                if (r.ok && r.compositeToken) {
                  setToken(r.compositeToken);
                  void copyLink(r.compositeToken);
                }
              })
            }
          >
            <Share2 /> Compartilhar ficha
          </Button>
        )
      ) : (
        <>
          <Button type="button" variant="outline" onClick={() => void copyLink(token!)}>
            {copied ? <Check className="text-emerald-500" /> : <Copy />}
            {copied ? "Link copiado!" : "Copiar link público"}
          </Button>
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              title="Revogar acesso pelo link público"
              onClick={() =>
                startTransition(async () => {
                  const r = await togglePublicShareAction(characterId, false);
                  if (r.ok) setToken(null);
                })
              }
            >
              <Link2Off /> Revogar
            </Button>
          )}
        </>
      )}
    </div>
  );
}
