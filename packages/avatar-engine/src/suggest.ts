import type { AvatarConfig, BuildId, SlotId } from "./model";

/**
 * Modo assistido (seção 6.3): uma montagem inicial a partir de dicas da ficha.
 * São sugestões cosméticas, nunca regras: o avatar não concede nem exige nada da ficha.
 * As chaves são ids de raça e classe sem o prefixo (ex.: "anao", "guerreiro").
 */
interface Hint {
  build?: BuildId;
  skin?: string;
  eyes?: string;
  horn?: string;
  slots?: Partial<Record<SlotId, string | null>>;
  note: string;
}

const SPECIES: Record<string, Hint> = {
  anao: { build: "robusto", slots: { beard: "beard:longa-trancada", ears: "ears:humana" }, note: "Anão: corpo robusto e barba trançada." },
  elfo: { build: "esguio", slots: { ears: "ears:pontuda", beard: null }, note: "Elfo: corpo esguio e orelhas pontudas." },
  goblin: { build: "esguio", skin: "#6f9a4a", slots: { ears: "ears:longa", mouth: "mouth:presas" }, note: "Goblin: pele verde, orelhas longas e presas." },
  minotauro: { build: "robusto", horn: "#e8dcc4", slots: { horns: "horns:curvados", tail: "tail:com-tufo" }, note: "Minotauro: corpo robusto, chifres curvados e cauda." },
  "meia-driade": { skin: "#7fa35f", slots: { ears: "ears:pontuda" }, note: "Meia-dríade: pele esverdeada e orelhas pontudas." },
  "meio-genio": { skin: "#5a7fc4", eyes: "#f2c84b", slots: { eyes: "eyes:brilhantes" }, note: "Meio-gênio: pele azulada e olhos brilhantes." },
  golem: { build: "robusto", skin: "#8c9098", slots: { hair: null, eyes: "eyes:brilhantes", brows: "brows:franzidas" }, eyes: "#f29b38", note: "Golem: corpo metálico, sem cabelo, olhos brilhantes." },
  halfling: { build: "medio", slots: { ears: "ears:pontuda" }, note: "Halfling: orelhas levemente pontudas." },
  "meio-gnomo": { slots: { ears: "ears:pontuda", nose: "nose:aquilino" }, note: "Meio-gnomo: orelhas pontudas e nariz marcante." },
  medusa: { skin: "#7a9a72", eyes: "#c0a02a", slots: { eyes: "eyes:reptilianos" }, note: "Medusa: pele esverdeada e olhos reptilianos." },
  "esqueleto-desperto": { skin: "#e9e4d6", eyes: "#7fd0ff", slots: { hair: null, eyes: "eyes:brilhantes", beard: null, nose: "nose:arrebitado" }, note: "Esqueleto desperto: tom ósseo e olhos brilhantes." },
  sereia: { skin: "#7fb3b8", slots: { ears: "ears:pontuda" }, note: "Sereia/tritão: pele azul-esverdeada." },
  silfide: { build: "esguio", skin: "#d8e6f2", slots: { ears: "ears:longa", eyes: "eyes:brilhantes", wings: "wings:fada" }, eyes: "#9fd8ff", note: "Sílfide: tons claros, orelhas longas e asas translúcidas." },
  "descendente-celestial": { eyes: "#f2d27a", slots: { eyes: "eyes:brilhantes" }, note: "Descendente celestial: olhos dourados brilhantes." },
  "descendente-abissal": { skin: "#b8423a", horn: "#2b2b2b", slots: { horns: "horns:para-tras", eyes: "eyes:reptilianos", tail: "tail:demoniaca" }, eyes: "#f2c84b", note: "Descendente abissal: pele avermelhada, chifres e cauda." },
  troglodita: { build: "robusto", skin: "#6b7f5a", slots: { hair: null, eyes: "eyes:reptilianos", mouth: "mouth:presas", tail: "tail:reptiliana" }, eyes: "#c0a02a", note: "Troglodita: escamas esverdeadas, olhos e cauda reptilianos." },
  // D&D (SRD)
  dwarf: { build: "robusto", slots: { beard: "beard:longa-trancada" }, note: "Anão: corpo robusto e barba trançada." },
  elf: { build: "esguio", slots: { ears: "ears:pontuda", beard: null }, note: "Elfo: corpo esguio e orelhas pontudas." },
  tiefling: { skin: "#b8423a", slots: { horns: "horns:curvados", tail: "tail:demoniaca" }, note: "Tiefling: pele avermelhada, chifres e cauda." },
  dragonborn: { build: "robusto", skin: "#8a5a3a", slots: { hair: null, eyes: "eyes:reptilianos", tail: "tail:reptiliana" }, note: "Draconato: escamas, olhos e cauda reptilianos." },
  gnome: { slots: { ears: "ears:pontuda", nose: "nose:aquilino" }, note: "Gnomo: orelhas pontudas e nariz marcante." },
  "half-elf": { slots: { ears: "ears:pontuda" }, note: "Meio-elfo: orelhas levemente pontudas." },
  "half-orc": { build: "robusto", skin: "#8a9a6a", slots: { mouth: "mouth:presas" }, note: "Meio-orc: corpo robusto, pele acinzentada e presas." },
  orc: { build: "robusto", skin: "#7a9060", slots: { mouth: "mouth:presas" }, note: "Orc: corpo robusto, pele esverdeada e presas." },
  goliath: { build: "robusto", skin: "#9a9aa0", slots: { hair: null }, note: "Golias: corpo robusto e pele acinzentada." },
};

const CLASSES: Record<string, Hint> = {
  arcanista: { slots: { torso: "torso:manto-longo", hood: "hood:capuz", armor: null }, note: "Arcanista: manto longo e capuz." },
  barbaro: { slots: { torso: "torso:camisa-colete", armor: "armor:couro", necklace: "necklace:pingente" }, note: "Bárbaro: couro e adornos." },
  bardo: { slots: { torso: "torso:camisa-colete", cape: "cape:capa", earrings: "earrings:argolas" }, note: "Bardo: colete, capa e brincos." },
  bucaneiro: { slots: { torso: "torso:camisa-colete", earrings: "earrings:argolas", belt: "belt:cinto-bolsa" }, note: "Bucaneiro: colete e argolas." },
  cacador: { slots: { torso: "torso:tunica", hood: "hood:capuz", armor: "armor:couro", cape: "cape:capa" }, note: "Caçador: capuz, couro e capa." },
  cavaleiro: { slots: { armor: "armor:peitoral", cape: "cape:capa", shield: "shield:heraldico" }, note: "Cavaleiro: peitoral de placas, capa e escudo." },
  clerigo: { slots: { torso: "torso:manto-longo", necklace: "necklace:pingente" }, note: "Clérigo: manto e símbolo no colar." },
  druida: { slots: { torso: "torso:tunica", hood: "hood:capuz", feet: "feet:sandalias" }, note: "Druida: túnica, capuz e sandálias." },
  guerreiro: { slots: { armor: "armor:cota-de-malha" }, note: "Guerreiro: cota de malha." },
  ladino: { slots: { hood: "hood:capuz", armor: "armor:couro", cape: "cape:capa" }, note: "Ladino: capuz, couro e capa." },
  lutador: { slots: { torso: "torso:camisa-colete", armor: null, feet: "feet:sandalias" }, note: "Lutador: roupas leves." },
  nobre: { slots: { torso: "torso:camisa-colete", cape: "cape:capa", necklace: "necklace:pingente" }, note: "Nobre: capa e colar." },
  paladino: { slots: { armor: "armor:peitoral", cape: "cape:capa", necklace: "necklace:pingente" }, note: "Paladino: peitoral, capa e símbolo." },
  // D&D (SRD)
  wizard: { slots: { torso: "torso:manto-longo", hood: "hood:capuz", armor: null }, note: "Mago: manto longo e capuz." },
  fighter: { slots: { armor: "armor:cota-de-malha" }, note: "Guerreiro: cota de malha." },
  rogue: { slots: { hood: "hood:capuz", armor: "armor:couro" }, note: "Ladino: capuz e couro." },
  cleric: { slots: { armor: "armor:cota-de-malha", necklace: "necklace:pingente" }, note: "Clérigo: cota e símbolo sagrado." },
  barbarian: { slots: { torso: "torso:camisa-colete", armor: "armor:couro", necklace: "necklace:pingente" }, note: "Bárbaro: couro e adornos." },
  bard: { slots: { torso: "torso:camisa-colete", cape: "cape:capa", earrings: "earrings:argolas" }, note: "Bardo: colete, capa e brincos." },
  druid: { slots: { torso: "torso:tunica", hood: "hood:capuz", feet: "feet:sandalias" }, note: "Druida: túnica, capuz e sandálias." },
  monk: { slots: { torso: "torso:tunica", armor: null, feet: "feet:sandalias" }, note: "Monge: túnica leve e sandálias." },
  paladin: { slots: { armor: "armor:peitoral", cape: "cape:capa", necklace: "necklace:pingente" }, note: "Paladino: peitoral, capa e símbolo." },
  ranger: { slots: { torso: "torso:tunica", hood: "hood:capuz", armor: "armor:couro", cape: "cape:capa" }, note: "Patrulheiro: capuz, couro e capa." },
  sorcerer: { slots: { torso: "torso:manto-longo", necklace: "necklace:pingente", armor: null }, note: "Feiticeiro: manto e amuleto." },
  warlock: { slots: { torso: "torso:manto-longo", hood: "hood:capuz", armor: null }, note: "Bruxo: manto longo e capuz." },
};

function apply(config: AvatarConfig, hint: Hint): AvatarConfig {
  const next: AvatarConfig = { ...config, colors: { ...config.colors }, slots: { ...config.slots } };
  if (hint.build) next.build = hint.build;
  if (hint.skin) next.colors.skin = hint.skin;
  if (hint.eyes) next.colors.eyeL = next.colors.eyeR = hint.eyes;
  if (hint.horn) next.colors.horn = hint.horn;
  for (const [slot, part] of Object.entries(hint.slots ?? {}) as [SlotId, string | null][]) next.slots[slot] = { part, colors: {} };
  return next;
}

/** Aplica as dicas da raça e da classe. Devolve o avatar sugerido e as explicações exibidas ao usuário. */
export function suggestFromCharacter(config: AvatarConfig, hints: { species?: string; className?: string }): { config: AvatarConfig; notes: string[] } {
  const notes: string[] = [];
  let next = config;
  const sp = hints.species ? SPECIES[hints.species] : undefined;
  const cl = hints.className ? CLASSES[hints.className] : undefined;
  if (sp) {
    next = apply(next, sp);
    notes.push(sp.note);
  }
  if (cl) {
    next = apply(next, cl);
    notes.push(cl.note);
  }
  return { config: next, notes };
}

/** Item equipado na ficha, como o avatar enxerga: só nome e categoria (sem regras). */
export interface EquippedItem {
  name: string;
  category?: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const ARMOR_RULES: { re: RegExp; part: string; label: string }[] = [
  { re: /placas|completa|loriga|meia armadura|couraca|peitoral|plate|splint|half|breastplate/, part: "armor:peitoral", label: "peitoral de placas" },
  { re: /malha|brunea|cota|chain|scale|ring/, part: "armor:cota-de-malha", label: "cota de malha" },
  { re: /couro|acolchoad|gibao|peles|leather|padded|hide|studded/, part: "armor:couro", label: "armadura de couro" },
];
const isArmor = (i: EquippedItem) => /armadura|armor/.test(norm(i.category ?? "")) || ARMOR_RULES.some((r) => r.re.test(norm(i.name)) && !/escudo|shield/.test(norm(i.name)));
const isShield = (i: EquippedItem) => /escudo|shield/.test(norm(`${i.category ?? ""} ${i.name}`));

/**
 * Aparência a partir do equipamento equipado (fase 5): armadura, escudo, capa e trajes.
 * É uma sugestão aplicada quando o usuário pede; trocar o visual nunca altera a ficha.
 */
export function dressFromEquipment(config: AvatarConfig, items: EquippedItem[]): { config: AvatarConfig; notes: string[] } {
  const next: AvatarConfig = { ...config, slots: { ...config.slots } };
  const notes: string[] = [];
  const set = (slot: SlotId, part: string | null) => {
    if (next.slots[slot]?.part === part) return;
    next.slots[slot] = { part, colors: part && config.slots[slot]?.part === part ? (config.slots[slot]?.colors ?? {}) : {} };
  };

  const armor = items.find((i) => isArmor(i) && !isShield(i));
  const armorRule = armor && ARMOR_RULES.find((r) => r.re.test(norm(armor.name)));
  if (armorRule) {
    set("armor", armorRule.part);
    notes.push(`${armor!.name}: ${armorRule.label}.`);
  } else {
    set("armor", null);
    if (armor) notes.push(`${armor.name}: sem desenho próprio, a armadura não aparece.`);
  }

  const shield = items.find(isShield);
  if (shield) {
    const heavy = /pesado|heavy|torre|tower/.test(norm(shield.name));
    set("shield", heavy ? "shield:heraldico" : "shield:redondo");
    notes.push(`${shield.name}: ${heavy ? "escudo heráldico" : "escudo redondo"}.`);
  } else set("shield", null);

  for (const item of items) {
    const n = norm(item.name);
    if (/capa|manto|cloak|cape/.test(n) && !isArmor(item)) {
      set("cape", "cape:capa");
      notes.push(`${item.name}: capa.`);
    } else if (/traje da corte|nobre|noble|fine clothes/.test(n)) {
      set("torso", "torso:camisa-colete");
      set("cape", "cape:capa");
      notes.push(`${item.name}: colete e capa.`);
    } else if (/camuflad|explorer|viajante|traveler/.test(n)) {
      set("torso", "torso:tunica");
      set("hood", "hood:capuz");
      notes.push(`${item.name}: túnica e capuz.`);
    } else if (/plebeu|common clothes/.test(n)) {
      set("torso", "torso:tunica");
      notes.push(`${item.name}: túnica simples.`);
    }
  }
  if (!items.length) notes.push("Nenhum item equipado na ficha: armadura e escudo foram retirados.");
  return { config: next, notes };
}
