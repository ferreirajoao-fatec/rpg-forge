/**
 * Converte o SRD 5.1 (2014) e o SRD 5.2.1 (2024), do 5e-database, em pacotes de conteúdo do RPG Forge
 * em português.
 *
 *   pnpm srd:fetch                      baixa a fonte (commit fixado em fetch.ts)
 *   pnpm srd:build                      gera content/dnd5e-2014/data e content/dnd5e-2024/data
 *   pnpm srd:build --pendentes <pasta>  também exporta, em lotes, os textos que faltam traduzir
 *   pnpm srd:build --estrito            falha se faltar alguma tradução (usado antes de publicar)
 *
 * Traduções:
 *  - textos que o 5e-database já traz em pt-BR (raças, perícias, condições... de 2014) são usados direto;
 *  - o resto vem de content/dnd5e-<edição>/i18n/<arquivo>/*.json, no formato { "<index>": { n, d, ... } };
 *  - campos padronizados (alcance, duração, moedas, pesos) são traduzidos por regra (glossario.ts).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as G from "./glossario";
import { SRD_COMMIT, SRD_DIR } from "./fetch";

type Ed = "2014" | "2024";
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Tr = { n?: string; d?: string[]; h?: string[]; m?: string; ct?: string; eq?: string[]; fn?: string; fd?: string[]; [k: string]: unknown };

const args = process.argv.slice(2);
const STRICT = args.includes("--estrito");
const PENDING_DIR = args.includes("--pendentes") ? args[args.indexOf("--pendentes") + 1] : undefined;
const BATCH_CHARS = 9000;

const SOURCES = {
  "2014": { id: "srd-5.1", version: "5.1", title: "System Reference Document 5.1" },
  "2024": { id: "srd-5.2.1", version: "5.2.1", title: "System Reference Document 5.2.1" },
} as const;

/* ------------------------------------------------------------------ leitura */

function src(ed: Ed, name: string, lang = "en"): Json[] {
  const f = path.join(SRD_DIR, "src", ed, lang, `5e-SRD-${name}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
}
const byIndex = (list: Json[]) => new Map(list.map((x) => [x.index as string, x]));

/** Traduções em lotes: content/dnd5e-<ed>/i18n/<arquivo>/*.json. */
function loadI18n(ed: Ed): Map<string, Map<string, Tr>> {
  const root = path.resolve(`content/dnd5e-${ed}/i18n`);
  const out = new Map<string, Map<string, Tr>>();
  if (!existsSync(root)) return out;
  for (const file of readdirSync(root)) {
    const m = new Map<string, Tr>();
    for (const batch of readdirSync(path.join(root, file)).filter((f) => f.endsWith(".json")).sort()) {
      const obj = JSON.parse(readFileSync(path.join(root, file, batch), "utf8")) as Record<string, Tr>;
      for (const [k, v] of Object.entries(obj)) m.set(k, v);
    }
    out.set(file, m);
  }
  return out;
}

/* ------------------------------------------------------------------ texto */

/** Parágrafos: aceita a lista de 2014 ou o texto com quebras de 2024. Remove o negrito em markdown. */
function paragraphs(x: unknown): string[] {
  const list = Array.isArray(x) ? (x as string[]) : typeof x === "string" ? x.split("\n") : [];
  return list.map((p) => p.replace(/\*\*/g, "").replace(/\s+$/g, "").replace(/^ {2,}/, "")).filter((p) => p.trim().length > 0);
}

function summarize(text: string[], max = 180): string {
  const first = (text.find((p) => !p.startsWith("|")) ?? "").replace(/^- /, "");
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** Nível de uma característica de classe (número em 2014, referência "classe-N" em 2024). */
const levelOfFeature = (f: Json): number => (typeof f.level === "number" ? f.level : Number(String(f.level?.index ?? "").split("-").pop()) || 1);

/* ------------------------------------------------------------------ pendências */

interface Pending {
  file: string;
  key: string;
  en: Record<string, unknown>;
}

/**
 * Memória de tradução: o mesmo texto em inglês (no mesmo campo) recebe a mesma tradução, em qualquer
 * arquivo e nas duas edições. Assim um texto repetido só é traduzido uma vez.
 */
type Memory = Map<string, unknown>;
/** Nomes valem só dentro do mesmo tipo (a magia "Light" é Luz; a propriedade de arma "Light" é Leve). */
const memKey = (file: string, field: string, en: unknown) => (field === "n" ? `${file}|n|${JSON.stringify(en)}` : `${field}|${JSON.stringify(en)}`);
const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

class Translator {
  readonly pending: Pending[] = [];
  /** Pares (inglês, tradução) vistos nesta montagem, para alimentar a memória. */
  readonly seen: { file: string; field: string; en: unknown; pt: unknown }[] = [];
  constructor(
    readonly ed: Ed,
    private readonly i18n: Map<string, Map<string, Tr>>,
    private readonly memory: Memory,
  ) {}

  /** Tradução de um registro; registra a pendência se faltar algum campo pedido. */
  get(file: string, key: string, en: Record<string, unknown>): Tr {
    const t: Tr = { ...(this.i18n.get(file)?.get(key) ?? {}) };
    const missing: [string, unknown][] = [];
    for (const [k, v] of Object.entries(en)) {
      if (isEmpty(v)) continue;
      if (t[k] !== undefined) {
        this.seen.push({ file, field: k, en: v, pt: t[k] });
        continue;
      }
      const mem = this.memory.get(memKey(file, k, v));
      if (mem !== undefined) t[k] = mem;
      else missing.push([k, v]);
    }
    if (missing.length) this.pending.push({ file, key, en: Object.fromEntries(missing) });
    return t;
  }
}

/* ------------------------------------------------------------------ montagem */

interface Entry {
  id: string;
  kind: string;
  name: string;
  summary: string;
  origin: "official";
  source: { sourcebookId: string; edition: string; version: string; section?: string };
  license: "CC-BY-4.0";
  prerequisites?: unknown;
  roles: string[];
  data: Record<string, unknown>;
}

function build(ed: Ed, memory: Memory) {
  const tr = new Translator(ed, loadI18n(ed), memory);
  const S = SOURCES[ed];
  const entry = (kind: string, index: string, name: string, summary: string, section: string, data: Record<string, unknown>, prerequisites?: unknown): Entry => ({
    id: `${kind}:${index}`,
    kind,
    name,
    summary,
    origin: "official",
    source: { sourcebookId: S.id, edition: ed, version: S.version, section },
    license: "CC-BY-4.0",
    ...(prerequisites ? { prerequisites } : {}),
    roles: [],
    data,
  });
  const out: Record<string, Entry[]> = {};
  const push = (file: string, e: Entry) => (out[file] ??= []).push(e);
  const name = (t: Tr, fallback: string) => t.n ?? fallback;
  const text = (t: Tr, en: string[]) => (t.d ? paragraphs(t.d) : en);

  /* ---------------- equipamento (vem primeiro: outros usam os nomes) ---------------- */
  const equipment = src(ed, "Equipment");
  const eqName = new Map<string, string>();
  const props = byIndex(src(ed, "Weapon-Properties", ed === "2014" ? "pt-BR" : "en"));
  const mastery = byIndex(src(ed, "Weapon-Mastery-Properties"));
  for (const p of src(ed, "Weapon-Properties")) {
    if (ed === "2024") tr.get("weapon-properties", p.index, { n: p.name, d: paragraphs(p.desc ?? p.description) });
  }
  for (const p of mastery.values()) tr.get("weapon-mastery", p.index, { n: p.name, d: paragraphs(p.description ?? p.desc) });
  const propName = (idx: string, en: string) =>
    ed === "2014" ? (props.get(idx)?.name ?? en) : (tr.get("weapon-properties", idx, {}).n ?? en);

  const categoriesOf = (e: Json): string[] => [
    e.equipment_category?.index,
    e.gear_category?.index,
    ...(e.equipment_categories ?? []).map((c: Json) => c.index),
  ].filter(Boolean);

  for (const e of equipment) {
    const cats = categoriesOf(e);
    const desc = paragraphs(e.desc ?? e.description);
    const t = tr.get("equipment", e.index, { n: e.name, d: desc });
    const nm = name(t, e.name);
    eqName.set(e.index, nm);
    const cur = G.CURRENCY[e.cost?.unit ?? "gp"] ?? G.CURRENCY.gp;
    const price = e.cost ? Math.round(e.cost.quantity * cur.value * 100) / 100 : undefined;
    const data: Record<string, unknown> = {
      category: "item",
      price,
      priceText: e.cost ? `${e.cost.quantity} ${cur.abbr}` : undefined,
      weight: typeof e.weight === "number" ? Number(G.poundsToKg(e.weight).replace(",", ".")) : undefined,
      text: text(t, desc),
    };
    const isWeapon = cats.some((c) => c === "weapon" || c === "weapons");
    const isShield = e.armor_category === "Shield" || cats.includes("shields");
    const isArmor = !isShield && cats.some((c) => c === "armor");
    if (isWeapon) {
      const ranged = (e.weapon_range ?? "") === "Ranged" || cats.some((c) => c.includes("ranged"));
      const martial = (e.weapon_category ?? "") === "Martial" || cats.some((c) => c.startsWith("martial"));
      const r = e.range ?? {};
      Object.assign(data, {
        category: "arma",
        proficiency: martial ? "marciais" : "simples",
        grip: ranged ? "distancia" : "corpo-a-corpo",
        damage: e.damage?.damage_dice,
        damageType: G.DAMAGE[e.damage?.damage_type?.index] ?? e.damage?.damage_type?.name,
        versatile: e.two_handed_damage?.damage_dice,
        critical: "20",
        range: ranged || (e.throw_range ?? r.long)
          ? `${G.feetToMeters(e.throw_range?.normal ?? r.normal)}/${G.feetToMeters(e.throw_range?.long ?? r.long)} m`
          : undefined,
        properties: (e.properties ?? []).map((p: Json) => propName(p.index, p.name)),
        mastery: e.mastery ? (tr.get("weapon-mastery", e.mastery.index, {}).n ?? e.mastery.name) : undefined,
      });
    } else if (isShield) {
      Object.assign(data, { category: "escudo", ac: e.armor_class?.base ?? 2 });
    } else if (isArmor) {
      const cat = e.armor_category ?? (cats.find((c) => /-armor$/.test(c)) ?? "").replace("-armor", "");
      const armorType = { light: "leve", medium: "media", heavy: "pesada" }[String(cat).toLowerCase()] ?? "leve";
      Object.assign(data, {
        category: "armadura",
        armorType,
        ac: e.armor_class?.base,
        dexBonus: !!e.armor_class?.dex_bonus,
        maxDex: e.armor_class?.max_bonus ?? (armorType === "media" ? 2 : undefined),
        strMin: e.str_minimum || undefined,
        stealthDisadvantage: !!e.stealth_disadvantage,
      });
    } else if (cats.includes("ammunition")) data.category = "municao";
    else if (cats.some((c) => c === "tools" || c.endsWith("-tools") || c === "musical-instruments" || c === "gaming-sets")) data.category = "ferramenta";
    else if (cats.includes("equipment-packs")) data.category = "kit";
    else if (cats.some((c) => c.startsWith("mounts") || c.includes("vehicle"))) data.category = /mount|animal/i.test(e.vehicle_category ?? "") || cats.includes("mounts-and-other-animals") ? "animal" : "veiculo";
    if (e.contents?.length) data.contents = e.contents.map((c: Json) => ({ id: `equipment:${c.item.index}`, quantity: c.quantity }));
    const parts = [
      data.category === "arma" ? `${data.damage ?? "—"} ${data.damageType ?? ""}`.trim() : "",
      data.category === "armadura" ? `CA ${data.ac}${data.dexBonus ? (data.maxDex ? ` + Des (máx. ${data.maxDex})` : " + Des") : ""}` : "",
      data.category === "escudo" ? `+${data.ac} na CA` : "",
      data.priceText ? String(data.priceText) : "",
    ].filter(Boolean);
    push("equipment", entry("equipment", e.index, nm, parts.join(" · ") || summarize(text(t, desc)), "Equipment", data));
  }

  /* ---------------- perícias e condições ---------------- */
  const ptSkills = byIndex(src(ed, "Skills", "pt-BR"));
  for (const s of src(ed, "Skills")) {
    const pt = ptSkills.get(s.index);
    const desc = paragraphs(s.desc ?? s.description);
    const t = pt ? { d: paragraphs(pt.desc ?? pt.description) } : tr.get("skills", s.index, { d: desc });
    const body = text(t, desc);
    push("skills", entry("skill", s.index, G.SKILL[s.index] ?? s.name, summarize(body), "Skills", { ability: s.ability_score?.index, text: body }));
  }
  const ptCond = byIndex(src(ed, "Conditions", "pt-BR"));
  for (const c of src(ed, "Conditions")) {
    const pt = ptCond.get(c.index);
    const desc = paragraphs(c.desc ?? c.description);
    const t = pt ? { n: pt.name, d: paragraphs(pt.desc ?? pt.description) } : tr.get("conditions", c.index, { d: desc });
    const body = text(t, desc);
    push("conditions", entry("condition", c.index, G.CONDITION[c.index] ?? name(t, c.name), summarize(body), "Conditions", { text: body }));
  }

  /* ---------------- proficiências (nomes em português) ---------------- */
  const PROF_CAT: Record<string, string> = {
    "light-armor": "armaduras leves",
    "medium-armor": "armaduras médias",
    "heavy-armor": "armaduras pesadas",
    "all-armor": "todas as armaduras",
    shields: "escudos",
    "simple-weapons": "armas simples",
    "martial-weapons": "armas marciais",
  };
  const profName = (p: Json): string | undefined => {
    const idx: string = p.index;
    if (idx.startsWith("saving-throw-")) return undefined;
    if (idx.startsWith("skill-")) return G.SKILL[idx.slice(6)];
    if (PROF_CAT[idx]) return PROF_CAT[idx];
    const ref = p.reference?.index ?? idx.replace(/^tool-/, "");
    const singular = [ref, ref.replace(/s$/, ""), ref.replace(/s-/, "-")].find((k) => eqName.has(k));
    return singular ? eqName.get(singular)!.toLowerCase() : tr.get("proficiencies", idx, { n: p.name }).n?.toLowerCase();
  };

  /* ---------------- traços ---------------- */
  const rawTrait = byIndex(src(ed, "Traits"));
  const traitMap = new Map<string, { id: string; name: string; summary: string; text: string[] }>();
  for (const t0 of src(ed, "Traits")) {
    const desc = paragraphs(t0.desc ?? t0.description);
    const t = tr.get("traits", t0.index, { n: t0.name, d: desc });
    const body = text(t, desc);
    traitMap.set(t0.index, { id: t0.index, name: name(t, t0.name), summary: summarize(body, 240), text: body });
  }
  const traitsOf = (refs: Json[] = []) => refs.map((r) => traitMap.get(r.index)).filter((x): x is NonNullable<typeof x> => !!x);
  const bonuses = (list: Json[] = []) => Object.fromEntries(list.map((b) => [b.ability_score.index, b.bonus]));
  const fmtBonus = (b: Record<string, number>) => Object.entries(b).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${G.ABILITY[k].name}`).join(", ");

  /* ---------------- raças / espécies ---------------- */
  const ptRaces = byIndex(src(ed, "Races", "pt-BR"));
  const speciesList = ed === "2014" ? src(ed, "Races") : src(ed, "Species");
  const subList = ed === "2014" ? src(ed, "Subraces") : src(ed, "Subspecies");
  for (const r of speciesList) {
    const pt = ptRaces.get(r.index);
    const t = pt ? { n: pt.name } : tr.get("species", r.index, { n: r.name });
    const traits = traitsOf(r.traits);
    const ab = bonuses(r.ability_bonuses);
    const opt = r.ability_bonus_options;
    const speedM = Number(G.feetToMeters(r.speed).replace(",", "."));
    // Perícias fixas (Sentidos Aguçados, Ameaçador...) e à escolha (Versatilidade em Perícia, Habilidoso...).
    const rawTraits = (r.traits ?? []).map((x: Json) => rawTrait.get(x.index)).filter(Boolean) as Json[];
    const skills = [...(r.starting_proficiencies ?? []), ...rawTraits.flatMap((t) => t.proficiencies ?? [])]
      .filter((p: Json) => p.index.startsWith("skill-"))
      .map((p: Json) => `skill:${p.index.slice(6)}`);
    const isSkillRef = (o: Json) => String(o.item?.url ?? "").includes("/skills/") || String(o.item?.index ?? "").startsWith("skill-");
    const flexibleSkills = rawTraits
      .map((t) => t.proficiency_choices)
      .filter((pc: Json) => pc && (pc.from?.options ?? []).some(isSkillRef))
      .reduce((n: number, pc: Json) => n + (pc.choose ?? 1), 0);
    const data: Record<string, unknown> = {
      size: G.SIZE[r.size] ?? r.size,
      speed: speedM,
      creatureType: r.type === "Humanoid" ? "Humanoide" : r.type,
      abilityBonuses: ab,
      flexibleBonus: opt ? { count: opt.choose, amount: opt.from.options[0].bonus, exclude: Object.keys(ab) } : undefined,
      skills,
      flexibleSkills: flexibleSkills || undefined,
      proficiencies: (r.starting_proficiencies ?? []).map(profName).filter(Boolean),
      languages: pt?.language_desc ?? undefined,
      age: pt?.age,
      alignment: pt?.alignment,
      sizeText: pt?.size_description,
      traits,
      subspecies: (r.subraces ?? r.subspecies ?? []).map((s: Json) => `subspecies:${s.index}`),
      darkvision: traits.some((x) => x.id.startsWith("darkvision") || x.id === "superior-darkvision"),
    };
    const bits = [`${data.size}`, `deslocamento ${G.feetToMeters(r.speed)} m`, Object.keys(ab).length ? fmtBonus(ab) : "", opt ? `+${opt.from.options[0].bonus} em ${opt.choose} atributos à escolha` : ""];
    const summary = `${bits.filter(Boolean).join(" · ")}. ${traits.map((x) => x.name).join(", ")}.`;
    push("species", entry("species", r.index, name(t, r.name), summary, ed === "2014" ? "Races" : "Species", data));
  }
  for (const s of subList) {
    const parent = (s.race ?? s.species).index as string;
    const desc = paragraphs(s.desc ?? s.description);
    const t = tr.get("subspecies", s.index, { n: s.name, d: desc });
    const traits = traitsOf(s.racial_traits ?? s.traits);
    const ab = bonuses(s.ability_bonuses);
    const body = text(t, desc);
    const summary = [Object.keys(ab).length ? fmtBonus(ab) : "", traits.map((x) => x.name).join(", ")].filter(Boolean).join(" · ") || summarize(body);
    push(
      "subspecies",
      entry("subspecies", s.index, name(t, s.name), summary, ed === "2014" ? "Subraces" : "Subspecies", {
        parent: `species:${parent}`,
        abilityBonuses: ab,
        hpPerLevel: (s.racial_traits ?? []).some((x: Json) => x.index === "dwarven-toughness") ? 1 : undefined,
        damageType: s.damage_type ? G.DAMAGE[s.damage_type.index] : undefined,
        traits,
        text: body,
      }, { type: "hasSpecies", speciesId: `species:${parent}` }),
    );
  }

  /* ---------------- características de classe ---------------- */
  const features = src(ed, "Features");
  const featText = new Map<string, { name: string; text: string[] }>();
  for (const f of features) {
    const desc = paragraphs(f.desc ?? f.description);
    const t = tr.get("features", f.index, { n: f.name, d: desc });
    featText.set(f.index, { name: name(t, f.name), text: text(t, desc) });
  }
  const levelOf = (f: Json): number => levelOfFeature(f);
  const featureList = (pred: (f: Json) => boolean) =>
    features
      .filter((f) => pred(f) && !f.parent)
      .map((f) => {
        const x = featText.get(f.index)!;
        return { id: f.index, level: levelOf(f), name: x.name, summary: summarize(x.text, 240), text: x.text };
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  /* ---------------- equipamento inicial (classes e antecedentes) ---------------- */
  /** Categorias citadas nas escolhas abertas do equipamento inicial. */
  const CATEGORY: Record<string, [string, string]> = {
    "simple-weapons": ["arma simples", "armas simples"],
    "simple-melee-weapons": ["arma simples corpo a corpo", "armas simples corpo a corpo"],
    "martial-weapons": ["arma marcial", "armas marciais"],
    "martial-melee-weapons": ["arma marcial corpo a corpo", "armas marciais corpo a corpo"],
    "holy-symbols": ["símbolo sagrado", "símbolos sagrados"],
    "arcane-foci": ["foco arcano", "focos arcanos"],
    "druidic-foci": ["foco druídico", "focos druídicos"],
    "musical-instruments": ["instrumento musical", "instrumentos musicais"],
    "artisans-tools": ["ferramenta de artesão", "ferramentas de artesão"],
    "gaming-sets": ["kit de jogo", "kits de jogo"],
  };
  type Pick = { label: string; items: { id: string; quantity: number }[]; gold: number; open: { category: string; count: number; label: string }[] };
  const catLabel = (idx: string, n: number) => {
    const c = CATEGORY[idx];
    if (!c) throw new Error(`Categoria de equipamento sem tradução: ${idx}`);
    return n === 1 ? `1 ${c[0]} à escolha` : `${n} ${c[1]} à escolha`;
  };
  const pickOf = (o: Json, acc: Pick = { label: "", items: [], gold: 0, open: [] }): Pick => {
    switch (o.option_type) {
      case "counted_reference": {
        const idx = String(o.of.url ?? "").includes("equipment-categories") ? null : o.of.index;
        if (idx) acc.items.push({ id: `equipment:${idx}`, quantity: o.count });
        else acc.open.push({ category: o.of.index, count: o.count, label: catLabel(o.of.index, o.count) });
        break;
      }
      case "money":
        acc.gold += o.count * (G.CURRENCY[o.unit]?.value ?? 1);
        break;
      case "multiple":
        for (const i of o.items) pickOf(i, acc);
        break;
      case "choice": {
        const ch = o.choice;
        const cat = ch.from?.equipment_category?.index;
        if (cat) acc.open.push({ category: cat, count: ch.choose, label: catLabel(cat, ch.choose) });
        else {
          // "uma coisa OU outra": vira uma escolha aberta com as alternativas descritas.
          const alts = (ch.from?.options ?? []).map((alt: Json) => describe(pickOf(alt)));
          acc.open.push({ category: "", count: ch.choose ?? 1, label: alts.join(" ou ") });
        }
        break;
      }
    }
    return acc;
  };
  const describe = (p: Pick) => {
    const parts = [
      ...p.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${eqName.get(i.id.slice(10)) ?? i.id.slice(10)}`),
      ...p.open.map((x) => x.label),
      ...(p.gold ? [`${Math.round(p.gold * 100) / 100} po`] : []),
    ];
    return parts.join(", ");
  };
  /** Itens fixos + grupos de alternativas ("(a) ... ou (b) ..."). */
  function startingEquipment(fixed: Json[] = [], groups: Json[] = []) {
    return {
      fixed: fixed.map((s) => ({ id: `equipment:${s.equipment.index}`, quantity: s.quantity })),
      groups: groups.map((g) => {
        const alts: Json[] = g.from?.option_set_type === "options_array" ? g.from.options : [];
        const options = alts.length
          ? alts.map((a, i) => {
              const p = pickOf(a);
              p.label = `${String.fromCharCode(65 + i)}: ${describe(p)}`;
              return p;
            })
          : [(() => {
              const p = pickOf({ option_type: "choice", choice: g });
              p.label = describe(p);
              return p;
            })()];
        return { choose: g.choose ?? 1, options };
      }),
    };
  }

  /* ---------------- classes ---------------- */
  const levels = src(ed, "Levels");
  const SUBCLASS_LEVEL_2014: Record<string, number> = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };
  for (const c of src(ed, "Classes")) {
    const skillChoice = (c.proficiency_choices ?? []).find((pc: Json) =>
      (pc.from?.options ?? []).some((o: Json) => String(o.item?.index ?? "").startsWith("skill-")),
    );
    const profs: Json[] = c.proficiencies ?? [];
    const lv = levels
      .filter((l) => l.class?.index === c.index && !l.subclass)
      .sort((a, b) => a.level - b.level)
      .map((l) => {
        const sc = l.spellcasting ?? {};
        return {
          level: l.level,
          prof: l.prof_bonus,
          // Aumento no Valor de Habilidade (ou, em 2024, a Dádiva Épica do 19º nível): um talento ou +2 em atributos.
          // Obs.: em 2014, ability_score_bonuses é cumulativo; por isso a detecção é pela característica do nível.
          asi: (l.features ?? []).some((f: Json) => /ability-score-improvement|epic-boon/.test(f.index)),
          slots: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => sc[`spell_slots_level_${n}`] ?? 0),
          cantrips: sc.cantrips_known,
          known: sc.spells_known,
          prepared: sc.prepared_spells,
          special: l.class_specific ?? undefined,
        };
      });
    const armor = new Set<string>();
    for (const p of profs) {
      if (p.index === "all-armor") ["leve", "media", "pesada"].forEach((a) => armor.add(a));
      if (p.index === "light-armor") armor.add("leve");
      if (p.index === "medium-armor") armor.add("media");
      if (p.index === "heavy-armor") armor.add("pesada");
      if (p.index === "shields") armor.add("escudo");
    }
    const spellcasting = c.spellcasting
      ? {
          ability: c.spellcasting.spellcasting_ability.index,
          startLevel: c.spellcasting.level ?? 1,
          type: lv.some((l) => typeof l.known === "number" && l.known > 0) ? "known" : "prepared",
        }
      : undefined;
    const subclassLevel = ed === "2024" ? 3 : (SUBCLASS_LEVEL_2014[c.index] ?? 3);
    const data = {
      hitDie: c.hit_die,
      saves: (c.saving_throws ?? []).map((s: Json) => s.index),
      primaryAbility: (c.primary_ability?.ability_scores ?? []).map((a: Json) => a.index),
      proficiencies: profs.map(profName).filter(Boolean),
      armor: [...armor],
      skills: skillChoice ? { choose: skillChoice.choose, from: skillChoice.from.options.map((o: Json) => `skill:${String(o.item.index).slice(6)}`) } : { choose: 0, from: [] },
      spellcasting,
      subclassLevel,
      levels: lv,
      features: featureList((f) => f.class?.index === c.index && !f.subclass),
      startingEquipment: startingEquipment(c.starting_equipment, c.starting_equipment_options),
    };
    const saveNames = data.saves.map((s: string) => G.ABILITY[s].name).join(" e ");
    const summary = `Dado de Vida d${c.hit_die} · resistência em ${saveNames}${spellcasting ? ` · conjurador (${G.ABILITY[spellcasting.ability].name})` : ""}.`;
    push("classes", entry("class", c.index, G.CLASS[c.index] ?? c.name, summary, "Classes", data));
  }

  /* ---------------- subclasses ---------------- */
  for (const s of src(ed, "Subclasses")) {
    const desc = paragraphs(s.desc ?? s.description);
    const t = tr.get("subclasses", s.index, { n: s.name, d: desc });
    const cls = s.class.index as string;
    const lvl = ed === "2024" ? 3 : (SUBCLASS_LEVEL_2014[cls] ?? 3);
    const body = text(t, desc);
    push(
      "subclasses",
      entry("subclass", s.index, name(t, s.name), summarize(body), "Subclasses", {
        classId: `class:${cls}`,
        features: featureList((f) => f.subclass?.index === s.index),
        spells: (s.spells ?? []).map((x: Json) => `spell:${x.spell.index}`),
        text: body,
      }, { type: "allOf", of: [{ type: "hasClass", classId: `class:${cls}` }, { type: "minClassLevel", classId: `class:${cls}`, level: lvl }] }),
    );
  }

  /* ---------------- antecedentes e talentos ---------------- */
  const ptBg = byIndex(src(ed, "Backgrounds", "pt-BR"));
  for (const b of src(ed, "Backgrounds")) {
    const pt = ptBg.get(b.index);
    const profs: Json[] = b.starting_proficiencies ?? b.proficiencies ?? [];
    const t = pt
      ? { n: pt.name, fn: pt.feature?.name, fd: paragraphs(pt.feature?.desc) }
      : tr.get("backgrounds", b.index, {
          n: b.name,
          fn: b.feature?.name,
          fd: paragraphs(b.feature?.desc),
        });
    const data = {
      skills: profs.filter((p) => p.index.startsWith("skill-")).map((p) => `skill:${p.index.slice(6)}`),
      tools: profs.filter((p) => !p.index.startsWith("skill-")).map(profName).filter(Boolean),
      languages: b.language_options?.choose ?? 0,
      abilityScores: (b.ability_scores ?? []).map((a: Json) => a.index),
      featId: b.feat ? `feat:${b.feat.index}` : undefined,
      featNote: b.feat?.note ? (G.CLASS[String(b.feat.note).toLowerCase()] ?? b.feat.note) : undefined,
      feature: t.fn ? { name: t.fn, text: t.fd ?? [] } : undefined,
      startingEquipment: startingEquipment(b.starting_equipment, b.equipment_options ?? b.starting_equipment_options),
    };
    const skillNames = data.skills.map((s: string) => G.SKILL[s.slice(6)]).join(" e ");
    const summary = ed === "2024"
      ? `Perícias: ${skillNames}. Atributos: ${data.abilityScores.map((a: string) => G.ABILITY[a].name).join(", ")}.`
      : `Perícias: ${skillNames}.${data.feature ? ` Característica: ${data.feature.name}.` : ""}`;
    push("backgrounds", entry("background", b.index, name(t, b.name), summary, "Backgrounds", data));
  }
  const ptFeats = byIndex(src(ed, "Feats", "pt-BR"));
  const FEAT_TYPE: Record<string, string> = { origin: "Talento de origem", general: "Talento geral", "fighting-style": "Estilo de luta", "epic-boon": "Dádiva épica" };
  for (const f of src(ed, "Feats")) {
    const pt = ptFeats.get(f.index);
    const desc = paragraphs(f.desc ?? f.description);
    const t = pt ? { n: pt.name, d: paragraphs(pt.desc ?? pt.description) } : tr.get("feats", f.index, { n: f.name, d: desc });
    const body = text(t, desc);
    const pre: unknown[] = [];
    for (const p of Array.isArray(f.prerequisites) ? f.prerequisites : []) if (p.ability_score) pre.push({ type: "minAbility", ability: p.ability_score.index, value: p.minimum_score });
    const pq = f.prerequisites && !Array.isArray(f.prerequisites) ? f.prerequisites : {};
    if (pq.minimum_level) pre.push({ type: "minLevel", level: pq.minimum_level });
    if (pq.feature_named === "Fighting Style") {
      // Classes com a característica Estilo de Luta, no nível em que ela chega.
      const fs = src(ed, "Features").filter((x) => !x.subclass && /fighting-style$/.test(x.index) && x.class);
      pre.push({ type: "anyOf", of: fs.map((x) => ({ type: "minClassLevel", classId: `class:${x.class.index}`, level: levelOfFeature(x) })) });
    } else if (pq.feature_named === "Spellcasting") {
      const casters = src(ed, "Classes").filter((x) => x.spellcasting);
      pre.push({ type: "anyOf", of: casters.map((x) => ({ type: "hasClass", classId: `class:${x.index}` })) });
    } else if (pq.feature_named) {
      pre.push({ type: "gmJudgement", description: `Exige a característica ${pq.feature_named}.` });
    }
    push(
      "feats",
      entry("feat", f.index, name(t, f.name), summarize(body), "Feats", { type: f.type ?? "general", typeLabel: FEAT_TYPE[f.type ?? "general"], repeatable: !!f.repeatable, text: body }, pre.length > 1 ? { type: "allOf", of: pre } : pre[0]),
    );
  }

  /* ---------------- magias ---------------- */
  for (const s of src(ed, "Spells")) {
    const desc = paragraphs(s.desc ?? s.description);
    const higher = paragraphs(s.higher_level ?? s.higher_levels ?? []);
    const autoCt = G.castingTime(s.casting_time);
    const t = tr.get("spells", s.index, { n: s.name, d: desc, h: higher, m: s.material ?? "", ct: autoCt ? "" : s.casting_time });
    const body = text(t, desc);
    const classes = (s.classes ?? []).map((c: Json) => `class:${c.index}`);
    const comps = (s.components ?? []).join(", ");
    const concentration = !!s.concentration || /^concentration/i.test(s.duration) || /^up to /i.test(s.duration);
    const data = {
      level: s.level,
      school: G.SCHOOL[s.school.index] ?? s.school.name,
      execution: t.ct ?? autoCt ?? s.casting_time,
      range: G.range(s.range) ?? s.range,
      duration: `${concentration ? "Concentração, " : ""}${(G.duration(s.duration) ?? s.duration).replace(/^Até/, concentration ? "até" : "Até")}`,
      components: s.material ? `${comps} (${t.m ?? s.material})` : comps,
      concentration,
      ritual: !!s.ritual,
      classes,
      text: body,
      higherLevel: t.h ? paragraphs(t.h) : higher,
    };
    const head = `${s.level === 0 ? "Truque" : `${s.level}º nível`} de ${data.school.toLowerCase()}${data.ritual ? " (ritual)" : ""}`;
    push(
      "spells",
      entry("spell", s.index, name(t, s.name), `${head}. ${summarize(body, 160)}`, "Spells", data, classes.length > 1 ? { type: "anyOf", of: classes.map((c: string) => ({ type: "hasClass", classId: c })) } : classes.length ? { type: "hasClass", classId: classes[0] } : undefined),
    );
  }

  return { out, pending: tr.pending, seen: tr.seen };
}

/* ------------------------------------------------------------------ licença */

export const ATTRIBUTION: Record<Ed, string> = {
  "2014":
    "This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.",
  "2024":
    "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.",
};

function licenseText(ed: Ed): string {
  const mit = readFileSync(path.join(SRD_DIR, "LICENSE.md"), "utf8").trim();
  return `# Licença do conteúdo — D&D 5e (${ed})

## ${SOURCES[ed].title} (CC-BY-4.0)

${ATTRIBUTION[ed]}

Alterações feitas pelo RPG Forge: tradução do inglês para o português do Brasil, conversão de pés, milhas e libras
para metros, quilômetros e quilogramas, resumos curtos para as listas de escolha e reorganização dos dados para o
formato de pacote de conteúdo. A tradução não é oficial e não foi revisada pela Wizards of the Coast. O RPG Forge não
é afiliado à Wizards of the Coast nem endossado por ela. "Dungeons & Dragons" e "D&D" são marcas da Wizards of the Coast;
aqui aparecem só para indicar compatibilidade.

## Dados estruturados: 5e-bits/5e-database (MIT)

A estrutura dos dados vem do projeto 5e-database (https://github.com/5e-bits/5e-database), commit ${SRD_COMMIT}.

${mit}
`;
}

/* ------------------------------------------------------------------ saída */

function main() {
  if (!existsSync(SRD_DIR)) throw new Error("Fonte não encontrada. Rode pnpm srd:fetch antes.");
  let totalPending = 0;
  // 1ª passada: coleta as traduções existentes; 2ª: monta usando a memória das duas edições.
  const memory: Memory = new Map();
  for (const ed of ["2014", "2024"] as Ed[]) for (const x of build(ed, new Map()).seen) memory.set(memKey(x.file, x.field, x.en), x.pt);
  // Na exportação, um texto repetido só vai no primeiro lote em que aparece (a memória preenche o resto).
  const exported = new Set<string>();
  let uniqueChars = 0;
  for (const ed of ["2014", "2024"] as Ed[]) {
    const { out, pending } = build(ed, memory);
    const dir = path.resolve(`content/dnd5e-${ed}/data`);
    mkdirSync(dir, { recursive: true });
    for (const [file, entries] of Object.entries(out)) {
      writeFileSync(path.join(dir, `${file}.json`), `${JSON.stringify(entries, null, 1)}\n`);
    }
    const pendingByFile: Record<string, number> = {};
    for (const p of pending) pendingByFile[p.file] = (pendingByFile[p.file] ?? 0) + 1;
    writeFileSync(
      path.join(dir, "_status.json"),
      `${JSON.stringify({ source: `5e-bits/5e-database@${SRD_COMMIT}`, pending: pending.length, pendingByFile }, null, 1)}
`,
    );
    writeFileSync(path.resolve(`content/dnd5e-${ed}/LICENSE.md`), licenseText(ed));
    const counts = Object.entries(out).map(([f, e]) => `${f} ${e.length}`).join(", ");
    console.log(`D&D ${ed}: ${counts}.`);
    const byFile = new Map<string, Pending[]>();
    for (const p of pending) (byFile.get(p.file) ?? byFile.set(p.file, []).get(p.file)!).push(p);
    for (const [file, list] of byFile) {
      const chars = list.reduce((t, p) => t + JSON.stringify(p.en).length, 0);
      console.log(`  falta traduzir: ${file}: ${list.length} registro(s), ~${Math.round(chars / 1000)} mil caracteres`);
    }
    totalPending += pending.length;
    if (PENDING_DIR) {
      mkdirSync(PENDING_DIR, { recursive: true });
      for (const [file, list] of byFile) {
        let batch: Record<string, unknown> = {};
        let size = 0;
        let n = 1;
        const flush = () => {
          if (!Object.keys(batch).length) return;
          writeFileSync(path.join(PENDING_DIR, `${ed}-${file}-${String(n++).padStart(3, "0")}.json`), JSON.stringify(batch, null, 1));
          batch = {};
          size = 0;
        };
        for (const p0 of list) {
          const fields = Object.entries(p0.en).filter(([k, v]) => !exported.has(memKey(file, k, v)));
          if (!fields.length) continue;
          for (const [k, v] of fields) exported.add(memKey(file, k, v));
          const p = { ...p0, en: Object.fromEntries(fields) };
          const len = JSON.stringify(p.en).length;
          uniqueChars += len;
          if (size + len > BATCH_CHARS) flush();
          batch[p.key] = p.en;
          size += len;
        }
        flush();
      }
    }
  }
  if (PENDING_DIR) console.log(`Lotes exportados em ${PENDING_DIR}: ~${Math.round(uniqueChars / 1000)} mil caracteres únicos.`);
  console.log(`Fonte: 5e-database @ ${SRD_COMMIT.slice(0, 7)}.`);
  if (STRICT && totalPending) {
    console.error(`Há ${totalPending} registro(s) sem tradução. Nada foi publicado.`);
    process.exit(1);
  }
}

main();
