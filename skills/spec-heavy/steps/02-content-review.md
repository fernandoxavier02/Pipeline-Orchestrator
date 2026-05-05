---
step_number: 02
step_name: "content-review"
description: "Spec Heavy: Full content review (12 axes) — quality and congruence audit"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:spec-content-reviewer"
expected_inputs:
  - format_gate_report: from_step_01
  - spec_context: from_spec_context_yaml
expected_outputs:
  - content_review_report: object
  - gate_decision: "GO | GO-WARN | NO-GO"
expected_next: 3
gate_required: true
gate_name: "content-review-approval"
allowed_tools: [Read, Grep, Glob]
---

<!--
MIRROR: skills/spec-audit-only/steps/02-content-review.md
The 12-eixos prose is byte-identical by design — sync edits across both files.
-->

# Spec Lifecycle (Heavy) — Step 02: Content Review (12 axes)

> **Position in pipeline:** Step 2 — full semantic audit of the spec content. Format Gate (step 01) ja confirmou que a estrutura existe; aqui validamos se o que foi escrito esta correto, completo e coerente.
> **Goal:** Para cada um dos 12 eixos, atribuir score (0-10) e classificar findings; decidir GO / GO-WARN / NO-GO com lista priorizada de correcoes obrigatorias.

---

## Quando usar

Use apos o Format Gate (step 01) ter retornado `GO` ou `GO-WARN`. Este e o passo que JUSTIFICA todo o sobrecusto do Heavy frente ao Light: quando a spec descreve dominio rico, dados sensiveis ou contratos publicos, content review captura ambiguidades semanticas e drift entre requirements/design/tasks que o Format Gate nao detecta.

## Regras

- Nao implemente codigo nesta etapa.
- Nao reescreva a spec — sugira correcoes priorizadas; usuario decide se aplica.
- Cada finding deve carregar tag de evidencia: `[VERIFICADO]` (citado da spec), `[HIPOTESE]` (inferido) ou `[DESIGN]` (decisao explicita do design doc).
- Score por eixo e 0-10 (10 = ideal); score final consolidado da decisao.

---

## Inputs

- `format_gate_report` (do step 01) — confirma 25/25 ou GO-WARN; warnings carregam contexto para o eixo de DI/CI.
- `spec_context` — feature, scope, domains_touched, business_rules.
- Acesso a `requirements.md`, `design.md`, `tasks.md`, `spec.json`, `research.md` (se houver).

---

## Os 12 eixos

### Eixo 1 — Congruencia requirements → design (peso alto)

Para cada requisito em `requirements.md`, verificar se ha contraparte em `design.md` (componente, contrato ou data model). Tags: `TRACED | GAP | DRIFT`.

### Eixo 2 — Congruencia design → tasks

Para cada componente declarado em `design.md`, verificar se existe ao menos uma task em `tasks.md` que o construa ou modifique. Tags: `TRACED | GAP`.

### Eixo 3 — Congruencia tasks → requirements

Para cada task em `tasks.md`, verificar se ela referencia requisito (D2 do Format Gate ja conferiu o link sintatico — aqui conferimos se o link semantico bate). Tags: `TRACED | DRIFT` (DRIFT = task referencia REQ que nao descreve aquele comportamento).

### Eixo 4 — Testabilidade de cada AC

Para cada AC, classificar como `TESTABLE` (pode virar GIVEN/WHEN/THEN sem ambiguidade) ou `AMBIGUOUS` (frase abstrata como "sistema deve ser rapido" sem metrica). Score = `TESTABLE / total_AC * 10`.

### Eixo 5 — Completude de contratos (API request / response / error)

Para cada API/contrato em `design.md`, verificar campos: request schema, response schema, lista de errors com codigos. Tags: `COMPLETE | PARTIAL | MISSING`.

### Eixo 6 — Data models (campos / tipos / constraints)

Para cada entidade do data model, verificar: campos declarados, tipos especificados, constraints (unique, nullable, default, foreign key) explicitas. Tags: `COMPLETE | PARTIAL | MISSING`.

### Eixo 7 — Vertical Slices end-to-end

Verificar se `tasks.md` agrupa tasks em slices que entregam comportamento end-to-end (do input do usuario ate persistencia + UI feedback) — em vez de slices horizontais por camada (todos os models primeiro, depois todos os services). Tags: `VERTICAL | HORIZONTAL_SMELL`.

### Eixo 8 — Riscos enderecados

Verificar se ha secao explicita de riscos no design (ou nas notes da spec) com mitigacoes para cada risco identificado. Findings classificam riscos `MITIGATED | UNADDRESSED`.

### Eixo 9 — Dependencias externas mapeadas

Para cada lib/servico externo mencionado, verificar: versao, responsabilidade, fallback, circuit-breaker se aplicavel. Tags: `MAPPED | PARTIAL | MISSING`.

### Eixo 10 — Termos ambiguos

Listar termos vagos ou imprecisos sem definicao na spec ou no glossario do projeto: "rapido", "muitos", "bom desempenho", "facil de usar". Tags: `DEFINED | AMBIGUOUS`. Score = `DEFINED / total * 10`.

### Eixo 11 — DI / CI invariants completos

Verificar se a secao "DI/CI Invariants" (validada estruturalmente no Format Gate C6) tem conteudo real: pontos de injecao com nome do contrato, e invariantes de Composicao Inversa expressas como propriedades verificaveis. Tags: `COMPLETE | SHALLOW`.

### Eixo 12 — Cobertura operacional

Verificar se a secao "Operational" (Format Gate C7) cobre: observabilidade (logs, metricas, traces), alertas com thresholds, rollback strategy passo-a-passo, runbook minimo. Tags: `COMPLETE | PARTIAL | MISSING`.

---

## Score consolidado e decisao

```
Score final = (Sum dos 12 scores) / 12
```

| Score | Decisao |
|---|---|
| ≥ 8.5 | **GO** |
| 7.0 - 8.4 | **GO-WARN** (warnings registrados; correcoes recomendadas mas nao bloqueantes) |
| < 7.0 | **NO-GO** (correcoes obrigatorias antes de prosseguir para step 03) |

Qualquer eixo com score `<= 4` puxa decisao para NO-GO independente do score medio (defeito local critico bloqueia mesmo com media boa).

---

## Formato de resposta obrigatorio

```markdown
## CONTENT REVIEW REPORT (HEAVY) — [feature-name]

### Eixo 1 — Congruencia req→design: X/10
- [VERIFICADO] REQ-003 sem componente correspondente em design.md (GAP)
- [HIPOTESE] REQ-007 menciona "fluxo de checkout"; design tem "PaymentService" mas nao detalha o fluxo (DRIFT possivel)

### Eixo 2 — Congruencia design→tasks: X/10
... (findings)

### Eixo 3 — Congruencia tasks→req: X/10
... (findings)

### Eixo 4 — Testabilidade AC: X/10
- AC#5: "sistema deve ser rapido" — AMBIGUOUS, sem metrica de latencia

### Eixo 5 — Contratos completos: X/10
### Eixo 6 — Data models: X/10
### Eixo 7 — Vertical slices: X/10
### Eixo 8 — Riscos: X/10
### Eixo 9 — Dependencias externas: X/10
### Eixo 10 — Termos ambiguos: X/10
### Eixo 11 — DI/CI invariants: X/10
### Eixo 12 — Cobertura operacional: X/10

### Score final: X.X / 10

### Decisao: GO | GO-WARN | NO-GO

### Correcoes obrigatorias (priorizadas)
1. [BLOCKER] Adicionar metrica de latencia em AC#5 (eixo 4)
2. [BLOCKER] Mapear REQ-003 para componente em design.md (eixo 1)
3. [HIGH] Definir circuit-breaker para integracao com servico externo X (eixo 9)
4. [MEDIUM] Detalhar runbook de rollback (eixo 12)

### Proximo passo
Step 03 (TDD Scenarios) se GO ou GO-WARN; STOP se NO-GO ate correcoes serem aplicadas.
```

---

## Gate (AskUserQuestion mandatorio)

Apos emitir o report, abrir AskUserQuestion com header `Content` e opcoes:
- **Aprovar (Recomendado se GO)** — prosseguir para step 03 (TDD scenarios).
- **Aprovar com warnings (GO-WARN)** — seguir; correcoes recomendadas registradas no closure-report.
- **Corrigir spec (NO-GO)** — pausar pipeline ate as correcoes [BLOCKER] serem aplicadas.
- **Abortar pipeline** — encerrar sem prosseguir.

---

**Proximo step:** 03
