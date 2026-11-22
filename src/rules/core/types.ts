/**
 * Tipos centrais do motor de regras.
 *
 * Este módulo NÃO pode importar nada de React, Next.js, Prisma ou de IA.
 * Tudo aqui é determinístico e testável isoladamente.
 */

/** Identificador estável de um conjunto de regras (sistema + edição). */
export type RulesetId = "dnd5e-2014" | "dnd5e-2024" | "tormenta20-2020" | (string & {});

/** Origem/licença de um conteúdo. */
export type ContentOrigin = "official" | "authorized" | "homebrew";

/** Situação de disponibilidade de dados para um conjunto de regras. */
export type DataAvailability =
  /** Dados importados de fonte com licença de redistribuição. */
  | "licensed"
  /** Apenas a estrutura existe; o conteúdo depende de importação autorizada. */
  | "import-required";

/** Referência obrigatória de fonte para toda regra ou conteúdo. */
export interface SourceRef {
  /** Identificador do livro/documento (ex.: "srd-5.1"). */
  sourcebookId: string;
  /** Edição do sistema (ex.: "2014", "2024", "2020"). */
  edition: string;
  /** Versão do documento (ex.: "5.1", "5.2.1"). */
  version: string;
  /** Seção/capítulo, quando conhecido. */
  section?: string;
  /** Página, somente quando confirmada na fonte. Nunca estimar. */
  page?: number;
}

export type AbilityKey = string;

/** Gravidade de um resultado de validação (seção 4 da especificação). */
export type ValidationSeverity = "valid" | "warning" | "invalid" | "gm_approval";

export interface ValidationIssue {
  /** Código estável, útil para testes e i18n. */
  code: string;
  severity: Exclude<ValidationSeverity, "valid">;
  /** Mensagem amigável ao iniciante, em português. */
  message: string;
  /** Caminho do campo afetado na ficha (ex.: "abilities.str"). */
  path?: string;
  /** Regra que originou o problema. */
  source?: SourceRef;
  /** Indica se o requisito poderá ser cumprido no futuro (ex.: nível). */
  satisfiableLater?: boolean;
}

export interface ValidationReport {
  /** Pior gravidade encontrada. */
  status: ValidationSeverity;
  issues: ValidationIssue[];
}

/** Classificação de uma opção do catálogo para um personagem (seção 9). */
export type OptionAvailability = "available_now" | "available_later" | "unavailable" | "acquired";

export interface OptionEvaluation {
  availability: OptionAvailability;
  issues: ValidationIssue[];
}

/** Ordem de gravidade, da menos grave para a mais grave. */
const SEVERITY_ORDER: Record<ValidationSeverity, number> = {
  valid: 0,
  warning: 1,
  gm_approval: 2,
  invalid: 3,
};

export function worstSeverity(issues: Pick<ValidationIssue, "severity">[]): ValidationSeverity {
  return issues.reduce<ValidationSeverity>(
    (worst, i) => (SEVERITY_ORDER[i.severity] > SEVERITY_ORDER[worst] ? i.severity : worst),
    "valid",
  );
}

export function makeReport(issues: ValidationIssue[]): ValidationReport {
  return { status: worstSeverity(issues), issues };
}
