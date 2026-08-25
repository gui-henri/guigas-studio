# Método — Marcação de shorts `[SHORT#n]`

Shorts são recortes **auto-contidos** do vídeo longo. Você os marca dentro da narração
com a linha `[SHORT#n]` imediatamente antes do trecho que inicia o short.

## Critério de trecho auto-contido

1. **Hook próprio** nos primeiros 2 segundos (pode repetir o hook do vídeo).
2. **Um exemplo completo** — começa, acontece e termina dentro do short.
3. **CTA final** ("Post completo na bio", "Parte do vídeo longo").

## Formato no script.json

O segmento que abre o short recebe:

```jsonc
{
  "id": "short-1-abertura",
  "beat": "hook",
  "emotion": "surpreso",
  "narration_pt": "[SHORT#1] …restante da narração…",
  "short": { "id": 1, "hook": "frase de gancho isolada", "cta": "Post completo na bio" }
}
```

## Regras

- Alvo de duração: 30–60 s por short (2–3 segmentos).
- Não aninhe shorts nem sobreponha intervalos.
- 2–4 shorts por vídeo de 8–12 min é o ponto ideal.
