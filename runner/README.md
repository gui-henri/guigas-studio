# Runner daemon (@guigas/runner)

Daemon local que consome a fila de render do Studio (S5-03). Node ≥ 22 nativo
(Windows sem WSL — D-13).

## Configuração (env)

| Variável | Obrigatória | Default | Descrição |
| --- | --- | --- | --- |
| `STUDIO_URL` | sim | — | Base URL do server (ex.: `https://studio.seudominio.com`) |
| `RUNNER_TOKEN` | sim | — | PAT de máquina (aceito só pelo JobService) |
| `RUNNER_ID` | não | `runner-<pid>` | Identidade estável do runner |
| `WORK_DIR` | não | `./work` | Raiz de trabalho por vídeo |
| `POLL_INTERVAL_MS` | não | `10000` | Intervalo de polling ocioso |
| `HEARTBEAT_INTERVAL_MS` | não | `10000` | Keepalive durante o job |

## Rodando

```powershell
# Windows PowerShell — terminal 1: server dev; terminal 2:
$env:STUDIO_URL = "http://localhost:8080"
$env:RUNNER_TOKEN = "cole-aqui-o-token"
npm run dev -w runner
```

Auto-start opcional no logon:

```powershell
schtasks /create /tn guigas-runner /tr "npm run start -w runner" /sc onlogon
```

(ou um atalho `.cmd` em `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`)
