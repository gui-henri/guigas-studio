# Guigas Studio — Registro de Decisões (ADR)

> Grill de fundação realizado em **2026-08-25** com o dono do projeto.
> Complementa o `SPEC.md` v2 e o padrão de `architecture-guide.md`. Toda tarefa em
> `docs/tasks/` assume estas decisões como verdade.

## 1. Decisões estratégicas (respondidas no grill)

| # | Tema | Decisão |
| --- | --- | --- |
| D-01 | Conflito de stack | **Híbrido**: backend Go + contratos Protobuf/Buf + Connect-RPC + SQLC (conforme `architecture-guide.md`); artefatos pesados e roteiro permanecem em disco/git (conforme `SPEC.md`). Zod nas fronteiras da API é substituído por validação protojson; Zod só onde o Remotion exige (props). |
| D-02 | Estado do pipeline | **PostgreSQL** guarda índice de vídeos, máquina de estados, fila de jobs, takes e checklist de lançamento. Arquivos grandes (WAV/MP4) e `script.json` ficam em disco. O server reconcilia os dois mundos. |
| D-03 | Tempo real | **SSE** (Server-Sent Events) server→client para progresso/status/eventos do watcher. Mutations continuam RPC unary. Cliente usa fetch-based SSE para poder enviar `Authorization: Bearer`. |
| D-04 | Autenticação | **Login + JWT** (HS256), conta única semeada via env (`STUDIO_USERNAME` + hash de senha) no primeiro boot. Sem registro público, nunca. Runner usa PAT Bearer próprio. |
| D-05 | Escopo da documentação | **Sprints 0–6** até o critério de pronto do SPEC (1 vídeo E2E real publicado + ≥3 shorts). Backlog pós-v1 listado só como referência. |
| D-06 | Idioma | **Documentação/tarefas em PT-BR**; identificadores de código, APIs, commits e comentários de código em EN. |
| D-07 | Formato das tarefas | **1 arquivo por tarefa** em `docs/tasks/<sprint>/`, com frontmatter YAML (id, titulo, sprint, prioridade, depende_de, estimativa_h, status) + Objetivo, Contexto, Pré-requisitos, Passos, Critérios de aceite, Verificação, Notas. Indexadas por `docs/tasks/ROADMAP.md`. |
| D-08 | Deploy VPS | **Docker Compose**: api + postgres + caddy (TLS automático no domínio). Deploy = `git pull && docker compose up -d --build`. Ambiente local espelha produção. |
| D-09 | Monorepo | 5 pacotes: `proto/` · `backend/` (Go+SQLC+PG) · `frontend/` (React/Vite SPA, importa `remotion-kit` para o `<Player>`) · `remotion-kit/` (componentes de cena + composição, compartilhado entre preview e render final) · `runner/` (daemon local Node/TS). Mais `docs/tasks/`. |
| D-10 | Fila do runner | **Polling unary**: `ClaimJob` quando ocioso (~10 s), `UpdateProgress`/`CompleteJob`/`FailJob` unaries. Cancelamento: runner checa status do job antes de cada cena. Zero conexão persistente. |
| D-11 | Binários | WAV/MP4/sprites grandes são **gitignored** no workspace dos vídeos; disco da VPS é o armazenamento. Backup offsite (restic/rclone) é tarefa P3 opcional (S6-07). |
| D-12 | Infra existente | VPS Linux contratada ✔ · domínio + DNS apontável ✔ · URL do RSS ✔ · credencial Gemini API ✔. Nada disso vira tarefa de aquisição — só de configuração. |
| D-13 | Máquina local | **Windows nativo, sem WSL**. Gravação acontece no navegador; runner roda Node nativo p/ Windows (Remotion tem binários Win32). Todas as tarefas usam comandos cross-platform (npm scripts, binários Go compilados por SO). |
| D-14 | Sessões OpenCode | **SSH na VPS**, dentro de `videos/<slug>/`. O observador de artefatos valida na hora e move os cards na UI. Fluxo local-clone+push fica fora da v1. |
| D-15 | CI | **GitHub privado + Actions** a cada push: buf lint/breaking, sqlc vet, go vet/test/build, typecheck+build dos pacotes JS. Rede de proteção para commits diretos na main. |
| D-16 | Pacotes JS | **npm workspaces** (escolha explícita do dono, sobre pnpm/bun). |
| D-17 | Sprite | **Placeholder procedural** (SVG/sheet gerada por script, 5 estados × ~4 bocas) desacopla o pipeline do desenho manual; sprite real entra por drop-in respeitando o contrato de sprite sheet. |
| D-18 | Testes | **Moderado**: unit tests em lógica pura (máquina de estados, encoders, alinhamentos), integração dos services com Postgres de teste, smoke test de render longo antes do vídeo real (risco registrado no SPEC §9). |
| D-19 | Notificações | **Só dashboard** (badge/status em tempo real via SSE). Sem ntfy/e-mail push na v1. |
| D-20 | Granularidade | Tarefas finas: **≤2 h cada**, com passos numerados e verificação objetiva (~70 arquivos). |
| D-21 | Fluxo git do executor | **Trunk-based**: agente comita direto na main, 1+ commits convencionais (`feat(S0-03): ...`) por tarefa, atualiza frontmatter, roda verificações antes de marcar `done`. |

## 2. Decisões técnicas derivadas (tomadas a partir das acima; revisáveis)

| # | Tema | Decisão |
| --- | --- | --- |
| T-01 | Serviço estático | Caddy serve o build da SPA e faz proxy reverso de RPC/SSE na mesma origem (sem CORS). |
| T-02 | Preview Remotion | O frontend importa `remotion-kit` direto — o `<Player>` funciona no bundle da SPA. Elimina o "bundle de desenvolvimento compilado no servidor" do SPEC §4.5 (mais simples, mesmo resultado). |
| T-03 | Render final | O runner constrói o bundle localmente (`remotion bundle`) e executa `renderMedia()`; sobe o MP4 por upload chunked com checksum. |
| T-04 | Uploads | Endpoint HTTP streaming/chunked autenticado (Bearer) gravando direto no workspace em disco; sem presigned URLs/S3 na v1. |
| T-05 | Migrações | Arquivos `.sql` versionados + runner embutido no binário Go (padrão do blueprint, seção `database/migrations`). |
| T-06 | Senha/hash | argon2id; JWT HS256 com `JWT_SECRET` em env; token do runner separado (`RUNNER_TOKEN`). |
| T-07 | Workspace git dos vídeos | `/data/videos/` é um repositório git próprio (init no primeiro boot): texto versionado por transição validada (server commita), binários ignorados. É distinto deste repositório de código. |
| T-08 | Máquina de estados | Enum canônico em [ROADMAP.md → Referência rápida](tasks/ROADMAP.md#referência-rápida). Toda transição passa pelo módulo de estados com unit tests. |

## 3. Não-decisões (abertas conscientemente)

- **Provedor de backup** (D-11/S6-07): decidir na execução (B2, S3, rclone genérico).
- **Trilha sonora**: assets e ducking entram como P2 (S5-08); pode virar backlog sem bloquear v1.
- **Licença Remotion**: gratuita para uso individual; revisar somente se time > 3 (nota do SPEC §5).
