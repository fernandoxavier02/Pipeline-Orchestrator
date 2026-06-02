---
description: "Despacha um Hotfix de emergência para os robôs do Paperclip (VPS). Tipo e complexidade são fixos (Bug Fix / COMPLEXA / Critical) — sem classificação, sem light/heavy. Mostra a árvore em dry-run e pede confirmação antes de criar qualquer cartão."
allowed-tools: Bash, Read, AskUserQuestion
---

# Paperclip — Hotfix (Emergência)

<background_information>
Este comando monta e despacha uma árvore de tarefas do modo **Hotfix** direto nos robôs do Paperclip rodando na VPS, via túnel SSH. O Claude só faz a montagem; a execução acontece nos agentes da empresa Pipeline Orchestrator no servidor remoto.

**Empresa fixa:** Pipeline Orchestrator (PIP) — `019c6f31-41ed-497a-93ba-cb4eff651a7c`
**Tipo fixo:** `Bug Fix`
**Complexidade fixa:** `COMPLEXA` — `severity=Critical` (sem triagem livre; não há variante light/heavy)
**Chave do molde:** `hotfix` (modo especial — passado diretamente, sem sufixo `.light` ou `.heavy`)

O HOTFIX é um **modo**, não um tipo com variantes. O fluxo inteiro tem **12 nós** (HF-N0 a HF-N11), colapsando as etapas de design, planejamento e adversarial completo em favor de velocidade de emergência:
- Classificação forçada (`task-orchestrator`) → Info-gate somente BLOCKER → sentinel → executor-fix → regression-tester → review-orchestrator → trio adversarial paralelo (security + architecture + quality) → junção final-adversarial → final-validator (PA_DE_CAL) → finishing-branch (SLICE_CLOSEOUT).

**Como acompanhar após o despacho:** abra o painel do Paperclip em `http://127.0.0.1:3100` (requer túnel `ssh hostinger-vps -L 3100:127.0.0.1:3100` ativo). Os cartões aparecem na fila de cada cargo assim que criados.

**Módulos usados (puros, sem I/O de rede):**
- `references/paperclip/spec/lib/grow-tree.cjs` — CLI que cria issues na VPS via API loopback (`PAPERCLIP_API_URL` padrão `http://127.0.0.1:3100`)
</background_information>

<instructions>

## Passo 0 — Validar argumento

Se `<arguments>` estiver vazio ou ausente, mostre a mensagem abaixo e **pare** — não crie nada:

```
Uso: /pipeline-orchestrator:paperclip-hotfix <descrição da emergência>
Exemplo: /pipeline-orchestrator:paperclip-hotfix "autenticação quebrando em produção após deploy"

Notas:
  - Tipo, complexidade e severidade são fixos: Bug Fix / COMPLEXA / Critical
  - Não há flags de override de complexidade — o modo hotfix tem molde único
  - Flags ignoradas silenciosamente: --simples, --media, --complexa, --grill, --plan, --no-plan
```

---

## Passo 1 — Confirmar modo de emergência

O modo Hotfix **não classifica complexidade** — o molde é sempre `hotfix` (chave única, sem `.light` nem `.heavy`). Não é necessário rodar o `classify-bridge`.

Informe ao usuário antes de continuar:
- Tipo fixo: **Bug Fix**
- Complexidade fixa: **COMPLEXA**
- Severidade fixa: **Critical**
- Molde: **hotfix** (12 nós — fluxo compactado de emergência)
- O fluxo pula design-interrogator e plan-architect; mantém executor-fix + trio adversarial + PA de Cal.

Não há AskUserQuestion de complexidade neste passo — o modo hotfix não oferece essa escolha por design.

---

## Passo 2 — Dry-run: mostrar o que seria criado

**GUARD DE SEGURANÇA — OBRIGATÓRIO:** nunca criar cartões na VPS sem confirmação explícita do usuário.

Rodar grow-tree **sem** `--confirm` para ver o primeiro nó que seria criado:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  hotfix
```

O dry-run retorna JSON com `{ step, title, nextStep }` — sem POST algum na API.

Apresente ao usuário em linguagem simples:
- Que o molde usado é `hotfix` (modo de emergência, variante única)
- O nome do primeiro cartão que seria criado
- Quantos cartões o fluxo tem no total (hotfix = 12 cartões fixos)
- Que a execução acontecerá nos robôs do Paperclip, não no Claude

---

## Passo 3 — Pedir confirmação explícita

```
AskUserQuestion
  header: "Criar árvore?"
  options:
    - label: "Criar no Paperclip"
      description: "Dispara o primeiro cartão de emergência agora; os robôs criam os seguintes em cascata"
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
  hotfix \
  --confirm
```

O grow-tree faz `GET /api/companies/<id>/agents` para resolver o roster de cargos e `POST /api/issues` para criar o primeiro cartão. Retorna JSON com `{ step, issueId, title, nextStep }`.

**Informe ao usuário:**
- O ID do cartão criado (campo `issueId` do JSON)
- O cargo responsável pelo primeiro passo (`task-orchestrator` em HF-N0)
- Como acompanhar: painel em `http://127.0.0.1:3100` — os cartões seguintes aparecem automaticamente conforme cada robô conclui a sua etapa
- Que a execução está 100% nos robôs; o Claude não precisa monitorar

---

## Notas operacionais

- O túnel SSH (`ssh hostinger-vps -L 3100:127.0.0.1:3100`) deve estar ativo antes do Passo 4. Se o grow-tree falhar com erro de conexão, peça ao usuário para verificar o túnel.
- O Paperclip orquestra a fila de dominó: cada robô que conclui cria o cartão seguinte via `blockedByIssueIds`. O fluxo hotfix tem exatamente **12 cartões** — nenhum precisa de intervenção manual entre os passos.
- Flags `--simples`, `--media`, `--complexa`, `--grill`, `--plan` e `--no-plan` não têm efeito neste comando e devem ser ignoradas silenciosamente.

</instructions>
