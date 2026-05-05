---
step_number: 04
step_name: "post-impl-validation"
description: "Spec Light: Spec-to-code congruence across 6 axes (Congruence Score)"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:spec-post-impl-validator"
expected_inputs:
  - tasks_completed: from_step_03
  - spec_context: from_spec_context_yaml
  - adversarial_loop_result: from_step_03
expected_outputs:
  - congruence_score: number
  - post_impl_report: object
  - gate_decision: "PASS | PASS_WITH_WARNINGS | FAIL"
expected_next: 5
gate_required: true
gate_name: "post-impl-validation"
allowed_tools: [Read, Grep, Glob, Bash]
---

# Spec Lifecycle (Light) — Step 04: Post-Impl Validation (6-axis congruence)

> **Position in pipeline:** Step 4 — last quality gate before scoring/closure. Cross-checks spec against code.
> **Goal:** Produce a Congruence Score (0-100%) that quantifies how faithfully the implementation reflects the spec, across 6 weighted axes. In Light mode this is the SOLE audit step (no separate auditor-senior or red-team); the depth of checks here is what justifies skipping content-review.

---

## Quando usar

Use apos a Implementation (step 03) ter terminado com build PASS e adversarial loop encerrado. Este passo nao escreve codigo — ele auditA o que foi escrito contra o que a spec prometeu.

## Regras

- Nao implemente codigo nesta etapa.
- NUNCA invente contexto: se algo no codigo nao tem base na spec, classifique como `INVENTION:<class>` (TOLERABLE | SUSPICIOUS | BLOCKER).
- Se algum AC nao tiver evidencia rastreavel no codigo, classifique como `GAP` no eixo correspondente.
- Score abaixo de 75% requer remediacao antes de prosseguir; abaixo de 50% bloqueia closure.

---

## Inputs

- `tasks_completed` (do step 03) — lista de tasks marcadas `[x]` com arquivos/commits associados.
- `spec_context` — feature, scope, AC list, contratos.
- `adversarial_loop_result` (do step 03) — findings nao resolvidos (se houver) ja classificados.

---

## Os 6 eixos (com pesos)

### Eixo 1 — Requirement Coverage (peso 25%)

Para cada AC do `requirements.md`, mapear para arquivos/funcoes/testes que o cobrem. Tags: `TRACED | GAP | PARTIAL`.

| AC ID | Requisito (resumo) | Arquivo:linha | Status |
|---|---|---|---|
| AC#1 | Sistema deve X | `src/feature/x.ts:42` | TRACED |
| AC#2 | Falha graciosa | (nenhum) | GAP |
| AC#3 | Validacao de input | `src/feature/v.ts:10` | PARTIAL |

Score do eixo = `(TRACED + 0.5 * PARTIAL) / total_AC * 100`.

### Eixo 2 — Test Coverage by AC (peso 20%)

Para cada AC, verificar se ha pelo menos um teste que o exercita explicitamente (idealmente o mesmo cenario ATDD aprovado em step 02). Tags: `TRACED | GAP`.

### Eixo 3 — Design Congruence (peso 15%)

Para cada componente declarado em `design.md` (ex: ServiceX, RepoY, EntityZ), verificar se existe arquivo no codigo. Tags: `TRACED | GAP`.

### Eixo 4 — Task Completeness (peso 15%)

Para cada task `[x]` em `tasks.md`, verificar se ha evidencia (commit, arquivo modificado, teste novo). Tags: `TRACED | GAP | DRIFT` (DRIFT = task marcada `[x]` mas sem evidencia, ou evidencia diverge do que a task descreveu).

### Eixo 5 — Non-Invention Audit (peso 15%)

Listar codigo novo que NAO tem base na spec. Para cada item, classificar: `INVENTION:TOLERABLE` (helper interno trivial), `INVENTION:SUSPICIOUS` (logica nova que altera comportamento — exige justificativa), `INVENTION:BLOCKER` (campo persistido, contrato exposto, side-effect novo — bloqueia o gate).

### Eixo 6 — Contract Compliance (peso 10%)

Para cada contrato declarado em `design.md` (API, schema, evento), comparar contra a implementacao. Tags: `TRACED | DRIFT`.

---

## Calculo do Congruence Score

```
Score = Eixo1*0.25 + Eixo2*0.20 + Eixo3*0.15 + Eixo4*0.15 + Eixo5*0.15 + Eixo6*0.10
```

Cada eixo retorna 0-100. Score final tambem 0-100.

### Decisao

| Score | Decisao |
|---|---|
| ≥ 90% | **PASS** |
| 75-89% | **PASS_WITH_WARNINGS** (remediar warnings antes do release) |
| < 75% | **FAIL** (remediar e re-rodar antes de prosseguir) |

Qualquer `INVENTION:BLOCKER` no eixo 5 forca **FAIL** independente do score numerico.

> **Nota:** o label de grade textual (PRODUCTION READY / DEPLOY WITH MONITORING / REMEDIATION NEEDED / NOT READY) e gerado em **step 05** baseado em score consolidado de todos os 6 steps — nao em score isolado de step 04. Step 04 emite apenas a decisao PASS/PASS_WITH_WARNINGS/FAIL com o Congruence Score numerico.

---

## Formato de resposta obrigatorio

```markdown
## POST-IMPL VALIDATION — [feature-name]

### Eixo 1 — Requirement Coverage (peso 25%)
| AC | Status | Evidencia |
| ... |
Score eixo: XX/100

### Eixo 2 — Test Coverage by AC (peso 20%)
... (tabela) ...
Score eixo: XX/100

### Eixo 3 — Design Congruence (peso 15%)
... (tabela) ...
Score eixo: XX/100

### Eixo 4 — Task Completeness (peso 15%)
... (tabela) ...
Score eixo: XX/100

### Eixo 5 — Non-Invention Audit (peso 15%)
... (tabela com classificacao TOLERABLE/SUSPICIOUS/BLOCKER) ...
Score eixo: XX/100

### Eixo 6 — Contract Compliance (peso 10%)
... (tabela) ...
Score eixo: XX/100

### Congruence Score Final: XX%
### Decisao: PASS | PASS_WITH_WARNINGS | FAIL

### Remediacoes (se WARN/FAIL)
- [item priorizado 1]
- [item priorizado 2]
```

---

## Gate (AskUserQuestion mandatorio)

Apos emitir o report, abrir AskUserQuestion com header `Post-Impl` e opcoes:
- **Aprovar (Recomendado se PASS)** — prosseguir para step 05 (dashboard).
- **Aprovar com warnings (PASS_WITH_WARNINGS)** — prosseguir; warnings registrados no closure-report.
- **Remediar e re-rodar** — voltar ao step 03 com lista de remediacao.
- **Abortar pipeline** — encerrar sem closure.

---

**Proximo step:** 05
