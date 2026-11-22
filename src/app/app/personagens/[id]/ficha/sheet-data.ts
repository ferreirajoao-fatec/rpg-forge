import { getEngine, type Catalog, type CharacterData, type ContentEntry } from "@/rules";

/** Tudo o que a ficha impressa mostra, já calculado pelo motor de regras. */
export interface SheetData {
  name: string;
  player: string;
  system: string;
  level: number;
  experience?: number;
  className?: string;
  classOption?: string;
  species?: string;
  origin?: string;
  deity?: string;
  concept: string;
  abilities: { key: string; abbr: string; label: string; score: number | null; modifier: number | null }[];
  saves: SkillLine[];
  skills: SkillLine[];
  stats: Record<string, { label: string; value: number | string; detail?: string }>;
  attacks: { name: string; test: number | null; damage: string; critical: string; type: string; range?: string }[];
  traits: { name: string; from: string; text: string }[];
  powers: { name: string; text: string }[];
  spells: { name: string; circle: number; cost: number; execution?: string; range?: string; duration?: string; text: string }[];
  proficiencies: string[];
  equipment: { name: string; quantity: number; equipped: boolean; weight?: number; detail?: string }[];
  money: { abbr: string; label: string; amount: number }[];
  load?: { carried: number; light: number; max: number; state: string };
  narrative: CharacterData["narrative"];
  pending: string[];
}

interface SkillLine {
  name: string;
  ability: string;
  value: number | null;
  trained: boolean;
}

const SAVES = new Set(["skill:fortitude", "skill:reflexos", "skill:vontade"]);
/** Custo em PM por círculo de magia (p. 172). */
const SPELL_COST: Record<number, number> = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 };

/** Armas de disparo que não somam a Força no dano; armas de arremesso e a funda somam. */
const NO_STRENGTH_DAMAGE = new Set([
  "equipment:arco-curto", "equipment:arco-longo", "equipment:besta-leve", "equipment:besta-pesada",
  "equipment:mosquete", "equipment:pistola", "equipment:rede",
]);

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function buildSheet(c: CharacterData, rulesetId: string, catalog: Catalog, player: string): SheetData {
  const engine = getEngine(rulesetId);
  const d = engine.derive(c, catalog);
  const hasAbilities = engine.abilities.every((a) => c.baseAbilities[a.key] !== undefined);
  const abbrOf = new Map(engine.abilities.map((a) => [a.key, a.abbr]));
  const get = (id?: string) => (id ? catalog.get(id) : undefined);

  const cls = get(c.classes[0]?.classId);
  const choiceEntries = c.choices.map((ch) => ({ ch, entry: get(ch.contentId) })).filter((x): x is { ch: typeof x.ch; entry: ContentEntry } => !!x.entry);
  const ofSlot = (prefix: string) => choiceEntries.filter((x) => x.ch.slot.startsWith(prefix));

  // Perícias e resistências.
  const skillLines: (SkillLine & { id: string })[] = (d.skills ?? []).map((s) => {
    const entry = get(s.id);
    const ability = str(entry?.data.ability);
    return { id: s.id, name: s.name, ability: ability ? (abbrOf.get(ability) ?? ability) : "", value: hasAbilities ? s.value : null, trained: s.trained };
  });

  // Estatísticas (PV, PM, Defesa, deslocamento...).
  const stats: SheetData["stats"] = {};
  for (const s of d.stats ?? []) stats[s.key] = { label: s.label, value: s.value, detail: s.detail };

  // Ataques: armas equipadas e o ataque desarmado.
  const skillValue = (id: string) => skillLines.find((s) => s.id === id)?.value ?? null;
  const forMod = hasAbilities ? d.abilities.for?.modifier ?? 0 : 0;
  const attacks: SheetData["attacks"] = [];
  for (const item of c.inventory) {
    if (!item.equipped || !item.contentId) continue;
    const e = get(item.contentId);
    // Armas mágicas específicas apontam para a arma-base.
    const base = e && e.data.category !== "arma" ? get(str(e.data.baseItemId)) : e;
    if (!e || !base || base.data.category !== "arma") continue;
    // Armas de disparo usam Pontaria; as demais (inclusive de arremesso usadas de perto) usam Luta.
    const ranged = base.data.grip === "distancia";
    const addsStrength = !NO_STRENGTH_DAMAGE.has(base.id);
    const dmg = str(base.data.damage) ?? "—";
    attacks.push({
      name: item.customName || e.name,
      test: skillValue(ranged ? "skill:pontaria" : "skill:luta"),
      damage: !addsStrength || !hasAbilities || forMod === 0 ? dmg : `${dmg}${signed(forMod)}`,
      critical: str(base.data.critical) ?? "20",
      type: str(base.data.damageType) ?? "",
      range: str(base.data.range),
    });
  }
  attacks.push({
    name: "Ataque desarmado",
    test: skillValue("skill:luta"),
    damage: hasAbilities && forMod !== 0 ? `1d3${signed(forMod)}` : "1d3",
    critical: "20",
    type: "Impacto (não letal)",
  });

  // Habilidades: raça, classe (até o nível atual), escolhas da classe, origem.
  const traits: SheetData["traits"] = [];
  const sp = get(c.speciesId);
  for (const t of (sp?.data.traits as { name: string; summary: string }[] | undefined) ?? []) {
    traits.push({ name: t.name, from: sp!.name, text: t.summary });
  }
  for (const f of (cls?.data.features as { level: number; name: string; summary: string }[] | undefined) ?? []) {
    if (f.level <= c.level) traits.push({ name: f.name, from: `${cls!.name} ${f.level}º`, text: f.summary });
  }
  for (const { entry } of ofSlot("class-option:")) traits.push({ name: entry.name.replace(/^.*?:\s*/, ""), from: cls?.name ?? "Classe", text: entry.summary });
  const origin = get(c.backgroundId);
  const unique = origin?.data.uniquePower as { name: string; summary: string } | undefined;
  for (const { ch, entry } of ofSlot("origin-benefit:")) {
    if (ch.slot === "origin-benefit:unique" && unique) traits.push({ name: unique.name, from: origin!.name, text: unique.summary });
    else if (entry.kind === "power") traits.push({ name: entry.name, from: origin?.name ?? "Origem", text: entry.summary });
    else if (ch.slot.startsWith("origin-benefit:open:")) traits.push({ name: ch.slot.slice("origin-benefit:open:".length), from: origin?.name ?? "Origem", text: "Poder escolhido na etapa Poderes." });
  }

  const originPowerIds = new Set(ofSlot("origin-benefit:").map((x) => x.entry.id));
  const powers = choiceEntries
    .filter((x) => x.entry.kind === "power" && !originPowerIds.has(x.entry.id))
    .map((x) => ({ name: x.entry.name, text: x.entry.summary }));

  const spells = choiceEntries
    .filter((x) => x.entry.kind === "spell")
    .map(({ entry }) => {
      const circle = Number(entry.data.circle) || 1;
      return {
        name: entry.name,
        circle,
        cost: SPELL_COST[circle] ?? circle,
        execution: str(entry.data.execution),
        range: str(entry.data.range),
        duration: str(entry.data.duration),
        text: entry.summary,
      };
    })
    .sort((a, b) => a.circle - b.circle || a.name.localeCompare(b.name, "pt-BR"));

  const proficiencies = ["Armas simples", "Armaduras leves", ...((cls?.data.proficiencies as string[] | undefined) ?? []).map((p) => p[0].toUpperCase() + p.slice(1))];
  if (choiceEntries.some((x) => x.entry.id === "power:proficiencia")) proficiencies.push("Proficiência (poder)");

  const inv = d.inventory;
  const currencies = engine.currencies ?? [];

  return {
    name: c.name || "Sem nome",
    player,
    system: engine.meta.name,
    level: d.level,
    experience: c.progressionMode === "xp" ? c.experience : undefined,
    className: cls?.name,
    classOption: ofSlot("class-option:")[0]?.entry.name.replace(/^.*?:\s*/, ""),
    species: sp?.name,
    origin: origin?.name,
    deity: ofSlot("deity")[0]?.entry.name,
    concept: c.concept,
    abilities: engine.abilities.map((a) => ({
      key: a.key,
      abbr: a.abbr,
      label: a.label,
      score: hasAbilities ? d.abilities[a.key].score : null,
      modifier: hasAbilities ? d.abilities[a.key].modifier : null,
    })),
    saves: skillLines.filter((s) => SAVES.has(s.id)),
    skills: skillLines.filter((s) => !SAVES.has(s.id)),
    stats,
    attacks,
    traits,
    powers,
    spells,
    proficiencies,
    equipment: (inv?.rows ?? []).map((r) => ({ name: r.name, quantity: r.quantity, equipped: r.equipped, weight: r.weight, detail: r.detail })),
    money: currencies.map((cur) => ({ abbr: cur.abbr, label: cur.label, amount: c.currency[cur.key] ?? 0 })),
    load: inv?.load ? { carried: inv.totalWeight, light: inv.load.light, max: inv.load.max, state: inv.load.state } : undefined,
    narrative: c.narrative,
    pending: d.pending,
  };
}
