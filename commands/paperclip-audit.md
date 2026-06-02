---
description: "Despacha um Audit para os robôs do Paperclip (VPS). Fluxo somente-leitura: intake → domínio → compliance → risco, gerando relatórios técnico e executivo. Classifica complexidade localmente, mostra a árvore em dry-run e pede confirmação antes de criar qualquer cartão."
allowed-tools: Bash, Read, AskUserQuestion
---

# Paperclip — Audit

<background_information>
Este comando monta e despacha uma árvore de tarefas do tipo **Audit** direto nos robôs do Paperclip rodando na VPS, via túnel SSH. O Claude só faz a montagem; a execução acontece nos agentes da empresa Pipeline Orchestrator no servidor remoto.

**Empresa fixa:** Pipeline Orchestrator (PIP) — `019c6f31-41ed-497a-93ba-cb4eff651a7c`
**Tipo fixo:** `Audit`
**Variante (determinada pela complexidade):**
- `SIMPLES` → fluxo direto sem pipeline (não despachar — informar ao usuário)
- `MEDIA` → `audit.light`
- `COMPLEXA` → `audit.heavy`

**Importante — fluxo somente-leitura:** nenhum arquivo de produção é modificado em nenhum passo. O audit produz exclusivamente relatórios. Não há TDD, executor-fix, adversarial trio nem loop de correção. As etapas são: (1) intake e aprovação de escopo, (2) análise de domínio/compliance, (3) geração da matriz de risco e pá de cal, (4) fechamento com relatório técnico + executivo.

**Como acompanhar após o despacho:** abra o painel do Paperclip em `http://127.0.0.1:3100` (requer túnel `ssh hostinger-vps -L 3100:127.0.0.1:3100` ativo). Os cartões aparecem na fila de cada cargo assim que criados.

**Módulos usados (puros, sem I/O de rede):**
- `references/paperclip/spec/lib/classify-bridge.cjs` — classifica tipo + complexidade por heurística de palavras-chave
- `references/paperclip/spec/lib/grow-tree.cjs` — CLI que cria issues na VPS via API loopback (`PAPERCLIP_API_URL` padrão `http://127.0.0.1:3100`)
</background_information>

<instructions>

## Passo 0 — Validar argumento

Se `<arguments>` estiver vazio ou ausente, mostre a mensagem abaixo e **pare** — não classifique nem crie nada:

```
Uso: /pipeline-orchestrator:paperclip-audit <descrição do que será auditado>
Exemplo: /pipeline-orchestrator:paperclip-audit "módulo de autenticação e gestão de sessões"

Flags de override de complexidade (opcionais):
  --media     força variante light (MEDIA — 3 a 5 arquivos, até 2 domínios)
  --complexa  força variante heavy (COMPLEXA — 6+ arquivos, 3+ domínios)
```

---

## Passo 1 — Classificar complexidade localmente

O tipo já é fixo (`Audit`). O que falta é a **complexidade**, que determina se vai para o fluxo `light` (MEDIA) ou `heavy` (COMPLEXA). Complexidade SIMPLES (1-2 arquivos, 1 domínio) não usa pipeline — se o classificador retornar SIMPLES, informe ao usuário e encerre sem criar nada.

**Detectar override na linha de comando:**
- `--media`    → `{ complexity: 'MEDIA' }`
- `--complexa` → `{ complexity: 'COMPLEXA' }`

Se não houver override, rodar a heurística:

```bash
node -e "
const { classify } = require('./references/paperclip/spec/lib/classify-bridge.cjs');
const desc = process.argv[1];
const result = classify(desc, { type: 'Audit' });
console.log(JSON.stringify(result, null, 2));
" -- "<descrição do audit sem flags>"
```

Resultado esperado: `{ type: 'Audit', complexity: 'SIMPLES'|'MEDIA'|'COMPLEXA', source: '...', notes: [...] }`

**Mapeamento para variante grow-tree:**
- `SIMPLES`   → encerrar com aviso (audit simples não usa pipeline)
- `MEDIA`     → argumento `audit.light`
- `COMPLEXA`  → argumento `audit.heavy`

Se a classificação automática parecer errada para a descrição fornecida, pergunte ao usuário antes de continuar:

```
AskUserQuestion
  header: "Complexidade"
  options:
    - label: "MEDIA — light (Recomendado pelo classificador)"
      description: "3-5 arquivos, até 2 domínios — audit-compliance-checker em modo light, sem audit-domain-analyzer separado"
    - label: "COMPLEXA — heavy"
      description: "6+ arquivos, 3+ domínios — audit-domain-analyzer como agente dedicado (3 invocações), compliance em 4 invocações especializadas, cobertura total"
```

---

## Passo 2 — Dry-run: mostrar o que seria criado

**GUARD DE SEGURANÇA — OBRIGATÓRIO:** nunca criar cartões na VPS sem confirmação explícita do usuário.

Rodar grow-tree **sem** `--confirm` para ver o primeiro nó que seria criado:

```bash
node references/paperclip/spec/lib/grow-tree.cjs \
  019c6f31-41ed-497a-93ba-cb4eff651a7c \
  audit.light
```

_(Substitua `audit.light` por `audit.heavy` se COMPLEXA.)_

O dry-run retorna JSON com `{ step, title, nextStep }` — sem POST algum na API.

Apresente ao usuário em linguagem simples:
- Qual é a variante escolhida (light ou heavy)
- O nome do primeiro cartão que seria criado
- Quantos cartões o fluxo tem no total (light ≈ 14 issues, heavy ≈ 16 issues)
- Que o fluxo é somente-leitura — nenhum código será modificado, apenas relatórios gerados
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
  audit.light \
  --confirm
```

_(Substitua `audit.light` por `audit.heavy` se COMPLEXA.)_

O grow-tree faz `GET /api/companies/<id>/agents` para resolver o roster de cargos e `POST /api/issues` para criar o primeiro cartão. Retorna JSON com `{ step, issueId, title, nextStep }`.

**Informe ao usuário:**
- O ID do cartão criado (campo `issueId` do JSON)
- O cargo responsável pelo primeiro passo (audit-intake)
- Como acompanhar: painel em `http://127.0.0.1:3100` — os cartões seguintes aparecem automaticamente conforme cada robô conclui a sua etapa
- Que a execução está 100% nos robôs; o Claude não precisa monitorar

---

## Notas operacionais

- O túnel SSH (`ssh hostinger-vps -L 3100:127.0.0.1:3100`) deve estar ativo antes do Passo 4. Se o grow-tree falhar com erro de conexão, peça ao usuário para verificar o túnel.
- O Paperclip orquestra a fila de dominó: cada robô que conclui cria o cartão seguinte via `blockedByIssueIds`. O fluxo light tem ~14 cartões e o heavy ~16 — nenhum precisa de intervenção manual entre os passos.
- O fluxo audit é somente-leitura por design (Iron Law do PAPERCLIP-AUDIT-WORKFLOW). Nenhum agente escreve código de produção. O resultado final são dois relatórios: técnico (para a equipe) e executivo (para stakeholders).
- Flags `--grill`, `--plan`, `--no-plan`, `--simples` não têm efeito neste comando e devem ser ignoradas silenciosamente.

</instructions>
