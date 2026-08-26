# Renderizando com Remotion no Windows nativo (sem WSL)

> Troubleshooting dos tropeços conhecidos do ambiente Windows para o CLI do Remotion
> (`npm run smoke:render` / `smoke:verify` e o runner da S5-03). Comandos no **PowerShell**.

## 1. Antivírus / Defender

A varredura em tempo-real é o culpado nº 1 de renders lentos ou interrompidos: o Remotion
grava frames intermediários e o MP4 final no disco repetidamente.

**Correção**: exclua a pasta do repositório (e `%LOCALAPPDATA%\Remotion`) das varreduras.

```powershell
Add-MpPreference -ExclusionPath "C:\caminho\curto\guigas-studio"
```

## 2. Caminhos longos

O cache de node_modules estoura o limite histórico de 260 caracteres.

**Correção**: clone o repo em um caminho curto (`C:\dev\guigas-studio`) e habilite:

```powershell
git config --global core.longpaths true
```

## 3. ffmpeg conflitante no PATH

O Remotion traz seu próprio ffmpeg embutido. Um ffmpeg global antigo no PATH pode ser
chamado por engano por scripts seus e quebrar o pipeline silenciosamente.

**Correção**: nos scripts do Studio use SEMPRE os utilitários do próprio Remotion
(`@remotion/renderer`). Se precisar remover o conflito:

```powershell
where.exe ffmpeg   # descubra qual binário vence
```

e remova/renomeie o concorrente.

## 4. Download do Chrome Headless atrás de proxy

A primeira renderização baixa o Chrome Headless Shell (~150 MB). Sem acesso direto à
internet o download falha e o erro se repete mesmo com `--log=verbose`.

**Correção**: configure as variáveis clássicas antes do comando:

```powershell
$env:HTTPS_PROXY = "http://proxy.empresa:8080"
npx remotion browser ensure
```

Se o cache corromper (`%LOCALAPPDATA%\Remotion`), apague a pasta e deixe baixar de novo.
Mantenha também `PUPPETEER_SKIP_DOWNLOAD=1` fora — aqui o download é desejado.

## Checklist rápido

```powershell
node -v            # >= 22
npm run check      # toolchain habitual (buf/sqlc/go/npm)
npm run smoke:render   # gera out\smoke-30s.mp4 (~1 min)
npm run smoke:verify   # valida duração ~30s automaticamente
```
