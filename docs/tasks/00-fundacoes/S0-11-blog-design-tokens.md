---
id: S0-11
titulo: "Design tokens do blog (warm paper/muted ink/serif+mono) como tema global"
sprint: 0
prioridade: P1
depende_de: ["S0-09"]
estimativa_h: 1
status: todo
---

# S0-11 — Design tokens do blog como tema global

## Objetivo

Identidade visual do blog dentro do Studio (SPEC #10): tokens *warm paper*, *muted ink*,
títulos serif e código mono definidos uma única vez como CSS vars no tema Tailwind, com
página de demonstração mínima — base visual do dashboard e futura referência das cenas.

## Contexto

Tailwind v4 é CSS-first (S0-09): o tema vive em `@theme` dentro de `src/index.css`, sem
`tailwind.config.js`. Os mesmos tokens pintarão os componentes de cena do remotion-kit
(S4-02/S4-03) — centralizar agora evita hex solto depois.

## Pré-requisitos

- S0-09 done (SPA buildando, `src/index.css` com `@import "tailwindcss";`).

## Passos

1. Definir em `src/index.css` via `@theme` (valores iniciais — ajuste fino visual esperado):
   - `--color-paper: #f6f1e7; --color-ink: #2a2520; --color-accent: #b45309;`
   - `--font-display: "Iowan Old Style", Georgia, serif;`
   - `--font-mono: ui-monospace, "JetBrains Mono", "Cascadia Code", monospace;`
2. Aplicar base global: `body { background paper; color ink; }` e títulos com
   `font-display`; conferir que as utilitárias geradas existem (`bg-paper`, `text-ink`,
   `font-display`, `font-mono`, opacidades tipo `border-ink/10`).
3. Criar `src/pages/StyleDemoPage.tsx` na rota protegida `/style`: h1/h2 serif, parágrafo,
   citação, bloco `<pre><code>` mono, botão primário (accent) e secundário (outline),
   card com borda suave — vitrine de todos os tokens.
4. Link temporário "Style" na navegação (a S0-12 reorganiza a nav).
5. Varrer componentes existentes e remover qualquer hex/font-family inline fora do tema.

## Critérios de aceite

- [ ] Todos os valores visuais vivem em `@theme`; componentes só usam classes utilitárias
- [ ] `/style` demonstra cor de fundo/tinta, display serif e mono de código
- [ ] `npm run check` continua verde (build/lint)

## Verificação

```bash
npm run check
npm run dev --workspace frontend   # abrir /style autenticado e conferir os tokens
```

## Notas

- Stacks de sistema de propósito: zero download de webfont (privacidade/perf); self-host
  de fontes é backlog consciente.
- Dark mode não foi decidido — não implementar sem decisão registrada.
- Quando o remotion-kit existir, extrair a paleta para um módulo TS compartilhado para as
  cenas consumirem os mesmos valores; hoje a duplicação CSS é aceita e anotada.
