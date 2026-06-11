---
step_number: 6
step_name: "test-pre-impl"
execution_mode: subagent
agent_type: "pipeline-orchestrator:quality:pre-tester"
production_writes_allowed: true
expected_inputs:
  - ActionPlan: from_step_5
  - IntakeNLP: from_step_1
  - acceptance_criteria: from_step_1
expected_outputs:
  - tests_created: list
  - acceptance_criteria_coverage: object
  - red_phase_confirmed: boolean
  - askuserquestion_response: string
  - gate_decision: "approved | revise"
expected_next: 7
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, Write, Bash, AskUserQuestion]
---

# Step 06 — Testes Pré-Implementação (User Story Light) — TDD GATE (tests must FAIL)

> **Ported 1:1 from Pulsar** `LIGHT_06_TEST_PRE_IMPL.md`. The prompt body below is preserved verbatim. This is the **TDD gate**: acceptance-criteria tests MUST be created and MUST FAIL (RED) before step 7 implements. The gate is enforced via AskUserQuestion before transitioning to execution.

```text
> **Posicao no Pipeline:** Passo 6 — Apos PLANO_ACAO (5), ANTES de EXECUCAO (7)
> **Objetivo:** Traduzir criterios de aceitacao em testes minimos

---

## ⚠️ Integração TDD v3.0 (VERIFICAR PRIMEIRO)

**ANTES de criar qualquer teste, verificar se o Pre-Tester (agente 2.6) já criou:**

```bash
# Verificar se existem testes do Pre-Tester para esta user story
ls -la functions/src/__tests__/*user-story*.test.ts 2>/dev/null
ls -la src/__tests__/*.test.ts 2>/dev/null
grep -r "Pre-Tester\|AC1\|AC2" functions/src/__tests__/ 2>/dev/null
```

### Se Pre-Tester JÁ criou testes:

1. **NÃO criar novos testes** - usar os existentes
2. **Verificar cobertura dos ACs**: todos os critérios de aceitação têm testes?
3. **Executar os testes**: `npm test -- [arquivo_existente]`
4. **Confirmar que FALHAM** (RED) - critérios não implementados ainda
5. **Prosseguir** para implementação

### Se Pre-Tester NÃO criou testes:

Seguir o fluxo abaixo para criar testes.

---

## CONTEXTO

- User story simples, escopo claro
- Foco nos criterios de aceitacao principais
- Testes objetivos e rapidos

---

## 1) USER STORY

```
Como [persona],
Eu quero [acao],
Para que [beneficio].
```

### Criterios de Aceitacao

| AC | Descricao |
|----|-----------|
| AC1 | [criterio principal] |
| AC2 | [criterio secundario] |

---

## 2) CONTRATOS

### Criterio de Aceitacao
```
DADO que [contexto],
QUANDO [acao],
ENTAO [comportamento do AC].
```

### Regressao
```
DADO que [sistema existente],
QUANDO [uso normal],
ENTAO [continua funcionando].
```

---

## 3) CRIAR TESTES

```typescript
describe('User Story: [titulo]', () => {
  // Criterio de aceitacao - DEVE FALHAR
  it('AC1: should [criterio]', () => {
    // test
  });

  // Regressao - DEVE PASSAR
  it('should maintain [existente]', () => {
    // test
  });
});
```

---

## 4) VALIDACAO

- [ ] Cada AC tem teste?
- [ ] Testes de AC falham agora?
- [ ] Regressao passa agora?

---

## OUTPUT

```markdown
## Testes (User Story Light)

### Criterios Cobertos
| AC | Teste | Status |
|----|-------|--------|
| AC1 | it('AC1:...') | FALHA |

- Arquivo: `[path.test.ts]`

Proximo: LIGHT_07_Execucao_Diff_Minimo
```
```

## TDD gate (mandatory — no prose substitute)

Before transitioning to step 7, invoke AskUserQuestion to confirm the RED phase:

```
header: "TDD"
question: "Testes de aceitação criados e FALHANDO (RED)? Prosseguir para a execução (step 7)?"
multiSelect: false
options:
  - label: "Aprovar — testes RED, seguir para execução (Recomendado)"
    description: "Cada critério de aceitação tem teste; os testes de AC falham agora; regressão passa."
  - label: "Revisar — falta cobertura de algum AC"
    description: "Quero adicionar/ajustar testes antes de implementar."
```

(AskUserQuestion automatically appends "Other".)

Record `gate_decision` + `askuserquestion_response`; append to `.pipeline/gate-decisions.jsonl`.

## Next

If `approved` → `steps/07-execucao-diff-minimo.md`.
