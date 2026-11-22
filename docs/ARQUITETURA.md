# RPG Forge: arquitetura e plano de implementação

## 1. Análise dos requisitos

O centro do produto é o **motor de regras determinístico** (seção 4 da especificação). Todo o resto depende dele:
o assistente de criação, a ficha dinâmica, a evolução, o inventário, a biblioteca, as recomendações e a IA.
Por isso a Fase 1 entrega o motor e seus contratos antes de qualquer conteúdo.

Restrições que moldam a arquitetura:

| Restrição | Consequência |
|---|---|
| Nunca inventar regras | Conteúdo só entra por **pacotes importados e validados**, com fonte e licença obrigatórias. |
| Vários sistemas, extensível | Contrato `RulesEngine` comum, com uma implementação por sistema e um registro central. A UI não tem `if (sistema === ...)`. |
| A IA nunca é autoridade | A IA (Fase 5) só consulta o catálogo e o motor por ferramentas. A validação acontece sempre no motor. |
| Errata não altera fichas em silêncio | Catálogo **versionado** (`RulesetVersion`). Cada personagem fica preso a uma versão até migrar explicitamente. |
| Uso em jogo não corrompe a construção | `CharacterData` separa valores permanentes de `session` (PV atuais, recursos gastos, condições). |
| Testável sem UI nem IA | `src/rules` é TypeScript puro, sem React, Next, Prisma ou rede. |

### Situação das fontes autorizadas

| Sistema | Fonte | Licença | Situação |
|---|---|---|---|
| D&D 5e (2014) | SRD 5.1 | CC-BY-4.0 | Fórmulas centrais implementadas. Catálogo do SRD a importar (Fase 2). |
| D&D 5e (2024) | SRD 5.2.1 | CC-BY-4.0 | Fórmulas centrais e regra de bônus de antecedente implementadas. Catálogo a importar (Fase 2). |
| Tormenta20 (2020) | Livro básico, 1ª edição (Jambô, 2020) | OGL 1.0a | Fórmulas implementadas (atributos, PV, PM, Defesa, perícias, XP, multiclasse). Pacote `content/tormenta20-2020` com raças, classes, origens, perícias, poderes (gerais, de classe, concedidos e aberrantes), magias, divindades, equipamento, itens superiores e itens mágicos (encantos, armas e armaduras específicas, poções, acessórios e artefatos). Regras de fabricação e limites de itens em `tormenta20.ts`. Inventário da ficha (moedas, dinheiro inicial, compra e venda, itens equipados, melhorias, carga, limite de itens mágicos) em `tormenta20-inventory.ts`; o motor aplica armadura, escudo e bônus fixos de itens na Defesa, nas perícias e no deslocamento. Ameaças e regras do mestre: a fazer. A edição Jogo do Ano **não** é suportada. |

Conteúdo exclusivo dos livros (por exemplo, subclasses que não estão no SRD) **não** é incluído.

#### Tormenta20 e a Open Game License

O livro básico de 2020 declara, na p. 391, que é publicado sob a OGL 1.0a: todo o texto de regras é Conteúdo
Open Game, exceto o que foi declarado **Identidade do Produto**: a Introdução, o Capítulo 9, os termos do cenário
(nomes e descrições de personagens, deuses, lugares e fenômenos), as ilustrações e as regras da classe inventor.

Regras adotadas no pacote `content/tormenta20-2020`:

* O texto completo da OGL, o aviso de copyright (seção 15) e a identificação do Conteúdo Open Game (seção 8)
  ficam em `content/tormenta20-2020/LICENSE-OGL.txt` e acompanham o pacote.
* Raças e habilidades cujo nome é termo do cenário recebem nome genérico (por exemplo, "Meia-Dríade",
  "Tradição Anã", "Sorte do Caos"). A referência ao livro fica em `source.page` e em `data.renamed`, sem
  reproduzir o nome original. Um teste impede que esses termos voltem ao pacote.
* A classe inventor aparece como "Artífice", só com nome e página, sem regras. Escolhê-la exige aprovação do mestre.
* Raças, classes, origens e perícias têm resumos escritos à mão. Poderes, magias, divindades e equipamento
  (`content/tormenta20-2020/data/*.json`) reproduzem o texto de regras, que é Conteúdo Open Game. Esses arquivos são
  gerados por `scripts/tormenta20/extract.py` a partir do PDF do usuário: o extrator lê o texto pelo estilo de fonte,
  troca os termos do cenário (`pi.py`), remove frases de ambientação que citam personagens ou lugares e converte
  pré-requisitos para a DSL (`prereqs.py`). O que não pode ser verificado vira `gmJudgement`, com o texto em
  `data.prerequisiteText`.
* Crenças, objetivos e símbolos sagrados das divindades são descrição do cenário e não entram no pacote.
  Dos artefatos, ficam só as frases com regras (`rules_only` em `build.py`).
* Nem o PDF do livro nem o texto bruto extraído dele entram no repositório. Só os JSON já tratados.

## 2. Arquitetura

```
┌──────────────────────────── Next.js 16 (App Router) ────────────────────────────┐
│  app/ (páginas e Server Components)     components/ (UI reutilizável, shadcn)   │
│        │  server actions (app/actions)                                          │
│        ▼                                                                        │
│  server/ ── auth (sessões no BD, scrypt) ── characters (permissões, versões)    │
│        │                                 └─ rulesets (catálogo versionado)      │
│        ▼                                                                        │
│  Prisma 7 + PostgreSQL                                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                    ▲ usa (cliente e servidor)
┌──────── src/rules (puro, determinístico) ────────┐
│ core/: types, character, content (pacotes),      │
│        prerequisites (DSL), engine (contrato +   │
│        BaseEngine), dice                         │
│ systems/: dnd5e-2014, dnd5e-2024, tormenta20     │
└──────────────────────────────────────────────────┘
```

* O motor roda **no cliente**, para dar feedback instantâneo, e **no servidor**, que é a autoridade: ao salvar, revalida e guarda o relatório.
* Rolagens de dados acontecem no servidor, com RNG criptográfico, e ficam registradas.

## 3. Módulos e responsabilidades

| Módulo | Responsabilidade |
|---|---|
| `rules/core/types` | Gravidades (válido, atenção, inválido, aprovação do mestre), `SourceRef` e relatórios. |
| `rules/core/character` | Esquema zod de `CharacterData`, a única forma persistida de uma ficha. |
| `rules/core/content` | Formato `ContentPack` e validação: ids, fontes declaradas, referências cruzadas e licença. |
| `rules/core/prerequisites` | DSL recursiva de pré-requisitos, com mensagens para iniciantes e o indicador "cumprível no futuro". |
| `rules/core/engine` | Contrato `RulesEngine`, `Catalog` isolado por sistema e `BaseEngine` com a validação comum. |
| `rules/core/dice` | Parser e rolador: d4–d100, `kh`/`kl`, vantagem, detalhamento do cálculo. |
| `rules/systems/*` | Regras específicas de cada sistema. |
| `server/auth` | Senhas com scrypt e sessões opacas no BD (o banco guarda só o hash do token). |
| `server/characters` | CRUD com permissão por recurso, controle de concorrência otimista, snapshots, restauração e auditoria. |
| `server/rulesets` | Sincronização dos motores com o BD e carregamento do catálogo por versão. |
| `scripts/import-content.ts` | Importação administrativa de pacotes, criando uma nova versão do catálogo. |

## 4. Banco de dados

Arquivo `prisma/schema.prisma`. Principais entidades:

* `User`, `Session`: contas e sessões.
* `Ruleset` (id = id do motor), `RulesetVersion` (versão do pacote, `isCurrent`), `Sourcebook` (licença e atribuição).
* `ContentEntry`: tabela **genérica** com `kind` (classe, espécie, antecedente, talento, poder, magia, equipamento...),
  `prerequisites` e `data` em JSON validados pelo motor. Isso dispensa migrações por sistema. Foi um refinamento das
  entidades sugeridas (Class, Species, Spell...), que viraram valores de `kind`.
* `Character` (`data` JSON + `validation` + `revision`), `CharacterVersion` (snapshots imutáveis).
* `Campaign`, `CampaignMember` (papel gm/player), `CampaignEvent`, `GmApproval`.
* `DiceRoll`, `AuditLog`.

## 5. Contratos do motor de regras

```ts
interface RulesEngine {
  meta: RulesetMeta;                       // fontes, licenças, limitações, faixa de níveis
  abilities: AbilityDef[];
  abilityMethods: AbilityMethod[];         // validate() + generate(rng) para o modo aleatório
  creationSteps(catalog): CreationStep[];  // ordem adaptada ao sistema
  abilityModifier(score): number;
  levelForXp?(xp): number;
  derive(character, catalog): DerivedStats;
  validate(character, catalog): ValidationReport;
  evaluateOption(character, entry, catalog): OptionEvaluation; // agora / futuramente / indisponível / adquirida
}
```

Exemplo exigido pela especificação, coberto por teste: um personagem de nível 2 avaliando um poder de nível 6 recebe
`available_later` e a mensagem "O requisito mínimo é nível 6... Você poderá selecionar esta opção quando cumprir os
requisitos necessários."

## 6. Fluxo de criação

1. Escolha do sistema, com as limitações exibidas. Cria um **rascunho** persistido (versão 1).
2. Editor por etapas vindas do motor, com barra de progresso, navegação livre e salvamento automático (debounce de 800 ms e revisão otimista).
3. Cada alteração passa pelo motor no cliente. O painel lateral mostra os atributos derivados e o relatório de validação.
4. Etapas que dependem de catálogo aparecem com cadeado e explicam por que ainda não há conteúdo, sem dados inventados.
5. Revisão: relatório completo, versões nomeadas e restauração (que cria uma nova versão).

## 7. Dependências entre funcionalidades

```
Motor + catálogo ─┬─> Criador (manual / assistido / aleatório)
                  ├─> Ficha dinâmica ──> Inventário ──> Evolução por nível ──> Linha do tempo
                  ├─> Biblioteca (abas por disponibilidade, comparação)
                  └─> Recomendações e "Analisar meu personagem" ──> Assistente de IA (ferramentas)
Autenticação ──> Personagens ──> Campanhas ──> Aprovações do mestre / compartilhamento de rolagens
Versionamento do catálogo ──> Migração explícita de personagens
```

## 8. Plano incremental

| Fase | Entregas | Situação |
|---|---|---|
| **1. Fundação** | Arquitetura, schema e migração, autenticação, layout e tema, motor central e três motores, dados, pacotes de conteúdo e importador, rascunho com salvamento automático, validação ao vivo, histórico e restauração, testes. | **Concluída** |
| 2. Criador funcional (D&D 2014) | Converter o SRD 5.1 em pacote (com atribuição CC-BY). Etapas de raça, classe, antecedente, perícias, magias e equipamento. Modos assistido e aleatório com travas. Conclusão da criação. | Próxima |
| 3. Ficha e progressão | Ficha de sessão (PV, recursos, condições), inventário com recálculo, assistente de subida de nível, linha do tempo. | |
| 4. Múltiplos sistemas | Pacote SRD 5.2.1 (D&D 2024). Tormenta20 (2020): poderes, magias, equipamento e divindades no pacote OGL. Testes de isolamento. | Em andamento (Tormenta20: livro básico pronto, exceto ameaças e regras do mestre) |
| 5. Inteligência e campanhas | Recomendações por objetivo, relatório de análise, IA com ferramentas sobre o catálogo, campanhas, convites, aprovações e eventos. | |
| 6. Refinamento | PDF e impressão, JSON de importação/exportação, backup, acessibilidade (auditoria WCAG), desempenho, implantação. | |
