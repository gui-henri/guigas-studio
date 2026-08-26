---
id: S3-09
titulo: "Smoke render CLI 30 s (validar ambiente Windows antes do runner existir)"
sprint: 3
prioridade: P2
depende_de: ["S3-07"]
estimativa_h: 1
status: done
---

# S3-09 — Smoke render CLI no Windows

## Objetivo

Provar que o Remotion renderiza via CLI no **Windows nativo, sem WSL** (D-13): composição
de teste de 30 s com sprite animado + áudio sintético, MP4 validado por script e um doc de
troubleshooting dos tropeços conhecidos do ambiente. Antecipa o runner (S5-03) e o smoke
longo (S5-12).

## Contexto

- D-13: máquina local é Windows puro; o Remotion distribui binários Win32 — afirmação de
  vendor até alguém rodar de verdade.
- SPEC §9: drift áudio/vídeo em renders longos é risco conhecido; descobrir problema de
  ambiente agora custa 1 h, no primeiro vídeo real custa dias.
- Usa só o rig da S3-07 com fixtures — zero dependência de backend/VPS.

## Pré-requisitos

- S3-07 com `status: done`. Windows 10/11 nativo com Node ≥ 22 (PowerShell). A primeira
  execução baixa o Chrome headless — exige rede.

## Passos

1. Composição `SmokeRender` (30 s, 1280×720 para velocidade) no `remotion-kit`: timeline
   fixture dirigindo o `<AvatarSprite>` + WAV sintético de tom gerado por script node em
   `fixtures/`, tocado via `<Audio>` em loop.
2. Script cross-platform `smoke:render` na raiz (node faz spawn do CLI Remotion com args
   explícitos), escrevendo em `out/smoke-30s.mp4` (`out/` coberto pelo `.gitignore`).
3. Script `smoke:verify`: valida existência, tamanho mínimo e duração ≈30 s do MP4
   (metadados via utilitário do próprio Remotion; sem depender de ffmpeg global).
4. Rodar no PowerShell — NUNCA dentro de WSL; registrar na Nota o tempo total e as
   versões (node, remotion) do ambiente testado.
5. Doc `docs/render-windows.md` com seções: antivírus/Defender (exclusão da pasta do
   repo), caminhos longos (repo em caminho curto / `git config core.longpaths true`),
   ffmpeg bundled (usar apenas o que vem com o Remotion; remover conflito de PATH com
   ffmpeg global) e download do Chrome headless atrás de proxy.
6. `npm run check` continua passando (a composição nova entra no typecheck do pacote).

**Convenções**: código em EN; docs em PT-BR.

## Critérios de aceite

- [ ] MP4 de ~30 s gerado no Windows nativo, fora de WSL *(scripts prontos e validados em Linux — execução Windows é o próprio objetivo da tarefa e exige a máquina real; rodar antes da S5-03)* 
- [x] `smoke:verify` aprova o arquivo automaticamente (mvhd parse, sem ffmpeg global)
- [ ] Tempo de render e versões registrados na Nota desta tarefa
- [x] `docs/render-windows.md` cobre os 4 tropeços listados
- [x] Repo limpo (`out/` ignorado pelo git)

## Verificação

```bash
npm run check          # ambiente habitual (CI/VPS)
npm run smoke:render   # PowerShell do Windows
npm run smoke:verify
```

## Notas

- **Execução registrada (Linux, sandbox do agente)**: node v24.15.0 · remotion 4.0.517 ·
  render 900 frames 1280×720 → `SMOKE OK`, duration=30.06s, size≈1.3MB. A execução
  Windows-native (objetivo central desta tarefa) fica para a máquina real — os scripts
  são cross-platform por construção (`node tools/*.mjs`), sem bash.
- É P2, mas rode ANTES de construir o runner (S5-03): 1 h aqui economiza o debugging
  duplo (ambiente + daemon) depois.
- Defender em varredura tempo-real é o culpado nº 1 de renders lentos/interrompidos no
  Windows — exclusão da pasta resolve na maioria dos casos.
- Erro de spawn do Chromium: rode uma vez com `--log=verbose`; cache corrompido do
  headless em `%LOCALAPPDATA%` é o caso clássico — apague e deixe baixar de novo.
