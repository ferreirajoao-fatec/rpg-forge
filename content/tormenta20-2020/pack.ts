/**
 * Pacote de conteúdo Open Game — Tormenta20, livro básico, 1ª edição (2020).
 *
 * LICENÇA: Open Game License 1.0a. O texto completo da licença, o aviso de
 * copyright (seção 15) e a identificação do Conteúdo Open Game estão em
 * LICENSE-OGL.txt, nesta pasta, e devem acompanhar qualquer cópia.
 *
 * IDENTIDADE DO PRODUTO: o livro declara como Identidade do Produto os termos
 * do cenário (personagens, deuses, lugares e fenômenos) e as regras da classe
 * inventor (p. 391). Aqui, entradas e habilidades com esses nomes receberam
 * nomes genéricos. A referência ao livro fica em `source.page` e
 * `data.renamed`, sem reproduzir o nome original. A classe inventor aparece
 * apenas como nome e página, sem regras.
 *
 * Raças, classes, origens e perícias trazem resumos escritos à mão. Poderes,
 * magias, divindades, equipamento e itens mágicos (pasta data/) reproduzem o texto de regras
 * do livro, que é Conteúdo Open Game, com os termos de Identidade do Produto
 * substituídos e as frases de ambientação que citam o cenário removidas.
 */
import type { ContentEntry, ContentPack } from "../../src/rules/core/content";
// Gerados por scripts/tormenta20/extract.py (Conteúdo Open Game, termos de Identidade do Produto substituídos).
import deitiesData from "./data/deities.json";
import equipmentData from "./data/equipment.json";
import featuresData from "./data/features.json";
import magicItemsData from "./data/magic-items.json";
import powersData from "./data/powers.json";
import spellsData from "./data/spells.json";

const BOOK = "t20-2020";
const LICENSE = "OGL-1.0a";
const src = (page: number, section: string) => ({ sourcebookId: BOOK, edition: "2020", version: "1ª edição (2020)", section, page });

/** Marca entradas renomeadas por conterem Identidade do Produto. */
const renamed = (page: number) => ({
  renamed: { reason: "Identidade do Produto (OGL 1.0a, seção 7)", reference: `Livro básico (2020), p. ${page}` },
});

type Entry = Omit<ContentEntry, "origin" | "license" | "roles"> & Partial<Pick<ContentEntry, "roles">>;
const entry = (e: Entry): ContentEntry => ({ origin: "official", license: LICENSE, roles: [], ...e });

/* ------------------------------------------------------------------ */
/* Perícias (Tabela 2-1, p. 114)                                       */
/* ------------------------------------------------------------------ */

const SKILLS: [id: string, name: string, ability: string, trainedOnly: boolean, armor: boolean, page: number, summary: string][] = [
  ["acrobacia", "Acrobacia", "des", false, true, 115, "Proezas acrobáticas: equilíbrio, amortecer quedas, escapar de amarras e passar por inimigos."],
  ["adestramento", "Adestramento", "car", true, false, 115, "Lidar com animais: acalmar, comandar e manejar."],
  ["atletismo", "Atletismo", "for", false, false, 115, "Façanhas atléticas: escalar, nadar, saltar e correr."],
  ["atuacao", "Atuação", "car", false, false, 116, "Apresentações artísticas para impressionar ou ganhar dinheiro."],
  ["cavalgar", "Cavalgar", "des", false, false, 116, "Conduzir montarias em situações difíceis."],
  ["conhecimento", "Conhecimento", "int", true, false, 116, "Saber acadêmico: história, geografia, engenharia, idiomas."],
  ["cura", "Cura", "sab", false, false, 117, "Primeiros socorros, tratamento de doenças e venenos."],
  ["diplomacia", "Diplomacia", "car", false, false, 117, "Convencer, negociar e mudar a atitude de outras pessoas."],
  ["enganacao", "Enganação", "car", false, false, 118, "Mentir, disfarçar-se, falsificar e fintar."],
  ["fortitude", "Fortitude", "con", false, false, 119, "Teste de resistência contra venenos, doenças e efeitos que exigem vigor."],
  ["furtividade", "Furtividade", "des", false, true, 119, "Esconder-se e mover-se sem ser notado."],
  ["guerra", "Guerra", "int", true, false, 119, "Estratégia e táticas militares."],
  ["iniciativa", "Iniciativa", "des", false, false, 119, "Agir primeiro em combate."],
  ["intimidacao", "Intimidação", "car", false, false, 119, "Assustar e coagir por meio de ameaças."],
  ["intuicao", "Intuição", "sab", false, false, 119, "Perceber mentiras, intenções e encantamentos."],
  ["investigacao", "Investigação", "int", false, false, 120, "Procurar pistas e obter informações."],
  ["jogatina", "Jogatina", "car", true, false, 120, "Jogos de azar."],
  ["ladinagem", "Ladinagem", "des", true, true, 120, "Abrir fechaduras, desarmar armadilhas e punga."],
  ["luta", "Luta", "for", false, false, 120, "Ataques corpo a corpo."],
  ["misticismo", "Misticismo", "int", true, false, 121, "Conhecimento sobre magia, itens mágicos e criaturas sobrenaturais."],
  ["nobreza", "Nobreza", "int", true, false, 121, "Etiqueta, leis e linhagens nobres."],
  ["oficio", "Ofício", "int", true, false, 121, "Fabricar e consertar itens; escolha uma especialização (alquimia, armeiro, culinária...)."],
  ["percepcao", "Percepção", "sab", false, false, 122, "Notar coisas com os sentidos."],
  ["pilotagem", "Pilotagem", "des", true, false, 122, "Conduzir veículos."],
  ["pontaria", "Pontaria", "des", false, false, 123, "Ataques à distância."],
  ["reflexos", "Reflexos", "des", false, false, 123, "Teste de resistência contra armadilhas, explosões e efeitos de área."],
  ["religiao", "Religião", "sab", true, false, 123, "Conhecimento sobre divindades, rituais e criaturas divinas."],
  ["sobrevivencia", "Sobrevivência", "sab", false, false, 123, "Orientar-se, rastrear e acampar nos ermos."],
  ["vontade", "Vontade", "sab", false, false, 123, "Teste de resistência contra efeitos mentais e de medo."],
];

const S = (id: string) => `skill:${id}`;
const skills: ContentEntry[] = SKILLS.map(([id, name, ability, trainedOnly, armorPenalty, page, summary]) =>
  entry({ id: S(id), kind: "skill", name, summary, source: src(page, "Descrição das Perícias"), data: { ability, trainedOnly, armorPenalty } }),
);

/* ------------------------------------------------------------------ */
/* Raças (p. 18–31)                                                    */
/* ------------------------------------------------------------------ */

type Trait = { name: string; summary: string };
const species = (
  id: string,
  name: string,
  page: number,
  summary: string,
  data: Record<string, unknown> & { traits: Trait[] },
  isRenamed = false,
): ContentEntry =>
  entry({
    id: `species:${id}`,
    kind: "species",
    name,
    summary,
    source: src(page, "Raças"),
    data: { size: "Médio", speed: 9, creatureType: "humanoide", ...data, ...(isRenamed ? renamed(page) : {}) },
  });

const races: ContentEntry[] = [
  species("humano", "Humano", 19, "Versáteis e ambiciosos, podem se destacar em qualquer caminho.", {
    flexibleBonus: { count: 3, amount: 2 },
    traits: [
      { name: "+2 em Três Atributos Diferentes", summary: "Escolha três atributos diferentes para receber +2." },
      { name: "Versátil", summary: "Treinado em duas perícias à escolha (não precisam ser da classe). Pode trocar uma delas por um poder geral." },
    ],
  }),
  species("anao", "Anão", 20, "Resistentes e determinados, mestres da forja e do subterrâneo.", {
    abilityBonuses: { con: 4, sab: 2, des: -2 },
    speed: 6,
    speedIgnoresLoad: true,
    hpBonus: { first: 3, perLevel: 1 },
    traits: [
      { name: "Conhecimento das Rochas", summary: "Visão no escuro e +2 em Percepção e Sobrevivência no subterrâneo." },
      { name: "Devagar e Sempre", summary: "Deslocamento 6m, que não é reduzido por armadura ou excesso de carga." },
      { name: "Duro como Pedra", summary: "+3 PV no 1º nível e +1 PV por nível seguinte." },
      { name: "Tradição Anã", summary: "Machados, martelos, marretas e picaretas são armas simples para você; +2 nos ataques com essas armas." },
    ],
  }),
  species("meia-driade", "Meia-Dríade", 21, "Parte humanas, parte fadas: falam com animais e controlam plantas.", {
    abilityBonuses: { sab: 4, des: 2, int: -2 },
    traits: [
      { name: "Amiga das Plantas", summary: "Pode lançar Controlar Plantas (atributo-chave Sabedoria). Se aprender a magia de novo, o custo diminui em –1 PM." },
      { name: "Armadura de Casca", summary: "Ação de movimento e 1 PM: +2 na Defesa até o fim da cena." },
      { name: "Empatia Selvagem", summary: "Comunica-se com animais e pode usar Adestramento para mudar a atitude deles. Se receber esta habilidade de novo, +2 em Adestramento." },
    ],
  }, true),
  species("elfo", "Elfo", 22, "Belos e longevos, tão hábeis com magia quanto com espadas e arcos.", {
    abilityBonuses: { int: 4, des: 2, con: -2 },
    speed: 12,
    mpPerLevel: 1,
    traits: [
      { name: "Graça Élfica", summary: "Deslocamento 12m." },
      { name: "Herança Feérica", summary: "+1 PM por nível." },
      { name: "Sentidos Élficos", summary: "Visão na penumbra e +2 em Misticismo e Percepção." },
    ],
  }, true),
  species("goblin", "Goblin", 23, "Pequenos, engenhosos e perseverantes.", {
    abilityBonuses: { des: 4, int: 2, car: -2 },
    size: "Pequeno",
    traits: [
      { name: "Engenhoso", summary: "Sem penalidade por não usar kits; com o kit, +2 no teste." },
      { name: "Espelunqueiro", summary: "Visão no escuro e deslocamento de escalada igual ao terrestre." },
      { name: "Peste Esguia", summary: "Tamanho Pequeno, mas deslocamento 9m." },
      { name: "Rato das Ruas", summary: "+2 em Fortitude; a recuperação de PV e PM nunca é inferior ao seu nível." },
    ],
  }),
  species("cria-aberrante", "Cria Aberrante", 24, "Meios-demônios marcados por uma tempestade aberrante; alguns abraçam o mal, outros o combatem.", {
    flexibleBonus: { count: 3, amount: 2, exclude: ["car"] },
    abilityBonuses: { car: -2 },
    creatureType: "monstro",
    traits: [
      { name: "+2 em Três Atributos Diferentes (exceto Carisma), Carisma –2", summary: "Escolha três atributos diferentes, exceto Carisma, para receber +2." },
      { name: "Natureza Aberrante", summary: "Criatura do tipo monstro; +5 em testes de resistência contra efeitos de criaturas e áreas aberrantes (veja a referência)." },
      { name: "Deformidade", summary: "+2 em duas perícias à escolha; cada bônus conta como um poder aberrante. Pode trocar um bônus por um poder aberrante. Não causa perda de Carisma." },
    ],
  }, true),
  species("minotauro", "Minotauro", 25, "Povo guerreiro e orgulhoso, de força impressionante.", {
    abilityBonuses: { for: 4, con: 2, sab: -2 },
    defenseBonus: 1,
    traits: [
      { name: "Chifres", summary: "Arma natural (1d6, x2, perfuração). Ao usar a ação atacar, 1 PM para um ataque extra com os chifres." },
      { name: "Couro Rígido", summary: "+1 na Defesa." },
      { name: "Faro", summary: "Não fica desprevenido e sofre só camuflagem contra inimigos em alcance curto que não possa ver." },
      { name: "Medo de Altura", summary: "Adjacente a uma queda de 3m ou mais, fica abalado." },
    ],
  }),
  species("meio-genio", "Meio-Gênio", 26, "Descendentes de gênios, carismáticos e generosos, que concedem pequenos desejos.", {
    abilityBonuses: { car: 4, int: 2, sab: -2 },
    traits: [
      { name: "Desejos", summary: "Magias pedidas por alguém desde seu último turno custam –1 PM. Fazer um desejo é uma ação livre." },
      { name: "Resistência Elemental", summary: "Resistência 10 a um tipo de dano, conforme a ascendência: frio, eletricidade, fogo, ácido, luz ou trevas." },
      { name: "Tatuagem Mística", summary: "Pode lançar uma magia de 1º círculo à escolha (atributo-chave Carisma). Se aprender a magia de novo, custo –1 PM." },
    ],
  }, true),
  species("golem", "Golem", 27, "Construtos movidos por espíritos elementais.", {
    abilityBonuses: { for: 4, con: 2, car: -2 },
    speed: 6,
    defenseBonus: 2,
    creatureType: "construto",
    noOrigin: true,
    traits: [
      { name: "Canalizar Reparos", summary: "Ação completa: gasta PM para recuperar 5 PV por PM." },
      { name: "Chassi", summary: "+2 na Defesa, penalidade de armadura –2 e deslocamento 6m. Leva um dia para vestir ou remover armadura." },
      { name: "Criatura Artificial", summary: "Construto: visão no escuro; imune a doenças, fadiga, sangramento, sono e venenos. Não recupera PV por descanso nem se beneficia de cura ou itens ingeríveis. Fica inerte 8 horas por dia para recuperar PM." },
      { name: "Espírito Elemental", summary: "Água (frio), ar (eletricidade), fogo (fogo) ou terra (ácido): imune a essa energia; dano mágico dela cura metade do valor." },
      { name: "Sem Origem", summary: "Não escolhe origem nem recebe seus benefícios." },
    ],
  }),
  species("halfling", "Halfling", 27, "Pequeninos simpáticos e furtivos, apreciadores de boa comida.", {
    abilityBonuses: { des: 4, car: 2, for: -2 },
    size: "Pequeno",
    speed: 6,
    traits: [
      { name: "Arremessador", summary: "Ataques à distância com funda ou arma de arremesso causam um passo a mais de dano." },
      { name: "Pequeno e Rechonchudo", summary: "Tamanho Pequeno e deslocamento 6m. +2 em Enganação e usa Destreza em vez de Força para Atletismo." },
      { name: "Sorte Salvadora", summary: "1 PM para rolar novamente um teste de resistência." },
    ],
  }, true),
  species("meio-gnomo", "Meio-Gnomo", 28, "Mistura de humanos e gnomos, de inteligência e engenhosidade extremas.", {
    abilityBonuses: { int: 4, car: 2, for: -2 },
    traits: [
      { name: "Híbrido", summary: "Treinado em uma perícia à escolha (não precisa ser da classe)." },
      { name: "Lógica Gnômica", summary: "2 PM para usar o modificador de Inteligência em um teste de atributo ou perícia." },
      { name: "Ossos Frágeis", summary: "+1 de dano sofrido por dado de dano de impacto." },
      { name: "Vanguardista", summary: "Proficiência em armas de fogo e +2 em um Ofício à escolha." },
    ],
  }, true),
  species("medusa", "Medusa", 28, "Criaturas reclusas de cabelo de serpentes e olhar perigoso.", {
    abilityBonuses: { des: 4, car: 2 },
    creatureType: "monstro",
    traits: [
      { name: "Cria Monstruosa", summary: "Criatura do tipo monstro; visão no escuro." },
      { name: "Natureza Venenosa", summary: "Resistência a veneno 5. Ação de movimento e 1 PM: a arma empunhada causa +1d12 de dano de veneno até acertar um ataque ou até o fim da cena." },
      { name: "Olhar Atordoante", summary: "Ação de movimento e 1 PM: criatura em alcance curto faz Fortitude (CD Car) ou fica atordoada por 1 rodada; se passar, fica imune por um dia." },
    ],
  }, true),
  species("esqueleto-desperto", "Esqueleto Desperto", 29, "Esqueletos com inteligência e consciência, capazes de seguir qualquer profissão.", {
    flexibleBonus: { count: 3, amount: 2, exclude: ["con"] },
    abilityBonuses: { con: -2 },
    creatureType: "morto-vivo",
    traits: [
      { name: "+2 em Três Atributos Diferentes (exceto Constituição), Constituição –2", summary: "Escolha três atributos diferentes, exceto Constituição, para receber +2." },
      { name: "Armadura Óssea", summary: "Resistência a corte, frio e perfuração 5." },
      { name: "Memória Póstuma", summary: "Treinado em uma perícia ou recebe um poder geral. Ou: era de outra raça humanoide (não humana) e ganha uma habilidade dela, e o tamanho dela." },
      { name: "Natureza Esquelética", summary: "Morto-vivo: visão no escuro; imune a doenças, fadiga, sangramento, sono e venenos. Cura mágica causa dano; dano de trevas cura." },
      { name: "Preço da Não Vida", summary: "Precisa passar 8 horas sob as estrelas ou no subterrâneo para recuperar PV e PM; caso contrário, sofre efeitos de fome." },
    ],
  }, true),
  species("sereia", "Sereia/Tritão", 29, "Povo do mar que pode adotar forma bípede em terra.", {
    flexibleBonus: { count: 3, amount: 2 },
    traits: [
      { name: "+2 em Três Atributos Diferentes", summary: "Escolha três atributos diferentes para receber +2." },
      { name: "Canção dos Mares", summary: "Pode lançar duas entre Amedrontar, Comando, Despedaçar, Enfeitiçar, Hipnotismo e Sono (atributo-chave Carisma). Se aprender de novo, custo –1 PM." },
      { name: "Mestre do Tridente", summary: "Tridente é arma simples; +2 no dano com azagaias, lanças e tridentes." },
      { name: "Transformação Anfíbia", summary: "Respira debaixo d'água; natação 12m. Em terra, pernas (9m). Mais de um dia sem água: não recupera PM com descanso." },
    ],
  }),
  species("silfide", "Sílfide", 30, "Fadas esvoaçantes, curiosas e brincalhonas.", {
    abilityBonuses: { car: 4, des: 2, for: -4 },
    size: "Minúsculo",
    creatureType: "espírito",
    traits: [
      { name: "Asas de Borboleta", summary: "Tamanho Minúsculo. Paira a 1,5m do chão (9m), ignora terreno difícil e dano por queda. 1 PM por rodada para voar a 12m." },
      { name: "Espírito da Natureza", summary: "Criatura do tipo espírito; visão na penumbra; fala com animais livremente." },
      { name: "Magia das Fadas", summary: "Pode lançar duas entre Criar Ilusão, Enfeitiçar, Luz (arcana) e Sono (atributo-chave Carisma). Se aprender de novo, custo –1 PM." },
    ],
  }),
  species("descendente-celestial", "Descendente Celestial", 30, "Descendentes de extraplanares divinos, com traços angelicais.", {
    abilityBonuses: { sab: 4, car: 2 },
    creatureType: "espírito",
    traits: [
      { name: "Herança Divina", summary: "Criatura do tipo espírito; visão no escuro." },
      { name: "Luz Sagrada", summary: "+2 em Diplomacia e Intuição. Pode lançar Luz (divina; atributo-chave Carisma). Se aprender de novo, custo –1 PM." },
    ],
  }, true),
  species("descendente-abissal", "Descendente Abissal", 30, "Descendentes de extraplanares, com traços demoníacos.", {
    abilityBonuses: { des: 4, int: 2 },
    creatureType: "espírito",
    traits: [
      { name: "Herança Divina", summary: "Criatura do tipo espírito; visão no escuro." },
      { name: "Sombras Profanas", summary: "+2 em Enganação e Furtividade. Pode lançar Escuridão (divina; atributo-chave Inteligência). Se aprender de novo, custo –1 PM." },
    ],
  }, true),
  species("troglodita", "Troglodita", 31, "Homens-lagarto primitivos e subterrâneos.", {
    abilityBonuses: { con: 4, for: 2, int: -2 },
    defenseBonus: 1,
    creatureType: "monstro",
    traits: [
      { name: "Mau Cheiro", summary: "Ação padrão e 2 PM: criaturas em alcance curto fazem Fortitude contra veneno (CD Con) ou ficam enjoadas por 1d6 rodadas." },
      { name: "Mordida", summary: "Arma natural (1d6, x2, perfuração). Ao usar a ação atacar, 1 PM para um ataque extra com a mordida." },
      { name: "Reptiliano", summary: "Monstro; visão no escuro; +1 na Defesa; +5 em Furtividade sem armadura ou roupas pesadas." },
      { name: "Sangue Frio", summary: "+1 de dano sofrido por dado de dano de frio." },
    ],
  }, true),
];

/* ------------------------------------------------------------------ */
/* Classes (p. 32–84)                                                  */
/* ------------------------------------------------------------------ */

type Feature = { level: number; name: string; summary: string; renamed?: boolean };
const cls = (
  id: string,
  name: string,
  page: number,
  summary: string,
  data: {
    hp: { initial: number; perLevel: number };
    mpPerLevel: number;
    mpKeyAbility?: string;
    mpKeyAbilityOnce?: string;
    skills: { fixed: string[]; oneOf?: string[][]; choose: number; from: string[] };
    proficiencies: string[];
    spellcasting?: { tradition: "arcana" | "divina"; keyAbility: string; circles: Record<number, number> };
    /** Tabela de progressão da classe, do 1º ao 20º nível. */
    progression: string[];
    features: Feature[];
  },
  roles: string[] = [],
): ContentEntry => {
  if (data.progression.length !== 20) throw new Error(`${id}: progressão deve ter 20 níveis`);
  return entry({
    id: `class:${id}`,
    kind: "class",
    name,
    summary,
    roles,
    source: src(page, "Classes"),
    data: {
      ...data,
      skills: { ...data.skills, fixed: data.skills.fixed.map(S), oneOf: data.skills.oneOf?.map((g) => g.map(S)), from: data.skills.from.map(S) },
      features: data.features.map(({ renamed: r, ...f }) => (r ? { ...f, ...renamed(page) } : f)),
    },
  });
};

/** Gera a tabela de progressão a partir de marcos por nível; o poder de classe entra do 2º ao 20º. */
function progression(power: string | null, milestones: Record<number, string>, powerFrom = 2): string[] {
  return Array.from({ length: 20 }, (_, i) => {
    const lvl = i + 1;
    const parts = [milestones[lvl], power && lvl >= powerFrom ? power : undefined].filter(Boolean);
    return parts.join(", ");
  });
}

const circles5 = { 1: 1, 2: 5, 3: 9, 4: 13, 5: 17 };
const circles4 = { 1: 1, 2: 6, 3: 10, 4: 14 };

const classes: ContentEntry[] = [
  cls("arcanista", "Arcanista", 36, "Conjurador de magias arcanas, por estudo, por um foco ou por dom natural.", {
    hp: { initial: 8, perLevel: 2 },
    mpPerLevel: 6,
    mpKeyAbility: "path",
    skills: { fixed: ["misticismo", "vontade"], choose: 1, from: ["conhecimento", "iniciativa", "oficio", "percepcao"] },
    proficiencies: [],
    spellcasting: { tradition: "arcana", keyAbility: "path", circles: circles5 },
    progression: progression("Poder de arcanista", {
      1: "Caminho do arcanista, magias (1º círculo)", 5: "Magias (2º círculo)", 9: "Magias (3º círculo)", 13: "Magias (4º círculo)", 17: "Magias (5º círculo)", 20: "Alta arcana",
    }),
    features: [
      { level: 1, name: "Caminho do Arcanista", summary: "Escolha Bruxo (foco; Inteligência), Feiticeiro (linhagem; Carisma; aprende magias só em níveis ímpares) ou Mago (grimório e memorização; Inteligência; +1 magia inicial e +1 a cada novo círculo). A escolha é permanente." },
      { level: 1, name: "Magias", summary: "Lança magias arcanas; novo círculo a cada quatro níveis (2º no 5º nível...). Começa com três magias de 1º círculo e aprende uma por nível. Soma o bônus do atributo-chave aos PM." },
      { level: 2, name: "Poder de Arcanista", summary: "No 2º nível e em cada nível seguinte, escolha um poder de arcanista." },
      { level: 20, name: "Alta Arcana", summary: "O custo em PM das suas magias arcanas é reduzido à metade (após aprimoramentos e outras reduções)." },
    ],
  }, ["spellcasting", "control"]),
  cls("barbaro", "Bárbaro", 40, "Combatente primitivo que usa fúria e instinto para destruir os inimigos.", {
    hp: { initial: 24, perLevel: 6 },
    mpPerLevel: 3,
    skills: {
      fixed: ["fortitude", "luta"],
      choose: 4,
      from: ["adestramento", "atletismo", "cavalgar", "iniciativa", "intimidacao", "oficio", "percepcao", "pontaria", "sobrevivencia", "vontade"],
    },
    proficiencies: ["armas marciais", "escudos"],
    progression: progression("Poder de bárbaro", {
      1: "Fúria +2", 3: "Instinto selvagem +1", 5: "Resistência a dano 2", 6: "Fúria +3", 8: "Resistência a dano 4", 9: "Instinto selvagem +2",
      11: "Fúria +4, resistência a dano 6", 14: "Resistência a dano 8", 15: "Instinto selvagem +3", 16: "Fúria +5", 17: "Resistência a dano 10", 20: "Fúria titânica",
    }),
    features: [
      { level: 1, name: "Fúria", summary: "2 PM: +2 em ataques e dano corpo a corpo, mas sem ações que exijam calma (Furtividade, magias). A cada cinco níveis, +2 PM para +1 nos bônus. Termina se, no fim da rodada, você não atacou nem foi alvo de efeito hostil." },
      { level: 3, name: "Instinto Selvagem", summary: "+1 em Percepção e Reflexos; +1 a cada seis níveis." },
      { level: 5, name: "Resistência a Dano", summary: "RD 2; aumenta em 2 a cada três níveis, até RD 10 no 17º nível." },
      { level: 20, name: "Fúria Titânica", summary: "Os bônus de ataque e dano da Fúria são dobrados." },
    ],
  }, ["damage", "tank"]),
  cls("bardo", "Bardo", 43, "Artista errante e faz-tudo versátil, com magia e inspiração.", {
    hp: { initial: 12, perLevel: 3 },
    mpPerLevel: 4,
    mpKeyAbility: "car",
    skills: {
      fixed: ["atuacao", "reflexos"],
      choose: 6,
      from: ["acrobacia", "cavalgar", "conhecimento", "diplomacia", "enganacao", "furtividade", "iniciativa", "intuicao", "investigacao", "jogatina", "ladinagem", "luta", "misticismo", "nobreza", "percepcao", "pontaria", "religiao", "vontade"],
    },
    proficiencies: ["armas marciais"],
    spellcasting: { tradition: "arcana", keyAbility: "car", circles: circles4 },
    progression: progression("Poder de bardo", {
      1: "Inspiração +1, magias (1º círculo)", 2: "Eclético", 5: "Inspiração +2", 6: "Magias (2º círculo)", 9: "Inspiração +3", 10: "Magias (3º círculo)",
      13: "Inspiração +4", 14: "Magias (4º círculo)", 17: "Inspiração +5", 20: "Artista completo",
    }),
    features: [
      { level: 1, name: "Inspiração", summary: "Ação padrão e 2 PM: você e aliados em alcance curto ganham +1 em testes de perícia até o fim da cena. A cada quatro níveis, +2 PM para +1 no bônus." },
      { level: 1, name: "Magias", summary: "Escolha três escolas; lança magias arcanas delas (2º círculo no 6º nível, 3º no 10º, 4º no 14º). Começa com duas magias e aprende uma a cada nível par. Pode lançar com armadura leve sem testes. Soma o bônus de Carisma aos PM." },
      { level: 2, name: "Eclético", summary: "1 PM: recebe os benefícios de ser treinado em uma perícia por um teste." },
      { level: 20, name: "Artista Completo", summary: "Inspiração como ação livre; sob seu efeito, habilidades de bardo (incluindo magias) custam metade dos PM." },
    ],
  }, ["support", "spellcasting", "face"]),
  cls("bucaneiro", "Bucaneiro", 46, "Navegador galante e inconsequente, sempre atrás de ouro ou emoção.", {
    hp: { initial: 16, perLevel: 4 },
    mpPerLevel: 3,
    skills: {
      fixed: ["reflexos"],
      oneOf: [["luta", "pontaria"]],
      choose: 4,
      from: ["acrobacia", "atletismo", "atuacao", "enganacao", "fortitude", "furtividade", "iniciativa", "intimidacao", "jogatina", "luta", "oficio", "percepcao", "pilotagem", "pontaria"],
    },
    proficiencies: ["armas marciais"],
    progression: progression("Poder de bucaneiro", {
      1: "Audácia, insolência", 2: "Evasão", 3: "Esquiva sagaz +1", 5: "Panache", 7: "Esquiva sagaz +2", 10: "Evasão aprimorada",
      11: "Esquiva sagaz +3", 15: "Esquiva sagaz +4", 19: "Esquiva sagaz +5", 20: "Sorte do caos",
    }),
    features: [
      { level: 1, name: "Audácia", summary: "2 PM: soma o modificador de Carisma a um teste de perícia (não em ataques)." },
      { level: 1, name: "Insolência", summary: "Soma o bônus de Carisma na Defesa, limitado pelo nível. Não funciona com armadura pesada ou imóvel." },
      { level: 2, name: "Evasão", summary: "Se passar em Reflexos contra efeito que reduz dano à metade, não sofre dano. Exige liberdade de movimentos." },
      { level: 3, name: "Esquiva Sagaz", summary: "+1 na Defesa; +1 a cada quatro níveis. Exige liberdade de movimentos." },
      { level: 5, name: "Panache", summary: "Recupera 1 PM ao fazer um acerto crítico ou reduzir um inimigo a 0 PV." },
      { level: 10, name: "Evasão Aprimorada", summary: "Como Evasão; se falhar, sofre apenas metade do dano." },
      { level: 20, name: "Sorte do Caos", summary: "5 PM: rola novamente um teste recém-realizado; 11 ou mais na segunda rolagem conta como 20 natural.", renamed: true },
    ],
  }, ["damage", "face"]),
  cls("cacador", "Caçador", 49, "Exterminador de monstros e mestre da sobrevivência nos ermos.", {
    hp: { initial: 16, perLevel: 4 },
    mpPerLevel: 4,
    skills: {
      fixed: ["sobrevivencia"],
      oneOf: [["luta", "pontaria"]],
      choose: 6,
      from: ["adestramento", "atletismo", "cavalgar", "cura", "fortitude", "furtividade", "iniciativa", "investigacao", "luta", "oficio", "percepcao", "pontaria", "reflexos"],
    },
    proficiencies: ["armas marciais", "escudos"],
    progression: progression("Poder de caçador", {
      1: "Marca da presa +1d4, rastreador", 3: "Explorador", 5: "Caminho do explorador, marca da presa +1d8", 7: "Explorador", 9: "Marca da presa +1d12",
      11: "Explorador", 13: "Marca da presa +2d8", 15: "Explorador", 17: "Marca da presa +2d10", 19: "Explorador", 20: "Mestre caçador",
    }),
    features: [
      { level: 1, name: "Marca da Presa", summary: "Ação de movimento e 1 PM: +1d4 de dano contra uma criatura em alcance curto até o fim da cena. A cada quatro níveis, +1 PM para aumentar o dado (tabela da classe)." },
      { level: 1, name: "Rastreador", summary: "+2 em Sobrevivência." },
      { level: 3, name: "Explorador", summary: "Escolha um tipo de terreno (a partir do 11º nível, também áreas aberrantes): soma o bônus de Sabedoria (mín. +1) na Defesa e em Acrobacia, Atletismo, Furtividade, Percepção e Sobrevivência nele. A cada quatro níveis, novo terreno ou +2 em um já escolhido." },
      { level: 5, name: "Caminho do Explorador", summary: "Nos terrenos de Explorador, atravessa terreno difícil sem redução de deslocamento e a CD para rastreá-lo aumenta em +10." },
      { level: 20, name: "Mestre Caçador", summary: "Marca da Presa como ação livre; +5 PM para +2 na margem de ameaça contra a presa; recupera 5 PM ao reduzi-la a 0 PV." },
    ],
  }, ["damage", "scout"]),
  cls("cavaleiro", "Cavaleiro", 52, "Combatente honrado, especializado em suportar dano e proteger os outros.", {
    hp: { initial: 20, perLevel: 5 },
    mpPerLevel: 3,
    skills: {
      fixed: ["fortitude", "luta"],
      choose: 2,
      from: ["adestramento", "atletismo", "cavalgar", "diplomacia", "guerra", "iniciativa", "intimidacao", "nobreza", "percepcao", "vontade"],
    },
    proficiencies: ["armas marciais", "armaduras pesadas", "escudos"],
    progression: progression("Poder de cavaleiro", {
      1: "Baluarte +2, código de honra", 2: "Duelo", 5: "Caminho do cavaleiro, baluarte +4", 7: "Baluarte (aliados adjacentes)", 9: "Baluarte +6",
      11: "Resoluto", 13: "Baluarte +8", 15: "Baluarte (aliados em alcance curto)", 17: "Baluarte +10", 20: "Bravura final",
    }),
    features: [
      { level: 1, name: "Baluarte", summary: "1 PM: +2 na Defesa e em testes de resistência até o próximo turno; +1 PM para +2 a cada quatro níveis. No 7º nível, +2 PM estende aos aliados adjacentes; no 15º, +5 PM a aliados em alcance curto." },
      { level: 1, name: "Código de Honra", summary: "Não ataca pelas costas (sem bônus de flanquear), nem oponentes caídos, desprevenidos ou incapazes de lutar. Violar o código: perde todos os PM até o dia seguinte." },
      { level: 2, name: "Duelo", summary: "2 PM: +1 em ataques e dano contra um inimigo em alcance curto até o fim da cena; +1 para cada 2 PM extras. Termina se atacar outro inimigo." },
      { level: 5, name: "Caminho do Cavaleiro", summary: "Bastião (RD 5 com armadura pesada) ou Montaria (cavalo de guerra como aliado, +5 em Adestramento e Cavalgar com ele)." },
      { level: 11, name: "Resoluto", summary: "1 PM: refaz um teste de resistência contra uma condição que o afete, com +5; se passar, cancela o efeito." },
      { level: 20, name: "Bravura Final", summary: "Com 0 PV ou menos, pode continuar agindo gastando 5 PM no início de cada turno." },
    ],
  }, ["tank", "defender"]),
  cls("clerigo", "Clérigo", 56, "Servo de uma divindade, usa poderes divinos para defender seus ideais.", {
    hp: { initial: 16, perLevel: 4 },
    mpPerLevel: 5,
    mpKeyAbility: "sab",
    skills: {
      fixed: ["religiao", "vontade"],
      choose: 2,
      from: ["conhecimento", "cura", "diplomacia", "fortitude", "iniciativa", "intuicao", "luta", "misticismo", "nobreza", "oficio", "percepcao"],
    },
    proficiencies: ["armaduras pesadas", "escudos"],
    spellcasting: { tradition: "divina", keyAbility: "sab", circles: circles5 },
    progression: progression("Poder de clérigo", {
      1: "Devoto, magias (1º círculo)", 5: "Magias (2º círculo)", 9: "Magias (3º círculo)", 13: "Magias (4º círculo)", 17: "Magias (5º círculo)", 20: "Mão da divindade",
    }),
    features: [
      { level: 1, name: "Devoto", summary: "Torna-se devoto de uma divindade maior (lista no livro, p. 96): segue suas Obrigações & Restrições e recebe seus Poderes Concedidos. Ou cultua o panteão como um todo: sem Poderes Concedidos; a única restrição é não usar armas de corte ou perfuração.", renamed: true },
      { level: 1, name: "Magias", summary: "Lança magias divinas; novo círculo a cada quatro níveis. Começa com três magias de 1º círculo e aprende uma por nível. Atributo-chave Sabedoria, somado aos PM." },
      { level: 20, name: "Mão da Divindade", summary: "Ação completa e 15 PM: lança três magias divinas quaisquer como ação livre, sem gastar PM; depois fica atordoado por 1d4 rodadas." },
    ],
  }, ["healing", "support", "spellcasting"]),
  cls("druida", "Druida", 60, "Guardião do mundo natural, devoto das forças selvagens.", {
    hp: { initial: 16, perLevel: 4 },
    mpPerLevel: 4,
    mpKeyAbility: "sab",
    skills: {
      fixed: ["sobrevivencia", "vontade"],
      choose: 4,
      from: ["adestramento", "atletismo", "cavalgar", "conhecimento", "cura", "fortitude", "iniciativa", "intuicao", "luta", "misticismo", "oficio", "percepcao", "religiao"],
    },
    proficiencies: ["escudos"],
    spellcasting: { tradition: "divina", keyAbility: "sab", circles: circles4 },
    progression: progression("Poder de druida", {
      1: "Devoto, empatia selvagem, magias (1º círculo)", 2: "Caminho dos ermos", 6: "Magias (2º círculo)", 10: "Magias (3º círculo)", 14: "Magias (4º círculo)", 20: "Força da natureza",
    }),
    features: [
      { level: 1, name: "Devoto", summary: "Torna-se devoto de uma das divindades da natureza disponíveis para druidas (lista no livro, p. 60 e p. 96), seguindo suas Obrigações & Restrições e recebendo seus Poderes Concedidos.", renamed: true },
      { level: 1, name: "Empatia Selvagem", summary: "Comunica-se com animais e pode usar Adestramento para mudar a atitude deles e pedir favores." },
      { level: 1, name: "Magias", summary: "Escolha três escolas; lança magias divinas delas (2º círculo no 6º nível, 3º no 10º, 4º no 14º). Começa com duas magias e aprende uma a cada nível par. Atributo-chave Sabedoria, somado aos PM." },
      { level: 2, name: "Caminho dos Ermos", summary: "Atravessa terreno difícil natural sem redução de deslocamento e a CD para rastreá-lo aumenta em +10." },
      { level: 20, name: "Força da Natureza", summary: "Magias custam –2 PM e têm CD +2; em terrenos naturais, –4 PM e CD +4." },
    ],
  }, ["spellcasting", "healing", "control"]),
  cls("guerreiro", "Guerreiro", 64, "O especialista supremo em técnicas de combate com armas.", {
    hp: { initial: 20, perLevel: 5 },
    mpPerLevel: 3,
    skills: {
      fixed: ["fortitude"],
      oneOf: [["luta", "pontaria"]],
      choose: 2,
      from: ["adestramento", "atletismo", "cavalgar", "guerra", "iniciativa", "intimidacao", "luta", "oficio", "percepcao", "pontaria", "reflexos"],
    },
    proficiencies: ["armas marciais", "armaduras pesadas", "escudos"],
    progression: progression("Poder de guerreiro", {
      1: "Ataque especial +4", 3: "Durão", 5: "Ataque especial +8", 6: "Ataque extra", 9: "Ataque especial +12", 13: "Ataque especial +16", 17: "Ataque especial +20", 20: "Campeão",
    }),
    features: [
      { level: 1, name: "Ataque Especial", summary: "1 PM: +4 no ataque ou no dano; a cada quatro níveis, +1 PM para +4. Os bônus podem ser divididos igualmente." },
      { level: 3, name: "Durão", summary: "Ao sofrer dano, 2 PM para reduzi-lo à metade." },
      { level: 6, name: "Ataque Extra", summary: "Ao usar a ação atacar, 2 PM para um ataque adicional com a mesma arma." },
      { level: 20, name: "Campeão", summary: "O dano de todos os ataques aumenta um passo; acertar um Ataque Especial ou Golpe Pessoal recupera metade dos PM gastos." },
    ],
  }, ["damage", "tank"]),
  entry({
    id: "class:artifice",
    kind: "class",
    name: "Artífice",
    summary: "Classe do livro especializada em fabricar e usar itens. As regras não estão incluídas: são Identidade do Produto. Use o livro, com aprovação do mestre.",
    source: src(67, "Classes"),
    data: { restricted: true, ...renamed(67) },
  }),
  cls("ladino", "Ladino", 72, "Aventureiro cheio de truques, que confia mais em agilidade e esperteza que em força.", {
    hp: { initial: 12, perLevel: 3 },
    mpPerLevel: 4,
    skills: {
      fixed: ["ladinagem", "reflexos"],
      choose: 8,
      from: ["acrobacia", "atletismo", "atuacao", "cavalgar", "conhecimento", "diplomacia", "enganacao", "furtividade", "iniciativa", "intimidacao", "intuicao", "investigacao", "jogatina", "luta", "oficio", "percepcao", "pilotagem", "pontaria"],
    },
    proficiencies: [],
    progression: progression("Poder de ladino", {
      1: "Ataque furtivo +1d6, especialista", 2: "Evasão", 3: "Ataque furtivo +2d6", 4: "Esquiva sobrenatural", 5: "Ataque furtivo +3d6", 7: "Ataque furtivo +4d6",
      8: "Olhos nas costas", 9: "Ataque furtivo +5d6", 10: "Evasão aprimorada", 11: "Ataque furtivo +6d6", 13: "Ataque furtivo +7d6", 15: "Ataque furtivo +8d6",
      17: "Ataque furtivo +9d6", 19: "Ataque furtivo +10d6", 20: "A pessoa certa para o trabalho",
    }),
    features: [
      { level: 1, name: "Ataque Furtivo", summary: "Uma vez por rodada, +1d6 de dano contra alvo desprevenido (corpo a corpo ou em alcance curto) ou flanqueado; +1d6 a cada dois níveis. Criaturas imunes a críticos são imunes." },
      { level: 1, name: "Especialista", summary: "Escolha perícias treinadas em número igual ao bônus de Inteligência (mín. 1): 1 PM para dobrar o bônus de treinamento em um teste delas (não em ataques)." },
      { level: 2, name: "Evasão", summary: "Se passar em Reflexos contra efeito que reduz dano à metade, não sofre dano. Exige liberdade de movimentos." },
      { level: 4, name: "Esquiva Sobrenatural", summary: "Nunca fica surpreendido." },
      { level: 8, name: "Olhos nas Costas", summary: "Não pode ser flanqueado." },
      { level: 10, name: "Evasão Aprimorada", summary: "Como Evasão; se falhar, sofre apenas metade do dano." },
      { level: 20, name: "A Pessoa Certa para o Trabalho", summary: "Ao fazer um ataque furtivo ou usar uma perícia da lista de ladino, 5 PM para +10 no teste." },
    ],
  }, ["damage", "scout", "skills"]),
  cls("lutador", "Lutador", 75, "Especialista em combate desarmado, rústico e durão.", {
    hp: { initial: 20, perLevel: 5 },
    mpPerLevel: 3,
    skills: {
      fixed: ["fortitude", "luta"],
      choose: 4,
      from: ["acrobacia", "adestramento", "atletismo", "enganacao", "furtividade", "iniciativa", "intimidacao", "oficio", "percepcao", "pontaria", "reflexos"],
    },
    proficiencies: [],
    progression: progression("Poder de lutador", {
      1: "Briga (1d6), golpe relâmpago", 3: "Casca grossa (Con)", 5: "Briga (1d8), golpe cruel", 7: "Casca grossa (Con+1)", 9: "Briga (1d10), golpe violento",
      11: "Casca grossa (Con+2)", 13: "Briga (2d6)", 15: "Casca grossa (Con+3)", 17: "Briga (2d8)", 19: "Casca grossa (Con+4)", 20: "Dono da rua (2d10)",
    }),
    features: [
      { level: 1, name: "Briga", summary: "Ataques desarmados causam 1d6 e podem ser letais ou não letais sem penalidade; o dano aumenta a cada quatro níveis (tabela da classe)." },
      { level: 1, name: "Golpe Relâmpago", summary: "Ao usar a ação atacar com ataque desarmado, 1 PM para um ataque desarmado adicional." },
      { level: 3, name: "Casca Grossa", summary: "Soma o bônus de Constituição na Defesa, limitado pelo nível, sem armadura pesada. A partir do 7º nível e a cada quatro, +1 na Defesa." },
      { level: 5, name: "Golpe Cruel", summary: "+1 na margem de ameaça com ataques desarmados." },
      { level: 9, name: "Golpe Violento", summary: "+1 no multiplicador de crítico com ataques desarmados." },
      { level: 20, name: "Dono da Rua", summary: "Dano desarmado 2d10 (criaturas Médias)." },
    ],
  }, ["damage", "tank"]),
  cls("nobre", "Nobre", 78, "Membro da alta sociedade cujas principais armas são as palavras e o orgulho.", {
    hp: { initial: 16, perLevel: 4 },
    mpPerLevel: 4,
    skills: {
      fixed: ["vontade"],
      oneOf: [["diplomacia", "intimidacao"]],
      choose: 4,
      from: ["adestramento", "atuacao", "cavalgar", "conhecimento", "diplomacia", "enganacao", "fortitude", "guerra", "iniciativa", "intimidacao", "intuicao", "investigacao", "jogatina", "luta", "nobreza", "oficio", "percepcao", "pontaria"],
    },
    proficiencies: ["armas marciais", "armaduras pesadas", "escudos"],
    progression: progression("Poder de nobre", { 1: "Autoconfiança, espólio, orgulho", 2: "Riqueza", 3: "Gritar ordens", 20: "Realeza" }),
    features: [
      { level: 1, name: "Autoconfiança", summary: "Pode somar o bônus de Carisma em vez de Destreza na Defesa (nunca com armadura pesada)." },
      { level: 1, name: "Espólio", summary: "Recebe um item à escolha de preço de até 2.000 moedas." },
      { level: 1, name: "Orgulho", summary: "Em um teste de perícia, gasta PM (até o modificador de Carisma): +2 por PM." },
      { level: 2, name: "Riqueza", summary: "Uma vez por aventura, teste de Carisma + nível de nobre: recebe moedas de ouro iguais ao resultado." },
      { level: 3, name: "Gritar Ordens", summary: "Gasta PM (até o bônus de Carisma): aliados em alcance curto recebem esse valor de bônus em testes de perícia até seu próximo turno." },
      { level: 20, name: "Realeza", summary: "Quem falhar por 10 ou mais contra sua Presença Aristocrática passa a lutar ao seu lado pelo resto da cena." },
    ],
  }, ["face", "support"]),
  cls("paladino", "Paladino", 81, "Campeão do bem e da ordem, o perfeito soldado dos deuses.", {
    hp: { initial: 20, perLevel: 5 },
    mpPerLevel: 3,
    mpKeyAbilityOnce: "car",
    skills: {
      fixed: ["luta", "vontade"],
      choose: 2,
      from: ["adestramento", "atletismo", "cavalgar", "cura", "diplomacia", "fortitude", "guerra", "iniciativa", "intuicao", "nobreza", "percepcao", "religiao"],
    },
    proficiencies: ["armas marciais", "armaduras pesadas", "escudos"],
    progression: progression("Poder de paladino", {
      1: "Abençoado, código do herói, golpe divino (+1d8)", 2: "Cura pelas mãos (1d8+1 PV)", 3: "Aura sagrada", 5: "Bênção da justiça, golpe divino (+2d8)",
      6: "Cura pelas mãos (2d8+2 PV)", 9: "Golpe divino (+3d8)", 10: "Cura pelas mãos (3d8+3 PV)", 13: "Golpe divino (+4d8)", 14: "Cura pelas mãos (4d8+4 PV)",
      17: "Golpe divino (+5d8)", 18: "Cura pelas mãos (5d8+5 PV)", 20: "Vingador sagrado",
    }),
    features: [
      { level: 1, name: "Abençoado", summary: "Soma o bônus de Carisma aos PM (uma vez, no 1º nível). Torna-se devoto de uma divindade disponível para paladinos (lista no livro, p. 81), ou paladino do bem, sem Poderes Concedidos nem Obrigações além do Código do Herói.", renamed: true },
      { level: 1, name: "Código do Herói", summary: "Sempre mantém a palavra, nunca recusa ajuda a um inocente, nunca mente, trapaceia ou rouba. Violar: perde todos os PM até o dia seguinte." },
      { level: 1, name: "Golpe Divino", summary: "Ataque corpo a corpo, 2 PM: soma o bônus de Carisma ao ataque e +1d8 ao dano; a cada quatro níveis, +1 PM para +1d8." },
      { level: 2, name: "Cura pelas Mãos", summary: "Ação de movimento e 1 PM: cura 1d8+1 PV de um alvo adjacente (ou você); a cada quatro níveis, +1 PM para +1d8+1." },
      { level: 3, name: "Aura Sagrada", summary: "1 PM (e 1 PM por turno para manter): aura em alcance curto que ilumina e dá a você e aliados bônus de Carisma nos testes de resistência." },
      { level: 5, name: "Bênção da Justiça", summary: "Escolha permanente: Égide Sagrada (bônus de Carisma na Defesa para você e aliados adjacentes) ou Montaria Sagrada." },
      { level: 20, name: "Vingador Sagrado", summary: "Ação completa e 10 PM: até o fim da cena, voo 18m, RD 20 e soma o Carisma em ataques e dano corpo a corpo." },
    ],
  }, ["tank", "healing", "damage"]),
];

/** Opções do Caminho do Arcanista (p. 37), para definir o atributo-chave. */
const arcanistPaths: ContentEntry[] = [
  ["bruxo", "Caminho do Arcanista: Bruxo", "int", "Lança magias por um foco (varinha, cajado...) segurado em uma mão, ou com teste de Misticismo (CD 20 + custo). Atributo-chave Inteligência."],
  ["feiticeiro", "Caminho do Arcanista: Feiticeiro", "car", "Lança magias por um poder inato do sangue; escolha uma linhagem (p. 39). Aprende uma magia nova só nos níveis ímpares. Atributo-chave Carisma."],
  ["mago", "Caminho do Arcanista: Mago", "int", "Lança magias memorizadas de um grimório (metade das conhecidas por dia). +1 magia inicial e +1 a cada novo círculo. Atributo-chave Inteligência."],
].map(([id, name, key, summary]) =>
  entry({
    id: `feature:arcanista-${id}`,
    kind: "feature",
    name,
    summary,
    source: src(37, "Arcanista"),
    prerequisites: { type: "hasClass", classId: "class:arcanista" },
    data: { arcanistPathKey: key, exclusiveGroup: "arcanista-caminho" },
  }),
);

/* ------------------------------------------------------------------ */
/* Origens (p. 85–95; Tabela 1-18)                                     */
/* ------------------------------------------------------------------ */

type Origin = [id: string, name: string, page: number, skills: string[], powers: string[], unique: { name: string; summary: string }];
const ORIGINS: Origin[] = [
  ["acolito", "Acólito", 85, ["cura", "religiao", "vontade"], ["Medicina", "Vontade de Ferro"], { name: "Membro da Igreja", summary: "Consegue hospedagem e informação em qualquer templo de sua divindade, para você e seus aliados." }],
  ["amigo-dos-animais", "Amigo dos Animais", 85, ["adestramento", "cavalgar"], [], { name: "Amigo Especial", summary: "+5 em Adestramento com animais comuns e um animal de estimação: aliado que dá +2 em uma perícia (exceto Luta ou Pontaria, aprovada pelo mestre) e não conta no limite de aliados." }],
  ["amnesico", "Amnésico", 86, [], [], { name: "Lembranças Graduais", summary: "Recebe uma perícia e um poder escolhidos pelo mestre e este poder: em certos momentos, teste de Sabedoria (CD 10) para reconhecer pessoas, criaturas ou lugares do passado." }],
  ["aristocrata", "Aristocrata", 86, ["diplomacia", "enganacao", "nobreza"], ["Comandar"], { name: "Sangue Azul", summary: "Influência política suficiente para ser tratado com leniência pela guarda, conseguir audiência com o nobre local etc." }],
  ["artesao", "Artesão", 86, ["oficio", "vontade"], ["Sortudo"], { name: "Frutos do Trabalho", summary: "Ao passar em um teste de Ofício para sustento, recebe o dobro do dinheiro." }],
  ["artista", "Artista", 86, ["atuacao", "enganacao"], ["Atraente", "Sortudo", "Torcida"], { name: "Dom Artístico", summary: "Ao passar em um teste de Atuação em uma apresentação, ganha o dobro do dinheiro." }],
  ["assistente-de-laboratorio", "Assistente de Laboratório", 87, ["oficio", "misticismo"], ["Venefício", "um poder aberrante à escolha"], { name: "Esse Cheiro...", summary: "+2 em Fortitude e passa automaticamente em testes de Ofício (alquimia) para identificar itens alquímicos." }],
  ["batedor", "Batedor", 88, ["furtividade", "percepcao", "sobrevivencia"], ["Estilo de Disparo", "Sentidos Aguçados"], { name: "À Prova de Tudo", summary: "Sem penalidade em deslocamento e Sobrevivência por clima ruim e terreno difícil natural." }],
  ["capanga", "Capanga", 88, ["luta", "intimidacao"], ["um poder de combate à escolha"], { name: "Confissão", summary: "Pode usar Intimidação para obter informação sem custo." }],
  ["charlatao", "Charlatão", 88, ["enganacao", "jogatina"], ["Aparência Inofensiva", "Sortudo"], { name: "Alpinista Social", summary: "Pode substituir testes de Diplomacia por testes de Enganação." }],
  ["circense", "Circense", 89, ["acrobacia", "atuacao", "reflexos"], ["Acrobático", "Torcida"], { name: "Truque de Mágica", summary: "Pode lançar Explosão de Chamas, Hipnotismo e Transmutar Objetos, só com o aprimoramento Truque. Não é uma habilidade mágica." }],
  ["criminoso", "Criminoso", 89, ["enganacao", "furtividade", "ladinagem"], ["Venefício"], { name: "Punguista", summary: "Pode fazer testes de Ladinagem para sustento, como a perícia Ofício." }],
  ["curandeiro", "Curandeiro", 89, ["cura", "vontade"], ["Medicina", "Venefício"], { name: "Médico de Campo", summary: "Primeiros socorros em um personagem com 0 PV ou menos também recuperam 1d6 PV." }],
  ["eremita", "Eremita", 89, ["misticismo", "religiao", "sobrevivencia"], ["Lobo Solitário"], { name: "Busca Interior", summary: "Diante de um mistério sem saída, 1 PM para meditar sozinho e receber uma dica do mestre." }],
  ["escravo", "Escravo", 89, ["atletismo", "fortitude", "furtividade"], ["Vitalidade"], { name: "Desejo de Liberdade", summary: "+5 em testes contra efeitos que possam aprisioná-lo, como a manobra agarrar ou a magia Imobilizar." }],
  ["estudioso", "Estudioso", 90, ["conhecimento", "guerra", "misticismo"], ["Aparência Inofensiva"], { name: "Palpite Fundamentado", summary: "2 PM: substitui um teste de perícia baseada em Inteligência ou Sabedoria por um teste de Conhecimento." }],
  ["fazendeiro", "Fazendeiro", 90, ["adestramento", "cavalgar", "oficio", "sobrevivencia"], ["Ginete"], { name: "Água no Feijão", summary: "Gasta só metade da matéria-prima em testes de Ofício (cozinheiro)." }],
  ["forasteiro", "Forasteiro", 90, ["cavalgar", "pilotagem", "sobrevivencia"], ["Lobo Solitário"], { name: "Cultura Exótica", summary: "1 PM: faz um teste de perícia somente treinada mesmo sem ser treinado." }],
  ["gladiador", "Gladiador", 90, ["atuacao", "luta"], ["Atraente", "Torcida", "um poder de combate à escolha"], { name: "Pão e Circo", summary: "Pode causar dano não letal sem a penalidade de –5." }],
  ["guarda", "Guarda", 91, ["investigacao", "luta", "percepcao"], ["Investigador", "um poder de combate à escolha"], { name: "Detetive", summary: "Pode substituir testes de Percepção e Intuição por testes de Investigação." }],
  ["herdeiro", "Herdeiro", 91, ["misticismo", "nobreza", "oficio"], ["Comandar"], { name: "Herança", summary: "Herdou um item de até 1.000 moedas. Escolhido duas vezes: item de até 2.000 moedas." }],
  ["heroi-campones", "Herói Camponês", 91, ["adestramento", "oficio"], ["Sortudo", "Surto Heroico", "Torcida"], { name: "Amigo dos Plebeus", summary: "Hospedagem gratuita para você e aliados em famílias e comunidades plebeias." }],
  ["marujo", "Marujo", 92, ["atletismo", "jogatina", "pilotagem"], ["Acrobático"], { name: "Passagem de Navio", summary: "Transporte marítimo sem custo para você e companheiros, pagando com trabalho (um teste de perícia adequado na viagem)." }],
  ["mateiro", "Mateiro", 92, ["atletismo", "furtividade", "sobrevivencia"], ["Lobo Solitário", "Sentidos Aguçados"], { name: "Vendedor de Carcaças", summary: "Pode fazer testes de Sobrevivência para sustento, como a perícia Ofício." }],
  ["membro-de-guilda", "Membro de Guilda", 92, ["diplomacia", "enganacao", "misticismo", "oficio"], ["Foco em Perícia"], { name: "Rede de Contatos", summary: "Pode usar Diplomacia para obter informação sem custo." }],
  ["mercador", "Mercador", 93, ["diplomacia", "intuicao", "oficio"], ["Proficiência", "Sortudo"], { name: "Negociação", summary: "Vende itens 10% mais caro (não cumulativo com barganha)." }],
  ["minerador", "Minerador", 93, ["atletismo", "fortitude", "oficio"], ["Ataque Poderoso", "Sentidos Aguçados"], { name: "Escavador", summary: "Proficiência em picareta; sem penalidade de deslocamento por terreno difícil em masmorras e subterrâneos." }],
  ["nomade", "Nômade", 93, ["cavalgar", "pilotagem", "sobrevivencia"], ["Lobo Solitário", "Sentidos Aguçados"], { name: "Mochileiro", summary: "Sem penalidade de armadura e sem redução de deslocamento por carga pesada." }],
  ["pivete", "Pivete", 93, ["furtividade", "iniciativa", "ladinagem"], ["Acrobático", "Aparência Inofensiva"], { name: "Quebra-Galho", summary: "Em cidades, compra itens não superiores e não mágicos pela metade do preço; esses itens não podem ser vendidos." }],
  ["refugiado", "Refugiado", 93, ["fortitude", "reflexos", "vontade"], ["Vontade de Ferro"], { name: "Estoico", summary: "Recuperação de PV e PM com descanso sobe uma categoria (ruim vira normal, normal vira confortável...)." }],
  ["seguidor", "Seguidor", 94, ["adestramento", "oficio"], ["Proficiência", "Surto Heroico"], { name: "Antigo Mestre", summary: "Mantém contato com o herói a quem servia; em emergências, a critério do mestre, pode receber ajuda." }],
  ["selvagem", "Selvagem", 94, ["percepcao", "reflexos", "sobrevivencia"], ["Lobo Solitário", "Vitalidade"], { name: "Vida Rústica", summary: "Come qualquer coisa e descansa em qualquer lugar: a recuperação de PV e PM nunca é inferior ao seu nível." }],
  ["soldado", "Soldado", 94, ["fortitude", "guerra", "luta", "pontaria"], ["um poder de combate à escolha"], { name: "Influência Militar", summary: "Hospedagem e informações em acampamentos e bases militares, para você e aliados." }],
  ["taverneiro", "Taverneiro", 94, ["diplomacia", "jogatina", "oficio"], ["Proficiência", "Vitalidade"], { name: "Gororoba", summary: "Prepara comidas uma categoria de tempo mais rápido; com –5 no teste de Ofício, mais uma categoria." }],
  ["trabalhador", "Trabalhador", 95, ["atletismo", "fortitude"], ["Atlético"], { name: "Esforçado", summary: "+2 em todos os testes de perícia estendidos." }],
];

const origins: ContentEntry[] = ORIGINS.map(([id, name, page, sk, powers, unique]) =>
  entry({
    id: `origin:${id}`,
    kind: "origin",
    name,
    summary: id === "amnesico"
      ? "Em vez de escolher dois benefícios, recebe uma perícia e um poder escolhidos pelo mestre e o poder Lembranças Graduais."
      : `Escolha dois benefícios: ${[...sk.map((s) => SKILLS.find((x) => x[0] === s)![1]), ...powers, unique.name].join(", ")}.`,
    source: src(page, "Origens"),
    data: {
      benefitsToChoose: id === "amnesico" ? 0 : 2,
      skillOptions: sk.map(S),
      powerOptions: powers,
      uniquePower: unique,
      itemsInBook: true,
    },
  }),
);

/* ------------------------------------------------------------------ */
/* Poderes, magias, divindades, equipamento e itens mágicos (gerados) */
/* ------------------------------------------------------------------ */

const generated = [deitiesData, powersData, featuresData, spellsData, equipmentData, magicItemsData].flat() as unknown as ContentEntry[];

/* ------------------------------------------------------------------ */

export const tormenta20Pack: ContentPack = {
  format: "rpg-forge.content-pack",
  formatVersion: 1,
  rulesetId: "tormenta20-2020",
  packVersion: "0.3.1",
  sourcebooks: [
    {
      id: BOOK,
      title: "Livro básico (1ª edição, 2020)",
      publisher: "Jambô Editora",
      version: "1ª edição (2020)",
      license: LICENSE,
      attribution:
        "Conteúdo Open Game sob a Open Game License 1.0a. Tormenta20, Copyright 2020, Jambô Editora. Autores Guilherme Dei Svaldi, J.M. Trevisan, Leonel Caldela, Marcelo Cassaro e Rogerio Saladino. Texto completo da licença em content/tormenta20-2020/LICENSE-OGL.txt.",
    },
  ],
  entries: [...skills, ...races, ...classes, ...arcanistPaths, ...origins, ...generated],
};

export default tormenta20Pack;
