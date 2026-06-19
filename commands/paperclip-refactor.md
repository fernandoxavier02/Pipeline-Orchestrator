---
description: "Despacha um Refactor para os robôs do Paperclip (VPS). Classifica complexidade localmente, mostra a árvore em dry-run e pede confirmação antes de criar qualquer cartão."
allowed-tools: Bash, Read, AskUserQuestion
---

# Paperclip — Refactor

<background_information>
Este comando monta e despacha uma árvore de tarefas do tipo **Refactor** direto nos robôs do Paperclip rodando na VPS, via túnel SSH. O Claude só faz a montagem; a execução acontece nos agentes da empresa Pipeline Orchestrator no servidor remoto.

Refactor = reorganizar o código sem mudar o que ele faz por fora. Antes de tocar em qualquer arquivo, os robôs fecham um contrato de mudança (o que pode e o que é proibido mexer) e o assinam — essa assinatura é a trava de escopo. Pra provar que nada quebrou, rodam os testes que olham o comportamento de fora antes e depois; os dois resultados têm que bater igual.

**Empresa fixa:** Pipeline Orchestrator (PIP) — `019c6f31-41ed-497a-93ba-cb4eff651a7c`
**Tipo fixo:** `Refactor`
**Variante (determinada pela complexidade):**
- `SIMPLES` → `refactor.light`
- `MEDIA` → `refactor.light`
- `COMPLEXA` → `refactor.heavy`

**Como acompanhar após o despacho:** abra o painel do Paperclip em `http://127.0.0.1:3100` (requer túnel `ssh hostinger-vps -L 3100:127.0.0.1:3100` ativo). Os cartões aparecem na fila de cada cargo assim que criados.

**Módulos usados (puros, sem I/O de rede):**
- `references/paperclip/spec/lib/classify-bridge.cjs` — classifica tipo + complexidade por heurística de palavras-chave
- `references/paperclip/spec/lib/grow-tree.cjs` — CLI que cria issues na VPS via API loopback (`PAPERCLIP_API_URL` padrão `http://127.0.0.1:3100`)

**Workflow de referência:** `references/paperclip/PAPERCLIP-REFACTOR-WORKFLOW.md` (ordem de cargos, decisões pré-aprovadas, Definição de Done). Refactor reusa os cargos existentes — ZERO cargos novos.
</background_information>

<instructions>

## Passo 0 — Validar argumento

Se `<arguments>` estiver vazio ou ausente, mostre a mensagem abaixo e **pare** — não classifique nem crie nada:

```
Uso: /pipeline-orchestrator:paperclip-refactor <o que reorganizar + qual módulo>
Exemplo: /pipeline-orchestrator:paperclip-refactor "extrair o parser gigante do controller em helpers nomeados, sem mudar a saída"

Flags de override de complexidade (opcionais):
  --simples   força variante light (SIMPLES)
  --media     força variante light (MEDIA)
  --complexa  força variante heavy (COMPLEXA)
```

---

## Passo 1 — Classificar complexidade localmente

O tipo já é fixo (`Refactor`). O que falta é a **complexidade**, que determina se vai para o fluxo `light` (SIMPLES ou MEDIA — um módulo só) ou `heavy` (COMPLEXA — cruza vários módulos, com revisão crítica final).

**Detectar override na linha de comando:**
- `--simples` → `{ complexity: 'SIMPLES' }`
- `--media`   → `{ complexity: 'MEDIA' }`
- `--complexa` → `{ complexity: 'COMPLEXA' }`

Se não houver override, rodar a heurística. **Importante (segurança do shell):** ponha a descrição do usuário numa variável com aspas SIMPLES (`DESC='...'`) e passe a variável entre aspas duplas (`"$DESC"`) — as aspas simples impedem que crase, `$( )`, `$VAR` ou aspas dentro da descrição sejam interpretados pelo shell e quebrem o argumento. Se a descrição contiver uma aspa simples literal, substitua-a por `'\''` antes de montar `DESC`.

```bash
DESC='<descrição do refactor sem flags>'
node -e "
const { classify } = require('./references/paperclip/spec/lib/classify-bridge.cjs');
const desc = process.argv[1];
const result = classify(desc, { type: 'Refactor' });
console.log(JSON.stringify(result, null, 2));
" -- "$DESC"
```

Resultado esperado: `{ type: 'Refactor', complexity: 'SIMPLES'|'MEDIA'|'COMPLEXA', source: '...', notes: [...] }`

**Mapeamento para variante grow-tree:**
- `SIMPLES` → argumento `refactor.light`
- `MEDIA`   → argumento `refactor.light`
- `COMPLEXA` → argumento `refactor.heavy`

Se a classificação automática parecer errada para a descrição fornecida, pergunte ao usuário antes de continuar:

```
AskUserQuestion
  header: "Complexidade"
  options:
    - label: "SIMPLES — light (Recomendado pelo classificador)"
      description: "1-2 arquivos num módulo só, arrumação contida, sem cruzar fronteiras"
    - label: "MEDIA — light"
      description: "3-5 arquivos, ainda dentro de um módulo, blast radius moderado"
    - label: "COMPLEXA — heavy"
      description: "cruza vários módulos, muitos callers, com revisão crítica final + sweep"
```

---

## Passo 2 — Dry-run: mostrar o que seria criado

**GUARD DE SEGURANÇA — OBRIGATÓRIO:** nunca criar cartões na VPS sem confirmação explícita do usuário.

Rodar grow-tree **sem** `--confirm` para ver o primeiro nó que seria criado:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  refactor.light
```

_(Substitua `refactor.light` por `refactor.heavy` se COMPLEXA.)_

O dry-run retorna JSON com `{ step, title, nextStep }` — sem POST algum na API.

Apresente ao usuário em linguagem simples:
- Qual é a variante escolhida (light ou heavy)
- O nome do primeiro cartão que seria criado
- Que o primeiro passo de verdade que mexe em arquivo só roda depois do contrato de mudança ser assinado (a trava de escopo)
- Que a execução acontecerá nos robôs do Paperclip, não no Claude

---

## Passo 3 — Pedir confirmação explícita

```
AskUserQuestion
  header: "Criar árvore?"
  options:
    - label: "Criar no Paperclip"
      description: "Dispara o primeiro cartão agora; os robôs criam os seguintes em cascata"
    - label: "Cancelar"
      description: "Nada será criado — você pode rodar o comando novamente com ajustes"
```

Se o usuário cancelar, encerre sem criar nada. Não tente alternativas.

---

## Passo 4 — Criar a raiz da árvore com --confirm

Somente após confirmação explícita no Passo 3:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  refactor.light \
  --confirm
```

O grow-tree faz `GET /api/companies/<id>/agents` para resolver o roster de cargos e `POST /api/issues` para criar o primeiro cartão. Retorna JSON com `{ step, issueId, title, nextStep }`.

**Informe ao usuário:**
- O ID do cartão criado (campo `issueId` do JSON)
- O cargo responsável pelo primeiro passo
- Como acompanhar: painel em `http://127.0.0.1:3100` — os cartões seguintes aparecem automaticamente conforme cada robô conclui a sua etapa
- Que a execução está 100% nos robôs; o Claude não precisa monitorar

---

## Notas operacionais

- O túnel SSH (`ssh hostinger-vps -L 3100:127.0.0.1:3100`) deve estar ativo antes do Passo 4. Se o grow-tree falhar com erro de conexão, peça ao usuário para verificar o túnel.
- O Paperclip orquestra a fila de dominó: cada robô que conclui cria o cartão seguinte via `blockedByIssueIds`. Nenhum precisa de intervenção manual entre os passos.
- A trava REFACTOR_SCOPE_LOCK vive no fluxo remoto: o cargo de planejamento assina o contrato de mudança antes de qualquer toque em arquivo. Se o plano propuser mudar a superfície pública, o fluxo aborta — isso seria Feature ou Bug Fix, não Refactor.
- Flags `--grill`, `--plan`, `--no-plan` não têm efeito neste comando e devem ser ignoradas silenciosamente.

</instructions>
