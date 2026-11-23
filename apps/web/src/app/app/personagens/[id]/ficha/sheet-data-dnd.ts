import { getEngine, type Catalog, type CharacterData, type ContentEntry, DND_XP_THRESHOLDS } from "@rpg-forge/rules-engine";
import { nextLevelXp, sheetItems } from "./sheet-items";
import type { SheetData } from "./sheet-data";

/**
 * Ficha impressa do D&D 5e (2014 e 2024): resistências, perícias, ataques com bônus de
 * proficiência, traços de raça/subclasse/antecedente, talentos e magias por nível.
 */
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

interface Trait {
  name: string;
  summary: string;
}

export function buildDndSheet(c: CharacterData, rulesetId: string, catalog: Catalog, player: string): SheetData {
  const engine = getEngine(rulesetId);
  const d = engine.derive(c, catalog);
  const hasAbilities = engine.abilities.every((a) => c.baseAbilities[a.key] !== undefined);
  const abbrOf = new Map(engine.abilities.map((a) => [a.key, a.abbr]));
  const get = (id?: string) => (id ? catalog.get(id) : undefined);
  const prof = d.proficiencyBonus ?? 2;
  const mod = (k: string) => (hasAbilities ? (d.abilities[k]?.modifier ?? 0) : 0);

  const cl = c.classes[0];
  const cls = get(cl?.classId);
  const sub = get(cl?.subclassId);
  const sp = get(c.speciesId);
  const subsp = get(c.choices.find((ch) => ch.slot === "subspecies")?.contentId);
  const bg = get(c.backgroundId);
  const chosen = c.choices.map((ch) => get(ch.contentId)).filter((e): e is ContentEntry => !!e);

  const stats: SheetData["stats"] = {};
  for (const s of d.stats ?? []) stats[s.key] = { label: s.label, value: s.value, detail: s.detail };

  const saveSet = new Set((cls?.data.saves as string[] | undefined) ?? []);
  const saves = engine.abilities.map((a) => ({
    name: a.label,
    ability: a.abbr,
    value: hasAbilities ? mod(a.key) + (saveSet.has(a.key) ? prof : 0) : null,
    trained: saveSet.has(a.key),
  }));
  const skills = (d.skills ?? []).map((s) => {
    const ability = str(get(s.id)?.data.ability) ?? "";
    return { name: s.name, ability: abbrOf.get(ability) ?? ability, value: hasAbilities ? s.value : null, trained: s.trained };
  });

  // Ataques: armas equipadas. Distância usa Destreza; Acuidade usa a maior entre Força e Destreza.
  const profs = new Set(((cls?.data.proficiencies as string[] | undefined) ?? []).map((p) => p.toLocaleLowerCase("pt-BR")));
  const attacks: SheetData["attacks"] = [];
  for (const item of c.inventory) {
    const e = item.equipped ? get(item.contentId) : undefined;
    if (!e || e.data.category !== "arma") continue;
    const props = ((e.data.properties as string[] | undefined) ?? []).map((p) => p.toLocaleLowerCase("pt-BR"));
    const ranged = e.data.grip === "distancia";
    const finesse = props.some((p) => p.startsWith("acuidade") || p.startsWith("finesse"));
    const ability = ranged ? "dex" : finesse && mod("dex") > mod("str") ? "dex" : "str";
    const need = e.data.proficiency === "marciais" ? "armas marciais" : "armas simples";
    const proficient = profs.has(need) || profs.has(e.name.toLocaleLowerCase("pt-BR"));
    const m = mod(ability);
    const dmg = str(e.data.damage) ?? "—";
    attacks.push({
      name: item.customName || e.name,
      test: hasAbilities ? m + (proficient ? prof : 0) : null,
      damage: hasAbilities && m !== 0 && dmg !== "—" ? `${dmg}${signed(m)}` : dmg,
      critical: "20",
      type: [str(e.data.damageType), ...props].filter(Boolean).join(", "),
      range: str(e.data.range),
    });
  }
  attacks.push({
    name: "Ataque desarmado",
    test: hasAbilities ? mod("str") + prof : null,
    damage: hasAbilities ? `${Math.max(0, 1 + mod("str"))}` : "1 + For",
    critical: "20",
    type: "concussão",
  });

  // Traços e características até o nível atual.
  const traits: SheetData["traits"] = [];
  for (const t of (sp?.data.traits as Trait[] | undefined) ?? []) traits.push({ name: t.name, from: sp!.name, text: t.summary });
  for (const t of (subsp?.data.traits as Trait[] | undefined) ?? []) traits.push({ name: t.name, from: subsp!.name, text: t.summary });
  const level = cl?.levels ?? c.level;
  for (const f of (cls?.data.features as (Trait & { level: number })[] | undefined) ?? []) {
    if (f.level <= level) traits.push({ name: f.name, from: `${cls!.name} ${f.level}º`, text: f.summary });
  }
  for (const f of (sub?.data.features as (Trait & { level: number })[] | undefined) ?? []) {
    if (f.level <= level) traits.push({ name: f.name, from: `${sub!.name} ${f.level}º`, text: f.summary });
  }
  const feature = bg?.data.feature as { name: string; text: string[] } | undefined;
  if (bg && feature) traits.push({ name: feature.name, from: bg.name, text: feature.text[0] ?? "" });

  // Talentos: o de origem (2024) e os escolhidos.
  const originFeat = get(str(bg?.data.featId));
  const feats = [
    ...(originFeat ? [{ name: `${originFeat.name} (origem)`, text: originFeat.summary }] : []),
    ...chosen.filter((e) => e.kind === "feat" && e.id !== originFeat?.id).map((e) => ({ name: e.name, text: e.summary })),
  ];

  const spells = chosen
    .filter((e) => e.kind === "spell")
    .map((e) => ({
      name: e.name,
      circle: Number(e.data.level) || 0,
      execution: str(e.data.execution),
      range: str(e.data.range),
      duration: str(e.data.duration),
      text: e.summary.replace(/^[^.]*\.\s*/, ""),
    }))
    .sort((a, b) => a.circle - b.circle || a.name.localeCompare(b.name, "pt-BR"));

  const proficiencies = [
    ...((cls?.data.proficiencies as string[] | undefined) ?? []),
    ...((bg?.data.tools as string[] | undefined) ?? []),
    ...((sp?.data.proficiencies as string[] | undefined) ?? []),
  ].map(cap);

  const inv = d.inventory;
  const currencies = engine.currencies ?? [];
  return {
    flavor: "dnd",
    name: c.name || "Sem nome",
    player,
    system: engine.meta.name,
    level: d.level,
    experience: c.progressionMode === "xp" ? c.experience : undefined,
    className: cls?.name,
    classOption: sub?.name,
    species: [sp?.name, subsp?.name].filter(Boolean).join(" · ") || undefined,
    origin: bg?.name,
    concept: c.concept,
    abilities: engine.abilities.map((a) => ({
      key: a.key,
      abbr: a.abbr,
      label: a.label,
      score: hasAbilities ? d.abilities[a.key].score : null,
      modifier: hasAbilities ? d.abilities[a.key].modifier : null,
    })),
    saves,
    skills,
    stats,
    attacks,
    traits,
    powers: feats,
    spells,
    proficiencies: [...new Set(proficiencies)],
    equipment: sheetItems(inv?.rows, catalog),
    xp: c.progressionMode === "xp" ? { current: c.experience ?? 0, ...nextLevelXp(DND_XP_THRESHOLDS, d.level) } : undefined,
    money: currencies.map((cur) => ({ abbr: cur.abbr, label: cur.label, amount: c.currency[cur.key] ?? 0 })),
    load: inv?.load ? { carried: inv.totalWeight, light: inv.load.light, max: inv.load.max, state: inv.load.state } : undefined,
    narrative: c.narrative,
    pending: d.pending,
  };
}
