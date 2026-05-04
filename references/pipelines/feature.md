# Pipeline reference: feature

**As of v4.6.0:** thin reference para skill `feature` (single-skill-with-mode-flag pattern). Substitui `implement-heavy.md` e `implement-light.md` (deprecated, mantidos como redirects).

**Skill backing:** `skills/feature/SKILL.md`

## Mode flag

| Mode | Caso de uso | Cap |
|---|---|---|
| `heavy` (default) | Feature com impacto relevante (domínio, dados, integrações, multi-fluxo) | sem cap explícito; gates apertados |
| `light` (--mode=light) | Feature pequena/média com risco controlado | 1 user story, max 5 acceptance criteria, 1 vertical slice (per consolidated §10.1) |

## Sequência (13 passos compartilhados)

| # | Step | Owner | Gate? |
|---|---|---|---|
| 1 | Intent + Value + Scope | inline | não |
| 2 | Terrain Recon | inline | não |
| 3 | User Flow + UX | `feature-vertical-slice-planner` | **sim (acceptance-matrix)** |
| 4 | Domain Rules | inline | não |
| 5 | Source of Truth | inline | não |
| 6 | Data Model + Persistence | inline | não |
| 7 | Architecture Design Options | `feature-vertical-slice-planner` | **sim (architecture-choice)** |
| 8 | Risk Controls | inline | não |
| 9 | Implementation Plan | `feature-vertical-slice-planner` (skip se Phase 1.5) | **sim (plan-approval)** |
| 10 | TDD Pre-Impl (RED) | `pre-tester` (parametrized) | **sim (tdd-tests-approval)** |
| 11 | Execution Minimal Diff (GREEN) | `feature-implementer` | não (executor-controller cobre) |
| 12 | Testing Validation | `feature-integration-validator` | não |
| 13 | Release + Observability | inline | não |

## Sentinel checkpoints

`pre_3`, `pre_10`, `pre_13` — controller seta `expected_next` no `sentinel-state.json` antes de cada.

## Hooks (ADVISORY)

`sequence_lock`, `gates_at`, `sentinel_checkpoints` no SKILL.md frontmatter são declarativos. Hooks (sentinel-hook, dispatch-guard, edit-guard, force-pipeline-agents) cobrem session-level mas NÃO parseiam SKILL.md frontmatter. Ver consolidated §17.4 #8.

## Pre-check

Pré-check Pulsar (`HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md`) **NÃO** virou step da skill — Phase 0 do pipeline (`information-gate` + `design-interrogator`) absorve.
