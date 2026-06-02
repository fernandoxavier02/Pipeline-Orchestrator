---
description: "Despacha uma User Story para os robôs do Paperclip (VPS). Deriva critérios de aceite a partir da narrativa em linguagem natural, classifica complexidade localmente, mostra a árvore em dry-run e pede confirmação antes de criar qualquer cartão."
allowed-tools: Bash, Read, AskUserQuestion
---

# Paperclip — User Story

<background_information>
Este comando monta e despacha uma árvore de tarefas do tipo **User Story** direto nos robôs do Paperclip rodando na VPS, via túnel SSH. O Claude só faz a montagem; a execução acontece nos agentes da empresa Pipeline Orchestrator no servidor remoto.

**Empresa fixa:** Pipeline Orchestrator (PIP) — `019c6f31-41ed-497a-93ba-cb4eff651a7c`
**Tipo fixo:** `User Story`
**Variante (determinada pela complexidade):**
- `SIMPLES` → `user-story.light`
- `MEDIA`   → `user-story.light`
- `COMPLEXA` → `user-story.heavy`

**O que este fluxo faz:**
Uma User Story chega como narrativa em linguagem natural (ex.: "Como usuário, quero redefinir minha senha pelo e-mail"). O pipeline deriva os critérios de aceite a partir dessa narrativa — essa é a diferença central em relação ao fluxo Feature, onde os critérios já chegam estruturados. No fluxo **light** (SIMPLES/MEDIA), o pipeline faz intake, decomposição e mapeamento de domínio antes de chegar ao executor, resultando em ~22 cartões. No fluxo **heavy** (COMPLEXA), acrescenta design-interrogation, cause-root matrix e validação de integração cross-fatia, totalizando ~26 cartões.

Os agentes de execução (`feature-vertical-slice-planner`, `feature-implementer`) são os mesmos do fluxo Feature — a diferença é inteiramente upstream, na fase de derivação de AC e planejamento de fatias.

**Como acompanhar após o despacho:** abra o painel do Paperclip em `http://127.0.0.1:3100` (requer túnel `ssh hostinger-vps -L 3100:127.0.0.1:3100` ativo). Os cartões aparecem na fila de cada cargo assim que criados.

**Módulos usados (puros, sem I/O de rede):**
- `references/paperclip/spec/lib/classify-bridge.cjs` — classifica tipo + complexidade por heurística de palavras-chave
- `references/paperclip/spec/lib/grow-tree.cjs` — CLI que cria issues na VPS via API loopback (`PAPERCLIP_API_URL` padrão `http://127.0.0.1:3100`)
</background_information>

<instructions>

## Passo 0 — Validar argumento

Se `<arguments>` estiver vazio ou ausente, mostre a mensagem abaixo e **pare** — não classifique nem crie nada:

```
Uso: /pipeline-orchestrator:paperclip-user-story <narrativa da user story>
Exemplo: /pipeline-orchestrator:paperclip-user-story "Como usuário, quero redefinir minha senha pelo e-mail"

Flags de override de complexidade (opcionais):
  --simples   força variante light (SIMPLES — intake + decomposição básicos, ~22 cartões)
  --media     força variante light (MEDIA — intake + decomposição básicos, ~22 cartões)
  --complexa  força variante heavy (COMPLEXA — design-interrogation + cause-root + integração, ~26 cartões)
```

---

## Passo 1 — Classificar complexidade localmente

O tipo já é fixo (`User Story`). O que falta é a **complexidade**, que determina se vai para o fluxo `light` (SIMPLES ou MEDIA) ou `heavy` (COMPLEXA).

**Detectar override na linha de comando:**
- `--simples`  → `{ complexity: 'SIMPLES' }`
- `--media`    → `{ complexity: 'MEDIA' }`
- `--complexa` → `{ complexity: 'COMPLEXA' }`

Se não houver override, rodar a heurística:

```bash
node -e "
const { classify } = require('./references/paperclip/spec/lib/classify-bridge.cjs');
const desc = process.argv[1];
const result = classify(desc, { type: 'User Story' });
console.log(JSON.stringify(result, null, 2));
" -- "<narrativa da user story sem flags>"
```

Resultado esperado: `{ type: 'User Story', complexity: 'SIMPLES'|'MEDIA'|'COMPLEXA', source: '...', notes: [...] }`

**Mapeamento para variante grow-tree:**
- `SIMPLES` → argumento `user-story.light`
- `MEDIA`   → argumento `user-story.light`
- `COMPLEXA` → argumento `user-story.heavy`

Se a classificação automática parecer errada para a narrativa fornecida, pergunte ao usuário antes de continuar:

```
AskUserQuestion
  header: "Complexidade"
  options:
    - label: "SIMPLES — light (Recomendado pelo classificador)"
      description: "Story curta, 1-2 critérios de aceite, domínio bem conhecido, sem impacto em auth ou dados sensíveis (~22 cartões)"
    - label: "MEDIA — light"
      description: "Story com 3-5 critérios de aceite, lógica moderada, domínio parcialmente mapeado (~22 cartões)"
    - label: "COMPLEXA — heavy"
      description: "Story cross-domínio, 6+ critérios, impacto em auth/dados/integrações, requer cause-root matrix e validação end-to-end (~26 cartões)"
```

---

## Passo 2 — Dry-run: mostrar o que seria criado

**GUARD DE SEGURANÇA — OBRIGATÓRIO:** nunca criar cartões na VPS sem confirmação explícita do usuário.

Rodar grow-tree **sem** `--confirm` para ver o primeiro nó que seria criado:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  user-story.light
```

_(Substitua `user-story.light` por `user-story.heavy` se COMPLEXA.)_

O dry-run retorna JSON com `{ step, title, nextStep }` — sem POST algum na API.

Apresente ao usuário em linguagem simples:
- Qual é a variante escolhida (light ou heavy)
- O nome do primeiro cartão que seria criado
- Quantos cartões o fluxo tem no total (light ≈ 22 cartões, heavy ≈ 26 cartões)
- Que o fluxo inclui derivação de critérios de aceite a partir da narrativa antes de chegar à implementação
- Que a execução acontecerá nos robôs do Paperclip, não no Claude

---

## Passo 3 — Pedir confirmação explícita

```
AskUserQuestion
  header: "Criar árvore?"
  options:
    - label: "Criar no Paperclip"
      description: "Dispara o primeiro cartão agora; os robôs criam os seguintes em cascata, incluindo a derivação de AC da narrativa"
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
  user-story.light \
  --confirm
```

_(Substitua `user-story.light` por `user-story.heavy` se COMPLEXA.)_

O grow-tree faz `GET /api/companies/<id>/agents` para resolver o roster de cargos e `POST /api/issues` para criar o primeiro cartão. Retorna JSON com `{ step, issueId, title, nextStep }`.

**Informe ao usuário:**
- O ID do cartão criado (campo `issueId` do JSON)
- O cargo responsável pelo primeiro passo (task-orchestrator classifica a narrativa)
- Que os próximos passos incluem: intake da story → derivação de AC → fatias verticais → implementação TDD → revisão adversarial → Pa de Cal
- Como acompanhar: painel em `http://127.0.0.1:3100` — os cartões seguintes aparecem automaticamente conforme cada robô conclui a sua etapa
- Que a execução está 100% nos robôs; o Claude não precisa monitorar

---

## Notas operacionais

- O túnel SSH (`ssh hostinger-vps -L 3100:127.0.0.1:3100`) deve estar ativo antes do Passo 4. Se o grow-tree falhar com erro de conexão, peça ao usuário para verificar o túnel.
- O Paperclip orquestra a fila de dominó: cada robô que conclui cria o cartão seguinte via `blockedByIssueIds`. O fluxo light tem ~22 cartões e o heavy ~26 — nenhum precisa de intervenção manual entre os passos.
- No fluxo light, o `feature-vertical-slice-planner` decompõe a story em fatias verticais com AC por fatia; cada fatia vira issues irmãs paralelas. No fluxo heavy, acrescenta design-interrogation, cause-root matrix e um `feature-integration-validator` que verifica os AC da story end-to-end após o último lote de implementação.
- Flags `--grill`, `--plan`, `--no-plan`, `--no-prep` não têm efeito neste comando e devem ser ignoradas silenciosamente.

</instructions>
