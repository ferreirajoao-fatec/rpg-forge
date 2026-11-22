"use client";

import { Printer } from "lucide-react";
import { Button } from "@rpg-forge/ui/components/button";

export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer /> Imprimir ou salvar em PDF
    </Button>
  );
}
