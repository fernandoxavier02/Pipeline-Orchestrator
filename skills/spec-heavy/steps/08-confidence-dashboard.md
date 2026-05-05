---
step_number: 08
step_name: "confidence-dashboard"
description: "Spec Heavy: Full confidence dashboard — 6 sub-dimensions, max 100pts"
execution_mode: inline
agent_type: ""
expected_inputs:
  - format_gate_report: from_step_01
  - content_review_report: from_step_02
  - tasks_completed: from_step_04
  - post_impl_report: from_step_05
  - arch_audit_report: from_step_06
  - security_report: from_step_07
expected_outputs:
  - confidence_score: number
  - spec_grade: string
  - dashboard_ascii: string
  - traceability_summary: object
  - open_findings: list
expected_next: 9
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Spec Lifecycle (Heavy) — Step 08: Confidence Dashboard

> **Position in pipeline:** Step 8 — pre-closure consolidation. Nao introduz findings novos; agrega 6 sub-dimensions (Format, Content, Implementation, Post-Impl, Architecture, Security) em um dashboard unico.
> **Goal:** Dar ao usuario um bloco ASCII paste-ready (release ticket / PR description) com Confidence % unico, Grade unico, e visibilidade de todos os 6 sub-scores.

---

## Quando usar

Use apos os 3 audits independentes (steps 05, 06, 07) terem retornado seus reports na ordem sequencial declarada (05 → 06 → 07 → 08). Este passo nao tem gate proprio: apenas consolida e prepara dados para o `spec-closer` (step 09) consumir.

## Regras

- Use a tabela de pontuacao completa (6 fases). Nao introduza fases novas que nao foram executadas.
- Se algum input ausente (ex: post_impl_report null, arch_audit_report null, security_report null), nao chutar — emitir aviso e parar.
- Findings BLOCKER de qualquer step (02, 04, 05, 06, 07) puxam o grade automaticamente para `NOT READY` ou `REMEDIATION NEEDED`.

---

## Inputs

- `format_gate_report` (do step 01) — PASS/WARN/FAIL.
- `content_review_report` (do step 02) — score consolidado dos 12 eixos + decisao.
- `tasks_completed` (do step 04) — implementation status.
- `post_impl_report` (do step 05) — Congruence Score + decisao.
- `arch_audit_report` (do step 06) — score arquitetura + findings.
- `security_report` (do step 07) — score seguranca + threat model.

---

## Tabela de pontuacao (6 fases, max 100pts)

| Fase | PASS | WARN | FAIL |
|---|---|---|---|
| 1. Format Gate | +15 | +10 | STOP |
| 2. Content Review | +20 | +15 | STOP |
| 3. Implementation | +25 | +20 | +5 |
| 4a. Post-Impl Validator | +25 | +18 | +5 |
| 4b. Architecture Audit | +10 | +7 | +2 |
| 4c. Security Review | +5 | +3 | +0 |
| **TOTAL (Heavy)** | **100** | **73** | **17** |

Notas:
- Fase 1 e Fase 2 FAIL nunca chegam aqui (pipeline para nos steps 01/02).
- Fase 3 FAIL = abort durante implementation; ainda assim podemos calcular score parcial para fins de relatorio.
- Os 3 sub-scores de Fase 4 sao consumidos lado-a-lado no dashboard.
- Score numerico nao deve esconder findings BLOCKER — eles puxam o Grade abaixo independente do score.

---

## Calculo

```
pontos = pontos_fase1 + pontos_fase2 + pontos_fase3 + pontos_fase4a + pontos_fase4b + pontos_fase4c
Confidence Score = (pontos / 100) * 100   // ja esta em escala 0-100
```

### Tabela de grade (decisao final)

| Confidence | Grade |
|---|---|
| ≥ 90% | **PRODUCTION READY** |
| 75-89% | **DEPLOY WITH MONITORING** |
| 50-74% | **REMEDIATION NEEDED** |
| < 50% | **NOT READY** |

**Override por BLOCKER:** se ha BLOCKERs nao resolvidos em qualquer step, o Grade NUNCA pode ser `PRODUCTION READY`. Pisa-se em `REMEDIATION NEEDED` (se score >= 75%) ou `NOT READY` (se score < 75%).

O BLOCKER override pula deliberadamente o tier DEPLOY WITH MONITORING — a presença de qualquer BLOCKER significa que monitoramento sozinho não basta. O threshold de 75% no override é independente do floor de 50% NOT READY na tabela sem-BLOCKER.

---

## Resumo de rastreabilidade

Alem do score, emitir:
- `N/N` requisitos cobertos (do eixo 1 do step 05).
- `N/N` componentes do design TRACED (do eixo 3 do step 05).
- `N/N` testes por AC (do eixo 2 do step 05).
- `N` findings consolidados:
  - `N` BLOCKERs (steps 02, 05, 06, 07)
  - `N` HIGHs
  - `N` MEDIUMs
  - `N` LOWs
- `N` remediation loops executados (do step 04 `total_adversarial_rounds`).

---

## Formato de resposta obrigatorio (ASCII dashboard)

```
+======================================================================+
|  SPEC LIFECYCLE DASHBOARD (HEAVY): [feature-name]                     |
+======================================================================+
|  CONFIDENCE: [##########..........] XX%  [GRADE]                      |
+----------------------------------------------------------------------+
|  Phase 1: FORMAT          [PASS|WARN]      +15  / 15                  |
|  Phase 2: CONTENT REVIEW  [PASS|WARN]      +20  / 20                  |
|  Phase 3: IMPLEMENT       [PASS|WARN|FAIL] +25  / 25                  |
|  Phase 4: POST-IMPL AUDITS                                            |
|    4a) Post-Impl Valid.   [PASS|WARN|FAIL] +25  / 25  (Congr: NN%)    |
|    4b) Architecture Audit [PASS|WARN|FAIL] +10  / 10  (Score: NN/100) |
|    4c) Security Review    [PASS|WARN|FAIL] +05  / 05  (Score: N.N/10) |
+----------------------------------------------------------------------+
|  TRACEABILITY: N/N reqs | N/N components | N/N tests by AC            |
|  FINDINGS: N bloq | N altos | N medios | N baixos                    |
|  REMEDIATION LOOPS: N                                                 |
+======================================================================+
```

---

**Proximo step:** 09 (Closure)
