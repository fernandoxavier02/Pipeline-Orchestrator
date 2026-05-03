# ux-fixture — Compat Regression Scenario

## Task description (fed to /pipeline)

Simular jornada do usuário "novo dev no projeto" tentando rodar o app pela primeira vez (clone + install + start). Persona: dev sênior em outra stack, primeira semana no projeto. Catálogo top-3 fricções encontradas, com severidade e sugestões de melhoria. Modo exploratório — sem mudar código.

## Why this scenario exists

Cobre o fluxo UX Simulation mais representativo:

- **type=ux** (não bugfix, feature, audit, ou userstory)
- **complexity=MEDIA** (1 persona, 1 jornada, top-3 frictions per §10.1 ux-light cap)
- **pipeline_variant=ux-light** (1 persona/jornada — exatamente o cap; multi-persona forçaria heavy)
- **domain=docs + onboarding** (não-sensível — adversarial não-mandatório)
- **TDD não-aplicável** (exploratório — explicitamente skipado por §7.2.4)
- **6 passos heavy ou 4 light** (§7.2.4)
- **Verdict GO esperado** (catálogo é entregável, não fix)

Se o pipeline mudar comportamento neste cenário, UX walks ficam quebradas (não geram catálogo válido) e perdem valor para PM/onboarding feedback.

## Como invocar (para captura de baseline)

```bash
# Na CLI claude:
/pipeline-orchestrator:pipeline Simular jornada de dev novo no projeto: clone + install + start. Top-3 fricções. Persona: sênior em outra stack.

# Ou (mais ergonômico):
/pipeline-orchestrator:ux dev novo: clone+install+start, top-3 fricções
```

## Expected baseline behavior

Ver `expected.yaml` na mesma pasta.

## Replay

Modo `--mock` requer `mock-output.json`. Sem ele: SKIPPED+exit 1.

## Particularidade do UX

UX Simulation é o único type **sem precedente Pulsar** (§7.2.4 — desenho original v5). Os outputs são `friction-catalog.md` + `improvement-proposals.md`, não TRACE de fix. O runner deve confirmar que esses dois arquivos estão presentes nos artifacts.
