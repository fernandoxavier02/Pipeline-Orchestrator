---
step_number: 6
step_name: "test-pre-impl"
execution_mode: subagent
agent_type: "pipeline-orchestrator:quality:pre-tester"
production_writes_allowed: true
expected_inputs:
  - ActionPlan: from_step_5
  - GovernancePlan: from_step_5
  - IntakeNLP: from_step_1
  - acceptance_criteria: from_step_1
expected_outputs:
  - tests_created: list
  - acceptance_criteria_coverage: object
  - traceability_matrix: object
  - red_phase_confirmed: boolean
  - askuserquestion_response: string
  - gate_decision: "approved | revise"
expected_next: 7
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, Write, Bash, AskUserQuestion]
---

# Step 06 — Testes Pré-Implementação (User Story Heavy) — TDD GATE (tests must FAIL)

> **Ported 1:1 from Pulsar** `HEAVY_06_TEST_PRE_IMPL.md`. The prompt body below is preserved verbatim. This is the **TDD gate**: acceptance-criteria + journey + regression tests MUST be created and the AC tests MUST FAIL (RED) before step 7 implements. The gate is enforced via AskUserQuestion before transitioning to execution.

```text
> **Posicao no Pipeline:** Passo 6 — Apos PLANO_ACAO_GOVERNANCA (5), ANTES de EXECUCAO (7)
> **Objetivo:** Traduzir criterios de aceitacao da user story em testes automatizados

---

## ⚠️ Integração TDD v3.0 (VERIFICAR PRIMEIRO)

**ANTES de criar qualquer teste, verificar se o Pre-Tester (agente 2.6) já criou:**

```bash
# Verificar se existem testes do Pre-Tester para esta user story
ls -la functions/src/__tests__/*user-story*.test.ts 2>/dev/null
ls -la functions/src/__tests__/*acceptance*.test.ts 2>/dev/null
grep -r "Pre-Tester\|PRE_TESTER_RESULT\|AC1\|AC2" functions/src/__tests__/ 2>/dev/null
```

### Se Pre-Tester JÁ criou testes:

1. **NÃO criar novos testes** - usar os existentes
2. **Verificar rastreabilidade**:
   - Cada Critério de Aceitação (AC) tem teste?
   - Testes de jornada completa existem?
   - Testes de regressão existem?
3. **Complementar APENAS se faltar** AC não coberto
4. **Executar os testes**: `npm test -- [arquivos_existentes]`
5. **Confirmar que testes de AC FALHAM** (RED)
6. **Confirmar que testes de regressão PASSAM**

### Se Pre-Tester NÃO criou testes:

Seguir o fluxo completo abaixo.

---

## CONTEXTO USER STORY

- User story ja foi interpretada e analisada (passos 1-5)
- Criterios de aceitacao ja definidos
- Testes devem **espelhar os criterios de aceitacao** da user story
- Principio: Se os testes passam, a user story esta completa

---

## ETAPA 1: CRITERIOS DE ACEITACAO -> TESTES

Baseado no intake (passo 1) e plano de acao (passo 5):

### 1.1 User Story Original

```
Como [persona],
Eu quero [acao],
Para que [beneficio].
```

### 1.2 Criterios de Aceitacao (EARS)

| ID | Criterio (EARS) | Testavel? |
|----|-----------------|-----------|
| AC1 | WHEN [trigger], THE [component] SHALL [behavior] | SIM/NAO |
| AC2 | IF [condition], THEN THE [component] SHALL [behavior] | SIM/NAO |

---

## ETAPA 2: CONTRATOS DE COMPORTAMENTO

### Contratos da USER STORY (criterios de aceitacao)

Para cada criterio de aceitacao:

```
DADO que [contexto do usuario],
QUANDO [acao descrita na user story],
ENTAO [comportamento do criterio de aceitacao].
```

### Contratos de FLUXO COMPLETO (jornada do usuario)

```
DADO que [usuario em estado inicial],
QUANDO [sequencia de acoes da jornada],
ENTAO [resultado final esperado].
```

### Contratos de REGRESSAO

```
DADO que [funcionalidade relacionada],
QUANDO [usada normalmente],
ENTAO [continua funcionando].
```

### Contratos de ERRO/BORDA

```
DADO que [condicao de erro],
QUANDO [usuario tenta acao],
ENTAO [feedback apropriado ao usuario].
```

**Minimo:**
- 1 teste por criterio de aceitacao
- 1+ teste de fluxo completo
- 2+ testes de regressao

---

## ETAPA 3: CRIAR TESTES

### Estrutura Behavior-Driven

```typescript
describe('User Story: [titulo]', () => {
  describe('Acceptance Criteria', () => {
    /**
     * @criteria AC1: WHEN X, THE Y SHALL Z
     * @garante Criterio de aceitacao atendido
     */
    it('AC1: should [criterio em linguagem natural]', () => {
      // Arrange - contexto
      // Act - acao do usuario
      // Assert - comportamento esperado
    });

    it('AC2: should [criterio em linguagem natural]', () => {
      // test
    });
  });

  describe('User Journey', () => {
    /**
     * @garante Fluxo completo funciona
     * @persona [tipo de usuario]
     */
    it('should complete full journey: [descricao]', () => {
      // Fluxo end-to-end
    });
  });

  describe('Error Handling', () => {
    /**
     * @garante Usuario recebe feedback apropriado
     */
    it('should show error when [condicao]', () => {
      // Tratamento de erro
    });
  });

  describe('Regression', () => {
    it('should not break [funcionalidade existente]', () => {
      // Protecao
    });
  });
});
```

---

## ETAPA 4: RASTREABILIDADE

### Matriz Criterio -> Teste

| Criterio de Aceitacao | Teste | Status |
|-----------------------|-------|--------|
| AC1: [descricao] | it('AC1: should...') | FALHA |
| AC2: [descricao] | it('AC2: should...') | FALHA |
| Jornada completa | it('should complete...') | FALHA |

---

## ETAPA 5: VALIDACAO

### Checklist User Story

| Criterio | Resposta |
|----------|----------|
| Cada criterio de aceitacao tem teste? | SIM/NAO |
| Testes usam linguagem do negocio? | SIM/NAO |
| PO pode validar olhando os testes? | SIM/NAO |
| Testes de feature FALHAM agora? | SIM/NAO |
| Testes de regressao PASSAM agora? | SIM/NAO |

---

## ETAPA 6: OUTPUT

```markdown
## Testes Pre-Implementacao (User Story Heavy)

### User Story
> Como [persona], eu quero [acao], para que [beneficio].

### Criterios de Aceitacao Cobertos

| AC | Descricao | Teste | Status |
|----|-----------|-------|--------|
| AC1 | [criterio] | it('AC1: ...') | FALHA |
| AC2 | [criterio] | it('AC2: ...') | FALHA |

### Arquivos Criados
- [ ] `[path/to/story.acceptance.test.ts]`

### Metricas
- Testes de AC: X (devem falhar)
- Testes de jornada: X
- Testes de regressao: X (devem passar)

### Proximo Passo
Executar HEAVY_07_EXECUCAO_DIFF_MINIMO_COMMITS.
Quando TODOS os testes passarem, a user story esta DONE.
```

---

**Somente apos aprovacao, prosseguir para HEAVY_07_EXECUCAO_DIFF_MINIMO_COMMITS.**
```

## TDD gate (mandatory — no prose substitute)

Before transitioning to step 7, invoke AskUserQuestion to confirm the RED phase:

```
header: "TDD"
question: "Testes de AC + jornada + regressão criados, AC FALHANDO (RED) e regressão PASSANDO? Prosseguir para a execução (step 7)?"
multiSelect: false
options:
  - label: "Aprovar — testes RED, seguir para execução (Recomendado)"
    description: "Cada AC tem teste; testes de AC falham agora; jornada e regressão cobertas; regressão passa."
  - label: "Revisar — falta cobertura ou rastreabilidade"
    description: "Quero adicionar/ajustar testes ou completar a matriz de rastreabilidade antes de implementar."
```

(AskUserQuestion automatically appends "Other".)

Record `gate_decision` + `askuserquestion_response`; append to `.pipeline/gate-decisions.jsonl`.

## Next

If `approved` → `steps/07-execucao-diff-minimo-commits.md`.
