"use client";

import { useState, useTransition } from "react";
import { KeyRound, Laptop, LogOut, Save, UserCheck } from "lucide-react";
import { changePasswordAction, revokeOtherSessionsAction, updateDisplayNameAction } from "@/app/actions/account";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";

export function AccountForm({
  initialDisplayName,
  email,
  counts,
  sessions,
}: {
  initialDisplayName: string;
  email: string;
  counts: { characters: number; campaigns: number };
  sessions: { id: string; isCurrent: boolean; createdAt: string; expiresAt: string }[];
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [sessMsg, setSessMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    setNameMsg(null);
    startTransition(async () => {
      const r = await updateDisplayNameAction(displayName);
      setNameMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    });
  };

  const submitPw = (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: "A confirmação da nova senha não confere." });
      return;
    }
    startTransition(async () => {
      const r = await changePasswordAction(curPw, newPw);
      if (r.ok) {
        setCurPw("");
        setNewPw("");
        setConfirmPw("");
        setPwMsg({ ok: true, text: r.message });
      } else {
        setPwMsg({ ok: false, text: r.error });
      }
    });
  };

  const revokeOthers = () => {
    setSessMsg(null);
    startTransition(async () => {
      const r = await revokeOtherSessionsAction();
      setSessMsg(r.ok ? r.message : r.error);
    });
  };

  const otherSessions = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <UserCheck className="size-4 text-gold" aria-hidden /> Dados do perfil
          </h2>
          <span className="text-xs text-muted-foreground">
            {counts.characters} personagem(ns) · {counts.campaigns} campanha(s)
          </span>
        </div>

        <form onSubmit={submitName} className="space-y-3 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="acc-email">E-mail</Label>
            <Input id="acc-email" value={email} disabled />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-name">Nome de exibição</Label>
            <Input
              id="acc-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
            />
          </div>
          {nameMsg && <p className={`text-xs ${nameMsg.ok ? "text-emerald-500" : "text-destructive"}`}>{nameMsg.text}</p>}
          <Button type="submit" size="sm" disabled={pending}>
            <Save /> Salvar nome
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <KeyRound className="size-4 text-gold" aria-hidden /> Alterar senha
        </h2>
        <form onSubmit={submitPw} className="space-y-3 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="pw-cur">Senha atual</Label>
            <Input id="pw-cur" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-new">Nova senha (mínimo 8 caracteres)</Label>
            <Input id="pw-new" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={8} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw-conf">Confirmar nova senha</Label>
            <Input id="pw-conf" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} minLength={8} required />
          </div>
          {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-emerald-500" : "text-destructive"}`}>{pwMsg.text}</p>}
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            <KeyRound /> Atualizar senha
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Laptop className="size-4 text-gold" aria-hidden /> Sessões ativas ({sessions.length})
          </h2>
          {otherSessions > 0 && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={revokeOthers}>
              <LogOut /> Encerrar outras sessões ({otherSessions})
            </Button>
          )}
        </div>
        {sessMsg && <p className="text-xs text-emerald-500">{sessMsg}</p>}
        <ul className="divide-y text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex items-center gap-2">
                <span>Iniciada em {new Date(s.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                {s.isCurrent && <Badge>Sessão atual</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">
                Expira em {new Date(s.expiresAt).toLocaleDateString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
