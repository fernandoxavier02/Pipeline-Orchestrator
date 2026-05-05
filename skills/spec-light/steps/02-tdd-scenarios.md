---
step_number: 02
step_name: "tdd-scenarios"
description: "Spec Light: ATDD seed — derive test scenarios from acceptance criteria"
execution_mode: inline
agent_type: ""
expected_inputs:
  - format_gate_report: from_step_01
  - spec_context: from_spec_context_yaml
  - acceptance_criteria: from_spec_context.acceptance_criteria
expected_outputs:
  - atdd_scenarios: list
  - ac_coverage_map: object
  - gate_decision: "approved | revise | abort"
expected_next: 3
gate_required: true
gate_name: "tdd-scenarios-approval"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

<!--
MIRROR: skills/spec-heavy/steps/03-tdd-scenarios.md
Body prose is ~95% verbatim by design — sync edits across both files.
-->

# Spec Lifecycle (Light) — Step 02: TDD Scenarios (ATDD seed)

> **Position in pipeline:** Step 2 — bridge between Format Gate (validated structure) and Implementation (writes code).
> **Goal:** For each acceptance criterion in `requirements.md`, derive at least one testable scenario in GIVEN/WHEN/THEN form, build a traceability matrix `AC#N → scenarios → target test file`, and gate the user's approval before code is written.

---

## Quando usar

Use imediatamente apos o Format Gate (step 01) ter retornado `GO` ou `GO-WARN`. Este e o "seed ATDD" — nao e o teste em si (testes sao escritos no step 03 RED phase), e o catalogo de cenarios que o teste implementara.

## Por que existe (autorizacao do design doc)

O design doc desta integracao (`designs/pipeline-orchestrator-v5-consolidated.md` §"Adicoes autorizadas" item 2) autorizou um passo intermediario de ATDD seed em Light, porque ele protege contra duas falhas comuns que aparecem quando se vai direto do Format Gate para Implementation sem nenhum content-review: (a) implementar sem cenario claro e perceber so depois que o AC nao foi coberto; (b) escrever testes na fase RED com escopo divergente do AC, gerando drift cedo.

## Regras

- Nao escreva codigo de producao nesta etapa.
- Nao escreva o codigo do teste — apenas o cenario em prosa GIVEN/WHEN/THEN.
- Cada AC deve gerar pelo menos 1 cenario. Se a quantidade de AC for grande (>20), priorize 2 cenarios por AC critico (happy + edge) e 1 por AC simples.
- Se algum AC nao gerar cenario testavel (ambiguo demais), aplicar gate `SPEC_AC_TRACEABILITY_GAP` e pausar para correcao da spec.

---

## Inputs

- `format_gate_report` (do step 01) — confirma que requirements.md passou em B1-B6.
- `spec_context.acceptance_criteria` — lista parseada dos AC com IDs (REQ-001-AC1, REQ-001-AC2, ...).
- Acesso a `requirements.md` para reler AC quando necessario.

---

## Tarefas obrigatorias

### Etapa 1 — Para cada AC, derivar cenario(s)

Para cada `AC#N`:

1. Reler o AC em `requirements.md` (formato EARS: `WHEN <trigger> THEN <system> SHALL <behavior>`).
2. Extrair o comportamento testavel.
3. Escrever 1+ cenarios em formato:
   ```
   AC#N (REQ-XXX-ACy)
   Cenario AC#N.1 (happy path):
     GIVEN <estado inicial>
     WHEN <acao do usuario/sistema>
     THEN <resultado observavel>

   Cenario AC#N.2 (edge — opcional):
     GIVEN <condicao limite>
     WHEN <acao>
     THEN <comportamento defensivo>
   ```
4. Tag de origem: cada cenario carrega o ID `AC#N` para rastreabilidade.

### Etapa 2 — Mapear cenario → arquivo de teste alvo

Para cada cenario, indicar o arquivo de teste onde ele sera implementado no step 03:
- Padrao: `<feature>/__tests__/<feature>.<layer>.test.ts` ou conforme convencao do repo.
- Layer = `unit` | `integration` | `e2e`. ATDD seed sugere a layer mas nao e prescritivo — o implementer decide na fase RED.

### Etapa 3 — Emitir matriz de rastreabilidade

| AC ID | AC text (resumo) | Scenarios | Target test file | Notes |
|---|---|---|---|---|
| AC#1 (REQ-001-AC1) | Sistema deve X quando Y | AC#1.1, AC#1.2 | `feature/__tests__/feature.unit.test.ts` | — |
| AC#2 (REQ-001-AC2) | Falha graciosa em estado Z | AC#2.1 | `feature/__tests__/feature.integration.test.ts` | edge case |
| AC#3 (REQ-002-AC1) | (AMBIGUO — nao testavel) | (none) | (none) | **GAP — escalar** |

### Etapa 4 — Aplicar gate de cobertura

Se qualquer AC ficar com 0 cenarios, emitir o achado `SPEC_AC_TRACEABILITY_GAP` e bloquear o gate. Caso contrario, prosseguir para AskUserQuestion.

---

## Formato de resposta obrigatorio

```markdown
## ATDD SCENARIOS — [feature-name]

### Resumo
- AC totais: N
- Cenarios derivados: M
- AC sem cenario (GAPs): K (deve ser 0 para aprovar)

### Matriz de rastreabilidade
| AC ID | AC text (resumo) | Scenarios | Target test file | Notes |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

### Cenarios em detalhe
AC#1.1: GIVEN ... WHEN ... THEN ...
AC#1.2: GIVEN ... WHEN ... THEN ...
...

### Decisao recomendada
approved | revise | abort
```

---

## Gate (AskUserQuestion mandatorio)

Apos emitir os cenarios, abrir AskUserQuestion com header `ATDD Seed` e opcoes:
- **Aprovar (Recomendado se 0 GAPs)** — prosseguir para step 03 com este conjunto de cenarios como contrato.
- **Revisar cenarios** — reformular antes de seguir (usuario indica o que ajustar).
- **Voltar e corrigir spec** — algum AC nao e testavel; spec precisa ser editada.
- **Abortar pipeline** — encerrar.

---

**Proximo step:** 03
