import type { Metadata } from "next";
import { signup } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Criar conta</h1>
      <AuthForm
        action={signup}
        submitLabel="Criar conta"
        fields={[
          { name: "displayName", label: "Como devemos chamar você?", type: "text", autoComplete: "nickname" },
          { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Senha",
            type: "password",
            autoComplete: "new-password",
            hint: "Mínimo de 10 caracteres, com letras e números.",
          },
        ]}
        footer={{ text: "Já tem conta?", href: "/entrar", link: "Entrar" }}
      />
    </>
  );
}
