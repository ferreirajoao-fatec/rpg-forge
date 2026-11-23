# RPG Forge

Plataforma para criar, validar e evoluir personagens de RPG de mesa: D&D 5e (2014), D&D 5e revisado (2024) e
Tormenta20 (livro básico de 2020, sob OGL 1.0a, exibido como "Fantasia d20 (2020)"). Inclui:

* **Ficha guiada por etapas**, com validação de regras em tempo real (limites de perícias e poderes por nível,
  pré-requisitos, inventário) e ficha imprimível.
* **Subida de nível** ("Meu próximo nível"): o que muda, habilidades novas e decisões pendentes, com versão no histórico.
* **Avatar Studio 2D** por camadas e **retrato ilustrado por IA** (corpo inteiro, com o equipamento equipado na ficha).
* **Campanhas** com convite por link e **ferramentas do mestre** (encontros, experiência, tesouro e consulta de ameaças).

Arquitetura, decisões e plano de fases estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Requisitos

* Node.js 22+ (testado com 24) e pnpm 9 (`corepack enable` ativa a versão do `packageManager`)
* PostgreSQL: `pnpm db:up` sobe o do `docker-compose.yml` (porta 5433)

## Como rodar

```bash
pnpm install                  # instala tudo e gera o Prisma Client
cp .env.example .env          # ajuste DATABASE_URL (o .env fica na raiz e vale para todo o monorepo)
pnpm db:up                    # Postgres no Docker
pnpm db:migrate               # aplica as migrações
pnpm content:import content/tormenta20-2020/pack.ts   # importa o catálogo do Tormenta20 (2020)
pnpm content:import content/dnd5e-2014/pack.ts         # e os do D&D 5e (SRD 5.1 e 5.2.1), se for usar
pnpm content:import content/dnd5e-2024/pack.ts
pnpm dev                      # http://localhost:3000
```

### Retrato com IA (opcional)

Sem estas variáveis, a página do avatar mostra só o editor manual. Detalhes em `.env.example`.

| Variável | Para quê |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI (FLUX.1 schnell): cota grátis diária. Token com a permissão "Workers AI". |
| `GEMINI_API_KEY` | Alternativa paga: a API do Gemini não gera imagens no plano gratuito. Aceita o avatar desenhado como referência. |
| `AI_PORTRAIT_PROVIDER` | `cloudflare` ou `gemini`. Sem ela, usa o primeiro configurado (Cloudflare, depois Gemini). |
| `BLOB_STORE_ID` ou `BLOB_READ_WRITE_TOKEN` | Vercel Blob privado onde as imagens ficam. Na Vercel, o store conectado usa OIDC (`BLOB_STORE_ID`). |
| `AI_PORTRAIT_DAILY_LIMIT` | Gerações por usuário a cada 24 h (padrão 10). |

## Scripts (na raiz)

| Comando | Descrição |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Servidor de desenvolvimento, build e produção do app web |
| `pnpm dev:clean` | Encerra servidores Next antigos deste projeto (só deste) e sobe o de desenvolvimento |
| `pnpm preview` | Build e servidor de produção: usa bem menos memória para só usar o app |
| `pnpm test:e2e` | Testes de tela (Playwright) contra o build: rode `pnpm build` antes. Cria e apaga uma conta `e2e-…@rpgforge.test` |
| `pnpm db:cleanup [--dry-run]` | Apaga sessões vencidas e tentativas de login/cadastro com mais de 1 dia |
| `pnpm test` | Testes de todos os pacotes (Vitest: `apps/web`, `packages/rules-engine` e `packages/avatar-engine`) |
| `pnpm typecheck` | Verificação de tipos em todos os pacotes |
| `pnpm lint` | ESLint em todo o monorepo |
| `pnpm content:import pacote.json [--dry-run]` | Valida e importa um pacote de conteúdo (JSON ou módulo `.ts`) como nova versão do catálogo |
| `pnpm srd:fetch` / `pnpm srd:build` | Baixa o SRD do D&D 5e (5e-database, commit fixado) e regera `content/dnd5e-*` traduzido |
| `pnpm assets:build` | Valida `assets/avatar` (SVG e `catalog.json`) e regera o módulo de peças do avatar. Rode após editar as peças |
| `python scripts/tormenta20/extract.py "Tormenta 20.pdf"` | Regera `content/tormenta20-2020/data/` a partir do seu PDF do livro (Python 3.11+ e PyMuPDF) |

## Estrutura

```
apps/web/                 app Next.js (rotas, server actions, camada de servidor, componentes do app)
packages/rules-engine/    motor de regras puro (sem React, Next ou BD), testável isoladamente
packages/avatar-engine/   avatar: modelo, catálogo, composição, randomização, histórico e renderizador PixiJS
packages/ui/              componentes de interface reutilizáveis (shadcn/ui)
packages/config/          tsconfig base compartilhado
prisma/                   schema e migrações
assets/avatar/            peças SVG originais do avatar e o catálogo com seus metadados
content/                  pacotes de conteúdo com licença aberta (cada pasta traz sua licença)
scripts/tormenta20/       extrator do PDF do usuário (o PDF nunca entra no repositório)
docs/                     arquitetura, decisões, plano de fases e registro de progresso
```

## Licenças de conteúdo

Inclui material do System Reference Document 5.1 e 5.2.1 da Wizards of the Coast LLC, licenciado sob
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

Inclui Conteúdo Open Game do Tormenta20 (Jambô Editora, 2020), sob a Open Game License 1.0a. O texto da licença,
o aviso de copyright e a identificação do Conteúdo Open Game estão em `content/tormenta20-2020/LICENSE-OGL.txt`.
Nenhuma Identidade do Produto é distribuída: veja `docs/ARQUITETURA.md`.

## Integração contínua

`.github/workflows/ci.yml` roda a cada push na `main` e em pull requests: instala, aplica as migrações num
Postgres vazio, importa o pacote de conteúdo e roda `typecheck`, `lint`, `test`, `build` e os testes de tela
(login, personagem, ficha e limite de poderes, avatar, mestre, subida de nível e campanha com convite). Quando um
teste de tela falha, o rastro fica nos artefatos da execução.

## Segurança do login

Login e cadastro têm limite de tentativas (5 falhas por e-mail e 20 por IP a cada 15 minutos; 5 cadastros por IP
por hora). As tentativas ficam no `AuditLog` só como hash, nunca com o e-mail ou o IP em texto.

## Hospedagem

* **Site:** https://rpg-forge-omega.vercel.app (Vercel, plano Hobby, região São Paulo, pasta `apps/web`).
* **Banco:** Postgres no Neon (plano grátis, São Paulo), criado pelo Marketplace da Vercel, que injeta o `DATABASE_URL`.
* **Imagens:** Vercel Blob privado (`rpg-forge-blob`), conectado por OIDC. Os retratos passam pela rota
  `/app/personagens/[id]/retrato/[portraitId]`, que só entrega ao dono ou ao mestre da campanha.
* **IA de imagem:** Cloudflare Workers AI (`CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`, Sensitive, só em Production).
  Erros da geração aparecem nos logs da Vercel com o prefixo `[portraits]`.
* **Deploy:** automático a cada push na `main`; cada pull request ganha um link de pré-visualização.
* **Mudanças no banco de produção** são manuais e vêm **antes** do merge do PR que as usa:
  `vercel env pull .env.production.local --environment=production` e, com o `DATABASE_URL_UNPOOLED` desse arquivo,
  `pnpm exec prisma migrate deploy` (novas migrações) e `pnpm content:import ...` (novo pacote). Apague o arquivo
  depois: ele contém os segredos de produção.
* **Testar o site publicado:** `PLAYWRIGHT_BASE_URL=https://rpg-forge-omega.vercel.app pnpm test:e2e`, com o
  `DATABASE_URL` de produção no ambiente para a limpeza apagar a conta de teste.
* A página `/licenca` traz o texto da OGL, obrigatório ao publicar o conteúdo do livro.

