---
id: S6-07
titulo: "Configurar backup offsite do /data"
sprint: 6
prioridade: P3
depende_de: []
estimativa_h: 2
status: todo
---

# S6-07 — Configurar backup offsite do /data

## Objetivo

Proteger `/data` da VPS (workspaces git dos vídeos + binários) com backup offsite
automático via restic ou rclone, agendado por cron no host, com teste de restauração
documentado e política de retenção simples.

## Contexto

Tarefa P3 opcional (D-11): o disco da VPS é o armazenamento oficial dos artefatos e do
workspace git de vídeos (T-07), então perdê-lo significa perder a memória inteira da
produção. O provedor de backup é uma não-decisão consciente (DECISIONS §3): B2, S3 ou
SFTP genérico — decide-se NA EXECUÇÃO desta tarefa. Sem código no repo: os scripts vivem
na VPS; o que versionamos é a documentação.

## Pré-requisitos

- SSH root/sudo na VPS com stack rodando (D-08).
- Conta/destino offsite criado na execução (B2/S3/SFTP) + credenciais em mão.
- Ferramenta escolhida: restic (snapshots versionados + criptografia) ou rclone (sync
  simples) — instale a escolhida na VPS.

## Passos

1. Decidir e registrar o destino (B2/S3/genérico SFTP); criar bucket/diretório remoto e
   guardar as credenciais no `.env` do host (nunca no repo).
2. Escrever `/usr/local/bin/studio-backup.sh` na VPS chamando a ferramenta sobre `/data`,
   com lock (`flock`) para evitar execuções sobrepostas e log em arquivo.
3. Agendar pelo cron do host (ex.: diário de madrugada): `crontab -e` com entrada
   `STUDIO_BACKUP`; alternativa aceitável: systemd timer.
4. Definir retenção simples e explícita:
   - restic: `restic forget --keep-daily 7 --keep-weekly 4 --prune` ao fim do script;
   - rclone: sync para pasta datada (ex.: `backup-YYYY-MM-DD`) podando além da retenção.
5. Criar `docs/guides/backup-offsite.md` neste repo documentando: destino (sem segredos),
   agendamento, retenção e **como restaurar** passo a passo.
6. Executar um teste de restauração REAL: restaurar um snapshot recente para diretório
   temporário, conferir integridade (`git -C <restore>/videos status` limpo, um `.wav`
   presente, um MP4 abre) e registrar data+resultado no doc.
7. Confirmar a segunda execução automática do cron (log mostra sucesso sem intervenção).

**Convenções**: docs em PT-BR (D-06); nenhum segredo versionado (D-11/S0-01).

## Critérios de aceite

- [ ] Backup automático diário ativo no cron do host (2ª execução confirmada no log)
- [ ] Retenção definida e verificada (snapshots antigos podados conforme política)
- [ ] Teste de restauração executado e documentado com data e resultado
- [ ] `docs/guides/backup-offsite.md` permite restaurar sem consultar memória externa

## Verificação

Evidências desta tarefa operacional:

- Saída do log da última execução (`studio-backup.log`) e listagem de snapshots no destino.
- Trecho do doc de backup mostrando o registro do teste de restauração (comandos + data).

```bash
# Tarefa infra/docs — nada de código do monorepo tocado; npm run check dispensável.
```

## Notas

- Restic é a opção mais simples alinhada: versões + criptografia num binário só; rclone
  serve se o destino escolhido não suportar restic (ex.: SFTP puro).
- Restaurar `/data` restaura também o histórico git dos vídeos (T-07) — não é preciso
  backup separado do repositório de vídeos.
- Banda apertada? Excluir `renders/` antigos da política de retenção local antes de
  reduzir frequência de backup.
