---
title: Open Questions Resolved — Spec Workflow Integration v4.9.0
status: ready-for-wave-1
date: 2026-05-04
parent_doc: spec-workflow-integration.design.md
session_type: pre-implementation-research
---

# Open Questions Resolved (pré-Wave 1)

Resolução das 4 open questions deixadas pelo design doc. Material extraído de leitura integral das fontes Pulsar (302 linhas do `spec-post-impl-validator.md` + `HEAVY_02_CONTENT_REVIEW.md` + `HEAVY_08_CONFIDENCE_DASHBOARD.md` + `requirements.md` real de fixture). Cada resolução cita fonte exata.

---

## Q1: 5-6 eixos do `spec-content-reviewer` mode=slim (Light)

**Fonte:** `D:/Projeto Pulsar/.claude/commands/Prompts/Spec_lifecycle/Heavy/HEAVY_02_CONTENT_REVIEW.md` linhas 28-39.

Os 12 eixos full do Pulsar:

1. Congruência requirements↔design
2. Congruência design↔tasks
3. Congruência tasks↔requirements
4. Testabilidade de cada AC
5. Completude de contratos (APIs req/res/error)
6. Data models (campos/tipos/constraints)
7. Vertical Slices end-to-end
8. Riscos não endereçados
9. Dependências externas mapeadas
10. Ambiguidades / termos indefinidos
11. DI/CI Invariants
12. Seções operacionais (perf/sec/monitoring)

### Subset slim (6 eixos críticos para Light)

Critério de seleção: **bloqueia implementação se faltar** (vs nice-to-have).

| # | Eixo (slim) | Origem (full) | Por que é crítico |
|---|---|---|---|
| 1 | Congruência **requirements↔tasks** | full #3 | Sem isso, seed do quality-gate-router por AC quebra (ATDD impossível) |
| 2 | **Testabilidade** dos ACs | full #4 | Sem AC testável, pre-tester não gera RED test |
| 3 | Congruência **requirements↔design** | full #1 | Design incoerente com requirements gera invenção |
| 4 | **Ambiguidades** / termos indefinidos | full #10 | Termos ambíguos viram interpretação livre do executor |
| 5 | **Riscos** não endereçados | full #8 | Riscos silenciosos são bombas no pós-impl |
| 6 | Completude de **contratos** (APIs req/res) | full #5 | Sem schema, contract compliance no post-impl falha |

### Eixos pulados (para Heavy só)

design↔tasks (#2), data models (#6), vertical slices (#7), dependências (#9), DI/CI invariants (#11), seções operacionais (#12). Justificativa: redundantes com o subset acima ou só relevantes em mudanças complexas.

### Output do agent (mode=slim)

```
| # | Eixo (slim) | Score 0-100 | Issues | Status |
|---|---|---|---|---|
| 1 | Req↔Tasks | ... | ... | [GO|WARN|NO-GO] |
| ... | ... | ... | ... | ... |

Score geral: weighted average (todos com peso 1, slim não pondera)
Decisão: GO (≥85, 0 NO-GO) | WARN (≥70, 0 NO-GO) | NO-GO (<70 OU ≥1 NO-GO)
```

---

## Q2: 6 eixos do `spec-post-impl-validator` (1:1 com Pulsar)

**Fonte:** `D:/Projeto Pulsar/.claude/commands/spec-post-impl-validator.md` linhas 52-176, lido integralmente.

### Eixos (mapeamento 1:1 + pesos confirmados)

| # | Eixo | Peso | O que valida | Output classes |
|---|---|---|---|---|
| 1 | **Requirement Coverage** | 25% | Cada AC tem código que implementa o comportamento descrito | TRACED / GAP / PARTIAL |
| 2 | **Test Coverage by AC** | 20% | Cada AC tem teste que valida o cenário | TRACED / GAP |
| 3 | **Design Congruence** | 15% | Cada componente do design.md existe no código com a responsabilidade descrita | TRACED / GAP |
| 4 | **Task Completeness** | 15% | Cada task `[x]` em tasks.md tem evidência concreta no código | TRACED / GAP / DRIFT |
| 5 | **Non-Invention Audit** | 15% | Componentes adicionados sem base na spec, classificados | INVENTION:TOLERABLE / SUSPICIOUS / BLOCKER |
| 6 | **Contract Compliance** | 10% | APIs/DTOs/interfaces do design correspondem ao código | TRACED / DRIFT |

### Fórmula de score

```
Score = (R*0.25 + T*0.20 + D*0.15 + Tk*0.15 + N*0.15 + C*0.10)
```

Onde:
- `R, D, Tk, T, C` = TRACED / Total * 100 (com `Tk` somando `DRIFT * 0.5`)
- `N` (Non-Invention) = `1.0 - (suspicious * 0.10 + blockers * 0.25)` — máximo 100

### Decisão (mapeada para gates)

| Decisão | Critério | Gate emitido |
|---|---|---|
| **PASS** | Score ≥90% AND 0 bloqueadores AND 0 altos | (passa) |
| **PASS_WITH_WARNINGS** | Score ≥75% AND 0 bloqueadores AND ≤3 altos | confidence -0.08 |
| **FAIL** | Score <75% OR ≥1 bloqueador OR ≥4 altos | `SPEC_POST_IMPL_FAIL` HARD |

Threshold `<75%` do gate `SPEC_POST_IMPL_FAIL` no design doc **bate 1:1** com Pulsar.

### Diferença vs design doc original

O design assumia "sugestão inicial: pesos do Pulsar (format=15, content=20, impl=25, post-impl=25, arch=10, sec=5)" — esses são pesos do **outer spec_grade** (Q3), não do post-impl-validator. **Os 6 eixos acima são internos ao post-impl-validator** e somam 100% entre si.

---

## Q3: Pesos do `spec_grade` (outer)

**Fonte:** `D:/Projeto Pulsar/.claude/commands/Prompts/Spec_lifecycle/Heavy/HEAVY_08_CONFIDENCE_DASHBOARD.md` linhas 33-48.

Pulsar usa **scoring progressivo por fase** (não weighted_sum simples como o design doc sugeriu). Pesos PASS/WARN/FAIL por fase:

| Fase | PASS | WARN | FAIL | Pipeline-orchestrator agent |
|---|---|---|---|---|
| 1. Format Gate | +15 | +10 | STOP | `spec-format-gate` |
| 2. Content Review | +20 | +15 | STOP | `spec-content-reviewer` |
| 3. Implementation | +25 | +20 | +5 | `executor-controller` (consolidado dos batches) |
| 4a. Post-Impl Validator | +25 | +18 | +5 | `spec-post-impl-validator` |
| 4b. Auditor Senior | +10 | +7 | +2 | `adversarial-architecture-critic` + `adversarial-quality-reviewer` (média) |
| 4c. Red Team | +5 | +3 | +0 | `adversarial-security-scanner` |
| **TOTAL** | **100** | **73** | **12** | — |

### Grade derivado

```
≥90%  → PRODUCTION READY
75-89% → DEPLOY WITH MONITORING
50-74% → REMEDIATION NEEDED
<50%   → NOT READY
```

### Mapeamento para nosso schema

`confidence-score.yaml` (dimensional, SSOT) **continua sendo a verdade**. `spec_grade` é layer cosmético calculado por `spec-closer` em Phase 3. Pseudocódigo:

```yaml
# spec-closer lê de confidence-score.yaml + gate-decisions.jsonl
phases_passed:
  format_gate: PASS              # +15
  content_review: PASS           # +20
  implementation: PASS           # +25
  post_impl_validator: WARN      # +18
  auditor_senior: PASS           # +10
  red_team: PASS                 # +5

spec_grade_score: 93
spec_grade_label: "PRODUCTION READY"
```

### Variante audit-only

Pula fase 3 (Implementation). Total max = 75 (90% do ajustado para baseline 75 = 90%). `spec-closer` documenta no report que score é audit-mode.

---

## Q4: Extrator de AC formato EARS

**Fonte:** `D:/Projeto Pulsar/.kiro/specs/.Specs finalizadas/agents-sdk-pipeline-parity/requirements.md` linhas 21-112 (12 ACs reais analisados).

### Padrões EARS observados em fixtures reais

| Pattern | Forma | Exemplo (linha) | Frequência |
|---|---|---|---|
| **P1** Event-driven | `WHEN <trigger>, THE <actor> SHALL <action>` | `1.1` ("WHEN a pipeline run starts, THE Task_Orchestrator SHALL emitir...") | ~70% |
| **P2** Conditional | `IF <cond>, THEN THE <actor> SHALL <action>` | `1.4` ("IF the Context_Classifier detects more than one SSOT, THEN THE Context_Classifier SHALL emitir...") | ~10% |
| **P3** Event+Then | `WHEN <trigger>, THEN THE <actor> SHALL <action>` | `5.3` ("WHEN a blocking gate occurs, THEN THE pipeline runner SHALL registrar...") | ~10% |
| **P4** Ubiquitous | `THE <actor> SHALL [NOT] <action>` | `11.3` ("THE SDK runner SHALL NOT have any dependency...") | ~10% |

### Regex protótipo (Node.js)

```js
// Em ordem de especificidade — primeiro match ganha
const EARS_PATTERNS = [
  {
    name: 'P1_event',
    regex: /^\s*(?:(\d+(?:\.\d+)?)\.\s+)?WHEN\s+(.+?),\s+THE\s+(.+?)\s+SHALL\s+(.+?)\.?\s*$/im,
    extract: (m) => ({ id: m[1], trigger: m[2], actor: m[3], action: m[4] })
  },
  {
    name: 'P2_conditional',
    regex: /^\s*(?:(\d+(?:\.\d+)?)\.\s+)?IF\s+(.+?),\s+THEN\s+THE\s+(.+?)\s+SHALL\s+(.+?)\.?\s*$/im,
    extract: (m) => ({ id: m[1], condition: m[2], actor: m[3], action: m[4] })
  },
  {
    name: 'P3_event_then',
    regex: /^\s*(?:(\d+(?:\.\d+)?)\.\s+)?WHEN\s+(.+?),\s+THEN\s+THE\s+(.+?)\s+SHALL\s+(.+?)\.?\s*$/im,
    extract: (m) => ({ id: m[1], trigger: m[2], actor: m[3], action: m[4] })
  },
  {
    name: 'P4_ubiquitous',
    regex: /^\s*(?:(\d+(?:\.\d+)?)\.\s+)?THE\s+(.+?)\s+SHALL\s+(NOT\s+)?(.+?)\.?\s*$/im,
    extract: (m) => ({ id: m[1], actor: m[2], negation: !!m[3], action: m[4] })
  }
];

// Fallback heurístico para casos que escapam dos 4 patterns
const FALLBACK_REGEX = /^\s*(\d+(?:\.\d+)?)\.\s+(.+?\bSHALL\b.+?)\.?\s*$/i;
```

### Estratégia de fallback

1. Para cada linha sob `#### Acceptance Criteria` (até próximo `###` ou fim):
   - Tentar P1 → P2 → P3 → P4 em ordem
   - Se nenhum casa → tentar `FALLBACK_REGEX` (qualquer linha numerada com `SHALL`)
   - Se ainda falhar → marcar `[NON_EARS]` e logar

2. **Threshold de qualidade:**
   - ≥80% dos ACs casam com P1-P4 estrito → `format_gate.ears_compliance: PASS`
   - 50-79% → `WARN` (sugere migração para EARS estrito)
   - <50% → `format_gate.ears_compliance: FAIL` (não bloqueia, mas spec_grade -10 em format)

3. **AC ID convention:** `<requirement_number>.<ac_number>` extraído do contexto markdown (heading `### Requirement N:` + numeração `1.`, `2.` sob `#### Acceptance Criteria`).

### Validação contra fixture real

Aplicando os 4 patterns no `agents-sdk-pipeline-parity/requirements.md`:

| AC | Linha origem | Pattern matched | Status |
|---|---|---|---|
| 1.1 | 23 | P1_event | ✓ |
| 1.2 | 24 | P1_event | ✓ |
| 1.4 | 26 | P2_conditional | ✓ |
| 2.1 | 35 | P1_event | ✓ |
| 5.3 | 69 | P3_event_then | ✓ |
| 11.3 | 99 | P4_ubiquitous | ✓ |
| 6.3 | 79 | P2_conditional | ✓ |

**Cobertura: 100% no fixture testado.** Wave 1 deve testar contra 5+ requirements.md adicionais antes de fechar regex.

---

## Decisões consolidadas para Wave 1

| Decisão | Valor | Aplicação |
|---|---|---|
| Eixos slim | 6 (req↔tasks, testabilidade, req↔design, ambiguidades, riscos, contratos) | `spec-content-reviewer.md` mode=slim |
| Eixos full | 12 (lista do HEAVY_02) | `spec-content-reviewer.md` mode=full |
| Eixos post-impl | 6 com pesos 25/20/15/15/15/10 | `spec-post-impl-validator.md` |
| Threshold post-impl | <75% = FAIL | gate `SPEC_POST_IMPL_FAIL` |
| Spec_grade scheme | Progressive PASS/WARN/FAIL por fase, total 100 | `spec-closer.md` |
| Spec_grade labels | ≥90 PROD READY / 75-89 DEPLOY MON / 50-74 REM NEEDED / <50 NOT READY | `spec-closer.md` |
| EARS patterns | 4 patterns + fallback | `spec-format-gate.md` (input do quality-gate-router) |
| EARS threshold | ≥80 PASS / 50-79 WARN / <50 FAIL | `spec-format-gate.md` check #25 |

## Próximo passo

Tudo pronto para Wave 1. Sequência sugerida:

1. Criar branch `feat/v4.9.0-spec-workflow-import`
2. Wave 1.1: `agents/executor/type-specific/spec-format-gate.md` + 25 checks (incluindo EARS check)
3. Wave 1.2: `agents/executor/type-specific/spec-content-reviewer.md` (modes slim/full com mapping acima)
4. Wave 1.3: `agents/executor/type-specific/spec-post-impl-validator.md` (1:1 com Pulsar, 6 eixos com pesos confirmados)
5. Wave 1.4: `agents/executor/spec-closer.md` (lê confidence-score.yaml, calcula spec_grade)
6. Wave 1.5: tests unit (`tests/unit/spec-*.test.js`) — fixtures: ≥3 requirements.md reais

Cada agent: contrato declarativo completo (execution_mode, agent_type, expected_inputs/outputs) seguindo padrão v4.7.0+.
