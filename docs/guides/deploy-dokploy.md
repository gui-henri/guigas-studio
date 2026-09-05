# Guia de Deploy no Dokploy (PostgreSQL Desacoplado + Single Container)

> Este guia documenta o deploy em produção do **Guigas Studio** utilizando o **Dokploy** em uma VPS Linux.
> A arquitetura é simplificada: o **PostgreSQL 16** roda como serviço nativo de banco gerenciado pelo Dokploy (com backups automáticos agendados), o **Traefik** gerencia SSL/TLS e roteamento de borda, e o **Guigas Studio** roda como uma aplicação única (`api:8080`) servindo a API Go + a SPA estática do React.

---

## 1. Topologia de Produção

```
Internet (HTTPS 443)
       │
       ▼
┌───────────────────────────────────────────────────────────────┐
│                    Traefik (Dokploy Edge)                     │
│  - Certificados SSL/TLS automáticos (Let's Encrypt)           │
│  - Proxy reverso direto para porta 8080                       │
└───────────────────────────────┬───────────────────────────────┘
                                │ (Rede Docker Interna)
                                ▼
┌───────────────────────────────────────────────────────────────┐
│              Aplicação: guigas-studio (Go + React)            │
│                                                               │
│  HTTP ServeMux (:8080):                                       │
│  ├── /app.studio.v1.*  ──▶ Connect-RPC Handlers               │
│  ├── /api/events       ──▶ SSE Hub (Streaming em tempo real)  │
│  ├── /api/v1/videos/*  ──▶ Uploads chunked de takes e MP4s    │
│  ├── /healthz          ──▶ Health check JSON                  │
│  └── /*                ──▶ SPA Estática React (fallback HTML) │
│                                                               │
│  Volume Persistente:                                          │
│  └── /data (Workspaces de vídeo, scripts, áudios, timelines)  │
└───────────────────────────────┬───────────────────────────────┘
                                │ (Rede Docker Interna)
                                ▼
┌───────────────────────────────────────────────────────────────┐
│               Serviço de Banco: studio-db                     │
│  - PostgreSQL 16 Alpine                                       │
│  - Volume persistente pgdata                                  │
│  - Backups diários automatizados (S3 / Local) pelo Dokploy    │
└───────────────────────────────────────────────────────────────┘
                                ▲
                                │ Polling unário (ClaimJob)
                                │ + Upload de MP4s
┌───────────────────────────────┴───────────────────────────────┐
│               Máquina Local de Trabalho (Windows)             │
│  - Runner Local Node/Remotion (Renderização pesada 1080p)     │
│  - Navegador Web (Gravação de áudio/webcam por segmento)      │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Passo a Passo de Configuração no Dokploy

### Passo 1: Criar o Banco de Dados (PostgreSQL)
1. No painel do Dokploy, acesse seu Projeto (ou crie `guigas-studio`).
2. Clique em **Create Service** $\rightarrow$ **Database** $\rightarrow$ **PostgreSQL**.
3. Nome do serviço: `studio-db`.
4. Configure as credenciais:
   - **Database**: `studio`
   - **User**: `studio`
   - **Password**: `gere_uma_senha_forte_aqui`
5. Na aba **Backups**, configure uma rotina de backup (ex: diário às 03:00) para seu storage S3 ou local.
6. Clique em **Deploy**. O PostgreSQL estará acessível internamente pelo hostname `studio-db:5432`.

---

### Passo 2: Criar a Aplicação (Guigas Studio)
1. No mesmo Projeto Dokploy, clique em **Create Service** $\rightarrow$ **Application**.
2. Nome do serviço: `studio-app`.
3. Na aba **Source**:
   - **Type**: `Git`
   - **Repository**: Selecione seu repositório `guigas-studio`
   - **Branch**: `main`
   - **Build Type**: `Dockerfile` (usará o `Dockerfile` raiz multi-stage)
4. Na aba **Environment Variables**, adicione:

```env
PORT=8080
DATA_DIR=/data
STATIC_DIR=/app/dist

# Conexão com o banco gerenciado no Passo 1
POSTGRES_HOST=studio-db
POSTGRES_PORT=5432
POSTGRES_USER=studio
POSTGRES_PASSWORD=gere_uma_senha_forte_aqui
POSTGRES_DB=studio

# Conta única de acesso
STUDIO_USERNAME=guigas
STUDIO_PASSWORD_HASH=$argon2id$v=19$m=65536,t=3,p=2$...seu_hash_argon2id...
JWT_SECRET=gere_uma_chave_aleatoria_de_32_bytes_minimo
RUNNER_TOKEN=gere_um_token_longo_para_o_runner

# Provedores externos
GEMINI_API_KEY=sua_chave_gemini_aqui
RSS_URL=https://seublog.com/rss.xml
RSS_POLL_INTERVAL=15m
```

5. Na aba **Volumes**:
   - Adicione um volume persistente para os vídeos:
     - **Host Path / Named Volume**: `studio_data`
     - **Container Path**: `/data`

6. Na aba **Domains**:
   - **Domain**: `studio.seudominio.com` (apontando via DNS A-record para o IP da VPS)
   - **Container Port**: `8080`
   - **Certificate**: `Let's Encrypt`

7. Clique em **Deploy**.
   - O Dokploy executará o build multi-stage (Node compila o React e Go compila a API).
   - O container subirá na porta 8080 com HTTPS ativo via Traefik.

---

## 3. Configurando e Rodando o Runner na Máquina Local (Windows)

Na sua máquina de trabalho:

1. Clone o repositório ou use o workspace existente.
2. Crie o arquivo `runner/.env`:

```env
STUDIO_URL=https://studio.seudominio.com
RUNNER_TOKEN=seu_runner_token_configurado_no_dokploy
POLL_INTERVAL_MS=10000
```

3. Inicie o daemon do runner:
```bash
npm run start -w runner
```

O runner ficará em escuta (polling unário `ClaimJob`). Quando você aprovar as cenas de um vídeo no dashboard web, o runner automaticamente:
1. Pega o job de renderização.
2. Baixa os artefatos sincronizados para o cache local.
3. Renderiza o vídeo longo 1080p e os Shorts 9:16 com áudio 48 kHz mono e 30 fps via Remotion.
4. Faz o upload dos arquivos MP4 de volta para a VPS e finaliza o job.

---

## 4. Teste de Operação Ponta a Ponta

1. **Acesso**: Abra `https://studio.seudominio.com` e faça login com seu usuário e senha.
2. **Post RSS**: Publique um post ou aguarde o watcher registrar o card no dashboard.
3. **Roteiro**: Conecte via SSH na VPS (`/data/videos/<slug>`), rode o OpenCode para gerar o `script.json`.
4. **Revisão de Roteiro**: No dashboard web, visualize o roteiro estruturado e clique em **Aprovar**.
5. **Gravação**: Em `/videos/<slug>/record`, grave os trechos de áudio e face blendshapes. Clique em **Salvar Takes**.
6. **Processamento de Voz**: O servidor transcreve via Gemini, traduz legendas em inglês e gera os visemes com o Rhubarb.
7. **Cenas**: Gere as cenas via OpenCode e valide-as com o Remotion Player no dashboard. Clique em **Aprovar Cenas**.
8. **Render**: O runner local na sua máquina Windows processará o job e enviará o MP4 renderizado.
9. **Finalização**: Assista ao corte final no dashboard (`/videos/<slug>/final`), aprove e baixe o pacote pronto para publicação social.
