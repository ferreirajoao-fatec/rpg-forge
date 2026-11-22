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

export const SRD_52: SourceRef = {
  sourcebookId: "srd-5.2.1",
  edition: "2024",
  version: "5.2.1",
  section: "Character Creation",
};

const ABILITY_SCORE_MAX = 20;

export class Dnd5e2024Engine extends BaseEngine {
  readonly meta: RulesetMeta = {
    id: "dnd5e-2024",
    name: "D&D 5ª Edição Revisada (2024)",
    system: "Dungeons & Dragons",
    edition: "5e revisada (2024)",
    publisher: "Wizards of the Coast",
    dataAvailability: "licensed",
    limitations: [
      "Somente conteúdo do SRD 5.2.1 (CC-BY-4.0) pode ser distribuído. Espécies, antecedentes e subclasses exclusivos do Livro do Jogador 2024 não estão incluídos.",
      "O catálogo de conteúdo do SRD é importado na Fase 2; nesta fase estão disponíveis as fórmulas centrais e a regra de bônus de antecedente.",
    ],
    sources: [
      {
        id: "srd-5.2.1",
        title: "System Reference Document 5.2.1",
        license: "CC-BY-4.0",
        url: "https://dnd.wizards.com/resources/systems-reference-document",
      },
    ],
    levelRange: { min: 1, max: 20 },
  };

  readonly abilities = DND_ABILITIES;
  readonly abilityMethods = dndAbilityMethods(SRD_52);

  abilityModifier = dndModifier;
  levelForXp = dndLevelForXp;
  protected proficiencyBonus(level: number) {
    return dndProficiencyBonus(level);
  }

  /** Em 2024 os bônus vêm do antecedente e são distribuídos pelo jogador. */
  protected abilityBonuses(c: CharacterData): Record<string, number> {
    return { ...c.assignedBonuses };
  }

  creationSteps(): CreationStep[] {
    return [
      { id: "concept", title: "Nome e conceito", help: "Quem é seu personagem? Um nome e uma ideia curta já bastam.", requiresContent: false },
      { id: "level", title: "Nível inicial", help: "A maioria das campanhas começa no nível 1. Confirme com o mestre.", requiresContent: false },
      { id: "class", title: "Classe", help: "Nas regras de 2024 a classe é escolhida primeiro, pois orienta as demais decisões.", contentKind: "class", requiresContent: true },
      { id: "background", title: "Antecedente", help: "O antecedente concede bônus de atributo, um talento de origem e proficiências.", contentKind: "background", requiresContent: true },
      { id: "species", title: "Espécie", help: "Sua espécie define traços como tamanho, deslocamento e sentidos especiais.", contentKind: "species", requiresContent: true },
      { id: "abilities", title: "Atributos", help: "Defina os seis atributos e distribua o bônus do antecedente.", requiresContent: false },
      { id: "skills", title: "Perícias e proficiências", help: "Aquilo em que seu personagem é treinado.", contentKind: "skill", requiresContent: true },
      { id: "feats", title: "Talentos", help: "Talentos são capacidades especiais; o primeiro vem do antecedente.", contentKind: "feat", requiresContent: true },
      { id: "spells", title: "Magias", help: "Somente para classes conjuradoras.", contentKind: "spell", requiresContent: true },
      { id: "equipment", title: "Equipamento inicial", help: "Escolha o pacote de equipamento da classe e do antecedente, ou ouro.", contentKind: "equipment", requiresContent: true },
      { id: "narrative", title: "Personalidade e história", help: "Detalhes que dão vida ao personagem.", requiresContent: false },
      { id: "review", title: "Revisão", help: "Confira a ficha e resolva qualquer pendência antes de concluir.", requiresContent: false },
    ];
  }

  protected validateSystem(c: CharacterData, catalog: Catalog): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const assigned = Object.entries(c.assignedBonuses).filter(([, v]) => v !== 0);

    if (assigned.length) {
      const values = assigned.map(([, v]) => v).sort((a, b) => b - a);
      const pattern = values.join(",");
      if (pattern !== "2,1" && pattern !== "1,1,1") {
        issues.push({
          code: "abilities.background_bonus_pattern",
          severity: "invalid",
          message: "O bônus do antecedente deve ser +2 em um atributo e +1 em outro, ou +1 em três atributos diferentes.",
          path: "assignedBonuses",
          source: SRD_52,
        });
      }
      const background = c.backgroundId ? catalog.get(c.backgroundId) : undefined;
      const allowed = background?.data.abilityOptions as string[] | undefined;
      if (!background) {
        issues.push({
          code: "abilities.background_bonus_without_background",
          severity: "invalid",
          message: "Escolha um antecedente antes de distribuir o bônus de atributos.",
          path: "assignedBonuses",
          source: SRD_52,
        });
      } else if (allowed) {
        for (const [k] of assigned) {
          if (!allowed.includes(k)) {
            issues.push({
              code: "abilities.background_bonus_ability",
              severity: "invalid",
              message: `O antecedente ${background.name} não permite aumentar ${DND_ABILITIES.find((a) => a.key === k)?.label ?? k}.`,
              path: `assignedBonuses.${k}`,
              source: background.source,
            });
          }
        }
      }
    }

    for (const a of DND_ABILITIES) {
      const total = (c.baseAbilities[a.key] ?? 0) + (c.assignedBonuses[a.key] ?? 0);
      if (total > ABILITY_SCORE_MAX) {
        issues.push({
          code: "abilities.max_20",
          severity: "invalid",
          message: `${a.label} não pode passar de ${ABILITY_SCORE_MAX} com esse bônus.`,
          path: `abilities.${a.key}`,
          source: SRD_52,
        });
      }
    }

    if (c.progressionMode === "xp" && c.experience > 0) {
      const expected = dndLevelForXp(c.experience);
      if (expected !== c.level) {
        issues.push({
          code: "progression.xp_level_mismatch",
          severity: "warning",
          message: `Com ${c.experience} XP o nível esperado é ${expected}, mas a ficha indica nível ${c.level}.`,
          path: "level",
          source: SRD_52,
        });
      }
    }
    return issues;
  }
}
