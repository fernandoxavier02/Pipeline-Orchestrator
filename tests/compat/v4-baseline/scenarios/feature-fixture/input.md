# feature-fixture — Compat Regression Scenario

## Task description (fed to /pipeline)

Adicionar suporte a "remember me" no login: usuário marca checkbox no `/login`, sessão dura 30 dias em vez de 24h. Persistir flag `remember_me` no token JWT, ler em `auth/session.js` ao validar. Cobrir com 1 user story end-to-end (UI checkbox → API → DB → expiry behavior).

## Why this scenario exists

Cobre o fluxo Feature mais representativo do uso real:

- **type=feature** (não bugfix, audit, ux, ou userstory pura)
- **complexity=MEDIA** (1 user story clara, ≤5 acceptance criteria, 1 vertical slice — UI + API + DB)
- **domain=auth + data-model** (força `ADVERSARIAL_GATE_MANDATORY` por dois domínios sensíveis)
- **TDD obrigatório** (feature exige testes RED antes de GREEN)
- **Vertical Feature Slice pattern** (§7.2.3) — passo 7 architecture options + passo 9 plan
- **Verdict GO esperado** (escopo limitado, não toca crypto)

Se o pipeline mudar de comportamento neste cenário, é provável que tenha regredido em outras features simples.

## Como invocar (para captura de baseline)

```bash
# Na CLI claude:
/pipeline-orchestrator:pipeline Adicionar suporte a "remember me" no login: checkbox que estende sessão de 24h para 30 dias via flag no JWT.

# Ou (mais ergonômico):
/pipeline-orchestrator:feature Adicionar suporte a "remember me" no login: checkbox que estende sessão de 24h para 30 dias.
```

## Expected baseline behavior

Ver `expected.yaml` na mesma pasta.

## Replay

Modo `--mock` requer `mock-output.json` capturado em sessão real. Sem ele, runner reporta SKIPPED+exit 1.
