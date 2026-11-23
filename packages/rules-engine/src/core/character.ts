import { z } from "zod";

/**
 * Representação agnóstica de sistema de um personagem.
 *
 * Valores PERMANENTES (atributos base, escolhas, nível) ficam separados do
 * ESTADO DE SESSÃO (PV atuais, recursos gastos, condições), para que o uso da
 * ficha em jogo nunca altere indevidamente a construção do personagem.
 */

export const ChoiceSchema = z.object({
  /** Slot de escolha definido pelo motor (ex.: "class", "skill:1", "feat:4"). */
  slot: z.string().min(1),
  /** Id do conteúdo escolhido no catálogo. */
  contentId: z.string().min(1),
  /** Nível do personagem em que a escolha foi feita. */
  atLevel: z.number().int().min(0),
  /** Escolha travada contra randomização. */
  locked: z.boolean().default(false),
  /** Id da aprovação do mestre, quando a escolha exigir. */
  gmApprovalId: z.string().optional(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const ClassLevelSchema = z.object({
  classId: z.string().min(1),
  levels: z.number().int().min(1),
  subclassId: z.string().optional(),
});

export const InventoryItemSchema = z.object({
  /** Id da linha do inventário (único na ficha). */
  entryId: z.string().min(1),
  /** Item do catálogo; ausente em itens personalizados. */
  contentId: z.string().optional(),
  customName: z.string().max(80).optional(),
  quantity: z.number().int().min(0).default(1),
  equipped: z.boolean().default(false),
  /** Melhorias aplicadas ao item (ids do catálogo), quando o sistema as tiver. */
  modifications: z.array(z.string()).default([]),
  enchantments: z.array(z.string()).default([]),
  materialId: z.string().optional(),
  notes: z.string().max(300).optional(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const SessionStateSchema = z.object({
  currentHp: z.number().int().nullable().default(null),
  tempHp: z.number().int().min(0).default(0),
  /** Recursos gastos por chave (ex.: "spellSlot:1" -> 2, "pm" -> 5). */
  spent: z.record(z.string(), z.number().int().min(0)).default({}),
  conditions: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export const CharacterDataSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  name: z.string().trim().max(80).default(""),
  concept: z.string().max(500).default(""),
  level: z.number().int().min(1).max(30).default(1),
  experience: z.number().int().min(0).default(0),
  progressionMode: z.enum(["xp", "milestone"]).default("milestone"),
  creationMode: z.enum(["manual", "assisted", "random"]).default("manual"),
  /** Atributos base, antes de bônus (chaves definidas pelo motor). */
  baseAbilities: z.record(z.string(), z.number().int()).default({}),
  abilityMethod: z.string().optional(),
  /** Bônus de atributo distribuídos pelo jogador quando o sistema permite escolha. */
  assignedBonuses: z.record(z.string(), z.number().int()).default({}),
  /** Aumentos de atributo ganhos ao subir de nível (ex.: Aumento no Valor de Habilidade do D&D). */
  levelBonuses: z.record(z.string(), z.number().int().min(0)).default({}),
  classes: z.array(ClassLevelSchema).default([]),
  speciesId: z.string().optional(),
  backgroundId: z.string().optional(),
  choices: z.array(ChoiceSchema).default([]),
  inventory: z.array(InventoryItemSchema).default([]),
  currency: z.record(z.string(), z.number().int().min(0)).default({}),
  narrative: z
    .object({
      appearance: z.string().default(""),
      personality: z.string().default(""),
      ideals: z.string().default(""),
      bonds: z.string().default(""),
      flaws: z.string().default(""),
      backstory: z.string().default(""),
    })
    .default({ appearance: "", personality: "", ideals: "", bonds: "", flaws: "", backstory: "" }),
  /** Regras opcionais habilitadas (ids definidos pelo motor). */
  optionalRules: z.array(z.string()).default([]),
  /** NEX independente do nível quando "op:separate-level-nex" (Sobrevivendo ao Horror, p. 99) está ativo. */
  opSeparateNex: z.number().int().min(0).max(99).optional(),
  /** Token secreto para link público somente leitura da ficha (`/ficha-publica/[id].[token]`). */
  publicShareToken: z.string().max(64).optional(),
  session: SessionStateSchema.default({ currentHp: null, tempHp: 0, spent: {}, conditions: [], notes: "" }),
});

export type CharacterData = z.infer<typeof CharacterDataSchema>;

export function emptyCharacter(overrides: Partial<CharacterData> = {}): CharacterData {
  return CharacterDataSchema.parse(overrides);
}

/** Nível total do personagem (soma das classes, ou o nível declarado). */
export function totalLevel(c: CharacterData): number {
  const sum = c.classes.reduce((acc, cl) => acc + cl.levels, 0);
  return sum > 0 ? sum : c.level;
}
