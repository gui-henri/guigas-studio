# Guigas Studio — Spec v2

> Plataforma web auto-hospedada que transforma os artefatos do blog em vídeos (YouTube long +
> shorts) e posts sociais, com intervenção humana só onde importa: aprovar o roteiro, gravar
> a voz e validar o corte final.
>
> **Status:** v2 — re-arquitetura centralizada após revisão da v1 (grill original 2026-08-25).
> Semente do repo `guigas-studio`.

## 1. Visão

O blog é a fábrica de artefatos (`content-method/`): Capture → Internalize → Distribute.
O Studio automatiza a fase 3 inteira e metade da fase 2 — o salto do essay ao vídeo falado.

```
Post novo (RSS) ─▶ Roteiro ─▶ Gravação ─▶ Cenas ─▶ Montagem ─▶ Lançamento
   (VPS vigia)    (OpenCode    (browser:     (OpenCode   (runner      (checklist
                   + revisão    webcam+voz    + preview   local        na UI,
                   na UI)       por trecho)   <Player>)   renderiza)   upload manual)
```

**A promessa:** um post publicado é o gatilho; dias depois existe um vídeo de 8–12 min no
YouTube, 2–4 shorts e copy pronta pra X, LinkedIn e Instagram — tudo derivado do roteiro
único que você aprovou. Todo o processo é acompanhável num único dashboard web.

### Princípio arquitetural

**Um cérebro na nuvem, uma estação na mesa, um agente no terminal.**

| Onde | O quê | Por quê |
| --- | --- | --- |
| VPS (sempre ligada) | Dashboard, API, watcher RSS, estado, tarefas Gemini, visemes | barato, disponível de qualquer lugar |
| Máquina local (ao produzir) | Navegador (gravação/revisão) + runner de render | webcam e CPU ficam com você |
| Terminal | OpenCode (roteiro e código das cenas) | trabalho agentico merece agente livre |

Nada de app nativo: **o navegador é o estúdio**. MediaPipe Face Landmarker roda como WASM no
próprio browser (blendshapes idênticas aos apps nativos), captura de áudio é API padrão, e o
`<Player>` do Remotion dá preview de cena e do corte final dentro do dashboard.

## 2. Decisões registradas

Grill original (v1) e revisões da v2 marcadas com 🔄:

| # | Questão | Decisão |
| --- | --- | --- |
| 1 | Escopo inicial | Pipeline completo desde o início; sprint de construção 20h+/semana |
| 2 | Intervenção humana | Aprovação em 3 pontos: **roteiro**, **cenas em fluxo**, **montagem final** |
| 3 | Idioma | Narração em **português**, legendas em **inglês** (longs e shorts) |
| 4 | Composição | **Avatar protagonista**: fullscreen narrando; visual explicativo nos trechos técnicos |
| 5 | Animação do avatar | Webcam alimenta expressões/cabeça; **boca vem do áudio** pós-gravação (visemes) |
| 6 | Captura | 🔄 **Página web no dashboard** (getUserMedia + MediaPipe WASM); Electron eliminado; app mobile segue backlog |
| 7 | Sprite | Desenhado pelo Guigas; kit básico de **5 estados**: idle, falando, feliz, pensativo, surpreso |
| 8 | Engine visual | **Remotion** (React/TS); preview in-browser via `<Player>` |
| 9 | Tipos de cena | Código vivo (typing/diff/terminal), diagramas/arquitetura, dados/timelines |
| 10 | Identidade visual | **Design tokens do blog** (warm paper, muted ink, serif/mono) |
| 11 | Fonte da verdade | **Roteiro único estruturado**, versionado, dirige tudo |
| 12 | Momentos-chave | Marcados `[SHORT#n]` no roteiro, validados junto com ele |
| 13 | Artefatos sociais | Short + caption IG + LinkedIn + thread X saem do mesmo pipeline |
| 14 | Publicação | **Fila de upload manual** (pasta pronta por plataforma); zero API de publicação |
| 15 | Gatilho | 🔄 Watcher RSS na **VPS** (sempre ligada) → rascunho te espera pronto |
| 16 | Posts relacionados | Apenas **links explícitos** no markdown (busca semântica é backlog) |
| 17 | Modelos | 🔄 Dois cérebros: **OpenCode no terminal** (modelos fortes, agentic: roteiro e cenas) + **Gemini Flash Lite** (volume: transcrição, legendas EN, tags, copy mecânica) |
| 18 | Cadência alvo | 2 vídeos/mês, 8–12 min |
| 19 | Critério de pronto | 1 vídeo E2E real publicado + ≥3 shorts, produzido só com o Studio |
| 20 | Casa | Repo separado (`guigas-studio`) |
| 21 | 🔄 Centralização | **Dashboard web único** pra gerenciar/visualizar/gravar; nada de apps dispersos |
| 22 | 🔄 Infra | **VPS barata sempre-ligada** (cérebro) + máquina local (gravação/render/OpenCode); custo alvo ~US$5–10/mês |
| 23 | 🔄 Transcrição | **Gemini API (Flash Lite)** substitui whisper.cpp — menos dependência nativa; voz narrada vai pra API por decisão consciente |
| 24 | 🔄 UI | **React + Vite** SPA |

## 3. O roteiro único (fonte da verdade)

Arquivo versionado no workspace do vídeo, consumido por todos os estágios:

```jsonc
{
  "post": "2026-08-02-deepseek-drops-zdr-on-opencode-go",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 10 },
  "related": ["/notes/2026-08-02-deepseek-zdr"],   // só links explícitos do markdown
  "segments": [
    {
      "id": "hook",
      "beat": "hook",                    // hook | setup | example | payoff | cta
      "emotion": "surpreso",             // mapeia pros 5 estados do avatar
      "narration_pt": "...",
      "scene": null,                     // hook é só avatar
      "short": null
    },
    {
      "id": "exemplo-zdr",
      "beat": "example",
      "emotion": "pensativo",
      "narration_pt": "...",
      "scene": {
        "type": "diff_view",
        "props": { "before": ["const x = 1;"], "after": ["let x = 1;"] }
      },
      "short": { "id": 1, "hook": "...", "cta": "Post completo na bio" }
    }
  ],
  "social": { "x_thread": ["..."], "linkedin": "...", "instagram_caption": "..." }
}
```

Regras:

- **Narração é texto, não timestamp.** Timestamps reais nascem da transcrição do áudio gravado
  (Gemini + refinamento local) e entram como metadados de render — o texto continua editável.
- `[SHORT#n]` marca trecho auto-contido: hook próprio + exemplo + CTA, recortável sem contexto.
- Beats seguem o template do método (Hook / Setup / Example / Payoff / CTA).
- Validação **Zod** em toda escrita: nada entra no pipeline sem schema válido.

## 4. Topologia e componentes

```
┌─────────────── VPS (sempre ligada) ───────────────┐   ┌──── Local (ao produzir) ────┐
│  Studio Server (Node/Hono)                        │   │  Browser                    │
│  ├ API REST + WebSocket                           │◄──┤  ├ página de gravação       │
│  ├ Dashboard estático (React/Vite build)          │   │  │ (webcam→blendshapes,    │
│  ├ Watcher RSS + catch-up                         │   │  │  voz→WAV, por segmento)  │
│  ├ Máquina de estados por vídeo (fs + .state/)    │   │  ├ reviews: roteiro, cenas  │
│  ├ Tarefas Gemini Flash Lite (fila interna)       │   │  │ <Player>, corte final    │
│  ├ lip-sync engine (WASM, CPU leve)               │   │  └ checklist de lançamento  │
│  ├ Validador Zod + observador de artefatos        │   │  Runner de render (daemon   │
│  └ Assets: WAV, timelines, MP4s (disco VPS)       │   │  leve, pega jobs, roda      │
│                                                   │   │  Remotion local, sobe MP4)  │
│  Workspace git dos vídeos ◄───────────────────────────┤  OpenCode (terminal) no     │
└───────────────────────────────────────────────────┘   │  workspace do vídeo atual   │
                                                        └─────────────────────────────┘
```

### 4.1 Watcher (VPS)
Polling do RSS + estado local. Post novo → cria `videos/<slug>/` com **context pack**
(post, posts linkados, templates do método, `AGENTS.md` com as convenções do Studio) →
status *roteiro pendente* → notificação (ntfy/e-mail).

### 4.2 Roteirista — OpenCode no terminal
Você abre o OpenCode no workspace do vídeo (SSH na VPS ou sincronizado local) e pede o
roteiro. O context pack já contém instruções, schema e exemplos. Saída: `script.json`.
O observador de artefatos do servidor valida contra Zod e move o card na UI pra
*roteiro em revisão* — diff lado a lado, edição estruturada, aprovação.

### 4.3 Estúdio de gravação — página web
- Roteiro segment a segment ao lado do preview vivo do avatar (sprite reagindo em tempo real).
- Captura: `getUserMedia` (voz + webcam) + MediaPipe Face Landmarker em Web Worker (GPU).
- Gravação **por segmento**: refazer só o parágrafo errado. Blobs sobem pra VPS via HTTPS.
- Produto por segmento: `WAV` + `blendshapes.json` (expressões/cabeça). Boca não vem daqui.

### 4.4 Processamento de voz (VPS)
- Transcrição: Gemini Flash Lite (áudio → texto com timestamps).
- Visemes: `lip-sync-engine` (Rhubarb/WASM) sobre o WAV, refinado com a transcrição exata.
- Saída: `avatar.timeline.json` (visemes A–H+X + estados derivados das blendshapes).

### 4.5 Gerador de cenas — OpenCode + gramática fechada
- Biblioteca de componentes Remotion testados: `CodeTyping`, `DiffView`, `TerminalRun`,
  `FlowDiagram`, `BigNumber`, `Timeline`, `Callout`. O agente só compõe props — nunca CSS livre.
- Preview **cena a cena** no dashboard via `<Player>` (bundle de desenvolvimento compilado
  no servidor); ajuste conversacional no OpenCode até aprovar cada card.

### 4.6 Montagem — runner local
- Job de render despachado pela UI; o daemon local executa `renderMedia()` (1080p16:9,
  ~15–40 min) e sobe o MP4. Progresso ao vivo via WebSocket.
- Composição única: narração + avatar timeline + cenas + legendas EN burn-in opcional + trilha.
- Shorts: re-corte 9:16 dos segmentos `[SHORT#n]` no mesmo job.
- Revisão final: player do corte completo no dashboard → aprova.

### 4.7 Editor de lançamento
Gera `releases/<slug>/`: youtube/ (vídeo, título, descrição com link pro post), shorts/,
x/, linkedin/, instagram/. Checklist na UI marca o que já foi publicado à mão.

## 5. Stack técnica

| Camada | Escolha | Notas |
| --- | --- | --- |
| Servidor | Node 22 + Hono/Fastify + TypeScript | API + WS + filas internas simples |
| Dashboard | React + Vite SPA (build estático servido pelo próprio server) | auth simples (token/passkey) pois fica exposto |
| Gravação | getUserMedia + MediaRecorder + `@mediapipe/tasks-vision` em Worker | WASM/WebGPU no browser, zero instalação |
| Transcrição | Gemini API — Flash Lite | substitui whisper.cpp; fallback futuro: transformers.js local |
| Visemes | `lip-sync-engine` (Rhubarb/WASM, formas A–H+X) | roda na VPS, CPU leve |
| Vídeo | Remotion 4.x: `<Player>` (preview) + `renderMedia()` (final) | grátis p/ indivíduo; revisar licença se time > 3 |
| Render | Daemon local ("runner") consome fila do servidor | VPS não renderiza (RAM baixa) |
| Agente | OpenCode CLI no workspace do vídeo | modelos fortes plugáveis; convenções via `AGENTS.md` |
| Estado | Arquivos no git + `.state/` efêmero (jobs, locks) | sem banco; Zod valida toda fronteira |

## 6. Plano de construção (sprints de ~20h)

| Sprint | Entrega | Horas est. |
| --- | --- | --- |
| 0 — Fundações | repo, VPS provisionada (server + auth + deploy), schema Zod, watcher RSS, **sprite sheet v1 desenhado** em paralelo | 20h |
| 1 — Roteiro E2E | context pack, convenções AGENTS.md, fluxo OpenCode → validação → revisão/aprovação na UI | 16h |
| 2 — Gravação web | página de gravação (voz + blendshapes por segmento), upload pra VPS, junção | 20h |
| 3 — Voz e avatar | transcrição Gemini, visemes, rig do sprite no Remotion (5 estados) | 16h |
| 4 — Cenas | biblioteca de componentes, bundle de preview, review cena a cena no `<Player>` | 24h |
| 5 — Montagem | runner local + fila de render, composição final, legendas EN, cutter 9:16, releases | 20h |
| 6 — Prova real | vídeo #1 de ponta a ponta; registrar atrito; ajustar | 12h |

Total: ~128h ≈ 6–7 semanas. O Electron sumiu (−24h vs v1); VPS + runner entraram (+12h).

## 7. Pronto e saudável

**v1 pronta:** um post real vira vídeo publicado no YouTube + ≥3 shorts, de ponta a ponta,
acompanhado inteiramente pelo dashboard.

**Operação contínua:**
- Horas humanas por vídeo (meta implícita: caber na semana, ritmo de 20h)
- Cadência: 2 vídeos/mês sustentados por 2 meses = sistema validado
- % de artefatos sociais publicados vs gerados

## 8. Backlog pós-v1

1. Gravação remota responsiva (celular acessa o dashboard via Tailscale — áudio fora do PC)
2. Busca semântica no acervo para associação de posts
3. Expressões estendidas (~9 estados) e corpo mais animado
4. Auto-publish via APIs (YouTube quota ok; Instagram exige professional + app review)
5. Kit estendido de cenas (UI simulada, charts de dados reais)
6. Modo "durante o processo": progresso vira community posts/stories
7. Fallback de transcrição 100% local (transformers.js) pra conteúdo sensível

## 9. Riscos e mitigações

| Risco | Mitigação |
| --- | --- |
| VPS exposta | auth obrigatória desde o Sprint 0; alternativa Tailscale-only |
| Duas máquinas divergem (estado local vs VPS) | VPS é fonte única; runner e workspace sincronizam por push/pull do git + upload HTTP; nada crítico vive só no local |
| Sprite atrasar (você desenha) | mínimo viável no Sprint 0: 5 estados × ~4 bocas |
| Qualidade das cenas do agente | gramática fechada de componentes; Zod nos props; preview antes de aprovar |
| Escopo "pipeline inteiro" estourar | cada sprint termina utilizável; Sprint 6 intocável |
| Drift áudio/vídeo em renders longos | Remotion pinned; smoke test de 12 min antes do vídeo real |
| Voz indo pra API Gemini (tensão com seu post de ZDR) | decisão consciente e documentada; fallback local no backlog |
| Custo de LLM | Flash Lite no volume; modelos fortes só nas ~2 sessões OpenCode por vídeo |