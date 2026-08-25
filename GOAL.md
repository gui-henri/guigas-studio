# GOAL — Construir o Guigas Studio v1

> Prompt-missão para agente executor autônomo. Aponte o agente para este arquivo
> (ou cole seu conteúdo como instrução inicial) e ele terá tudo para executar o projeto.

---

## Missão

Você é o agente implementador do **Guigas Studio**: plataforma auto-hospedada que transforma
posts de blog em vídeos YouTube (8–12 min) + shorts com avatar animado. Seu trabalho é ir do
repo atual até a **v1 completa**, executando as tarefas documentadas em `docs/tasks/` —
implementando código de verdade, testando, commitando e mantendo a documentação de tarefas
sincronizada com a realidade.

**Critério de sucesso final** (`SPEC.md` §7): um post real publicado vira 1 vídeo no YouTube +
≥3 shorts, produzido ponta a ponta pelo Studio, acompanhado pelo dashboard.

## Fontes de verdade (ordem de precedência)

1. `docs/tasks/<sprint>/S?-??.md` — **a tarefa atual manda**. Siga os Passos na ordem.
2. `docs/tasks/ROADMAP.md` — índice, máquina de estados canônica, regras globais de execução.
3. `docs/DECISIONS.md` — decisões fechadas (D-01..D-21 estratégicas, T-01..T-08 técnicas).
4. `SPEC.md` — visão de produto e contexto.
5. `architecture-guide.md` — padrões estruturais (proto/buf, Go+SQLC, Connect-RPC, React Query).

Conflito entre fontes? A tarefa específica vence sobre o genérico; decisões vencem sobre
intuição. **Nunca** introduza arquitetura nova não coberta por decisão registrada.

## Estado do mundo assumido

- Monorepo com pacotes `backend/` (Go+SQLC+Postgres), `frontend/` (React/Vite),
  `remotion-kit/`, `runner/` (Node), contratos em `proto/` (Buf/Connect-RPC).
- Máquina local: **Windows nativo, sem WSL** (D-13). Comandos cross-platform (npm scripts).
- VPS Linux com Docker + domínio/TLS prontos (D-08/D-12). Credencial Gemini existe.
- Git: **trunk-based na main**, commits convencionais citando a tarefa: `feat(S0-03): ...` (D-21).
- Idioma: código/comentários/commits em **EN**; documentação e comunicação em **PT-BR** (D-06).

## Loop de trabalho (repita até não restar tarefa elegível)

1. `git pull --rebase` antes de começar.
2. **Selecione a próxima tarefa**: `status: todo` no frontmatter, todas as `depende_de`
   com `done`, maior prioridade disponível (P0 > P1 > P2 > P3), menor ID dentro dela.
3. **Leia o arquivo da tarefa INTEIRO** antes de escrever qualquer linha de código.
4. Execute os **Passos** em ordem — um commit coeso por passo/unidade lógica.
5. Rode a **Verificação** da tarefa + verificações globais (`npm run check`: buf lint,
   sqlc vet, go vet/build/test, lint+build dos workspaces JS). Nada avança com vermelho.
6. Marque os itens de **Critérios de aceite**, atualize `status: done` no frontmatter,
   commite (`chore(S?-??): mark done`) junto do trabalho.
7. Volte ao passo 1. Se nenhuma tarefa estiver elegível, pare e reporte o estado.

## Regras invioláveis

- **Bloqueio >15 min**: marque `status: blocked` no frontmatter com nota explicando o
  impedimento, reporte e **pare**. Não contorne inventando soluções estruturais.
- Ambiguidade de detalhe pequeno: escolha a **opção mais simples alinhada às decisões**,
  registre a escolha na seção Notas da tarefa e mencione no commit.
- **Nunca** commitar: `.env`/segredos, `node_modules`, `*.wav`, `*.mp4`, artefatos de runtime.
- Toda transição de status de vídeo passa pelo módulo de estados (`videostate`, S0-15) — nunca inline.
- Testes onde a tarefa pedir (política moderada, D-18); sem testes novos, a verificação global basta.
- Não refatore além do escopo da tarefa atual; melhorias identificadas viram nota para nova tarefa.
- Remotion com versão **pinned** (risco de drift em renders longos, SPEC §9).

## Pontos que exigem o humano presente (coordene, não faça sozinho)

- S0-17: primeiro deploy na VPS (ele executa comandos no servidor com você orientando).
- Qualquer credencial/custo novo (API keys adicionais, serviços pagos).
- Sprint 6 inteiro: gravação de voz real, sessões OpenCode dele, aprovações na UI,
  publicação manual no YouTube/redes — você prepara e acompanha; ele opera.

## Definição de pronto do projeto

- Todas as tarefas **P0 e P1** com `done`; P2/P3 são desejáveis, não bloqueiam.
- Smoke test de render longo verde (S5-12).
- Critério do SPEC §7 validado pelas S6-01..S6-04 com evidências nos arquivos.

## Ao encerrar cada sessão de trabalho

Reporte: tarefas concluídas (IDs), estado do `npm run check`, pendências/bloqueios,
riscos identificados e qual será a próxima tarefa elegível.
