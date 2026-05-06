# spec-fixture — Compat Regression Scenario (Spec Lifecycle)

## Task description (fed to /pipeline)

Implementar a feature `checkout-redesign` cujo Kiro spec já está pronto em `.kiro/specs/checkout-redesign/` (requirements.md + design.md + tasks.md + spec.json com phase=ready). A spec descreve um redesign do fluxo de checkout que toca 4 componentes (cart-service, payment-gateway-adapter, order-emitter, audit-logger), tem 12 acceptance criteria EARS distribuídos por 3 user stories, define 2 contratos REST novos (`POST /checkout` + `POST /checkout/confirm`) com schemas explícitos e regras de idempotência, e introduz um novo data model (`CheckoutSession` com TTL de 1800 segundos). Tasks.md tem 11 tarefas em 3 slices verticais (Slice A: cart-service refactor, Slice B: payment-gateway-adapter port, Slice C: order-emitter + audit wiring). Rodar o pipeline-orchestrator no modo full lifecycle (spec-heavy) — esperado fechar a spec ao final com `mode_used=full` e `phase=closed`.

## Why this scenario exists

Cobre o fluxo Spec Lifecycle full-mode mais representativo do uso real:

- **type=Spec** (não bugfix, feature solta, audit, ux, ou userstory)
- **complexity=COMPLEXA** (4 componentes tocados + 12 ACs + 2 contratos + 1 data model novo → spec-heavy variant)
- **AC-seeded ATDD obrigatório** (quality-gate-router gera 1 cenário por AC)
- **5 spec gates acionados** (SPEC_ARTIFACT_MISSING resolved, SPEC_FORMAT_GATE_FAIL passes, SPEC_CONTENT_REVIEW_NOGO passes, SPEC_AC_TRACEABILITY_GAP passes, SPEC_POST_IMPL_FAIL passes)
- **mode_used=full persisted** (spec-closer escreve em spec.json após CLOSEOUT_CONFIRM)
- **Verdict GO esperado** (spec bem-formada, todos os gates passam)

Se o pipeline mudar de comportamento neste cenário canônico (ex: spec-heavy stops emitting one of the 5 spec gates, or spec-closer stops persisting mode_used), é provável que tenha regredido em casos similares.

## Como invocar (para captura de baseline futura)

```bash
# Na CLI claude (após colocar o spec em .kiro/specs/checkout-redesign/):
/pipeline-orchestrator:pipeline implementar a feature checkout-redesign cujo Kiro spec já está pronto em .kiro/specs/checkout-redesign/

# Ou (mais ergonômico, com flag explícita):
/pipeline-orchestrator:spec --heavy implementar checkout-redesign
```

## Expected baseline behavior (versionado em expected.yaml ao lado)

Ver `expected.yaml` na mesma pasta. Atual estado: **TEMPLATE** — captura real de baseline diferida para sessão de dogfooding spec-heavy (per design v5 §17.3 #10/#11).

## Replay

Quando rodar pela primeira vez via runner em modo `--mock`, este scenario é **SKIPPED** porque `expected.yaml.baseline_method` contém a palavra "TEMPLATE" (case-insensitive — runner.cjs linhas 320-329). O scenario só sai do estado SKIPPED quando o baseline real for capturado e `mock-output.json` for gravado lado a lado.

Em modo `--real`, o runner também SKIPa (a TEMPLATE check é mode-agnostic) — captura precisa ser feita manualmente substituindo `baseline_method` por uma string sem o termo "TEMPLATE".
