import { emptyCharacter, type CharacterData, type Choice, type InventoryItem } from "./character";
import type { ContentEntry } from "./content";
import type { Rng } from "./dice";
import type { Catalog, RulesEngine, StartingPackage } from "./engine";
import type { T20ClassData, T20SpeciesData } from "../systems/tormenta20";

const FANTASY_NAMES = [
  "Aelar Valen",
  "Brynja Martelo",
  "Kaelen Vorath",
  "Lyra Folhaverde",
  "Thorek Rochaferro",
  "Seraphina Solis",
  "Darian Corvinal",
  "Mirella Vento-Ágil",
  "Garrick Escudo-Forte",
  "Isolde Rubi",
];

const OP_NAMES = [
  "Rafael Mendes",
  "Helena Vasconcelos",
  "Lucas Tavares",
  "Beatriz Nogueira",
  "Caio Alencar",
  "Mariana Silveira",
  "Thiago Braga",
  "Sofia Cavalcanti",
  "Mateus Guimarães",
  "Clara Monteiro",
];

const CONCEPTS_FANTASY = [
  "Aventureiro itinerante em busca de relíquias antigas e justiça nas fronteiras.",
  "Guardião jurado de uma ordem antiga tentando honrar uma promessa esquecida.",
  "Estudioso curioso que trocou os livros de biblioteca pelas estradas perigosas.",
];

const CONCEPTS_OP = [
  "Sobrevivente de um incidente inexplicável agora recrutado para investigar o Outro Lado.",
  "Ex-perito criminal que passou a enxergar padrões ocultistas onde outros veem acidentes.",
  "Pesquisador independente determinado a conter manifestações paranormais antes que se espalhem.",
];

function pick<T>(items: T[], rng: Rng): T | undefined {
  if (!items.length) return undefined;
  return items[rng(items.length) - 1];
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng(i + 1) - 1;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const slug = (id: string) => id.slice(id.indexOf(":") + 1);
const choice = (slot: string, contentId: string, atLevel: number): Choice => ({ slot, contentId, atLevel, locked: false });

function applyStartingPackages(packages: StartingPackage[], rng: Rng): InventoryItem[] {
  const items: InventoryItem[] = [];
  let seq = 1;
  const pushItem = (id: string, quantity: number) => {
    const existing = items.find((i) => i.contentId === id);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    items.push({
      entryId: `gen-${seq++}`,
      contentId: id,
      quantity,
      equipped: false,
      modifications: [],
      enchantments: [],
    });
  };
  for (const pkg of packages) {
    for (const f of pkg.fixed) pushItem(f.id, f.quantity);
    for (const g of pkg.groups) {
      const shuffled = shuffle(g.options, rng).slice(0, g.choose);
      for (const opt of shuffled) {
        for (const it of opt.items) pushItem(it.id, it.quantity);
      }
    }
  }
  return items;
}

/**
 * Gera uma ficha completa, válida e pronta para jogar no nível 1 (ou nível indicado)
 * para qualquer motor registrado (Tormenta20, D&D 5e 2014/2024 e Ordem Paranormal).
 */
export function generateCompleteCharacter(
  engine: RulesEngine,
  catalog: Catalog,
  rng: Rng,
  opts?: { name?: string; level?: number },
): CharacterData {
  const isOp = engine.meta.id === "ordem-paranormal-1e";
  const level = Math.max(engine.meta.levelRange.min, Math.min(engine.meta.levelRange.max, opts?.level ?? 1));
  const name = opts?.name?.trim() || pick(isOp ? OP_NAMES : FANTASY_NAMES, rng) || "Personagem";
  const concept = pick(isOp ? CONCEPTS_OP : CONCEPTS_FANTASY, rng) ?? "";

  // 1. Método de atributos (prefere o primeiro com gerador automático).
  const method = engine.abilityMethods.find((m) => m.generate) ?? engine.abilityMethods[0];
  const baseAbilities = method?.generate ? method.generate(rng) : Object.fromEntries(engine.abilities.map((a) => [a.key, isOp ? 1 : 10]));

  const choices: Choice[] = [];

  // 2. Raça / Espécie (T20 e D&D)
  const speciesList = catalog.ofKind("species");
  const species = pick(speciesList, rng);
  let assignedBonuses: Record<string, number> = {};

  if (species) {
    // Subespécie (D&D)
    const subIds = Array.isArray(species.data.subspecies) ? (species.data.subspecies as string[]) : [];
    const subOptions = subIds.map((id) => catalog.get(id)).filter((e): e is ContentEntry => !!e);
    const sub = pick(subOptions, rng);
    if (sub) choices.push(choice("subspecies", sub.id, level));

    // Bônus flexível de espécie (T20 / D&D 2014)
    const flex = (species.data as T20SpeciesData).flexibleBonus;
    if (flex && flex.count > 0) {
      const excl = new Set(flex.exclude ?? []);
      const allowedKeys = shuffle(
        engine.abilities.map((a) => a.key).filter((k) => !excl.has(k)),
        rng,
      ).slice(0, flex.count);
      assignedBonuses = Object.fromEntries(allowedKeys.map((k) => [k, flex.amount]));
    }
  }

  // 3. Classe (priorizando classes padrão, evitando restritas ou Sobrevivente por padrão)
  const allClasses = catalog.ofKind("class");
  const eligibleClasses = allClasses.filter((c) => {
    const restricted = (c.data as unknown as T20ClassData).restricted;
    if (restricted) return false;
    if (isOp && c.id === "class:sobrevivente") return false;
    return true;
  });
  const cls = pick(eligibleClasses.length ? eligibleClasses : allClasses, rng);
  let subclassId: string | undefined;
  if (cls) {
    const subLvl = Number(cls.data.subclassLevel ?? 99);
    if (level >= subLvl) {
      const subs = catalog.ofKind("subclass").filter((s) => s.data.classId === cls.id);
      subclassId = pick(subs, rng)?.id;
    }
  }

  // 4. Origem / Antecedente
  const spNoOrigin = Boolean((species?.data as T20SpeciesData | undefined)?.noOrigin);
  const bgKind = catalog.ofKind("origin").length ? "origin" : "background";
  const backgrounds = spNoOrigin ? [] : catalog.ofKind(bgKind);
  const bg = pick(backgrounds, rng);

  // D&D 2024: distribuição de bônus de antecedente (+2 / +1)
  if (bg && Array.isArray(bg.data.abilityScores) && (bg.data.abilityScores as string[]).length >= 2) {
    const keys = shuffle(bg.data.abilityScores as string[], rng);
    assignedBonuses = { [keys[0]]: 2, [keys[1]]: 1 };
  }

  // T20: benefícios da origem
  if (bg && engine.meta.id === "tormenta20-2020") {
    const od = bg.data as {
      benefitsToChoose?: number;
      skillOptions?: string[];
      powerOptions?: string[];
      uniquePower?: { name: string };
    };
    const need = od.benefitsToChoose ?? 2;
    if (need > 0) {
      const powers = catalog.ofKind("power");
      const optsPool: { slot: string; contentId: string }[] = [
        ...(od.skillOptions ?? []).map((id) => ({ slot: `origin-benefit:${id}`, contentId: id })),
        ...(od.powerOptions ?? []).map((pwName) => {
          const found = powers.find((pw) => pw.name.toLocaleLowerCase("pt-BR") === pwName.toLocaleLowerCase("pt-BR"));
          return found
            ? { slot: `origin-benefit:${found.id}`, contentId: found.id }
            : { slot: `origin-benefit:open:${pwName}`, contentId: bg.id };
        }),
        ...(od.uniquePower ? [{ slot: "origin-benefit:unique", contentId: bg.id }] : []),
      ];
      for (const opt of shuffle(optsPool, rng).slice(0, need)) {
        choices.push(choice(opt.slot, opt.contentId, level));
      }
    }
  }

  let data = emptyCharacter({
    name,
    concept,
    level,
    creationMode: "random",
    abilityMethod: method?.id,
    baseAbilities,
    assignedBonuses,
    speciesId: species?.id,
    backgroundId: bg?.id,
    classes: cls ? [{ classId: cls.id, levels: level, subclassId }] : [],
    choices,
  });

  // 5. Escolhas de classe em D&D / T20 / OP + Perícias obrigatórias
  const chosenSet = new Set(data.choices.map((ch) => ch.contentId));
  const addChoice = (slot: string, entry: ContentEntry) => {
    if (chosenSet.has(entry.id) && !slot.startsWith("origin-benefit:open:")) return;
    chosenSet.add(entry.id);
    data = { ...data, choices: [...data.choices, choice(slot, entry.id, level)] };
  };

  // Perícias da origem (para não duplicar na lista da classe)
  const bgSkills = new Set<string>(Array.isArray(bg?.data.skills) ? (bg.data.skills as string[]) : []);
  const spSkills = new Set<string>(Array.isArray(species?.data.skills) ? (species.data.skills as string[]) : []);

  if (isOp && cls) {
    const clsSkills = cls.data.skills as { fixed?: string[]; oneOf?: string[][]; choose?: number } | undefined;
    for (const f of clsSkills?.fixed ?? []) chosenSet.add(f);
    for (const pair of clsSkills?.oneOf ?? []) {
      const avail = pair.filter((id) => !chosenSet.has(id) && !bgSkills.has(id));
      const pickedId = pick(avail.length ? avail : pair, rng);
      const entry = pickedId ? catalog.get(pickedId) : undefined;
      if (entry) addChoice(`skill:${slug(entry.id)}`, entry);
    }
  }

  // Perícias via choiceLimits (T20 & OP) ou lista da classe (D&D)
  const limits = engine.choiceLimits?.(data, catalog) ?? [];
  const skillLimit = limits.find((l) => l.kind === "skill");
  if (skillLimit) {
    const need = Math.max(0, skillLimit.max - skillLimit.used);
    const t20From = (cls?.data as unknown as T20ClassData | undefined)?.skills?.from;
    const pool = (t20From?.length ? t20From.map((id) => catalog.get(id)).filter((e): e is ContentEntry => !!e) : catalog.ofKind("skill")).filter(
      (s) => !chosenSet.has(s.id) && !bgSkills.has(s.id) && !spSkills.has(s.id),
    );
    for (const s of shuffle(pool, rng).slice(0, need)) {
      addChoice(`skill:${slug(s.id)}`, s);
    }
  } else if (cls && engine.meta.id.startsWith("dnd5e-")) {
    const dndSkills = cls.data.skills as { choose?: number; from?: string[] } | undefined;
    const choose = dndSkills?.choose ?? 0;
    const from = (dndSkills?.from ?? [])
      .map((id) => catalog.get(id))
      .filter((e): e is ContentEntry => !!e && !bgSkills.has(e.id) && !spSkills.has(e.id));
    for (const s of shuffle(from, rng).slice(0, choose)) {
      addChoice(`skill:${slug(s.id)}`, s);
    }
  }

  // Poderes (T20 / OP caso haja cota no nível 1, como Raça Humano/Cria Aberrante ou origem)
  const powerLimit = engine.choiceLimits?.(data, catalog).find((l) => l.kind === "power");
  if (powerLimit && powerLimit.max > powerLimit.used) {
    const need = powerLimit.max - powerLimit.used;
    const eligiblePowers = catalog
      .ofKind("power")
      .filter((p) => p.origin !== "homebrew" && engine.evaluateOption(data, p, catalog).availability === "available_now");
    for (const p of shuffle(eligiblePowers, rng).slice(0, need)) {
      addChoice(`power:${slug(p.id)}`, p);
    }
  }

  // Rituais / Magias iniciais (Ocultista OP ou Conjurador D&D 5e nível 1)
  if (isOp && cls?.id === "class:ocultista") {
    const rituals = catalog
      .ofKind("spell")
      .filter((s) => Number(s.data.circle ?? 1) === 1 && engine.evaluateOption(data, s, catalog).availability === "available_now");
    for (const r of shuffle(rituals, rng).slice(0, 3)) {
      addChoice(`spell:${slug(r.id)}`, r);
    }
  } else if (engine.meta.id.startsWith("dnd5e-") && cls?.data.spellcasting) {
    const sc = cls.data.spellcasting as { startLevel: number };
    const tableRow = (cls.data.levels as { level: number; cantrips?: number; known?: number; prepared?: number }[] | undefined)?.find(
      (r) => r.level === 1,
    );
    if (sc.startLevel === 1) {
      const classSpells = catalog
        .ofKind("spell")
        .filter((s) => engine.evaluateOption(data, s, catalog).availability === "available_now");
      const cantrips = classSpells.filter((s) => Number(s.data.level) === 0);
      const lvl1 = classSpells.filter((s) => Number(s.data.level) === 1);
      for (const c of shuffle(cantrips, rng).slice(0, tableRow?.cantrips ?? 2)) {
        addChoice(`spell:${slug(c.id)}`, c);
      }
      const nSpells = tableRow?.known ?? tableRow?.prepared ?? 2;
      for (const sp of shuffle(lvl1, rng).slice(0, Math.min(4, Math.max(1, nSpells)))) {
        addChoice(`spell:${slug(sp.id)}`, sp);
      }
    }
  }

  // 6. Equipamento inicial
  if (engine.startingPackages) {
    const pkgs = engine.startingPackages(data, catalog);
    const inventory = applyStartingPackages(pkgs, rng);
    // Equipa primeira arma e primeira armadura/proteção para já sair com Defesa e Ataque na ficha.
    let armedWeapon = false;
    let armedArmor = false;
    for (const it of inventory) {
      const e = it.contentId ? catalog.get(it.contentId) : undefined;
      const cat = String(e?.data.category ?? "");
      if (!armedWeapon && cat === "arma") {
        it.equipped = true;
        armedWeapon = true;
      } else if (!armedArmor && (cat === "armadura" || cat === "protecao")) {
        it.equipped = true;
        armedArmor = true;
      }
    }
    data = { ...data, inventory };
  }

  // 7. Re-valida para remover eventual excesso ou ajustar pendência de nível
  const report = engine.validate(data, catalog);
  if (report.issues.some((i) => i.code === "skills.too_many")) {
    // Segurança: remove última escolha de perícia excedente caso tenha estourado
    const trimmed = [...data.choices];
    while (engine.validate({ ...data, choices: trimmed }, catalog).issues.some((i) => i.code === "skills.too_many")) {
      const idx = trimmed.findLastIndex((ch) => ch.contentId.startsWith("skill:"));
      if (idx < 0) break;
      trimmed.splice(idx, 1);
    }
    data = { ...data, choices: trimmed };
  }

  return data;
}
