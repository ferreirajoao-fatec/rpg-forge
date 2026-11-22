import type { Prerequisite } from "./content";
import type { SourceRef, ValidationIssue } from "./types";

/** Fatos do personagem que os pré-requisitos podem consultar. */
export interface PrerequisiteFacts {
  level: number;
  maxLevel: number;
  classLevels: Record<string, number>;
  speciesId?: string;
  /** Atributos finais (após bônus). */
  abilities: Record<string, number>;
  acquiredContent: Set<string>;
  proficiencies: Set<string>;
  optionalRules: Set<string>;
  /** Permite que o motor ganhe atributos com o tempo (ex.: aumentos por nível). */
  abilitiesCanGrow: boolean;
  /** Multiclasse permitida neste contexto. */
  multiclassAllowed: boolean;
  labels: {
    ability: (key: string) => string;
    content: (id: string) => string;
  };
}

interface EvalResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const pass: EvalResult = { ok: true, issues: [] };

function fail(issue: Omit<ValidationIssue, "severity"> & { severity?: ValidationIssue["severity"] }): EvalResult {
  return { ok: false, issues: [{ severity: "invalid", ...issue }] };
}

/**
 * Avalia um pré-requisito de forma determinística.
 * Mensagens são escritas para iniciantes e indicam se o requisito poderá ser
 * cumprido no futuro (o que separa "Disponível futuramente" de "Indisponível").
 */
export function evaluatePrerequisite(p: Prerequisite, f: PrerequisiteFacts, source?: SourceRef): EvalResult {
  switch (p.type) {
    case "minLevel":
      return f.level >= p.level
        ? pass
        : fail({
            code: "prereq.min_level",
            message: `O requisito mínimo é nível ${p.level}. Seu personagem está no nível ${f.level}. Você poderá selecionar esta opção quando cumprir os requisitos necessários.`,
            satisfiableLater: p.level <= f.maxLevel,
            source,
          });

    case "minClassLevel": {
      const current = f.classLevels[p.classId] ?? 0;
      return current >= p.level
        ? pass
        : fail({
            code: "prereq.min_class_level",
            message: `Requer nível ${p.level} em ${f.labels.content(p.classId)} (atual: ${current}).`,
            satisfiableLater: current > 0 || f.multiclassAllowed,
            source,
          });
    }

    case "minAbility": {
      const value = f.abilities[p.ability] ?? 0;
      return value >= p.value
        ? pass
        : fail({
            code: "prereq.min_ability",
            message: `Requer ${f.labels.ability(p.ability)} ${p.value} ou maior (atual: ${value}).`,
            path: `abilities.${p.ability}`,
            satisfiableLater: f.abilitiesCanGrow,
            source,
          });
    }

    case "hasClass":
      return (f.classLevels[p.classId] ?? 0) > 0
        ? pass
        : fail({
            code: "prereq.class",
            message: `Exclusivo para ${f.labels.content(p.classId)}.`,
            satisfiableLater: f.multiclassAllowed,
            source,
          });

    case "hasSpecies":
      return f.speciesId === p.speciesId
        ? pass
        : fail({
            code: "prereq.species",
            message: `Exclusivo para ${f.labels.content(p.speciesId)}.`,
            satisfiableLater: false,
            source,
          });

    case "hasContent":
      return f.acquiredContent.has(p.contentId)
        ? pass
        : fail({
            code: "prereq.content",
            message: `Requer ${f.labels.content(p.contentId)}.`,
            satisfiableLater: true,
            source,
          });

    case "hasProficiency":
      return f.proficiencies.has(p.proficiency)
        ? pass
        : fail({
            code: "prereq.proficiency",
            message: `Requer proficiência/treinamento em ${f.labels.content(p.proficiency)}.`,
            satisfiableLater: true,
            source,
          });

    case "optionalRule":
      return f.optionalRules.has(p.ruleId)
        ? pass
        : fail({
            code: "prereq.optional_rule",
            message: `Depende da regra opcional "${p.ruleId}", que não está habilitada nesta mesa.`,
            severity: "gm_approval",
            satisfiableLater: false,
            source,
          });

    case "gmJudgement":
      return {
        ok: true,
        issues: [
          {
            code: "prereq.gm_judgement",
            severity: "gm_approval",
            message: `Requer avaliação do mestre: ${p.description}`,
            source,
          },
        ],
      };

    case "allOf": {
      const results = p.of.map((x) => evaluatePrerequisite(x, f, source));
      return { ok: results.every((r) => r.ok), issues: results.flatMap((r) => r.issues) };
    }

    case "anyOf": {
      const results = p.of.map((x) => evaluatePrerequisite(x, f, source));
      if (results.some((r) => r.ok)) {
        // Mantém apenas avisos de mestre dos ramos satisfeitos.
        return { ok: true, issues: results.filter((r) => r.ok).flatMap((r) => r.issues) };
      }
      const later = results.some((r) => r.issues.every((i) => i.satisfiableLater));
      return fail({
        code: "prereq.any_of",
        message: `Requer pelo menos um dos seguintes: ${results
          .flatMap((r) => r.issues.map((i) => i.message))
          .join(" / ")}`,
        satisfiableLater: later,
        source,
      });
    }

    case "not": {
      const inner = evaluatePrerequisite(p.of, f, source);
      return inner.ok
        ? fail({
            code: "prereq.not",
            message: "Incompatível com uma escolha já feita pelo personagem.",
            satisfiableLater: false,
            source,
          })
        : pass;
    }
  }
}
