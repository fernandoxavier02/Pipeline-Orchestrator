---
step_number: 03
step_name: "implementation"
description: "Spec Light: TDD implementation with Vertical Slices and adversarial loop"
execution_mode: inline
agent_type: ""
expected_inputs:
  - atdd_scenarios: from_step_02
  - spec_context: from_spec_context_yaml
  - tasks_md: from_spec_path
expected_outputs:
  - tasks_completed: list
  - test_results: object
  - adversarial_loop_result: object
  - gate_decision: "approved | checkpoint | abort"
expected_next: 4
gate_required: true
gate_name: "adversarial-loop-checkpoint"
allowed_tools: [Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion]
---

# Spec Lifecycle (Light) — Step 03: Implementation (TDD + Vertical Slices + adversarial loop)

> **Position in pipeline:** Step 3 — the heaviest step. Drives the executor (TDD per task, adversarial review per batch, build+test per checkpoint) until tasks.md is fully ticked OR an unrecoverable failure halts the pipeline.
> **Goal:** Produce code that turns RED tests (from ATDD scenarios + tasks.md TDD subtasks) into GREEN, slice by slice, with adversarial review squashing security/architecture issues per batch.

---

## Quando usar

Use apos o ATDD seed (step 02) ter sido aprovado. As entradas obrigatorias sao: (a) o conjunto de cenarios ATDD com matriz de rastreabilidade; (b) o `tasks.md` da spec (validado pelo Format Gate em D1-D7); (c) acesso ao codigo do repo.

## Regras

- Siga o `tasks.md` da spec linha a linha. Nao reordene tasks sem checkpoint.
- TDD obrigatorio: para cada task implementadora, escrever teste RED → codigo GREEN → REFACTOR.
- Build obrigatorio ao final de cada CHECKPOINT (declarado em tasks.md a cada 3-5 tasks).
- Nao inventar funcionalidades fora da spec. Se surgir necessidade, pause via AskUserQuestion.
- STOP RULE: se build/teste falhar 2 vezes consecutivas no mesmo checkpoint, PARAR e analisar causa raiz antes de tentar de novo.

---

## Inputs

- `atdd_scenarios` (do step 02) — contrato de comportamento ja aprovado pelo usuario.
- `tasks_md` (da spec) — checklist de implementacao com subtasks de teste.
- `spec_context.scope` — limites do que pode ser tocado.

---

## Etapa 1 — Validation Gate (pre-implementacao)

Antes de tocar qualquer arquivo, emitir tabela GO/NO-GO consolidando:

| Criterio | Status |
|---|---|
| Format Gate (step 01) PASS ou GO-WARN | GO/NO-GO |
| ATDD scenarios (step 02) aprovados | GO/NO-GO |
| tasks.md tem CHECKPOINTS distribuidos | GO/NO-GO |
| Repo limpo (working tree clean ou apenas spec edits) | GO/NO-GO |
| Build atual passa (baseline antes de tocar) | GO/NO-GO |

Se qualquer item NO-GO: pausar e reportar antes de seguir.

---

## Etapa 2 — Loop de Vertical Slices

Para cada slice (grupo de tasks ate o proximo CHECKPOINT):

### 2.1 RED — escrever testes que falham
- Para cada task com subtask de teste (e ATDD scenario tagged `AC#N`):
  - Criar arquivo de teste em layer apropriada (unit/integration/e2e).
  - Implementar o cenario GIVEN/WHEN/THEN como `it('...')`.
  - Rodar testes — confirmar que falham (RED).

### 2.2 GREEN — codigo minimo para passar
- Implementar o codigo de producao mais simples que faz os testes RED ficarem GREEN.
- Sem inventar campos, metodos ou abstracoes nao previstos na spec.

### 2.3 REFACTOR — melhorar sem mudar comportamento
- Reorganizar codigo se ficou confuso, mas SEM alterar testes.
- Rodar testes de novo — devem continuar GREEN.

### 2.4 Marcar `[x]` em tasks.md
- Apenas apos GREEN + REFACTOR confirmados.

### 2.5 CHECKPOINT — build + testes
- Rodar build completo do projeto.
- Rodar suite de testes completa (incluindo regressao).
- Status esperado: build PASS + 0 testes em FAIL.

---

## Etapa 3 — Loop adversarial (per batch)

Apos cada CHECKPOINT verde, dispatchar revisao adversarial paralela (agentes `adversarial-security-scanner` + `adversarial-architecture-critic` se disponiveis no repo, ou inline se nao houver agentes adversariais configurados).

### Loop com escalation a cada 3 tentativas + hard cap

Estado por slice:
- `loop_attempt` (counter per-slice, comeca em 0; reseta a cada slice; usado pra trigger AskUserQuestion escalation a cada 3).
- `findings_signature` (hash dos findings da rodada anterior — ver definicao abaixo).

Estado pipeline-level (acumula across slices):
- `total_adversarial_rounds` (counter, max 9; usado pra hard cap absoluto).
  <!-- Rationale do hard cap: max 9 = 3 slices x 3 rounds/slice. Alem disso o sinal
       e que o Light esta saturado de findings — promover para spec-heavy (mais auditoria)
       ao inves de continuar gastando rodadas em Light. Heavy usa 12 (4 x 3). -->

Definicao de `findings_signature` (Node.js — entrada canonica;
runtime pode usar qualquer impl de sha256, ver nota de cross-ref abaixo):

```js
const crypto = require('crypto');
const payload = JSON.stringify(findings.map(f => f.id + '|' + f.severity).sort());
const findings_signature = crypto.createHash('sha256').update(payload).digest('hex');
```

<!-- MIRROR: skills/spec-heavy/steps/04-implementation.md
     A entrada canonica do `findings_signature` (a string que vai pro hash —
     `JSON.stringify(findings.map(f => f.id + '|' + f.severity).sort())`) e
     identica entre Light e Heavy. Qualquer implementacao de sha256 (Node crypto,
     openssl CLI, web crypto subtle, biblioteca de terceiro) e aceitavel desde
     que a entrada seja exatamente essa. Sync edits across both files. -->

Duas rodadas consecutivas com a MESMA assinatura forcam checkpoint imediato sem incrementar `loop_attempt`.

Algoritmo:
1. Rodar adversarial review.
2. Se 0 findings: prosseguir para proximo slice.
3. Se findings > 0: incrementar `loop_attempt` E `total_adversarial_rounds`; aplicar fixes; rodar build+testes. Se `loop_attempt > 0 AND loop_attempt % 3 == 0`, pausar via AskUserQuestion com 4 opcoes:
   - **Continuar loop (Recomendado se progresso visivel)** — fazer mais 3 tentativas.
   - **Escalar para spec-heavy** — Light esta no limite; promover para skill `spec-heavy` (mais auditoria).
   - **Aceitar warnings** — registrar findings nao-bloqueantes e seguir.
   - **Abortar pipeline** — encerrar sem closure.

   Voltar a (1).
4. Same-findings detection: se `findings_signature` igual ao da rodada anterior, forcar checkpoint imediato (sem incrementar `loop_attempt` nem `total_adversarial_rounds`).

### Stop rule do loop adversarial

- 2 falhas consecutivas de build/teste durante fix-loop → PARAR e analisar causa raiz.
- Findings classificados como BLOCKER nunca podem ser "aceitos como warnings" — apenas escalar ou abortar.
- **Hard cap:** se `total_adversarial_rounds >= 9`, ABORT pipeline e escalate to `spec-heavy` variant (manual user decision required — nao continuar Light).

---

## Formato de resposta obrigatorio

```markdown
## IMPLEMENTATION REPORT — [feature-name]

### Validation Gate
| Criterio | Status |
| ... | ... |

### Slices
Slice 1 (tasks 1-4):
  - Tasks: [x] T1, [x] T2, [x] T3, [x] T4
  - Tests: 7 RED → GREEN; 0 regression broken
  - Adversarial: 1 round, 0 findings
  - Checkpoint: PASS

Slice 2 (tasks 5-8):
  - Tasks: [x] T5, [x] T6, [x] T7, [x] T8
  - Tests: ...
  - Adversarial: 2 rounds (1 finding fixed)
  - Checkpoint: PASS

### Resumo
- N tasks completas / N total
- N testes RED → GREEN
- N rondas adversariais
- Build status: PASS | FAIL
- loop_attempt final: N

### Decisao
approved | checkpoint (escalation needed) | abort
```

---

## Gate (AskUserQuestion mandatorio)

A cada 3 tentativas adversariais, ou ao final do step, abrir AskUserQuestion com header `Adversarial` e as 4 opcoes acima. Recomendacao default: `Continuar loop` se progresso, `Aceitar warnings` se findings sao todos LOW e bloqueio nao e estrutural.

---

**Proximo step:** 04
