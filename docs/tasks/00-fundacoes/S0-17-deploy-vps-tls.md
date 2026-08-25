---
id: S0-17
titulo: "Deploy produção na VPS: compose.prod + Caddy TLS + hardening"
sprint: 0
prioridade: P0
depende_de: ["S0-08", "S0-12"]
estimativa_h: 2
status: todo
---

# S0-17 — Deploy produção na VPS

## Objetivo

Colocar o Studio no ar em https://<dominio> na VPS sempre-ligada (D-08): api + postgres +
caddy via `docker-compose.prod.yml`, TLS automático, conta única semeada e login funcional
no dashboard público. Auth exposta desde o primeiro dia (mitigação do risco SPEC §9).

## Contexto

O compose dev (S0-05) vira base, mas produção difere: TLS pelo domínio (DNS já existe — D-12),
segredos fora do git, restart policy, volumes persistentes para `/data` (workspace de vídeos,
T-07) e do banco. O interceptor de auth (S0-08) precisa estar ativo antes da exposição pública.

## Pré-requisitos

- VPS Linux contratada com Docker + Compose plugin instalados (tarefa inclui verificação).
- DNS do domínio apontando para o IP da VPS (registro A), porta 80/443 liberadas.
- Segredos definidos no servidor: `STUDIO_USERNAME`, `STUDIO_PASSWORD_HASH` (argon2id),
  `JWT_SECRET` forte, `RUNNER_TOKEN`, `POSTGRES_PASSWORD`.

## Passos

1. Criar `docker-compose.prod.yml`: api (build multi-stage, restart unless-stopped),
   postgres (volume nomeado), caddy com `Caddyfile` de produção (domínio real,
   `reverse_proxy api:8080` para RPC/SSE + servir `frontend/dist` estático na mesma origem, T-01).
2. Criar `deploy/Caddyfile` (produção) distinto do dev: automatic_https on, compressão,
   buffer desativado para SSE.
3. Escrever `docs/guides/deploy.md`: passo-a-passo de primeiro deploy (clone na VPS,
   criar `.env.prod` fora do git, `docker compose -f docker-compose.prod.yml up -d --build`),
   atualização (`git pull && up -d --build`) e rollback simples (tag anterior).
4. Hardening mínimo documentado e aplicado: firewall (apenas 22/80/443), ssh por chave,
   fail2ban opcional; postgres NÃO exposto publicamente (rede interna do compose).
5. Executar o primeiro deploy na VPS e validar HTTPS end-to-end.

## Critérios de aceite

- [ ] `https://<dominio>` carrega o dashboard com cadeira de certificado válida (Caddy)
- [ ] Login funciona contra a API pública com a conta semeada por env
- [ ] RPC autenticado responde; rota sem token é recusada (401) quando acessada de fora
- [ ] `/data` persiste após `docker compose down && up` (volume correto)
- [ ] Postgres não escuta porta pública (`docker ps` / `ss -tlnp`)
- [ ] `docs/guides/deploy.md` permite reproduzir tudo do zero

## Verificação

```bash
npm run check                      # código não mudou, mas garante repo verde antes do push
ssh <vps> "docker compose -f docker-compose.prod.yml ps"
curl -fsSI https://<dominio>       # 200 + TLS
curl -fsS https://<dominio>/healthz
```

## Notas

- Não commitar `.env.prod`; o guia lista apenas os nomes das variáveis (mesmas da S0-05).
- SSE atrás do Caddy exige `flush` imediato: se eventos atrasarem, revisar buffering do proxy.
- Backups ficam para a S6-07 (P3); aqui só garanta volumes nomeados, não bind mounts frágeis.
