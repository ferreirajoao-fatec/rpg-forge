# RPG Forge

Plataforma para criar, validar e evoluir personagens de RPG de mesa: D&D 5e (2014), D&D 5e revisado (2024) e
Tormenta20 (livro básico de 2020, sob OGL 1.0a). Arquitetura, decisões e plano de fases estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Requisitos

* Node.js 22+ (testado com 24)
* PostgreSQL: use `npm run db:dev` (Prisma Postgres local, sem Docker) ou `docker compose up -d`

## Como rodar

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL
npm run db:dev                # sobe o Postgres local em segundo plano (ou: docker compose up -d)
npm run db:migrate            # aplica as migrações
npm run dev                   # http://localhost:3000
```

Para desligar o banco local: `npx prisma dev stop rpg-forge` (ou `docker compose down`).

## Scripts

| Comando | Descrição |
|---|---|
| `npm test` | Testes do motor de regras e dos dados (Vitest) |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm run build` | Build de produção |
| `npm run content:import -- pacote.json [--dry-run]` | Valida e importa um pacote de conteúdo (JSON ou módulo `.ts`) como nova versão do catálogo |
| `npm run content:import -- content/tormenta20-2020/pack.ts` | Importa o pacote Open Game do Tormenta20 (2020) |
| `python scripts/tormenta20/extract.py "Tormenta 20.pdf"` | Regera `content/tormenta20-2020/data/` a partir do seu PDF do livro (Python 3.11+ e PyMuPDF) |

## Estrutura

```
src/rules/      motor de regras puro (sem React, Next ou BD), testável isoladamente
src/server/     autenticação, acesso a dados, permissões
src/app/        rotas (App Router) e server actions
src/components/ UI reutilizável (shadcn/ui)
prisma/         schema e migrações
scripts/        importação de conteúdo
content/        pacotes de conteúdo com licença aberta (cada pasta traz sua licença)
```

## Licenças de conteúdo

Inclui material do System Reference Document 5.1 e 5.2.1 da Wizards of the Coast LLC, licenciado sob
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

Inclui Conteúdo Open Game do Tormenta20 (Jambô Editora, 2020), sob a Open Game License 1.0a. O texto da licença,
o aviso de copyright e a identificação do Conteúdo Open Game estão em `content/tormenta20-2020/LICENSE-OGL.txt`.
Nenhuma Identidade do Produto é distribuída: veja `docs/ARQUITETURA.md`.
