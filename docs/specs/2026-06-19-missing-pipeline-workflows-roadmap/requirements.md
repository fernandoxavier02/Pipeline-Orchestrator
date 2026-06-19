# Requirements: Missing Pipeline Workflows Roadmap

Status: VALIDATING
Subject: the pipeline-orchestrator plugin itself (v8.7.0) — this is a META-SPEC.
Deliverable nature: a design roadmap. It DOCUMENTS proposed new workflows; it implements NONE of them. No code, no test runs, no migrations are produced by this spec.

## Introduction

The pipeline-orchestrator plugin routes every non-trivial task through a typed, complexity-scaled multi-agent pipeline. Today it recognizes five canonical task types (Bug Fix, Feature, User Story, Audit, UX) plus a first-class Spec authoring flow. Several common engineering activities have NO dedicated workflow and are improvised today: restructuring code without changing behavior (Refactor), making slow code fast (Performance), bumping libraries or migrating data (Migration), and shipping a release across all channels (Release). Four further activities (Test Backfill, Research/Spike, Incident/Postmortem, Documentation) are smaller and likely belong as flags on existing commands rather than new commands.

This spec is a contract-grade DESIGN PACKAGE for those eight proposals. It exists so a future implementer can build any one of them without re-deriving the plugin's architecture, and so the owner can decide WHICH to build and in what order. It applies SOLID, YAGNI, and KISS as first-class acceptance lenses: every proposed new command must justify itself against a cheaper "flag on an existing command" alternative, and the spec must refuse speculative machinery.

The plugin is a pure `.cjs` (Node hooks) + `.md` (agents, skills, commands, references) codebase. There is NO TypeScript. Every design in this spec is expressible in that substrate. The plugin's Iron Law — the Mandatory-Gates-by-Complexity table and the Gate Registry are a single source of truth and are never silently mutated — is preserved: every new gate this spec proposes is documented as an ADDITIVE registry entry, with the exact registration procedure given in an appendix. This spec changes neither table; it only describes the additions a future implementer would make.

The dual audience is explicit: the owner (a non-programmer) reads the executive layer and the per-command help stubs; future implementers read the interface contracts, agent-reuse tables, and gate specifications.

## Verified surface baseline (evidence, 2026-06-19, v8.7.0)

These verified figures are the authoritative counts this spec cites. They supersede stale memory figures.

- Agent roster: **50 agent `.md` files on disk** (core 11 including final-validator / brainstorm 4 / executor 6 / executor/type-specific 21 / quality 8). Known drift: `references/team-registry.md` still says "20 agents" and the Paperclip catalog says ~46–47; this spec cites the verified on-disk count and flags the drift, and does NOT propagate "47" as the roster size.
- Gate Registry: header declares **48 gates** (hardness mix MANDATORY / HARD / CIRCUIT_BREAKER / SOFT / AUDIT).
- Mandatory-Gates-by-Complexity (cumulative): **SIMPLES = 11, MEDIA = 13, COMPLEXA = 18**, plus **+6 for type=Spec**.
- Canonical plugin version at authoring time: **8.7.0**.
- **Nine lockstep surfaces** a NEW command must update in version lockstep, enumerated as nine: (1) entry-points.json; (2) the task-orchestrator CLASSIFICATION table; (3) the complexity-matrix ROUTING matrix; (4) the two skill folders of a light/heavy pair; (5) team-registry; (6) the gates.md Registry; (7) the two enforcement hooks; (8) both plugin manifests (Claude `.claude-plugin` and Cursor `.cursor-plugin`); and (9) `commands/help.md` — the plain-language command guide, which must gain a stub for the new command (verified to exist in the repo on 2026-06-19; this spec itself mandates a help stub per new command in Req 8, making help.md a genuine lockstep surface). This nine-surface set is distinct from the release channel fan-out (npm/GitHub/marketplace/cache/installed-plugins), which the Release Channel Parity Checklist tracks separately.

## Requirement levels

The terms MUST, SHOULD and MAY are used deliberately.

- MUST means the spec is incomplete without it.
- SHOULD means required unless the author documents a safer equivalent.
- MAY means optional and non-blocking.

## Glossary

- **Strong-gap workflow** — an activity that merits its own command: Refactor, Performance, Migration, Release.
- **Second-tier proposal** — an activity better expressed as a flag on an existing command: Test Backfill, Research/Spike, Incident/Postmortem, Documentation.
- **BEHAVIOR_EVIDENCE** — one reusable behavioral-evidence artifact type, specialized per strong-gap flow, used as the evidentiary input to that flow's signature gate.
- **Signature gate** — the one (occasionally two) PROPOSED additive gate that defines a workflow's distinguishing safety check.
- **Agent-reuse table** — a three-column table (agent | reused / thin-wrapper / genuinely-new | rationale) making each flow's agent delta YAGNI-verifiable.
- **Channel Parity Checklist** — a versioned Release artifact enumerating every release channel and the nine lockstep surfaces.
- **CHANGE_CONTRACT** — the existing `IMPLEMENTATION_PLAN.CHANGE_CONTRACT` plan-block (a Refactor scope-lock artifact listing allowed vs. forbidden change types), reused unchanged. NOTE: the Refactor signature *gate* is named `REFACTOR_SCOPE_LOCK`, deliberately distinct from this plan-block name, so the audit trail never confuses the gate decision with the plan artifact it consumes.
- **REFACTOR_SCOPE_LOCK** — the Refactor signature gate (HARD); fires before the first file touch and consumes the CHANGE_CONTRACT plan-block.
- **Iron Law** — the rule that the Mandatory-Gates-by-Complexity table and the Gate Registry are SSOT and only ever grow additively.
- **Lockstep surface** — one of the nine files that must be updated together when a new command is added.
- **Promotion criterion** — the named condition that would flip a second-tier verdict from "flag" to "own command".

## Requirement 1: Unified roadmap document set

**User Story:** As the plugin owner, I want one coherent spec document set covering all eight proposals, so that I can read the whole roadmap in one place and decide what to build without hunting across fragmented files.

#### Acceptance Criteria

1. THE spec SHALL deliver at least four artifacts: requirements.md, design.md, tasks.md, and a README.md index. A research.md discovery survey is permitted as supplementary context (it is present in this run as the fifth artifact and is non-normative).
2. THE spec SHALL cover all eight proposals (four strong-gap, four second-tier) in a single document tree.
3. THE spec SHALL NOT fragment the proposals into one folder per workflow.
4. WHEN a reader opens the README index, THE README SHALL link to each of the other artifacts and summarize the roadmap in plain language.
5. THE spec SHALL implement none of the proposals — it produces no plugin code, no test files, and no migration steps.

## Requirement 2: YAGNI verdict — command vs. flag, with promotion criteria

**User Story:** As an architect guarding against over-engineering, I want every proposal classified as "own command" or "flag on existing command" with a stated reason and a revision condition, so that the roadmap is a living decision log rather than a permanent veto or an unjustified expansion.

#### Acceptance Criteria

1. THE spec SHALL classify each of the eight proposals as either a new command or a flag on a named existing command.
2. WHEN a proposal is classified as a flag, THE spec SHALL name the exact host command and flag (for example `pipeline review-only --incident`), and the named host command MUST exist in the repo.
3. THE spec SHALL record, for each second-tier proposal, a "Promotes to own command when:" row naming the concrete condition that would change the verdict.
4. IF a second-tier activity is already covered by an existing command, THEN THE spec SHALL mark it as already-covered, propose no new flag or skeleton, AND still record its promotion criterion per AC3.
5. THE spec SHALL justify every proposed NEW command against the cheaper flag alternative, applying SOLID, YAGNI, and KISS explicitly.

## Requirement 3: Interface contract per strong-gap workflow

**User Story:** As a future implementer, I want each strong-gap workflow specified at interface depth — command, light/heavy variant outline, signature gate(s), and agent-reuse table — so that I can implement exactly one workflow without re-deriving the variant and gate patterns.

#### Acceptance Criteria

1. THE spec SHALL provide, for each of Refactor, Performance, Migration, and Release, a command name, a light/heavy variant outline, and the signature gate(s) it adds.
2. THE spec SHALL include, per strong-gap workflow, an agent-reuse table marking each agent as reused, thin-wrapper, or genuinely-new with a rationale.
3. WHEN a strong-gap workflow proposes a genuinely-new agent, THE agent-reuse table SHALL justify that agent in its rationale column.
4. THE spec SHALL keep the total count of genuinely-new agents across all four strong-gap workflows to the YAGNI minimum of three.
5. THE Refactor workflow SHALL introduce zero genuinely-new agents and reuse existing explore, plan, implement, and diff-discipline capabilities, with characterization tests provided by pre-tester in a thin-wrapper "characterization" mode (a documented prompt delta, no new agent file).

## Requirement 4: Shared BEHAVIOR_EVIDENCE concept specialized per flow

**User Story:** As an architect, I want one behavioral-evidence concept specialized four ways, so that the four strong-gap workflows share one mental model instead of four divergent ad-hoc evidence schemes.

#### Acceptance Criteria

1. THE spec SHALL define one BEHAVIOR_EVIDENCE artifact type as the evidentiary input to each strong-gap workflow's signature gate.
2. THE spec SHALL specialize BEHAVIOR_EVIDENCE per flow: a before/after characterization-test snapshot for Refactor, a before/after benchmark snapshot for Performance, a pre/post health-check record for Migration, and a channel-parity snapshot for Release.
3. WHEN a strong-gap workflow reaches its signature gate, THE gate SHALL consume the flow's BEHAVIOR_EVIDENCE specialization as its decision input.

## Requirement 5: Signature gates documented additively (Iron Law preserved)

**User Story:** As the maintainer of the gate system, I want every proposed gate documented as an additive registry entry with a registration recipe, so that adding gates never silently mutates the existing tables.

#### Acceptance Criteria

1. THE spec SHALL document each proposed gate as a PROPOSED additive entry, leaving the existing Mandatory-Gates table and Gate Registry untouched.
2. THE spec SHALL name one signature gate per strong-gap workflow: a behavior-preservation gate for Refactor, a performance-regression gate for Performance, a point-of-no-return gate for Migration, and a channel-parity gate for Release.
3. THE Refactor workflow SHALL reuse the CHANGE_CONTRACT plan-block and fire a HARD `REFACTOR_SCOPE_LOCK` gate (a name distinct from the CHANGE_CONTRACT plan-block) before the first file is touched.
4. WHEN a proposed change for a Refactor run appears in the CHANGE_CONTRACT forbidden column, THEN THE `REFACTOR_SCOPE_LOCK` gate SHALL abort the workflow.
5. WHEN the irreversible step of a Migration run begins (the single plan step tagged `irreversible: true`), THE Migration workflow SHALL fire a HARD MIGRATION_COMMITTED gate at the mandatory pre-destructive-op confirmation that requires the rollback-plan artifact to be present and concrete.
6. IF a Migration rollback plan is missing or marked "no rollback possible", THEN THE MIGRATION_COMMITTED gate SHALL escalate to CIRCUIT_BREAKER, halt the workflow, and emit a concrete recovery instruction (author a concrete rollback plan and re-run the gate, or abort and restore the named pre-migration state).
7. THE spec SHALL include a normative gate-registration appendix prescribing the four steps to register a new gate correctly: append a registry row, bump the count header, add to the Mandatory table if mandatory, and add the canonical decision-vocabulary token if new.

## Requirement 6: Release workflow shape and Channel Parity Checklist

**User Story:** As the owner who ships releases by hand today, I want a Release workflow with a named checklist of every channel, so that no channel is forgotten and the /reload-plugins reminder is never lost.

#### Acceptance Criteria

1. THE Release workflow SHALL follow an AUDIT-pattern template with a light variant (no adversarial review) and a heavy variant (default, with adversarial review).
2. THE spec SHALL define a versioned Channel Parity Checklist artifact enumerating every known release channel and the nine lockstep surfaces.
3. WHEN a Release run reaches close, THE CHANNEL_PARITY gate SHALL verify every Channel Parity Checklist row is satisfied.
4. THE Channel Parity Checklist SHALL be a versioned appendix in the spec so that adding a new channel is a documented edit rather than tribal knowledge.

## Requirement 7: Paperclip mirror per strong-gap workflow

**User Story:** As an operator running the plugin inside Paperclip, I want each strong-gap workflow to have a documentation-only server-side mirror, so that the new workflows are usable in Paperclip without any server-side code change.

#### Acceptance Criteria

1. THE spec SHALL define, per strong-gap workflow, an additive Paperclip mirror: one workflow document, one thin wrapper command, and one catalog row.
2. THE Paperclip wrapper command for each flow SHALL follow a five-step shape: validate, classify, dry-run, confirm, execute.
3. THE spec SHALL specify the Paperclip mirror as documentation-only with zero server-side code change.

## Requirement 8: Dual-audience help stubs and phased order

**User Story:** As both owner and implementer, I want plain-language help text per new command and a stated implementation order, so that the roadmap is readable by a non-programmer and actionable in a sensible sequence.

#### Acceptance Criteria

1. THE spec SHALL include, per strong-gap workflow, a help.md stub of three to four plain-language paragraphs written in the existing `commands/help.md` register, authored in full inside this spec (the design.md "help.md stubs appendix") as a committed deliverable — not deferred to implementation.
2. THE spec SHALL record a phased implementation order across the four strong-gap workflows.
3. WHEN the roadmap names an implementation order, THE order SHALL place Refactor and Release first per the owner's stated preference.
4. THE spec SHALL note that each new command is a MINOR additive release and SHALL preserve the Iron Law throughout.

## Non-goals

- This spec implements no workflow. It writes no plugin code, runs no tests, and performs no migration.
- This spec does not modify the existing Mandatory-Gates table or Gate Registry. All gate changes are documented as future additive edits.
- This spec does not create per-workflow stub folders, a bare decision table, or any structure other than the unified document set (four normative artifacts plus a supplementary research survey) the owner chose.
