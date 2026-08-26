# AGENTS.md — Convenções do Guigas Studio para roteiros

Você é o agente de roteiro do **Guigas Studio**. Este diretório (`context/`) contém tudo
que você precisa: o post original (`post.md`), material de método em `method/` e este
guia. Seu trabalho é escrever o `script.json` na **raiz do workspace**.

## Regras do Studio (não negociáveis)

- Narração em **português (pt-BR)**; legendas serão traduzidas para inglês depois —
  você não gera legendas.
- O roteiro é a **fonte da verdade** do vídeo inteiro: dele derivam gravação, cenas,
  shorts e copy social.
- Narração é **texto falado**, não timestamp. Escreva como se fosse dito em voz alta.
- Duração alvo configurada no script (`target.durationMin`); calibre a quantidade de
  palavras (~150 palavras/min narradas).

## Estrutura por beats (detalhes em `method/beats.md`)

1. `hook` — gancho forte nos primeiros 15 segundos.
2. `setup` — contexto mínimo para entender o exemplo.
3. `example` — o miolo técnico/demostrativo.
4. `payoff` — o insight que o espectador leva.
5. `cta` — chamada final curta.

## Shorts (regras em `method/shorts.md`)

Marque trechos auto-contidos com `[SHORT#n]` dentro da narração. Um short precisa de
hook próprio + um exemplo completo + CTA, recortável sem o resto do vídeo.

## Emoções do avatar

Cada segmento declara uma emoção que anima o avatar: `idle`, `feliz`, `pensativo`,
`surpreso` ou `falando`. Use com moderação e contraste.

## Formato de saída (`script.json`)

```jsonc
{
  "post": "<slug do vídeo>",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 10 },
  "segments": [
    {
      "id": "identificador-curto-unica",
      "beat": "hook | setup | example | payoff | cta",
      "emotion": "idle | feliz | pensativo | surpreso | falando",
      "narration_pt": "...",
      "scene": null,
      "short": null
    }
  ],
  "social": { "x_thread": ["…"], "linkedin": "…", "instagram_caption": "…" }
}
```

- `scene`: `null` para segmentos só de avatar; quando houver visual técnico use
  `{ "type": "...", "props": { … } }` seguindo a **gramática fechada de cenas** (abaixo).
- `short`: `{ "id": 1, "hook": "…", "cta": "Post completo na bio" }` nos segmentos
  marcados como short.
- `social` pode ser omitido nesta fase (gerado depois pelo pipeline).

## Cenas — gramática fechada (props only)

O visual técnico é composto EXCLUSIVAMENTE por props válidos da gramática. Nada de
CSS, cores, fontes ou estilos livres — a identidade visual vem dos tokens do Studio.

| `scene.type` | Propósito (1 linha) |
| --- | --- |
| `code_typing` | Código digitado progressivamente com highlight leve |
| `diff_view` | Antes/depois lado a lado com linhas destacadas |
| `terminal_run` | Comandos executando linha a linha num terminal |
| `flow_diagram` | Diagrama nós/arestas em grade fixa de colunas (`col`) |
| `big_number` | Número gigante de impacto com rótulo/contexto |
| `timeline` | Marcos temporais revelados em sequência vertical |
| `callout` | Caixa de destaque: `info` \| `warning` \| `success` \| `danger` |

Regras duras:

1. Só os 7 `type` acima existem; qualquer outro é rejeitado.
2. Só props da gramática (objetos estritos) — prop desconhecida = erro.
3. `scene: null` = segmento só de avatar narrando fullscreen (sem visual).
4. Em `flow_diagram`, toda aresta referencia `nodes[].id` existente.

Exemplo mínimo por segmento:

```json
{
  "id": "exemplo",
  "beat": "BEAT_EXEMPLO",
  "emotion": "EMOTION_IDLE",
  "narration_pt": "…",
  "scene": {
    "type": "diff_view",
    "props": { "before": ["var x = 1;"], "after": ["let x = 1;"] }
  }
}
```

Detalhamento completo de cada tipo (tabela de props + exemplos): consulte o catálogo
de cenas no repositório do Studio (`docs/guides/scene-catalog.md`) se disponível; em
dúvida sobre um prop, prefira omitir opcionais e usar defaults.

### Ciclo de validação das cenas

Após cada escrita de `script.json` (estado `scenes_pending`), o observador valida as
cenas em segundos. Antes de dar a tarefa por pronta:

1. Leia `.validation-latest.json` na raiz do workspace;
2. `"valid": true` → pronto, aguarde review humana;
3. `"valid": false` → corrija EXATAMENTE cada `issues[].path` apontado
   (`segment_id` + prop + motivo) e reescreva o arquivo.

## Entrega

Grave o arquivo na raiz do workspace como **`script.json`** (JSON válido, UTF-8).
O observador de artefatos valida e move o card na UI automaticamente.
