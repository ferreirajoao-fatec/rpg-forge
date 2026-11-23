import type { CharacterData } from "../core/character";
import type { Catalog, CreationStep, RulesetMeta } from "../core/engine";
import type { SourceRef, ValidationIssue } from "../core/types";
import { DND_ABILITIES, dndAbilityMethods } from "./dnd5e-common";
import { Dnd5eEngine } from "./dnd5e-engine";

export const SRD_52: SourceRef = {
  sourcebookId: "srd-5.2.1",
  edition: "2024",
  version: "5.2.1",
  section: "Character Creation",
};

export class Dnd5e2024Engine extends Dnd5eEngine {
  readonly meta: RulesetMeta = {
    id: "dnd5e-2024",
    name: "D&D 5ª Edição Revisada (2024)",
    system: "Dungeons & Dragons",
    edition: "5e revisada (2024)",
    publisher: "Wizards of the Coast",
    dataAvailability: "licensed",
    limitations: [
      "Somente o conteúdo do SRD 5.2.1 (CC-BY-4.0): uma subclasse por classe e quatro antecedentes. O resto do Livro do Jogador 2024 não está incluído.",
      "Tradução não oficial. Monstros e itens mágicos ainda não foram importados.",
    ],
    sources: [
      {
        id: "srd-5.2.1",
        title: "System Reference Document 5.2.1",
        license: "CC-BY-4.0",
        url: "https://www.dndbeyond.com/srd",
      },
    ],
    levelRange: { min: 1, max: 20 },
  };

  readonly abilityMethods = dndAbilityMethods(SRD_52);
  protected readonly rulesSource = SRD_52;

  /** Em 2024 os bônus vêm do antecedente e são distribuídos pelo jogador. */
  protected originBonuses(c: CharacterData): Record<string, number> {
    return { ...c.assignedBonuses };
  }

  /** O talento de origem do antecedente conta como adquirido. */
  protected facts(c: CharacterData, catalog: Catalog) {
    const f = super.facts(c, catalog);
    const feat = this.backgroundOf(c, catalog)?.data.featId;
    if (feat) f.acquiredContent.add(feat);
    return f;
  }

  creationSteps(): CreationStep[] {
    return [
      { id: "concept", title: "Nome e conceito", help: "Quem é seu personagem? Um nome e uma ideia curta já bastam.", requiresContent: false },
      { id: "level", title: "Nível inicial", help: "A maioria das campanhas começa no nível 1. Confirme com o mestre.", requiresContent: false },
      { id: "class", title: "Classe", help: "Nas regras de 2024 a classe é escolhida primeiro, pois orienta as demais decisões. A subclasse vem no 3º nível.", contentKind: "class", requiresContent: true },
      { id: "background", title: "Antecedente", help: "O antecedente dá bônus em três atributos, um talento de origem, duas perícias e uma ferramenta.", contentKind: "background", requiresContent: true },
      { id: "species", title: "Espécie", help: "A espécie define traços como tamanho, deslocamento e sentidos especiais. Algumas têm linhagens.", contentKind: "species", requiresContent: true },
      { id: "abilities", title: "Atributos", help: "Defina os seis atributos. O bônus do antecedente é distribuído na etapa Antecedente.", requiresContent: false },
      { id: "skills", title: "Perícias", help: "Escolha as perícias da lista da classe. As do antecedente já vêm marcadas.", contentKind: "skill", requiresContent: true },
      { id: "feats", title: "Talentos", help: "O talento de origem vem do antecedente. Outros chegam no lugar de Aumentos no Valor de Habilidade.", contentKind: "feat", requiresContent: true },
      { id: "spells", title: "Magias", help: "Somente para classes conjuradoras: truques e magias preparadas da lista da classe.", contentKind: "spell", requiresContent: true },
      { id: "equipment", title: "Equipamento", help: "Escolha o pacote A ou B (ouro) da classe e do antecedente, compre itens e marque o que está equipado.", contentKind: "equipment", requiresContent: true, ui: "inventory" },
      { id: "narrative", title: "Personalidade e história", help: "Detalhes que dão vida ao personagem.", requiresContent: false },
      { id: "review", title: "Revisão", help: "Confira a ficha e resolva qualquer pendência antes de concluir.", requiresContent: false },
    ];
  }

  protected validateSystem(c: CharacterData, catalog: Catalog): ValidationIssue[] {
    const issues = this.validateDnd(c, catalog);
    const assigned = Object.entries(c.assignedBonuses).filter(([, v]) => v !== 0);
    const bg = this.backgroundOf(c, catalog);

    if (assigned.length) {
      const pattern = assigned.map(([, v]) => v).sort((a, b) => b - a).join(",");
      if (pattern !== "2,1" && pattern !== "1,1,1") {
        issues.push({
          code: "abilities.background_bonus_pattern",
          severity: "invalid",
          message: "O bônus do antecedente deve ser +2 em um atributo e +1 em outro, ou +1 em três atributos diferentes.",
          path: "assignedBonuses",
          source: SRD_52,
        });
      }
      if (!bg) {
        issues.push({
          code: "abilities.background_bonus_without_background",
          severity: "invalid",
          message: "Escolha um antecedente antes de distribuir o bônus de atributos.",
          path: "assignedBonuses",
          source: SRD_52,
        });
      } else if (bg.data.abilityScores?.length) {
        for (const [k] of assigned) {
          if (!bg.data.abilityScores.includes(k)) {
            issues.push({
              code: "abilities.background_bonus_ability",
              severity: "invalid",
              message: `O antecedente ${bg.entry.name} não permite aumentar ${DND_ABILITIES.find((a) => a.key === k)?.label ?? k}.`,
              path: `assignedBonuses.${k}`,
              source: bg.entry.source,
            });
          }
        }
      }
    } else if (bg) {
      issues.push({
        code: "abilities.background_bonus_missing",
        severity: "warning",
        message: `Distribua o bônus de ${bg.entry.name}: +2 e +1, ou +1 em três atributos.`,
        path: "assignedBonuses",
        source: bg.entry.source,
      });
    }
    return issues;
  }
}
