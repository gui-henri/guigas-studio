# Gerando cenas com OpenCode — runbook (D-14)

> Runbook operacional do fluxo de cenas. A gramática vive no
> [catálogo de cenas](./scene-catalog.md); as regras que o agente carrega vivem no
> `AGENTS.md` gerado dentro do workspace. Este doc é o passo a passo da sessão.

## Pré-requisitos

- Vídeo em estado **`scenes_pending`** (voz processada; timelines prontas — S3-04).
  Confira na fila do dashboard: card com badge "cenas pendentes".
- SSH na VPS com acesso ao `/data`.
- Nenhuma ferramenta além de SSH + OpenCode: a validação roda no servidor.

## Abrindo a sessão

```bash
ssh vps
cd /data/videos/<slug>
opencode
```

A sessão DEVE nascer dentro de `/data/videos/<slug>/` — é o workspace canônico que o
observador vigia. Sessão em outro diretório = nenhuma validação acontece.

Leia antes de tudo (o agente também lê automaticamente, mas confira):

```bash
cat context/AGENTS.md
```

## Pedindo cenas

Prompt 1 — gerar UMA cena específica:

```text
Gere a cena para o segmento "exemplo-zdr" seguindo o catálogo de cenas:
type diff_view comparando o jeito antigo e o novo do ponto que a narração explica.
Escreva direto no script.json. Depois leia .validation-latest.json e me diga se validou.
```

Prompt 2 — gerar em LOTE por beat:

```text
Gere cenas para todos os segmentos com beat example: escolha o tipo mais adequado
do catálogo para cada um (varie entre code_typing, big_number e flow_diagram).
Deixe os segmentos hook e cta com scene: null — neles o avatar narra sozinho.
Ao terminar, escreva script.json e confirme com .validation-latest.json.
```

## Corrigindo por iteração

O ciclo: você salva → observador valida em segundos → se falhou, o relatório aparece
em `.validation-latest.json` → corrija o path apontado → repita.

Prompt 3 — corrigir a partir do erro (cole o conteúdo do relatório):

```text
O validador rejeitou as cenas. Conteúdo atual de .validation-latest.json:

{
  "valid": false,
  "issues": [
    {
      "segment_id": "exemplo-zdr",
      "path": "props.before",
      "message": "required"
    }
  ]
}

Corrija exatamente esse problema no segmento indicado, mantendo-se dentro da
gramática fechada, e reescreva script.json.
```

### Tabela de erros comuns

| Mensagem em `.validation-latest.json` | Causa | Correção esperada |
| --- | --- | --- |
| `path: "props.<nome>"`, `message: "required"` | Prop obrigatória ausente | Adicione a prop com valor válido (veja tabela do tipo no catálogo) |
| `path: "type"`, `message: "unknown scene type …"` | `scene.type` fora dos 7 tipos | Troque por um dos tipos listados na própria mensagem |
| `path: "<prop>", message: "unrecognized prop"` | Prop inexistente / CSS livre proibido | Remova a prop; estilo não entra nos dados |
| `Expected array, received string` etc. | Tipo errado no valor | Ajuste para o tipo declarado no catálogo (ex.: `before` é string[]) |
| `Array must contain at least 1 element(s)` | Lista vazia onde não pode | Preencha com pelo menos 1 item (`lines`, `milestones`, `nodes`) |
| `references unknown node "<id>"` | Aresta órfã no `flow_diagram` | Declare o nó ou remova a aresta |

## Entregando pra review

1. Última escrita de `script.json` com `.validation-latest.json` dizendo `"valid": true`;
2. O card do vídeo sai de `scenes_pending` e vai para **`scenes_review`** sozinho
   (evento SSE move na hora);
3. Acompanhe na UI: `/videos/<id>/scenes` — cada card tem preview com áudio real;
4. Comentários de reprovação voltam como novo prompt: use o botão **copiar prompt**
   do card reprovado, cole na sessão do OpenCode, corrija, salve.

## Checklist final

- [ ] Todos os segmentos têm `scene` válida ou `null` consciente (hook/cta costumam ser null);
- [ ] `.validation-latest.json` com `"valid": true` após a última escrita;
- [ ] Card em `scenes_review` na UI;
- [ ] Zero props fora da gramática (sem "invenção") — o validador confirma;
- [ ] Sessão encerrada com todas as cenas aprovadas na UI ("X/Y aprovadas" = 100%).

> Erro novo apareceu durante a execução? Adicione a linha na tabela acima no mesmo
> commit da correção (parte do log de atrito da S6-05).
