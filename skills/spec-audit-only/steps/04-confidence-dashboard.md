---
step_number: 04
step_name: "confidence-dashboard"
description: "Spec Audit-Only: Confidence dashboard — audit-mode scoring (no implementation phase, baseline 75)"
execution_mode: inline
agent_type: ""
production_writes_allowed: false
expected_inputs:
  - format_gate_report: from_step_01
  - content_review_report: from_step_02
  - audit_findings: from_step_03
  - loop_result: from_step_03
expected_outputs:
  - confidence_score: number
  - spec_grade: string
  - dashboard_ascii: string
expected_next: 5
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Spec Lifecycle (Audit-Only) — Step 04: Confidence Dashboard

> **Position in pipeline:** Step 4 — pre-closure consolidation. Nao introduz findings novos; agrega Format Gate, Content Review e os tres sub-resultados do Audit Loop em um dashboard unico.
> **Goal:** Dar ao usuario um bloco ASCII paste-ready com Confidence % unico, Grade unico, e visibilidade dos sub-scores. Audit-mode usa baseline 75 — uma spec saudavel pos-implementacao deveria pontuar pelo menos isso.

---

## Quando usar

Use apos o Audit Loop (step 03) ter convergido (gate `adversarial-loop-checkpoint` aprovado). Este passo nao tem gate proprio: apenas consolida e prepara dados para o `spec-closer` (step 05) consumir.

## Regras

- Use a tabela de pontuacao audit-mode (sem fase de implementation). Nao introduza fases novas que nao foram executadas.
- Se algum input ausente (ex: `loop_result` null), nao chutar — emitir aviso e parar.
- Findings BLOCKER que sairam como `escalation` ainda sao BLOCKERs do ponto de vista do grade — eles NAO foram resolvidos, apenas adiados.
- Audit-mode baseline: minimum score expected for a healthy post-implementation spec = **75**. Score abaixo disso indica que a spec ou o codigo entregue tem dividas significativas de congruencia.

---

## Inputs

- `format_gate_report` (do step 01) — PASS/WARN/FAIL.
- `content_review_report` (do step 02) — score consolidado dos 12 eixos + decisao.
- `audit_findings` (do step 03) — lista consolidada com severity + source.
- `loop_result` (do step 03) — total_rounds + counts + gate_decision.

---

## Tabela de pontuacao (audit-mode, max 100pts)

Audit-only NAO tem fase de implementation. As fases auditadas viram subscores diretos do audit loop.

| Fase | PASS | WARN | FAIL |
|---|---|---|---|
| 1. Format Gate | +15 | +10 | STOP |
| 2. Content Review | +20 | +15 | STOP |
| 3. Audit Loop (consolidado) | +25 | +20 | +5 |
| 4a. Post-Impl Validator (do audit loop) | +25 | +18 | +5 |
| 4b. Architecture Critic (do audit loop) | +10 | +7 | +2 |
| 4c. Security Scanner (do audit loop) | +5 | +3 | +0 |
| **TOTAL (Audit-Only)** | **100** | **73** | **17** |

Notas:
- Fase 3 "Audit Loop" recebe PASS se `loop_result.gate_decision == approved` SEM BLOCKERs outstanding; WARN se `approved` com warnings aceitos; FAIL se `abort` ou stop-rule disparado.
- 4a/4b/4c sao os tres sub-scores dos auditores individuais (puxados do `audit_findings` filtrado por `source`).
- Fase 1 e Fase 2 FAIL nunca chegam aqui (pipeline para nos steps 01/02).

### Como classificar PASS/WARN/FAIL por sub-score

| Sub-score | PASS | WARN | FAIL |
|---|---|---|---|
| Post-Impl Validator | 0 BLOCKER, <= 2 HIGH | <= 1 BLOCKER aceito como warning, <= 4 HIGH | >= 1 BLOCKER outstanding ou >= 5 HIGH |
| Architecture Critic | 0 BLOCKER, <= 3 MEDIUM/LOW | <= 1 BLOCKER aceito, <= 5 HIGH | >= 1 BLOCKER outstanding ou >= 3 HIGH |
| Security Scanner | 0 BLOCKER, 0 HIGH em auth/secrets/injection | <= 1 HIGH em low-impact eixo, 0 BLOCKER | >= 1 BLOCKER em qualquer eixo critico (auth, secrets, injection, race) |

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

**Audit-mode baseline (75):** uma spec ja implementada que pontua < 75% indica drift significativo entre artefatos e codigo — mensagem do dashboard sinaliza explicitamente "ABAIXO DA BASELINE AUDIT-MODE" para chamar atencao do usuario.

**Override por BLOCKER:** se ha BLOCKERs outstanding (incluindo os escalados) em qualquer step, o Grade NUNCA pode ser `PRODUCTION READY`. Pisa-se em `REMEDIATION NEEDED` (se score >= 75%) ou `NOT READY` (se score < 75%).

O BLOCKER override pula deliberadamente o tier DEPLOY WITH MONITORING — a presença de qualquer BLOCKER significa que monitoramento sozinho não basta.

---

## Resumo de rastreabilidade

Alem do score, emitir:
- `N/N` requisitos cobertos (do eixo 1 do step 03 post-impl source).
- `N/N` componentes do design TRACED (do eixo 3 do step 03 post-impl source).
- `N/N` testes por AC (do eixo 2 do step 03 post-impl source).
- `N` findings consolidados:
  - `N` BLOCKERs (outstanding + escalated)
  - `N` HIGHs
  - `N` MEDIUMs
  - `N` LOWs
- `N` rodadas adversarial executadas (do `loop_result.total_rounds`).
- `N` fixes_applied (do step 03).

---

## Formato de resposta obrigatorio (ASCII dashboard)

```
+======================================================================+
|  SPEC LIFECYCLE DASHBOARD (AUDIT-ONLY): [feature-name]                |
+======================================================================+
|  CONFIDENCE: [##########..........] XX%  [GRADE]                      |
|  Audit-mode baseline: 75% — [ACIMA | ABAIXO DA BASELINE]              |
+----------------------------------------------------------------------+
|  Phase 1: FORMAT          [PASS|WARN]      +15  / 15                  |
|  Phase 2: CONTENT REVIEW  [PASS|WARN]      +20  / 20                  |
|  Phase 3: AUDIT LOOP      [PASS|WARN|FAIL] +25  / 25                  |
|  Phase 4: SUB-AUDITS                                                  |
|    4a) Post-Impl Valid.   [PASS|WARN|FAIL] +25  / 25                  |
|    4b) Architecture Crit. [PASS|WARN|FAIL] +10  / 10                  |
|    4c) Security Scanner   [PASS|WARN|FAIL] +05  / 05                  |
+----------------------------------------------------------------------+
|  TRACEABILITY: N/N reqs | N/N components | N/N tests by AC            |
|  FINDINGS: N bloq | N altos | N medios | N baixos                    |
|  ADVERSARIAL ROUNDS: N | FIXES APPLIED: N | ESCALATED: N              |
+======================================================================+
```

---

**Proximo step:** 05 (Closure)
