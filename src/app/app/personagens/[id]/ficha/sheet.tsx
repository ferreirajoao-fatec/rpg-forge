import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SheetData } from "./sheet-data";

const signed = (n: number | null) => (n === null ? "—" : n >= 0 ? `+${n}` : `${n}`);
const fmtNumber = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Faixa de pergaminho usada nos títulos. */
function Ribbon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("ficha-ribbon font-heading text-[11pt] font-semibold uppercase tracking-wide", className)}>
      <span>{children}</span>
    </div>
  );
}

function Box({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("ficha-box flex flex-col", className)}>
      <Ribbon className="-mx-1 -mt-3 mb-2 self-center">{title}</Ribbon>
      {children}
    </section>
  );
}

/** Linha escrita à mão na ficha: rótulo pequeno sob o valor. */
function Field({ label, value, className }: { label: string; value?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="min-h-[1.4em] truncate border-b border-[var(--sheet-line)] pb-0.5 text-[10.5pt] font-medium">{value || " "}</div>
      <div className="font-heading text-[7pt] uppercase tracking-wider text-[var(--sheet-muted)]">{label}</div>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[9px] shrink-0 rounded-full border border-[var(--sheet-ink)]", on && "bg-[var(--sheet-ink)]")}
    />
  );
}

function Stat({ label, value, note, big }: { label: string; value?: ReactNode; note?: string; big?: boolean }) {
  return (
    <div className="ficha-stat flex flex-col items-center justify-between text-center">
      <div className="font-heading text-[6.5pt] uppercase leading-tight tracking-wide text-[var(--sheet-muted)]">{label}</div>
      <div className={cn("font-heading font-semibold leading-none", big ? "text-[22pt]" : "text-[15pt]")}>{value ?? "—"}</div>
      {note ? <div className="text-[7pt] text-[var(--sheet-muted)]">{note}</div> : <div className="h-[9pt]" />}
    </div>
  );
}

/** Caixa com o máximo impresso e espaço em branco para anotar o valor atual durante o jogo. */
function Tracker({ label, max }: { label: string; max?: number | string }) {
  return (
    <div className="ficha-stat grid grid-cols-2 items-end gap-2">
      <div className="col-span-2 text-center font-heading text-[8pt] font-semibold uppercase tracking-wider">{label}</div>
      <div className="text-center">
        <div className="h-[24pt] rounded-sm border border-dashed border-[var(--sheet-line)]" />
        <div className="text-[6.5pt] uppercase tracking-wider text-[var(--sheet-muted)]">Atuais</div>
      </div>
      <div className="text-center">
        <div className="font-heading text-[18pt] font-semibold leading-[24pt]">{max ?? "—"}</div>
        <div className="text-[6.5pt] uppercase tracking-wider text-[var(--sheet-muted)]">Máximo</div>
      </div>
    </div>
  );
}

export function CharacterSheet({ sheet: s }: { sheet: SheetData }) {
  const stat = (k: string) => s.stats[k]?.value;
  const classLine = [s.className, s.classOption].filter(Boolean).join(" · ");
  return (
    <div className="ficha mx-auto space-y-6 print:space-y-0">
      {/* ------------------------------ Página 1 ------------------------------ */}
      <article className="ficha-page" aria-label="Ficha do personagem, página 1">
        {/* Cabeçalho: dados à esquerda e à direita, retrato no centro, nome na faixa */}
        <header className="relative">
          <div className="ficha-box ficha-header grid grid-cols-[1fr_118px_1fr] gap-x-4">
            <div className="space-y-2">
              <Field label="Jogador" value={s.player} />
              <Field label="Nível" value={`${s.level}º${s.experience !== undefined ? ` · ${fmtNumber(s.experience)} XP` : ""}`} />
              <Field label="Origem" value={s.origin} />
              <Field label="Divindade" value={s.deity ?? "Nenhuma"} />
            </div>
            <div className="flex items-start justify-center">
              <div className="ficha-portrait" aria-label="Espaço para o retrato" />
            </div>
            <div className="space-y-2">
              <Field label="Tamanho" value={stat("size")} />
              <Field label="Deslocamento" value={stat("speed")} />
              <Field label="Sistema" value={s.system} />
              <Field label="Conceito" value={s.concept} />
            </div>
          </div>
          <div className="relative -mt-7 grid grid-cols-[1fr_1.6fr_1fr] items-end gap-1 px-1">
            <Ribbon className="ficha-ribbon-side text-center">
              <span className="block text-[6.5pt] tracking-widest opacity-70">Classe</span>
              <span className="block truncate text-[10pt] normal-case">{classLine || " "}</span>
            </Ribbon>
            <Ribbon className="ficha-ribbon-main text-center">
              <span className="block text-[6.5pt] tracking-widest opacity-70">Nome do personagem</span>
              <span className="block truncate text-[15pt] normal-case">{s.name}</span>
            </Ribbon>
            <Ribbon className="ficha-ribbon-side text-center">
              <span className="block text-[6.5pt] tracking-widest opacity-70">Raça</span>
              <span className="block truncate text-[10pt] normal-case">{s.species || " "}</span>
            </Ribbon>
          </div>
        </header>

        <div className="mt-3 grid grid-cols-[74px_1fr_1.08fr] gap-3">
          {/* Atributos */}
          <div className="flex flex-col gap-2">
            {s.abilities.map((a) => (
              <div key={a.key} className="ficha-ability" title={a.label}>
                <div className="font-heading text-[7.5pt] font-semibold tracking-wider">{a.abbr}</div>
                <div className="font-heading text-[17pt] font-semibold leading-none">{signed(a.modifier)}</div>
                <div className="ficha-ability-score">{a.score ?? "—"}</div>
              </div>
            ))}
          </div>

          {/* Resistências e perícias */}
          <div className="flex flex-col gap-3">
            <Box title="Resistências">
              <ul className="space-y-0.5 text-[9pt]">
                {s.saves.map((sk) => (
                  <li key={sk.name} className="flex items-center gap-1.5">
                    <Dot on={sk.trained} />
                    <span className="w-8 border-b border-[var(--sheet-line)] text-center font-semibold tabular-nums">{signed(sk.value)}</span>
                    <span>{sk.name}</span>
                    <span className="ml-auto text-[7pt] text-[var(--sheet-muted)]">{sk.ability}</span>
                  </li>
                ))}
              </ul>
            </Box>
            <Box title="Perícias" className="flex-1">
              <ul className="text-[8.5pt] leading-[1.32]">
                {s.skills.map((sk) => (
                  <li key={sk.name} className="flex items-center gap-1.5">
                    <Dot on={sk.trained} />
                    <span className="w-8 border-b border-[var(--sheet-line)] text-center font-semibold tabular-nums">{signed(sk.value)}</span>
                    <span className="truncate">{sk.name}</span>
                    <span className="ml-auto text-[7pt] text-[var(--sheet-muted)]">{sk.ability}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[6.5pt] text-[var(--sheet-muted)]">● treinada. Valores já incluem atributo, treino, metade do nível e penalidades.</p>
            </Box>
          </div>

          {/* Combate */}
          <div className="flex flex-col gap-3">
            <div className="ficha-box grid grid-cols-2 gap-2">
              <Tracker label="Pontos de vida" max={stat("hp")} />
              <Tracker label="Pontos de mana" max={stat("mp")} />
              <div className="col-span-2 grid grid-cols-3 gap-2">
                <div className="ficha-shield">
                  <div className="font-heading text-[7.5pt] uppercase tracking-wider">Defesa</div>
                  <div className="font-heading text-[20pt] font-semibold leading-none">{stat("defense") ?? "—"}</div>
                </div>
                <Stat label="Deslocamento" value={stat("speed")} />
                <Stat label="Penal. armadura" value={stat("armorPenalty") ?? 0} />
              </div>
              <div className="col-span-2 flex items-center gap-2 text-[8pt]">
                <span className="font-heading uppercase tracking-wider text-[var(--sheet-muted)]">PV temporários</span>
                <span className="h-4 flex-1 border-b border-dashed border-[var(--sheet-line)]" />
                <span className="font-heading uppercase tracking-wider text-[var(--sheet-muted)]">Condições</span>
                <span className="h-4 flex-1 border-b border-dashed border-[var(--sheet-line)]" />
              </div>
            </div>

            <Box title="Ataques">
              <table className="w-full text-[8.5pt]">
                <thead>
                  <tr className="text-left font-heading text-[6.5pt] uppercase tracking-wider text-[var(--sheet-muted)]">
                    <th className="font-normal">Arma</th>
                    <th className="w-11 px-1 text-center font-normal">Teste</th>
                    <th className="px-1 font-normal">Dano</th>
                    <th className="w-10 text-center font-normal">Crítico</th>
                  </tr>
                </thead>
                <tbody>
                  {s.attacks.map((a, i) => (
                    <tr key={`${a.name}-${i}`} className="border-t border-[var(--sheet-line)]/40 align-top">
                      <td className="py-0.5 pr-1">
                        <span className="font-medium">{a.name}</span>
                        <span className="block text-[6.5pt] text-[var(--sheet-muted)]">
                          {[a.type, a.range && `alcance ${a.range.toLowerCase()}`].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="text-center font-semibold tabular-nums">{signed(a.test)}</td>
                      <td className="px-1 tabular-nums">{a.damage}</td>
                      <td className="text-center tabular-nums">{a.critical}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>

            <Box title="Proficiências">
              <p className="text-[8.5pt] leading-snug">{s.proficiencies.join(", ")}.</p>
            </Box>
          </div>
        </div>

        {/* Equipamento e dinheiro */}
        <div className="mt-3 grid grid-cols-[1fr_150px] gap-3">
          <Box title="Equipamento">
            {s.equipment.length ? (
              <ul className="columns-2 gap-4 text-[8.5pt]">
                {s.equipment.map((it, i) => (
                  <li key={`${it.name}-${i}`} className="flex break-inside-avoid items-baseline gap-1 border-b border-[var(--sheet-line)]/40 py-0.5">
                    <span className="w-5 text-right tabular-nums text-[var(--sheet-muted)]">{it.quantity}×</span>
                    <span className={cn("truncate", it.equipped && "font-semibold")}>{it.name}</span>
                    {it.equipped && <span className="text-[6.5pt] uppercase text-[var(--sheet-accent)]">equipado</span>}
                    {it.weight !== undefined && it.weight > 0 && <span className="ml-auto text-[7pt] text-[var(--sheet-muted)]">{fmtNumber(it.weight)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ficha-lines h-24" />
            )}
            {s.load && (
              <p className="mt-1.5 text-[7.5pt] text-[var(--sheet-muted)]">
                Carga: {fmtNumber(s.load.carried)} de {fmtNumber(s.load.light)} (leve) · máximo {fmtNumber(s.load.max)}
                {s.load.state === "encumbered" ? " · sobrecarregado" : s.load.state === "overloaded" ? " · acima do máximo" : ""}
              </p>
            )}
          </Box>
          <Box title="Dinheiro">
            <ul className="space-y-1.5">
              {s.money.map((m) => (
                <li key={m.abbr} className="flex items-baseline gap-2">
                  <span className="ficha-coin">{m.abbr}</span>
                  <span className="flex-1 border-b border-[var(--sheet-line)] text-right font-heading text-[12pt] tabular-nums">{fmtNumber(m.amount)}</span>
                </li>
              ))}
            </ul>
          </Box>
        </div>
      </article>

      {/* ------------------------------ Página 2 ------------------------------ */}
      <article className="ficha-page break-before-page" aria-label="Ficha do personagem, página 2">
        <div className="grid grid-cols-2 gap-3">
          <Box title="Habilidades de raça, classe e origem" className="col-span-2">
            {s.traits.length ? (
              <ul className="columns-2 gap-5 text-[8.5pt] leading-snug">
                {s.traits.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="mb-1.5 break-inside-avoid">
                    <span className="font-semibold">{t.name}</span> <span className="text-[7pt] text-[var(--sheet-muted)]">({t.from})</span>. {t.text}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ficha-lines h-32" />
            )}
          </Box>

          <Box title="Poderes" className="col-span-2">
            {s.powers.length ? (
              <ul className="columns-2 gap-5 text-[8.5pt] leading-snug">
                {s.powers.map((p) => (
                  <li key={p.name} className="mb-1.5 break-inside-avoid">
                    <span className="font-semibold">{p.name}.</span> {p.text}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ficha-lines h-24" />
            )}
          </Box>

          {s.spells.length > 0 && (
            <Box title="Magias" className="col-span-2">
              <table className="w-full text-[8.5pt]">
                <thead>
                  <tr className="text-left font-heading text-[6.5pt] uppercase tracking-wider text-[var(--sheet-muted)]">
                    <th className="font-normal">Magia</th>
                    <th className="w-8 text-center font-normal">Círc.</th>
                    <th className="w-8 text-center font-normal">PM</th>
                    <th className="font-normal">Execução · alcance · duração</th>
                  </tr>
                </thead>
                <tbody>
                  {s.spells.map((sp) => (
                    <tr key={sp.name} className="border-t border-[var(--sheet-line)]/40 align-top">
                      <td className="py-0.5 pr-2">
                        <span className="font-semibold">{sp.name}</span>
                        <span className="block text-[7.5pt] leading-snug">{sp.text}</span>
                      </td>
                      <td className="text-center tabular-nums">{sp.circle}º</td>
                      <td className="text-center font-semibold tabular-nums">{sp.cost}</td>
                      <td className="text-[7.5pt]">{[sp.execution, sp.range, sp.duration].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          )}

          <Box title="Aparência e personalidade">
            <p className="min-h-20 whitespace-pre-line text-[8.5pt] leading-snug">
              {[s.narrative.appearance, s.narrative.personality].filter(Boolean).join("\n\n") || " "}
            </p>
          </Box>
          <Box title="Ideais, laços e defeitos">
            <p className="min-h-20 whitespace-pre-line text-[8.5pt] leading-snug">
              {[s.narrative.ideals, s.narrative.bonds, s.narrative.flaws].filter(Boolean).join("\n\n") || " "}
            </p>
          </Box>
          <Box title="História" className="col-span-2">
            <p className="whitespace-pre-line text-[8.5pt] leading-snug">{s.narrative.backstory || " "}</p>
          </Box>
          <Box title="Anotações de jogo" className="col-span-2">
            <div className="ficha-lines h-28" />
          </Box>
        </div>
        {s.pending.length > 0 && <p className="mt-3 text-[7pt] text-[var(--sheet-muted)] print:hidden">Pendências: {s.pending.join(" ")}</p>}
      </article>
    </div>
  );
}
