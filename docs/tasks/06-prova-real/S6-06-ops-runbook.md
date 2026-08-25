---
id: S6-06
titulo: "Escrever o runbook de operação contínua"
sprint: 6
prioridade: P1
depende_de: [S6-05]
estimativa_h: 2
status: todo
---

# S6-06 — Escrever o runbook de operação contínua

## Objetivo

Criar `docs/guides/runbook.md`: o manual único para produzir vídeos em ritmo contínuo
(cadência-alvo 2/mês, SPEC §2 #18) — rotina semanal ponta a ponta, métricas a acompanhar,
procedimentos de recuperação e mapa dos segredos/env.

## Contexto

Converte a experiência da prova real (S6-01..S6-05) em operação sustentável — a seção
"Operação contínua" do SPEC §7 (horas humanas por vídeo; cadência 2 vídeos/mês por 2 meses;
% social publicado vs gerado). Depende da retro porque consolida procedimentos já
validados no vídeo #1, não teoria. Nada de código novo: é uma tarefa de documentação.

## Pré-requisitos

- `S6-05` com `status: done` (retro com lições e métricas reais).
- Acesso ao `docker-compose.prod.yml` e `.env.example` para conferir nomes de variáveis.

## Passos

1. Criar `docs/guides/runbook.md` com quatro seções fixas: **Rotina semanal** ·
   **Métricas** · **Recuperação** · **Segredos e env**.
2. Rotina semanal: checklist do início ao fim derivado do vídeo #1 — confirmar que o
   watcher pegou o post → sessão OpenCode p/ roteiro (guia S1-09) → aprovar na UI →
   gravar segmentos → conferir voz/visemes nos previews → sessão OpenCode p/ cenas
   (guia S4-10) → aprovar cena a cena → subir runner → acompanhar render → revisão final
   → baixar `releases/` → publicar YouTube/shorts/sociais → fechar checklist → anotar
   horas gastas.
3. Métricas: definir fórmula e onde registrar cada uma (tabela no runbook ou retro por
   vídeo) — horas humanas/vídeo, cadência mensal vs 2/mês, % social publicado vs gerado.
4. Recuperação, um procedimento passo a passo por cenário:
   - **Runner caiu**: reiniciar o daemon local; jobs com heartbeat expirado voltam à fila
     (S5-01) — nada se perde.
   - **Render falhou**: ler o motivo estruturado do `FailJob` no card, corrigir a causa,
     pedir re-render pela UI (S5-10).
   - **VPS reiniciou**: `docker compose up -d` (D-08); migrações são idempotentes (T-05);
     watcher faz catch-up (SPEC §4.1); clientes SSE reconectam.
5. Segredos e env: listar ONDE moram (`.env` da VPS fora do repo — gitignored desde S0-01)
   e O QUE existe: `STUDIO_USERNAME` + hash argon2id, `JWT_SECRET`, `RUNNER_TOKEN`,
   credencial Gemini API (D-04/T-06/D-12). Incluir como rotacionar cada um. Nunca escrever
   valores no runbook.
6. Reexecutar mentalmente o runbook contra o vídeo #1 e ajustar o que não bater.

**Convenções**: docs em PT-BR (D-06); comandos copiáveis; referências por ID de tarefa.

## Critérios de aceite

- [ ] `docs/guides/runbook.md` com as 4 seções e checklist semanal completo
- [ ] Os 3 procedimentos de recuperação documentados passo a passo
- [ ] Métricas com fórmula, meta (SPEC §7) e local de registro definidos
- [ ] Nenhum valor de segredo no doc (apenas nomes de variáveis e locais)

## Verificação

Evidências desta tarefa operacional:

- Doc commitada; conferência cruzada dos nomes de variáveis com `.env.example`
  e `docker-compose.prod.yml`.
- Checklist semanal executável sem consultar memória das sessões do sprint 6.

```bash
# Tarefa de documentação pura — npm run check dispensável (nada de código tocado).
```

## Notas

- Runbook descreve operação contínua, não instalação (deploy vive nas tarefas dos
  sprints 0/5); evite duplicar passos de setup.
- Sempre que uma falha real exigir um procedimento novo, atualize o runbook NA MESMA
  sessão — runbook desatualizado é pior que nenhum.
- Backup offsite fica em tarefa própria (S6-07) e só referencia este doc.
