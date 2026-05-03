# audit-fixture — Compat Regression Scenario

## Task description (fed to /pipeline)

Auditar a camada `auth/` do projeto: identificar onde tokens são gerados/validados, mapear riscos de injection nos endpoints `/login` e `/refresh`, verificar se há logging de tentativas falhadas, listar gaps de threat-model. Modo report-only — não modificar código.

## Why this scenario exists

Cobre o fluxo Audit mais representativo do uso real:

- **type=audit** (forensic, read-only por Iron Law §22.4)
- **complexity=MEDIA** (1 área = `auth/`, 1 nível de profundidade)
- **pipeline_variant=audit-light** (1 área conforme §10.1; sem compliance regulatória → não força heavy)
- **domain=auth** (sensitive — força `ADVERSARIAL_GATE_MANDATORY`)
- **TDD não-aplicável** (read-only — explicitamente skipado por §22.4)
- **9 passos canônicos** (§22.3 — Light = Heavy em estrutura, escopo reduzido)
- **Verdict GO ou CONDITIONAL esperado** (audit produz findings; CONDITIONAL se findings críticos)

Se o pipeline mudar de comportamento neste cenário, audits ficam vulneráveis a write-leakage (Iron Law violation).

## Como invocar (para captura de baseline)

```bash
# Na CLI claude:
/pipeline-orchestrator:pipeline Auditar a camada auth/: tokens, endpoints /login e /refresh, logging de falhas, gaps de threat-model. Report-only.

# Ou (mais ergonômico):
/pipeline-orchestrator:audit auth/

# Ou direto:
/pipeline-orchestrator:audit-light auth/
```

## Expected baseline behavior

Ver `expected.yaml` na mesma pasta.

## Replay

Modo `--mock` requer `mock-output.json` capturado em sessão real. Sem ele, runner reporta SKIPPED+exit 1.

## Iron Law

Este cenário CRÍTICO valida que `edit-guard-hook.cjs` bloqueia qualquer Write/Edit em arquivos fora de `.pipeline/**` durante audit. Se o runner detectar `production_writes_allowed: true` em qualquer step do output, é regressão SEVERA.
