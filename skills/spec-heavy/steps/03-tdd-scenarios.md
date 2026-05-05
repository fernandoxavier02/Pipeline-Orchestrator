---
step_number: 03
step_name: "tdd-scenarios"
description: "Spec Heavy: ATDD seed — derive test scenarios from acceptance criteria"
execution_mode: inline
agent_type: ""
expected_inputs:
  - format_gate_report: from_step_01
  - content_review_report: from_step_02
  - spec_context: from_spec_context_yaml
  - acceptance_criteria: from_spec_context.acceptance_criteria
expected_outputs:
  - atdd_scenarios: list
  - ac_coverage_map: object
  - gate_decision: "approved | revise | abort"
expected_next: 4
gate_required: true
gate_name: "tdd-scenarios-approval"
allowed_tools: [Read, Grep, Glob, AskUserQuestion]
---

<!--
MIRROR: skills/spec-light/steps/02-tdd-scenarios.md
Body prose is ~95% verbatim by design — sync edits across both files.
-->

# Spec Lifecycle (Heavy) — Step 03: TDD Scenarios (ATDD seed)

> **Position in pipeline:** Step 3 — bridge entre Content Review (qualidade da spec validada) e Implementation (escreve codigo).
> **Goal:** Para cada acceptance criterion em `requirements.md`, derivar pelo menos um cenario testavel em GIVEN/WHEN/THEN, construir matriz de rastreabilidade `AC#N → cenarios → arquivo de teste alvo`, e gatear aprovacao do usuario antes de codigo ser escrito.

---

## Quando usar

Use imediatamente apos o Content Review (step 02) ter retornado `GO` ou `GO-WARN`. Este e o "seed ATDD" — nao e o teste em si (testes sao escritos no step 04 RED phase), e o catalogo de cenarios que o teste implementara.

## Por que existe (autorizacao do design doc)

O design doc desta integracao (`designs/pipeline-orchestrator-v5-consolidated.md` §"Adicoes autorizadas" item 2) autorizou um passo intermediario de ATDD seed em ambos os modos (Light e Heavy), porque ele protege contra duas falhas comuns: (a) implementar sem cenario claro e perceber so depois que o AC nao foi coberto; (b) escrever testes na fase RED com escopo divergente do AC, gerando drift cedo. No Heavy, este passo se beneficia adicionalmente do content review (step 02) — se o eixo 4 (testabilidade) sinalizou ACs ambiguos, esses ACs entram aqui ja com a redacao revisada (ou com flag para escalation).

## Regras

- Nao escreva codigo de producao nesta etapa.
- Nao escreva o codigo do teste — apenas o cenario em prosa GIVEN/WHEN/THEN.
- Cada AC deve gerar pelo menos 1 cenario. Se a quantidade de AC for grande (>20), priorize 2 cenarios por AC critico (happy + edge) e 1 por AC simples.
- Se algum AC nao gerar cenario testavel (ambiguo demais), aplicar gate `SPEC_AC_TRACEABILITY_GAP` e pausar para correcao da spec.
- Re-examinar ACs flaggeados como `AMBIGUOUS` no eixo 4 do content review — se a redacao foi corrigida apos step 02, validar que agora e testavel; se nao foi, escalation e mandatoria.

---

## Inputs

- `format_gate_report` (do step 01) — confirma que requirements.md passou em B1-B6.
- `content_review_report` (do step 02) — confirma testabilidade dos AC (eixo 4).
- `spec_context.acceptance_criteria` — lista parseada dos AC com IDs (REQ-001-AC1, REQ-001-AC2, ...).
- Acesso a `requirements.md` para reler AC quando necessario.

---

## Tarefas obrigatorias

### Etapa 1 — Para cada AC, derivar cenario(s)

Para cada `AC#N`:

1. Reler o AC em `requirements.md` (formato EARS: `WHEN <trigger> THEN <system> SHALL <behavior>`).
2. Se o AC esta marcado `AMBIGUOUS` no content review, confirmar correcao foi aplicada antes de prosseguir.
3. Extrair o comportamento testavel.
4. Escrever 1+ cenarios em formato:
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
5. Tag de origem: cada cenario carrega o ID `AC#N` para rastreabilidade.

### Etapa 2 — Mapear cenario → arquivo de teste alvo

Para cada cenario, indicar o arquivo de teste onde ele sera implementado no step 04:
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
## ATDD SCENARIOS (HEAVY) — [feature-name]

### Resumo
- AC totais: N
- Cenarios derivados: M
- AC sem cenario (GAPs): K (deve ser 0 para aprovar)
- AC re-examinados pos content-review: P

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
- **Aprovar (Recomendado se 0 GAPs)** — prosseguir para step 04 com este conjunto de cenarios como contrato.
- **Revisar cenarios** — reformular antes de seguir (usuario indica o que ajustar).
- **Voltar e corrigir spec** — algum AC nao e testavel; spec precisa ser editada e content review possivelmente re-rodado.
- **Abortar pipeline** — encerrar.

---

**Proximo step:** 04
