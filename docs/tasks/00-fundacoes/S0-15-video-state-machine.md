---
id: S0-15
titulo: "Máquina de estados do vídeo: módulo domain + unit tests"
sprint: 0
prioridade: P0
depende_de: ["S0-06"]
estimativa_h: 2
status: todo
---

# S0-15 — Máquina de estados do vídeo (domain)

## Objetivo

Codificar a máquina canônica do ROADMAP em `backend/internal/domain/videostate`: enum dos
12 estados + `blocked`, tabela de transições válidas, `Transition(from,to)` com erro
tipado e testes exaustivos — daqui pra frente **toda** mudança de status passa aqui (T-08).

## Contexto

Fonte: `ROADMAP.md → Máquina de estados` (cadeia linear new→…→released; qualquer estado →
blocked com motivo; retomável). O enum proto `VideoStatus` (S0-04) é o contrato na rede;
este pacote é a verdade executável. O banco guarda texto (S0-06) — constraint de valores
entra agora para as duas pontas falarem igual.

## Pré-requisitos

- S0-06 done (tabela videos existe; migração nova pode ser aplicada).

## Passos

1. Criar `backend/internal/domain/videostate/state.go`: `type State string` + constantes
   `StateNew…StateReleased`, `StateBlocked` com os valores exatos do ROADMAP (`new`,
   `script_pending`, `script_review`, `script_approved`, `recording`, `voice_processing`,
   `scenes_pending`, `scenes_review`, `queued`, `rendering`, `final_review`, `released`,
   `blocked`).
2. Criar `transitions.go`: `map[State][]State` com a cadeia linear canônica +
   `X → blocked` para todo X + `blocked → qualquer estado` (retomada decide o destino;
   registrado nas Notas).
3. API pura: `All() []State` (ordem canônica), `Parse(string) (State, error)`,
   `CanTransition(from, to) bool`, `Transition(from, to) error` retornando
   `*TransitionError{From, To}` amigável a `errors.As`.
4. Migração `0003_video_status_check.up.sql`: `ALTER TABLE videos ADD CONSTRAINT
   videos_status_valid CHECK (status IN ('new', …, 'released', 'blocked'))`.
5. Teste exaustivo `state_test.go`: laço 13×13 afirmando que só pares legais passam
   (12 arestas da cadeia + 12→blocked + blocked→qualquer); Parse dos 13 valores e de lixo;
   erro tipado preserva From/To.
6. Teste de sincronia com proto: nomes de `studiov1.VideoStatus` (sem prefixo
   `VIDEO_STATUS_`) ≡ `All()` 1:1 — impede drift entre contrato e domínio.

## Critérios de aceite

- [ ] Transição ilegal retorna erro tipado (nunca panic, nunca string mágica)
- [ ] Teste 13×13 exaustivo verde, gerado por laço (não copiado à mão)
- [ ] Constraint no PG ativa: INSERT/UPDATE com status inválido falha
- [ ] Enum proto e domínio provadamente sincronizados pelo teste

## Verificação

```bash
npm run check
cd backend && go test ./internal/domain/videostate/...
docker compose exec postgres psql -U guigas -d guigas_studio -c "insert into videos (slug,title,status) values ('x','X','zzz');"   # deve falhar com violation
```

## Notas

- Nenhum service escreve `videos.status` direto: passagem obrigatória por `videostate`;
  revisões futuras devem achar apenas uma rota de UPDATE de status nas queries.
- `blocked → qualquer estado` é escolha deliberada de simplicidade: quem retoma sabe onde
  retomar; apertar para "voltar ao estado de origem" exige guardar origem — YAGNI agora.
- Pacote 100% puro (sem pgx/proto nos arquivos centrais); só o teste de sync importa proto.
