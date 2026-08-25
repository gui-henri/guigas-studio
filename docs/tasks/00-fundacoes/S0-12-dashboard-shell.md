---
id: S0-12
titulo: "Dashboard shell: lista de vídeos com cards por status"
sprint: 0
prioridade: P0
depende_de: ["S0-10"]
estimativa_h: 2
status: done
---

# S0-12 — Dashboard shell + lista de vídeos

## Objetivo

Casca do dashboard e sua primeira tela real: layout com navegação, lista de vídeos
consumindo `ListVideos` em cards com badge por status (estados da máquina do ROADMAP) e
estado vazio amigável para quando o watcher ainda não criou nada.

## Contexto

Consome o RPC contratado na S0-04 e o fluxo de auth da S0-10; substitui o smoke da S0-09.
Os labels/cores espelham `ROADMAP.md → Máquina de estados` (12 estados + blocked).
Detalhe do vídeo, SSE e ações chegam no Sprint 1 (S1-05/S1-06) — aqui é leitura.

## Pré-requisitos

- S0-10 done (guard + sessão funcionando).

## Passos

1. Criar `src/components/AppShell.tsx`: sidebar com navegação (Dashboard ativo;
   "Estúdio"/"Releases" como itens desabilitados — chegam nos sprints 2 e 5) e topbar com
   botão Sair (promove o header mínimo da S0-10).
2. Criar `src/lib/videoStatus.ts`: mapa `studiov1.VideoStatus` → `{ label pt-BR, grupo }`
   cobrindo os 13 valores; grupos semânticos: novo, roteiro, gravação, voz/cenas,
   montagem, lançado, bloqueado (cores por grupo, não por estado).
3. Criar `src/pages/DashboardPage.tsx`: `useQuery(listVideos)` → grid responsivo de cards
   (título, slug, badge colorida do status, created_at relativo); click no card →
   rota `/video/:id` placeholder ("detalhe na S1-06").
4. Tratar os três estados: loading (skeleton simples), erro (mensagem + retry/refetch) e
   vazio — "Nenhum vídeo ainda. Quando um post sair no blog, o watcher cria o card
   automaticamente."
5. Envolver `/` com `RequireAuth` + `AppShell`; remover o componente temporário da S0-09.
6. Badge de `blocked` visualmente distinta (ex.: âmbar forte) — retomável pela UI no futuro.

## Critérios de aceite

- [x] Lista renderiza dados reais autenticados; badge correta para cada status presente *(ListVideos verificado ponta a ponta: 401 sem token, payload com vídeos com JWT)* 
- [x] Os 13 valores de VideoStatus têm label+grupo definidos (sem fallback quebrado)
- [x] Empty/loading/error tratados, com retry funcional
- [x] Logout acessível pelo shell; navegação mostra o mapa do produto

## Verificação

```bash
npm run check
npm run dev --workspace frontend
docker compose exec postgres psql -U guigas -d guigas_studio -c "insert into videos (slug,title) values ('teste-shell','Vídeo de teste');"
# recarregar o dashboard: card deve aparecer; apagar a linha depois
```

## Notas

- **Escolha registrada**: o núcleo do `VideoService` Go (List/Get/Create sobre as queries da
  S0-06) foi implementado aqui porque o aceite "dados reais autenticados" exige o RPC servido;
  a S1-04 estende esse service com UpdateScript/Approve/Reject. Mapa texto→enum vive em
  `video_service.go` até o módulo `videostate` (S0-15) assumir a sincronia.- Sem paginação/filtros (<100 vídeos previsíveis); ordenação vem do SQL (`created_at DESC`,
  S0-06). Paginar só se a dor aparecer.
- Cores por grupo semântico mantêm a UI calma com 13 estados; granularidade fica pro
  detalhe do vídeo (S1-06).
- Se ListVideos retornar vazio mas você espera dados, confirme login válido (RPC privada)
  antes de suspeitar do banco.
