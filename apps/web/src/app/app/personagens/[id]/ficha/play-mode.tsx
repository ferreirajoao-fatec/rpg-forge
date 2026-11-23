"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, Dices, Flame, Heart, Loader2, Moon, Plus, Search, ShieldAlert, Sparkles, Swords, X } from "lucide-react";
import { parseExtraPeCost, ritualCostSummary, type CharacterData } from "@rpg-forge/rules-engine";
import { rollDiceAction, type RollState } from "@/app/actions/dice";
import { saveSessionAction } from "@/app/actions/characters";
import { Badge } from "@rpg-forge/ui/components/badge";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Progress } from "@rpg-forge/ui/components/progress";
import { cn } from "@rpg-forge/ui/lib/utils";
import type { SheetData } from "./sheet-data";

type Session = CharacterData["session"];
type RollOk = Extract<RollState, { ok: true }>;

const signed = (n: number | null) => (n === null ? "+0" : n >= 0 ? `+${n}` : `${n}`);

function extractDamageFormula(raw: string): string | null {
  const m = raw.match(/(\d+d\d+(?:\s*[+-]\s*(?:\d+d\d+|\d+))?)/i);
  return m ? m[1].replace(/\s+/g, "") : null;
}

function ResourceControls({
  label,
  current,
  max,
  tone,
  alert,
  canEdit,
  onDelta,
  extra,
}: {
  label: string;
  current: number;
  max: number;
  tone: string;
  alert?: string;
  canEdit: boolean;
  onDelta: (delta: number) => void;
  extra?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          {alert && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3" aria-hidden /> {alert}
            </Badge>
          )}
        </div>
        <span className="font-heading text-xl font-bold tabular-nums">
          {current} <span className="text-sm font-normal text-muted-foreground">/ {max}</span>
        </span>
      </div>
      <Progress value={pct} className={tone} aria-label={`${label}: ${current} de ${max}`} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {[-5, -1, 1, 5].map((d) => (
            <Button key={d} type="button" size="xs" variant="outline" disabled={!canEdit} onClick={() => onDelta(d)}>
              {d > 0 ? `+${d}` : d}
            </Button>
          ))}
        </div>
        {extra}
      </div>
    </div>
  );
}

export function PlayMode({
  characterId,
  campaignId,
  canEdit,
  sheet: s,
  initialSession,
  conditionsCatalog,
}: {
  characterId: string;
  campaignId: string | null;
  canEdit: boolean;
  sheet: SheetData;
  initialSession: Session;
  conditionsCatalog: { id: string; name: string; summary: string }[];
}) {
  const op = s.flavor === "op";
  const usePd = Boolean(s.opMeta?.usePd);
  const maxHp = Number(s.stats.hp?.value ?? 1) || 1;
  const maxMp = Number(s.stats.mp?.value ?? 0) || 0;
  const maxSan = Number(s.stats.san?.value ?? 0) || 0;
  const maxPd = Number(s.stats.pd?.value ?? 0) || 0;
  const peLimit = Number(s.stats.peLimit?.value ?? maxMp) || 1;

  const [session, setSession] = useState<Session>(initialSession);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastRoll, setLastRoll] = useState<RollOk | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  const [shareToCampaign, setShareToCampaign] = useState(Boolean(campaignId));
  const [skillFilter, setSkillFilter] = useState("");
  const [customCond, setCustomCond] = useState("");
  const [castMode, setCastMode] = useState<Record<string, "base" | "discente" | "verdadeiro">>({});
  const [paranormalAlert, setParanormalAlert] = useState<{
    ritualName: string;
    total: number;
    dc: number;
    mentalLoss: number;
    permSanLoss: number;
    extraPdLoss: number;
  } | null>(null);
  const [rolling, startRoll] = useTransition();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSession = (next: Session) => {
    setSession(next);
    if (!canEdit) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const r = await saveSessionAction(characterId, next);
      setSaveState(r.ok ? "saved" : "error");
    }, 500);
  };

  const currentHp = session.currentHp ?? maxHp;
  const spentPe = session.spent.pe ?? 0;
  const spentSan = session.spent.san ?? 0;
  const spentSanPerm = session.spent.sanPerm ?? 0;
  const spentPd = session.spent.pd ?? 0;
  const spentPm = session.spent.pm ?? 0;

  const currentPe = Math.max(0, maxMp - spentPe);
  const effectiveMaxSan = Math.max(0, maxSan - spentSanPerm);
  const currentSan = Math.max(0, effectiveMaxSan - spentSan);
  const currentPd = Math.max(0, maxPd - spentPd);
  const currentPm = Math.max(0, maxMp - spentPm);

  const adjustHp = (delta: number) => {
    let nextTemp = session.tempHp;
    let nextHp = currentHp;
    if (delta < 0 && nextTemp > 0) {
      const absorbed = Math.min(nextTemp, -delta);
      nextTemp -= absorbed;
      nextHp += delta + absorbed;
    } else {
      nextHp = Math.min(maxHp, Math.max(0, currentHp + delta));
    }
    persistSession({ ...session, currentHp: nextHp, tempHp: nextTemp });
  };

  const adjustSpent = (key: string, maxVal: number, deltaVal: number) => {
    // deltaVal > 0 recupera recurso (diminui gasto), < 0 gasta recurso (aumenta gasto)
    const curSpent = session.spent[key] ?? 0;
    const nextSpent = Math.max(0, Math.min(maxVal, curSpent - deltaVal));
    persistSession({ ...session, spent: { ...session.spent, [key]: nextSpent } });
  };

  const fullRest = () => {
    persistSession({
      ...session,
      currentHp: maxHp,
      tempHp: 0,
      spent: {
        ...session.spent,
        pe: 0,
        san: 0,
        pd: 0,
        pm: 0,
      },
    });
  };

  const triggerRoll = (formula: string, rollLabel: string, onDone?: (r: RollOk) => void) => {
    startRoll(async () => {
      setRollError(null);
      setParanormalAlert(null);
      const r = await rollDiceAction({
        formula,
        label: rollLabel,
        characterId,
        campaignId: campaignId && shareToCampaign ? campaignId : undefined,
        shared: Boolean(campaignId && shareToCampaign),
      });
      if (r.ok) {
        setLastRoll(r);
        onDone?.(r);
      } else {
        setRollError(r.error);
      }
    });
  };

  const ocultismoSkill = useMemo(
    () => [...s.saves, ...s.skills].find((sk) => sk.name.toLocaleLowerCase("pt-BR") === "ocultismo"),
    [s.saves, s.skills],
  );

  const castOpRitual = (sp: SheetData["spells"][number]) => {
    const mode = castMode[sp.name] ?? "base";
    const extraCost =
      mode === "discente" ? parseExtraPeCost(sp.discente?.cost) : mode === "verdadeiro" ? parseExtraPeCost(sp.verdadeiro?.cost) : 0;
    const summary = ritualCostSummary({
      baseCost: sp.cost ?? 1,
      extraCost,
      peLimit,
      element: sp.elementId,
      usePd,
    });

    if (canEdit) {
      if (usePd) adjustSpent("pd", maxPd, -summary.totalPe);
      else adjustSpent("pe", maxMp, -summary.totalPe);
    }

    if (!summary.requiresOcultismoTest) {
      setParanormalAlert(null);
      return;
    }

    const formula = ocultismoSkill?.dice ?? "1d20";
    triggerRoll(formula, `Custo do Paranormal — ${sp.name} (${mode}, DT ${summary.ocultismoDc})`, (r) => {
      if (r.total < summary.ocultismoDc) {
        const diff = summary.ocultismoDc - r.total;
        setParanormalAlert({
          ritualName: sp.name,
          total: r.total,
          dc: summary.ocultismoDc,
          mentalLoss: summary.failMentalLoss,
          permSanLoss: diff >= 5 ? summary.failBy5PermanentSanLoss : 0,
          extraPdLoss: diff >= 5 ? summary.failBy5ExtraPdLoss : 0,
        });
      }
    });
  };

  const applyParanormalPenalty = () => {
    if (!paranormalAlert || !canEdit) return;
    if (usePd) {
      const loss = paranormalAlert.mentalLoss + paranormalAlert.extraPdLoss;
      adjustSpent("pd", maxPd, -loss);
    } else {
      const nextSanSpent = Math.min(maxSan, spentSan + paranormalAlert.mentalLoss);
      const nextPerm = Math.min(maxSan, spentSanPerm + paranormalAlert.permSanLoss);
      persistSession({ ...session, spent: { ...session.spent, san: nextSanSpent, sanPerm: nextPerm } });
    }
    setParanormalAlert(null);
  };

  const addCondition = (name: string) => {
    const clean = name.trim();
    if (!clean || session.conditions.includes(clean)) return;
    persistSession({ ...session, conditions: [...session.conditions, clean] });
  };
  const removeCondition = (name: string) => {
    persistSession({ ...session, conditions: session.conditions.filter((c) => c !== name) });
  };

  const conditionMap = useMemo(() => new Map(conditionsCatalog.map((c) => [c.name, c.summary])), [conditionsCatalog]);
  const allSkills = useMemo(() => [...s.saves, ...s.skills], [s.saves, s.skills]);
  const filteredSkills = useMemo(() => {
    const q = skillFilter.trim().toLocaleLowerCase("pt-BR");
    return q ? allSkills.filter((sk) => sk.name.toLocaleLowerCase("pt-BR").includes(q)) : allSkills;
  }, [allSkills, skillFilter]);

  const hpAlert = currentHp <= 0 ? (op ? "Morrendo" : "Caído") : currentHp <= Math.floor(maxHp / 2) ? (op ? "Machucado" : undefined) : undefined;
  const sanAlert = currentSan <= 0 ? "Enlouquecendo" : currentSan <= Math.floor(effectiveMaxSan / 2) ? "Perturbado" : undefined;
  const pdAlert = currentPd <= 0 ? "Enlouquecendo" : currentPd <= Math.floor(maxPd / 2) ? "Perturbado" : undefined;

  return (
    <div className="space-y-5">
      {/* Cabeçalho de status + compartilhamento */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3.5">
        <div>
          <h2 className="text-lg font-semibold">
            {s.name} <span className="text-sm font-normal text-muted-foreground">· {s.levelLabel ?? `Nível ${s.level}`}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {[s.className, s.classOption, s.opMeta ? `Patente ${s.opMeta.rank}` : "", `Defesa ${s.stats.defense?.value ?? "—"}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {campaignId && (
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={shareToCampaign}
                onChange={(e) => setShareToCampaign(e.target.checked)}
              />
              Compartilhar rolagens na campanha
            </label>
          )}
          {canEdit && (
            <Button type="button" size="sm" variant="outline" onClick={fullRest}>
              <Moon className="size-4" aria-hidden /> {op ? "Interlúdio (restaurar)" : "Descanso longo"}
            </Button>
          )}
          <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
            {saveState === "saving" && <><Loader2 className="size-3.5 animate-spin" /> Salvando…</>}
            {saveState === "saved" && <><Check className="size-3.5 text-success" /> Salvo</>}
            {saveState === "error" && <span className="text-destructive">Erro ao salvar</span>}
          </span>
        </div>
      </div>

      {/* Última rolagem */}
      {(lastRoll || rollError || paranormalAlert) && (
        <div aria-live="polite" className="space-y-2 rounded-lg border border-gold/50 bg-card p-4">
          {rollError && <p className="text-sm text-destructive">{rollError}</p>}
          {lastRoll && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{lastRoll.label || lastRoll.formula}</p>
                <p className="font-mono text-xs text-muted-foreground">{lastRoll.breakdown}</p>
              </div>
              <div className="text-right">
                <span className="font-heading text-4xl font-bold text-gold tabular-nums">{lastRoll.total}</span>
              </div>
            </div>
          )}
          {paranormalAlert && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-sm">
              <p>
                <strong>Custo do Paranormal ({paranormalAlert.ritualName}):</strong> {paranormalAlert.total} vs DT {paranormalAlert.dc} — falha! Sofre{" "}
                <strong>{paranormalAlert.mentalLoss}</strong> de dano mental
                {paranormalAlert.permSanLoss > 0 && ` + ${paranormalAlert.permSanLoss} SAN permanente`}
                {paranormalAlert.extraPdLoss > 0 && ` + ${paranormalAlert.extraPdLoss} PD adicional`}.
              </p>
              {canEdit && (
                <Button type="button" size="sm" variant="destructive" onClick={applyParanormalPenalty}>
                  Aplicar perda
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Barras de recursos vitais */}
      <div className={cn("grid gap-3", op && !usePd ? "md:grid-cols-3" : op || s.flavor === "t20" ? "md:grid-cols-2" : "md:grid-cols-1")}>
        <ResourceControls
          label="Pontos de Vida (PV)"
          current={currentHp}
          max={maxHp}
          tone="[&>[data-slot=progress-indicator]]:bg-destructive"
          alert={hpAlert}
          canEdit={canEdit}
          onDelta={adjustHp}
          extra={
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Temp:
              <Input
                type="number"
                min={0}
                className="h-7 w-16"
                disabled={!canEdit}
                value={session.tempHp}
                onChange={(e) => persistSession({ ...session, tempHp: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              />
            </label>
          }
        />

        {op && usePd && (
          <ResourceControls
            label="Pontos de Determinação (PD)"
            current={currentPd}
            max={maxPd}
            tone="[&>[data-slot=progress-indicator]]:bg-sky-600"
            alert={pdAlert}
            canEdit={canEdit}
            onDelta={(d) => adjustSpent("pd", maxPd, d)}
            extra={<span className="text-xs text-muted-foreground">Limite/turno: {peLimit} PD</span>}
          />
        )}

        {op && !usePd && (
          <>
            <ResourceControls
              label="Pontos de Esforço (PE)"
              current={currentPe}
              max={maxMp}
              tone="[&>[data-slot=progress-indicator]]:bg-amber-600"
              canEdit={canEdit}
              onDelta={(d) => adjustSpent("pe", maxMp, d)}
              extra={<span className="text-xs text-muted-foreground">Limite/turno: {peLimit} PE</span>}
            />
            <ResourceControls
              label="Sanidade (SAN)"
              current={currentSan}
              max={effectiveMaxSan}
              tone="[&>[data-slot=progress-indicator]]:bg-purple-600"
              alert={sanAlert}
              canEdit={canEdit}
              onDelta={(d) => adjustSpent("san", effectiveMaxSan, d)}
              extra={
                <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Perda permanente (Custo do Paranormal / Transcender)">
                  Perm. −:
                  <Input
                    type="number"
                    min={0}
                    max={maxSan}
                    className="h-7 w-14"
                    disabled={!canEdit}
                    value={spentSanPerm}
                    onChange={(e) =>
                      persistSession({
                        ...session,
                        spent: { ...session.spent, sanPerm: Math.max(0, Math.min(maxSan, Math.trunc(Number(e.target.value) || 0))) },
                      })
                    }
                  />
                </label>
              }
            />
          </>
        )}

        {s.flavor === "t20" && (
          <ResourceControls
            label="Pontos de Mana (PM)"
            current={currentPm}
            max={maxMp}
            tone="[&>[data-slot=progress-indicator]]:bg-blue-600"
            canEdit={canEdit}
            onDelta={(d) => adjustSpent("pm", maxMp, d)}
          />
        )}
      </div>

      {/* Condições ativas */}
      <section aria-labelledby="pm-cond" className="space-y-2 rounded-lg border bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="pm-cond" className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldAlert className="size-4 text-muted-foreground" aria-hidden /> Condições e ferimentos ativos
          </h3>
          {s.opMeta?.debilitatingInjuries && (
            <span className="text-xs text-muted-foreground">Ferimentos debilitantes ativos (–1d20 no atributo afetado)</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {session.conditions.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nenhuma condição ativa.</span>
          ) : (
            session.conditions.map((cond) => (
              <Badge key={cond} variant="secondary" className="gap-1 py-1" title={conditionMap.get(cond)}>
                {cond}
                {canEdit && (
                  <button type="button" onClick={() => removeCondition(cond)} aria-label={`Remover ${cond}`} className="ml-0.5 hover:text-destructive">
                    <X className="size-3" />
                  </button>
                )}
              </Badge>
            ))
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-1">
            {conditionsCatalog.length > 0 && (
              <select
                value=""
                onChange={(e) => e.target.value && addCondition(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
                aria-label="Adicionar condição do catálogo"
              >
                <option value="">+ Condição do livro</option>
                {conditionsCatalog
                  .filter((c) => !session.conditions.includes(c.name))
                  .map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                addCondition(customCond);
                setCustomCond("");
              }}
            >
              <Input
                value={customCond}
                onChange={(e) => setCustomCond(e.target.value)}
                placeholder="Outro efeito (ex.: Ferimento em FOR)"
                className="h-8 w-56 text-xs"
              />
              <Button type="submit" size="xs" variant="outline" disabled={!customCond.trim()}>
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </form>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        {/* Ataques */}
        <section aria-labelledby="pm-atk" className="space-y-2 rounded-lg border bg-card p-3.5">
          <h3 id="pm-atk" className="flex items-center gap-1.5 text-sm font-semibold">
            <Swords className="size-4 text-muted-foreground" aria-hidden /> Ataques rápidos
          </h3>
          <ul className="divide-y">
            {s.attacks.map((a, idx) => {
              const atkFormula = a.roll ?? `1d20${signed(a.test)}`;
              const dmgFormula = extractDamageFormula(a.damage);
              return (
                <li key={`${a.name}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {atkFormula} · Dano {a.damage} · Crítico {a.critical}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button type="button" size="xs" disabled={rolling} onClick={() => triggerRoll(atkFormula, `Ataque: ${a.name}`)}>
                      <Dices className="size-3.5" /> Atacar
                    </Button>
                    {dmgFormula && (
                      <Button type="button" size="xs" variant="outline" disabled={rolling} onClick={() => triggerRoll(dmgFormula, `Dano: ${a.name}`)}>
                        Dano
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Perícias */}
        <section aria-labelledby="pm-sk" className="space-y-2 rounded-lg border bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 id="pm-sk" className="flex items-center gap-1.5 text-sm font-semibold">
              <Heart className="size-4 text-muted-foreground" aria-hidden /> Rolar perícia
            </h3>
            <div className="relative w-44">
              <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-muted-foreground" aria-hidden />
              <Input value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} placeholder="Filtrar..." className="h-7 pl-7 text-xs" />
            </div>
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
            {filteredSkills.map((sk) => {
              const formula = sk.dice ?? `1d20${signed(sk.value)}`;
              return (
                <button
                  key={sk.name}
                  type="button"
                  disabled={rolling}
                  onClick={() => triggerRoll(formula, `Perícia: ${sk.name}`)}
                  className={cn(
                    "flex items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-muted",
                    sk.trained && "border-primary/40 bg-primary/5 font-medium",
                  )}
                >
                  <span className="truncate">{sk.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{sk.dice ?? signed(sk.value)}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Rituais / Magias */}
      {s.spells.length > 0 && (
        <section aria-labelledby="pm-spells" className="space-y-3 rounded-lg border bg-card p-3.5">
          <h3 id="pm-spells" className="flex items-center gap-1.5 text-sm font-semibold">
            {op ? <Flame className="size-4 text-muted-foreground" aria-hidden /> : <Sparkles className="size-4 text-muted-foreground" aria-hidden />}
            {op ? "Conjurador de Rituais (Custo do Paranormal)" : "Magias"}
          </h3>
          <ul className="space-y-2">
            {s.spells.map((sp) => {
              const mode = castMode[sp.name] ?? "base";
              const extraCost =
                mode === "discente" ? parseExtraPeCost(sp.discente?.cost) : mode === "verdadeiro" ? parseExtraPeCost(sp.verdadeiro?.cost) : 0;
              const sum = ritualCostSummary({ baseCost: sp.cost ?? 1, extraCost, peLimit, element: sp.elementId, usePd });
              return (
                <li key={sp.name} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {sp.name}
                        <Badge variant="outline">{sp.circle}º círc.</Badge>
                        {sp.element && <Badge variant="secondary">{sp.element}</Badge>}
                        {op && sum.exceedsLimit && <Badge variant="destructive">Acima do limite ({peLimit})</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[sp.execution, sp.range, sp.duration].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-1 text-xs">{sp.text}</p>
                      {sp.discente && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <strong>Discente ({sp.discente.cost}):</strong> {sp.discente.text}
                        </p>
                      )}
                      {sp.verdadeiro && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <strong>Verdadeiro ({sp.verdadeiro.cost}):</strong> {sp.verdadeiro.text}
                        </p>
                      )}
                    </div>
                    {op && (
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant={mode === "base" ? "default" : "outline"}
                            onClick={() => setCastMode((m) => ({ ...m, [sp.name]: "base" }))}
                          >
                            Padrão ({sp.cost ?? 1})
                          </Button>
                          {sp.discente && (
                            <Button
                              type="button"
                              size="xs"
                              variant={mode === "discente" ? "default" : "outline"}
                              onClick={() => setCastMode((m) => ({ ...m, [sp.name]: "discente" }))}
                            >
                              Discente ({sp.discente.cost})
                            </Button>
                          )}
                          {sp.verdadeiro && (
                            <Button
                              type="button"
                              size="xs"
                              variant={mode === "verdadeiro" ? "default" : "outline"}
                              onClick={() => setCastMode((m) => ({ ...m, [sp.name]: "verdadeiro" }))}
                            >
                              Verdadeiro ({sp.verdadeiro.cost})
                            </Button>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={rolling}
                          onClick={() => castOpRitual(sp)}
                          title={sum.requiresOcultismoTest ? `Gasta ${sum.totalPe} ${usePd ? "PD" : "PE"} e rola Ocultismo contra DT ${sum.ocultismoDc}` : `Gasta ${sum.totalPe} ${usePd ? "PD" : "PE"}`}
                        >
                          <Flame className="size-3.5" /> Conjurar ({sum.totalPe} {usePd ? "PD" : "PE"}
                          {sum.requiresOcultismoTest ? ` · DT ${sum.ocultismoDc}` : ""})
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Anotações de sessão */}
      <section aria-labelledby="pm-notes" className="space-y-1.5 rounded-lg border bg-card p-3.5">
        <label htmlFor="session-notes" id="pm-notes" className="text-sm font-semibold">
          Anotações da sessão
        </label>
        <textarea
          id="session-notes"
          rows={4}
          maxLength={4000}
          disabled={!canEdit}
          value={session.notes}
          onChange={(e) => persistSession({ ...session, notes: e.target.value })}
          placeholder="Pistas encontradas, munição restante, compromissos, ferimentos..."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </section>
    </div>
  );
}
