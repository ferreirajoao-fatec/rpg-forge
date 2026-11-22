import { describe, expect, it } from "vitest";
import { Catalog, emptyCharacter, getEngine, moneyTotal, payWith, receive, seededRng, validateContentPack, type InventoryItem } from "..";
import {
  T20_CURRENCIES,
  T20_MAGIC_TIERS,
  T20_POINT_BUDGET,
  T20_POINT_COST,
  t20CraftConsumable,
  t20CraftItem,
  t20LevelForXp,
  t20Modifier,
  t20SkillModifier,
} from "../systems/tormenta20";
import tormenta20Pack from "../../../content/tormenta20-2020/pack";

const t20 = getEngine("tormenta20-2020");
const catalog = Catalog.fromPacks("tormenta20-2020", [tormenta20Pack]);
const method = (id: string) => t20.abilityMethods.find((m) => m.id === id)!;
const codes = (c: ReturnType<typeof emptyCharacter>) => t20.validate(c, catalog).issues.map((i) => i.code);
const stat = (c: ReturnType<typeof emptyCharacter>, key: string) => t20.derive(c, catalog).stats?.find((s) => s.key === key)?.value;

const base = { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };

describe("Tormenta20 (2020) — fórmulas", () => {
  it("modificador de atributo segue a Tabela 1-1", () => {
    expect([1, 2, 3, 8, 9, 10, 11, 12, 18, 19, 20, 25].map(t20Modifier)).toEqual([-5, -4, -4, -1, -1, 0, 0, 1, 4, 4, 5, 7]);
  });

  it("nível por XP segue a Tabela 1-3", () => {
    expect([0, 999, 1000, 6000, 189999, 190000].map(t20LevelForXp)).toEqual([1, 1, 2, 4, 19, 20]);
  });

  it("modificador de perícia (exemplo do livro: 3º nível, Força 18, treinado = +7)", () => {
    expect(t20SkillModifier(3, 18, false)).toBe(5);
    expect(t20SkillModifier(3, 18, true)).toBe(7);
    expect(t20SkillModifier(7, 10, true)).toBe(3 + 4);
    expect(t20SkillModifier(15, 10, true)).toBe(7 + 6);
  });
});

describe("Tormenta20 (2020) — geração de atributos", () => {
  it("geração por pontos: 20 pontos, valores de 8 a 18", () => {
    const pb = method("point-buy");
    expect(pb.validate({ for: 15, des: 14, con: 13, int: 12, sab: 12, car: 13 })).toEqual([]); // 6+4+3+2+2+3
    expect(pb.validate({ for: 18, des: 14, con: 13, int: 11, sab: 10, car: 8 })).toEqual([]); // 14+4+3+1+0-2
  });

  it("geração por pontos detecta excesso, faixa e pontos sobrando", () => {
    const pb = method("point-buy");
    expect(pb.validate({ for: 18, des: 14, con: 14, int: 10, sab: 10, car: 10 }).map((i) => i.code)).toContain("abilities.point_buy_over");
    expect(pb.validate({ for: 19, des: 10, con: 10, int: 10, sab: 10, car: 10 }).map((i) => i.code)).toContain("abilities.point_buy_range");
    expect(pb.validate(base).map((i) => i.code)).toContain("abilities.point_buy_unspent");
  });

  it("geração por pontos aleatória sempre gasta exatamente o orçamento", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 100; i++) {
      const s = method("point-buy").generate!(rng);
      expect(Object.values(s).reduce((a, v) => a + T20_POINT_COST[v], 0)).toBe(T20_POINT_BUDGET);
      expect(method("point-buy").validate(s)).toEqual([]);
    }
  });

  it("rolagem aleatória respeita 3–18 e a regra da soma mínima +6", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 100; i++) {
      const s = method("roll-4d6").generate!(rng);
      expect(method("roll-4d6").validate(s)).toEqual([]);
    }
    expect(method("roll-4d6").validate(base).map((i) => i.code)).toContain("abilities.roll_low_total");
  });
});

describe("Tormenta20 (2020) — pacote de conteúdo", () => {
  it("é um pacote válido, com licença OGL e página em todas as entradas", () => {
    const r = validateContentPack(tormenta20Pack);
    expect(r.errors).toEqual([]);
    for (const e of tormenta20Pack.entries) {
      expect(e.license).toBe("OGL-1.0a");
      expect(e.source.page).toBeGreaterThan(0);
    }
  });

  it("tem todas as raças, classes, origens e perícias do livro", () => {
    expect(catalog.ofKind("species")).toHaveLength(18); // 17 raças; a raça de descendentes planares tem duas variantes
    expect(catalog.ofKind("class")).toHaveLength(14);
    expect(catalog.ofKind("origin")).toHaveLength(35);
    expect(catalog.ofKind("skill")).toHaveLength(29);
  });

  it("tem poderes, magias, divindades e equipamento do livro", () => {
    const powers = catalog.ofKind("power");
    const group = (g: string) => powers.filter((p) => p.data.group === g).length;
    expect(group("combate")).toBe(36);
    expect(group("destino")).toBe(18);
    expect(group("magia")).toBe(8);
    expect(group("concedido")).toBe(58);
    expect(group("aberrante")).toBe(15);
    expect(group("classe")).toBe(270);
    expect(catalog.ofKind("spell")).toHaveLength(196);
    expect(catalog.ofKind("deity")).toHaveLength(20);
    expect(catalog.ofKind("equipment").length).toBeGreaterThan(140);
  });

  it("pré-requisitos só apontam para entradas que existem", () => {
    const refs: string[] = [];
    const walk = (p: unknown): void => {
      if (!p || typeof p !== "object") return;
      const o = p as Record<string, unknown>;
      for (const k of ["contentId", "classId"]) if (typeof o[k] === "string") refs.push(o[k] as string);
      if (typeof o.proficiency === "string" && o.proficiency.startsWith("skill:")) refs.push(o.proficiency);
      Object.values(o).forEach(walk);
    };
    tormenta20Pack.entries.forEach((e) => walk(e.prerequisites));
    expect(refs.length).toBeGreaterThan(500);
    expect(refs.filter((id) => !catalog.get(id))).toEqual([]);
  });

  it("todo poder concedido pertence a ao menos uma divindade", () => {
    const granted = catalog.ofKind("power").filter((p) => p.data.group === "concedido");
    for (const p of granted) expect((p.data.grantedBy as string[]).length, p.id).toBeGreaterThan(0);
    for (const d of catalog.ofKind("deity")) {
      for (const id of d.data.grantedPowers as string[]) expect(catalog.get(id), id).toBeDefined();
    }
  });

  it("não contém termos de Identidade do Produto nas entradas", () => {
    const text = JSON.stringify(tormenta20Pack.entries);
    const forbidden = [
      "Arton", "Khalmyr", "Valkaria", "Allihanna", "Megalokk", "Glórienn", "Heredrimm", "Nimb", "Wynna", "Tauron", "Aharadak",
      "Lefou", "lefeu", "Qareen", "Dahllan", "Osteon", "Hynne", "Kliren", "Suraggel", "Aggelus", "Sulfure", "Trog\"",
      "Inventor", "inventor", "Tibar", "tibar", "T$", "Reinado", "Doherimm",
      "Azgher", "Hyninn", "Kallyadranoch", "Lin-Wu", "Marah", "Sszzaas", "Tanna-Toh", "Tenebra", "Thwor", "Thyatis",
      "Duyshidakk", "Vectorius", "Talude", "Reynard", "Edauros", "Vladislav", "Ichabod", "Aleph", "Sckhar",
      "Galrasia", "Bielefeld", "Zakharov", "Yuvalin", "Tollon", "Gorad", "Trobo", "valkarian",
      "Sszzaas", "Rhond", "Tiberus", "Sanguinárias", "Espada-Deus", "wyrt", "artonian", "Grande Corruptor",
    ];
    for (const term of forbidden) expect(text, term).not.toContain(term);
    expect(text.replace(/Tormenta20 \(2020\)/g, "")).not.toMatch(/Tormenta/);
  });

  it("a classe com regras de Identidade do Produto não tem mecânicas", () => {
    const art = catalog.get("class:artifice")!;
    expect(art.data).not.toHaveProperty("hp");
    expect(art.data.restricted).toBe(true);
  });
});

describe("Tormenta20 (2020) — itens superiores e mágicos", () => {
  const items = catalog.ofKind("equipment");
  const cat = (c: string) => items.filter((e) => e.data.category === c);

  it("tem modificações, materiais, encantos, itens específicos, poções, acessórios e artefatos", () => {
    expect(cat("modificacao")).toHaveLength(23);
    expect(cat("material")).toHaveLength(6);
    expect(cat("encanto")).toHaveLength(52);
    expect(cat("arma-magica")).toHaveLength(18);
    expect(cat("armadura-magica")).toHaveLength(13);
    expect(cat("pocao")).toHaveLength(39);
    expect(cat("acessorio")).toHaveLength(65);
    expect(cat("artefato")).toHaveLength(5);
    const deck = cat("artefato").find((e) => e.name === "O Baralho do Caos")!;
    expect(deck.data.tiers as unknown[]).toHaveLength(22);
  });

  it("fabricação segue os exemplos do livro", () => {
    // Armadura completa (3.000) com quatro modificações: 1.000 + 6.000, CD 20 + 10.
    expect(t20CraftItem({ basePrice: 3000, baseDc: 20, modifications: 4 })).toEqual({ cost: 7000, dc: 30 });
    // Espada longa (15) com um encanto: 10.005, CD 25.
    expect(t20CraftItem({ basePrice: 15, baseDc: 20, enchantments: 1 })).toEqual({ cost: 10005, dc: 25 });
    // Seis modificações e quatro encantos: 100.005, CD 60.
    expect(t20CraftItem({ basePrice: 15, baseDc: 20, modifications: 6, enchantments: 4 })).toEqual({ cost: 100005, dc: 60 });
    // Poção de 1 PM: 10 moedas, CD 21; pergaminho de 6 PM: 360 moedas, CD 26.
    expect(t20CraftConsumable(1)).toMatchObject({ cost: 10, dc: 21 });
    expect(t20CraftConsumable(6)).toMatchObject({ cost: 360, dc: 26 });
    expect(T20_MAGIC_TIERS.maior.maxEnchantments).toBe(4);
  });

  it("preço de toda poção corresponde à fórmula e a magia existe no pacote", () => {
    for (const p of cat("pocao")) {
      expect(catalog.get(p.data.spellId as string), p.id).toBeDefined();
      const mana = Math.sqrt((p.data.price as number) / 30);
      expect(Number.isInteger(mana), p.id).toBe(true);
    }
  });

  it("itens com preço da tabela têm preço numérico", () => {
    for (const e of [...cat("arma-magica"), ...cat("armadura-magica"), ...cat("acessorio")]) {
      expect(typeof e.data.price, e.id).toBe("number");
      expect(["menor", "medio", "maior"]).toContain(e.data.tier);
    }
  });
});

describe("Tormenta20 (2020) — ficha", () => {
  it("anão guerreiro de 1º nível: PV = 20 + Con + 3 (Duro como Pedra)", () => {
    const c = emptyCharacter({ name: "Anão", speciesId: "species:anao", classes: [{ classId: "class:guerreiro", levels: 1 }], baseAbilities: { ...base, con: 14 } });
    // Con 14 + 4 = 18 (+4).
    expect(t20.derive(c, catalog).abilities.con).toEqual({ score: 18, modifier: 4 });
    expect(stat(c, "hp")).toBe(20 + 4 + 3);
    expect(stat(c, "mp")).toBe(3);
    expect(stat(c, "speed")).toBe("6m");
  });

  it("multiclasse: o 1º nível da nova classe dá os PV de um nível seguinte (exemplo do livro)", () => {
    const c = emptyCharacter({
      name: "Z",
      speciesId: "species:minotauro",
      classes: [{ classId: "class:arcanista", levels: 3 }, { classId: "class:paladino", levels: 1 }],
      baseAbilities: { ...base, con: 8 }, // 8 + 2 = 10 (+0)
      choices: [{ slot: "arcanista-caminho", contentId: "feature:arcanista-mago", atLevel: 1, locked: false }],
    });
    expect(stat(c, "hp")).toBe(8 + 2 * 2 + 5);
    expect(t20.validate(c, catalog).issues.map((i) => i.code)).not.toContain("multiclass.disabled");
  });

  it("elfo arcanista mago: PM = 6/nível + bônus de Int + 1/nível (Herança Feérica)", () => {
    const c = emptyCharacter({
      name: "E",
      speciesId: "species:elfo",
      classes: [{ classId: "class:arcanista", levels: 1 }],
      baseAbilities: { ...base, int: 16 }, // 16 + 4 = 20 (+5)
      choices: [{ slot: "arcanista-caminho", contentId: "feature:arcanista-mago", atLevel: 1, locked: false }],
    });
    expect(stat(c, "mp")).toBe(6 + 5 + 1);
  });

  it("arcanista sem caminho avisa que o atributo-chave está pendente", () => {
    const c = emptyCharacter({ name: "A", classes: [{ classId: "class:arcanista", levels: 1 }], baseAbilities: base });
    expect(t20.derive(c, catalog).pending.join(" ")).toMatch(/Caminho do Arcanista/);
  });

  it("paladino soma o bônus de Carisma aos PM uma vez; penalidade não reduz", () => {
    const pal = (car: number) =>
      emptyCharacter({ name: "P", speciesId: "species:goblin", classes: [{ classId: "class:paladino", levels: 2 }], baseAbilities: { ...base, car } });
    expect(stat(pal(16), "mp")).toBe(3 * 2 + 2); // Car 16 - 2 = 14 (+2)
    expect(stat(pal(8), "mp")).toBe(3 * 2);
  });

  it("modificadores flexíveis de raça", () => {
    const human = (assignedBonuses: Record<string, number>) =>
      emptyCharacter({ name: "H", speciesId: "species:humano", baseAbilities: base, assignedBonuses });
    expect(codes(human({ for: 2, des: 2, con: 2 }))).not.toContain("species.flexible_invalid");
    expect(t20.derive(human({ for: 2, des: 2, con: 2 }), catalog).abilities.for.score).toBe(12);
    expect(codes(human({ for: 2 }))).toContain("species.flexible_pending");
    expect(codes(human({ for: 4, des: 2 }))).toContain("species.flexible_invalid");

    const aberrant = emptyCharacter({ name: "L", speciesId: "species:cria-aberrante", baseAbilities: base, assignedBonuses: { car: 2, for: 2, des: 2 } });
    expect(codes(aberrant)).toContain("species.flexible_invalid");

    const dwarf = emptyCharacter({ name: "D", speciesId: "species:anao", baseAbilities: base, assignedBonuses: { for: 2 } });
    expect(codes(dwarf)).toContain("species.flexible_unused");
    expect(t20.derive(dwarf, catalog).abilities.for.score).toBe(10);
  });

  it("modificador de raça nunca baixa um atributo para menos de 3", () => {
    const c = emptyCharacter({ name: "S", speciesId: "species:silfide", baseAbilities: { ...base, for: 5 } });
    expect(t20.derive(c, catalog).abilities.for.score).toBe(3);
  });

  it("golem não pode ter origem", () => {
    const c = emptyCharacter({ name: "G", speciesId: "species:golem", backgroundId: "origin:soldado" });
    expect(codes(c)).toContain("species.no_origin");
  });

  it("classe sem regras incluídas exige aprovação do mestre", () => {
    const c = emptyCharacter({ name: "A", classes: [{ classId: "class:artifice", levels: 1 }] });
    const r = t20.validate(c, catalog);
    expect(r.issues.find((i) => i.code === "class.restricted")?.severity).toBe("gm_approval");
  });

  it("perícias fixas da classe contam como treinadas", () => {
    const c = emptyCharacter({ name: "B", classes: [{ classId: "class:barbaro", levels: 3 }], baseAbilities: { ...base, for: 18 } });
    const luta = t20.derive(c, catalog).skills!.find((s) => s.id === "skill:luta")!;
    expect(luta).toMatchObject({ trained: true, value: 7 });
  });

  it("pré-requisitos de poderes usam atributos, perícias treinadas e proficiências", () => {
    const avail = (c: ReturnType<typeof emptyCharacter>, id: string) => t20.evaluateOption(c, catalog.get(id)!, catalog).availability;
    const weak = emptyCharacter({ name: "F", classes: [{ classId: "class:guerreiro", levels: 1 }], baseAbilities: base });
    const strong = emptyCharacter({ name: "F", classes: [{ classId: "class:guerreiro", levels: 1 }], baseAbilities: { ...base, for: 13 } });
    expect(avail(weak, "power:ataque-poderoso")).not.toBe("available_now");
    expect(avail(strong, "power:ataque-poderoso")).toBe("available_now");
    // Guerreiro é proficiente com armaduras pesadas; arcanista não.
    expect(avail(strong, "power:encouracado")).toBe("available_now");
    const mage = emptyCharacter({ name: "M", classes: [{ classId: "class:arcanista", levels: 1 }], baseAbilities: base });
    expect(avail(mage, "power:encouracado")).not.toBe("available_now");
    // Poder de classe exige a classe e o nível.
    expect(avail(strong, "power:guerreiro-golpe-pessoal")).toBe("available_later");
    expect(avail(mage, "power:guerreiro-golpe-pessoal")).not.toBe("available_now");
  });

  it("magias dependem da tradição e do círculo da classe", () => {
    const avail = (classId: string, levels: number, id: string) =>
      t20.evaluateOption(emptyCharacter({ name: "C", classes: [{ classId, levels }], baseAbilities: base }), catalog.get(id)!, catalog).availability;
    expect(avail("class:clerigo", 1, "spell:curar-ferimentos")).toBe("available_now");
    expect(avail("class:arcanista", 1, "spell:curar-ferimentos")).not.toBe("available_now");
    expect(avail("class:arcanista", 1, "spell:bola-de-fogo")).toBe("available_later");
    expect(avail("class:arcanista", 5, "spell:bola-de-fogo")).toBe("available_now");
    expect(avail("class:druida", 1, "spell:luz")).toBe("available_now");
  });

  it("poderes concedidos exigem ser devoto da divindade", () => {
    const fighter = (choices: { slot: string; contentId: string; atLevel: number; locked: boolean }[]) =>
      emptyCharacter({ name: "D", classes: [{ classId: "class:guerreiro", levels: 1 }], baseAbilities: base, choices });
    const id = "power:coragem-total";
    expect(t20.evaluateOption(fighter([]), catalog.get(id)!, catalog).availability).not.toBe("available_now");
    const devoto = fighter([{ slot: "divindade", contentId: "deity:deus-da-justica", atLevel: 1, locked: false }]);
    expect(t20.evaluateOption(devoto, catalog.get(id)!, catalog).availability).toBe("available_now");
  });

  it("progressão por XP divergente gera aviso", () => {
    const c = emptyCharacter({ name: "X", level: 2, progressionMode: "xp", experience: 6000 });
    expect(codes(c)).toContain("progression.xp_level_mismatch");
  });
});

describe("Tormenta20 (2020) — inventário", () => {
  let n = 0;
  const item = (contentId: string, extra: Partial<InventoryItem> = {}): InventoryItem => ({
    entryId: `i${++n}`,
    contentId,
    quantity: 1,
    equipped: true,
    modifications: [],
    enchantments: [],
    ...extra,
  });
  const fighter = (inventory: InventoryItem[], abilities: Partial<typeof base> = {}) =>
    emptyCharacter({
      name: "G",
      speciesId: "species:humano",
      classes: [{ classId: "class:guerreiro", levels: 1 }],
      baseAbilities: { ...base, ...abilities },
      inventory,
    });
  const skill = (c: ReturnType<typeof emptyCharacter>, id: string) => t20.derive(c, catalog).skills!.find((s) => s.id === id)!.value;

  it("todo item específico de arma ou armadura aponta para um item base do catálogo", () => {
    const specific = catalog.ofKind("equipment").filter((e) => ["arma-magica", "armadura-magica"].includes(e.data.category as string));
    expect(specific.length).toBe(31);
    for (const e of specific) {
      expect(catalog.get(e.data.baseItemId as string), e.name).toBeDefined();
      for (const id of [...((e.data.enchantments as string[]) ?? []), ...((e.data.modifications as string[]) ?? [])]) {
        expect(catalog.get(id), `${e.name}: ${id}`).toBeDefined();
      }
    }
  });

  it("armadura leve e escudo somam na Defesa e na penalidade", () => {
    const c = fighter([item("equipment:couro-batido"), item("equipment:escudo-leve")], { des: 14 });
    expect(stat(c, "defense")).toBe(10 + 2 + 3 + 1);
    expect(stat(c, "armorPenalty")).toBe(-2);
    expect(skill(c, "skill:furtividade")).toBe(skill(fighter([], { des: 14 }), "skill:furtividade") - 2);
  });

  it("armadura pesada anula a Destreza na Defesa e reduz o deslocamento", () => {
    const c = fighter([item("equipment:brunea")], { des: 14 });
    expect(stat(c, "defense")).toBe(10 + 0 + 5);
    expect(stat(c, "speed")).toBe("6m");
    // Itens fora do corpo não contam.
    expect(stat(fighter([item("equipment:brunea", { equipped: false })], { des: 14 }), "defense")).toBe(12);
  });

  it("armadura específica usa o item base com modificações e encantos (Baluarte Anão)", () => {
    const c = fighter([item("equipment:baluarte-anao")]);
    expect(stat(c, "defense")).toBe(10 + 10 + 1 + 2);
    expect(stat(c, "armorPenalty")).toBe(-6);
  });

  it("mitral e modificações aplicadas pela ficha mudam penalidade, Destreza máxima e preço", () => {
    const c = fighter([item("equipment:brunea", { materialId: "equipment:mitral", modifications: ["equipment:ajustada"] })], { des: 16 });
    expect(stat(c, "defense")).toBe(10 + 2 + 5);
    expect(stat(c, "armorPenalty")).toBeUndefined();
    const row = t20.derive(c, catalog).inventory!.rows[0];
    // Brunea 50 + duas modificações (material conta como uma) 1.000 + mitral em armadura pesada 4.000.
    expect(row.value).toBe(50 + 1000 + 4000);
    expect(row.weight).toBe(7.5);
  });

  it("bônus de acessórios: atributos, Defesa e resistências", () => {
    const c = fighter([item("equipment:luvas-da-delicadeza"), item("equipment:anel-da-protecao"), item("equipment:manto-da-resistencia")], { des: 14 });
    const d = t20.derive(c, catalog);
    expect(d.abilities.des.score).toBe(16);
    expect(stat(c, "defense")).toBe(10 + 3 + 2);
    expect(skill(c, "skill:reflexos")).toBe(skill(fighter([], { des: 16 }), "skill:reflexos") + 2);
  });

  it("só três itens mágicos funcionam ao mesmo tempo; armas não contam", () => {
    const four = fighter([
      item("equipment:anel-da-protecao"),
      item("equipment:manto-da-resistencia"),
      item("equipment:torque-do-vigor"),
      item("equipment:luvas-da-delicadeza"),
      item("equipment:espada-sortuda"),
    ]);
    expect(codes(four)).toContain("inventory.magic_limit");
    const rows = t20.derive(four, catalog).inventory!.rows;
    expect(rows.filter((r) => !r.effective).map((r) => r.name)).toEqual(["Luvas da Delicadeza"]);
    expect(t20.derive(four, catalog).abilities.des.score).toBe(10);
    expect(codes(fighter([item("equipment:anel-da-protecao"), item("equipment:espada-sortuda")]))).not.toContain("inventory.magic_limit");
  });

  it("duas armaduras ou dois escudos são inválidos", () => {
    expect(codes(fighter([item("equipment:brunea"), item("equipment:couro-batido")]))).toContain("inventory.two_armors");
    expect(codes(fighter([item("equipment:escudo-leve"), item("equipment:escudo-pesado")]))).toContain("inventory.two_shields");
  });

  it("proficiência: arcanista com armadura pesada e espada longa recebe avisos", () => {
    const c = emptyCharacter({
      name: "A",
      classes: [{ classId: "class:arcanista", levels: 1 }],
      baseAbilities: base,
      inventory: [item("equipment:brunea"), item("equipment:espada-longa")],
    });
    expect(codes(c)).toEqual(expect.arrayContaining(["inventory.armor_not_proficient", "inventory.weapon_not_proficient"]));
    // A penalidade passa a valer em perícias de Força, como Luta.
    expect(skill(c, "skill:luta")).toBe(-2);
    expect(codes(fighter([item("equipment:brunea"), item("equipment:espada-longa")]))).not.toContain("inventory.weapon_not_proficient");
  });

  it("carga: até 3 × Força sem penalidade, máximo 10 × Força (exemplo do livro: Força 15 = 45kg / 150kg)", () => {
    const heavy = (q: number) => fighter([item("equipment:armadura-completa", { equipped: false, quantity: q })], { for: 15 });
    expect(t20.derive(heavy(1), catalog).inventory!.load).toEqual({ light: 45, max: 150, state: "normal" });
    expect(t20.derive(heavy(2), catalog).inventory!.load!.state).toBe("encumbered");
    expect(stat(heavy(2), "speed")).toBe("6m");
    expect(codes(heavy(7))).toContain("inventory.overloaded");
    // Cinto da Força do Gigante (+5 Força) aumenta a capacidade.
    const belt = fighter([item("equipment:cinto-da-forca-do-gigante")], { for: 15 });
    expect(t20.derive(belt, catalog).inventory!.load!.light).toBe(60);
  });

  it("melhorias incompatíveis com o item são inválidas", () => {
    expect(codes(fighter([item("equipment:espada-longa", { enchantments: ["equipment:defensor"] })]))).toContain("inventory.improvement_invalid");
    expect(codes(fighter([item("equipment:mochila", { materialId: "equipment:mitral" })]))).toContain("inventory.improvement_invalid");
    expect(codes(fighter([item("equipment:espada-longa", { enchantments: ["equipment:formidavel"] })]))).not.toContain("inventory.improvement_invalid");
  });

  it("dinheiro: moedas, dinheiro inicial e pagamento com troco", () => {
    expect(t20.startingWealth!(1)).toEqual({ formula: "4d6" });
    expect(t20.startingWealth!(5)).toEqual({ amount: 2000 });
    expect(moneyTotal({ mc: 5, m: 3, mo: 2 }, T20_CURRENCIES)).toBe(23.5);
    expect(payWith({ m: 10, mo: 1 }, T20_CURRENCIES, 2.5)).toEqual({ mo: 1, m: 7, mc: 5 });
    expect(payWith({ m: 0, mo: 2 }, T20_CURRENCIES, 15)).toEqual({ mo: 0, m: 5, mc: 0 });
    expect(payWith({ m: 1 }, T20_CURRENCIES, 2)).toBeNull();
    expect(receive({ m: 1 }, T20_CURRENCIES, 7.5)).toEqual({ m: 8, mc: 5 });
    expect(t20.derive(emptyCharacter({ currency: { m: 12, mo: 3 } }), catalog).inventory!.money).toBe(42);
  });

  it("item personalizado entra no inventário sem efeito nas estatísticas", () => {
    const c = fighter([{ entryId: "x", customName: "Medalhão da família", quantity: 1, equipped: true, modifications: [], enchantments: [] }]);
    expect(codes(c).filter((k) => k.startsWith("inventory."))).toEqual([]);
    expect(t20.derive(c, catalog).inventory!.rows[0].name).toBe("Medalhão da família");
  });
});
