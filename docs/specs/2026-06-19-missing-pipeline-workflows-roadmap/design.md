# Design: Missing Pipeline Workflows Roadmap

Status: VALIDATING
Subject: pipeline-orchestrator plugin (v8.7.0). META-SPEC, design-only.

## Overview

This design package specifies four strong-gap workflows as their own commands (Refactor, Performance, Migration, Release) and four second-tier proposals as flags on existing commands (Test Backfill, Research/Spike, Incident/Postmortem, Documentation). Each strong-gap workflow is modeled below as a named component with a responsibility, a variant outline, a signature gate, an agent-reuse table, a BEHAVIOR_EVIDENCE specialization, and a Paperclip mirror block. The design honors the Iron Law: every gate is a PROPOSED additive entry, and the existing Mandatory-Gates table and Gate Registry are not changed by this spec.

The architectural spine across all four strong-gap workflows is one shared concept — BEHAVIOR_EVIDENCE — specialized four ways. This keeps four high-risk workflows anchored to a single mental model (SOLID single-responsibility at the spec level; DRY at the concept level) instead of inventing four divergent evidence schemes.

## Architecture context (reused, not invented)

A workflow in this plugin is two skill folders (`<type>-light/` + `<type>-heavy/`), each a SKILL.md with frozen frontmatter (`sequence_lock`, `gates_at`, `sentinel_checkpoints`, per-step `execution_mode` + `agent_type` + `expected_inputs/outputs`). Classification lives in the task-orchestrator CLASSIFICATION table; routing lives in the complexity-matrix ROUTING matrix; the pipeline-controller dispatches by variant to a skill. Code-changing workflows reuse a known cluster: executor-implementer-task, quality-gate-router, pre-tester, checkpoint-validator, review-orchestrator, final-adversarial-orchestrator, sanity-checker, final-validator, finishing-branch. Read-only workflows skip Phase 3. None of this is invented here; the new workflows slot into it.

## Components

### Refactor workflow
**Responsibility:** Restructure code WITHOUT changing observable behavior, with behavior-preservation made auditable by a scope-lock contract and characterization-test evidence. Traces to: Req 3, Req 4, Req 5.

- **Command:** `/pipeline-orchestrator:refactor` (light/heavy variants).
- **Light:** small, single-module restructure — explore + plan + implement + diff-discipline + characterization tests, no final adversarial pair. **Heavy:** cross-module restructure — adds the final adversarial review.
- **Signature gate (PROPOSED, additive):** `REFACTOR_SCOPE_LOCK` (HARD) fires BEFORE the first file touch; validates the CHANGE_CONTRACT artifact (the existing `IMPLEMENTATION_PLAN.CHANGE_CONTRACT` plan-block, reused as-is) exists and is signed. A proposed change in the forbidden column aborts the run. The gate name is deliberately distinct from the CHANGE_CONTRACT plan-block so the audit trail never confuses a gate decision with the plan artifact it consumes.
- **BEHAVIOR_EVIDENCE specialization:** a before/after characterization-test snapshot — the same test suite run before any edit and after the last edit. The identical-results check is bound to the PUBLIC-behavior tests exercising the CHANGE_CONTRACT allowed-files public surface; internal coverage-only test changes are excluded from the identical check, because a restructure may legitimately move or rename internal tests. Identical public-behavior results are the proof of behavior preservation.
- **New-agent delta:** ZERO genuinely-new agents. Reuses explore + plan-architect + executor-implementer-task + diff-discipline-reviewer. Characterization tests are produced by pre-tester run in a thin-wrapper "characterization" mode — a small documented prompt delta over pre-tester's RED-phase contract: instead of authoring tests that MUST FAIL, characterization mode authors tests that capture current behavior and MUST PASS. This is a thin-wrapper, not a zero-cost reuse, because pre-tester's hardcoded "tests must fail (TDD RED phase)" invariant does not natively allow passing snapshots; the mode flips that one expectation and nothing else, and is implemented as a prompt delta with no new agent file.

Agent-reuse table (Status vocabulary per Req 3 AC2: reused / thin-wrapper / genuinely-new):

| Agent | Status | Rationale |
|---|---|---|
| explore / Explore | reused | Maps the code region to restructure; read-only. |
| plan-architect | reused | Produces the CHANGE_CONTRACT plan-block as part of the plan (allowed vs. forbidden change types). |
| pre-tester | thin-wrapper | Authors characterization tests via a "characterization" mode — a small prompt delta over its RED-phase contract (tests MUST PASS against current behavior instead of MUST FAIL). The flip is documented; no new agent file is added. |
| executor-implementer-task | reused | Applies the restructure under the existing SCOPE LOCK CHECK. |
| diff-discipline-reviewer | reused | Verifies the diff respects the CHANGE_CONTRACT plan-block — exactly its existing job. |
| review-orchestrator + adversarial reviewers | reused (heavy only) | Independent zero-context review for cross-module refactors. |

### Performance workflow
**Responsibility:** Make slow code fast and PROVE the speedup with before/after numbers; distinct from Audit (read-only) because it changes code and must answer "did it actually get faster?". Traces to: Req 3, Req 4, Req 5.

- **Command:** `/pipeline-orchestrator:performance` (light/heavy variants).
- **Light:** localized hotspot optimization with a single before/after benchmark. **Heavy:** multi-path optimization with profiling pointer + adversarial review of the change.
- **Signature gate (PROPOSED, additive):** `PERF_REGRESSION` (HARD) — fires at workflow close; consumes the benchmark snapshot; blocks a "win" claim unless the after-numbers beat the before-numbers, and blocks if any measured metric regressed past its before-value. The gate is always HARD (KISS): there is no "hot path" detection mechanism in this plugin and inventing one would violate Non-Invention, so the gate treats every benchmarked metric uniformly.
- **BEHAVIOR_EVIDENCE specialization:** a before/after benchmark snapshot (timing numbers + a profiling pointer) — the proof that the optimization worked and did not regress.
- **New-agent delta:** ONE genuinely-new agent. A performance/benchmark validator that runs the agreed benchmark before and after and produces the before/after numbers. Reuses the existing adversarial reviewers for the code change itself.

Agent-reuse table:

| Agent | Status | Rationale |
|---|---|---|
| explore / Explore | reused | Locates hotspots; read-only. |
| performance-benchmark-validator | genuinely-new | Produces the before/after timing numbers; no existing agent measures performance. Justified: the "did it speed up?" proof has no existing owner. |
| executor-implementer-task | reused | Applies the optimization. |
| review-orchestrator + adversarial reviewers | reused | Reviews the optimization for correctness and abstraction leaks. |

### Migration workflow
**Responsibility:** Bump a library, migrate a schema, or port technology in small reversible steps, with a rollback plan enforced at the exact point of no return. Highest-risk of the four. Traces to: Req 3, Req 4, Req 5.

- **Command:** `/pipeline-orchestrator:migration` (light/heavy variants).
- **Light:** a low-risk dependency bump with a trivial rollback (revert the lockfile). **Heavy:** schema/data migration with a staged rollback plan and adversarial review.
- **Signature gate (PROPOSED, additive):** `MIGRATION_COMMITTED` (HARD, escalating to CIRCUIT_BREAKER) fires at the boundary marker described below; presents the rollback-plan artifact and requires explicit acknowledgment. Missing or "no rollback possible" plan escalates to CIRCUIT_BREAKER and halts.
- **Point-of-no-return boundary mechanism:** the irreversible step is not auto-detected. The migration plan (produced by plan-architect) MUST tag exactly one step as `irreversible: true` and name the destructive operation; the workflow inserts a mandatory pre-destructive-op confirmation immediately before that tagged step, and `MIGRATION_COMMITTED` fires at that confirmation. For a light Migration whose rollback is a trivial lockfile revert (no irreversible step), the plan tags zero steps irreversible and the gate is trivially SATISFIED (rollback is always possible), not skipped silently — the SATISFIED record states "reversible: no point of no return".
- **CIRCUIT_BREAKER recovery action:** when the gate escalates (rollback plan absent or marked "no rollback possible"), it halts the run and emits a concrete recovery instruction: do NOT proceed with the destructive step; either author a concrete rollback plan and re-run the gate, or abort the migration and restore the pre-migration state (lockfile/branch/DB snapshot) named in the plan's recovery_procedure. The run does not resume until a present, concrete rollback plan re-satisfies the gate.
- **BEHAVIOR_EVIDENCE specialization:** a pre/post health-check record (schema shape + integration smoke) — proof the system is healthy on both sides of the migration.
- **New-agent delta:** ONE genuinely-new agent. A migration-safety / data-integrity + rollback-plan checker that validates the rollback plan exists and is concrete and runs the pre/post health check. Reuses plan-architect for the staged plan.

Agent-reuse table:

| Agent | Status | Rationale |
|---|---|---|
| plan-architect | reused | Produces the staged migration plan + the rollback plan artifact; tags the one irreversible step. |
| migration-safety-checker | genuinely-new | Validates rollback-plan completeness and runs pre/post health checks; no existing agent guards data integrity at the point of no return. Justified: the irreversibility risk has no existing owner. |
| executor-implementer-task | reused | Applies each reversible step. |
| review-orchestrator + adversarial reviewers | reused (heavy only) | Independent review of the migration steps. |

### Release workflow
**Responsibility:** Version-bump, changelog, tag, and publish across all channels with no forgotten channel and no forgotten /reload-plugins reminder. Deliberately lighter — a guided checklist more than a reasoning team. Traces to: Req 3, Req 4, Req 5, Req 6.

- **Command:** `/pipeline-orchestrator:release` (light/heavy variants, AUDIT-pattern template, depth-capped).
- **Light:** the checklist without adversarial review. **Heavy (default):** the checklist plus an adversarial pass over the release diff and metadata.
- **Signature gate (PROPOSED, additive):** `CHANNEL_PARITY` (HARD) fires at workflow close; verifies every Channel Parity Checklist row is satisfied across all channels and the nine lockstep surfaces.
- **BEHAVIOR_EVIDENCE specialization:** a channel-parity snapshot — which channels saw the new version and which lockstep surfaces were updated.
- **New-agent delta:** ONE genuinely-new agent. A release / channel-parity validator that checks each checklist row. Reuses final-validator for the closeout decision.

Agent-reuse table:

| Agent | Status | Rationale |
|---|---|---|
| channel-parity-validator | genuinely-new | Checks each Channel Parity Checklist row across channels + lockstep surfaces; no existing agent verifies release fan-out. Justified: the "forgotten channel" failure mode has no existing owner. |
| final-validator | reused | Issues the closeout Go/No-Go over the parity result. |
| review-orchestrator + adversarial reviewers | reused (heavy only) | Reviews the release diff and metadata. |

**YAGNI verdict on agents:** three genuinely-new agents total (performance-benchmark-validator, migration-safety-checker, channel-parity-validator) — the minimum, each owning a proof no existing agent produces. Refactor adds zero genuinely-new agents; its only non-reuse is ONE thin-wrapper (pre-tester's characterization mode, a documented prompt delta, no new agent file). So the full agent delta is: 3 genuinely-new + 1 thin-wrapper + the reused cluster. This keeps the new-agent floor at three while being honest that Refactor's characterization snapshot is a thin-wrapper, not free.

## Second-tier verdict table (flags, not commands)

| Proposal | Verdict | Host command + flag | Promotes to own command when |
|---|---|---|---|
| Test Backfill | flag | `pipeline --test-backfill` (TDD-phase-only: quality-gate-router + pre-tester + executor for tests; skips production impl) | test-only runs become a first-class independent CI trigger |
| Incident / Postmortem | flag | `pipeline review-only --incident` (alias `--postmortem`); rides the existing `review-only` mode in pipeline.md (its read-only final-adversarial structure) | it needs a distinct roster or write/remediation actions beyond read-only review |
| Documentation | flag | `audit --doc-only` (report-only: doc coverage/staleness report); alternative for greenfield doc authoring = `/pipeline-orchestrator:spec` | it needs write access to generate or patch docs |
| Research / Spike | already-covered | existing `brainstorm --no-impl` (+ `--skip-validate-gap` for greenfield) | when spikes need dedicated artifact tracking distinct from brainstorm output, or a distinct CI trigger separate from the brainstorm flow |

All four second-tier proposals are flags or already-covered, never new commands (Req 2). This is the YAGNI/KISS guard: a new command costs nine lockstep-surface edits; a flag on an existing command file costs the edit to that one command file (plus its help.md stub) — far cheaper, which is why each rides a structure that already exists (`pipeline`, `pipeline review-only`, `audit`, `brainstorm`). One nuance for the Documentation flag: `audit` is currently a dispatch entry-point with no dedicated `commands/audit.md` (the `commands/` folder holds only pipeline.md, brainstorm.md, help.md, setup-paperclip.md, and the paperclip-* wrappers), so implementing `--doc-only` would create a thin `commands/audit.md` mirroring `commands/bugfix.md`; this is still far cheaper than a net-new strong-gap command and does not weaken the YAGNI verdict.

## Data model

The spec defines artifact shapes, not database schemas. The shared artifact is BEHAVIOR_EVIDENCE, specialized per flow.

- **BEHAVIOR_EVIDENCE (abstract):** `{ flow, captured_at, before, after, verdict }`. The `before`/`after` payloads are flow-specific:
  - Refactor: `before`/`after` = characterization-test result sets (public-surface tests only); verdict = `IDENTICAL | DIVERGED`.
  - Performance: `before`/`after` = `{ metric, value, unit, profiling_pointer }`; verdict = `FASTER | NO_CHANGE | REGRESSED`.
  - Migration: `before`/`after` = `{ schema_shape, integration_smoke }`; verdict = `HEALTHY | DEGRADED`.
  - Release: `before`/`after` = channel/version map; verdict = `PARITY | MISSING_CHANNEL`.
- **CHANGE_CONTRACT (Refactor):** the existing `IMPLEMENTATION_PLAN.CHANGE_CONTRACT` plan-block, reused unchanged — two columns: Allowed changes (rename, extract, inline, move, restructure internal data) and Forbidden changes (new public API surface, changed error codes, changed output format, changed side-effects). Plus a signed-off flag. The `REFACTOR_SCOPE_LOCK` gate consumes this block; it does not define a new artifact.
- **Rollback plan (Migration):** `{ steps[], steps[].irreversible: bool, reversible: bool, recovery_procedure, no_rollback_possible: bool }`. Exactly one step may carry `irreversible: true`; that flag is the boundary marker the `MIGRATION_COMMITTED` gate fires at.
- **Channel Parity Checklist (Release):** a versioned table; rows below.

#### Channel Parity Checklist (versioned appendix, v1)

| Row | Channel / surface | Checked |
|---|---|---|
| 1 | npm publish | [ ] |
| 2 | GitHub Release + tag | [ ] |
| 3 | marketplace.json version + ref | [ ] |
| 4 | installed_plugins.json | [ ] |
| 5 | local cache folder populated | [ ] |
| 6 | /reload-plugins reminder surfaced to user | [ ] |
| 7 | lockstep surface: entry-points.json | [ ] |
| 8 | lockstep surface: task-orchestrator CLASSIFICATION table | [ ] |
| 9 | lockstep surface: complexity-matrix ROUTING matrix | [ ] |
| 10 | lockstep surface: the two skill folders (light/heavy pair) | [ ] |
| 11 | lockstep surface: team-registry | [ ] |
| 12 | lockstep surface: gates.md Registry | [ ] |
| 13 | lockstep surface: the two enforcement hooks | [ ] |
| 14 | lockstep surface: both plugin manifests (Claude .claude-plugin + Cursor .cursor-plugin) | [ ] |
| 15 | lockstep surface: help.md command stub (the plain-language guide entry for the new command) | [ ] |

Adding a new channel = add a row here (this is why the checklist is a versioned appendix, not tribal knowledge).

## Lockstep surfaces — canonical count

A NEW command must be updated in version lockstep across **nine** surfaces. The nine are enumerated identically everywhere in this spec:

1. entry-points.json
2. the task-orchestrator CLASSIFICATION table
3. the complexity-matrix ROUTING matrix
4. the two skill folders of a light/heavy pair
5. team-registry
6. the gates.md Registry
7. the two enforcement hooks
8. both plugin manifests (Claude `.claude-plugin` + Cursor `.cursor-plugin`)
9. help.md — the plain-language command guide must gain a stub for the new command (this spec itself mandates a help stub per new command in Req 8, so help.md is a genuine lockstep surface, verified to exist at `commands/help.md` in the repo on 2026-06-19)

This "nine lockstep surfaces" set is distinct from the version-bump channel fan-out (the npm/GitHub/marketplace/cache/installed-plugins rows of the Channel Parity Checklist). The Checklist's rows 7–15 mirror these nine lockstep surfaces; rows 1–6 are the release channels.

## Contracts

#### Proposed gate contracts (PROPOSED additive entries — Iron Law preserved)

| Gate | Hardness | Workflow | Trigger | Action |
|---|---|---|---|---|
| REFACTOR_SCOPE_LOCK | HARD | Refactor | Before first file touch | BLOCK until the CHANGE_CONTRACT plan-block exists and is signed; abort if a forbidden change is proposed |
| PERF_REGRESSION | HARD | Performance | Workflow close | Block the speedup claim unless after-numbers beat before-numbers; block if any metric regressed |
| MIGRATION_COMMITTED | HARD (→ CIRCUIT_BREAKER) | Migration | Pre-destructive-op confirmation at the plan's `irreversible: true` step | Require rollback plan present + concrete; escalate to CIRCUIT_BREAKER + halt with a recovery instruction if missing or "no rollback possible" |
| CHANNEL_PARITY | HARD | Release | Workflow close | Verify every Channel Parity Checklist row satisfied |

These four rows are what a future implementer would APPEND to the Gate Registry. This spec does not append them.

#### Gate-registration how-to (normative appendix)

To register any new gate correctly, a future implementer MUST: (1) append a row to the Gate Registry with all required fields; (2) bump the registry count header in the same file; (3) add a check to the Mandatory-Gates-by-Complexity table IF the gate is mandatory for any complexity tier; (4) add the canonical decision-vocabulary token to the decision SSOT IF the gate introduces a new decision token. This four-step recipe is the procedural form of the Iron Law (Req 5).

#### Paperclip mirror contract (per strong-gap workflow, documentation-only)

Each strong-gap workflow gets an additive Paperclip mirror with three parts and ZERO server-side code change (Req 7):
1. one `PAPERCLIP-<TYPE>-WORKFLOW.md` document describing the flow;
2. one thin `paperclip-<type>.md` wrapper command with the five-step shape: validate, classify, dry-run, confirm, execute;
3. one catalog row in the Paperclip catalog.

#### help.md stubs (per strong-gap workflow, dual-audience contract)

The spec authors a three-to-four-paragraph plain-language help stub per new command, in the existing `commands/help.md` register (Req 8). The four committed stubs are authored in full in the **help.md stubs appendix** below — they are a deliverable of THIS spec, not future work. They describe what the command does, who should use it, what it needs as input, and what it produces — the owner-facing layer parallel to these implementer-facing contracts.

## Phased implementation order

Refactor and Release first (owner preference, Req 8): Refactor because it has zero genuinely-new agents and the highest reuse, Release because it removes a recurring manual-shipping failure mode. Then Performance, then Migration (highest-risk, most new safety machinery) last. Each is a MINOR additive release that preserves the Iron Law.

## help.md stubs appendix (committed deliverable, Req 8 AC1)

These four stubs are written in the voice of the existing `commands/help.md` (Brazilian-Portuguese, plain language, voice-friendly, no file paths in prose) so a future implementer pastes them verbatim into the guide when each command ships.

### `/pipeline-orchestrator:refactor`
Arruma a arrumação do código sem mudar o que ele faz por fora. Serve pra quando o programa funciona certo, mas a tripa dele está bagunçada e difícil de mexer — você quer reorganizar, renomear, separar em pedaços menores, sem que o comportamento visível mude em nada.

Antes de tocar em qualquer linha, ele fecha um "contrato de mudança": o que pode mexer e o que é proibido mexer (nada de mudar o que o programa entrega por fora). Esse contrato vira uma trava — se algum passo tentar furar a regra, o trabalho para na hora.

Pra provar que não quebrou nada, ele roda os testes que olham o comportamento de fora antes de começar e de novo no fim; os dois resultados têm que bater igualzinho. Tem versão leve (uma arrumação pequena num só lugar) e pesada (arrumação que cruza vários lugares, com uma revisão crítica final). Use quando quiser limpar a casa com rede de segurança.

### `/pipeline-orchestrator:performance`
Deixa o código mais rápido e prova com número que ficou mais rápido mesmo. É diferente da auditoria, que só olha e não mexe: aqui ele muda o código e no fim responde "acelerou de verdade?".

Ele mede o tempo antes de mexer, faz a otimização, e mede de novo no fim. No fechamento, uma trava confere os dois números: se o depois não ganhou do antes, ou se alguma medida piorou, ele não deixa você cantar vitória. Versão leve mede um ponto só; versão pesada mexe em vários caminhos e ainda passa por revisão crítica.

Use quando algo está lento e você quer consertar com prova na mão, não no "achismo".

### `/pipeline-orchestrator:migration`
Cuida de troca de peça arriscada: subir a versão de uma biblioteca, mudar o formato dos dados, ou trocar uma tecnologia por outra — sempre em passos pequenos que dá pra voltar atrás. É o fluxo mais cuidadoso dos quatro, porque é o que mais pode dar dor de cabeça se algo sair errado.

O ponto-chave é o "ponto sem volta": o passo a partir do qual não dá mais pra desfazer fácil. Bem na hora desse passo, ele para e exige que você tenha um plano de retorno escrito e concreto. Se não tiver plano, ou se o plano disser "não dá pra voltar", ele puxa o freio de emergência e não deixa seguir.

Versão leve é uma subida de biblioteca simples, com retorno fácil. Versão pesada é mudança de dados de verdade, com plano de retorno em etapas e revisão crítica. Use quando a mudança mexe em algo que, se quebrar, é caro de arrumar.

### `/pipeline-orchestrator:release`
Publica uma nova versão em todo lugar de uma vez, sem esquecer nenhum canal e sem esquecer de avisar você pra recarregar os plugins no fim. Hoje isso é feito na mão e é fácil esquecer um pedaço; este comando vira uma lista de conferência guiada.

No fechamento, uma trava confere item por item: subiu no repositório de pacotes, criou a marca da versão, atualizou a vitrine, atualizou o registro local, e por aí vai — incluindo as nove peças internas que toda versão nova precisa atualizar junto. Só dá "pronto" quando todos os itens estão marcados.

Versão leve faz a lista sem revisão crítica; a pesada (que é o padrão) ainda passa uma revisão crítica por cima do que mudou. Use toda vez que for shippar, pra nunca mais ficar com um canal pra trás.

## Cross-cutting design notes

- **SOLID/YAGNI/KISS verdict:** four new commands justified (each is a distinct activity with a distinct signature gate and no cheaper flag form); four flags justified (each rides an existing read-only, review-only, or TDD structure). Three genuinely-new agents justified (each owns a unique proof) plus one thin-wrapper (pre-tester characterization mode). Refactor proves the additive-only ideal: a whole workflow with zero genuinely-new agents.
- **Drift note:** team-registry says "20 agents" but 50 exist on disk; the Release Channel Parity Checklist row 11 (team-registry) is the surface where a future implementer reconciles that drift when adding any new agent.
