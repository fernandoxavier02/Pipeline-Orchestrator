---
name: feature-light
description: |
  Prescriptive workflow para implementar nova feature seguindo 13 passos canônicos
  importados de Pulsar Implement_new_feature/Ligth/ — versão compacta.
  Sequência rígida (sem skip, sem reorder).
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, Edit, Write, Bash]
argument-hint: "[feature description]"
---

# Feature Pipeline Skill (Light)

13 passos canônicos espelhando 1:1 a fonte Pulsar `D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\Ligth\`.

## Sequência

1. Intent + Value + Scope (`steps/01-intent-scope.md`)
2. Terrain Recon (`steps/02-terrain-recon.md`)
3. User Flow + UX (`steps/03-user-flow-ux.md`)
4. Domain Rules (`steps/04-domain-rules.md`)
5. Source of Truth (`steps/05-source-of-truth.md`)
6. Data Model + Persistence (`steps/06-data-model-persistence.md`)
7. Architecture Design Options (`steps/07-arch-design-options.md`)
8. Risk Controls (`steps/08-risk-controls.md`)
9. Implementation Plan (`steps/09-implementation-plan.md`)
10. TDD Pre-Impl (RED) (`steps/10-test-pre-impl.md`)
11. Execution Minimal Diff (GREEN) (`steps/11-execution-minimal-diff.md`)
12. Testing Validation (`steps/12-testing-validation.md`)
13. Release + Observability (`steps/13-release-observability.md`)

## Reference

`references/pipelines/feature-light.md` lista team composition + step ordering. Tests em `tests/tests-feature-light.md`.
