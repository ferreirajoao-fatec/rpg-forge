"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpCircle, Check, ChevronLeft, ChevronRight, CloudOff, Dices, FileText, Loader2, Lock, RefreshCw, Sparkles, UserRound } from "lucide-react";
import {
  Catalog,
  cryptoRng,
  generateCompleteCharacter,
  getEngine,
  OP_OPTIONAL_RULES,
  type CharacterData,
  type ContentEntry,
  type ValidationIssue,
} from "@rpg-forge/rules-engine";
import {
  migrateCharacterCatalogAction,
  requestApprovalAction,
  restoreVersionAction,
  saveCharacterAction,
  snapshotAction,
} from "@/app/actions/characters";
import type { ApprovalRow } from "@/server/approvals";
import { ShareSheetButton } from "./ficha/share-sheet-button";
import { Button, buttonVariants } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";
import { Progress } from "@rpg-forge/ui/components/progress";
import { IssueList, ReportSummary } from "@/components/validation";
import { cn } from "@rpg-forge/ui/lib/utils";
import { ChoiceStep } from "./choice-step";
import { InventoryStep } from "./inventory-step";
import { DuplicateButton } from "../../duplicate-button";

type SaveStatus = { kind: "idle" | "saving" | "saved" | "error" | "conflict"; message?: string; at?: string };

interface VersionRow {
  number: number;
  reason: string;
  summary: string;
  level: number;
  createdAt: string;
}

const REASON_LABEL: Record<string, string> = {
  created: "Criação",
  edit: "Edição",
  level_up: "Subida de nível",
  restore: "Restauração",
  migration: "Migração de regras",
};

export function CharacterEditor(props: {
  characterId: string;
  rulesetId: string;
  campaignId?: string | null;
  initialData: CharacterData;
  /** Id da etapa para abrir direto (ex.: ?etapa=power). */
  initialStep?: string;
  initialRevision: number;
  entries: ContentEntry[];
  canEdit: boolean;
  versions: VersionRow[];
  catalogUpdate?: { latestVersion: string } | null;
  approvals?: ApprovalRow[];
}) {
  const router = useRouter();
  const engine = getEngine(props.rulesetId);
  const catalog = useMemo(() => new Catalog(props.rulesetId, props.entries), [props.rulesetId, props.entries]);
  const steps = useMemo(() => engine.creationSteps(catalog), [engine, catalog]);

  const [data, setData] = useState<CharacterData>(props.initialData);
  const [stepIdx, setStepIdx] = useState(() => Math.max(0, steps.findIndex((s) => s.id === props.initialStep)));
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const revision = useRef(props.initialRevision);
  const dirty = useRef(false);
  const [pending, startTransition] = useTransition();

  // Validação ao vivo no cliente (o servidor revalida ao salvar).
  const report = useMemo(() => engine.validate(data, catalog), [engine, data, catalog]);
  const derived = useMemo(() => engine.derive(data, catalog), [engine, data, catalog]);

  const update = useCallback(
    (patch: Partial<CharacterData>) => {
      if (!props.canEdit) return;
      dirty.current = true;
      setData((d) => ({ ...d, ...patch }));
    },
    [props.canEdit],
  );

  // Salvamento automático com atraso (debounce).
  useEffect(() => {
    if (!dirty.current || status.kind === "conflict") return;
    const t = setTimeout(async () => {
      dirty.current = false;
      setStatus({ kind: "saving" });
      try {
        const r = await saveCharacterAction(props.characterId, data, revision.current);
        if (r.ok) {
          revision.current = r.revision;
          setStatus({ kind: "saved", at: r.savedAt });
        } else {
          setStatus({ kind: r.conflict ? "conflict" : "error", message: r.error });
        }
      } catch {
        dirty.current = true;
        setStatus({ kind: "error", message: "Sem conexão. Tentaremos de novo na próxima alteração." });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [data, props.characterId, status.kind]);

  const generateAll = useCallback(() => {
    if (!props.canEdit) return;
    const generated = generateCompleteCharacter(engine, catalog, cryptoRng, {
      name: data.name.trim() || undefined,
      level: data.level,
    });
    dirty.current = true;
    setData((prev) => ({
      ...generated,
      publicShareToken: prev.publicShareToken,
      optionalRules: prev.optionalRules,
    }));
  }, [props.canEdit, engine, catalog, data.name, data.level]);

  const migrateCatalog = () => {
    startTransition(async () => {
      const r = await migrateCharacterCatalogAction(props.characterId);
      if (r.ok) router.refresh();
    });
  };

  const step = steps[stepIdx];
  const progress = Math.round(((stepIdx + 1) / steps.length) * 100);
  const issuesFor = (prefix: string): ValidationIssue[] =>
    report.issues.filter((i) => i.path === prefix || i.path?.startsWith(`${prefix}.`));

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr_300px]">
      {/* Etapas */}
      <nav aria-label="Etapas da criação" className="lg:sticky lg:top-6 lg:self-start">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{engine.meta.name}</p>
        <Progress value={progress} className="mt-2" aria-label={`Progresso: ${progress}%`} />
        <ol className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:flex-col">
          {steps.map((s, i) => {
            const unavailable = s.requiresContent && s.contentKind && catalog.ofKind(s.contentKind).length === 0;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setStepIdx(i)}
                  aria-current={i === stepIdx ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                    i === stepIdx ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className="grid size-5 place-items-center rounded-full border text-[10px]">{i + 1}</span>
                  <span className="whitespace-nowrap">{s.title}</span>
                  {unavailable && <Lock className="ml-auto size-3.5" aria-label="Conteúdo pendente" />}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Etapa atual */}
      <section aria-labelledby="step-title" className="min-w-0">
        {props.catalogUpdate && props.canEdit && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm">
            <span>
              Nova versão do catálogo disponível (<strong>v{props.catalogUpdate.latestVersion}</strong>). A atualização guarda um ponto de restauração antes de migrar.
            </span>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={migrateCatalog}>
              <RefreshCw /> Atualizar para v{props.catalogUpdate.latestVersion}
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <h1 id="step-title" className="text-2xl font-semibold">
            {step.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <SaveIndicator status={status} canEdit={props.canEdit} />
            {props.canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={generateAll} title="Preenche atributos, classe, origem, perícias e equipamento aleatoriamente">
                <Sparkles /> Gerar aleatório
              </Button>
            )}
            {props.canEdit && (
              <Link href={`/app/personagens/${props.characterId}/nivel`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ArrowUpCircle /> {engine.formatLevel ? "Avançar" : "Subir de nível"}
              </Link>
            )}
            <Link href={`/app/personagens/${props.characterId}/avatar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <UserRound /> Avatar
            </Link>
            <Link href={`/app/personagens/${props.characterId}/ficha`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileText /> Ver ficha
            </Link>
            <Link href={`/app/personagens/${props.characterId}/ficha?modo=mesa`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Dices /> Modo Mesa
            </Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{step.help}</p>

        <div className="mt-6 rounded-lg border bg-card p-5">
          {step.id === "concept" && <ConceptStep data={data} update={update} issues={issuesFor("name")} canEdit={props.canEdit} onGenerateAll={generateAll} />}
          {step.id === "level" && <LevelStep data={data} update={update} engine={engine} catalog={catalog} issues={issuesFor("level")} />}
          {step.id === "abilities" && <AbilitiesStep data={data} update={update} engine={engine} catalog={catalog} derived={derived} issues={issuesFor("abilities").concat(issuesFor("abilityMethod"), issuesFor("levelBonuses"))} />}
          {step.id === "narrative" && <NarrativeStep data={data} update={update} />}
          {step.id === "review" && (
            <ReviewStep
              characterId={props.characterId}
              campaignId={props.campaignId}
              canEdit={props.canEdit}
              engine={engine}
              data={data}
              versions={props.versions}
              approvals={props.approvals ?? []}
              pending={pending}
              onSnapshot={(s) => startTransition(() => snapshotAction(props.characterId, s))}
              onRestore={(n) => startTransition(async () => {
                await restoreVersionAction(props.characterId, n);
                location.reload();
              })}
              report={report}
            />
          )}
          {step.ui === "inventory" && (
            <InventoryStep
              data={data}
              update={update}
              engine={engine}
              catalog={catalog}
              derived={derived}
              issues={issuesFor("inventory")}
              canEdit={props.canEdit}
            />
          )}
          {step.requiresContent && step.contentKind && !step.ui && (
            <ContentStep
              kind={step.contentKind}
              entries={catalog.ofKind(step.contentKind)}
              data={data}
              update={update}
              engine={engine}
              catalog={catalog}
              canEdit={props.canEdit}
            />
          )}
        </div>

        <div className="mt-4 flex justify-between">
          <Button variant="outline" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0}>
            <ChevronLeft /> Anterior
          </Button>
          <Button onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))} disabled={stepIdx === steps.length - 1}>
            Próxima <ChevronRight />
          </Button>
        </div>
      </section>

      {/* Resumo e validação */}
      <aside aria-label="Resumo do personagem" className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">{data.name || "Sem nome"}</h2>
          <p className="text-xs text-muted-foreground">
            {engine.formatLevel ? engine.formatLevel(derived.level, data) : `Nível ${derived.level}`}
            {derived.proficiencyBonus !== undefined && ` · Proficiência +${derived.proficiencyBonus}`}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {engine.abilities.map((a) => {
              const v = derived.abilities[a.key];
              const has = data.baseAbilities[a.key] !== undefined;
              return (
                <div key={a.key} className="rounded-md border p-1.5">
                  <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground">{a.abbr}</dt>
                  <dd className="font-heading text-lg">{has ? v.score : "—"}</dd>
                  {has && engine.abilityRollLabel ? (
                    <dd className="text-xs text-muted-foreground">{engine.abilityRollLabel(v.score)}</dd>
                  ) : (
                    has && engine.meta.dataAvailability === "licensed" && (
                      <dd className="text-xs text-muted-foreground">{fmtMod(v.modifier)}</dd>
                    )
                  )}
                </div>
              );
            })}
          </dl>
          {derived.stats && derived.stats.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {derived.stats.map((s) => (
                <div key={s.key} className="flex justify-between gap-2" title={s.detail}>
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="font-medium tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {derived.pending.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{derived.pending.join(" ")}</p>}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Validação</h2>
          <ReportSummary report={report} />
        </div>
      </aside>
    </div>
  );
}

const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

type Engine = ReturnType<typeof getEngine>;
type StepProps = { data: CharacterData; update: (p: Partial<CharacterData>) => void };

function SaveIndicator({ status, canEdit }: { status: SaveStatus; canEdit: boolean }) {
  if (!canEdit) return <span className="text-xs text-muted-foreground">Somente leitura</span>;
  const map = {
    idle: { icon: Check, text: "Salvo", cls: "text-muted-foreground" },
    saving: { icon: Loader2, text: "Salvando…", cls: "text-muted-foreground [&_svg]:animate-spin" },
    saved: { icon: Check, text: "Salvo", cls: "text-success" },
    error: { icon: CloudOff, text: status.message ?? "Erro ao salvar", cls: "text-destructive" },
    conflict: { icon: CloudOff, text: status.message ?? "Conflito", cls: "text-destructive" },
  }[status.kind];
  const Icon = map.icon;
  return (
    <span role="status" className={cn("flex items-center gap-1 text-xs", map.cls)}>
      <Icon className="size-3.5" aria-hidden /> {map.text}
    </span>
  );
}

function ConceptStep({
  data,
  update,
  issues,
  canEdit,
  onGenerateAll,
}: StepProps & { issues: ValidationIssue[]; canEdit: boolean; onGenerateAll: () => void }) {
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <div>
            <p className="font-medium">Preenchimento rápido (one-shot / NPC)</p>
            <p className="text-xs text-muted-foreground">Sorteia atributos, raça, classe, origem, perícias e equipamento válidos.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onGenerateAll}>
            <Sparkles /> Gerar ficha completa aleatória
          </Button>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" value={data.name} maxLength={80} onChange={(e) => update({ name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="concept">Conceito</Label>
        <textarea
          id="concept"
          value={data.concept}
          maxLength={500}
          rows={3}
          onChange={(e) => update({ concept: e.target.value })}
          placeholder="Ex.: uma ex-soldada que busca redenção protegendo viajantes."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">Uma frase basta. O conceito orienta as sugestões do assistente.</p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Modo de criação</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              ["manual", "Manual", "Você decide tudo; o sistema avisa e explica."],
              ["assisted", "Assistido", "Sugestões a cada passo, com o motivo."],
              ["random", "Aleatório", "Gera escolhas válidas; trave o que quiser manter."],
            ] as const
          ).map(([id, label, desc]) => (
            <label
              key={id}
              className={cn(
                "cursor-pointer rounded-md border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring",
                data.creationMode === id && "border-gold ring-1 ring-gold",
              )}
            >
              <input type="radio" name="mode" className="sr-only" checked={data.creationMode === id} onChange={() => update({ creationMode: id })} />
              <span className="font-medium">{label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <IssueList issues={issues} empty="" />
    </div>
  );
}

function LevelStep({
  data,
  update,
  engine,
  catalog,
  issues,
}: StepProps & { engine: Engine; catalog: Catalog; issues: ValidationIssue[] }) {
  const { min, max } = engine.meta.levelRange;
  const clsEntry = data.classes[0] ? catalog.get(data.classes[0].classId) : undefined;
  const maxLevel = typeof clsEntry?.data.maxLevel === "number" ? clsEntry.data.maxLevel : max;
  const setLevel = (level: number) => {
    const clamped = Math.max(min, Math.min(maxLevel, level));
    // Na criação há uma classe só: o nível dela acompanha o nível do personagem.
    update({ level: clamped, classes: data.classes.map((cl, i) => (i === 0 ? { ...cl, levels: clamped } : cl)) });
  };

  return (
    <div className="space-y-4">
      {engine.formatLevel ? (
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="level">Nível de Exposição (NEX / Estágio)</Label>
          <select
            id="level"
            value={Math.min(data.level, maxLevel)}
            onChange={(e) => setLevel(Number(e.target.value) || min)}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {Array.from({ length: maxLevel - min + 1 }, (_, i) => min + i).map((n) => (
              <option key={n} value={n}>
                {engine.formatLevel!(n, data)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {clsEntry?.id === "class:sobrevivente"
              ? "Sobreviventes (NEX 0%) progridem de Estágio 1 até Estágio 5."
              : "Agentes iniciantes começam em NEX 5% e avançam de 5% em 5% até NEX 99%."}
          </p>
        </div>
      ) : (
        <div className="max-w-40 space-y-1.5">
          <Label htmlFor="level">Nível inicial</Label>
          <Input
            id="level"
            type="number"
            min={min}
            max={max}
            value={data.level}
            onChange={(e) => {
              const level = Math.max(1, Math.min(30, Number(e.target.value) || 1));
              update({ level, classes: data.classes.map((cl, i) => (i === 0 ? { ...cl, levels: level } : cl)) });
            }}
          />
          <p className="text-xs text-muted-foreground">Entre {min} e {max}. Iniciantes geralmente começam no nível 1.</p>
        </div>
      )}
      {engine.levelForXp && (
        <fieldset>
          <legend className="text-sm font-medium">Como o personagem evolui na campanha?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["milestone", "Marcos narrativos"],
                ["xp", "Pontos de experiência"],
              ] as const
            ).map(([id, label]) => (
              <Button key={id} type="button" variant={data.progressionMode === id ? "default" : "outline"} onClick={() => update({ progressionMode: id })} aria-pressed={data.progressionMode === id}>
                {label}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
      {data.progressionMode === "xp" && engine.levelForXp && (
        <div className="max-w-40 space-y-1.5">
          <Label htmlFor="xp">Experiência (XP)</Label>
          <Input id="xp" type="number" min={0} value={data.experience} onChange={(e) => update({ experience: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
      )}
      {engine.meta.id === "ordem-paranormal-1e" && (
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Regras opcionais (Sobrevivendo ao Horror)</legend>
          {(
            [
              {
                id: OP_OPTIONAL_RULES.DETERMINATION_POINTS,
                label: "Jogando sem Sanidade (Pontos de Determinação — PD)",
                desc: "Substitui PE e Sanidade por PD (SaH p. 104). Falhar no Custo do Paranormal drena PD em dobro.",
              },
              {
                id: OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX,
                label: "Separando Nível e NEX",
                desc: "Controla Nível de Experiência (1–20) e porcentagem de NEX (0%–99%) separadamente (SaH p. 99).",
              },
              {
                id: OP_OPTIONAL_RULES.DEBILITATING_INJURIES,
                label: "Ferimentos Debilitantes",
                desc: "Falhar ao sofrer dano massivo causa ferimento debilitante em um atributo em vez de cair a 0 PV (SaH p. 105).",
              },
            ] as const
          ).map((rule) => {
            const active = data.optionalRules?.includes(rule.id) ?? false;
            return (
              <label key={rule.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={active}
                  onChange={(e) => {
                    const prev = data.optionalRules ?? [];
                    const next = e.target.checked ? [...new Set([...prev, rule.id])] : prev.filter((r) => r !== rule.id);
                    update({
                      optionalRules: next,
                      ...(rule.id === OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX && e.target.checked && data.opSeparateNex === undefined
                        ? { opSeparateNex: 0 }
                        : {}),
                    });
                  }}
                />
                <span>
                  <span className="font-medium">{rule.label}</span>
                  <span className="block text-xs text-muted-foreground">{rule.desc}</span>
                </span>
              </label>
            );
          })}
          {data.optionalRules?.includes(OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX) && (
            <div className="max-w-44 space-y-1 pt-1">
              <Label htmlFor="op-sep-nex">NEX separado (0% a 99%)</Label>
              <Input
                id="op-sep-nex"
                type="number"
                min={0}
                max={99}
                value={data.opSeparateNex ?? 0}
                onChange={(e) => update({ opSeparateNex: Math.max(0, Math.min(99, Math.trunc(Number(e.target.value) || 0))) })}
              />
            </div>
          )}
        </fieldset>
      )}
      <IssueList issues={issues} empty="" />
    </div>
  );
}

function AbilitiesStep({
  data,
  update,
  engine,
  catalog,
  derived,
  issues,
}: StepProps & { engine: Engine; catalog: Catalog; derived: ReturnType<Engine["derive"]>; issues: ValidationIssue[] }) {
  const method = engine.abilityMethods.find((m) => m.id === data.abilityMethod);
  const budget = engine.levelBonusBudget?.(data, catalog);
  const used = Object.values(data.levelBonuses ?? {}).reduce((t, v) => t + v, 0);
  const setLevelBonus = (key: string, delta: number) => {
    const next = { ...(data.levelBonuses ?? {}) };
    const v = Math.max(0, (next[key] ?? 0) + delta);
    if (v) next[key] = v;
    else delete next[key];
    update({ levelBonuses: next });
  };
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">Método de geração</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {engine.abilityMethods.map((m) => (
            <label
              key={m.id}
              className={cn(
                "cursor-pointer rounded-md border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring",
                data.abilityMethod === m.id && "border-gold ring-1 ring-gold",
              )}
            >
              <input type="radio" name="method" className="sr-only" checked={data.abilityMethod === m.id} onChange={() => update({ abilityMethod: m.id })} />
              <span className="font-medium">{m.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{m.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {method?.generate && (
        <Button type="button" variant="outline" onClick={() => update({ baseAbilities: method.generate!(cryptoRng) })}>
          <Dices /> Gerar valores válidos ({method.label.toLowerCase()})
        </Button>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {engine.abilities.map((a) => {
          const v = data.baseAbilities[a.key];
          const err = issues.some((i) => i.path === `abilities.${a.key}` && i.severity === "invalid");
          return (
            <div key={a.key} className="flex items-center gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`ab-${a.key}`}>
                  {a.label} <span className="text-muted-foreground">({a.abbr})</span>
                </Label>
                <p className="text-xs text-muted-foreground">{a.description}</p>
              </div>
              <Input
                id={`ab-${a.key}`}
                type="number"
                className="w-16 text-center"
                value={v ?? ""}
                aria-invalid={err}
                onChange={(e) => {
                  const next = { ...data.baseAbilities };
                  if (e.target.value === "") delete next[a.key];
                  else next[a.key] = Math.trunc(Number(e.target.value));
                  update({ baseAbilities: next });
                }}
              />
              {engine.abilityRollLabel ? (
                <span className="w-14 text-right font-mono text-sm" aria-label="Dados de rolagem">
                  {v !== undefined ? engine.abilityRollLabel(derived.abilities[a.key].score) : ""}
                </span>
              ) : (
                engine.meta.dataAvailability === "licensed" && (
                  <span className="w-8 text-right font-mono text-sm" aria-label="Modificador">
                    {v !== undefined ? fmtMod(derived.abilities[a.key].modifier) : ""}
                  </span>
                )
              )}
            </div>
          );
        })}
      </div>
      {budget && (budget.points > 0 || used > 0) && (
        <fieldset className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Aumentos por nível: {used}/{budget.points} ponto(s)
          </legend>
          <p className="text-xs text-muted-foreground">{budget.detail}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {engine.abilities.map((a) => {
              const v = data.levelBonuses?.[a.key] ?? 0;
              const total = derived.abilities[a.key]?.score ?? 0;
              return (
                <div key={a.key} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span>
                    {a.abbr} <span className="text-xs text-muted-foreground">({total})</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Button type="button" size="sm" variant="outline" aria-label={`Tirar 1 de ${a.label}`} disabled={!v} onClick={() => setLevelBonus(a.key, -1)}>
                      −
                    </Button>
                    <span className="w-6 text-center tabular-nums">{v ? `+${v}` : "0"}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Somar 1 em ${a.label}`}
                      disabled={used >= budget.points || total >= budget.max}
                      onClick={() => setLevelBonus(a.key, 1)}
                    >
                      +
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        </fieldset>
      )}
      <IssueList issues={issues} empty={method ? "Atributos válidos para este método." : "Escolha um método para começar."} />
    </div>
  );
}

function NarrativeStep({ data, update }: StepProps) {
  const fields = [
    ["appearance", "Aparência"],
    ["personality", "Traços de personalidade"],
    ["ideals", "Ideais"],
    ["bonds", "Vínculos"],
    ["flaws", "Defeitos"],
    ["backstory", "História"],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map(([k, label]) => (
        <div key={k} className={cn("space-y-1.5", k === "backstory" && "sm:col-span-2")}>
          <Label htmlFor={`n-${k}`}>{label}</Label>
          <textarea
            id={`n-${k}`}
            rows={k === "backstory" ? 6 : 3}
            maxLength={4000}
            value={data.narrative[k]}
            onChange={(e) => update({ narrative: { ...data.narrative, [k]: e.target.value } })}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      ))}
    </div>
  );
}

function ContentStep({
  kind,
  entries,
  data,
  update,
  engine,
  catalog,
  canEdit,
}: {
  kind: string;
  entries: ContentEntry[];
  data: CharacterData;
  update: (p: Partial<CharacterData>) => void;
  engine: Engine;
  catalog: Catalog;
  canEdit: boolean;
}) {
  if (!entries.length) {
    return (
      <div className="text-sm">
        <p className="font-medium">Conteúdo ainda não disponível</p>
        <p className="mt-1 text-muted-foreground">
          {engine.meta.dataAvailability === "licensed"
            ? "O catálogo do SRD para esta etapa será importado na Fase 2. Nenhum dado foi inventado para preencher esta lista."
            : "Este sistema não possui fonte com licença aberta. Importe um pacote de conteúdo autorizado para habilitar esta etapa."}
        </p>
      </div>
    );
  }
  return <ChoiceStep kind={kind} entries={entries} data={data} update={update} engine={engine} catalog={catalog} canEdit={canEdit} />;
}

function ReviewStep({
  characterId,
  campaignId,
  canEdit,
  engine,
  data,
  report,
  versions,
  approvals,
  pending,
  onSnapshot,
  onRestore,
}: {
  characterId: string;
  campaignId?: string | null;
  canEdit: boolean;
  engine: Engine;
  data: CharacterData;
  report: ReturnType<Engine["validate"]>;
  versions: VersionRow[];
  approvals: ApprovalRow[];
  pending: boolean;
  onSnapshot: (summary: string) => void;
  onRestore: (n: number) => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState("");
  const [reqSlot, setReqSlot] = useState("excecao");
  const [reqReason, setReqReason] = useState("");
  const [reqMsg, setReqMsg] = useState<string | null>(null);
  const [, startReq] = useTransition();
  const blocking = report.issues.filter((i) => i.severity === "invalid").length;

  const submitApproval = (e: React.FormEvent) => {
    e.preventDefault();
    setReqMsg(null);
    startReq(async () => {
      const r = await requestApprovalAction(characterId, {
        slot: "manual",
        contentId: reqSlot.trim() || "excecao",
        reason: reqReason,
      });
      if (!r.ok) {
        setReqMsg(r.error);
        return;
      }
      setReqReason("");
      setReqMsg("Pedido enviado ao mestre da campanha.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Situação da ficha</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {blocking
            ? `Há ${blocking} problema(s) que impedem concluir a criação.`
            : "Nenhuma regra obrigatória violada. Resolva os avisos que julgar importantes."}
        </p>
        <ReportSummary report={report} />
        <Link href={`/app/personagens/${characterId}/ficha`} className={buttonVariants({ className: "mt-4" })}>
          <FileText /> Ver ficha pronta para jogar
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">A ficha abre em formato de página para imprimir ou salvar em PDF.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/app/personagens/${characterId}/avatar`} className={buttonVariants({ variant: "outline" })}>
            <UserRound /> Montar a aparência (Avatar Studio)
          </Link>
          <DuplicateButton characterId={characterId} size="default" variant="outline" />
          <ShareSheetButton characterId={characterId} initialToken={data.publicShareToken} canEdit={canEdit} />
        </div>
      </div>

      {campaignId && (
        <div className="space-y-3 rounded-md border p-4">
          <h2 className="text-base font-semibold">Aprovações do mestre</h2>
          {canEdit && (
            <form onSubmit={submitApproval} className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                <Input
                  value={reqSlot}
                  onChange={(e) => setReqSlot(e.target.value)}
                  maxLength={80}
                  placeholder="Assunto (ex.: item ou regra)"
                  aria-label="Assunto do pedido"
                />
                <Input
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  maxLength={350}
                  placeholder="Explique ao mestre o pedido de exceção"
                  aria-label="Justificativa"
                  required
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                {reqMsg ? <span className="text-xs text-muted-foreground">{reqMsg}</span> : <span />}
                <Button type="submit" size="sm" variant="outline">
                  Pedir aprovação ao mestre
                </Button>
              </div>
            </form>
          )}
          {approvals.length > 0 && (
            <ul className="divide-y text-xs">
              {approvals.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate">
                    <strong>{a.contentId}:</strong> {a.reason}
                  </span>
                  <span className="shrink-0 font-medium">
                    {a.status === "pending" ? "Pendente" : a.status === "approved" ? "Aprovado" : "Recusado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold">Histórico de versões</h2>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSnapshot(summary);
            setSummary("");
          }}
        >
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Descreva este ponto (opcional)" maxLength={200} aria-label="Descrição da versão" />
          <Button type="submit" variant="outline" disabled={pending}>
            Salvar versão
          </Button>
        </form>
        <ol className="mt-3 divide-y rounded-md border">
          {versions.map((v) => (
            <li key={v.number} className="flex items-center justify-between gap-2 p-2.5 text-sm">
              <div>
                <span className="font-medium">v{v.number}</span> · {REASON_LABEL[v.reason] ?? v.reason} ·{" "}
                {engine.formatLevel ? engine.formatLevel(v.level, data) : `nível ${v.level}`}
                <p className="text-xs text-muted-foreground">
                  {v.summary} — {new Date(v.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onRestore(v.number)}>
                Restaurar
              </Button>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">Restaurar não apaga o histórico: cria uma nova versão com os dados antigos.</p>
      </div>
    </div>
  );
}
