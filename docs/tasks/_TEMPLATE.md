---
id: S?-??
titulo: "<título curto e imperativo>"
sprint: 0
prioridade: P0
depende_de: []
estimativa_h: 2
status: todo
---

# S?-?? — <título>

## Objetivo

1–3 frases: o que existe ao final desta tarefa que não existia antes, e por que importa
para o pipeline (referenciar estágio da máquina de estados quando aplicável).

## Contexto

Onde esta tarefa se encaixa. Referências: `SPEC.md §x`, `docs/DECISIONS.md D-xx/T-xx`,
arquivos/módulos já existentes que serão tocados. O agente **não deve** precisar de
contexto fora do repo.

## Pré-requisitos

- Dependências com `status: done` (listadas no frontmatter).
- Variáveis de ambiente / credenciais necessárias (ex.: `JWT_SECRET`), se houver.
- Ferramentas locais exigidas (go ≥1.22, node ≥22, buf, sqlc…), se houver.

## Passos

1. Passo concreto e verificável (crie arquivo X com responsabilidade Y).
2. Passo seguinte…
3. …cada passo deve ser pequeno o bastante para virar um commit coeso.

**Convenções**: código/identificadores/comentários em EN; docs em PT-BR; seguir padrões
do blueprint (`architecture-guide.md`) para estrutura Go/proto/frontend.

## Critérios de aceite

- [ ] Condição observável 1
- [ ] Condição observável 2
- [ ] Testes escritos/atualizados cobrindo o comportamento novo (quando aplicável — D-18)

## Verificação

```bash
# Comandos objetivos que provam a tarefa pronta + verificações globais:
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
```

## Notas

- Armadilhas conhecidas, decisões relevantes, links externos confiáveis.
- O que fazer se algo divergir (ex.: "se X falhar na VPS, verificar Y").
