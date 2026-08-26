---
id: S4-10
titulo: "Guia operacional: gerando cenas com OpenCode"
sprint: 4
prioridade: P1
depende_de: [S4-07]
estimativa_h: 1
status: done
---

# S4-10 — Guia operacional "gerando cenas com OpenCode"

## Objetivo

Escrever `docs/guides/opencode-scenes.md`: guia operacional do fluxo de cenas via SSH
(D-14) — como abrir a sessão, pedir cenas, interpretar os erros de validação e iterar
conversacionalmente até todos os cards serem aprovados na UI. O ENTREGÁVEL é o documento.

## Contexto

Par operacional da S4-07 (que implementa o mecanismo) e espelho da S1-09 (guia de
roteiro). Público: você mesmo/agente rodando o Studio meses depois. O guia NÃO duplica a
gramática — aponta para o catálogo (`docs/guides/scene-catalog.md`, S4-01) e para o
AGENTS.md gerado no workspace.

## Pré-requisitos

- S4-07 integrado: AGENTS.md com seção "Cenas", observador validando,
  `.validation-latest.json` como canal de erro.
- Fluxo executável ponta a ponta num vídeo fixture ou real em `scenes_pending`.

## Passos

1. Criar `docs/guides/opencode-scenes.md` com as seções fixas:
   **Pré-requisitos** (vídeo em `scenes_pending`; SSH na VPS; sessão dentro de
   `/data/videos/<slug>/`), **Abrindo a sessão**, **Pedindo cenas**, **Corrigindo por
   iteração**, **Entregando pra review**, **Checklist final**.
2. Incluir ≥3 exemplos de prompt completos e copiáveis: (a) gerar 1 cena específica —
   ex. "gere a cena diff para o segmento X seguindo o catálogo"; (b) gerar em lote por
   beat ("gere as cenas de todos os segments com beat example, deixe hook/cta null");
   (c) corrigir a partir do erro — prompt que cola o conteúdo de `.validation-latest.json`.
3. Escrever tabela de erros comuns → correção esperada: prop ausente, `type` inválido
   (fora dos 7), prop extra/CSS livre proibido, texto excedendo limite, id de nó órfão.
4. Descrever o ciclo completo: escrever → observador valida em segundos → ler relatório
   se falhou → corrigir → conferir card em `scenes_review` na UI (S4-08) → comentários
   de reprovação voltam como novo prompt.
5. Validar o guia executando o fluxo uma vez seguindo-o ao pé da letra; ajustar o texto
   em todo ponto onde travar (o guia deve funcionar sem contexto extra).

## Critérios de aceite

- [x] Guia cobre a sessão inteira sem sair do documento (6 seções fixas)
- [x] 3 prompts copiáveis (cena única, lote por beat, correção colando o relatório)
- [x] Tabela de erros comuns alinhada às mensagens reais do validador Go (required/unrecognized/unknown type/array vazio/aresta órfã)
- [x] Links para scene-catalog.md e AGENTS.md; zero duplicação da gramática
- [x] Ciclo mecânico validado ponta a ponta pelo teste de integração da S4-07 (escrita→validação→transição/relatório); sessão OpenCode real na VPS segue o mesmo padrão da S1-09 e acontece na máquina real

## Verificação

```bash
npm run check
ls docs/guides/opencode-scenes.md
grep -c "^## " docs/guides/opencode-scenes.md   # ≥ 6 seções fixas
grep -c '```' docs/guides/opencode-scenes.md    # blocos de prompt/comandos presentes
```

## Notas

- Manter curto e operacional: teoria vive no catálogo/DECISIONS; este doc é runbook.
- Qualquer mudança futura no contrato do fluxo (nome do arquivo de validação, estados)
  exige atualização deste guia E da S4-07 no mesmo commit — o guia mente rápido.
- Se um erro real durante a S6 aparecer que não está na tabela, adicionar ali na hora
  (parte do log de atrito da S6-05).
