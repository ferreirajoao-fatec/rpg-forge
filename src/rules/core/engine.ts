import type { CharacterData } from "./character";
import { totalLevel } from "./character";
import type { ContentEntry, ContentKind, ContentPack } from "./content";
import type { Rng } from "./dice";
import { evaluatePrerequisite, type PrerequisiteFacts } from "./prerequisites";
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

/** Linha do inventário com dados resolvidos pelo motor. */
export interface InventoryRow {
  entryId: string;
  name: string;
  quantity: number;
  equipped: boolean;
  /** Peso total da linha (quantidade × peso unitário), quando conhecido. */
  weight?: number;
  /** Valor unitário estimado, já com melhorias, na moeda padrão. */
  value?: number;
  /** Onde o item é equipado (ex.: "armadura", "escudo", "arma", "acessorio"). */
  slot?: string;
  magic: boolean;
  /** Falso quando o item está equipado mas não tem efeito (ex.: limite de itens mágicos). */
  effective: boolean;
  detail?: string;
}

export interface InventorySummary {
  rows: InventoryRow[];
  totalWeight: number;
  totalValue: number;
  /** Dinheiro total na moeda padrão. */
  money: number;
  /** Limites de carga, quando o sistema os usa. */
  load?: { light: number; max: number; state: "normal" | "encumbered" | "overloaded" };
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
  skills?: { id: string; name: string; trained: boolean; value: number }[];
  /** Inventário resolvido, quando o sistema o calcula. */
  inventory?: InventorySummary;
}

export interface RulesEngine {
  readonly meta: RulesetMeta;
  readonly abilities: AbilityDef[];
  readonly abilityMethods: AbilityMethod[];
  creationSteps(catalog: Catalog): CreationStep[];
  abilityModifier(score: number): number;
  /** Nível correspondente a uma quantidade de XP, se o sistema usar XP. */
  levelForXp?(xp: number): number;
  derive(c: CharacterData, catalog: Catalog): DerivedStats;
  validate(c: CharacterData, catalog: Catalog): ValidationReport;
  /** Moedas do sistema, da menor para a maior. A primeira com value 1 é a padrão. */
  readonly currencies?: CurrencyDef[];
  /** Dinheiro inicial para um nível: quantia fixa ou fórmula de dados (na moeda padrão). */
  startingWealth?(level: number): { amount?: number; formula?: string };
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

