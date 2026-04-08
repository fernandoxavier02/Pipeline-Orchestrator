---
title: Superpowers and Pipeline Orchestrator integration contract
area: integration
tags:
  - superpowers
  - pipeline-orchestrator
  - integration
  - routing
  - ownership
globs:
  - "**"
updated: 2026-03-31
---

## Purpose

Formalize how `pipeline-orchestrator` and `superpowers` work together as a unified system in the GitHub Copilot mirror. This document is the single reference for ownership boundaries, routing rules, and parity expectations between the two packages.

## Architecture

```
User request
    |
    v
+---------------------------+
| pipeline-orchestrator     |  ENTRY LAYER
| - classification          |  Owns: ORCHESTRATOR_DECISION, type, persona,
| - ORCHESTRATOR_DECISION   |        severity, complexity, route selection,
| - route selection         |        info gate, batch discipline, final checks
| - gate discipline         |
+---------------------------+
    |
    | explicit handoff (route known)
    v
+---------------------------+
| superpowers               |  EXECUTION LAYER
| - brainstorming           |  Owns: specialized workflow discipline,
| - planning                |        execution-stage handoffs, TDD,
| - execution               |        debugging, review, verification
| - debugging / TDD         |
| - review / verification   |
+---------------------------+
```

## Ownership boundaries

### pipeline-orchestrator owns

| Responsibility | Artifacts |
|----------------|-----------|
| Emitting `ORCHESTRATOR_DECISION` | `prompts/ask`, `prompts/enforce`, `prompts/pipeline`, `agents/pipeline-orchestrator` |
| Classification (type, persona, severity, complexity) | `agents/pipeline-orchestrator`, KB 20-21 |
| Route selection | KB 25 (routing and handoffs) |
| Info gate (`informacao_completa` + `lacunas`) | `instructions/50-pipeline-orchestrator-gates` |
| Batch discipline (findings, corrections, validation per batch) | `agents/pipeline-orchestrator`, KB 25 |
| Final structured checks (Pa de Cal equivalent) | KB 26 (gate emulation) |
| Parity honesty | KB 21 (compatibility matrix), KB 26 |

### superpowers owns

| Responsibility | Artifacts |
|----------------|-----------|
| Brainstorming discipline | `prompts/superpowers-brainstorming` |
| Plan writing | `prompts/superpowers-writing-plans` |
| Plan execution (linear) | `prompts/superpowers-executing-plans` |
| Plan execution (multiagent) | `prompts/superpowers-subagent-driven-development` |
| Systematic debugging | `prompts/superpowers-debugging` |
| TDD workflow | `prompts/superpowers-tdd` |
| Code review (requester + reviewer) | `prompts/superpowers-code-review`, `prompts/superpowers-code-reviewer` |
| Verification before completion | `prompts/superpowers-verification-before-completion` |
| Canonical chain order | `agents/superpowers-orchestrator`, KB 10-11, KB 15 |

## Routing contract

### From pipeline-orchestrator to superpowers

When `pipeline-orchestrator` finishes classification and `informacao_completa = true`, it hands off to the appropriate `superpowers` stage:

| Signal in ORCHESTRATOR_DECISION | Target superpowers prompt | When |
|---------------------------------|---------------------------|------|
| `execucao = trivial` | None (direct response) | No handoff needed |
| `informacao_completa = false` | None (stop at classification) | Resolve gaps first |
| Exploration still open | `/superpowers-brainstorming` | Framing, constraints, or criteria missing |
| Plan needed before code | `/superpowers-writing-plans` | Classification exists but no batch plan |
| Bug, regression, intermittent failure | `/superpowers-debugging` | Root cause investigation needed |
| Behavior change with regression protection | `/superpowers-tdd` | Test before code |
| Approved plan, linear execution | `/superpowers-executing-plans` | No multiagent gain |
| Approved plan, context isolation useful | `/superpowers-subagent-driven-development` | Multiagent reduces risk |
| Implementation ready for audit | `/superpowers-code-review` | Before delivery claim |
| Execution done, verification pending | `/superpowers-verification-before-completion` | Mandatory before final claim |

### From superpowers back to pipeline-orchestrator

Superpowers does NOT re-emit `ORCHESTRATOR_DECISION` unless the user enters a superpowers prompt directly without prior classification. In that case, superpowers operates on its own stage without claiming retroactive ownership over the canonical classification.

If during superpowers execution a new gap emerges that requires re-classification (e.g., scope change, new blocking dependency), the handoff goes back to `/ask` or `/enforce` for re-assessment.

## Entry point guide for users

| User intent | Recommended entry | Why |
|-------------|-------------------|-----|
| New request, needs classification | `/ask` | Lightweight, emits ORCHESTRATOR_DECISION |
| New request, strict mode | `/enforce` | All 12 fields validated, zero tolerance |
| Multi-step work with gates | `/pipeline` | Full guided workflow |
| Already classified, known stage | `/superpowers-*` directly | Skip re-classification |
| Short alias for superpowers stage | `/super-*` | Compatibility wrapper |

## Parity rules

### What BOTH packages may claim

- Cadeia operacional preservada por prompts, instructions, KB, e agentes coordenadores
- Gates centrais emulados como compatibilidade guiada (guided parity)
- Discovery real quando settings locais apontam para os diretivos corretos

### What NEITHER package may claim

- Enforcement automatico por hook de ciclo de vida (no parity no Copilot)
- Bloqueio automatico de conclusao sem validacao final por runtime
- Existencia de `quality-gate-router` ou `pre-tester` como agentes runtime do Copilot
- Equivalencia exata de naming entre todos os outputs Claude/Windsurf e os outputs adaptados

### When parity classification disagrees

If a capability is classified differently between the two packages, the MORE CONSERVATIVE classification wins. For example, if pipeline-orchestrator says `guided parity` but superpowers says `no parity`, the integration answer is `no parity`.

## Maintenance rules

1. Changes to ownership boundaries require updating THIS document
2. New routing rules must be reflected in KB 25 (pipeline) and KB 15 (superpowers)
3. New prompts in either package must declare their position in this contract
4. Parity claims must be validated against KB 21 (compatibility matrix) and KB 26 (gate emulation)
5. The mirror manifests (`mirror-manifests/*.json`) must include any new files created under governance
