# RPG Forge

Plataforma para criar, validar e evoluir personagens de RPG de mesa: D&D 5e (2014), D&D 5e revisado (2024) e
Tormenta20 (livro básico de 2020, sob OGL 1.0a), com um Avatar Studio 2D por camadas para a aparência de cada
personagem e ferramentas do mestre (encontros, experiência, tesouro e consulta de ameaças). Arquitetura, decisões e plano de fases estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

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
pnpm dev                      # http://localhost:3000
```

## Scripts (na raiz)

| Comando | Descrição |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Servidor de desenvolvimento, build e produção do app web |
| `pnpm dev:clean` | Encerra servidores Next antigos deste projeto (só deste) e sobe o de desenvolvimento |
| `pnpm preview` | Build e servidor de produção: usa bem menos memória para só usar o app |
| `pnpm test` | Testes de todos os pacotes (Vitest: `apps/web`, `packages/rules-engine` e `packages/avatar-engine`) |
| `pnpm typecheck` | Verificação de tipos em todos os pacotes |
| `pnpm lint` | ESLint em todo o monorepo |
| `pnpm content:import pacote.json [--dry-run]` | Valida e importa um pacote de conteúdo (JSON ou módulo `.ts`) como nova versão do catálogo |
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
Postgres vazio, valida o pacote de conteúdo e roda `typecheck`, `lint`, `test` e `build`.

## Segurança do login

Login e cadastro têm limite de tentativas (5 falhas por e-mail e 20 por IP a cada 15 minutos; 5 cadastros por IP
por hora). As tentativas ficam no `AuditLog` só como hash, nunca com o e-mail ou o IP em texto.
