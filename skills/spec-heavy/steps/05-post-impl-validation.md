---
step_number: 05
step_name: "post-impl-validation"
description: "Spec Heavy: Spec-to-code congruence across 6 axes (Congruence Score)"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:spec-post-impl-validator"
expected_inputs:
  - tasks_completed: from_step_04
  - content_review_report: from_step_02
  - spec_context: from_spec_context_yaml
  - adversarial_loop_result: from_step_04
expected_outputs:
  - congruence_score: number
  - post_impl_report: object
  - gate_decision: "PASS | PASS_WITH_WARNINGS | FAIL"
expected_next: 6
gate_required: true
gate_name: "post-impl-validation"
allowed_tools: [Read, Grep, Glob, Bash]
---

# Spec Lifecycle (Heavy) — Step 05: Post-Impl Validation (6-axis congruence)

> **Position in pipeline:** Step 5 — primeiro dos 3 audits independentes pos-implementation. Cross-checks spec contra codigo.
> **Goal:** Produzir um Congruence Score (0-100%) que quantifica fidelidade da implementacao a spec, em 6 eixos com peso. Steps 05, 06 e 07 sao auditorias independentes (auditam o mesmo codigo imutavel e nao se modificam mutuamente); resultados consolidam no step 08 (confidence dashboard).

---

## Quando usar

Use apos a Implementation (step 04) ter terminado com build PASS e adversarial loop encerrado. Este passo nao escreve codigo — ele audita o que foi escrito contra o que a spec prometeu.

## Ordem de execucao

A cadeia `expected_next` e sequencial: 05 → 06 → 07 → 08. O orchestrator dispatcha os steps nesta ordem. O frontmatter declara `expected_next: 6` para consistencia com a sequencia.

## Regras

- Nao implemente codigo nesta etapa.
- NUNCA invente contexto: se algo no codigo nao tem base na spec, classifique como `INVENTION:<class>` (TOLERABLE | SUSPICIOUS | BLOCKER).
- Se algum AC nao tiver evidencia rastreavel no codigo, classifique como `GAP` no eixo correspondente.
- Score abaixo de 75% requer remediacao antes de prosseguir; abaixo de 50% bloqueia closure.
- Cruzar findings com `content_review_report` do step 02: se eixo 1 do step 02 ja flaggeou GAPs req→design, esses GAPs aparecem aqui no eixo 3 (Design Congruence) e devem ser confirmados ou fechados.

---

## Inputs

- `tasks_completed` (do step 04) — lista de tasks marcadas `[x]` com arquivos/commits associados.
- `content_review_report` (do step 02) — referencia para cross-checking de findings ja conhecidos.
- `spec_context` — feature, scope, AC list, contratos.
- `adversarial_loop_result` (do step 04) — findings nao resolvidos (se houver) ja classificados.

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

Para cada AC, verificar se ha pelo menos um teste que o exercita explicitamente (idealmente o mesmo cenario ATDD aprovado em step 03). Tags: `TRACED | GAP`.

### Eixo 3 — Design Congruence (peso 15%)

Para cada componente declarado em `design.md`, verificar se existe arquivo no codigo. Tags: `TRACED | GAP`. Cruzar com eixo 1 do step 02 (Congruencia req→design): GAPs ja conhecidos devem ser explicitamente confirmados ou fechados aqui.

### Eixo 4 — Task Completeness (peso 15%)

Para cada task `[x]` em `tasks.md`, verificar se ha evidencia (commit, arquivo modificado, teste novo). Tags: `TRACED | GAP | DRIFT` (DRIFT = task marcada `[x]` mas sem evidencia, ou evidencia diverge do que a task descreveu).

### Eixo 5 — Non-Invention Audit (peso 15%)

Listar codigo novo que NAO tem base na spec. Para cada item, classificar: `INVENTION:TOLERABLE` (helper interno trivial), `INVENTION:SUSPICIOUS` (logica nova que altera comportamento — exige justificativa), `INVENTION:BLOCKER` (campo persistido, contrato exposto, side-effect novo — bloqueia o gate).

### Eixo 6 — Contract Compliance (peso 10%)

Para cada contrato declarado em `design.md` (API, schema, evento), comparar contra a implementacao. Tags: `TRACED | DRIFT`. Cruzar com eixo 5 do step 02 (Completude de contratos): contratos flaggeados como `PARTIAL` ali devem aparecer aqui ou como `TRACED` (foram completados na impl) ou como `DRIFT` (continuaram parciais).

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

> **Nota:** o label de grade textual (PRODUCTION READY / DEPLOY WITH MONITORING / REMEDIATION NEEDED / NOT READY) e gerado em **step 08** baseado em score consolidado de todos os 7 phases (1, 2, 3 implicito via 4, 4, 5, 6, 7) — nao em score isolado de step 05. Step 05 emite apenas a decisao PASS/PASS_WITH_WARNINGS/FAIL com o Congruence Score numerico.

---

## Formato de resposta obrigatorio

```markdown
## POST-IMPL VALIDATION (HEAVY) — [feature-name]

### Eixo 1 — Requirement Coverage (peso 25%)
| AC | Status | Evidencia |
| ... |
Score eixo: XX/100

### Eixo 2 — Test Coverage by AC (peso 20%)
... (tabela) ...
Score eixo: XX/100

### Eixo 3 — Design Congruence (peso 15%)
... (tabela; cross-check com step 02 eixo 1) ...
Score eixo: XX/100

### Eixo 4 — Task Completeness (peso 15%)
... (tabela) ...
Score eixo: XX/100

### Eixo 5 — Non-Invention Audit (peso 15%)
... (tabela com classificacao TOLERABLE/SUSPICIOUS/BLOCKER) ...
Score eixo: XX/100

### Eixo 6 — Contract Compliance (peso 10%)
... (tabela; cross-check com step 02 eixo 5) ...
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
- **Aprovar (Recomendado se PASS)** — prosseguir para step 06 (architecture audit).
- **Aprovar com warnings (PASS_WITH_WARNINGS)** — prosseguir; warnings registrados no closure-report.
- **Remediar e re-rodar** — voltar ao step 04 com lista de remediacao.
- **Abortar pipeline** — encerrar sem closure.

---

**Proximo step:** 06 (sequencial)
