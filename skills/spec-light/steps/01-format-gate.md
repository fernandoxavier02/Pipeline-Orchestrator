---
step_number: 01
step_name: "format-gate"
description: "Spec Light: Format validation (25 checks) before proceeding"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:spec-format-gate"
expected_inputs:
  - spec_context: from_spec_context_yaml
  - spec_path: from_spec_context_yaml
expected_outputs:
  - format_gate_report: object
  - gate_decision: "GO | GO-WARN | NO-GO"
  - check_table: list
expected_next: 2
gate_required: true
gate_name: "format-gate-approval"
allowed_tools: [Read, Grep, Glob]
---

# Spec Lifecycle (Light) — Step 01: Format Gate

> **Position in pipeline:** Step 1 — first quality gate. No spec content is reviewed here; only its FORMAT.
> **Goal:** Block specs that have structural defects before any implementation work begins.

---

## Quando usar

Use logo apos a spec estar escrita em `.kiro/specs/<feature>/` e antes de qualquer implementacao. Este passo e barato, deterministico e impede que problemas formais (campos faltando, IDs duplicados, sem coverage matrix) contaminem a fase de implementacao.

## Regras

- Nao implemente codigo nesta etapa.
- Nao modifique a spec nesta etapa.
- Nao revise conteudo (semantica de requisitos, qualidade de design) — isso e papel do `spec-heavy` step 02.
- Se encontrar problemas bloqueantes (NO-GO), PARE e reporte ao usuario via AskUserQuestion antes de prosseguir.

---

## Inputs (from spec-context.yaml)

- `spec_path` — pasta da spec (ex: `.kiro/specs/payment-flow/`)
- `spec_context` — metadados (feature name, scope, estimated complexity)

---

## Tarefas obrigatorias (25 checks em 4 grupos)

Voce e o validador de formato. Execute exatamente 25 checks distribuidos em 4 grupos. Para cada check emita: numero, descricao curta, contagem (quantos achados na spec), status (`PASS | WARN | FAIL`).

### Grupo A — Existencia de artefatos (5 checks)

| # | Check | Esperado |
|---|---|---|
| A1 | `spec.json` existe e e parseavel | PASS se existe + JSON valido |
| A2 | `requirements.md` existe | PASS se existe + nao vazio |
| A3 | `design.md` existe | PASS se existe + nao vazio |
| A4 | `tasks.md` existe | PASS se existe + nao vazio |
| A5 | `research.md` existe OU `spec.json` declara explicitamente "research_skipped: true" | PASS se um dos dois |

### Grupo B — `requirements.md` (6 checks)

| # | Check | Esperado |
|---|---|---|
| B1 | Cada requisito comeca com bloco "User Story" (Como X, eu quero Y, para Z) | 100% dos requisitos |
| B2 | Acceptance criteria seguem padroes EARS (`WHEN ... THEN ... SHALL ...`, `IF ... THEN ... SHALL ...`, `WHILE ... THE ... SHALL ...`) | 100% dos AC |
| B3 | IDs numericos sequenciais e unicos (REQ-001, REQ-002, ...) — nao podem repetir | 0 duplicatas |
| B4 | Componentes referenciados em underscore_case (sem espacos, sem CamelCase) | 100% das referencias |
| B5 | Secao "Prework" presente declarando dependencias resolvidas antes da feature | secao existe |
| B6 | "Coverage Matrix" presente mapeando cada AC a um teste planejado | 100% dos AC mapeados |

### Grupo C — `design.md` (7 checks)

| # | Check | Esperado |
|---|---|---|
| C1 | Secao "Architecture" presente com diagrama (ASCII/Mermaid/PNG referenciado) | secao existe |
| C2 | Secao "Data Models" presente com schema explicito (entidades + campos + tipos) | secao existe |
| C3 | Secao "API Contracts" presente (request/response/erros) — pode ser N/A se feature 100% client-side com declaracao explicita | secao existe ou N/A justificado |
| C4 | "Property Reflection" — toda entidade do data model esta refletida no design (ou justificada) | 100% |
| C5 | "Correctness Properties" — invariantes do dominio listados (idempotencia, atomicidade, consistencia eventual onde aplicavel) | secao existe |
| C6 | "DI/CI Invariants" — pontos de injecao de dependencia e invariantes de Composicao Inversa declarados | secao existe |
| C7 | Secao "Operational" — observabilidade, alertas, rollback estrategy | secao existe |

### Grupo D — `tasks.md` (7 checks)

| # | Check | Esperado |
|---|---|---|
| D1 | Cada task em formato checklist (`- [ ] Task X: ...`) | 100% das tasks |
| D2 | Cada task referencia um requisito (`(REQ-001)`, `(REQ-002, REQ-003)`) | 100% das tasks |
| D3 | Maximo 2 niveis de nesting (task + sub-task; sem sub-sub-task) | profundidade <= 2 |
| D4 | Sem mencao a `File:`, `Grep:`, `Lines:` (proibido — orchestrator sabe sozinho) | 0 mencoes |
| D5 | Checkpoints (CHECKPOINT N) declarados a cada 3-5 tasks | distribuicao razoavel |
| D6 | TDD declarado: cada task implementadora tem subtask de teste anterior | 100% das tasks de impl |
| D7 | Estrategia de regressao mencionada (testes de regressao planejados) | secao ou bullet existe |

**Total: 25 checks (5 + 6 + 7 + 7).**

---

## Decisao GO / GO-WARN / NO-GO

| Resultado | Decisao |
|---|---|
| 25/25 PASS | **GO** |
| 22-24 PASS, restante WARN (zero FAIL) | **GO-WARN** (prosseguir; usuario aprova com warnings) |
| Qualquer FAIL OU < 22 PASS | **NO-GO** (PARAR; corrigir spec antes de seguir) |

---

## Formato de resposta obrigatorio

```markdown
## FORMAT GATE REPORT — [feature-name]

### Tabela de checks (25)

| # | Check | Count | Status |
|---|---|---|---|
| A1 | spec.json existe + valido | 1 | PASS |
| A2 | requirements.md existe | 1 | PASS |
| ... | ... | ... | ... |
| D7 | Estrategia regressao | 1 | WARN |

### Score: XX/25 PASS | YY WARN | ZZ FAIL

### Decisao: GO | GO-WARN | NO-GO

### Issues (se houver)
- C5 FAIL: secao "Correctness Properties" ausente em design.md (linha N/A)
- D2 WARN: 3 tasks sem referencia a REQ-* (tasks 12, 14, 17)

### Proximo passo
Step 02 (TDD Scenarios) se GO ou GO-WARN; STOP se NO-GO.
```

---

## Gate (AskUserQuestion mandatorio)

Apos emitir o report, abrir AskUserQuestion com header `Format` e opcoes:
- **Aprovar e seguir (Recomendado se GO)** — prosseguir para step 02.
- **Aprovar com warnings (GO-WARN)** — seguir mas registrar warnings no audit log.
- **Corrigir spec** — pausar pipeline ate spec ser corrigida.
- **Abortar pipeline** — encerrar sem closure.

---

**Proximo step:** 02
