---
step_number: 05
step_name: "confidence-dashboard"
description: "Spec Light: Consolidated confidence score and grade (3-phase, max 65pts normalized to 100%)"
execution_mode: inline
agent_type: ""
expected_inputs:
  - format_gate_report: from_step_01
  - tasks_completed: from_step_03
  - post_impl_report: from_step_04
expected_outputs:
  - confidence_score: number
  - spec_grade: string
  - dashboard_ascii: string
  - traceability_summary: object
expected_next: 6
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Spec Lifecycle (Light) — Step 05: Confidence Dashboard

> **Position in pipeline:** Step 5 — pre-closure consolidation. Doesn't introduce new findings; aggregates the 3 prior phases (Format, Implementation, Post-Impl) into a single readable dashboard.
> **Goal:** Give the user one ASCII block they can paste into a release ticket / PR description, with a single number (Confidence %) and a single label (Grade).

---

## Quando usar

Use apos a Post-Impl Validation (step 04) ter retornado PASS ou PASS_WITH_WARNINGS. Este passo nao tem gate proprio — apenas consolida e prepara os dados que o `spec-closer` (step 06) vai consumir.

## Regras

- Use a tabela de pontuacao simplificada (3 fases). Nao introduza fases novas que nao foram executadas.
- Se algum input ausente (ex: post_impl_report null), nao chutar — emitir aviso e parar.

---

## Inputs

- `format_gate_report` (do step 01) — para extrair PASS/WARN/FAIL do Format Gate.
- `tasks_completed` (do step 03) — para extrair status de implementation (PASS se build PASS + 0 testes em FAIL; WARN se warnings adversariais aceitos; FAIL se houve abort).
- `post_impl_report` (do step 04) — para extrair Congruence Score e decisao.

---

## Tabela de pontuacao (3 fases)

| Fase | PASS | WARN | FAIL |
|---|---|---|---|
| 1. Format Gate | +15 | +10 | STOP |
| 2. Implementation | +25 | +20 | +5 |
| 3. Post-Impl Validator | +25 | +18 | +5 |
| **TOTAL (Light)** | **65** | **48** | **10** |

Notas:
- Fase 1 FAIL nunca chega aqui (pipeline para no step 01).
- Fase 2 FAIL = abort durante implementation; ainda assim podemos calcular score parcial para fins de relatorio.
- Fase 3 score numerico (Congruence Score do step 04) tambem entra como referencia secundaria no dashboard.

---

## Calculo

```
pontos = pontos_fase1 + pontos_fase2 + pontos_fase3
Confidence Score = (pontos / 65) * 100
```

### Tabela de grade (decisao final)

| Confidence | Grade |
|---|---|
| ≥ 90% | **PRODUCTION READY** |
| 75-89% | **DEPLOY WITH MONITORING** |
| 50-74% | **REMEDIATION NEEDED** |
| < 50% | **NOT READY** |

---

## Resumo de rastreabilidade

Alem do score, emitir:
- `N/N` requisitos cobertos (do eixo 1 do step 04).
- `N/N` componentes do design TRACED (do eixo 3).
- `N/N` testes por AC (do eixo 2).
- `N` findings: `N` bloqueadores, `N` altos, `N` medios, `N` baixos.

---

## Formato de resposta obrigatorio (ASCII dashboard)

```
+======================================================================+
|  SPEC LIFECYCLE DASHBOARD (LIGHT): [feature-name]                     |
+======================================================================+
|  CONFIDENCE: [##########..........] XX%  [GRADE]                      |
+----------------------------------------------------------------------+
|  Phase 1: FORMAT         [PASS|WARN]      +15  / 15                   |
|  Phase 2: IMPLEMENT      [PASS|WARN|FAIL] +25  / 25                   |
|  Phase 3: POST-IMPL      [PASS|WARN|FAIL] +25  / 25  (Congr: NN%)     |
|  Phase 4: CLOSURE        [PENDING — step 06]                          |
+----------------------------------------------------------------------+
|  TRACEABILITY: N/N reqs | N/N components | N/N tests by AC            |
|  FINDINGS: N bloq | N altos | N medios | N baixos                    |
+======================================================================+
```

---

**Proximo step:** 06 (Closure)
