import type { CharacterData } from "../core/character";
import { BaseEngine, type Catalog, type CreationStep, type RulesetMeta } from "../core/engine";
import type { SourceRef, ValidationIssue } from "../core/types";
import {
  DND_ABILITIES,
  dndAbilityMethods,
  dndLevelForXp,
  dndModifier,
  dndProficiencyBonus,
} from "./dnd5e-common";

export const SRD_51: SourceRef = {
  sourcebookId: "srd-5.1",
  edition: "2014",
  version: "5.1",
  section: "Ability Scores / Beyond 1st Level",
};

export class Dnd5e2014Engine extends BaseEngine {
  readonly meta: RulesetMeta = {
    id: "dnd5e-2014",
    name: "D&D 5ª Edição (2014)",
    system: "Dungeons & Dragons",
    edition: "5e (2014)",
    publisher: "Wizards of the Coast",
    dataAvailability: "licensed",
    limitations: [
      "Somente conteúdo do SRD 5.1 (CC-BY-4.0) pode ser distribuído. Raças, classes e magias exclusivas do Livro do Jogador não estão incluídas.",
      "O catálogo de conteúdo do SRD é importado na Fase 2; nesta fase estão disponíveis as fórmulas centrais (atributos, proficiência, XP).",
    ],
    sources: [
      {
        id: "srd-5.1",
        title: "System Reference Document 5.1",
        license: "CC-BY-4.0",
        url: "https://dnd.wizards.com/resources/systems-reference-document",
      },
    ],
    levelRange: { min: 1, max: 20 },
  };

  readonly abilities = DND_ABILITIES;
  readonly abilityMethods = dndAbilityMethods(SRD_51);

  abilityModifier = dndModifier;
  levelForXp = dndLevelForXp;
  protected proficiencyBonus(level: number) {
    return dndProficiencyBonus(level);
  }

  /** Em 2014 os bônus de atributo vêm da raça (dados do catálogo). */
  protected abilityBonuses(c: CharacterData, catalog: Catalog): Record<string, number> {
    const species = c.speciesId ? catalog.get(c.speciesId) : undefined;
    const bonuses = (species?.data.abilityBonuses ?? {}) as Record<string, number>;
    return { ...bonuses };
  }

  creationSteps(): CreationStep[] {
    return [
      { id: "concept", title: "Nome e conceito", help: "Quem é seu personagem? Um nome e uma ideia curta já bastam.", requiresContent: false },
      { id: "level", title: "Nível inicial", help: "A maioria das campanhas começa no nível 1. Confirme com o mestre.", requiresContent: false },
      { id: "species", title: "Raça", help: "Sua raça define traços como visão no escuro, deslocamento e bônus de atributos.", contentKind: "species", requiresContent: true },
      { id: "class", title: "Classe", help: "A classe é a profissão do aventureiro e define a maior parte das habilidades.", contentKind: "class", requiresContent: true },
      { id: "abilities", title: "Atributos", help: "Seis números que descrevem as capacidades básicas do personagem.", requiresContent: false },
      { id: "background", title: "Antecedente", help: "O que seu personagem fazia antes de se tornar aventureiro.", contentKind: "background", requiresContent: true },
      { id: "skills", title: "Perícias e proficiências", help: "Aquilo em que seu personagem é treinado.", contentKind: "skill", requiresContent: true },
      { id: "spells", title: "Magias", help: "Somente para classes conjuradoras.", contentKind: "spell", requiresContent: true },
      { id: "equipment", title: "Equipamento inicial", help: "Armas, armaduras e ferramentas para começar a aventura.", contentKind: "equipment", requiresContent: true },
      { id: "narrative", title: "Personalidade e história", help: "Traços, ideais, vínculos e defeitos dão vida ao personagem.", requiresContent: false },
      { id: "review", title: "Revisão", help: "Confira a ficha e resolva qualquer pendência antes de concluir.", requiresContent: false },
    ];
  }

  protected validateSystem(c: CharacterData): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (c.progressionMode === "xp" && c.experience > 0) {
      const expected = dndLevelForXp(c.experience);
      if (expected !== c.level) {
        issues.push({
          code: "progression.xp_level_mismatch",
          severity: "warning",
          message: `Com ${c.experience} XP o nível esperado é ${expected}, mas a ficha indica nível ${c.level}.`,
          path: "level",
          source: SRD_51,
        });
      }
    }
    return issues;
  }
}
