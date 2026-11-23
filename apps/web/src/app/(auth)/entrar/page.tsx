import type { Metadata } from "next";
import { login } from "@/app/actions/auth";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const { convite } = await searchParams;
  const code = typeof convite === "string" && /^[A-Za-z0-9_-]{12}$/.test(convite) ? convite : undefined;
  return (
    <>
      {code && <p className="mb-3 rounded-md bg-muted p-2 text-sm">Você recebeu um convite para uma campanha. Depois de entrar, voltamos para ele.</p>}
      <h1 className="mb-5 text-xl font-semibold">Entrar</h1>
      <AuthForm
        action={login}
        submitLabel="Entrar"
        fields={[
          { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
          { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
        ]}
        footer={{ text: "Ainda não tem conta?", href: code ? `/cadastro?convite=${code}` : "/cadastro", link: "Criar conta" }}
        hidden={code ? { convite: code } : undefined}
      />
    </>
  );
}
