---
name: pipeline-orchestrator-spec-protocol
description: Protocolo de spec lifecycle (format-gate, content-review, post-impl-validator) com formato EARS e regras de aceitacao. Usado pelos cargos spec-*.
when_to_use: Em qualquer trabalho do tipo `Spec`. Carregado por spec-format-gate, spec-content-reviewer, spec-post-impl-validator, spec-closer, brainstorm-controller, e cargos que produzem requirements.md/design.md/tasks.md.
---

# pipeline-orchestrator-spec-protocol

Define o ciclo de vida da spec (requirements → design → tasks → implementation → close) e os gates obrigatorios em cada transicao.

## 1. Artefatos da spec

Toda spec produzida pela empresa Pipeline Orchestrator vive em uma pasta dedicada:

```
specs/{{client-company}}/{{spec-slug}}/
├── requirements.md   # O QUE (EARS pattern)
├── design.md         # COMO (arquitetura, contratos, decisoes)
├── tasks.md          # PASSOS (decomposicao executavel)
├── spec.json         # metadata (status, owners, scores)
└── reviews/
    ├── format-gate-report.yaml
    ├── content-review-report.yaml
    └── post-impl-validator-report.yaml
```

## 2. Fase 0 — Format Gate (`spec-format-gate`)

Roda 25 checks deterministicos. NAO julga conteudo, julga estrutura.

### 25 Format checks

| # | Categoria | Check |
|---|---|---|
| 1 | requirements.md | Existe? |
| 2 | requirements.md | Cada requisito numerado (REQ-001, REQ-002, ...) |
| 3 | requirements.md | Cada REQ segue padrao EARS (When / While / If / Where / Ubiquitous) |
| 4 | requirements.md | Cada REQ tem criterio de aceitacao testavel |
| 5 | requirements.md | Sem TODOs/FIXMEs/TBDs |
| 6 | design.md | Existe? |
| 7 | design.md | Tem secao "Architecture Overview" |
| 8 | design.md | Tem secao "Decisions" (com ADR-001, ADR-002, ...) |
| 9 | design.md | Tem secao "Contracts/Interfaces" |
| 10 | design.md | Cada decisao tem alternative considered |
| 11 | design.md | Sem ambiguidades obvias (palavras como "talvez", "alguns", "varios") |
| 12 | tasks.md | Existe? |
| 13 | tasks.md | Cada task tem ID (TASK-001, ...) |
| 14 | tasks.md | Cada task tem owner |
| 15 | tasks.md | Cada task tem criterio de done |
| 16 | tasks.md | Tasks tem ordering/dependencies declaradas |
| 17 | tasks.md | Cada task referencia >=1 REQ |
| 18 | spec.json | Existe e parsea? |
| 19 | spec.json | status valido: {draft, in-review, approved, implementing, closed} |
| 20 | spec.json | owners != [] |
| 21 | rastreabilidade | Cada REQ referenciado em >=1 design decision |
| 22 | rastreabilidade | Cada REQ tem >=1 task que o cumpre |
| 23 | rastreabilidade | Cada task aponta pra REQ existente (nao orfa) |
| 24 | versioning | Arquivos tem header com versao + data |
| 25 | tamanho | Nenhum arquivo >2000 linhas (sinal de over-spec) |

### Veredicto Format Gate

```yaml
verdict: {{GO | GO_WITH_WARN | NO_GO}}
checks_passed: N/25
checks_failed: [check_id, ...]
checks_warning: [check_id, ...]
```

- **GO**: 25/25 passed → seguir pra Content Review
- **GO_WITH_WARN**: 23-24/25 → seguir mas registrar warning
- **NO_GO**: <23/25 OU qualquer check critico (1, 6, 12, 18, 23) falhando → status=blocked + add Board approver

## 3. Fase 1.5 — Content Review (`spec-content-reviewer`)

12 axes de qualidade. Roda apos Format Gate passar.

| Axis | Mode slim (6) | Mode full (12) |
|---|---|---|
| 1 — Congruence | ✓ | ✓ |
| 2 — Testability | ✓ | ✓ |
| 3 — Ambiguity | ✓ | ✓ |
| 4 — Risks | ✓ | ✓ |
| 5 — Contracts | ✓ | ✓ |
| 6 — Data Models | ✓ | ✓ |
| 7 — Vertical Slices | — | ✓ |
| 8 — Dependencies | — | ✓ |
| 9 — DI/CI Invariants | — | ✓ |
| 10 — Operational sections | — | ✓ |
| 11 — Failure modes | — | ✓ |
| 12 — Security/compliance | — | ✓ |

### Selecao slim vs full

- `slim` (6 axes): usado em `spec-light` variant (specs internas, hotfix)
- `full` (12 axes): usado em `spec-heavy` ou quando complexity == COMPLEXA

### Veredicto Content Review

```yaml
verdict: {{GO | WARN | NO_GO}}
mode: {{slim | full}}
axes:
  - axis: congruence
    score: 0.0-1.0
    findings: [...]
    severity: {{ok | warn | critical}}
  # ... para cada axis avaliado
overall_score: 0.0-1.0
recommendations:
  - "{{recomendacao especifica}}"
```

## 4. Fase 2 — Implementation

Aqui sai do dominio do spec-* e entra executor-*. Mas spec-post-impl-validator monitora cada batch (sweep).

## 5. Fase 3 — Post-Impl Validation (`spec-post-impl-validator`)

Apos implementacao, valida fidelidade entre spec e codigo. 6 axes pesados:

| Axis | Peso | O que checa |
|---|---|---|
| Requirement Coverage | 25% | Cada REQ tem evidence no codigo (file:line) |
| Test Coverage | 20% | Cada REQ tem >=1 teste que o exercita |
| Design Congruence | 15% | Arquitetura realizada == design.md |
| Task Completeness | 15% | Cada TASK marcada como done tem evidence |
| Non-Invention | 15% | Nada no codigo que nao esta na spec (anti-scope-creep) |
| Contract Compliance | 10% | APIs publicas batem com Contracts/Interfaces do design.md |

### Veredicto Post-Impl

```yaml
verdict: {{PASS | PASS_WITH_WARNINGS | FAIL}}
weighted_score: 0.0-1.0  # soma ponderada
breakdown:
  requirement_coverage: 0.0-1.0
  test_coverage: 0.0-1.0
  # ...
fidelity_score: 0.0-1.0  # mesma coisa que weighted
findings_by_severity:
  critical: [...]
  high: [...]
  medium: [...]
  low: [...]
```

Triggers:
- `FAIL` → hard gate (SPEC_POST_IMPL_FAIL), status=blocked, Board approver

## 6. EARS pattern (requirements.md)

EARS = Easy Approach to Requirements Syntax. Toda REQ deve seguir 1 dos 5 patterns:

| Pattern | Template | Exemplo |
|---|---|---|
| Ubiquitous | "The system shall {{response}}" | "O conector MT5 shall expor uma interface Python" |
| Event-driven | "When {{trigger}}, the system shall {{response}}" | "When um candle M1 fecha, the system shall persistir em DuckDB" |
| State-driven | "While {{state}}, the system shall {{response}}" | "While MT5 esta desconectado, the system shall retry com exponential backoff" |
| Conditional | "If {{condition}}, then the system shall {{response}}" | "If timeskew > 5s, then the system shall logar warning" |
| Optional feature | "Where {{feature}}, the system shall {{response}}" | "Where modo paper-trading esta ativo, the system shall escrever em DB separado" |

## 7. Spec closure (`spec-closer`)

Apos Post-Impl Validator passar (mesmo com warnings, salvo FAIL), spec-closer:

1. Atualiza `spec.json` com status=closed
2. Calcula spec_grade final (A/B/C/D/F) com progressive scoring
3. Gera dois relatorios:
   - `reviews/technical-report.md` — para devs
   - `reviews/executive-report.md` — para Board, 1 pagina
4. Posta `### PA_DE_CAL v1` no ticket-mae da spec

Ver `pipeline-orchestrator-contracts` para formato PA_DE_CAL.

## 8. Fluxo end-to-end visual

```
Board cria issue "Spec X"
  → task-orchestrator classifica (Spec, complexidade)
  → information-gate (gaps?)
  → brainstorm-controller (intake + explore + alternatives)
    → produz requirements.md, design.md, tasks.md
  → spec-format-gate (25 checks)
    GO → segue
    NO_GO → block + Board
  → spec-content-reviewer (slim ou full)
    GO → segue
    WARN → segue com warnings
    NO_GO → block + Board
  → [executor-* implementa, varios batches]
  → spec-post-impl-validator (6 axes, sweep por batch)
    PASS → segue
    FAIL → SPEC_POST_IMPL_FAIL hard gate
  → spec-closer (PA_DE_CAL + reports + status=closed)
```

## 9. Anti-padroes

❌ **Pular Format Gate "porque eh urgente"** — sem 25/25 a base estrutural quebra todo o resto
❌ **Aprovar Content Review com warnings sem comment justificando** — Board precisa saber o que aceitou
❌ **Marcar spec como `closed` antes de Post-Impl** — fidelidade desconhecida = spec inutil
❌ **Editar requirements.md durante a implementacao** — se mudou, eh nova versao + reanalise. NAO retroativo
