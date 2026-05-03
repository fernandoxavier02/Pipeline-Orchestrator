# hotfix-fixture — Compat Regression Scenario

## Task description (fed to /pipeline)

URGENTE — incidente de produção em curso. Deploy de 2026-05-03 14:32 UTC quebrou autenticação para todos os usuários ativos. Sintoma: cookies de sessão válidos rejeitados como expirados; refresh redireciona para `/login` infinitamente. Rastreado a `auth/session.js:42` — comparação de timezone foi alterada de UTC para local na PR #4287. Mercados abrem em 90 minutos. Fix: reverter linha 42 para `Date.UTC(...)` + commit + deploy. Sem tempo para slice plan completo.

## Why this scenario exists

Cobre o fluxo HOTFIX (emergency bypass mode) descrito em `commands/pipeline.md`:

- **type=Bug Fix forçado, complexity=COMPLEXA forçado, severity=Critical forçado** (per HOTFIX Mode classification)
- **mode=hotfix** (campo extra no contrato observável)
- **Sinais que classifier deve reconhecer SEM flag manual** — palavra "URGENTE", indicador temporal absoluto ("90 minutos para market open"), impacto absoluto ("todos os usuários ativos"), localização cirúrgica ("`auth/session.js:42`"), justificativa de bypass ("sem tempo para slice plan completo")
- **domain=auth** (força ADVERSARIAL_GATE_MANDATORY mesmo em HOTFIX, mas com 2 checklists em vez de 7)
- **TDD reduzido** — 1 regression test, não suite completa
- **HOTFIX Logging obrigatório** — artifact `HOTFIX_LOG.md` com quem, por quê, quais checklists pulados, timestamp
- **Verdict GO esperado** (escopo cirúrgico, fix claro)

Se o pipeline mudar de comportamento neste cenário, HOTFIX mode fica vulnerável: ou (a) acende em casos não-emergência (false positive) ou (b) não acende em emergência real (false negative).

## Como invocar (para captura de baseline)

```bash
# Na CLI claude — método 1 (deixar classifier detectar emergência sozinho):
/pipeline-orchestrator:pipeline URGENTE — incidente de produção em curso. Deploy de 2026-05-03 14:32 UTC quebrou autenticação para todos os usuários ativos. Sintoma: cookies de sessão válidos rejeitados como expirados. Rastreado a auth/session.js:42 — timezone alterada de UTC para local na PR #4287. Mercados abrem em 90 minutos.

# Método 2 (forçar HOTFIX explicitamente via flag):
/pipeline-orchestrator:pipeline --hotfix Login quebrado pós-deploy: timezone offset em auth/session.js:42.
```

Capturar baseline com **método 1** (sem flag manual) — o ponto do fixture é validar que o classifier reconhece urgência por contexto, não por flag.

## Expected baseline behavior

Ver `expected.yaml` na mesma pasta.

## Replay

Modo `--mock` requer `mock-output.json`. Sem ele: SKIPPED+exit 1. Captura via protocolo em `tests/compat/README.md` seção "Protocolo de captura de baseline real".

## Diferenças críticas vs bugfix-fixture (que NÃO podem regredir)

1. **Classification mode=hotfix** está presente (campo novo no contrato).
2. **HOTFIX_LOG.md** está em `artifacts_produced` (auditoria obrigatória per spec).
3. **adversarial-architecture-critic e adversarial-quality-reviewer ausentes** em `agents_invoked` — só `adversarial-security-scanner` invocado (HOTFIX = 2 checklists: auth + injection).
4. **Suite de regression ausente** em sanity (HOTFIX = build+tests sem regression).
5. **FINAL_ADVERSARIAL_GATE.decision = SKIPPED** (per spec "HOTFIX | typically declined under emergency time pressure").

Se runner observar regressão em qualquer desses 5 pontos, HOTFIX mode quebrou.
