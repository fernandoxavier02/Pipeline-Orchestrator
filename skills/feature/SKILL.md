---
name: feature
description: |
  Prescriptive workflow para implementar uma nova feature seguindo 13 passos canônicos
  importados do Pulsar Implement_new_feature. Usar `--mode=heavy` (default) para features
  com impacto relevante (domínio, dados, integrações, multi-fluxo) ou `--mode=light` para
  features pequenas/médias com risco controlado. Cobre: intent scope, terrain recon, user
  flow + UX, domain rules, source of truth, data model, architecture choice (gate),
  risk controls, implementation plan (gate; skip se Phase 1.5 plan-architect rodou),
  TDD pre-impl (gate; via pre-tester agent), execution minimal diff, testing validation,
  release observability. 4 AskUserQuestion gates obrigatórios (steps 3, 7, 9, 10).
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: "[--mode=light|heavy] [feature description com user story + DoD]"
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
sequence_lock: true
gates_at: [3, 7, 9, 10]
sentinel_checkpoints: [pre_3, pre_10, pre_13]
stop_rule_max_failures: 2
mode: heavy
---

# Feature Pipeline Skill (Pulsar Slice 3b)

Implementa uma nova feature seguindo workflow Pulsar de 13 passos. Pattern: **single skill com mode flag** — único entre os ports do pipeline-orchestrator (vs 2 skills separadas em Slice 1.5/3a).

## Quando usar

- **Heavy mode (default):** feature/melhoria com impacto relevante (domínio, dados, integrações, múltiplos fluxos, contratos, jobs, mobile) ou quando você quer máxima previsibilidade.
- **Light mode (`--mode=light`):** feature pequena/média com risco controlado e velocidade necessária.

## Sequência canônica (13 passos)

1. **Intent + Value + Scope** (`steps/01-intent-scope.md`)
2. **Terrain Recon** (`steps/02-terrain-recon.md`)
3. **User Flow + UX** (`steps/03-user-flow-ux.md`) — **GATE: matriz cenários approval**
4. **Domain Rules** (`steps/04-domain-rules.md`)
5. **Source of Truth** (`steps/05-source-of-truth.md`)
6. **Data Model + Persistence** (`steps/06-data-model-persistence.md`)
7. **Architecture Design Options** (`steps/07-arch-design-options.md`) — **GATE: escolher abordagem**
8. **Risk Controls** (`steps/08-risk-controls.md`)
9. **Implementation Plan** (`steps/09-implementation-plan.md`) — **GATE: aprovar plan; SKIP se Phase 1.5 plan-architect rodou**
10. **TDD Pre-Impl (RED)** (`steps/10-test-pre-impl.md`) — **GATE: aprovar testes**
11. **Execution Minimal Diff (GREEN)** (`steps/11-execution-minimal-diff.md`) — sem gate skill-level (executor-controller cobre)
12. **Testing Validation** (`steps/12-testing-validation.md`)
13. **Release + Observability** (`steps/13-release-observability.md`)

## Ownership

- **Inline (controller):** steps 1, 2, 4, 5, 6, 8, 13
- **`feature-vertical-slice-planner`:** steps 3, 7, 9 (re-spawned 3x com TASK_CONTEXT diferente)
- **`pre-tester`:** step 10 (recebe `expected_inputs.pre_tester_artifacts`)
- **`feature-implementer`:** step 11
- **`feature-integration-validator`:** step 12

## Mode flag mechanism

Cada `steps/NN-*.md` tem 2 seções de prompt: `## Heavy mode prompt` (verbose) e `## Light mode prompt` (compact). Controller seleciona seção baseado em `mode` flag declarado neste frontmatter ou no override `--mode=` do argument.

## Hooks contract (ADVISORY)

Os campos `sequence_lock`, `gates_at`, `sentinel_checkpoints` são **declarativos para humanos lerem** e para o controller respeitar — **NÃO há enforcement automático via hooks** (verificado 2026-05-03; ver `designs/pipeline-orchestrator-v5-consolidated.md` §17.4 #8).

## Pre-check

Pré-check (`HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` no Pulsar) NÃO virou step da skill — Phase 0 do pipeline (`information-gate` + `design-interrogator`) absorve.

## Reference

`references/pipelines/feature.md` lista team composition + step ordering. Tests em `tests/tests-feature.md`.
