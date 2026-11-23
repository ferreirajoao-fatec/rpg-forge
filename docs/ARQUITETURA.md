# RPG Forge: arquitetura e plano de implementação

Este documento acompanha a especificação "Prompt mestre definitivo" (32 seções). A versão anterior da especificação
já tinha produzido a fundação: motor de regras, autenticação, persistência, criador por etapas e o pacote Tormenta20.
A nova versão acrescenta o **Avatar Studio** (PixiJS) como prioridade, pede um **monorepo pnpm** e reorganiza o plano
em 10 fases. As decisões que divergem do texto da especificação estão registradas na seção 10, com o motivo.

## 1. Análise dos requisitos

O centro mecânico do produto é o **motor de regras determinístico** (seção 5 da especificação), e o centro visual é o
**Avatar Studio** (seções 6 a 13). Os dois são independentes: o avatar nunca concede regras (asas não dão voo), e o
motor nunca depende do renderizador. A ligação entre eles é só de dados (equipamento funcional → aparência, seção 15.1).


Restrições que moldam a arquitetura:

| Restrição | Consequência |
|---|---|
| Nunca inventar regras | Conteúdo só entra por **pacotes importados e validados**, com fonte e licença obrigatórias. |
| Vários sistemas, extensível | Contrato `RulesEngine` comum, com uma implementação por sistema e um registro central. A UI não tem `if (sistema === ...)`. |
| A IA nunca é autoridade | A IA (Fase 9) só consulta o catálogo e o motor por ferramentas. A validação acontece sempre no motor. |
| Errata não altera fichas em silêncio | Catálogo **versionado** (`RulesetVersion`). Cada personagem fica preso a uma versão até migrar explicitamente. |
| Uso em jogo não corrompe a construção | `CharacterData` separa valores permanentes de `session` (PV atuais, recursos gastos, condições). |
| Testável sem UI nem IA | `packages/rules-engine` é TypeScript puro, sem React, Next, Prisma ou rede. |

### Situação das fontes autorizadas

| Sistema | Fonte | Licença | Situação |
|---|---|---|---|
| D&D 5e (2014) | SRD 5.1 | CC-BY-4.0 | Fórmulas centrais implementadas. Catálogo do SRD a importar (Fase 4). |
| D&D 5e (2024) | SRD 5.2.1 | CC-BY-4.0 | Fórmulas centrais e regra de bônus de antecedente implementadas. Catálogo a importar (Fase 4). |
| Tormenta20 (2020) | Livro básico, 1ª edição (Jambô, 2020) | OGL 1.0a | Fórmulas implementadas (atributos, PV, PM, Defesa, perícias, XP, multiclasse). Pacote `content/tormenta20-2020` com raças, classes, origens, perícias, poderes (gerais, de classe, concedidos e aberrantes), magias, divindades, equipamento, itens superiores e itens mágicos (encantos, armas e armaduras específicas, poções, acessórios e artefatos). Regras de fabricação e limites de itens em `tormenta20.ts`. Inventário da ficha (moedas, dinheiro inicial, compra e venda, itens equipados, melhorias, carga, limite de itens mágicos) em `tormenta20-inventory.ts`; o motor aplica armadura, escudo e bônus fixos de itens na Defesa, nas perícias e no deslocamento. Ameaças e regras do mestre: extraídas (`creatures.json`, `hazards.json`, `gm-rules.json`), ainda não ligadas ao app. A edição Jogo do Ano **não** é suportada. |

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

Monorepo pnpm (`pnpm-workspace.yaml`):

```
rpg-forge/
├─ apps/
│  └─ web/                 Next.js 16 (App Router): páginas, server actions e camada de servidor
│     ├─ src/app/          rotas e server actions
│     ├─ src/server/       auth (sessões no BD, scrypt), characters (permissões, versões), rulesets (catálogo)
│     ├─ src/components/   componentes do app (validação, paginação, formulários)
│     └─ scripts/          importação de pacotes de conteúdo
├─ packages/
│  ├─ rules-engine/        motor de regras puro: core/ (tipos, ficha, conteúdo, pré-requisitos, motor, dados)
│  │                       e systems/ (dnd5e-2014, dnd5e-2024, tormenta20)
│  ├─ ui/                  componentes shadcn/ui sobre Base UI + utilitário cn
│  ├─ config/              tsconfig base compartilhado
│  └─ avatar-engine/       modelo do avatar, catálogo de peças, composição, randomização, histórico e
│                          renderizador PixiJS (export "./pixi", só no navegador)
├─ prisma/                 schema e migrações (o client é gerado em apps/web/src/generated)
├─ content/                pacotes de conteúdo com licença aberta (cada pasta traz sua licença)
├─ assets/avatar/          peças SVG originais por categoria + catalog.json (metadados e compatibilidade)
├─ scripts/tormenta20/     extrator Python do PDF do usuário (o PDF nunca entra no repositório)
└─ docs/
```

```
            apps/web (Next.js)
   páginas ── server actions ── server/ ── Prisma ── PostgreSQL
      │              │
      ▼              ▼ revalida ao salvar (autoridade)
 @rpg-forge/ui   @rpg-forge/rules-engine  ◄── content/ (pacotes validados)
                 (também roda no cliente para feedback instantâneo)

 @rpg-forge/avatar-engine ◄── assets/avatar (gerado por `pnpm assets:build`)
 (independente do rules-engine: a aparência não concede regras)
```

* O motor roda **no cliente**, para dar feedback instantâneo, e **no servidor**, que é a autoridade: ao salvar, revalida e guarda o relatório.
* Rolagens de dados acontecem no servidor, com RNG criptográfico, e ficam registradas.
* O `.env` fica na raiz e é compartilhado pelo Prisma, pelos scripts e pelo Next (`apps/web/next.config.ts` o carrega).
* Turbopack detecta a raiz do monorepo pelo `pnpm-lock.yaml` e transpila os pacotes do workspace a partir do código-fonte TypeScript, sem etapa de build.

## 3. Módulos e responsabilidades

| Módulo | Responsabilidade |
|---|---|
| `rules-engine/core/types` | Gravidades (válido, atenção, inválido, aprovação do mestre), `SourceRef` e relatórios. |
| `rules-engine/core/character` | Esquema zod de `CharacterData`, a única forma persistida de uma ficha. |
| `rules-engine/core/content` | Formato `ContentPack` e validação: ids, fontes declaradas, referências cruzadas e licença. |
| `rules-engine/core/prerequisites` | DSL recursiva de pré-requisitos, com mensagens para iniciantes e o indicador "cumprível no futuro". |
| `rules-engine/core/engine` | Contrato `RulesEngine`, `Catalog` isolado por sistema e `BaseEngine` com a validação comum. |
| `rules-engine/core/dice` | Parser e rolador: d4–d100, `kh`/`kl`, vantagem, detalhamento do cálculo. |
| `rules-engine/systems/*` | Regras específicas de cada sistema. |
| `ui` | Primitivos visuais reutilizáveis (botão, campo, abas, seletor...). Sem regra de negócio. |
| `web/server/auth` | Senhas com scrypt e sessões opacas no BD (o banco guarda só o hash do token). |
| `web/server/characters` | CRUD com permissão por recurso, controle de concorrência otimista, snapshots, restauração e auditoria. |
| `web/server/rulesets` | Sincronização dos motores com o BD e carregamento do catálogo por versão. |
| `web/app/app/personagens/[id]/relevance` | Ordena e filtra as opções pelas escolhas anteriores (classe, raça, origem, divindade). Só organiza a lista: quem decide a validade é o motor. |
| `web/scripts/import-content.ts` | Importação administrativa de pacotes, criando uma nova versão do catálogo. |

## 4. Banco de dados

Arquivo `prisma/schema.prisma` (raiz do monorepo). Principais entidades:

* `User`, `Session`: contas e sessões.
* `Ruleset` (id = id do motor), `RulesetVersion` (versão do pacote, `isCurrent`), `Sourcebook` (licença e atribuição).
* `ContentEntry`: tabela **genérica** com `kind` (classe, espécie, antecedente, talento, poder, magia, equipamento...),
  `prerequisites` e `data` em JSON validados pelo motor. Isso dispensa migrações por sistema. Foi um refinamento das
  entidades sugeridas (Class, Species, Spell...), que viraram valores de `kind`.
* `Character` (`data` JSON + `validation` + `revision`), `CharacterVersion` (snapshots imutáveis).
* `Campaign`, `CampaignMember` (papel gm/player), `CampaignEvent`, `GmApproval`.
* `DiceRoll`, `AuditLog`.
* `Avatar` (1 por personagem: `config` JSON + `assetsVersion` + `revision`), `AvatarRevision` (versões nomeadas,
  até 30), `AvatarPreset` (visuais do usuário, reaproveitáveis em qualquer personagem).

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
Avatar engine ──> Avatar Studio ──> Persistência e versões do avatar ──> Exportação PNG / token / retrato
       └──────────────────────────────> Aparência do equipamento (liga inventário → avatar, Fase 5)
Autenticação ──> Personagens ──> Campanhas ──> Aprovações do mestre / compartilhamento de rolagens
Versionamento do catálogo ──> Migração explícita de personagens
```

## 8. Avatar Studio

Rota `/app/personagens/[id]/avatar`. Implementado nas fases 2, 3 e 5.

* **Modelo:** `AvatarConfig` (zod, `packages/avatar-engine/src/model.ts`) é um JSON versionado, nunca só a imagem:
  tipo físico, cores globais (pele, cabelo, cada olho, chifres), uma peça por slot com cores próprias (principal,
  detalhes, metal, fundo) e ajustes permitidos (escala e altura, só onde o catálogo declara limites), além da versão
  do catálogo de peças. Cores só aceitam `#rrggbb`, o que impede injeção no SVG embutido.
* **Peças:** 73 SVG originais (decisão 10.2) em `assets/avatar/<categoria>/`, todos numa tela 512×768 com as mesmas
  âncoras (cabeça, tronco, pernas). As regiões recoloríveis são marcadores `#{regiao}` e `#{regiao-light|dark|deep|blush}`
  que o motor substitui. Isso simplifica o plano original de `data-region` e dá sombras automáticas por cor.
  `assets/avatar/catalog.json` traz slot, nome, camadas (uma peça pode ocupar várias, como cabelo de trás e franja),
  cores padrão, ajustes, peças que esconde e variantes (capuz com aberturas quando há chifres; penteado alto vira franja
  sob o capuz). `pnpm assets:build` valida tudo (cabeçalho, nada de script, evento ou link externo) e gera
  `src/generated/assets.ts`; um teste falha se o gerado estiver desatualizado.
* **Composição:** `compose()` é pura e testada: resolve 27 camadas na ordem de desenho, aplica variantes, esconde camadas,
  escala tronco e pernas conforme o tipo físico e prefixa ids internos. `composeSvg()` gera o SVG único usado no retrato
  da ficha, nas miniaturas e na lista; o renderizador PixiJS v8 rasteriza cada camada em 2× e reaproveita texturas.
* **Editor:** categorias com trava, miniaturas do próprio personagem para cada opção, cor por paleta, seletor livre ou
  hexadecimal, enquadramento corpo/busto/rosto, zoom e arraste, desfazer/refazer (Ctrl+Z, Ctrl+Shift+Z), randomização
  total ou por categoria respeitando travas (com ou sem traços fantásticos) e "Sugerir pela ficha", que monta a aparência
  pela raça e pela classe. Sem WebGL, o palco cai para o SVG composto.
* **Persistência:** a sugestão inicial só é gravada quando o usuário edita ou aceita. Depois, salvamento automático com
  concorrência otimista; versões nomeadas e restauração (o estado anterior vira nova versão); visuais salvos.
  Configurações antigas com peças removidas do catálogo abrem com o slot devolvido ao padrão.
* **Exportação:** PNG do corpo (1024×1536, com ou sem fundo), retrato 512×512, token circular e JSON (com importação).
* **Ficha:** o retrato aparece no círculo da ficha impressa e na lista de personagens; editor e ficha têm atalho para o
  estúdio. O mestre da campanha vê o avatar em modo leitura.
* **Asas, cauda e escudo:** slots próprios (asas e cauda atrás do corpo, escudo na frente do tronco), acompanhando o
  tipo físico. A sugestão pela ficha usa cauda e asas em raças como minotauro, sílfide, descendente abissal e troglodita.
* **Marcas:** até 8 por avatar (cicatrizes, sardas, tatuagem, runa, pintura de guerra), cada uma com posição, tamanho,
  rotação, opacidade, espelho no eixo do rosto e cor da tinta, todos com limites validados. Ficam no rosto, entre a
  boca e a barba; marcas no corpo esbarram nas roupas e ficaram de fora.
* **Equipamento:** "Vestir equipamento" lê os itens equipados na ficha (só nome e categoria) e escolhe armadura
  (couro, cota de malha ou placas), escudo (redondo ou heráldico), capa e trajes. É uma ação do usuário, não automática.
* **Exportação conjunta:** `/app/personagens/[id]/exportar` baixa `*.rpgforge.json` com a ficha, a versão do pacote
  de regras e o avatar.
* **Ainda não:** poses, armas desenhadas, marcas no corpo e importação do arquivo `.rpgforge.json`.

## 8.1. Ferramentas do mestre

Rota `/app/mestre`, com conteúdo do pacote Tormenta20 0.4.0 (novos tipos `creature`, `hazard` e `rule`):

* **Encontro:** soma ameaças e calcula o ND do combate pela regra do livro ("Vários Inimigos": abaixo de ND 1, ND ×
  quantidade; a partir de 1, +2 a cada vez que a quantidade dobra). Com ameaças diferentes o livro não traz fórmula;
  a tela mostra uma estimativa marcada com "≈". XP = ND × 1.000 por criatura, ½ no empate, ¼ na derrota, zero para
  ameaças 5 ou mais ND abaixo do nível do grupo. Funções puras em `packages/rules-engine/src/systems/tormenta20-gm.ts`,
  testadas com os exemplos do próprio livro.
* **Tesouro:** rolado no servidor com gerador criptográfico, nas Tabelas 8-2 em diante (vindas do pacote, não do código),
  com Padrão/Metade/Dobro/Nenhum tirado da ficha da criatura. Poções e itens mágicos indicam a tabela do livro, que o
  pacote ainda não estrutura.
* **Consulta:** 80 ameaças com filtro por ND e grupo, 41 perigos, regras do mestre e 33 condições, com busca e página
  do livro.

## 9. Plano incremental

Fases da especificação (seção 28), com a situação real do repositório:

| Fase | Entregas | Situação |
|---|---|---|
| **1. Fundação** | Monorepo pnpm, Next.js, banco, Prisma, autenticação, camada de servidor, design system, layout e dashboard. | **Concluída.** O monorepo foi criado nesta etapa; o resto já existia. Backend no Next (decisão 10.1). |
| 2. Avatar Studio básico | `packages/avatar-engine`, renderizador PixiJS, camadas, corpo-base, rosto, olhos, cabelo, pele, chifres, roupas, capuz, armadura e acessórios básicos em SVG. | **Concluída** (seção 8). |
| 3. Persistência do avatar | Salvamento, carregamento, randomização granular com travas, desfazer/refazer, predefinições, PNG, versões. | **Concluída.** Também exporta retrato, token e JSON. |
| 4. Criador inteligente de fichas | Etapas guiadas, validação, cálculos e salvamento. | **Em grande parte pronta** para Tormenta20 (2020): todas as etapas com seleção, filtro pelas escolhas anteriores, paginação, abas por disponibilidade e ficha imprimível. D&D 5e (2014 e 2024): catálogos do SRD importados e traduzidos (`content/dnd5e-*`, `pnpm srd:fetch`/`srd:build`). Faltam modos assistido e aleatório. |
| 5. Ficha + avatar | Vínculo, retrato na ficha, aparência do equipamento, exportação conjunta. | **Concluída** (armas ainda sem desenho). |
| 6. Editor visual avançado | Caudas, asas, texturas, cicatrizes, tatuagens, anatomias especiais, efeitos. | Parcial: asas, caudas, escudos e marcas do rosto. Faltam texturas, efeitos e poses. |
| 7. Progressão | Subida de nível, "Meu próximo nível", evolução visual. | Parcial: subida de nível em `/app/personagens/[id]/nivel` ("Meu próximo nível": valores que mudam, habilidades novas e decisões pendentes, com XP e versão no histórico), calculada por `levelUpPlan` no motor. Faltam multiclasse na subida, a tabela de progressão das classes do Tormenta20 e a evolução visual do avatar. |
| 8. Campanhas e mestre | Convites, permissões, regras opcionais, aprovações, eventos e recompensas. | Parcial: ferramentas do mestre em `/app/mestre` (seção 8.1) e campanhas em `/app/campanhas`: convite por link (`/convite/[código]`, funciona também para quem ainda não tem conta), entrada e vínculo de fichas sem aprovação (decisão do usuário em 23/11/2026), mestre vê as fichas, tira jogadores, gera link novo e exclui. Faltam regras opcionais por campanha, aprovações de homebrew e eventos/recompensas na interface. |
| 9. Assistente inteligente | Recomendações, análise, interpretação de descrições de avatar. | Parcial: retrato ilustrado por IA na página do avatar, a partir de uma descrição em texto e de um estilo. Provedores em `server/image-providers.ts`: Cloudflare Workers AI (FLUX.1 schnell, cota grátis diária) ou Gemini (pago; aceita o avatar desenhado como referência), escolhidos por `AI_PORTRAIT_PROVIDER` ou pelas credenciais presentes. Imagens no Vercel Blob privado, servidas por uma rota que confere permissão; limite diário por usuário (`AI_PORTRAIT_DAILY_LIMIT`), que não conta tentativas barradas pela cota do servidor. Sem provedor ou sem Blob, a página mostra só o editor manual. Ainda falta preencher o avatar desenhado a partir da descrição. |
| 10. Expansão | Sistemas adicionais, poses, tokens, desempenho, acessibilidade. | |

## 10. Decisões de arquitetura

### 10.1. Backend nas server actions do Next, sem NestJS por enquanto

A especificação sugere NestJS (`apps/api`). O app já tinha autenticação, permissões por recurso, versões, auditoria e
validação no servidor funcionando dentro do Next, com testes. Migrar tudo para uma API REST reescreveria código estável
sem ganho para o único cliente existente (seção 31: "não reescrever módulos estáveis sem necessidade"). A camada
`apps/web/src/server` já é isolada das páginas; se surgir outro cliente (app mobile, API pública, mesa virtual), ela é o
ponto de extração para `apps/api`. Decisão confirmada pelo usuário em 22/11/2026.

### 10.2. Peças do avatar em SVG desenhadas para o projeto

O projeto não tem ilustrações. As peças iniciais serão SVG vetoriais originais, estilizados e com regiões recoloríveis,
desenhados no próprio repositório. Não reproduzem personagens, interfaces ou arte de outros jogos. O formato de asset e
os metadados permitem trocar o conjunto por arte de ilustrador depois, sem mudar o modelo salvo. Decisão confirmada pelo
usuário em 22/11/2026.

### 10.3. Tormenta20: livro de 2020 (OGL), não a edição Jogo do Ano

O pacote cobre o livro básico de 2020, publicado sob a OGL 1.0a (seção 1). A edição Jogo do Ano não é suportada:
distribuir seu conteúdo exige verificar a licença dela e obter autorização (seção 26 da especificação).

### 10.4. Pacotes consumidos como código-fonte

Os pacotes do workspace exportam TypeScript diretamente (`exports` apontando para `src/`). O Next transpila pacotes
do workspace automaticamente, e o Vitest e o `tsx` leem TypeScript. Isso evita etapas de build por pacote enquanto
houver um único app.

## 11. Critérios do MVP (seção 29)

| # | Critério | Situação |
|---|---|---|
| 1–2 | Criar conta e entrar | Pronto |
| 3 | Criar um personagem | Pronto |
| 4–6 | Corpo-base; pele, olhos, cabelo e rosto; chifres, roupas, capuz, armadura e acessórios | Pronto |
| 7 | Randomizar elementos específicos do avatar | Pronto (por categoria, com travas) |
| 8–10 | Salvar, reabrir e exportar o avatar em PNG | Pronto |
| 11 | Criar uma ficha inicial com o primeiro sistema de regras | Pronto (Tormenta20 2020) |
| 12 | Alertas de escolhas inválidas | Pronto |
| 13 | Vincular ficha e avatar | Pronto (retrato na ficha impressa e no dashboard) |
| 14 | Salvar e consultar o personagem pelo dashboard | Pronto |

## 12. Registro de progresso

| Data | Etapa |
|---|---|
| 22/11/2026 | Seleção paginada e filtrada pelas escolhas anteriores (poderes, magias, perícias e equipamento), com abas Disponíveis / Futuras / Indisponíveis / Escolhidas. |
| 22/11/2026 | Fase 1 da nova especificação: monorepo pnpm (`apps/web`, `packages/rules-engine`, `packages/ui`, `packages/config`), lint e testes unificados na raiz, `.env` compartilhado. Correção: validade da sessão avaliada só na requisição (`connection()`). |
| 22/11/2026 | Fases 2 e 3 e parte da 5: Avatar Studio com 58 peças SVG originais, `packages/avatar-engine` (composição, randomização com travas, histórico, sugestão pela ficha, renderizador PixiJS), tabelas `Avatar`/`AvatarRevision`/`AvatarPreset`, salvamento automático, versões, visuais, exportação PNG/retrato/token/JSON e retrato na ficha e no dashboard. Critérios 1–14 do MVP atendidos. |
| 22/11/2026 | Fase 6 (parcial) e fim da fase 5: asas, caudas, escudos e marcas do rosto (catálogo 1.1.0, 73 peças), "Vestir equipamento" e exportação conjunta ficha + avatar. Ferramentas do mestre: pacote Tormenta20 0.4.0 com ameaças, perigos e regras; cálculo de ND do combate e XP; tesouro pelas tabelas do livro. |
