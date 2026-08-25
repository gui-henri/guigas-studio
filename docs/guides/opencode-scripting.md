# Guia — Roteirizando um vídeo com OpenCode (via SSH)

> Como produzir o `script.json` de um vídeo usando o OpenCode dentro do workspace,
> e o que conferir antes de abrir o dashboard.
>
> Última validação: **pendente** — dry run completo acontece na primeira VPS real (S0-17/S6-01).

## Pré-requisitos

- Acesso SSH à VPS do Studio (`ssh <vps>`), com Docker a rodar (`docker compose ps` mostra api/postgres/caddy no ar).
- Um vídeo na fila com status **Roteiro pendente** (`script_pending`) — o watcher RSS cria isso sozinho quando um post sai no blog.
- `opencode` instalado na VPS.

## Passo-a-passo

```bash
# 1. Entre na VPS
ssh <vps>

# 2. Localize o slug: pelo dashboard (fila script_pending) ou direto no disco
ls /data/videos/

# 3. Entre no workspace DO VÍDEO (o AGENTS.md é válido só dentro dele)
cd /data/videos/<slug>/

# 4. Leia as convenções e o material — é TUDO que o agente precisa ver
cat context/AGENTS.md
cat context/post.md
cat context/method/beats.md context/method/shorts.md

# 5. Abra o OpenCode dentro deste diretório
opencode

# 6. Cole um dos prompts abaixo, revise a saída com o agente

# 7. Confira o resultado na raiz do workspace
jq . script.json        # precisa parsear sem erro
```

O card no dashboard move para **Roteiro em revisão** sozinho em ~1 s depois de você
salvar `script.json` (o observador valida). Não precisa tocar em nada na VPS.

## Prompts prontos

### (a) Gerar o roteiro inicial (2 shorts)

```text
Leia o context/AGENTS.md e siga TODAS as convenções dele (formato do script.json,
beats, marcação [SHORT#n], emoções). Depois leia context/post.md e produza o roteiro
completo do vídeo: alvo de 10 minutos (target.durationMin = 10), beats na ordem do
método (hook → setup → exemplo → payoff → cta), com exatamente 2 shorts marcados
([SHORT#1] e [SHORT#2]), cada um auto-contido com hook próprio + cta.
Grave o resultado como script.json na raiz do workspace.
```

### (b) Refinar um segmento após feedback da revisão

```text
No script.json atual, reescreva o segmento "exemplo-zdr": a revisão pediu uma abertura
mais concreta nos primeiros 15 segundos (número ou contraste antes/depois) e frases mais
curtas, faladas. Mantenha o beat e a emoção; não mexa nos outros segmentos nem nos shorts.
Grave o script.json atualizado.
```

### (c) Corrigir erros de validação reportados no log

```text
O observador do Studio rejeitou o script.json com estes erros:
<cole aqui as linhas de erro do log, ex.:
  "schema validation failed: at '/segments/0/beat': got 'BEAT_ABERTURA', want ...">
Corrija cada erro seguindo as regras do context/AGENTS.md (enums válidos de beat/emotion,
ids únicos, shorts sequenciais 1..N com hook+cta) e grave o script.json corrigido.
```

Para pegar os erros: `docker compose logs api | grep artifacts | tail` na VPS.

## Checklist antes de olhar o dashboard

- [ ] `script.json` existe na **raiz** do workspace (`ls script.json`)
- [ ] JSON parseia: `jq . script.json` sem erro
- [ ] Beats na ordem do método: hook → setup → example(s) → payoff → cta
- [ ] Todo `[SHORT#n]` tem hook + cta preenchidos e é auto-contido (recortável sem contexto)
- [ ] Duração plausível: ~150 palavras/min narradas × `durationMin`
- [ ] Nada foi gravado dentro de `context/` (é material de leitura)

## Problemas comuns

| Sintoma | Causa provável / correção |
| --- | --- |
| Card não saiu de Roteiro pendente | Validação falhou: `docker compose logs api \| grep artifacts`. Erros aparecem estruturados no log; corrija com o prompt (c). |
| Sessão aberta no diretório errado | O `AGENTS.md` vive em `videos/<slug>/context/`. Sem ele o agente inventa o formato — feche e reabra no workspace certo. |
| Escrevi o arquivo mas nada aconteceu | Escrita parcial/atomicidade: aguarde ~1 s (debounce) ou force revalidação com `touch script.json`. |
| Mudei convenções e quero regenerar tudo | Convenções vivem no template versionado do repo (`backend/internal/templates/agents.md`); cada workspace congela a cópia gerada — edite a cópia local ou re-scaffold. |

## Referências

- Contrato do roteiro: `proto/app/studio/v1/script.proto` (canônico) +
  `backend/internal/artifacts/schemas/studio_script.schema.json` (validação FS)
- Fila e revisão: dashboard → cards por status → página `/videos/<id>`
- Estados da máquina: `docs/tasks/ROADMAP.md → Máquina de estados do vídeo`
