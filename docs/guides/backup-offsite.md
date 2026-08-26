# Backup offsite do /data — runbook de configuração

> Preparado pela S6-07 para execução na VPS. O destino offsite é decisão da execução
> (DECISIONS §3): **restic sobre B2/S3** (preferido) ou rclone/SFTP. Nenhum segredo
> vai ao repo — credenciais vivem no `.env` do host.

## 1. Escolher destino e instalar

```bash
# Opção A (recomendada): restic
apt install restic            # ou: wget o binário do GitHub releases
# Opção B: rclone (se destino não suportar restic)
apt install rclone && rclone config
```

Crie o bucket/diretório remoto e guarde credenciais no `/opt/guigas/.env` do host:

```bash
# restic (B2 exemplo)
export RESTIC_REPOSITORY="b2:<bucket>:guigas-backup"
export RESTIC_PASSWORD="<senha-forte-gerada>"     # PERDER ISTO = perder backups
export B2_ACCOUNT_ID="..." ; export B2_ACCOUNT_KEY="..."
```

## 2. Script de backup (`/usr/local/bin/studio-backup.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/studio-backup.lock
flock -n 9 || { echo "$(date -Is) já em execução; saindo" >> /var/log/studio-backup.log; exit 0; }
source /opt/guigas/.env

restic backup /data --tag guigas >> /var/log/studio-backup.log 2>&1
restic forget --keep-daily 7 --keep-weekly 4 --prune >> /var/log/studio-backup.log 2>&1
echo "$(date -Is) OK" >> /var/log/studio-backup.log
```

```bash
chmod +x /usr/local/bin/studio-backup.sh
```

### Variante rclone (sync datado + poda)

```bash
rclone sync /data remote:guigas/backup-$(date +%F) >> /var/log/studio-backup.log 2>&1
# poda: remover pastas com mais de 30 dias (find no mount remoto via rclone lsf)
```

## 3. Agendamento (cron do host)

`crontab -e`:

```cron
STUDIO_BACKUP=1
15 4 * * * /usr/local/bin/studio-backup.sh
```

Confirmar a segunda execução automática: `grep OK /var/log/studio-backup.log`
deve mostrar duas datas consecutivas sem intervenção.

## 4. Teste de restauração (obrigatório)

```bash
RESTIC_REPOSITORY=... RESTIC_PASSWORD=... restic restore latest --target /tmp/restore-test
git -C /tmp/restore-test/data/videos/<slug> status      # deve estar limpo
ls /tmp/restore-test/data/videos/<slug>/audio/*.wav     # ≥1 wav presente
ffprobe /tmp/restore-test/data/videos/<slug>/renders/long.mp4   # abre, duração ok
```

Registrar abaixo data + resultado.

## 5. Registro de execuções

| Data | Tipo | Resultado |
| --- | --- | --- |
| _(pendente execução)_ | restauração | |
| _(pendente)_ | 2ª execução automática do cron | |

## Retenção

restic: 7 diários + 4 semanais com `--prune`. Ajuste por espaço; nunca desligue a
criptografia (RESTIC_PASSWORD).
