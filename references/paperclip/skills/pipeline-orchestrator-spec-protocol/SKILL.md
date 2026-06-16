---
name: pipeline-orchestrator-spec-protocol
description: Protocolo de spec lifecycle (format-gate, content-review, post-impl-validator) com formato EARS e regras de aceitacao. Usado pelos cargos spec-*.
when_to_use: Em qualquer trabalho do tipo `Spec`. Carregado por spec-format-gate, spec-content-reviewer, spec-post-impl-validator, spec-closer, brainstorm-controller, e cargos que produzem requirements.md/design.md/tasks.md.
---

# pipeline-orchestrator-spec-protocol

Define o ciclo de vida da spec (requirements → design → tasks → implementation → close) e os gates obrigatorios em cada transicao.

> **Dois fluxos compartilham o nome "Spec" desde a v8.0.0.** As secoes 2–8 abaixo descrevem o fluxo de **PROCESSING** (validar/fechar uma spec que JA existe) — usado por `spec-format-gate`, `spec-content-reviewer`, `spec-post-impl-validator`, `spec-closer`. A secao 9 descreve os gates e artefatos do fluxo de **AUTHORING** (criar e SELAR uma spec do zero) — usado por `spec-controller` e `spec-adversarial-critic`. Nao misture os dois conjuntos de gates. Roteamento completo em `PAPERCLIP-SPEC-WORKFLOW.md` §0.

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

## 2. Fase 0 — Format Gate (`spec-format-gate`) — PROCESSING GATES (Format/Content/Post-Impl)

> **Secoes 2–8 sao gates de PROCESSING** — aplicam-se a uma spec que JA existe. Usadas por `spec-format-gate`, `spec-content-reviewer`, `spec-post-impl-validator`. Para os gates de AUTHORING (criar e selar do zero), ver secao 9.

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

## 9. SPEC-AUTHORING — GATES E ARTEFATOS (v8.0.0)

> **Esta secao eh do fluxo de AUTHORING** (criar e SELAR uma spec do zero), usado por `spec-controller` e `spec-adversarial-critic`. As secoes 2–8 acima sao do fluxo de PROCESSING (validar uma spec existente), usadas por `spec-format-gate`, `spec-content-reviewer`, `spec-post-impl-validator`. **Nao misture.** O sequenciamento completo do authoring vive em `PAPERCLIP-SPEC-WORKFLOW.md` §AUTHORING.

### 9.1 Gates de authoring

| Gate | Hardness | Emitido por | Quando |
|---|---|---|---|
| IDEATION_PROPOSED | AUDIT | brainstorm-step-01c-ideation | o step emitiu N propostas proativas de conceito (decision TRIGGERED) |
| IDEATION_ACCEPTED / IDEATION_REJECTED | SOFT | brainstorm-step-01c-ideation | usuario aceitou (APPROVED) ou rejeitou (REJECTED) um conceito de design |
| IDEATION_SKIPPED | SOFT | brainstorm-step-01c-ideation | ideacao auto-pulada por haver um unico melhor caminho por best-practice (decision SKIPPED) |
| DESIGN_INTERROGATOR_FORCED | AUDIT | spec-controller | interrogador de design FORCADO despachado (decision DISPATCHED) |
| SPEC_REVIEW_FINDINGS | AUDIT | spec-adversarial-critic | veredito do critico em 13 eixos sobre os documentos (TRIGGERED quando ha achados / NOT_TRIGGERED quando limpo) |
| SPEC_SEALED | AUDIT | spec-controller | `spec.json` phase=sealed gravado (decision CONFIRMED) |
| SPEC_AMENDED | AUDIT | spec-controller | spec emendada re-selada com spec_version incrementado (decision CONFIRMED) |

O **SPEC_SEALED eh AUDIT/informacional**: ele apenas CONFIRMA que o spec-controller gravou `phase=sealed` no `spec.json`. O `phase=sealed` eh a SSOT do estado selado; `ready_for_implementation` eh DERIVADO de `phase`. **Nao ha hashing em 8.0.0** — content-hashing foi explicitamente diferido (follow-up R8). O selo grava ainda `spec_version`, `sealed_at` e um ponteiro `sealed_spec` {`run_dir`, `artifacts[5]`}. Apos selado, a spec so muda via `--amend` (que incrementa `spec_version` e emite SPEC_AMENDED).

### 9.2 Eixos do spec-adversarial-critic (read-only, sobre os DOCUMENTOS)

O critico aplica 13 eixos sobre requirements.md / design.md / tasks.md — sem tocar codigo (a spec ainda nao foi implementada): coverage, testability, ambiguity, risks, contracts, data-models, vertical-slices, dependencies, DI/CI, operational, failure-modes, security, coherence. Distingue-se do `spec-content-reviewer` (PROCESSING, 6/12 eixos sobre spec existente em ciclo de validacao).

### 9.3 Artefato spec.json no authoring

| Campo | Valores | Observacao |
|---|---|---|
| status | draft / in-review / approved / implementing / closed | herdado do PROCESSING (secao 2, check 19) |
| phase | autho-draft → interrogated → sealed | **v8 authoring**: SSOT do progresso do authoring; `phase=sealed` eh o estado selado canonico |
| approvals.* | registros de aprovacao por step (ex.: ideacao, interrogacao) | trilha de quem aprovou o que durante o authoring |
| ready_for_implementation | boolean DERIVADO | NAO eh SSOT — derivado de `phase` (true sse `phase=sealed`) |
| spec_version | inteiro | incrementa a cada `--amend` (re-selo) |
| sealed_at | timestamp ISO | carimbado no selo |
| sealed_spec | ponteiro `{ run_dir, artifacts[5] }` | run_dir + os 5 nomes de arquivo do bundle selado; **sem content-hash em 8.0.0** (diferido — follow-up R8) |

### 9.4 Bloco de selo

No selo, o spec-controller emite o bloco com cabecalho EXATO `### SPEC_SEALED v1` (CAIXA_ALTA, sufixo `v1`, tres `#`), conforme a disciplina de cabecalho da Secao 11 dos AXIOMS, e segue o Contrato de Handoff (NEXT_STEP + criacao da proxima issue no mesmo heartbeat, se houver — no authoring o selo eh tipicamente o ultimo passo, encerrando o fluxo).

## 10. Anti-padroes

> **Cross-reference para evitar drift:** os gates de PROCESSING (secoes 2–8) sao usados por `spec-format-gate`, `spec-content-reviewer`, `spec-post-impl-validator`. Os gates de AUTHORING (secao 9) sao usados por `spec-controller`, `spec-adversarial-critic`. Ao editar uma secao, confira se a outra continua coerente.

❌ **Pular Format Gate "porque eh urgente"** — sem 25/25 a base estrutural quebra todo o resto
❌ **Aprovar Content Review com warnings sem comment justificando** — Board precisa saber o que aceitou
❌ **Marcar spec como `closed` antes de Post-Impl** — fidelidade desconhecida = spec inutil
❌ **Editar requirements.md durante a implementacao** — se mudou, eh nova versao + reanalise. NAO retroativo
❌ **Selar (AUTHORING) sem rodar o spec-adversarial-critic sobre os documentos** — selo sem critica eh contrato cego
❌ **Declarar SPEC_SEALED sem ter gravado e verificado `phase=sealed` no `spec.json`** — selo falso quebra a confianca do contrato (em 8.0.0 nao ha hash; a confirmacao eh a escrita verificada de `phase=sealed`)
❌ **Conflacionar os cargos de AUTHORING e PROCESSING** — `spec-controller`/`spec-adversarial-critic` (authoring) vs `spec-format-gate`/`spec-content-reviewer`/`spec-post-impl-validator` (processing)
