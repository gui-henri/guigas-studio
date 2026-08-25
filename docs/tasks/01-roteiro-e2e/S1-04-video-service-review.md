---
id: S1-04
titulo: "VideoService completo: detalhe, UpdateScript, Approve/Reject"
sprint: 1
prioridade: P0
depende_de: [S1-02, S0-15]
estimativa_h: 2
status: todo
---

# S1-04 — VideoService: revisão de roteiro via RPC

## Objetivo

Expandir o VideoService básico (S0-04) para sustentar a revisão humana do roteiro:
`GetVideo` detalhado (script parsed + artefatos + histórico), `UpdateScript` (edição
estruturada da UI, validada antes de gravar no FS e commitar no git do workspace — T-07),
`ApproveScript` (`script_review → script_approved`) e `RejectScript` (volta para
`script_pending` com comentário estruturado). Fecha o trecho
`script_pending → script_approved` da máquina de estados.

## Contexto

Handlers em `backend/internal/services/video_service.go`; validação reutiliza
`artifacts.ValidateScript` (S1-02); transições exclusivamente via
`backend/internal/domain/videostate` (S0-15, T-08); auth de usuário já garantida pelo
interceptor Connect (S0-08, D-04). A UI que consome estes RPCs nasce em S1-06/S1-07.

## Pré-requisitos

- S1-02 e S0-15 `done`; S1-03 recomendado (sem ele os RPCs funcionam, mas o observador
  ainda não reage a arquivos escritos pela UI).
- Postgres de teste do compose (S0-05) para os testes de integração (D-18).

## Passos

1. Estender o proto do serviço (`proto/app/studio/v1/`): `GetVideoResponse` ganha
   `script` (`StudioScript`), `original_script` (primeira versão validada — base do diff
   da S1-06), `artifacts` (presença de `script.json`, `audio/`, `timelines/`,
   `renders/`) e `status_history` (repeated `StatusChange{status, reason, actor,
   changed_at}`); novas RPCs `UpdateScript(video_id, script)`,
   `ApproveScript(video_id)`, `RejectScript(video_id, comment)`. Rodar `npm run gen`.
2. Queries sqlc novas em `backend/internal/database/queries/`: histórico de status
   (reusar tabela da S0-15/S0-06; migração incremental só se faltar coluna
   `reason`/`actor`/`comment`) e coluna `original_script` (jsonb) em `videos`.
3. `GetVideo`: ler `script.json` do workspace (protojson), checar presença de artefatos
   no disco e montar histórico a partir do PG.
4. `UpdateScript`: exigir estado `script_review` (senão `FailedPrecondition`) →
   `ValidateScript` → gravação atômica (tmp+rename) → commit no git do workspace
   (T-07, mensagem `feat(<slug>): update script via ui`) → responder com o script
   revalidado; erros de validação voltam estruturados na resposta.
5. `ApproveScript`: extrair usuário autenticado do contexto (S0-08), transicionar
   `script_review → script_approved` via videostate registrando o actor no histórico.
   `RejectScript`: transicionar de volta para `script_pending` persistindo o `comment`.
6. Gancho no observador (S1-03): na primeira validação bem-sucedida de um vídeo,
   persistir `original_script` (query `SetOriginalScript` se coluna vazia).
7. Testes de integração com PG de teste: ciclo completo
   `script_pending → script_review → UpdateScript → ApproveScript`, além de reject com
   comentário aparecendo no histórico e UpdateScript fora de estado válido falhando.

## Critérios de aceite

- [ ] `GetVideo` retorna script parsed, artefatos presentes, histórico e `original_script`
- [ ] `UpdateScript` grava `script.json` + commit no git do workspace; script inválido é
      rejeitado com erros claros e nada é escrito
- [ ] `ApproveScript` exige usuário autenticado e só opera em `script_review`
- [ ] `RejectScript` retorna a `script_pending` e o comentário aparece no `GetVideo`
- [ ] Transições somente via videostate; testes de integração verdes (D-18)

## Verificação

```bash
npm run check
cd backend && sqlc vet && go test ./internal/services/... ./internal/domain/videostate/...
```

## Notas

- `UpdateScript` dispara o observador (o arquivo mudou) — inofensivo: revalida, registra
  e nenhuma transição nova ocorre (S1-03 passo 6).
- Não permitir `UpdateScript` em `script_approved`: reabrir roteiro é sempre
  `RejectScript` — fluxo único e auditável no histórico.
- Gravação atômica evita o observador ler arquivo parcial (o debounce cobre, mas não
  custa acertar na origem).
- Git do workspace: usar `user.name`/`user.email` locais "Studio Server"; se o commit
  falhar (repo ausente), retornar erro interno claro — não gravar sem versionar (T-07).
