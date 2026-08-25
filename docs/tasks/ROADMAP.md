# Guigas Studio — ROADMAP de Construção (v1)

> Índice mestre das tarefas que levam o projeto do repo vazio ao critério de pronto do
> `SPEC.md` §7: **1 vídeo real publicado no YouTube + ≥3 shorts, produzido só com o Studio,
> acompanhado inteiramente pelo dashboard**.
>
> Executor-alvo: agente de software trabalhando autonomamente. Decisões de fundo em
> [`../DECISIONS.md`](../DECISIONS.md). Formato de cada tarefa em [`_TEMPLATE.md`](../tasks/_TEMPLATE.md).

---

## Como usar este roadmap (agente executor)

1. `git pull` antes de tudo; trabalhe **direto na main** (trunk-based).
2. Escolha a próxima tarefa: **status `todo`**, dependências todas `done`, menor ID primeiro
   dentro da maior prioridade disponível (P0 > P1 > P2 > P3).
3. Abra o arquivo da tarefa e siga **Passos** na ordem. Não pule etapas.
4. Rode as verificações globais (abaixo) + as específicas da tarefa. Só siga adiante com tudo verde.
5. Commits convencionais por unidade coesa: `feat(S0-03): ...`, `fix(S2-01): ...`, `chore: ...`.
6. Ao concluir: marque checklist de aceite, atualize `status: done` no frontmatter e committe.
7. Bloqueado há mais de ~15 min? Marque `status: blocked` com nota explicando o impedimento
   e **pare** — não invente decisões de arquitetura.
8. Nunca commite binários grandes (`.wav`, `.mp4`), `.env`, segredos ou conteúdo gerado em runtime.

### Verificações globais (obrigatórias antes de qualquer `done`)

```bash
buf lint                                              # contratos proto
cd backend && sqlc vet && go vet ./... && go build ./... && go test ./...
npm run lint --workspaces --if-present                # frontend / remotion-kit / runner
npm run build --workspaces --if-present               # typecheck + build TS
```

Scripts raiz equivalentes são criados na S0-02 (`npm run check`). CI roda o mesmo conjunto (S0-14).

---

## Referência rápida

### Árvore do monorepo

```text
guigas-studio/
├── proto/                  # contratos buf (app/studio/v1) — fonte de verdade das APIs
├── backend/                # Go: cmd/api, internal/{config,database,middleware,services,...}
│   └── internal/database/{migrations,queries,sqlc}/
├── frontend/               # React/Vite SPA (dashboard) — importa remotion-kit p/ <Player>
├── remotion-kit/           # componentes de cena + composições (preview e render final)
├── runner/                 # daemon local Node/TS: consome fila, roda renderMedia, sobe MP4
├── docs/
│   ├── DECISIONS.md        # ADRs do grill de fundação
│   └── tasks/              # este roadmap + 1 arquivo por tarefa
├── docker-compose.yml      # dev: postgres + api + caddy
├── docker-compose.prod.yml # prod VPS: idem, com TLS pelo domínio
└── package.json            # npm workspaces (frontend, remotion-kit, runner)
```

### Máquina de estados do vídeo (canônica)

```text
new → script_pending → script_review → script_approved → recording
    → voice_processing → scenes_pending → scenes_review → queued
    → rendering → final_review → released

Falhas: qualquer estado → blocked (com motivo estruturado); retomável pela UI/agente.
Re-render após reprovação: aresta reversa final_review → queued (adicionada ao módulo na S5-07).
Transições válidas são codificadas em backend/internal/domain/videostate (S0-15) — nunca inline.
```

| Estado | Significado | Gatilho da transição |
| --- | --- | --- |
| `new` | watcher detectou post | watcher RSS (S0-16) |
| `script_pending` | context pack pronto, aguardando OpenCode | geração do workspace (S1-01) |
| `script_review` | `script.json` válido detectado | observador de artefatos (S1-03) |
| `script_approved` | humano aprovou na UI | ApproveScript RPC (S1-04) |
| `recording` | estúdio web em uso | primeira take salva (S2-01/S2-07) |
| `voice_processing` | todos os segmentos gravados; transcrição+visemes rodando | concat concluída (S2-09) |
| `scenes_pending` | timelines prontas; cenas ainda não geradas | pipeline de voz ok (S3-04) |
| `scenes_review` | cenas escritas pelo OpenCode, válidas | observador (S4-07) |
| `queued` | humano aprovou cenas; job de render enfileirado | aprovação de cenas (S5-01) |
| `rendering` | runner local renderizando | runner claim + progresso (S5-02) |
| `final_review` | MP4s no servidor, aguardando validação humana | upload verificado (S5-07) |
| `released` | checklist de lançamento marcado completo | UI (S5-11) |

### Workspace canônico de vídeo (`/data/videos/<slug>/`, git próprio — T-07)

```text
videos/<slug>/
├── context/            # post.md, linked/*.md, method/*.md, AGENTS.md  ← context pack
├── script.json         # FONTE DA VERDADE (schema StudioScript, proto)
├── audio/              # <segment-id>.wav + <segment-id>.blendshapes.json  (gitignored)
├── timelines/          # <segment-id>.timeline.json, subtitles.en.json
├── assets/             # sprite sheet efetiva, trilha escolhida
├── renders/            # long.mp4, short-N.mp4  (gitignored)
└── releases/
    ├── youtube/        # video.mp4, thumbnail.jpg, metadata.json (título/descrição)
    ├── shorts/short-N/ # video.mp4 + copy
    ├── x/thread.md
    ├── linkedin/post.md
    └── instagram/caption.txt
```

### Prioridades

| Nível | Significado |
| --- | --- |
| **P0** | Caminho crítico do E2E — v1 não existe sem isso |
| **P1** | Necessário para a v1 completa, mas paralelizável/cortável com dor |
| **P2** | Qualidade/robustez/conforto — vira backlog se o cronograma apertar |
| **P3** | Opcional / adjacente ao pós-v1 |

---

## Sprint 0 — Fundações (~30 h estimadas · SPEC: 20 h)

> Repo, toolchain, auth+JWT, deploy TLS na VPS, domínio de vídeos + máquina de estados,
> watcher RSS núcleo, sprite placeholder, CI. A listagem mínima de vídeos (RPC) faz parte
> do escopo proto da S0-04.

| ID | Tarefa | P | Depende de | h |
| --- | --- | --- | --- | --- |
| S0-01 | Esqueleto do monorepo + npm workspaces + .gitignore de binários | P0 | — | 1 |
| S0-02 | Toolchain raiz: scripts npm cross-platform (`gen`, `check`, `build`) | P0 | S0-01 | 1 |
| S0-03 | Backend Go skeleton: cmd/api h2c + config env + logging | P0 | S0-01 | 2 |
| S0-04 | Buf setup + proto `studio.v1` núcleo (health/auth/videos) + codegen Go/TS | P0 | S0-02, S0-03 | 2 |
| S0-05 | Compose dev (postgres + api + caddy) + `.env.example` | P0 | S0-03 | 2 |
| S0-06 | Migrações SQL embutidas + pgx pool + sqlc.yaml + queries base | P0 | S0-05 | 2 |
| S0-07 | Auth: seed conta única via env + login RPC → JWT + testes | P0 | S0-04, S0-06 | 2 |
| S0-08 | Interceptor Connect de auth (Bearer) + rotas públicas/privadas | P0 | S0-07 | 1 |
| S0-09 | Frontend scaffold: Vite+React+TS+Tailwind + transport/query providers | P0 | S0-04 | 2 |
| S0-10 | Login page + AuthContext + route guard (401→login) | P0 | S0-08, S0-09 | 2 |
| S0-11 | Design tokens do blog (warm paper/muted ink/serif+mono) como tema | P1 | S0-09 | 1 |
| S0-12 | Dashboard shell: lista de vídeos com cards por status | P0 | S0-10 | 2 |
| S0-13 | Sprite placeholder procedural (5 estados × 4 bocas) + contrato de sheet | P1 | — | 2 |
| S0-14 | CI GitHub Actions (buf/sqlc/go/npm checks) | P0 | S0-04, S0-09 | 2 |
| S0-15 | Máquina de estados do vídeo: módulo domain + unit tests | P0 | S0-06 | 2 |
| S0-16 | Watcher RSS núcleo: poll + parse + dedup PG + registro `new` | P0 | S0-06 | 2 |
| S0-17 | Deploy produção VPS: compose.prod + Caddy TLS + hardening | P0 | S0-08, S0-12 | 2 |

## Sprint 1 — Roteiro E2E (~17 h · SPEC: 16 h)

> Context pack, convenções AGENTS.md, observador de artefatos, revisão/aprovação na UI,
> SSE, fluxo completo até `script_approved`.

| ID | Tarefa | P | Depende de | h |
| --- | --- | --- | --- | --- |
| S1-01 | Workspace canônico + gerador de context pack + AGENTS.md do vídeo | P0 | S0-16 | 2 |
| S1-02 | Contrato StudioScript em proto (+ JSON Schema p/ validação FS) | P0 | S0-04 | 2 |
| S1-03 | Observador de artefatos: fsnotify → validação → `script_review` + evento | P0 | S1-01, S1-02, S0-15 | 2 |
| S1-04 | VideoService completo: Get detalhado, UpdateScript, Approve/Reject | P0 | S1-02, S0-15 | 2 |
| S1-05 | SSE hub: broker + endpoint autenticado + hook `useStudioEvents` | P0 | S0-08 | 2 |
| S1-06 | UI revisão de roteiro: visualização estruturada + diff original↔editado | P0 | S1-04, S1-05, S0-12 | 2 |
| S1-07 | UI edição de segmentos + salvar/aprovar/rejeitar roteiro | P0 | S1-06 | 2 |
| S1-08 | Teste integração: post fixture → watcher → script válido/inválido → aprovação | P1 | S1-03, S1-04 | 2 |
| S1-09 | Guia operacional: "roteirizando com OpenCode via SSH" | P1 | S1-01 | 1 |

## Sprint 2 — Gravação web (~18 h · SPEC: 20 h)

> Estúdio de gravação no navegador: voz + blendshapes por segmento, upload pra VPS, junção.

| ID | Tarefa | P | Depende de | h |
| --- | --- | --- | --- | --- |
| S2-01 | Upload chunked autenticado → `audio/` no workspace + registro PG | P0 | S1-01 | 2 |
| S2-02 | MediaPipe Face Landmarker em Worker (WASM/GPU) + extração de blendshapes | P0 | S0-09 | 2 |
| S2-03 | Mapeamento blendshapes→estados do sprite (função pura + testes) | P0 | S2-02 | 1 |
| S2-04 | Avatar vivo: canvas reagindo ao estado detectado (sheet placeholder) | P1 | S0-13, S2-03 | 2 |
| S2-05 | Captura de voz: mic → WAV encoder (AudioWorklet) + medidor de nível | P0 | S0-09 | 2 |
| S2-06 | Teleprompter por segmento: rec/stop/refazer + replay com waveform | P0 | S2-05, S1-04 | 2 |
| S2-07 | Gravação completa do segmento: áudio+blendshapes sincronizados + upload | P0 | S2-01, S2-04, S2-06 | 2 |
| S2-08 | Fluxo da página de gravação: progresso por segmento, guardas de estado | P0 | S2-07 | 2 |
| S2-09 | Junção: concat dos takes aprovados + manifest de timestamps → `voice_processing` | P0 | S2-08 | 2 |
| S2-10 | Testes: encoder WAV, mapeamento de estados, integração de upload | P1 | S2-03, S2-05 | 1 |

## Sprint 3 — Voz e avatar (~16 h · SPEC: 16 h)

> Transcrição Gemini, legendas EN, visemes, timeline do avatar, rig Remotion, preview.

| ID | Tarefa | P | Depende de | h |
| --- | --- | --- | --- | --- |
| S3-01 | Cliente Gemini Flash Lite: transcrição áudio→texto com timestamps | P0 | S2-09 | 2 |
| S3-02 | Alinhamento fino: casar transcrição com `narration_pt` → word timings | P1 | S3-01 | 2 |
| S3-03 | Visemes: engine Rhubarb/WASM na VPS (WAV → formas A–H+X) | P0 | S2-09 | 2 |
| S3-04 | Gerador `avatar.timeline.json`: visemes + estados + word timings (proto-validado) | P0 | S3-02, S3-03 | 2 |
| S3-05 | Tradução de legendas EN via Gemini (batch por segmento) → `subtitles.en.json` | P0 | S3-01 | 1 |
| S3-06 | remotion-kit scaffold: composição raiz LongForm/Short + PlayerHost no frontend | P0 | S0-09 | 2 |
| S3-07 | Rig `<AvatarSprite>`: sheet, bocas por viseme, 5 estados, sync de áudio | P0 | S3-04, S3-06 | 2 |
| S3-08 | Preview por segmento no dashboard: PlayerHost + áudio real + timeline | P0 | S3-07 | 2 |
| S3-09 | Smoke render CLI 30 s (validar ambiente Windows antes do runner existir) | P2 | S3-07 | 1 |

## Sprint 4 — Cenas (~19 h · SPEC: 24 h)

> Gramática fechada de componentes, biblioteca Remotion, review cena a cena, fluxo OpenCode.

| ID | Tarefa | P | Depende de | h |
| --- | --- | --- | --- | --- |
| S4-01 | Gramática de cenas: union tipada + schemas de props + catálogo documentado | P0 | S3-06 | 2 |
| S4-02 | Componentes de código: CodeTyping + DiffView (tokens do blog) | P0 | S4-01 | 2 |
| S4-03 | TerminalRun + Callout | P1 | S4-01 | 2 |
| S4-04 | FlowDiagram + BigNumber + Timeline | P1 | S4-01 | 2 |
| S4-05 | Compositor de cena: avatar protagonista fullscreen ↔ overlay técnico | P0 | S3-07, S4-02 | 2 |
| S4-06 | Componente de legenda EN burn-in (estilo, timing) | P1 | S3-05, S4-01 | 2 |
| S4-07 | Fluxo de cenas do OpenCode: instruções AGENTS.md + validação → `scenes_review` | P0 | S1-03, S4-01 | 2 |
| S4-08 | UI review cena a cena: PlayerHost por card, aprovar/reprovar | P0 | S4-05, S1-05 | 2 |
| S4-09 | Stills de snapshot dos componentes (regressão visual básica) | P2 | S4-02..S4-04 | 2 |
| S4-10 | Guia operacional: "gerando cenas com OpenCode" | P1 | S4-07 | 1 |

## Sprint 5 — Montagem e lançamento (~23 h · SPEC: 20 h)

> Runner local, fila de jobs, composição final, shorts 9:16, releases, checklist.

| ID | Tarefa | P | Depende de | h |
| --- | --- | --- | --- | --- |
| S5-01 | Fila de jobs no PG: enqueue/claim/heartbeat/retry + tipos de job | P0 | S0-06, S0-15 | 2 |
| S5-02 | Proto jobs.v1 (Claim/UpdateProgress/Complete/Fail) + service | P0 | S5-01 | 1 |
| S5-03 | Runner daemon (Windows): config PAT, polling ClaimJob, heartbeat, cancel-check | P0 | S5-02 | 2 |
| S5-04 | Sync de inputs: runner baixa bundle+artefatos necessários do server | P0 | S5-03 | 2 |
| S5-05 | Render long-form 1080p16:9: composição completa + progresso ao vivo | P0 | S4-08, S5-04 | 2 |
| S5-06 | Shorts 9:16: re-corte dos `[SHORT#n]` no mesmo job | P0 | S5-05 | 2 |
| S5-07 | Upload MP4 de volta (chunked+checksum) → `final_review` | P0 | S5-05 | 2 |
| S5-08 | Trilha sonora: assets + mixagem/ducking sob narração | P2 | S5-05 | 2 |
| S5-09 | Release builder: `releases/<slug>/` completo (copy do `script.social`, SRT EN, thumb) | P0 | S5-07 | 2 |
| S5-10 | Player do corte final no dashboard + aprovar/pedir re-render | P0 | S5-07 | 2 |
| S5-11 | Checklist de lançamento na UI (marcar publicado por plataforma) → `released` | P1 | S5-09 | 2 |
| S5-12 | Smoke test de render longo (~12 min, Remotion pinned) | P1 | S5-05 | 2 |

## Sprint 6 — Prova real (~14 h · SPEC: 12 h)

| ID | Tarefa | P | Depende de | h |
| --- | --- | --- | --- | --- |
| S6-01 | E2E vídeo #1 — parte 1: roteiro + gravação (log de atrito) | P0 | todas P0 ≤S5 | 2 |
| S6-02 | E2E vídeo #1 — parte 2: voz + cenas (log de atrito) | P0 | S6-01 | 2 |
| S6-03 | E2E vídeo #1 — parte 3: montagem + publicação manual YouTube | P0 | S6-02 | 2 |
| S6-04 | Publicar ≥3 shorts + sociais; validar critério de pronto do SPEC | P0 | S6-03 | 2 |
| S6-05 | Retrospectiva: doc de atrito + ajustes rápidos priorizados | P0 | S6-03 | 2 |
| S6-06 | Runbook de operação contínua: métricas (h/vídeo, cadência, % social publicado) | P1 | S6-05 | 2 |
| S6-07 | Backup offsite do `/data` (restic/rclone) | P3 | — | 2 |

---

## Resumo

| Sprint | Tarefas | P0 | P1 | P2 | P3 | h |
| --- | --- | --- | --- | --- | --- | --- |
| 0 — Fundações | 17 | 15 | 2 | — | — | 30 |
| 1 — Roteiro E2E | 9 | 7 | 2 | — | — | 17 |
| 2 — Gravação web | 10 | 8 | 2 | — | — | 18 |
| 3 — Voz e avatar | 9 | 7 | 1 | 1 | — | 16 |
| 4 — Cenas | 10 | 5 | 4 | 1 | — | 19 |
| 5 — Montagem | 12 | 9 | 2 | 1 | — | 23* |
| 6 — Prova real | 7 | 5 | 1 | — | 1 | 14 |
| **Total** | **74** | **56** | **14** | **3** | **1** | **137** |

\* Correções do smoke test podem consumir parte da folga registrada no SPEC (§6).

### Fora de escopo da v1 (backlog do SPEC §8 — referência, sem tarefas)

Gravação mobile/Tailscale · busca semântica · expressões estendidas (~9 estados) ·
auto-publish via API · kit de cenas estendido · modo "durante o processo" ·
fallback de transcrição 100% local.
