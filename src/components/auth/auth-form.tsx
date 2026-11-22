"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "@/app/actions/auth";

type Field = { name: string; label: string; type: string; autoComplete: string; hint?: string };

export function AuthForm({
  action,
  fields,
  submitLabel,
  footer,
}: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
  fields: Field[];
  submitLabel: string;
  footer: { text: string; href: string; link: string };
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {fields.map((f) => {
        const errors = state?.errors?.[f.name];
        const describedBy = errors ? `${f.name}-error` : f.hint ? `${f.name}-hint` : undefined;
        return (
          <div key={f.name} className="space-y-1.5">
            <Label htmlFor={f.name}>{f.label}</Label>
            <Input
              id={f.name}
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              required
              aria-invalid={!!errors}
              aria-describedby={describedBy}
            />
            {f.hint && !errors && (
              <p id={`${f.name}-hint`} className="text-xs text-muted-foreground">
                {f.hint}
              </p>
            )}
            {errors && (
              <p id={`${f.name}-error`} className="text-xs text-destructive">
                {errors.join(" ")}
              </p>
            )}
          </div>
        );
      })}
      {state?.message && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Aguarde…" : submitLabel}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {footer.text}{" "}
        <Link href={footer.href} className="text-gold underline-offset-4 hover:underline">
          {footer.link}
        </Link>
      </p>
    </form>
  );
}
