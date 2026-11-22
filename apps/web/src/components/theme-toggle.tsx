"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@rpg-forge/ui/components/button";

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    document.cookie = `rf_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema claro/escuro">
      <Sun className="hidden dark:block" />
      <Moon className="block dark:hidden" />
    </Button>
  );
}
