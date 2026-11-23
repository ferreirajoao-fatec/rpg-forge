import { z } from "zod";

/**
 * Formato de pacote de conteúdo importável e versionado.
 *
 * Todo conteúdo (classes, espécies, magias, itens...) entra no sistema por
 * meio de um ContentPack validado. Nenhum conteúdo de regras é escrito
 * diretamente no código da interface.
 */

export const SourceRefSchema = z.object({
  sourcebookId: z.string().min(1),
  edition: z.string().min(1),
  version: z.string().min(1),
  section: z.string().optional(),
  page: z.number().int().positive().optional(),
});

/** DSL de pré-requisitos (recursiva). */
export type Prerequisite =
  | { type: "minLevel"; level: number }
  | { type: "minClassLevel"; classId: string; level: number }
  | { type: "minAbility"; ability: string; value: number }
  | { type: "hasClass"; classId: string }
  | { type: "hasSpecies"; speciesId: string }
  | { type: "hasContent"; contentId: string }
  | { type: "hasProficiency"; proficiency: string }
  | { type: "optionalRule"; ruleId: string }
  | { type: "allOf"; of: Prerequisite[] }
  | { type: "anyOf"; of: Prerequisite[] }
  | { type: "not"; of: Prerequisite }
  /** Requisito que só o mestre pode julgar (ex.: "ter uma divindade"). */
  | { type: "gmJudgement"; description: string };

export const PrerequisiteSchema: z.ZodType<Prerequisite> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("minLevel"), level: z.number().int().min(1) }),
    z.object({ type: z.literal("minClassLevel"), classId: z.string(), level: z.number().int().min(1) }),
    z.object({ type: z.literal("minAbility"), ability: z.string(), value: z.number().int() }),
    z.object({ type: z.literal("hasClass"), classId: z.string() }),
    z.object({ type: z.literal("hasSpecies"), speciesId: z.string() }),
    z.object({ type: z.literal("hasContent"), contentId: z.string() }),
    z.object({ type: z.literal("hasProficiency"), proficiency: z.string() }),
    z.object({ type: z.literal("optionalRule"), ruleId: z.string() }),
    z.object({ type: z.literal("allOf"), of: z.array(PrerequisiteSchema) }),
    z.object({ type: z.literal("anyOf"), of: z.array(PrerequisiteSchema) }),
    z.object({ type: z.literal("not"), of: PrerequisiteSchema }),
    z.object({ type: z.literal("gmJudgement"), description: z.string() }),
  ]),
);

export const ContentKindSchema = z.enum([
  "class",
  "subclass",
  "species",
  /** Sub-raça (2014) ou linhagem/legado/ancestralidade (2024). */
  "subspecies",
  "background",
  "origin",
  "feat",
  "power",
  "feature",
  "spell",
  "equipment",
  "skill",
  "condition",
  "deity",
  /** Ferramentas do mestre: ameaças, perigos (armadilhas, venenos, doenças) e regras de mesa. */
  "creature",
  "hazard",
  "rule",
]);
export type ContentKind = z.infer<typeof ContentKindSchema>;

export const ContentEntrySchema = z.object({
  /** Id único dentro do conjunto de regras (ex.: "class:wizard"). */
  id: z.string().regex(/^[a-z]+:[a-z0-9-]+$/, "Formato esperado: tipo:identificador"),
  kind: ContentKindSchema,
  name: z.string().min(1),
  summary: z.string().default(""),
  origin: z.enum(["official", "authorized", "homebrew"]),
  source: SourceRefSchema,
  /** Licença do texto (ex.: "CC-BY-4.0"). Obrigatória para conteúdo distribuído. */
  license: z.string().min(1),
  prerequisites: PrerequisiteSchema.optional(),
  /** Etiquetas de função em jogo (ex.: "control", "healing"). */
  roles: z.array(z.string()).default([]),
  /** Dados mecânicos específicos do sistema, validados pelo motor. */
  data: z.record(z.string(), z.unknown()).default({}),
});
export type ContentEntry = z.infer<typeof ContentEntrySchema>;

export const ContentPackSchema = z.object({
  format: z.literal("rpg-forge.content-pack"),
  formatVersion: z.literal(1),
  rulesetId: z.string().min(1),
  /** Versão semântica do pacote (ex.: "1.0.0"). Erratas incrementam a versão. */
  packVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  sourcebooks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        publisher: z.string().min(1),
        version: z.string().min(1),
        license: z.string().min(1),
        url: z.string().url().optional(),
        attribution: z.string().optional(),
      }),
    )
    .min(1),
  entries: z.array(ContentEntrySchema),
});
export type ContentPack = z.infer<typeof ContentPackSchema>;

export interface PackValidationResult {
  ok: boolean;
  errors: string[];
  pack?: ContentPack;
}

/** Valida estrutura, ids duplicados, fontes declaradas e referências cruzadas. */
export function validateContentPack(input: unknown): PackValidationResult {
  const parsed = ContentPackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
    };
  }
  const pack = parsed.data;
  const errors: string[] = [];
  const ids = new Set<string>();
  const books = new Set(pack.sourcebooks.map((b) => b.id));

  for (const e of pack.entries) {
    if (ids.has(e.id)) errors.push(`Id duplicado: ${e.id}`);
    ids.add(e.id);
    if (!books.has(e.source.sourcebookId)) {
      errors.push(`${e.id}: fonte "${e.source.sourcebookId}" não declarada em sourcebooks`);
    }
    if (!e.id.startsWith(`${e.kind}:`)) {
      errors.push(`${e.id}: prefixo do id deve corresponder ao tipo "${e.kind}"`);
    }
  }

  const checkRefs = (owner: string, p: Prerequisite | undefined): void => {
    if (!p) return;
    switch (p.type) {
      case "hasClass":
      case "minClassLevel":
        if (!ids.has(p.classId)) errors.push(`${owner}: pré-requisito referencia classe inexistente ${p.classId}`);
        break;
      case "hasSpecies":
        if (!ids.has(p.speciesId)) errors.push(`${owner}: pré-requisito referencia espécie inexistente ${p.speciesId}`);
        break;
      case "hasContent":
        if (!ids.has(p.contentId)) errors.push(`${owner}: pré-requisito referencia conteúdo inexistente ${p.contentId}`);
        break;
      case "allOf":
      case "anyOf":
        p.of.forEach((x) => checkRefs(owner, x));
        break;
      case "not":
        checkRefs(owner, p.of);
        break;
    }
  };
  pack.entries.forEach((e) => checkRefs(e.id, e.prerequisites));

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], pack };
}
