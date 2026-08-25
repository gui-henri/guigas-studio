---
id: S3-06
titulo: "remotion-kit scaffold: composição raiz LongForm/Short + PlayerHost no frontend"
sprint: 3
prioridade: P0
depende_de: ["S0-09"]
estimativa_h: 2
status: done
---

# S3-06 — Scaffold do `remotion-kit`

## Objetivo

Pacote `remotion-kit/` vivo: composições raiz LongForm (1080p 16:9) e Short (1080×1920),
tipos de props derivados dos tipos TS gerados do proto (nada de schema duplicado) e o
componente `PlayerHost` já consumido pelo frontend — o `<Player>` roda no bundle da SPA
(T-02), eliminando o bundle-servidor do SPEC §4.5.

## Contexto

- D-09: `remotion-kit` é compartilhado entre preview (SPA) e render final (runner, T-03).
- T-02: frontend importa o pacote direto; workspaces npm (D-16); Remotion 4.x (SPEC §5).
- Codegen TS do proto (S0-04) é a fonte dos tipos de props.
- Cenas de verdade vêm na S4 — aqui só o esqueleto navegável e renderizável.

## Pré-requisitos

- S0-09 com `status: done`. Node ≥ 22, npm ≥ 10.

## Passos

1. `remotion-kit/package.json`: dependência `remotion` em versão **exata** (sem `^`) +
   peers react/react-dom; script `build` = `tsc --noEmit` (typecheck) — sem bundling
   próprio: o Vite consome o source TS e o runner usará `remotion bundle` (T-03).
2. No frontend: instalar `@remotion/player` na MESMA versão exata e declarar a
   dependência de workspace ao `remotion-kit`; ajustar Vite para transpilar o pacote
   linkado (ver Notas se reclamar).
3. `remotion-kit/src/index.tsx`: `registerRoot` + composições raiz `LongForm`
   (1920×1080, 30 fps, duração derivada dos props) e `Short` (1080×1920, mesmas props).
4. Props tipados importando os tipos TS GERADOS do proto (pacote compartilhado do
   codegen da S0-04) — proibido recriar esses schemas à mão em TS.
5. Cena placeholder mínima (AbsoluteFill + título/segmento) só para o preview não nascer
   vazio; será substituída pela gramática da S4.
6. Exportar `PlayerHost`: wrapper do `<Player>` com props tipados, dimensões responsivas
   contidas e error boundary; sem lógica de fetch (dados entram por props).
7. Rota `/dev/player` no frontend consumindo `PlayerHost` com props fixture — prova de
   integração ponta a ponta dentro do bundle da SPA.
8. Documentar o smoke de render CLI de 5 s (comando na Verificação) — smoke longo e
   Windows é a S3-09.

**Convenções**: código em EN; docs em PT-BR; versão Remotion pinned idêntica em todos os
pacotes que a tocam.

## Critérios de aceite

- [x] `LongForm` e `Short` registradas e renderizáveis via CLI (smoke5s.mp4 gerado, 242KB, 0-149 frames)
- [x] Tipos de props vêm do codegen proto (gen próprio em remotion-kit/src/gen) — zero schema TS paralelo
- [x] `PlayerHost` do workspace renderiza na SPA em `/dev/player`
- [x] `npm run build --workspaces` passa com o typecheck do pacote
- [x] Smoke 5 s documentado e executado (comando da Verificação)

## Verificação

```bash
npm run check
npx remotion render remotion-kit/src/index.tsx LongForm out/smoke5s.mp4 \
  --props=remotion-kit/fixtures/smoke.json --frames=0-149 --log=error
```

## Notas

- **Escolha registrada**: sem schema zod nas composições (evitaria duplicar tipos do proto);
  `Composition` usa componente loose + cast controlado, e a tipagem pública forte vive em
  `StudioVideoProps`/`PlayerHost` (ambos derivados do codegen).
- CLI de render vive em `@remotion/cli` (o pacote `remotion` não traz binário); instalado
  como devDep pinned 4.0.517 no remotion-kit.
- Pin absoluto de versão entre `remotion` e `@remotion/player`: minor misturado quebra o
  `<Player>` de formas sutis, e drift de render já é risco registrado (SPEC §9).
- `--frames=0-149` mantém o smoke em 5 s mesmo que a composição declare duração maior —
  nunca renderize tudo para validar toolchain.
- Se o Vite reclamar de processar TS dentro do pacote linkado, marque-o em
  `optimizeDeps.exclude`; correção conhecida — não reestruture o pacote por causa disso.
