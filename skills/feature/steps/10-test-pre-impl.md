---
step_number: 10
step_name: "test-pre-impl"
execution_mode: subagent
agent_type: "pre-tester"
expected_inputs:
  - implementation_plan: from_step_9
  - pre_tester_artifacts: optional_from_phase_2_pre_tester
expected_outputs:
  - test_files_created: [path list]
  - test_status: { red: int, green: int, total: int }
expected_next: 11
gate_required: true
gate_name: "tdd-tests-approval"
allowed_tools: [Read, Grep, Glob, Write, Bash]
---

# Step 10 — TDD Pre-Impl (RED) — GATE + PARAMETRIZED

> **Posição no Pipeline:** Passo 10 — Quarto gate. Define contratos de comportamento via testes ANTES de qualquer código de produção.
> **Objetivo:** Criar testes RED que falham agora (porque não há implementação) + testes GREEN para regressão (devem passar).

## Pre-Tester integration (parametrized)

**ANTES de criar testes**, verificar `expected_inputs.pre_tester_artifacts`:

- **Se NÃO vazio:** o agente `pre-tester` (Phase 2 do pipeline) já criou testes nesta run. Caminho: `pre_tester_artifacts.test_files`. Ações:
  1. NÃO criar novos testes
  2. Verificar cobertura: contratos de feature/integração/regressão/borda cobertos?
  3. Complementar APENAS se faltar algo crítico
  4. Executar testes existentes
  5. Confirmar feature tests FALHAM (RED)
  6. Confirmar regression tests PASSAM

- **Se vazio:** seguir fluxo abaixo (Heavy ou Light prompt) para criar testes do zero.

**Por que parametrizado e não shell discovery:** Pulsar usa paths Firebase-específicos (`functions/src/__tests__/*feature*.test.ts`) que não generalizam. O agente `pre-tester` conhece o stack do projeto consumer e passa paths corretos via `expected_inputs`. Ver mapping spec §10 decisão 4.

## Heavy mode prompt

Você é o agente `pre-tester`. Crie suite completa de testes ANTES de qualquer implementação.

**Contexto:**
- Feature é NOVA — comportamento novo sendo adicionado.
- Testes definem o **contrato esperado** antes de qualquer código.
- Código de produção NÃO pode ser alterado nesta etapa.
- Princípio TDD: RED (teste falha) → GREEN (implementa) → REFACTOR.
- Inputs: `implementation_plan` (Step 09), `domain_rules` (Step 04), `acceptance_matrix` (Step 03), `risk_register` (Step 08), schema/integration specs (Step 06), idempotência/atomicidade specs (Step 08).

### Etapa 1 — Análise de impacto

| Funcionalidade | Comportamento esperado | Prioridade |
|---|---|---|
| [feature 1] | [o que deve fazer] | Alta/Média |
| [feature 2] | [o que deve fazer] | Alta/Média |

| Sistema existente | Como interage | Risco de regressão |
|---|---|---|
| [sistema 1] | [tipo de integração] | Alto/Médio/Baixo |

### Etapa 2 — Contratos de comportamento

**FEATURE (novo):**
```
DADO que [contexto inicial]
QUANDO [usuário realiza ação]
ENTÃO [sistema responde com comportamento esperado]
```

**INTEGRAÇÃO (sistemas existentes):**
```
DADO que [sistema existente em estado X]
QUANDO [nova feature interage]
ENTÃO [integração funciona corretamente]
```

**REGRESSÃO (não pode quebrar):**
```
DADO que [funcionalidade existente]
QUANDO [usada normalmente]
ENTÃO [continua funcionando como antes]
```

**BORDA (edge cases):**
```
DADO que [condição limite: vazio, erro, offline]
QUANDO [ação]
ENTÃO [comportamento gracioso/defensivo]
```

**Mínimo obrigatório:** 2+ feature, 1+ integração, 2+ regressão, 2+ borda.

### Etapa 3 — Criar testes

Estrutura por layer (feature-first), adaptada ao stack do projeto:

```
features/{feature-name}/__tests__/
├── {feature}.unit.test.ext
├── {feature}.integration.test.ext
└── {feature}.e2e.test.ext (se aplicável)
```

(`.ext` = extensão do stack: `.ts`, `.py`, `.go`, etc — `pre-tester` resolve baseado no projeto.)

Anotações nos testes:
- `@garante` (o que protege)
- `@evita` (o que previne)
- `@status` (DEVE_FALHAR_ANTES_DA_IMPL, DEVE_PASSAR_SEMPRE)

### Etapa 4 — Validação

| Critério | Resposta |
|---|---|
| Testes de feature FALHAM (nada implementado)? | SIM/NÃO |
| Testes de regressão PASSAM (sistema atual ok)? | SIM/NÃO |
| Contratos cobrem todos os casos do plan? | SIM/NÃO |
| Um PO entenderia os testes sem ler código? | SIM/NÃO |
| Testes são isolados e determinísticos? | SIM/NÃO |

### Etapa 5 — Output

```markdown
## Testes Pré-Implementação (Feature Heavy)

### Arquivos criados
- features/{name}/__tests__/{name}.unit.test.ext
- features/{name}/__tests__/{name}.integration.test.ext

### Contratos protegidos

| Tipo | Contrato | Teste | Status atual |
|---|---|---|---|
| FEATURE | DADO… ENTÃO… | it('should…') | FALHA (esperado) |
| INTEGRAÇÃO | DADO… ENTÃO… | it('should integrate…') | FALHA (esperado) |
| REGRESSÃO | DADO… ENTÃO… | it('should maintain…') | PASSA |
| BORDA | DADO… ENTÃO… | it('should handle…') | PASSA/FALHA |

### Métricas
- Feature: X (RED)
- Integração: X
- Regressão: X (PASSA)
- Borda: X
```

## Light mode prompt

**Contexto:**
- Feature simples, foco em testes objetivos.
- Foco: feature principal + 1 regressão + 1 borda.

### 1) Comportamentos esperados (mínimo)

| Funcionalidade | Esperado |
|---|---|
| [principal] | [comportamento] |

Sistema existente a proteger: [1 integração].

### 2) Contratos (mínimo 4)

Feature, regressão e borda no formato Dado/Quando/Então (1 cada).

### 3) Criar testes

```pseudo
describe('[Feature]', () => {
  it('should [feature principal]', () => { /* DEVE FALHAR até implementar */ });
  it('should maintain [regressão]', () => { /* DEVE PASSAR */ });
  it('should handle [edge case]', () => { /* test */ });
});
```

### 4) Validação rápida

- [ ] Teste de feature falha agora?
- [ ] Teste de regressão passa agora?
- [ ] Cobertura mínima ok?

**Sinal de migração para Heavy:** múltiplas integrações, regressão crítica em fluxos sensíveis, ou edge cases densos → migre.

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/10-feature-tests-pre-impl.md`:

- `test_files_created`: paths
- `test_status`: { red, green, total }
- `coverage_summary`: contratos vs testes

## GATE: tdd-tests-approval

```yaml
AskUserQuestion(
  questions: [{
    question: "Aprovar testes RED antes de Execution Minimal Diff?",
    header: "TDD RED",
    multiSelect: false,
    options: [
      { label: "Aprovar (Recomendado)", description: "Tests RED definem contrato. Prosseguir para GREEN implementation." },
      { label: "Revisar/adicionar testes", description: "Cobertura insuficiente ou contratos faltando." },
      { label: "Voltar para Step 09", description: "Plan precisa revisão." }
    ]
  }]
)
```

BLOQUEAR step 11 até user aprovar.

**Próximo:** Step 11 — Execution Minimal Diff (GREEN).
