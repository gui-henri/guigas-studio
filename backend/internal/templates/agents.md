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
  `{ "type": "...", "props": { … } }` (o catálogo de cenas é definido no Sprint 4 —
  até lá prefira `null`).
- `short`: `{ "id": 1, "hook": "…", "cta": "Post completo na bio" }` nos segmentos
  marcados como short.
- `social` pode ser omitido nesta fase (gerado depois pelo pipeline).

## Entrega

Grave o arquivo na raiz do workspace como **`script.json`** (JSON válido, UTF-8).
O observador de artefatos valida e move o card na UI automaticamente.
