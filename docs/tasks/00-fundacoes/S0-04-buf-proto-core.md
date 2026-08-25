---
id: S0-04
titulo: "Buf setup + proto studio.v1 núcleo (health/auth/videos) + codegen Go/TS"
sprint: 0
prioridade: P0
depende_de: ["S0-02", "S0-03"]
estimativa_h: 2
status: done
---

# S0-04 — Buf setup + proto studio.v1 núcleo

## Objetivo

Contratos Protobuf como fonte de verdade das APIs (D-01): `buf.yaml`/`buf.gen.yaml` na raiz,
pacote `studio.v1` com HealthService, AuthService(Login) e VideoService núcleo
(ListVideos/GetVideo/CreateVideo) + enum de status da máquina de estados — codegen Go e TS
funcionando nos dois lados.

## Contexto

Diretório `proto/app/studio/v1/` criado na S0-01; pipeline de plugins é o do blueprint
(`architecture-guide.md §3`). O enum de status espelha a máquina canônica do
`ROADMAP.md → Referência rápida`; a verdade executável em Go nasce na S0-15. Stubs gerados
alimentam o backend (handlers nas S0-07/S1-04) e o frontend (S0-09).

## Pré-requisitos

- S0-02 done (`npm run gen` existe) e S0-03 done (módulo Go compilável).
- Plugins instalados: protoc-gen-go, protoc-gen-connect-go (go install, blueprint §5);
  plugins remotos usam a rede no primeiro generate.

## Passos

1. Criar `buf.yaml` na raiz (v2, módulo único com `path: proto`) e `buf.gen.yaml` idênticos
   aos do blueprint §3: plugins locais `protoc-gen-go`/`protoc-gen-connect-go` →
   `backend/gen` com `paths=source_relative`; remotos `bufbuild/es` e `connectrpc/query-es`
   → `frontend/src/gen` com `target=ts`.
2. Criar `proto/app/studio/v1/health.proto`: `service HealthService { rpc Check(...) }`
   retornando status serving.
3. Criar `proto/app/studio/v1/auth.proto`: `LoginRequest{username,password}`,
   `LoginResponse{token, expires_at}`, `service AuthService { rpc Login }`.
4. Criar `proto/app/studio/v1/video.proto`: `enum VideoStatus` com valores
   `VIDEO_STATUS_UNSPECIFIED=0` + um por estado da máquina (new…released + blocked);
   `message Video{id, slug, title, source_url, status, created_at, updated_at}`;
   `ListVideosRequest{}`/`ListVideosResponse{repeated Video}`;
   `GetVideoRequest{id}` → retorna `Video`; `CreateVideoRequest{slug,title,source_url}`;
   `service VideoService { ListVideos, GetVideo, CreateVideo }`.
   Em todos: `option go_package = "github.com/guigas-studio/guigas-studio/backend/gen/app/studio/v1;studiov1";`
5. Rodar `npm run gen` e conferir stubs em `backend/gen/app/studio/v1/` e `frontend/src/gen/`.
6. Registrar HealthService: `internal/services/health_service.go` implementando o handler +
   `mux.Handle(studiov1connect.NewHealthServiceHandler(...))` no `main.go`, já com o padrão
   de interceptors do blueprint §4 (interceptor real é a S0-08).
7. Commitar os stubs gerados (`backend/gen/`, `frontend/src/gen/`) — builds e CI não exigem
   buf instalado; regeneração é explícita via `npm run gen`.

## Critérios de aceite

- [x] `buf lint` verde; `buf breaking --against .git#branch=main` utilizável pelo CI (S0-14)
- [x] Backend compila importando `studiov1connect` e serve HealthService em `/app.studio.v1.HealthService/Check`
- [x] `frontend/src/gen/` contém os arquivos `*_connectquery.ts` (consumidos na S0-09)
- [x] Enum VideoStatus cobre exatamente 12 estados + blocked (+ UNSPECIFIED)

## Verificação

```bash
npm run check
npm run gen && git diff --exit-code backend/gen frontend/src/gen   # stubs commitados em dia
cd backend && go build ./... && go test ./...
```

## Notas

- **Escolhas registradas**: (1) `go_package` usa o módulo real `github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1;studiov1`
  (dono do repo via git remote — ver nota da S0-03). (2) `GetVideo`/`CreateVideo` retornam
  `GetVideoResponse`/`CreateVideoResponse` embrulhando `Video`, pois `buf lint`
  (`RPC_RESPONSE_STANDARD_NAME`) rejeita retornar a entidade crua. (3) O prefixo das rotas
  Connect é `/app.studio.v1.*` (deriva do pacote proto, não de `studio.v1`); o Caddyfile da
  S0-05 foi corrigido para esse prefixo.- Nunca renomear valor de enum existente (breaking); novos estados entram no fim, com o
  teste de sincronia da S0-15 garantindo paridade domínio ↔ proto.
- Plugins remotos (`buf.build/...`) exigem rede; se virar problema offline, migrar para
  plugins locais (`protoc-gen-es`) seria decisão nova — registrar antes de trocar.
- buf v2 tem schema de config diferente dos tutoriais v1 antigos que circulam por aí:
  copiar do blueprint §3, não de exemplos aleatórios.
