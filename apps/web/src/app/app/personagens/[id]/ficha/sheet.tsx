import { createElement, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BicepsFlexed,
  Brain,
  Coins,
  Crown,
  Eye,
  Feather,
  Footprints,
  Gauge,
  Gem,
  HeartPulse,
  Ruler,
  Shield,
  Shirt,
  Sparkles,
  Sword,
  Swords,
  Target,
  Wand,
  Weight,
  Zap,
} from "lucide-react";
import { cn } from "@rpg-forge/ui/lib/utils";
import type { SheetData } from "./sheet-data";
import type { SheetItem } from "./sheet-items";
import { ARCH_CLIP_ID, ArcaneCircle, ArchClipDef, ArchFrame, Corners, Parchment, RuneColumn, TitleFlourish } from "./sheet-art";
import { InventoryGrid } from "./inventory-grid";

const signed = (n: number | null) => (n === null ? "—" : n >= 0 ? `+${n}` : `${n}`);
const fmtNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Ícone de cada atributo, pela abreviação (iguais em Tormenta20 e no D&D traduzido). */
const ABILITY_ICON: Record<string, LucideIcon> = { FOR: BicepsFlexed, DES: Feather, CON: HeartPulse, INT: Brain, SAB: Eye, CAR: Crown };
function AbilityIcon({ abbr, className }: { abbr: string; className: string }) {
  return createElement(ABILITY_ICON[abbr.toUpperCase()] ?? Sparkles, { "aria-hidden": true, className });
}

const STAT_ICON: Record<string, LucideIcon> = {
  speed: Footprints,
  size: Ruler,
  initiative: Zap,
  proficiency: Target,
  armorPenalty: Weight,
  passivePerception: Eye,
  spellDc: Wand,
  spellAttack: Sparkles,
  spellSlots: Gem,
  stealth: Feather,
};
/** Valores que já aparecem nas barras ou no escudo de defesa. */
const STAT_ELSEWHERE = new Set(["hp", "mp", "defense", "hitDice"]);

/** Painel com moldura dupla e título centralizado entre florões. */
function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("ficha-panel", className)}>
      <h2 className="ficha-panel-title">
        <TitleFlourish />
        <span>{title}</span>
        <TitleFlourish flip />
      </h2>
      {children}
    </section>
  );
}

/** Barra horizontal (XP, PV, PM...). `fill` de 0 a 1; `blank` deixa espaço para anotar o valor atual. */
function Bar({ label, tone, fill, value, blank }: { label: string; tone: "xp" | "hp" | "mp" | "hd"; fill: number; value: ReactNode; blank?: boolean }) {
  return (
    <div className="ficha-bar-row">
      <span className="ficha-bar-label">{label}</span>
      <div className={cn("ficha-bar", `ficha-bar-${tone}`)}>
        <div className="ficha-bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%` }} />
        <span className="ficha-bar-text">
          {blank && <span className="ficha-bar-blank" aria-label="Valor atual, para anotar" />}
          {value}
        </span>
      </div>
    </div>
  );
}

function SkillRow({ name, ability, value, trained }: { name: string; ability: string; value: number | null; trained: boolean }) {
  return (
    <li className="ficha-skill">
      <AbilityIcon abbr={ability} className="size-3 shrink-0 text-[var(--sheet-bronze)]" />
      <span className={cn("truncate", trained && "font-semibold")}>{name}</span>
      {trained && <span className="ficha-pip" title="Treinada" aria-label="treinada" />}
      <span className="ml-auto text-[6.5pt] text-[var(--sheet-muted)]">{ability}</span>
      <span className="ficha-skill-value">{signed(value)}</span>
    </li>
  );
}

/** Espaços do círculo de equipamento, no sentido horário a partir do topo. */
const RING: { label: string; icon: LucideIcon; pick: (eq: SheetItem[], used: Set<SheetItem>) => SheetItem | undefined }[] = [
  { label: "Armadura", icon: Shirt, pick: (eq) => eq.find((i) => i.slot === "armadura") },
  { label: "Escudo", icon: Shield, pick: (eq) => eq.find((i) => i.slot === "escudo") },
  { label: "Arma secundária", icon: Swords, pick: (eq, used) => eq.find((i) => i.group === "arma" && !used.has(i)) },
  { label: "Acessório", icon: Gem, pick: (eq, used) => eq.find((i) => (i.slot === "acessorio" || i.slot === "artefato") && !used.has(i)) },
  { label: "Vestuário", icon: Footprints, pick: (eq) => eq.find((i) => i.slot === "vestuario") },
  { label: "Acessório", icon: Gem, pick: (eq, used) => eq.find((i) => (i.slot === "acessorio" || i.slot === "artefato") && !used.has(i)) },
  { label: "Arma principal", icon: Sword, pick: (eq) => eq.find((i) => i.group === "arma") },
  { label: "Outro", icon: Sparkles, pick: (eq, used) => eq.find((i) => !used.has(i)) },
];
/** Ordem de preenchimento: as escolhas mais específicas primeiro, para "Outro" ficar com o que sobrar. */
const RING_FILL_ORDER = [6, 0, 1, 2, 4, 3, 5, 7];

function EquipmentRing({ items }: { items: SheetItem[] }) {
  const equipped = items.filter((i) => i.equipped);
  const used = new Set<SheetItem>();
  const chosen: (SheetItem | undefined)[] = [];
  for (const idx of RING_FILL_ORDER) {
    const it = RING[idx].pick(equipped, used);
    if (it) used.add(it);
    chosen[idx] = it;
  }
  const rest = equipped.filter((i) => !used.has(i));
  return (
    <div>
      <div className="ficha-ring">
        <ArcaneCircle />
        {RING.map((slot, i) => {
          const a = -Math.PI / 2 + (i / RING.length) * Math.PI * 2;
          const it = chosen[i];
          return (
            <div
              key={i}
              className={cn("ficha-ring-slot", it && "ficha-ring-slot-full")}
              style={{ left: `${50 + 39 * Math.cos(a)}%`, top: `${50 + 39 * Math.sin(a)}%` }}
              title={it ? [it.name, it.detail].filter(Boolean).join(" · ") : `${slot.label}: vazio`}
            >
              <slot.icon aria-hidden className="size-4" />
              <span className="line-clamp-2">{it?.name ?? slot.label}</span>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <p className="mt-1 text-center text-[7pt] text-[var(--sheet-muted)]">Também equipado: {rest.map((i) => i.name).join(", ")}.</p>
      )}
    </div>
  );
}

/** Página de pergaminho com moldura, cantos e coluna de runas. */
function Page({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <article className={cn("ficha-page", className)} aria-label={label}>
      <Parchment />
      <Corners />
      <RuneColumn />
      <div className="ficha-content">{children}</div>
    </article>
  );
}

/** `portrait`: SVG do avatar gerado pelo motor (catálogo + cores validadas), seguro para embutir. */
export function CharacterSheet({ sheet: s, portrait }: { sheet: SheetData; portrait?: string }) {
  const stat = (k: string) => s.stats[k]?.value;
  const dnd = s.flavor === "dnd";
  const classLine = [s.className, s.classOption].filter(Boolean).join(" · ");
  const subtitle = [s.species, classLine, `Nível ${s.level}`].filter(Boolean).join("  •  ");
  const otherStats = Object.entries(s.stats).filter(([k]) => !STAT_ELSEWHERE.has(k));
  const hp = stat("hp");
  const xp = s.xp;

  return (
    <div className="ficha mx-auto space-y-6 print:space-y-0">
      <ArchClipDef />

      {/* ------------------------------ Página 1 ------------------------------ */}
      <Page label="Ficha do personagem, página 1">
        <header className="grid grid-cols-[46mm_1fr] gap-x-5">
          <div className="ficha-portrait-frame">
            <div className="ficha-portrait" style={{ clipPath: `url(#${ARCH_CLIP_ID})` }}>
              {portrait ? (
                <div className="size-full" role="img" aria-label={`Retrato de ${s.name || "personagem"}`} dangerouslySetInnerHTML={{ __html: portrait }} />
              ) : (
                <div className="grid size-full place-items-center text-center font-heading text-[7pt] uppercase tracking-wider text-[var(--sheet-muted)]">
                  Espaço para o retrato
                </div>
              )}
            </div>
            <ArchFrame />
          </div>

          <div className="flex min-w-0 flex-col pt-2">
            <div className="font-heading text-[7pt] uppercase tracking-[0.25em] text-[var(--sheet-muted)]">Nome do personagem</div>
            <h1 className="ficha-name">{s.name}</h1>
            <p className="ficha-subtitle">{subtitle}</p>
            {s.concept && <p className="mt-0.5 truncate text-[8.5pt] italic text-[var(--sheet-muted)]">{s.concept}</p>}

            <dl className="ficha-meta">
              <div>
                <dt>Jogador</dt>
                <dd>{s.player || " "}</dd>
              </div>
              <div>
                <dt>{dnd ? "Antecedente" : "Origem"}</dt>
                <dd>{s.origin || " "}</dd>
              </div>
              <div>
                <dt>{dnd ? "Proficiência" : "Divindade"}</dt>
                <dd>{dnd ? (stat("proficiency") ?? " ") : (s.deity ?? "Nenhuma")}</dd>
              </div>
              <div>
                <dt>Sistema</dt>
                <dd>{s.system}</dd>
              </div>
            </dl>

            <div className="mt-auto space-y-1.5 pt-2">
              {xp && (
                <Bar
                  label="Experiência"
                  tone="xp"
                  fill={xp.to ? (xp.current - xp.from) / (xp.to - xp.from) : 1}
                  value={xp.to ? `${fmtNumber(xp.current)} / ${fmtNumber(xp.to)} XP` : `${fmtNumber(xp.current)} XP · nível máximo`}
                />
              )}
              <Bar label="Vida" tone="hp" fill={1} blank value={`/ ${hp ?? "—"} PV`} />
              {dnd ? (
                <Bar label="Dados de vida" tone="hd" fill={1} blank value={`/ ${stat("hitDice") ?? "—"}`} />
              ) : (
                <Bar label="Mana" tone="mp" fill={1} blank value={`/ ${stat("mp") ?? "—"} PM`} />
              )}
            </div>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-[1fr_1fr_1fr] gap-3">
          <Panel title="Atributos">
            <ul className="space-y-1">
              {s.abilities.map((a) => {
                return (
                  <li key={a.key} className="ficha-ability" title={a.label}>
                    <AbilityIcon abbr={a.abbr} className="size-4 text-[var(--sheet-bronze)]" />
                    <span className="truncate">{a.label}</span>
                    <span className="ml-auto text-[7pt] tabular-nums text-[var(--sheet-muted)]">{a.score ?? "—"}</span>
                    <span className="ficha-ability-mod">{signed(a.modifier)}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Defesa">
            <div className="flex items-start gap-2">
              <div className="ficha-shield" aria-label={`${dnd ? "Classe de Armadura" : "Defesa"} ${stat("defense") ?? "—"}`}>
                <span className="font-heading text-[6.5pt] uppercase tracking-wider">{dnd ? "CA" : "Defesa"}</span>
                <span className="font-heading text-[19pt] font-bold leading-none">{stat("defense") ?? "—"}</span>
              </div>
              <ul className="min-w-0 flex-1 space-y-0.5 text-[8pt]">
                {s.saves.map((sk) => (
                  <li key={sk.name} className="flex items-baseline gap-1">
                    <span className={cn("truncate", sk.trained && "font-semibold")}>{sk.name}</span>
                    {sk.trained && <span className="ficha-pip" aria-label="proficiente" />}
                    <span className="ml-auto font-heading font-semibold tabular-nums">{signed(sk.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-2 text-[7pt] uppercase tracking-wider text-[var(--sheet-muted)]">
              <span>PV temporários</span>
              <span>Condições</span>
              <span className="ficha-blank" />
              <span className="ficha-blank" />
            </div>
          </Panel>

          <Panel title="Estatísticas">
            <ul className="space-y-0.5 text-[8pt]">
              {otherStats.map(([k, v]) => {
                const Icon = STAT_ICON[k] ?? Gauge;
                return (
                  <li key={k} className="flex items-baseline gap-1.5" title={v.detail}>
                    <Icon aria-hidden className="size-3 shrink-0 self-center text-[var(--sheet-bronze)]" />
                    <span className="truncate">{v.label}</span>
                    <span className="ml-auto text-right font-semibold tabular-nums">{v.value}</span>
                  </li>
                );
              })}
              {s.load && (
                <li className="flex items-baseline gap-1.5">
                  <Weight aria-hidden className="size-3 shrink-0 self-center text-[var(--sheet-bronze)]" />
                  <span>Carga</span>
                  <span className="ml-auto font-semibold tabular-nums">
                    {fmtNumber(s.load.carried)} / {fmtNumber(s.load.light)}
                  </span>
                </li>
              )}
            </ul>
          </Panel>
        </div>

        <div className="mt-3 grid grid-cols-[1.12fr_1fr] gap-3">
          <Panel title="Perícias">
            <ul className="columns-2 gap-3 text-[7.8pt]">
              {s.skills.map((sk) => (
                <SkillRow key={sk.name} {...sk} />
              ))}
            </ul>
            <p className="mt-1 text-[6.3pt] leading-tight text-[var(--sheet-muted)]">
              {dnd
                ? `◆ proficiente. Valores já incluem atributo e proficiência.${stat("passivePerception") !== undefined ? ` Percepção passiva ${stat("passivePerception")}.` : ""}`
                : "◆ treinada. Valores já incluem atributo, treino, metade do nível e penalidades."}
            </p>
          </Panel>
          <Panel title="Equipamento">
            <EquipmentRing items={s.equipment} />
          </Panel>
        </div>

        <div className="mt-3 grid grid-cols-[1.12fr_1fr] gap-3">
          <Panel title="Ataques">
            <table className="w-full text-[8pt]">
              <thead>
                <tr className="text-left font-heading text-[6.3pt] uppercase tracking-wider text-[var(--sheet-muted)]">
                  <th className="font-normal">Arma</th>
                  <th className="w-11 px-1 text-center font-normal">{dnd ? "Ataque" : "Teste"}</th>
                  <th className="px-1 font-normal">Dano</th>
                  <th className="w-10 text-center font-normal">Crítico</th>
                </tr>
              </thead>
              <tbody>
                {s.attacks.map((a, i) => (
                  <tr key={`${a.name}-${i}`} className="border-t border-[var(--sheet-line)]/40 align-top">
                    <td className="py-0.5 pr-1">
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-[6.3pt] text-[var(--sheet-muted)]">
                        {[a.type, a.range && `alcance ${a.range.toLowerCase()}`].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="text-center font-heading font-semibold tabular-nums">{signed(a.test)}</td>
                    <td className="px-1 tabular-nums">{a.damage}</td>
                    <td className="text-center tabular-nums">{a.critical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Notas e história">
            {s.narrative.backstory || s.narrative.appearance ? (
              <p className="line-clamp-[10] whitespace-pre-line text-[8pt] leading-snug">
                {[s.narrative.appearance, s.narrative.backstory].filter(Boolean).join("\n\n")}
              </p>
            ) : (
              <div className="ficha-lines h-28" />
            )}
          </Panel>
        </div>
      </Page>

      {/* ------------------------------ Página 2 ------------------------------ */}
      <Page label="Ficha do personagem, página 2" className="break-before-page">
        <div className="grid grid-cols-[1fr_42mm] gap-3">
          <Panel title="Inventário">
            <InventoryGrid items={s.equipment} />
            {s.load && (
              <p className="mt-1.5 text-[7pt] text-[var(--sheet-muted)]">
                Carga: {fmtNumber(s.load.carried)} de {fmtNumber(s.load.light)} (leve) · máximo {fmtNumber(s.load.max)}
                {s.load.state === "encumbered" ? " · sobrecarregado" : s.load.state === "overloaded" ? " · acima do máximo" : ""}
              </p>
            )}
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="Bolsa">
              <ul className="space-y-1.5">
                {s.money.map((m) => (
                  <li key={m.abbr} className="flex items-center gap-2" title={m.label}>
                    <span className="ficha-coin">
                      <Coins aria-hidden className="size-2.5" />
                      {m.abbr}
                    </span>
                    <span className="flex-1 border-b border-[var(--sheet-line)] text-right font-heading text-[11pt] tabular-nums">{fmtNumber(m.amount)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Proficiências" className="flex-1">
              <p className="text-[7.5pt] leading-snug">{s.proficiencies.join(", ")}.</p>
            </Panel>
          </div>
        </div>

        <Panel title={dnd ? "Traços e características" : "Habilidades de raça, classe e origem"} className="mt-3">
          {s.traits.length ? (
            <ul className="columns-2 gap-5 text-[8pt] leading-snug">
              {s.traits.map((t, i) => (
                <li key={`${t.name}-${i}`} className="mb-1.5 break-inside-avoid">
                  <span className="font-semibold">{t.name}</span> <span className="text-[6.5pt] text-[var(--sheet-muted)]">({t.from})</span>. {t.text}
                </li>
              ))}
            </ul>
          ) : (
            <div className="ficha-lines h-28" />
          )}
        </Panel>

        <Panel title={dnd ? "Talentos" : "Poderes"} className="mt-3">
          {s.powers.length ? (
            <ul className="columns-2 gap-5 text-[8pt] leading-snug">
              {s.powers.map((p) => (
                <li key={p.name} className="mb-1.5 break-inside-avoid">
                  <span className="font-semibold">{p.name}.</span> {p.text}
                </li>
              ))}
            </ul>
          ) : (
            <div className="ficha-lines h-20" />
          )}
        </Panel>

        {s.spells.length > 0 && (
          <Panel title="Magias" className="mt-3">
            <table className="w-full text-[8pt]">
              <thead>
                <tr className="text-left font-heading text-[6.3pt] uppercase tracking-wider text-[var(--sheet-muted)]">
                  <th className="font-normal">Magia</th>
                  <th className="w-10 text-center font-normal">{dnd ? "Nível" : "Círc."}</th>
                  {!dnd && <th className="w-8 text-center font-normal">PM</th>}
                  <th className="font-normal">Execução · alcance · duração</th>
                </tr>
              </thead>
              <tbody>
                {s.spells.map((sp) => (
                  <tr key={sp.name} className="border-t border-[var(--sheet-line)]/40 align-top">
                    <td className="py-0.5 pr-2">
                      <span className="font-semibold">{sp.name}</span>
                      <span className="block text-[7pt] leading-snug">{sp.text}</span>
                    </td>
                    <td className="text-center tabular-nums">{dnd && sp.circle === 0 ? "Truque" : `${sp.circle}º`}</td>
                    {!dnd && <td className="text-center font-semibold tabular-nums">{sp.cost}</td>}
                    <td className="text-[7pt]">{[sp.execution, sp.range, sp.duration].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Panel title="Personalidade">
            <p className="min-h-16 whitespace-pre-line text-[8pt] leading-snug">{s.narrative.personality || " "}</p>
          </Panel>
          <Panel title="Ideais, laços e defeitos">
            <p className="min-h-16 whitespace-pre-line text-[8pt] leading-snug">
              {[s.narrative.ideals, s.narrative.bonds, s.narrative.flaws].filter(Boolean).join("\n\n") || " "}
            </p>
          </Panel>
        </div>
        {s.narrative.backstory && s.narrative.backstory.length > 600 && (
          <Panel title="História completa" className="mt-3">
            <p className="whitespace-pre-line text-[8pt] leading-snug">{s.narrative.backstory}</p>
          </Panel>
        )}
        <Panel title="Anotações de jogo" className="mt-3">
          <div className="ficha-lines h-28" />
        </Panel>
        {s.pending.length > 0 && <p className="mt-3 text-[7pt] text-[var(--sheet-muted)] print:hidden">Pendências: {s.pending.join(" ")}</p>}
      </Page>
    </div>
  );
}
