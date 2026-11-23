import {
  formatOpCategory,
  getEngine,
  OP_OPTIONAL_RULES,
  opDiceFormula,
  type Catalog,
  type CharacterData,
  type ContentEntry,
} from "@rpg-forge/rules-engine";
import type { SheetData, SkillLine } from "./sheet-data";
import { sheetItems } from "./sheet-items";

const SAVES = new Set(["skill:fortitude", "skill:reflexos", "skill:vontade"]);
const RITUAL_COST: Record<number, number> = { 1: 1, 2: 3, 3: 6, 4: 10 };
const ELEMENT_LABEL: Record<string, string> = {
  sangue: "Sangue",
  morte: "Morte",
  conhecimento: "Conhecimento",
  energia: "Energia",
  medo: "Medo",
  variavel: "Variável",
};

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function buildOpSheet(c: CharacterData, rulesetId: string, catalog: Catalog, player: string): SheetData {
  const engine = getEngine(rulesetId);
  const d = engine.derive(c, catalog);
  const hasAbilities = engine.abilities.every((a) => c.baseAbilities[a.key] !== undefined);
  const abbrOf = new Map(engine.abilities.map((a) => [a.key, a.abbr]));
  const get = (id?: string) => (id ? catalog.get(id) : undefined);

  const cl = c.classes[0];
  const cls = get(cl?.classId);
  const sub = get(cl?.subclassId);
  const origin = get(c.backgroundId);
  const choiceEntries = c.choices
    .map((ch) => ({ ch, entry: get(ch.contentId) }))
    .filter((x): x is { ch: typeof x.ch; entry: ContentEntry } => !!x.entry);

  // Perícias e resistências
  const skillLines: (SkillLine & { id: string })[] = (d.skills ?? []).map((s) => {
    const entry = get(s.id);
    const ability = str(entry?.data.ability);
    return {
      id: s.id,
      name: s.name,
      ability: ability ? (abbrOf.get(ability) ?? ability.toUpperCase()) : "",
      value: hasAbilities ? s.value : null,
      trained: s.trained,
      rank: s.rank,
      dice: hasAbilities ? s.dice : undefined,
    };
  });

  // Estatísticas derivadas
  const stats: SheetData["stats"] = {};
  for (const s of d.stats ?? []) stats[s.key] = { label: s.label, value: s.value, detail: s.detail };

  // Ataques: armas equipadas + ataque desarmado
  const skillOf = (id: string) => skillLines.find((s) => s.id === id);
  const forScore = hasAbilities ? (d.abilities.for?.score ?? 1) : 1;
  const agiScore = hasAbilities ? (d.abilities.agi?.score ?? 1) : 1;
  const attacks: SheetData["attacks"] = [];

  for (const item of c.inventory) {
    if (!item.equipped || !item.contentId) continue;
    const e = get(item.contentId);
    if (!e || e.data.category !== "arma") continue;
    const isFirearm = e.data.weaponType === "fogo";
    const isRanged = isFirearm || e.data.grip === "distancia";
    const isThrown = e.data.weaponType === "arremesso";
    const isAgile = Boolean(e.data.agile);
    const sk = skillOf(isRanged ? "skill:pontaria" : "skill:luta");
    const baseBonus = sk?.value ?? 0;
    const hasCerteira = item.modifications.includes("equipment:mod-certeira");
    const hasCruel = item.modifications.includes("equipment:mod-cruel");
    const atkBonus = baseBonus + (hasCerteira ? 2 : 0);
    const attrDice = isRanged ? agiScore : isAgile ? Math.max(forScore, agiScore) : forScore;
    const dmgBase = str(e.data.damage) ?? "—";
    const addsFor = !isFirearm && (!isRanged || isThrown);
    const dmgMod = (addsFor && hasAbilities ? forScore : 0) + (hasCruel ? 2 : 0);
    const damage = dmgBase === "—" || dmgMod === 0 ? dmgBase : `${dmgBase}${signed(dmgMod)}`;
    attacks.push({
      name: item.customName || e.name,
      test: hasAbilities ? atkBonus : null,
      roll: hasAbilities ? opDiceFormula(attrDice, atkBonus) : undefined,
      damage,
      critical: str(e.data.critical) ?? "20",
      type: str(e.data.damageType) ?? "",
      range: str(e.data.range),
    });
  }

  const luta = skillOf("skill:luta");
  attacks.push({
    name: "Ataque desarmado",
    test: luta?.value ?? null,
    roll: hasAbilities ? opDiceFormula(forScore, luta?.value ?? 0) : undefined,
    damage: hasAbilities && forScore !== 0 ? `1d3${signed(forScore)}` : "1d3",
    critical: "20",
    type: "Impacto (não letal)",
  });

  // Habilidades: Origem, Classe, Trilha e Afinidade
  const traits: SheetData["traits"] = [];
  const originPower = origin?.data.power as { name: string; summary?: string; text?: string } | undefined;
  if (origin && originPower) {
    traits.push({ name: originPower.name, from: `Origem · ${origin.name}`, text: originPower.summary || originPower.text || "" });
  }
  const effectiveLvl = cls?.data.isSurvivor ? Math.min(5, d.level) : d.level;
  for (const f of (cls?.data.features as { level: number; name: string; summary: string }[] | undefined) ?? []) {
    if (f.level <= effectiveLvl) {
      traits.push({
        name: f.name,
        from: `${cls!.name} · ${engine.formatLevel ? engine.formatLevel(f.level, c) : `${f.level}º`}`,
        text: f.summary,
      });
    }
  }
  for (const f of (sub?.data.features as { level: number; name: string; summary: string }[] | undefined) ?? []) {
    if (f.level <= effectiveLvl) {
      traits.push({
        name: f.name,
        from: `${sub!.name} · ${engine.formatLevel ? engine.formatLevel(f.level, c) : `${f.level}º`}`,
        text: f.summary,
      });
    }
  }
  const affinityChoice = choiceEntries.find((x) => x.ch.slot === "class-option:afinidade");
  const affinityName = affinityChoice?.entry.name.replace(/^.*?:\s*/, "");
  if (affinityChoice) {
    traits.push({ name: affinityChoice.entry.name, from: "NEX 50%", text: affinityChoice.entry.summary });
  }
  const separateNex = c.optionalRules?.includes(OP_OPTIONAL_RULES.SEPARATE_LEVEL_NEX) ? (c.opSeparateNex ?? 0) : null;
  if (separateNex !== null && separateNex >= 25) {
    traits.push({
      name: "Alteração de NEX 25%",
      from: "Sobrevivendo ao Horror p. 99",
      text: "Testes de Ocultismo sem treinamento (+2 se já treinado); –5 em uma perícia social (Diplomacia, Enganação ou Intimidação).",
    });
  }
  if (separateNex !== null && separateNex >= 35) {
    traits.push({
      name: "Alteração de NEX 35%",
      from: "Sobrevivendo ao Horror p. 99",
      text: "Soma um atributo (exceto Presença) no total de PE/PD; –5 em uma perícia física (Atletismo, Fortitude ou Reflexos).",
    });
  }

  // Poderes (classe, gerais e paranormais)
  const powers = choiceEntries
    .filter((x) => x.entry.kind === "power")
    .map(({ entry }) => {
      const el = str(entry.data.element);
      const tag = entry.data.group === "paranormal" && el ? ` [${ELEMENT_LABEL[el] ?? el}]` : "";
      return { name: `${entry.name}${tag}`, text: entry.summary };
    });

  // Rituais
  const spells = choiceEntries
    .filter((x) => x.entry.kind === "spell")
    .map(({ entry }) => {
      const circle = Number(entry.data.circle) || 1;
      const el = str(entry.data.element);
      const discente = entry.data.discente as { cost: string; text: string } | undefined;
      const verdadeiro = entry.data.verdadeiro as { cost: string; text: string } | undefined;
      return {
        name: entry.name,
        circle,
        cost: Number(entry.data.cost ?? entry.data.peCost) || RITUAL_COST[circle] || circle,
        element: el ? (ELEMENT_LABEL[el] ?? el) : undefined,
        elementId: el,
        execution: str(entry.data.execution),
        range: str(entry.data.range),
        duration: str(entry.data.duration),
        discente,
        verdadeiro,
        text: entry.summary,
      };
    })
    .sort((a, b) => a.circle - b.circle || a.name.localeCompare(b.name, "pt-BR"));

  // Proficiências
  const profSet = new Set<string>(["Armas simples"]);
  for (const p of (cls?.data.proficiencies as string[] | undefined) ?? []) {
    profSet.add(p[0].toUpperCase() + p.slice(1));
  }
  const chosenIds = new Set(c.choices.map((ch) => ch.contentId));
  if (chosenIds.has("power:armamento-pesado")) profSet.add("Armas pesadas");
  if (chosenIds.has("power:protecao-pesada")) profSet.add("Proteções pesadas");
  if (chosenIds.has("power:balistica-avancada") || chosenIds.has("power:ninja-urbano")) profSet.add("Armas táticas");

  const inv = d.inventory;
  const cb = inv?.categoryBudget;
  const categorySummary = cb
    ? [1, 2, 3, 4].map((cat) => `Cat. ${formatOpCategory(cat)}: ${cb.counts[cat] ?? 0}/${cb.limits[cat] ?? 0}`).join(" · ")
    : undefined;

  return {
    flavor: "op",
    name: c.name || "Agente sem codinome",
    player,
    system: engine.meta.name,
    level: d.level,
    levelLabel: engine.formatLevel ? engine.formatLevel(d.level, c) : undefined,
    className: cls?.name,
    classOption: sub?.name,
    origin: origin?.name,
    concept: c.concept,
    abilities: engine.abilities.map((a) => {
      const score = hasAbilities ? d.abilities[a.key].score : null;
      return {
        key: a.key,
        abbr: a.abbr,
        label: a.label,
        score,
        modifier: score,
        rollLabel: score !== null && engine.abilityRollLabel ? engine.abilityRollLabel(score) : undefined,
      };
    }),
    saves: skillLines.filter((s) => SAVES.has(s.id)),
    skills: skillLines.filter((s) => !SAVES.has(s.id)),
    stats,
    attacks,
    traits,
    powers,
    spells,
    proficiencies: [...profSet],
    equipment: sheetItems(inv?.rows, catalog),
    money: [{ abbr: "PP", label: "Pontos de Prestígio", amount: Math.max(0, Math.floor(c.currency.pp ?? 0)) }],
    load: inv?.load
      ? { carried: inv.totalWeight, light: inv.load.light, max: inv.load.max, state: inv.load.state, unit: inv.loadUnit ?? "espaços" }
      : undefined,
    opMeta: cb
      ? {
          rank: cb.rank,
          credit: cb.credit,
          prestige: cb.prestige,
          affinity: affinityName,
          categorySummary,
          usePd: c.optionalRules?.includes(OP_OPTIONAL_RULES.DETERMINATION_POINTS) ?? false,
          debilitatingInjuries: c.optionalRules?.includes(OP_OPTIONAL_RULES.DEBILITATING_INJURIES) ?? false,
        }
      : undefined,
    narrative: c.narrative,
    pending: d.pending,
  };
}
