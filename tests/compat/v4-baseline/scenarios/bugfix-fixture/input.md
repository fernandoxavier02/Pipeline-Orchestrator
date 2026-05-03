# bugfix-fixture — Compat Regression Scenario

## Task description (fed to /pipeline)

Login está intermitentemente quebrado em `src/auth/session.js`: usuários autenticados são redirecionados para `/login` mesmo com cookie de sessão válido. Suspeita: timezone offset entre validação client-side (UTC) e server-side (local). Reproduz em ~30% dos refreshes em janelas de produção.

Fix esperado: normalizar para UTC em ambos os lados; adicionar regression test cobrindo o caso de timezone diff.

## Why this scenario exists

Cobre o fluxo bugfix mais representativo do uso real:

- **type=bugfix** (não feature, audit, ux, ou userstory)
- **complexity=MEDIA** (1 arquivo identificado, 1 hipótese clara, mas toca `auth/` → adversarial mandatory)
- **domain=auth** (força ADVERSARIAL_GATE_MANDATORY)
- **TDD acionado** (bugfix exige teste de regressão)
- **Verdict GO esperado** (nada secreto / dependency-blocker)

Se o pipeline mudar de comportamento neste cenário canônico, é provável que tenha regredido em casos similares.

## Como invocar (para captura de baseline)

```bash
# Na CLI claude:
/pipeline-orchestrator:pipeline Login está intermitentemente quebrado em src/auth/session.js: usuários autenticados são redirecionados para /login mesmo com cookie de sessão válido. Suspeita: timezone offset entre validação client-side (UTC) e server-side (local). Reproduz em ~30% dos refreshes em janelas de produção.

# Ou (mais ergonômico):
/pipeline-orchestrator:bugfix Login está intermitentemente quebrado em src/auth/session.js: timezone offset entre client (UTC) e server (local).
```

## Expected baseline behavior (versionado em expected.yaml ao lado)

Ver `expected.yaml` na mesma pasta.

## Replay

Quando rodar pela primeira vez via runner em modo `--mock`, será gerado `mock-output.json` capturando a estrutura observável (sem prosa). Execuções subsequentes comparam contra esse fixture.

Em modo `--real`, o runner invoca `claude --headless` e captura output efetivo.
