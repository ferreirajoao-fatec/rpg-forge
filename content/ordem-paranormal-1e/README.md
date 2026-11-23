# Pacote de conteúdo — Ordem Paranormal RPG

Este pacote reúne o conteúdo extraído localmente dos seus PDFs de:
- **Ordem Paranormal RPG — Livro de Regras (v1.1)**
- **Ordem Paranormal RPG — Sobrevivendo ao Horror (v1.3.1)** (opcional)

## Como regerar a partir dos PDFs

```bash
python scripts/ordem-paranormal/extract.py "caminho/ordem-paranormal-rpg-v1-1.pdf" "caminho/sobrevivendo-ao-horror-v1-3-1.pdf"
```

## Como importar no banco do RPG Forge

```bash
pnpm content:import content/ordem-paranormal-1e/pack.ts
```

## Aviso de direitos autorais

**Ordem Paranormal RPG** é uma obra protegida por direitos autorais (Jambô Editora / Cellbit) e não possui licença aberta (OGL/CC).
Não redistribua os PDFs nem os JSON extraídos em `content/ordem-paranormal-1e/data/` em repositórios públicos sem autorização dos detentores dos direitos.
