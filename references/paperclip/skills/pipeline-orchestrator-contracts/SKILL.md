---
name: pipeline-orchestrator-contracts
description: Contratos de comunicacao adaptados (GATE_REQUEST, DISPATCH_REQUEST, ORCHESTRATOR_DECISION, etc.) do pipeline-orchestrator original para o modelo Paperclip+Codex (assincrono, ticket-based, comment-driven).
when_to_use: Qualquer cargo do pipeline-orchestrator que precise solicitar decisao do Board, despachar subordinado, emitir veredicto estruturado, ou registrar decisao de orquestracao. Carregada por TODOS os 47 cargos por default.
inputs:
  - issue_id: ID da issue atual (obtido via PAPERCLIP_TASK_ID)
  - cargo: nome do cargo emissor (obtido via PAPERCLIP_AGENT_ID + /api/agents/me)
---

# pipeline-orchestrator-contracts

Este documento define como os contratos de texto do pipeline-orchestrator original (desenhado para Claude Code) sao traduzidos para o modelo Paperclip+Codex. Use este protocolo SEMPRE — nao improvise formatos novos.

## Principio fundamental

No Claude Code, contratos sao YAMLs embutidos no output (workaround do Achado 7). No Paperclip, contratos sao:

1. **Comment estruturado** no ticket (corpo da decisao)
2. **+ Mudanca de estado real** via API Paperclip (status, assignee, approver, parent)

A duplicacao "comment + API call" eh proposital — o comment serve de log auditavel, e a API call dispara o workflow.

## 1. GATE_REQUEST — Solicitar decisao do Board

**Quando usar:**
- Voce identificou ambiguidade que so o Board (humano) pode resolver
- Voce esta em micro-gate antes de operacao destrutiva (delete, migration, prod deploy)
- Voce tem 2-4 opcoes discretas com trade-offs reais

**Como agir:**

### Passo A — Postar comment estruturado

POST `/api/issues/{issue_id}/comments` com body:

```markdown
### GATE_REQUEST v1

**question:** Pergunta clara em portugues, terminando em `?`

**header:** Label curto (max 12 chars)

**options:**
- **{{label 1}} (Recomendado)** — {{1-2 frases explicando trade-off, citando file:line se aplicavel}}
- **{{label 2}}** — {{1-2 frases}}
- **{{label 3}}** — {{1-2 frases}}

**evidence:**
- `path/to/file.py:42` — {{trecho ou descricao}}
- `path/to/other.md:118` — {{trecho ou descricao}}

**recommendation:** Opcao 1, porque {{justificativa curta}}
```

### Passo B — Abrir approval request e mudar status

O mecanismo real do Paperclip para decisao do Board eh um **approval object**, nao um campo de approver na issue. Crie o approval (que ja linka a issue e acorda o Board) e ponha a issue em `blocked`:

```bash
# 1) abrir pedido formal de aprovacao do Board
POST /api/companies/{$PAPERCLIP_COMPANY_ID}/approvals  body: {
  "type": "request_board_approval",
  "requestedByAgentId": "{your-agent-id}",
  "issueIds": ["{issue_id}"],
  "payload": { "title": "...", "summary": "...", "recommendedAction": "...", "risks": ["..."] }
}

# 2) status -> blocked
PATCH /api/issues/{issue_id}  body: { "status": "blocked" }
```

### Passo C — Sair do heartbeat

Sua sessao acaba aqui. Quando o Board responder, voce sera acordado com `PAPERCLIP_APPROVAL_ID` setado e a resposta dele estara nos comments. Retomar do passo 5 do heartbeat (scoped wake).

## 2. DISPATCH_REQUEST — Spawnar subordinado

**Quando usar:**
- Voce identificou trabalho que pertence a um cargo subordinado
- Quer paralelismo (varios subordinados em sub-issues separadas)
- Quer rastreabilidade (issue-mae bloqueada por entregas filhas)

**Como agir:**

### Passo A — Criar child issue

POST `/api/companies/{$PAPERCLIP_COMPANY_ID}/issues` com body:

```json
{
  "title": "Label curto da delegacao",
  "description": "...briefing completo, criterios de aceitacao...",
  "assigneeAgentId": "{{agent-id-do-subordinado}}",
  "parentId": "{{issue_id_atual}}",
  "priority": "medium"
}
```

Os nomes de campo sao `assigneeAgentId` e `parentId` (ids, nao slugs). Resolva slug→id via `GET /api/companies/{$PAPERCLIP_COMPANY_ID}/agents` antes de criar a child.

### Passo B — Postar comment na issue-mae

```markdown
### DISPATCH_REQUEST v1

**delegated_to:** {{cargo-subordinado-slug}}
**child_issue:** {{novo-issue-id}}
**deliverable:** O que voce espera de volta
**deadline:** {{quando aplicavel}}
```

### Passo C — Mudar status da issue-mae

PATCH `/api/issues/{issue_id}` body: `{ "status": "blocked", "blockedByIssueIds": ["{{novo-child-id}}"] }`

O campo para **gravar** dependencia eh `blockedByIssueIds` (array, substitui o conjunto inteiro a cada PATCH). `blockedBy` eh somente-leitura na resposta do GET — gravar `blockedBy` eh ignorado em silencio e a dependencia nao pega.

### Passo D — Sair (ou continuar com proxima delegacao)

Se ha mais work pra delegar, repita. Senao, exit. Voce sera acordado quando child issue fechar.

## 3. ORCHESTRATOR_DECISION — Registrar decisao de orquestracao

**Quando usar:**
- Voce eh task-orchestrator, pipeline-controller, brainstorm-controller, executor-controller, ou review-orchestrator
- Classificou trabalho e quer registrar a decisao auditavel

**Como agir:**

POST comment no ticket atual:

```markdown
### ORCHESTRATOR_DECISION v1

```yaml
task_type: {{Feature | Bug Fix | User Story | Spec | UX | Audit | Adversarial Review}}
complexity: {{SIMPLES | MEDIA | COMPLEXA}}
pipeline_selected: {{nome-do-pipeline}}
classification_reason: {{2-3 frases explicando}}
estimated_phases: [phase-1, phase-2, ...]
required_agents: [agent-1, agent-2, ...]
risk_factors: [...]
```
```

Nao precisa mudar status — eh decisao auditavel, nao bloqueio.

## 4. PLAN_MODE_REQUEST — Pedir modo research read-only

**Quando usar:**
- Voce eh plan-architect ou brainstorm-controller
- Precisa pesquisar o codebase sem fazer mudancas

**Como agir:**

POST comment:

```markdown
### PLAN_MODE_REQUEST v1

**purpose:** {{pra que vou pesquisar}}
**read_only_period:** Ate eu postar PLAN_MODE_COMPLETE
**files_likely:** [path1, path2, ...]
```

Codex CLI nao tem modo read-only oficial. Voce auto-policia: NAO chamar nenhuma tool que escreva (Edit, Write, Bash com side effects). So Read, Glob, Grep, WebFetch, WebSearch.

Ao terminar:

```markdown
### PLAN_MODE_COMPLETE v1

**findings:** {{resumo}}
**next:** {{proximo passo, geralmente um comment com proposta de plano}}
```

## 5. SENTINEL_VERDICT — Validacao de processo

(Usado pelo cargo `sentinel`)

POST comment:

```markdown
### SENTINEL_VERDICT v1

```yaml
mode: {{ORCHESTRATOR_VALIDATION | SEQUENCE_VALIDATION | COHERENCE_VALIDATION}}
status: {{PASS | CORRECTED | BLOCKED}}
findings:
  - severity: {{critical | high | medium | low}}
    issue: {{descricao}}
    evidence: {{file:line ou referenced comment id}}
corrected_actions:
  - {{acao que voce aplicou pra corrigir}}
blocked_reason: {{se BLOCKED}}
```
```

Se `BLOCKED`, mudar status do ticket-mae correspondente e abrir approval request (ver §1 Passo B).

## 6. PA_DE_CAL — Veredicto final

(Usado pelo cargo `final-validator`)

POST comment + atualizar status da issue-mae:

```markdown
### PA_DE_CAL v1

```yaml
verdict: {{GO | CONDITIONAL_GO | NO_GO}}
confidence: {{0.0-1.0}}
fidelity_score: {{0.0-1.0}}
axes_passed: [requirement_coverage, test_coverage, design_congruence, ...]
axes_failed: []
conditions: [...]  # se CONDITIONAL_GO
no_go_reasons: [...]  # se NO_GO
```
```

PATCH status:
- `GO` → `done`
- `CONDITIONAL_GO` → `done` + comment com conditions
- `NO_GO` → `blocked` + comment + abrir approval request (ver §1 Passo B)

## 7. CHANGE_CONTRACT — Contrato de mudanca

(Anexado pelo plan-architect, lido por executor-*)

Como comment no ticket de plano:

```markdown
### CHANGE_CONTRACT v1

```yaml
scope:
  files_in: [path/a.py, path/b.py]
  files_out: [tudo mais — proibido tocar]
  packages_in: [...]  # pode adicionar dependencias?
  packages_out: [...]  # nao pode tocar nessas
prohibited:
  - "Nao adicionar dependencias novas"
  - "Nao alterar contratos publicos de API"
required:
  - "TDD: RED antes de GREEN"
  - "Diff minimo: nao refatorar trechos nao tocados"
tests_required:
  - {{descricao do que precisa virar teste}}
```
```

Cada cargo executor le isto antes de qualquer tool Write/Edit.

## 8. CHECKPOINT_RESULT — Resultado de batch

(Usado pelo checkpoint-validator)

```markdown
### CHECKPOINT_RESULT v1

```yaml
batch_number: {{N}}
build_status: {{PASS | FAIL}}
build_command: "..."
build_output: |
  {{output literal — evidencia}}
tests_status: {{PASS | FAIL | SKIPPED}}
tests_command: "..."
tests_output: |
  {{output literal}}
regression_status: {{PASS | FAIL | NOT_RUN}}
verdict: {{CONTINUE | STOP_RULE_TRIGGERED | NEEDS_FIX}}
stop_rule_count: {{0-2}}
```
```

Se `STOP_RULE_TRIGGERED` (2 falhas consecutivas), status=blocked + abrir approval request (ver §1 Passo B).

## 9. Naming e rastreabilidade

Seu agent.name eh slug literal do pipeline-orchestrator original (ex: `information-gate`). Os contratos podem ser parseados por orquestradores (humano ou agente) buscando por `### HEADER vN` no comments — mantenha o cabecalho literal, no `vN` correto.

## 10. Anti-padroes (NAO faca)

- ❌ NAO emitir GATE_REQUEST e continuar trabalhando — voce DEVE exit
- ❌ NAO usar comment de chat informal para registrar decisoes auditaveis — use os headers v1
- ❌ NAO traduzir GATE_REQUEST/DISPATCH_REQUEST para portugues ("PEDIDO_DE_GATE") — manter ingles original pra parsers
- ❌ NAO inventar contratos novos — se algo nao se encaixa aqui, postar comment livre + solicitar Board pra atualizar esta skill
- ❌ NAO usar AskUserQuestion direto (nao existe no Paperclip) — sempre via GATE_REQUEST comment

## 11. Recap rapido

| Acao | Comment header | Mudanca de estado |
|---|---|---|
| Pedir decisao Board | `### GATE_REQUEST v1` | abrir approval request + status=blocked |
| Despachar subordinado | `### DISPATCH_REQUEST v1` | criar child issue + status=blocked |
| Registrar orquestracao | `### ORCHESTRATOR_DECISION v1` | nenhuma |
| Modo research | `### PLAN_MODE_REQUEST v1` | self-policiar Read-only |
| Validar processo | `### SENTINEL_VERDICT v1` | conforme verdict |
| Veredicto final | `### PA_DE_CAL v1` | status=done/blocked |
| Contrato de mudanca | `### CHANGE_CONTRACT v1` | nenhuma (anexo) |
| Resultado de batch | `### CHECKPOINT_RESULT v1` | conforme verdict |
