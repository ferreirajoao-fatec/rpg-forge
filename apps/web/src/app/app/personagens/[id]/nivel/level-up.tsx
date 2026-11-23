"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, ChevronRight, ListChecks, Sparkles, TrendingUp } from "lucide-react";
import { Catalog, getEngine, type CharacterData, type ContentEntry, type LevelUpGain } from "@rpg-forge/rules-engine";
import { levelUpAction } from "@/app/actions/characters";
import { Button, buttonVariants } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";
import { Progress } from "@rpg-forge/ui/components/progress";

const GROUPS: { kind: LevelUpGain["kind"]; title: string; icon: typeof Sparkles }[] = [
  { kind: "choice", title: "Decisões para tomar", icon: ListChecks },
  { kind: "feature", title: "Habilidades novas", icon: Sparkles },
  { kind: "stat", title: "Valores que mudam sozinhos", icon: TrendingUp },
];

export function LevelUp(props: {
  characterId: string;
  rulesetId: string;
  data: CharacterData;
  revision: number;
  entries: ContentEntry[];
  canEdit: boolean;
}) {
  const engine = getEngine(props.rulesetId);
  const catalog = useMemo(() => new Catalog(props.rulesetId, props.entries), [props.rulesetId, props.entries]);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const usesXp = props.data.progressionMode === "xp" && !!engine.xpThresholds;
  const [xp, setXp] = useState(props.data.experience);

  const plan = useMemo(() => engine.levelUpPlan({ ...props.data, experience: xp }, catalog), [engine, props.data, xp, catalog]);
  const clsEntry = props.data.classes[0] ? catalog.get(props.data.classes[0].classId) : undefined;
  const maxLvl = typeof clsEntry?.data.maxLevel === "number" ? clsEntry.data.maxLevel : engine.meta.levelRange.max;
  const atMax = plan.to > maxLvl;
  const choices = plan.gains.filter((g) => g.kind === "choice");
  const name = props.data.name || "Seu personagem";
  const fmtLvl = (n: number) => (engine.formatLevel ? engine.formatLevel(n, props.data) : `${n}º nível`);

  const confirm = () =>
    startTransition(async () => {
      setError(undefined);
      const r = await levelUpAction(props.characterId, props.revision, usesXp ? xp : undefined);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Com decisões pendentes, abre o editor na primeira delas; sem decisões, vai para a ficha.
      const step = choices.find((c) => c.stepId)?.stepId;
      router.push(step ? `/app/personagens/${props.characterId}?etapa=${step}` : `/app/personagens/${props.characterId}/ficha`);
    });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{engine.meta.name}</p>
        <h1 className="text-2xl font-semibold">{engine.formatLevel ? "Próximo avanço" : "Meu próximo nível"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {atMax ? `${name} já está no limite máximo (${fmtLvl(plan.from)}).` : `O que ${name} ganha ao passar de ${fmtLvl(plan.from)} para ${fmtLvl(plan.to)}.`}
        </p>
      </header>

      {usesXp && plan.xp && (
        <section aria-labelledby="xp-title" className="rounded-lg border bg-card p-4">
          <h2 id="xp-title" className="text-sm font-semibold">
            Experiência
          </h2>
          <Progress value={Math.min(100, Math.round((xp / plan.xp.needed) * 100))} className="mt-2" aria-label={`${xp} de ${plan.xp.needed} XP`} />
          <p className="mt-1 text-xs text-muted-foreground">
            {xp.toLocaleString("pt-BR")} / {plan.xp.needed.toLocaleString("pt-BR")} XP
          </p>
          {props.canEdit && (
            <div className="mt-3 max-w-40 space-y-1.5">
              <Label htmlFor="xp">XP total</Label>
              <Input id="xp" type="number" min={0} value={xp} onChange={(e) => setXp(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} />
            </div>
          )}
        </section>
      )}

      {!atMax && (
        <div className="space-y-4">
          {GROUPS.map(({ kind, title, icon: Icon }) => {
            const items = plan.gains.filter((g) => g.kind === kind);
            if (!items.length) return null;
            return (
              <section key={kind} aria-labelledby={`g-${kind}`} className="rounded-lg border bg-card p-4">
                <h2 id={`g-${kind}`} className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-gold" aria-hidden /> {title}
                </h2>
                <ul className="mt-2 divide-y">
                  {items.map((g, i) => (
                    <li key={`${g.label}-${i}`} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{g.label}</p>
                        {g.detail && kind !== "stat" && <p className="text-xs text-muted-foreground">{g.detail}</p>}
                      </div>
                      {kind === "stat" && g.detail && <span className="shrink-0 font-mono text-xs tabular-nums">{g.detail}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {plan.gains.length === 0 && (
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Complete a ficha (classe e atributos) para ver o que muda no próximo nível.
            </p>
          )}
          {props.rulesetId.startsWith("tormenta20") && (
            <p className="text-xs text-muted-foreground">
              As habilidades e os poderes de cada nível de classe ainda não estão no pacote de conteúdo: confira a tabela da sua classe no
              livro e escolha os poderes na etapa Poderes.
            </p>
          )}
        </div>
      )}

      {props.canEdit && !atMax && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={confirm} disabled={!plan.canLevelUp || pending}>
              <ArrowUpCircle /> {pending ? "Subindo…" : `Avançar para ${fmtLvl(plan.to)}`}
            </Button>
            {plan.blockedReason && <p className="text-sm text-muted-foreground">{plan.blockedReason}</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          {plan.canLevelUp && (
            <p className="text-xs text-muted-foreground">
              A ficha de agora fica guardada no histórico de versões; dá para voltar restaurando-a.
              {choices.length > 0 && " Depois de subir, o editor abre na primeira decisão pendente."}
            </p>
          )}
        </div>
      )}
      <Link href={`/app/personagens/${props.characterId}/ficha`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Ver ficha atual <ChevronRight />
      </Link>
    </div>
  );
}
