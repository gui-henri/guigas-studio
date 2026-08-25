---
id: S1-09
titulo: "Guia operacional: roteirizando com OpenCode via SSH"
sprint: 1
prioridade: P1
depende_de: [S1-01]
estimativa_h: 1
status: todo
---

# S1-09 — Guia operacional "roteirizando com OpenCode"

## Objetivo

Escrever `docs/guides/opencode-scripting.md`: o passo-a-passo humano para produzir o
roteiro de um vídeo com OpenCode dentro do workspace — SSH na VPS, entrar em
`/data/videos/<slug>/`, pedir o roteiro seguindo o `context/AGENTS.md` e conferir o
resultado antes de abrir o dashboard. O **entregável é o documento** — nenhum código de
aplicação muda.

## Contexto

Operacionaliza D-14 (OpenCode via SSH dentro de `videos/<slug>/`) e `SPEC.md §4.2`. O
guia ensina o humano; o `AGENTS.md` gerado pela S1-01 ensina o agente — o guia deve
apontar para ele, nunca duplicar convenções (evita drift entre doc e template).

## Pré-requisitos

- S1-01 `done` (context pack + AGENTS.md existem de verdade para referenciar).
- Acesso SSH à VPS com `/data/videos` e opencode instalado (ou ambiente dev equivalente
  para o dry run).

## Passos

1. Criar `docs/guides/` e o arquivo `opencode-scripting.md` com seções fixas:
   Pré-requisitos · Passo-a-passo · Prompts de exemplo · Checklist antes do dashboard ·
   Problemas comuns.
2. Passo-a-passo com comandos exatos: `ssh <vps>`; localizar o slug pela fila
   `script_pending` no dashboard ou `ls /data/videos`; `cd /data/videos/<slug>`;
   ler `context/AGENTS.md` (e `post.md`); abrir `opencode`; colar um prompt de exemplo;
   conferir `script.json` na raiz; sair.
3. Incluir ≥3 prompts prontos em blocos de código copiáveis: (a) gerar o roteiro inicial
   seguindo o AGENTS.md com N shorts; (b) refinar um segmento específico após feedback
   da revisão; (c) corrigir erros de validação reportados no log do server.
4. Checklist "antes de olhar o dashboard": `script.json` existe na raiz; JSON parseia
   (`jq . script.json`); beats na ordem do método; todo `[SHORT#n]` tem hook+cta e é
   auto-contido; duração alvo plausível dado o número de segmentos.
5. Problemas comuns: card não moveu (verificar `docker compose logs api | grep artifacts`
   — erros de validação do observador S1-03); sessão aberta no diretório errado; arquivo
   escrito parcialmente (regravar e conferir debounce).
6. Dry run: executar o passo-a-passo numa VPS/dev real, ajustar comandos que divergirem
   e registrar na Nota final a data da última validação.

## Critérios de aceite

- [ ] O guia leva um humano do SSH ao prompt sem conhecimento externo ao repo
- [ ] ≥3 prompts copiáveis coerentes com o AGENTS.md gerado pela S1-01
- [ ] Comandos testados manualmente (dry run documentado)
- [ ] Aponta corretamente para `script.json`, o schema e a fila do dashboard

## Verificação

```bash
npm run check                          # doc-only: nada deve quebrar
ls docs/guides/opencode-scripting.md
# Revisão humana: seguir o guia linha a linha numa VPS/dev e corrigir divergências
```

## Notas

- Guia é vivo: qualquer mudança nas convenções do AGENTS.md (S1-01) exige releitura
  deste documento no mesmo commit.
- Prompts devem mandar o agente **seguir o AGENTS.md**, nunca colar o schema no prompt —
  a fonte única evita drift entre versões.
- Deixar claro que o card move sozinho (observador): se precisar forçar revalidação,
  `touch script.json` basta — não regravar o arquivo inteiro.
