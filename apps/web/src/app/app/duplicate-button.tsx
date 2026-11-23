"use client";

import { useTransition } from "react";
import { Copy } from "lucide-react";
import { duplicateCharacterAction } from "@/app/actions/characters";
import { Button } from "@rpg-forge/ui/components/button";

export function DuplicateButton({ characterId, size = "xs", variant = "ghost" }: { characterId: string; size?: "xs" | "sm" | "default"; variant?: "ghost" | "outline" }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={pending}
      onClick={() => start(async () => { await duplicateCharacterAction(characterId); })}
    >
      <Copy /> {pending ? "Duplicando…" : "Duplicar"}
    </Button>
  );
}
