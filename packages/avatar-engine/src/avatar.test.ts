import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkSvg } from "./asset-build";
import { checkAvatar, defaultAvatar, defaultCatalog } from "./catalog";
import { mix, shade } from "./color";
import { colorize, compose, composeSvg } from "./compose";
import { record, redo, startHistory, undo } from "./history";
import { avatarConfigSchema, CATEGORIES, LAYER_ORDER, REQUIRED_SLOTS, type AvatarConfig } from "./model";
import { randomize, seededRng } from "./random";
import { dressFromEquipment, suggestFromCharacter } from "./suggest";

const base = () => defaultAvatar();
const withSlot = (c: AvatarConfig, slot: keyof AvatarConfig["slots"], part: string | null): AvatarConfig => ({
  ...c,
  slots: { ...c.slots, [slot]: { part, colors: {} } },
});

describe("catálogo de peças", () => {
  it("o módulo gerado está em dia com assets/avatar", () => {
    const script = path.resolve(import.meta.dirname, "../scripts/build-assets.ts");
    expect(() => execFileSync(process.execPath, ["--import", "tsx", script, "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("toda camada usada existe e é um SVG válido", () => {
    for (const p of defaultCatalog.data.parts) {
      for (const l of p.layers) expect(checkSvg(l.file, defaultCatalog.file(l.file))).toEqual([]);
    }
  });

  it("rejeita SVG com script ou link externo", () => {
    const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 768">\n';
    expect(checkSvg("x.svg", head + "<script>alert(1)</script></svg>")).toHaveLength(1);
    expect(checkSvg("x.svg", head + '<rect onclick="x()"/></svg>')).toHaveLength(1);
    expect(checkSvg("x.svg", head + '<use href="http://mal.example/a.svg"/></svg>')).toHaveLength(1);
  });

  it("cada slot obrigatório tem pelo menos uma peça", () => {
    for (const slot of REQUIRED_SLOTS) expect(defaultCatalog.forSlot(slot).length).toBeGreaterThan(0);
  });
});

describe("configuração do avatar", () => {
  it("o avatar padrão é válido e completo", () => {
    const c = base();
    expect(avatarConfigSchema.parse(c)).toEqual(c);
    expect(checkAvatar(c)).toEqual([]);
  });

  it("recusa cor que não seja #rrggbb (impede injeção no SVG)", () => {
    const c = base();
    expect(() => avatarConfigSchema.parse({ ...c, colors: { ...c.colors, skin: 'red"/><script>' } })).toThrow();
  });

  it("aponta peça inexistente, slot errado e obrigatório vazio", () => {
    let c = withSlot(base(), "hair", "hair:nao-existe");
    c = withSlot(c, "beard", "hair:curto");
    c = withSlot(c, "eyes", null);
    const msgs = checkAvatar(c).map((i) => i.slot);
    expect(msgs).toEqual(expect.arrayContaining(["hair", "beard", "eyes"]));
  });
});

describe("cores", () => {
  it("mistura e variações", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(shade("#808080")).toBe("#808080");
    expect(shade("#808080", "dark")).not.toBe("#808080");
  });

  it("substitui marcadores e o contorno", () => {
    const out = colorize('<path fill="#{skin}" stroke="#{line}"/><path fill="#{skin-dark}"/>', { skin: "#c98e6a" });
    expect(out).not.toContain("#{");
    expect(out).toContain('fill="#c98e6a"');
  });
});

describe("composição", () => {
  it("ordena as camadas pela ordem de desenho e não deixa marcadores", () => {
    const { layers } = compose(base());
    const idx = layers.map((l) => LAYER_ORDER.indexOf(l.layer));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    for (const l of layers) expect(l.svg).not.toMatch(/#\{/);
  });

  it("capuz esconde o cabelo de trás e usa a variante com aberturas quando há chifres", () => {
    let c = withSlot(base(), "hair", "hair:longo");
    c = withSlot(c, "hood", "hood:capuz");
    let keys = compose(c).layers.map((l) => l.layer);
    expect(keys).not.toContain("hairBack");
    expect(keys).toContain("hairFront");

    const closed = compose(c).layers.find((l) => l.layer === "hoodFront")!.svg;
    c = withSlot(c, "horns", "horns:curvados");
    const comp = compose(c);
    keys = comp.layers.map((l) => l.layer);
    expect(keys.indexOf("horns")).toBeGreaterThan(keys.indexOf("hoodFront"));
    const open = comp.layers.find((l) => l.layer === "hoodFront")!.svg;
    expect(open).not.toBe(closed);
    expect(open.length).toBeGreaterThan(closed.length);
    expect(comp.notes.join(" ")).toMatch(/aberturas/);
  });

  it("tipo físico escala tronco e pernas, mas não a cabeça", () => {
    const c = { ...base(), build: "robusto" as const };
    const { layers } = compose(c);
    expect(layers.find((l) => l.layer === "torso")!.svg).toContain("scale(1.14 1)");
    expect(layers.find((l) => l.layer === "head")!.svg).not.toContain("scale(");
  });

  it("ajuste dos chifres respeita os limites do catálogo", () => {
    const c = withSlot(base(), "horns", "horns:retos");
    c.slots.horns!.transform = { scale: 2, dy: -60 };
    const svg = compose(c).layers.find((l) => l.layer === "horns")!.svg;
    expect(svg).toContain("scale(1.3)");
    expect(svg).toContain("translate(0 -24)");
  });

  it("ids internos ganham prefixo por camada", () => {
    const c = withSlot(base(), "eyes", "eyes:brilhantes");
    const svg = composeSvg(c);
    expect(svg).toContain('id="eyes-eyes-glow"');
    expect(svg).toContain("url(#eyes-eyes-glow)");
  });

  it("referências de <use> seguem o prefixo do id", () => {
    const svg = composeSvg(base());
    expect(svg).toContain('id="body-body-legL"');
    expect(svg).toContain('href="#body-body-legL"');
    expect(svg).not.toMatch(/href="#(?!body-|ears-|brows-|feet-|torso-|hair-|eyes-|nose-|mouth-|head-|legs-|belt-|background-)/);
  });

  it("prefixo extra deixa ids únicos entre avatares na mesma página", () => {
    const svg = composeSvg(withSlot(base(), "eyes", "eyes:brilhantes"), { idPrefix: "c1" });
    expect(svg).toContain('id="c1-eyes-eyes-glow"');
    expect(svg).toContain("url(#c1-eyes-eyes-glow)");
  });

  it("gera retrato recortado e opção sem fundo", () => {
    const portrait = composeSvg(base(), { frame: "portrait" });
    expect(portrait).toContain('viewBox="194 50 124 124"');
    expect(composeSvg(base(), { background: false })).not.toContain('data-layer="background');
  });
});

describe("randomização", () => {
  it("é determinística com semente", () => {
    expect(randomize(base(), { rng: seededRng(7) })).toEqual(randomize(base(), { rng: seededRng(7) }));
  });

  it("respeita travas e só mexe nas categorias pedidas", () => {
    const c = base();
    for (let seed = 1; seed < 30; seed++) {
      const r = randomize(c, { rng: seededRng(seed), locked: ["cabelo", "pele"] });
      expect(r.slots.hair).toEqual(c.slots.hair);
      expect(r.colors.skin).toBe(c.colors.skin);
      const onlyEyes = randomize(c, { rng: seededRng(seed), categories: ["olhos"] });
      expect(onlyEyes.slots.torso).toEqual(c.slots.torso);
      expect(onlyEyes.build).toBe(c.build);
    }
  });

  it("nunca esvazia slot obrigatório e sempre gera avatar válido", () => {
    for (let seed = 1; seed < 60; seed++) {
      const r = randomize(base(), { rng: seededRng(seed) });
      expect(checkAvatar(r)).toEqual([]);
      expect(() => avatarConfigSchema.parse(r)).not.toThrow();
    }
  });

  it("sem fantasia não usa peças fantásticas", () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = randomize(base(), { rng: seededRng(seed), fantasy: false });
      for (const choice of Object.values(r.slots)) {
        expect(defaultCatalog.get(choice?.part)?.tags ?? []).not.toContain("fantastico");
      }
    }
  });

  it("todas as categorias do editor existem", () => {
    expect(CATEGORIES.map((c) => c.id)).toContain("chifres");
  });
});

describe("histórico", () => {
  it("desfaz e refaz, e um novo estado apaga o futuro", () => {
    let h = startHistory(1);
    h = record(h, 2);
    h = record(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    h = record(h, 9);
    expect(h.present).toBe(9);
    expect(h.future).toEqual([]);
    expect(record(h, 9)).toBe(h);
  });
});

describe("modo assistido", () => {
  it("sugere aparência por raça e classe sem tocar no resto", () => {
    const { config, notes } = suggestFromCharacter(base(), { species: "anao", className: "cavaleiro" });
    expect(config.build).toBe("robusto");
    expect(config.slots.beard?.part).toBe("beard:longa-trancada");
    expect(config.slots.armor?.part).toBe("armor:peitoral");
    expect(notes).toHaveLength(2);
    expect(checkAvatar(config)).toEqual([]);
  });

  it("toda sugestão aponta para peças que existem", () => {
    const species = ["humano", "anao", "elfo", "goblin", "minotauro", "golem", "medusa", "troglodita", "descendente-abissal", "silfide"];
    const classes = ["arcanista", "barbaro", "bardo", "cacador", "clerigo", "druida", "ladino", "lutador", "nobre", "paladino"];
    for (const s of species) for (const k of classes) expect(checkAvatar(suggestFromCharacter(base(), { species: s, className: k }).config)).toEqual([]);
  });
});

describe("fase 6: asas, cauda, escudo e marcas", () => {
  it("asas e cauda ficam atrás do corpo; escudo na frente do tronco", () => {
    let c = withSlot(base(), "wings", "wings:penas");
    c = withSlot(c, "tail", "tail:demoniaca");
    c = withSlot(c, "shield", "shield:redondo");
    const keys = compose(c).layers.map((l) => l.layer);
    expect(keys.indexOf("wings")).toBeLessThan(keys.indexOf("body"));
    expect(keys.indexOf("tail")).toBeLessThan(keys.indexOf("body"));
    expect(keys.indexOf("shield")).toBeGreaterThan(keys.indexOf("torso"));
  });

  it("avatares salvos antes das marcas continuam válidos", () => {
    const { marks: _omit, ...old } = base();
    void _omit;
    expect(avatarConfigSchema.parse(old).marks).toEqual([]);
  });

  it("compõe várias marcas com posição, escala, rotação, opacidade, espelho e cor", () => {
    const c: AvatarConfig = {
      ...base(),
      marks: [
        { part: "marks:cicatriz-olho", dx: 10, dy: -4, scale: 1.2, rotate: 15, opacity: 0.8, mirror: true },
        { part: "marks:tatuagem-tribal", dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 1, mirror: false, color: "#123456" },
      ],
    };
    const marks = compose(c).layers.filter((l) => l.layer === "marks");
    expect(marks).toHaveLength(2);
    expect(marks[0].svg).toContain("translate(512 0) scale(-1 1)");
    expect(marks[0].svg).toContain("rotate(15) scale(1.2)");
    expect(marks[0].svg).toContain('opacity="0.8"');
    expect(marks[1].svg).toContain("#123456");
    const keys = compose(c).layers.map((l) => l.layer);
    expect(keys.indexOf("marks")).toBeGreaterThan(keys.indexOf("mouth"));
  });

  it("recusa marcas demais, fora dos limites ou inexistentes", () => {
    const mark = { part: "marks:sardas", dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 1, mirror: false };
    expect(() => avatarConfigSchema.parse({ ...base(), marks: Array(9).fill(mark) })).toThrow();
    expect(() => avatarConfigSchema.parse({ ...base(), marks: [{ ...mark, scale: 5 }] })).toThrow();
    expect(checkAvatar({ ...base(), marks: [{ ...mark, part: "marks:nao-existe" }] })).toHaveLength(1);
  });

  it("randomizar marcas gera no máximo duas, sempre válidas, e respeita a trava", () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = randomize(base(), { rng: seededRng(seed), categories: ["marcas"] });
      expect(r.marks.length).toBeLessThanOrEqual(2);
      expect(checkAvatar(r)).toEqual([]);
      expect(() => avatarConfigSchema.parse(r)).not.toThrow();
      const withMark = { ...base(), marks: [{ part: "marks:sardas", dx: 0, dy: 0, scale: 1, rotate: 0, opacity: 1, mirror: false }] };
      expect(randomize(withMark, { rng: seededRng(seed), locked: ["marcas"] }).marks).toEqual(withMark.marks);
    }
  });
});

describe("fase 5: aparência pelo equipamento", () => {
  it("veste armadura, escudo e capa conforme os itens equipados", () => {
    const { config, notes } = dressFromEquipment(base(), [
      { name: "Brunea", category: "armadura" },
      { name: "Escudo Pesado", category: "escudo" },
      { name: "Capa de viagem", category: "item" },
    ]);
    expect(config.slots.armor?.part).toBe("armor:cota-de-malha");
    expect(config.slots.shield?.part).toBe("shield:heraldico");
    expect(config.slots.cape?.part).toBe("cape:capa");
    expect(notes).toHaveLength(3);
  });

  it("reconhece nomes em inglês e retira o que não está mais equipado", () => {
    const armored = withSlot(withSlot(base(), "armor", "armor:peitoral"), "shield", "shield:redondo");
    expect(dressFromEquipment(armored, [{ name: "Leather", category: "armor" }]).config.slots.armor?.part).toBe("armor:couro");
    const bare = dressFromEquipment(armored, []).config;
    expect(bare.slots.armor?.part).toBeNull();
    expect(bare.slots.shield?.part).toBeNull();
    expect(checkAvatar(bare)).toEqual([]);
  });

  it("todas as armaduras do Tormenta20 (2020) viram alguma peça", () => {
    for (const name of ["Armadura Acolchoada", "Armadura Completa", "Armadura de Couro", "Brunea", "Cota de Malha", "Couraça", "Couro Batido", "Gibão de Peles", "Loriga Segmentada", "Meia Armadura"]) {
      expect(dressFromEquipment(base(), [{ name, category: "armadura" }]).config.slots.armor?.part, name).toBeTruthy();
    }
  });
});
