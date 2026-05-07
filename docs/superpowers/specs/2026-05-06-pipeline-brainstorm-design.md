# /pipeline-orchestrator:brainstorm — pre-execution preparation pipeline (Kiro-clone integrated)

**Status:** DRAFT v2 (design — full reformulation 2026-05-06)
**Author:** brainstorming session 2026-05-06
**Target plugin version:** 5.1.0
**Spec location:** `docs/superpowers/specs/2026-05-06-pipeline-brainstorm-design.md`
**Supersedes:** v1 of this spec (file overwritten — single-source-of-truth, no parallel versions)

---

## Problem

The pipeline-orchestrator plugin today depends on **external Kiro skills** (`kiro-spec-init`, `kiro-spec-requirements`, `kiro-spec-design`, `kiro-spec-tasks`, etc.) for the spec authoring lifecycle. The internal `spec-light/spec-heavy/spec-audit-only` workflows are *consumers* of `.kiro/specs/<feature>/` artifacts; they do not produce them.

This creates four issues:

1. **Portability**: users without Kiro skills installed cannot use the plugin's spec workflows. The plugin is not self-sufficient.
2. **No exploratory brainstorming**: nothing in the plugin helps the user *decide what to build* before formal spec generation. Phase 0 has gap detection (`information-gate`) and design interrogation (`design-interrogator`), but no open-ended brainstorming.
3. **Documentation fragmentation**: spec artifacts live in `.kiro/specs/`, run state in `.pipeline/docs/`, audit trail in `.pipeline/docs/.../gate-decisions.jsonl`. There is no single per-execution folder that tells the full story (intake → spec → batches → reviews → final report).
4. **Inconsistency by complexity**: today only `Spec` typed tasks go through the Kiro lifecycle. A `Feature` or `Bug Fix` of MEDIA/COMPLEXA complexity bypasses the discipline of EARS requirements + reviewed design + traceable tasks.

The user wants:

- A new entry command `/pipeline-orchestrator:brainstorm` that opens **always** with an exploratory brainstorming phase.
- **Eight new skills cloned from Kiro** living inside the plugin, so the plugin is self-sufficient.
- For every task classified as **MEDIA**, **COMPLEXA**, or **type=Spec**, this lifecycle runs **mandatorily** — SIMPLES is the only exception.
- All artifacts of one execution live together in a numbered, sub-foldered, named directory at the repository root: `pipeline-runs/<NNN>-<slug>/`.
- Existing `spec-light/heavy/audit-only` workflows are repointed at the new internal skills (no more dependency on external Kiro).

## Non-goals

- Does NOT modify the original Kiro skills in `~/.claude/skills/kiro-*`. Those keep working untouched for users who use them outside the plugin.
- Does NOT implement code-changing logic. Brainstorming + spec lifecycle output is markdown + json + yaml only. Implementation continues to live in `spec-light/heavy/audit-only` and downstream agents.
- Does NOT auto-detect when a task should run brainstorming. The brainstorming phase runs whenever `/pipeline-orchestrator:brainstorm` is invoked OR whenever `/pipeline-orchestrator:pipeline` classifies the task as MEDIA/COMPLEXA/Spec (mandatory for those).
- Does NOT preserve `.kiro/specs/<feature>/` paths. The plugin uses its own per-run directory exclusively.
- Does NOT introduce a multi-user/collaborative mode. Single user per run.

## Architecture overview

```
[user] /pipeline-orchestrator:brainstorm "idea X"
   ↓
+--------------------------------+
| Phase 0 — Brainstorming        |
|   step-00-intake               |
|   step-01-explore              |
+--------------------------------+
   ↓
+--------------------------------+
| Phase 1 — Spec lifecycle       |
|   (Kiro-clone, internal)       |
|   step-02-spec-init            |
|   step-03-spec-requirements    |
|   step-04-validate-gap (cond.) |
|   step-05-spec-design          |
|   step-06-validate-design      |
|   step-07-spec-tasks           |
+--------------------------------+
   ↓
+--------------------------------+
| Phase 2 — Handoff              |
|   step-08-handoff              |
|     "run pipeline now / stop?" |
+--------------------------------+
   ↓                  ↓
   stop          run /pipeline-orchestrator:pipeline
                       ↓ (consumes artifacts in 01-spec/)
                       Phase 3+ of pipeline-controller
                       (existing executor + per-batch
                        adversarial loop + Pa de Cal)
                       uses pipeline-orchestrator:review
                       and pipeline-orchestrator:verify-completion
                       cloned skills inside batches
```

The `/pipeline-orchestrator:pipeline` entry command also gains a new branch: when classification yields MEDIA/COMPLEXA/Spec **and** no existing prep run is referenced, it auto-invokes Phase 0+1 above before continuing. SIMPLES bypasses entirely.

## Components

### 1. Eight new skills (cloned from Kiro, refitted to plugin)

All live under `skills/` in the plugin. Each is a fresh SKILL.md derived from the corresponding Kiro skill. Naming uses the plugin's existing prefix convention.

| Plugin skill (new) | Cloned from | Purpose |
|---|---|---|
| `pipeline-orchestrator:spec-init` | `kiro-spec-init` | Generate run slug, write `manifest.yaml` + `01-spec/spec.json` + `01-spec/requirements.md` placeholder |
| `pipeline-orchestrator:spec-requirements` | `kiro-spec-requirements` | Fill `01-spec/requirements.md` with EARS-format ACs + review-gate |
| `pipeline-orchestrator:spec-design` | `kiro-spec-design` | Generate `01-spec/design.md` + `01-spec/research.md` (full or light discovery) |
| `pipeline-orchestrator:spec-tasks` | `kiro-spec-tasks` | Generate `01-spec/tasks.md` with `(P)` markers + boundary annotations |
| `pipeline-orchestrator:validate-gap` | `kiro-validate-gap` | Brownfield gap analysis between requirements and existing codebase. Output: `02-validations/validate-gap.md` |
| `pipeline-orchestrator:validate-design` | `kiro-validate-design` | Interactive design quality review with GO/NO-GO. Output: `02-validations/validate-design.md` |
| `pipeline-orchestrator:review` | `kiro-review` | Per-task adversarial review against approved spec. Used inside batches. Output: `03-execution/batch-NNN/review.md` |
| `pipeline-orchestrator:verify-completion` | `kiro-verify-completion` | Verify completion claims with fresh evidence. Used at end of execution. Output: `03-execution/verify-completion.md` |

**Cloning rules (applied to every clone):**

- Frontmatter `name:` field renamed to the plugin namespace.
- All references to `.kiro/specs/<feature>/` rewritten to point at the per-run directory `pipeline-runs/<NNN>-<slug>/01-spec/`.
- All references to other Kiro slash commands (`/kiro-spec-design`, `/kiro-validate-gap`, etc.) rewritten to internal counterparts (`/pipeline-orchestrator:spec-design`, `/pipeline-orchestrator:validate-gap`, etc.).
- Shared rule files in each skill's `rules/` subfolder copied verbatim (no logic change). Path references inside rules updated when they touch `.kiro/...`.
- Templates (e.g., `requirements-init.md`, `design.md`, `tasks.md`) copied into a new internal location: `references/spec-templates/` inside the plugin, replacing the dependency on `.kiro/settings/templates/specs/`.
- Each clone's frontmatter adds `disable-model-invocation: true` (consistent with the existing `spec-light/heavy/audit-only` pattern — these skills are dispatched by an orchestrator, not invoked freely by the model).

### 2. New entry command — `/pipeline-orchestrator:brainstorm`

Lives at `commands/brainstorm.md`. Accepts free-text input. Optional flags:

- `--resume <slug>` — resume a partial run from `manifest.yaml`
- `--type <Feature|Bug Fix|Audit|User Story|UX Simulation|Spec>` — pre-classify, skip type detection
- `--no-impl` — stop after Phase 1 (spec lifecycle), do not offer handoff
- `--skip-validate-gap` — for greenfield projects, skip the brownfield gap analysis

Dispatches to the new `brainstorm-controller` N1 agent.

### 3. New N1 agent — `brainstorm-controller`

Lives at `agents/core/brainstorm-controller.md`. Same N1 pattern as `pipeline-controller` (isolated subagent context, write whitelist on `pipeline-runs/**`, controller-only writes to `manifest.yaml`).

Responsibilities:

- Allocate run number (next available `NNN`) + slug (LLM-generated from prompt)
- Create `pipeline-runs/<NNN>-<slug>/` and subfolders
- Sequence the 9 steps (00 through 08)
- Persist `manifest.yaml` after each step
- Hand off to `pipeline-controller` at step-08 if user chooses run-now

Tools allowed: `Read`, `Write` (within `pipeline-runs/**`), `Glob`, `Grep`, `Agent`, `AskUserQuestion`, `Bash` (for git context).

### 4. Two brainstorming step agents (Phase 0)

Live at `agents/brainstorm/`:

- `step-00-intake.md` — captures prompt + git state + candidate files
- `step-01-explore.md` — runs the open brainstorming with the generic 7-question template (goal, audience, boundary, risk, constraint, reference, done check)

These two are NOT in the Kiro family — they are new, plugin-native, and serve to convert "vague idea" into "concrete prompt suitable for spec-init".

### 5. Pipeline-controller integration (existing N1 agent, modified)

`agents/core/pipeline-controller.md` gains a new step in its early flow:

```
STEP 1.7: PRE-EXECUTION ROUTING (new)
  IF complexity ∈ {MEDIA, COMPLEXA} OR type == Spec:
    IF arguments contain PREP_RUN_ID=<slug>:
      // user already ran brainstorm; load artifacts from pipeline-runs/<slug>/
      load manifest.yaml + 01-spec/* into pipeline context
      proceed to existing flow (Phase 1 proposal etc.)
    ELSE:
      // mandatory pre-execution
      dispatch /pipeline-orchestrator:brainstorm with the user's task text
      wait for handoff → resume here with PREP_RUN_ID set
  ELSE (SIMPLES):
    proceed to existing flow unchanged
```

This is the **mandatory enforcement** rule. SIMPLES tasks keep the current shortest path; everything else gets the full lifecycle.

### 6. Spec-light / spec-heavy / spec-audit-only repointed

Three SKILL.md files updated:

- `skills/spec-light/SKILL.md`
- `skills/spec-heavy/SKILL.md`
- `skills/spec-audit-only/SKILL.md`

In all three, every reference to `.kiro/specs/<feature>/` is rewritten to the new per-run path. The behavior of the workflows is unchanged — only the input path. The four artifacts they read (`spec.json`, `requirements.md`, `design.md`, `tasks.md`, `research.md`) are now produced by the internal `pipeline-orchestrator:spec-*` clones and live at `pipeline-runs/<NNN>-<slug>/01-spec/`.

### 7. Edit-guard hook update

`hooks/edit-guard-hook.cjs` (and the codex mirror at `.codex/hooks/force-pipeline-agents.cjs`) currently allow writes within `.pipeline/`. They must be updated to also allow writes within `pipeline-runs/`. The whitelist becomes:

- `.pipeline/**` (existing)
- `pipeline-runs/**` (new)

No other paths gain write permission.

### 8. References / templates

New folder `references/spec-templates/` at the plugin root, containing:

- `init.json` (clone of `.kiro/settings/templates/specs/init.json`)
- `requirements-init.md` (clone)
- `requirements.md` (clone)
- `design.md` (clone)
- `tasks.md` (clone)
- `research.md` (clone)

These replace external dependency on `.kiro/settings/templates/`.

## Run-dir schema

```
pipeline-runs/                         (repo root, NEW directory)
└── 001-add-share-button/              (one folder per execution)
    ├── manifest.yaml                  (operational metadata)
    ├── 00-brainstorm/                 (Phase 0 outputs)
    │   ├── 01-intake.md
    │   └── 02-explore.md
    ├── 01-spec/                       (Phase 1 outputs — Kiro-clone artifacts)
    │   ├── spec.json
    │   ├── requirements.md
    │   ├── design.md
    │   ├── research.md
    │   └── tasks.md
    ├── 02-validations/                (Phase 1 quality gates)
    │   ├── validate-gap.md
    │   └── validate-design.md
    ├── 03-execution/                  (Phase 3+ — populated when user picks run-now)
    │   ├── batch-001/
    │   │   ├── implementation.md
    │   │   ├── tests.md
    │   │   └── review.md
    │   ├── batch-002/
    │   │   └── ...
    │   ├── verify-completion.md
    │   ├── adversarial-final.md
    │   └── pa-de-cal.md
    ├── 04-final-report.md             (1-pager consolidator, generated at end)
    └── attachments/                   (optional)
```

**Numbering rules:**
- Top-level `<NNN>` is monotonic per repo; `001` is the first run, `002` the second, etc.
- Slug is generated by the LLM from the prompt (kebab-case, max 5 words). Collisions resolved by suffix `-2`, `-3`, etc.
- Inside each subfolder, files use a 2-digit prefix (`01-`, `02-`, ...) for ordering.

**`manifest.yaml`** — operational metadata, NOT part of the spec contract:

```yaml
schema_version: 1
run_id: 001-add-share-button
created_at: 2026-05-06T14:30:00Z
updated_at: 2026-05-06T15:42:00Z
status: ready  # ready | partial | cancelled | executing | completed
phase: 1  # 0 | 1 | 2 | 3
step_completed: 7  # last step that finished cleanly (0..8)
type: Feature
complexity: MEDIA
brainstorm_completed: true
spec_lifecycle_completed: true
handoff_decision: run-now  # run-now | stop | null
linked_pipeline_doc_path: ".pipeline/docs/Pre-Medium-action/2026-05-06-add-share-button/"
notes: ""
```

The `linked_pipeline_doc_path` field is the bridge: when the user chooses run-now at step-08, the existing pipeline-controller continues using its standard `PIPELINE_DOC_PATH` for sentinel state + gate decisions. The two paths coexist — `pipeline-runs/<slug>/` is the human-facing, complete documentation; `.pipeline/docs/...` is the operational state tracked by the sentinel hook.

## Step contracts (summary)

### Phase 0 — Brainstorming

#### step-00-intake

**Input:** raw user prompt + optional `--type` flag.
**Actions:** captures `git status` and `git log -5`, identifies candidate files, writes `00-brainstorm/01-intake.md` with three sections (prompt, repo state, candidate files).
**Output:** `00-brainstorm/01-intake.md`. Updates `manifest.yaml.step_completed: 0`.

#### step-01-explore

**Input:** `00-brainstorm/01-intake.md`.
**Actions:** generates 3-7 exploratory questions from the generic template (goal, audience, boundary, risk, constraint, reference, done check). Asks via `AskUserQuestion` (or prose fallback). Records every Q&A in `00-brainstorm/02-explore.md`.
**Output:** `00-brainstorm/02-explore.md`. Updates `manifest.yaml.step_completed: 1`.

### Phase 1 — Spec lifecycle (Kiro-clone)

#### step-02-spec-init

**Input:** `00-brainstorm/02-explore.md`.
**Skill:** `pipeline-orchestrator:spec-init` (clone of kiro-spec-init).
**Output:** `01-spec/spec.json` + `01-spec/requirements.md` (placeholder). Updates `manifest.yaml.step_completed: 2`.

#### step-03-spec-requirements

**Input:** `01-spec/requirements.md` (placeholder) + brainstorm artifacts.
**Skill:** `pipeline-orchestrator:spec-requirements` (clone). Includes the full EARS-format generation + 2-pass review gate from the original.
**Output:** `01-spec/requirements.md` (full, with numeric IDs and EARS ACs). Updates `manifest.yaml.step_completed: 3`.

#### step-04-validate-gap (conditional)

**Skip if** `--skip-validate-gap` flag set OR project is greenfield (no prior commits).
**Input:** `01-spec/requirements.md` + repo state.
**Skill:** `pipeline-orchestrator:validate-gap` (clone of kiro-validate-gap).
**Output:** `02-validations/validate-gap.md`. Updates `manifest.yaml.step_completed: 4`.

#### step-05-spec-design

**Input:** `01-spec/requirements.md` + `02-validations/validate-gap.md` (if present).
**Skill:** `pipeline-orchestrator:spec-design` (clone). Includes full discovery + 2-pass review gate.
**Output:** `01-spec/design.md` + `01-spec/research.md`. Updates `manifest.yaml.step_completed: 5`.

#### step-06-validate-design

**Input:** `01-spec/design.md`.
**Skill:** `pipeline-orchestrator:validate-design` (clone). Interactive GO/NO-GO review.
**Output:** `02-validations/validate-design.md` with verdict. If NO-GO, controller loops back to step-05 with feedback (max 2 attempts; if still NO-GO, status flips to `partial` and exits).
**On success:** Updates `manifest.yaml.step_completed: 6`.

#### step-07-spec-tasks

**Input:** `01-spec/requirements.md` + `01-spec/design.md`.
**Skill:** `pipeline-orchestrator:spec-tasks` (clone). Generates tasks with `(P)` markers + sanity review.
**Output:** `01-spec/tasks.md`. Updates `manifest.yaml.step_completed: 7`.

### Phase 2 — Handoff

#### step-08-handoff

**Input:** complete `01-spec/`.
**Actions:** writes `04-final-report.md` summarizing what was produced. Asks via `AskUserQuestion`: "Run /pipeline-orchestrator:pipeline now using this prep, or stop here?" Three options: `Run pipeline now`, `Stop here`, `Save and notify later (placeholder)`.

If run-now:
- Compute `linked_pipeline_doc_path = .pipeline/docs/Pre-{level}-action/<YYYY-MM-DD>-<slug>/` per existing convention.
- Spawn `pipeline-controller` with `PREP_RUN_ID=<run_id>` argument.
- pipeline-controller resumes its standard flow with phase 1.7 already satisfied (artifacts loaded from `pipeline-runs/<run_id>/01-spec/`).
- Inside Phase 2 batches, the executor uses `pipeline-orchestrator:review` and `pipeline-orchestrator:verify-completion` clones.
- Phase 2/3 outputs (`implementation.md`, `tests.md`, `review.md`, `verify-completion.md`, `adversarial-final.md`, `pa-de-cal.md`) are written to `pipeline-runs/<run_id>/03-execution/` (the run-dir keeps the full story).

If stop: writes a final note in `04-final-report.md` and exits cleanly. Status: `ready` (artifacts complete and consumable later).

## How `pipeline-orchestrator:review` and `:verify-completion` plug into existing batch loop

The existing `executor-controller` (Phase 2 of pipeline-controller) runs per-batch:

```
micro-gate → implementer → spec-review → quality-review → checkpoint-validator
```

Two insertion points:

1. **After each implementer task**, before spec-reviewer, the controller invokes `pipeline-orchestrator:review` (clone of kiro-review) for adversarial review against the approved task text + boundary constraints. Output to `03-execution/batch-NNN/review.md`. If review fails, the existing fix-loop (max 3 attempts) kicks in.
2. **At the end of Phase 3 closure**, before `final-validator` (Pa de Cal), the controller invokes `pipeline-orchestrator:verify-completion` to verify all completion claims with fresh evidence. Output to `03-execution/verify-completion.md`. The Pa de Cal verdict reads this file before issuing GO/CONDITIONAL/NO-GO.

This keeps the existing executor flow intact and adds two new quality bars.

## Data flow contract — `manifest.yaml`

The contract between Phase 1 and downstream consumers is just `manifest.yaml` + the artifacts under `01-spec/`. There is no new schema beyond what Kiro already defines:

- `01-spec/spec.json` — schema unchanged from Kiro (language, phase, approvals, metadata).
- `01-spec/requirements.md` — EARS format with numeric IDs, schema unchanged.
- `01-spec/design.md` — schema unchanged.
- `01-spec/research.md` — schema unchanged.
- `01-spec/tasks.md` — schema unchanged with `(P)` markers + `_Boundary:_` + `_Depends:_` annotations.

`manifest.yaml` is plugin-native and tracks the run lifecycle (NOT replaced by `spec.json`, which tracks Kiro spec lifecycle).

## Error handling

### User cancels mid-session

Status flipped to `cancelled` in `manifest.yaml`. `04-final-report.md` generated with the partial state. Re-running `/pipeline-orchestrator:brainstorm` creates a NEW run; resuming requires `--resume <run_id>`.

### `AskUserQuestion` unavailable

Same fallback as the v1 spec: prose-numbered options as plain text. Applies to brainstorm steps only — when control hands off to `pipeline-controller` at step-08, the standard hard policy resumes (the pipeline still requires `AskUserQuestion` for its gates).

### Validate-design returns NO-GO (step-06)

Controller loops back to step-05 with the validation feedback prepended. Maximum 2 retry attempts. After 2 failed attempts, status flips to `partial` and the run exits — the user can edit `01-spec/design.md` manually and invoke `--resume <run_id>` to continue from step-06.

### Spec gap detected during step-07 sanity review

`pipeline-orchestrator:spec-tasks` may emit `RETURN_TO_DESIGN` verdict (per kiro-spec-tasks contract). Controller treats this as step-06 NO-GO and loops back accordingly.

### Run-dir collision

Slug collision resolved by suffix (`-2`, `-3`). Run number `<NNN>` increments; collisions on the number are impossible (monotonic).

### Edit-guard violation

Any agent in this pipeline trying to write outside `pipeline-runs/<run_id>/` (or `.pipeline/` in the post-handoff Phase) gets blocked by the hook. Controller logs the attempt to `manifest.yaml.notes`, flips status to `partial`, exits.

### Pipeline-controller invoked WITHOUT prep run on MEDIA/COMPLEXA/Spec

Per the new STEP 1.7 in pipeline-controller: it auto-invokes brainstorm-controller. If the user wants to bypass (rare — emergency only), they can pass `--no-prep` flag. This flag is logged in `manifest.yaml.notes` (audit trail).

## Testing

### Unit (10 tests)

- `manifest.yaml` schema validator: accepts valid input, rejects each missing required field, rejects invalid `status`/`phase`.
- Run number allocator: increments correctly, handles concurrent runs (file lock or atomic mkdir).
- Slug generator: kebab-case, collision suffix, unicode safe.
- Cloned skill frontmatter validator: each of the 8 cloned skills has `name:` matching plugin convention, `disable-model-invocation: true`, valid `allowed-tools`.
- Reference path rewriter: `.kiro/specs/<feature>/` → `pipeline-runs/<NNN>-<slug>/01-spec/` correctly applied across all 8 clones + `spec-light/heavy/audit-only`.

### Integration (6 tests)

- Brainstorm + full lifecycle happy path: invoke `/pipeline-orchestrator:brainstorm "build a share button"`, simulate replies through 9 steps, assert run-dir tree matches the schema.
- Greenfield path: same as above with `--skip-validate-gap`, assert step-04 skipped and `02-validations/validate-gap.md` not created.
- Brownfield gap analysis path: validate-gap actually runs and produces output.
- Validate-design loop: simulate NO-GO at step-06, assert loopback to step-05, then GO on retry.
- Handoff to pipeline run-now: at step-08, simulate user picks run-now, assert `pipeline-controller` is dispatched with correct `PREP_RUN_ID`, and Phase 2/3 outputs land in `03-execution/`.
- Cancel + resume: cancel at step-04, invoke `--resume <run_id>`, assert clean continuation from step-04.
- Mandatory enforcement: invoke `/pipeline-orchestrator:pipeline "complex task"` directly without prep; assert pipeline-controller auto-invokes brainstorm-controller before continuing.

### Snapshot (2 tests)

- Run-dir tree after each phase (golden files).
- Each cloned skill's SKILL.md frontmatter (golden files) — catches accidental drift from the path-rewrite contract.

**Total new tests:** 18. Suite goes from 166 to 184.

## Documentation

- `commands/brainstorm.md` (entry command).
- `agents/core/brainstorm-controller.md`.
- `agents/brainstorm/step-00-intake.md`, `step-01-explore.md`.
- `skills/spec-init/SKILL.md`, `spec-requirements/SKILL.md`, `spec-design/SKILL.md`, `spec-tasks/SKILL.md`, `validate-design/SKILL.md`, `validate-gap/SKILL.md`, `review/SKILL.md`, `verify-completion/SKILL.md` (8 cloned skills).
- `references/spec-templates/` (6 template files).
- Updated `agents/core/pipeline-controller.md` (new STEP 1.7).
- Updated `skills/spec-light/SKILL.md`, `skills/spec-heavy/SKILL.md`, `skills/spec-audit-only/SKILL.md` (path rewrite to `pipeline-runs/<run_id>/01-spec/`).
- Updated `hooks/edit-guard-hook.cjs` + `.codex/hooks/force-pipeline-agents.cjs` (whitelist `pipeline-runs/**`).
- Updated `references/glossary.md` ("Brainstorm Phase", "Prep Run", "Run Directory", "Spec Lifecycle Internal Clone").
- New `docs/examples/brainstorm-feature.md` (full walkthrough).
- Updated `CHANGELOG.md` for v5.1.0.
- Updated `README.md` to mention the brainstorm command and the new mandatory pre-execution behavior for MEDIA/COMPLEXA/Spec.

## Out of scope (explicitly)

- Multi-user collaborative brainstorm.
- Web UI / visual companion.
- Importing prep runs from external systems (Linear, Notion, Figma).
- Modifying or extending the original Kiro skills upstream.
- Auto-detection of prompt vagueness (the brainstorming runs unconditionally for MEDIA/COMPLEXA/Spec; no heuristic gate).
- Per-type templates inside the brainstorming exploration phase. The 7-question generic template covers all types in MVP. Per-type templates can come in v2.
- A `kiro-impl` clone. The plugin uses its existing executor agents for implementation — no need to clone Kiro's implementer.
- A `kiro-debug` clone. The plugin's existing bugfix workflow handles debugging.
- Cloning auxiliary Kiro skills not in the user-approved list (`kiro-spec-status`, `kiro-spec-batch`, `kiro-spec-quick`, `kiro-discovery`, `kiro-steering`, `kiro-steering-custom`, `kiro-validate-impl`).

## Migration / rollout

- v5.1.0 introduces this feature as a major minor bump (semver: minor because of new mandatory behavior on MEDIA/COMPLEXA/Spec; not patch).
- Backward compat: existing `/pipeline-orchestrator:pipeline` calls on SIMPLES tasks behave identically. MEDIA/COMPLEXA/Spec tasks now route through brainstorm by default. The `--no-prep` escape hatch preserves the old behavior for users who need it.
- Existing `.kiro/specs/<feature>/` paths in user repos are NOT migrated. The plugin reads only from `pipeline-runs/<run_id>/01-spec/` going forward. Users with prior Kiro specs can either:
  - Copy `.kiro/specs/<feature>/` into a new `pipeline-runs/<NNN>-<slug>/01-spec/` and invoke `--resume`.
  - Or restart the lifecycle from `/pipeline-orchestrator:brainstorm`.
- `.pipeline/docs/.../sentinel-state.json` and `gate-decisions.jsonl` paths unchanged. The sentinel hook does not need updates.
- `pipeline-runs/` SHOULD be added to the user's project `.gitignore` if they don't want execution artifacts committed. The plugin will NOT auto-modify `.gitignore`. README will recommend the addition.

## Estimated effort

- Spec + design (this doc): done.
- Cloning the 8 skills (path rewrites + frontmatter): ~1.5 day. Mostly mechanical; the slow part is verifying that all internal references between skills (e.g., spec-design → validate-gap mention) are caught.
- Templates + references: ~0.5 day.
- New entry command + brainstorm-controller + 2 step agents: ~1 day.
- Pipeline-controller STEP 1.7 integration + spec-light/heavy/audit-only path rewrite: ~1 day.
- Edit-guard hook update: ~0.25 day.
- Tests (18 new): ~1.5 day.
- Docs (glossary, README, CHANGELOG, walkthrough example): ~0.75 day.

Total: ~6.5 person-days for v5.1.0 release.

## Open questions

None at this time. All design decisions closed in 2026-05-06 brainstorming session.
