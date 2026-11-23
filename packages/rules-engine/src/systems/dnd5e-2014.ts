import type { CharacterData } from "../core/character";
import type { Catalog, CreationStep, RulesetMeta } from "../core/engine";
import type { SourceRef, ValidationIssue } from "../core/types";
import { dndAbilityMethods } from "./dnd5e-common";
import { Dnd5eEngine, type DndSubspeciesData } from "./dnd5e-engine";

export const SRD_51: SourceRef = {
  sourcebookId: "srd-5.1",
  edition: "2014",
  version: "5.1",
  section: "Ability Scores / Beyond 1st Level",
};

export class Dnd5e2014Engine extends Dnd5eEngine {
  readonly meta: RulesetMeta = {
    id: "dnd5e-2014",
    name: "D&D 5ª Edição (2014)",
    system: "Dungeons & Dragons",
    edition: "5e (2014)",
    publisher: "Wizards of the Coast",
    dataAvailability: "licensed",
    limitations: [
      "Somente o conteúdo do SRD 5.1 (CC-BY-4.0): uma subclasse por classe, um antecedente (Acólito) e um talento (Agarrador). O resto do Livro do Jogador não está incluído.",
      "Tradução não oficial. Monstros e itens mágicos ainda não foram importados.",
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

  readonly abilityMethods = dndAbilityMethods(SRD_51);
  protected readonly rulesSource = SRD_51;

  /** Em 2014 os bônus vêm da raça e da sub-raça; o meio-elfo distribui os seus (assignedBonuses). */
  protected originBonuses(c: CharacterData, catalog: Catalog): Record<string, number> {
    const sp = this.speciesOf(c, catalog);
    const out: Record<string, number> = { ...(sp?.data.abilityBonuses ?? {}) };
    const sub = sp?.sub ? (sp.sub.data as unknown as DndSubspeciesData).abilityBonuses : {};
    for (const [k, v] of Object.entries(sub ?? {})) out[k] = (out[k] ?? 0) + v;
    if (sp?.data.flexibleBonus) for (const [k, v] of Object.entries(c.assignedBonuses)) out[k] = (out[k] ?? 0) + v;
    return out;
  }

  creationSteps(): CreationStep[] {
    return [
      { id: "concept", title: "Nome e conceito", help: "Quem é seu personagem? Um nome e uma ideia curta já bastam.", requiresContent: false },
      { id: "level", title: "Nível inicial", help: "A maioria das campanhas começa no nível 1. Confirme com o mestre.", requiresContent: false },
      { id: "species", title: "Raça", help: "A raça define traços como visão no escuro, deslocamento e bônus de atributos. Algumas têm sub-raças.", contentKind: "species", requiresContent: true },
      { id: "class", title: "Classe", help: "A classe é a profissão do aventureiro e define a maior parte das habilidades. A subclasse vem no nível indicado.", contentKind: "class", requiresContent: true },
      { id: "abilities", title: "Atributos", help: "Seis números que descrevem as capacidades básicas do personagem. Os bônus da raça entram depois.", requiresContent: false },
      { id: "background", title: "Antecedente", help: "O que seu personagem fazia antes de se tornar aventureiro. Dá duas perícias e uma característica.", contentKind: "background", requiresContent: true },
      { id: "skills", title: "Perícias", help: "Escolha as perícias da lista da classe. As do antecedente e da raça já vêm marcadas.", contentKind: "skill", requiresContent: true },
      { id: "feats", title: "Talentos (opcional)", help: "Regra opcional: no lugar de um Aumento no Valor de Habilidade, o personagem pode pegar um talento.", contentKind: "feat", requiresContent: true },
      { id: "spells", title: "Magias", help: "Somente para classes conjuradoras: truques e magias da lista da classe.", contentKind: "spell", requiresContent: true },
      { id: "equipment", title: "Equipamento", help: "Pegue o equipamento inicial da classe e do antecedente, compre itens e marque o que está equipado. Armadura e escudo mudam a CA.", contentKind: "equipment", requiresContent: true, ui: "inventory" },
      { id: "narrative", title: "Personalidade e história", help: "Traços, ideais, vínculos e defeitos dão vida ao personagem.", requiresContent: false },
      { id: "review", title: "Revisão", help: "Confira a ficha e resolva qualquer pendência antes de concluir.", requiresContent: false },
    ];
  }

  protected validateSystem(c: CharacterData, catalog: Catalog): ValidationIssue[] {
    const issues = this.validateDnd(c, catalog);
    const sp = this.speciesOf(c, catalog);
    const flex = sp?.data.flexibleBonus;
    const assigned = Object.entries(c.assignedBonuses).filter(([, v]) => v !== 0);
    if (flex) {
      if (assigned.some(([k, v]) => v !== flex.amount || flex.exclude?.includes(k)) || assigned.length > flex.count) {
        issues.push({ code: "abilities.flexible_bonus", severity: "invalid", message: `${sp!.entry.name}: +${flex.amount} em ${flex.count} atributos diferentes, fora os que a raça já aumenta.`, path: "assignedBonuses", source: sp!.entry.source });
      } else if (assigned.length < flex.count) {
        issues.push({ code: "abilities.flexible_bonus_missing", severity: "warning", message: `${sp!.entry.name}: escolha mais ${flex.count - assigned.length} atributo(s) para o bônus de +${flex.amount}.`, path: "assignedBonuses", source: sp!.entry.source });
      }
    }
    const feats = c.choices.filter((ch) => ch.contentId.startsWith("feat:"));
    if (feats.length && !c.optionalRules.includes("feats") && !feats.every((ch) => ch.gmApprovalId)) {
      issues.push({ code: "feats.optional_rule", severity: "gm_approval", message: "Talentos são uma regra opcional em 2014; confirme com o mestre.", path: "choices", source: SRD_51 });
    }
    return issues;
  }
}
