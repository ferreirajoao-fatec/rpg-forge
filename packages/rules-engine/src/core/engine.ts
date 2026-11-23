import type { CharacterData } from "./character";
import { totalLevel } from "./character";
import type { ContentEntry, ContentKind, ContentPack } from "./content";
import type { Rng } from "./dice";
import { evaluatePrerequisite, type PrerequisiteFacts } from "./prerequisites";
import { applyLevelUp, type LevelUpGain, type LevelUpPlan } from "./progression";
import type {
  DataAvailability,
  OptionEvaluation,
  RulesetId,
  SourceRef,
  ValidationIssue,
  ValidationReport,
} from "./types";
import { makeReport } from "./types";

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

/** Catálogo imutável de conteúdo de UM conjunto de regras. */
export class Catalog {
  private readonly byId = new Map<string, ContentEntry>();

  constructor(
    readonly rulesetId: RulesetId,
    entries: ContentEntry[] = [],
  ) {
    for (const e of entries) this.byId.set(e.id, e);
  }

  static fromPacks(rulesetId: RulesetId, packs: ContentPack[]): Catalog {
    const foreign = packs.find((p) => p.rulesetId !== rulesetId);
    if (foreign) {
      // Isolamento entre sistemas: nunca misturar conteúdos de regras diferentes.
      throw new Error(`Pacote de "${foreign.rulesetId}" não pode ser carregado em "${rulesetId}".`);
    }
    return new Catalog(
      rulesetId,
      packs.flatMap((p) => p.entries),
    );
  }

  get size(): number {
    return this.byId.size;
  }
  get(id: string): ContentEntry | undefined {
    return this.byId.get(id);
  }
  ofKind(kind: ContentKind): ContentEntry[] {
    return [...this.byId.values()].filter((e) => e.kind === kind);
  }
  all(): ContentEntry[] {
    return [...this.byId.values()];
  }
}

/* ------------------------------------------------------------------ */
/* Contrato do motor                                                   */
/* ------------------------------------------------------------------ */

export interface AbilityDef {
  key: string;
  label: string;
  abbr: string;
  description: string;
}

export interface AbilityMethod {
  id: string;
  label: string;
  description: string;
  source?: SourceRef;
  /** Valida os atributos BASE para este método. */
  validate(scores: Record<string, number>): ValidationIssue[];
  /** Gera atributos válidos aleatoriamente (modo aleatório). */
  generate?(rng: Rng): Record<string, number>;
}

export interface CreationStep {
  id: string;
  title: string;
  /** Explicação para iniciantes, sem pressupor conhecimento das regras. */
  help: string;
  /** Tipo de conteúdo selecionado nesta etapa, se houver. */
  contentKind?: ContentKind;
  /** Etapa só existe se o catálogo tiver conteúdo para ela. */
  requiresContent: boolean;
  /** Interface especial da etapa ("inventory" = inventário com moedas). Padrão: lista do catálogo. */
  ui?: "inventory";
}

/** Moeda do sistema; `value` é o valor em unidades da moeda padrão (a dos preços do catálogo). */
export interface CurrencyDef {
  key: string;
  label: string;
  abbr: string;
  value: number;
}

/** Pacote de equipamento inicial (de uma classe ou antecedente), com alternativas. */
export interface StartingPackage {
  /** De onde vem (ex.: "Guerreiro", "Acólito"). */
  source: string;
  /** Itens que vêm sempre. */
  fixed: { id: string; quantity: number }[];
  /** Grupos de alternativas: escolha `choose` opção(ões) de cada grupo. */
  groups: {
    choose: number;
    options: { label: string; items: { id: string; quantity: number }[]; gold: number; open: { category: string; count: number; label: string }[] }[];
  }[];
}

/** Linha do inventário com dados resolvidos pelo motor. */
export interface InventoryRow {
  entryId: string;
  name: string;
  quantity: number;
  equipped: boolean;
  /** Peso total da linha (quantidade × peso unitário), ou espaços ocupados quando o sistema usa espaços. */
  weight?: number;
  /** Valor unitário estimado, já com melhorias, na moeda padrão. */
  value?: number;
  /** Categoria efetiva do item (0–IV), para sistemas baseados em Patente/Categoria (ex.: Ordem Paranormal). */
  itemCategory?: number;
  /** Onde o item é equipado (ex.: "armadura", "escudo", "arma", "acessorio"). */
  slot?: string;
  magic: boolean;
  /** Falso quando o item está equipado mas não tem efeito (ex.: limite de itens mágicos). */
  effective: boolean;
  detail?: string;
}

/** Orçamento de itens por categoria e patente (Ordem Paranormal). */
export interface CategoryBudget {
  rank: string;
  credit: string;
  prestige: number;
  nextPrestige?: number;
  /** Quantidade de itens levados por categoria (chaves 1, 2, 3, 4). */
  counts: Record<number, number>;
  /** Limite permitido pela patente por categoria (chaves 1, 2, 3, 4). */
  limits: Record<number, number>;
  /** Se a patente permite requisitar itens amaldiçoados. */
  cursedAllowed: boolean;
  /** Se o personagem é Sobrevivente (usa limite especial em vez de patente). */
  isSurvivor?: boolean;
}

export interface InventorySummary {
  rows: InventoryRow[];
  totalWeight: number;
  totalValue: number;
  /** Dinheiro total na moeda padrão. */
  money: number;
  /** Unidade de carga ("kg" padrão, ou "espaços"). */
  loadUnit?: "kg" | "espaços";
  /** Limites de carga, quando o sistema os usa. */
  load?: { light: number; max: number; state: "normal" | "encumbered" | "overloaded" };
  /** Controle de patente e limite de itens por categoria (Ordem Paranormal). */
  categoryBudget?: CategoryBudget;
}

export interface RulesetMeta {
  id: RulesetId;
  name: string;
  system: string;
  edition: string;
  publisher: string;
  dataAvailability: DataAvailability;
  /** Limitações conhecidas, exibidas ao usuário de forma explícita. */
  limitations: string[];
  /** Fontes em que as fórmulas do motor se baseiam. */
  sources: { id: string; title: string; license: string; url?: string }[];
  levelRange: { min: number; max: number };
}

export interface DerivedStats {
  level: number;
  abilities: Record<string, { score: number; modifier: number }>;
  proficiencyBonus?: number;
  /** Valores que dependem de conteúdo ainda não importado. */
  pending: string[];
  /** Estatísticas derivadas específicas do sistema (PV, PM, Defesa...). */
  stats?: { key: string; label: string; value: number | string; detail?: string; source?: SourceRef }[];
  /** Modificadores de perícia, quando o sistema os calcula. */
  skills?: { id: string; name: string; trained: boolean; value: number; rank?: "destreinado" | "treinado" | "veterano" | "expert"; dice?: string }[];
  /** Inventário resolvido, quando o sistema o calcula. */
  inventory?: InventorySummary;
}

/** Limite de escolhas de um tipo (perícias, poderes) para o nível atual. */
export interface ChoiceLimit {
  kind: "skill" | "power" | "spell";
  used: number;
  max: number;
  /** De onde vem o limite, para mostrar ao jogador ("classe 2 + Inteligência 1 + raça 2"). */
  detail: string;
}

/** Limite de aprimoramentos de grau de treinamento de perícias (Ordem Paranormal: Veterano/Expert). */
export interface SkillUpgradeBudget {
  used: number;
  max: number;
  /** Grau máximo liberado no nível/NEX atual. */
  maxRank: "treinado" | "veterano" | "expert";
  detail: string;
}

export interface RulesEngine {
  readonly meta: RulesetMeta;
  readonly abilities: AbilityDef[];
  readonly abilityMethods: AbilityMethod[];
  creationSteps(catalog: Catalog): CreationStep[];
  abilityModifier(score: number): number;
  /** Rótulo do nível na interface (ex.: "Nível 3", "NEX 15%", "Estágio 2 (NEX 0%)"). */
  formatLevel?(level: number, c?: CharacterData): string;
  /** Rótulo secundário do atributo (ex.: "3d20" ou "2d20↓" em sistemas de pool de dados). */
  abilityRollLabel?(score: number): string;
  /** Modo de inventário ("currency" padrão ou "op-patente"). */
  readonly inventoryMode?: "currency" | "op-patente";
  /** Gênero/ambientação para o prompt de retrato com IA (padrão: fantasia medieval). */
  readonly portraitGenre?: string;
  /** Nível correspondente a uma quantidade de XP, se o sistema usar XP. */
  levelForXp?(xp: number): number;
  /** XP mínimo de cada nível (índice 0 = 1º nível), se o sistema usar XP. */
  readonly xpThresholds?: number[];
  /** O que o personagem ganha ao subir para o próximo nível ("Meu próximo nível"). */
  levelUpPlan(c: CharacterData, catalog: Catalog): LevelUpPlan;
  derive(c: CharacterData, catalog: Catalog): DerivedStats;
  validate(c: CharacterData, catalog: Catalog): ValidationReport;
  /** Moedas do sistema, da menor para a maior. A primeira com value 1 é a padrão. */
  readonly currencies?: CurrencyDef[];
  /** Dinheiro inicial para um nível: quantia fixa ou fórmula de dados (na moeda padrão). */
  startingWealth?(level: number): { amount?: number; formula?: string };
  /** Pacotes de equipamento inicial da classe e do antecedente escolhidos, quando o sistema os tiver. */
  startingPackages?(c: CharacterData, catalog: Catalog): StartingPackage[];
  /**
   * Aumentos de atributo por nível (CharacterData.levelBonuses): quantos pontos o personagem
   * pode distribuir agora e o teto de cada atributo. Ausente = o sistema não usa.
   */
  levelBonusBudget?(c: CharacterData, catalog: Catalog): { points: number; max: number; detail: string };
  /**
   * Quantas escolhas livres de perícia, poder ou ritual a ficha tem no nível atual e quantas já usou.
   * Ausente = o sistema não limita (ou limita de outro jeito, na validação).
   */
  choiceLimits?(c: CharacterData, catalog: Catalog): ChoiceLimit[];
  /** Orçamento de aumentos de grau de treinamento (Veterano/Expert), quando o sistema usa. */
  skillUpgradeBudget?(c: CharacterData, catalog: Catalog): SkillUpgradeBudget;
  evaluateOption(c: CharacterData, entry: ContentEntry, catalog: Catalog): OptionEvaluation;
}

/* ------------------------------------------------------------------ */
/* Implementação base compartilhada                                    */
/* ------------------------------------------------------------------ */

/**
 * Comportamento comum a todos os motores. Cada sistema estende esta classe e
 * sobrescreve somente o que muda — nada de condicionais por sistema na UI.
 */
export abstract class BaseEngine implements RulesEngine {
  abstract readonly meta: RulesetMeta;
  abstract readonly abilities: AbilityDef[];
  abstract readonly abilityMethods: AbilityMethod[];
  abstract creationSteps(catalog: Catalog): CreationStep[];
  abstract abilityModifier(score: number): number;

  protected abilitiesCanGrow = true;
  protected multiclassAllowed(c: CharacterData): boolean {
    return c.optionalRules.includes("multiclass");
  }

  /** Bônus aplicados aos atributos base (espécie, origem...). Padrão: nenhum. */
  protected abilityBonuses(_c: CharacterData, _catalog: Catalog): Record<string, number> {
    return {};
  }

  protected proficiencyBonus(_level: number): number | undefined {
    return undefined;
  }

  finalAbilities(c: CharacterData, catalog: Catalog): Record<string, number> {
    const bonus = this.abilityBonuses(c, catalog);
    return Object.fromEntries(
      this.abilities.map((a) => [a.key, (c.baseAbilities[a.key] ?? 0) + (bonus[a.key] ?? 0)]),
    );
  }

  derive(c: CharacterData, catalog: Catalog): DerivedStats {
    const level = totalLevel(c);
    const finals = this.finalAbilities(c, catalog);
    const pending: string[] = [];
    if (catalog.ofKind("class").length === 0) {
      pending.push("Pontos de vida, defesa e proficiências dependem do catálogo de classes, que ainda não foi importado.");
    }
    return {
      level,
      abilities: Object.fromEntries(
        Object.entries(finals).map(([k, score]) => [k, { score, modifier: this.abilityModifier(score) }]),
      ),
      proficiencyBonus: this.proficiencyBonus(level),
      pending,
    };
  }

  protected facts(c: CharacterData, catalog: Catalog): PrerequisiteFacts {
    const abilityLabel = new Map(this.abilities.map((a) => [a.key, a.label]));
    return {
      level: totalLevel(c),
      maxLevel: this.meta.levelRange.max,
      classLevels: Object.fromEntries(c.classes.map((cl) => [cl.classId, cl.levels])),
      speciesId: c.speciesId,
      abilities: this.finalAbilities(c, catalog),
      acquiredContent: new Set(c.choices.map((ch) => ch.contentId)),
      proficiencies: new Set(),
      optionalRules: new Set(c.optionalRules),
      abilitiesCanGrow: this.abilitiesCanGrow,
      multiclassAllowed: this.multiclassAllowed(c),
      labels: {
        ability: (k) => abilityLabel.get(k) ?? k,
        content: (id) => catalog.get(id)?.name ?? id,
      },
    };
  }

  readonly xpThresholds?: number[];

  levelUpPlan(c: CharacterData, catalog: Catalog): LevelUpPlan {
    const from = totalLevel(c);
    const to = from + 1;
    const plan: LevelUpPlan = { from, to, canLevelUp: true, gains: [] };
    if (to > this.meta.levelRange.max) {
      return { ...plan, canLevelUp: false, blockedReason: `O nível máximo deste sistema é ${this.meta.levelRange.max}.` };
    }
    const needed = c.progressionMode === "xp" ? this.xpThresholds?.[to - 1] : undefined;
    if (needed !== undefined) {
      plan.xp = { current: c.experience, needed };
      if (c.experience < needed) {
        plan.canLevelUp = false;
        plan.blockedReason = `Faltam ${(needed - c.experience).toLocaleString("pt-BR")} XP para o ${to}º nível.`;
      }
    }
    const next = applyLevelUp(c);
    plan.gains = [...this.statGains(this.derive(c, catalog), this.derive(next, catalog)), ...this.levelGains(c, next, catalog)];
    return plan;
  }

  /** Diferenças entre a ficha derivada antes e depois de subir de nível. */
  protected statGains(before: DerivedStats, after: DerivedStats): LevelUpGain[] {
    const gains: LevelUpGain[] = [];
    if (before.proficiencyBonus !== undefined && after.proficiencyBonus !== before.proficiencyBonus) {
      // Também aparece nas estatísticas de alguns sistemas; o filtro abaixo evita repetir.
      if (!after.stats?.some((s) => s.key === "proficiency")) {
        gains.push({ kind: "stat", label: "Bônus de proficiência", detail: `+${before.proficiencyBonus} → +${after.proficiencyBonus}` });
      }
    }
    const old = new Map((before.stats ?? []).map((s) => [s.key, s]));
    for (const s of after.stats ?? []) {
      const prev = old.get(s.key);
      if (prev && String(prev.value) !== String(s.value)) {
        gains.push({ kind: "stat", label: s.label, detail: `${prev.value} → ${s.value}`, source: s.source });
      } else if (!prev) {
        gains.push({ kind: "stat", label: s.label, detail: `novo: ${s.value}`, source: s.source });
      }
    }
    const skillsBefore = new Map((before.skills ?? []).map((s) => [s.id, s.value]));
    const deltas = (after.skills ?? []).map((s) => s.value - (skillsBefore.get(s.id) ?? s.value)).filter((d) => d !== 0);
    if (deltas.length) {
      const same = deltas.every((d) => d === deltas[0]);
      gains.push({
        kind: "stat",
        label: "Perícias",
        detail: same ? `${deltas[0] > 0 ? "+" : ""}${deltas[0]} em ${deltas.length} perícia(s)` : `${deltas.length} perícia(s) mudam de valor`,
      });
    }
    return gains;
  }

  /** Ganhos específicos do sistema para o novo nível. Padrão: nenhum. */
  protected levelGains(_before: CharacterData, _after: CharacterData, _catalog: Catalog): LevelUpGain[] {
    return [];
  }

  evaluateOption(c: CharacterData, entry: ContentEntry, catalog: Catalog): OptionEvaluation {
    if (c.choices.some((ch) => ch.contentId === entry.id)) {
      return { availability: "acquired", issues: [] };
    }
    if (!catalog.get(entry.id)) {
      return {
        availability: "unavailable",
        issues: [
          {
            code: "option.foreign_ruleset",
            severity: "invalid",
            message: "Esta opção não pertence ao conjunto de regras do personagem.",
          },
        ],
      };
    }
    const issues: ValidationIssue[] = [];
    if (entry.origin === "homebrew") {
      issues.push({
        code: "option.homebrew",
        severity: "gm_approval",
        message: "Conteúdo personalizado (homebrew): depende de autorização do mestre.",
        source: entry.source,
      });
    }
    if (!entry.prerequisites) return { availability: "available_now", issues };

    const r = evaluatePrerequisite(entry.prerequisites, this.facts(c, catalog), entry.source);
    issues.push(...r.issues);
    if (r.ok) return { availability: "available_now", issues };
    const blocking = r.issues.filter((i) => i.severity === "invalid");
    const later = blocking.length > 0 && blocking.every((i) => i.satisfiableLater);
    return { availability: later ? "available_later" : "unavailable", issues };
  }

  validate(c: CharacterData, catalog: Catalog): ValidationReport {
    const issues: ValidationIssue[] = [];
    const { min, max } = this.meta.levelRange;
    const level = totalLevel(c);

    if (!c.name.trim()) {
      issues.push({ code: "character.name_missing", severity: "warning", message: "Dê um nome ao seu personagem.", path: "name" });
    }
    if (level < min || level > max) {
      issues.push({
        code: "character.level_range",
        severity: "invalid",
        message: `O nível deve estar entre ${min} e ${max}.`,
        path: "level",
      });
    }

    // Método de geração de atributos.
    const method = this.abilityMethods.find((m) => m.id === c.abilityMethod);
    const hasScores = this.abilities.some((a) => c.baseAbilities[a.key] !== undefined);
    if (hasScores && !method) {
      issues.push({
        code: "abilities.method_missing",
        severity: "warning",
        message: "Escolha um método de geração de atributos para que os valores possam ser verificados.",
        path: "abilityMethod",
      });
    }
    if (method) issues.push(...method.validate(c.baseAbilities));

    // Cada escolha precisa existir no catálogo e cumprir pré-requisitos.
    for (const ch of c.choices) {
      const entry = catalog.get(ch.contentId);
      if (!entry) {
        issues.push({
          code: "choice.unknown_content",
          severity: "invalid",
          message: `A escolha "${ch.contentId}" não existe no catálogo deste sistema.`,
          path: `choices.${ch.slot}`,
        });
        continue;
      }
      if (entry.prerequisites) {
        const r = evaluatePrerequisite(entry.prerequisites, this.facts(c, catalog), entry.source);
        if (!r.ok || r.issues.length) {
          for (const i of r.issues) {
            // Aprovação concedida pelo mestre resolve pendências de autorização.
            if (i.severity === "gm_approval" && ch.gmApprovalId) continue;
            issues.push({ ...i, path: `choices.${ch.slot}`, message: `${entry.name}: ${i.message}` });
          }
        }
      }
      if (entry.origin === "homebrew" && !ch.gmApprovalId) {
        issues.push({
          code: "choice.homebrew_unapproved",
          severity: "gm_approval",
          message: `${entry.name} é conteúdo personalizado e aguarda aprovação do mestre.`,
          path: `choices.${ch.slot}`,
        });
      }
    }

    issues.push(...this.validateSystem(c, catalog));
    return makeReport(issues);
  }

  /** Validações específicas do sistema. */
  protected validateSystem(_c: CharacterData, _catalog: Catalog): ValidationIssue[] {
    return [];
  }
}

