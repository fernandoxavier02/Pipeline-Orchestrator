# Spec Lifecycle Pipeline — Light (Wave 4-spec, v4.12.0)

> **Source-of-Truth contract:** `skills/spec-light/SKILL.md` is the SSOT for the workflow sequence (`sequence: [1,2,3,4,5,6]`, `gates_at: [1,2,3,4]`, `sentinel_checkpoints: [pre_1, pre_3, pre_6]`, `stop_rule_max_failures: 2`). This file is a **reflex** — team composition + step-by-step flow. If the two ever drift, SKILL.md wins; the cross-ref test in `tests/unit/spec-entry-point-and-pipelines.test.js` enforces 1:1 step and gate count parity.

## When Selected

- Type: Spec
- Pipeline variant: `spec-light`
- Trigger: `/pipeline-orchestrator:spec --light <path>` (explicit) OR Wave 3-spec auto-classifier picks `spec-light` based on small-to-medium scope (controlled risk, prefer speed with discipline; trusts spec content and skips deep content review).

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|----------------|
| 0 | task-orchestrator (Wave 3-spec) | 0a | Pre-classified type=Spec (via `/spec` entry-point), 4-signal variant detection, `spec_context.yaml` populated |
| 0 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification + spec_path resolution |
| 0 | information-gate | 0b | Verify the 5 spec artifacts (spec.json + requirements.md + design.md + tasks.md + research.md if applicable) are reachable |
| 1 | spec-format-gate | 2 | **[GATE]** 25-check Format Gate (artefatos completos, frontmatter valido, AC presentes) |
| 2 | (orchestrator inline) | 2 (TDD) | **[GATE]** TDD Scenarios — ATDD seed: 1 scenario per AC, EARS preserved + bullet normalized |
| 3 | (orchestrator inline) → executor-controller batches | 2 | **[GATE]** Implementation: TDD + Vertical Slices + adversarial loop (max 3 attempts → escalation prompt) |
| 4 | spec-post-impl-validator | 2 | **[GATE]** Post-Impl Validation: 6-axis congruence audit (AC ↔ tests ↔ code ↔ docs ↔ behavior ↔ tasks) |
| 5 | (orchestrator inline) | 2 | Confidence Dashboard — scoring math (advisory, advisory, never overrides binary gates) |
| 6 | spec-closer | 3 | Formal closure: spec.json transitions to `closed`, audit-trail finalized |
| — | sanity-checker | 3 | Build + tests proportional to MEDIA |
| — | final-adversarial-orchestrator | 3 | Independent final review (recommended, opt-in) |
| — | final-validator (Pa de Cal) | 3 | GO / CONDITIONAL / NO-GO |
| — | finishing-branch | 3 | Closeout options (commit / push+PR / keep / discard) |

### Pipeline Discipline (MANDATORY)

- **Sentinel checkpoints:** `pre_1`, `pre_3`, `pre_6` — defined in `skills/spec-light/SKILL.md` frontmatter; enforced by `.claude/hooks/sentinel-hook.cjs`.
- **TDD seed:** Step 2 (ATDD) is mandatory before Step 3 (implementation). 1 scenario per AC, EARS verbatim preserved.
- **STOP RULE:** `stop_rule_max_failures: 2` — 2 consecutive failures halt the pipeline.
- **Phase transitions:** Phase Transition Summary block emitted before every phase change (Phase 0 → 2, Phase 2 → 3).
- **Gate decisions:** Every gate trigger logged to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl` (append-only).
- **State file:** `sentinel-state.json` updated via Write before every Agent spawn.

## Step-by-Step Flow

### Step 1: Format Gate **[GATE]**
- **Agent:** `pipeline-orchestrator:executor:type-specific:spec-format-gate`
- **Input:** `spec_context.yaml` from task-orchestrator (Phase 0a) + spec_path
- **Action:** 25-check Format Gate audit (frontmatter validity, AC presence, traceability columns, version stamps)
- **Output:** Verdict `GO` / `GO-WARN` / `NO-GO` / `BLOCK` + correction list
- **Gate:** `format-gate-approval` — user confirms the verdict via `AskUserQuestion`

### Step 2: TDD Scenarios (ATDD seed) **[GATE]**
- **Agent:** orchestrator inline (no subagent dispatch)
- **Input:** `spec_context.acceptance_criteria` (sub-field of `spec_context`, populated by Step 1)
- **Action:** AC-seeded ATDD — generate 1 scenario per AC, preserve EARS verbatim, normalize bullet form, build AC-↔-scenario traceability matrix
- **Output:** ATDD scenario set + traceability matrix
- **Gate:** `tdd-scenarios-approval` — user approves the full set via `AskUserQuestion`

### Step 3: Implementation (TDD + Vertical Slices + adversarial loop) **[GATE]**
- **Agent:** orchestrator inline (drives `executor-controller` batches in proportional batch size)
- **Input:** Approved ATDD scenarios + `tasks.md` from spec
- **Action:** RED tests run + GREEN implementation per Vertical Slice; adversarial loop (security + architecture + quality) up to 3 attempts; escalation prompt every 3 attempts
- **Output:** Implementation complete, tests passing, adversarial findings resolved or escalated
- **Gate:** `adversarial-loop-checkpoint` — user picks `continue` / `escalate` / `accept-warnings` / `abort` via `AskUserQuestion`

### Step 4: Post-Impl Validation (6-axis congruence) **[GATE]**
- **Agent:** `pipeline-orchestrator:executor:type-specific:spec-post-impl-validator`
- **Input:** Final code + tests + spec artifacts
- **Action:** 6-axis congruence audit — AC ↔ tests, tests ↔ code, code ↔ docs, docs ↔ behavior, behavior ↔ tasks, tasks ↔ AC
- **Output:** Decision `PASS` / `PASS_WITH_WARNINGS` / `FAIL` + remediation plan if needed
- **Gate:** `post-impl-validation` — user approves the decision via `AskUserQuestion`

### Step 5: Confidence Dashboard
- **Agent:** orchestrator inline (scoring math)
- **Input:** All prior step outcomes + gate-decisions.jsonl
- **Action:** Compute advisory confidence score across format / content / TDD / adversarial / post-impl axes
- **Output:** `confidence-score.yaml` written to PIPELINE_DOC_PATH

### Step 6: Closure
- **Agent:** `pipeline-orchestrator:executor:spec-closer`
- **Input:** All prior outputs + final adversarial verdict
- **Action:** Transition `spec.json.phase` to `closed`, finalize audit-trail, write closure log
- **Output:** Spec formally closed; pipeline hands off to Phase 3 (sanity / Pa de Cal / finishing-branch)

## Batch Configuration

- Tasks per batch: 2-3 (MEDIA proportional)
- Adversarial intensity: proportional set (security + input-validation + error-handling baseline; +data-model / +auth if domains_touched include them)
- Checkpoint: build + tests after each batch

## Success Criteria

- Format Gate: GO or GO-WARN (NO-GO blocks the pipeline)
- ATDD: every AC has at least one scenario; EARS preserved
- Implementation: all RED tests now GREEN; adversarial loop closed (no unresolved BLOCKER)
- Post-Impl: PASS or PASS_WITH_WARNINGS
- spec.json: `phase: closed` after Step 6

## Escalation

- If Format Gate verdict is `BLOCK` or repeated `NO-GO` (>2 attempts) → user-facing remediation prompt, no auto-fix
- If implementation needs content review (domain conflicts, contract gaps surfacing during build) → escalate to `spec-heavy` in a separate cycle
- If 3 adversarial fix attempts fail → STOP RULE triggers, propose alternatives via `AskUserQuestion`

---

### Type-Specific Agent Team

**Team:** Spec Lifecycle Light
**Mode:** code-changing (TDD + implementation)
**Backing skill:** `pipeline-orchestrator:spec-light` — invoked via `Skill(skill: "pipeline-orchestrator:spec-light")` from the `/spec --light` entry-point or by `pipeline-controller` when the Wave 3-spec classifier picks `pipeline_variant: spec-light`.

**Agents (execution order):**
1. spec-format-gate — 25-check Format Gate (Step 1)
2. spec-post-impl-validator — 6-axis congruence (Step 4)
3. spec-closer — formal closure (Step 6)

**Reused executor agents (Phase 2 batches):** `executor-controller`, `executor-implementer-task`, `executor-spec-reviewer`, `executor-quality-reviewer`, `executor-fix`, plus the parallel adversarial trio (`adversarial-security-scanner`, `adversarial-architecture-critic`, `adversarial-quality-reviewer`) inside Step 3's adversarial loop.

**Note:** spec-content-reviewer is SKIPPED in Light (deep content review is owned by spec-heavy). If domain or contract concerns surface during Step 3, escalate to `spec-heavy` in a separate cycle rather than retrofitting content review here.
