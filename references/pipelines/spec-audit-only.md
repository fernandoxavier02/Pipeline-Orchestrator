# Spec Lifecycle Pipeline — Audit-Only (Wave 4-spec, v4.12.0)

> **Source-of-Truth contract:** `skills/spec-audit-only/SKILL.md` is the SSOT for the workflow sequence (`sequence: [1,2,3,4,5]`, `gates_at: [1,2,3]`, `sentinel_checkpoints: [pre_1, pre_3, pre_5]`, `stop_rule_max_failures: 2`). This file is a **reflex** — team composition + step-by-step flow. If the two ever drift, SKILL.md wins; the cross-ref test in `tests/unit/spec-entry-point-and-pipelines.test.js` enforces 1:1 step and gate count parity.

## When Selected

- Type: Spec
- Pipeline variant: `spec-audit-only`
- Trigger: `/pipeline-orchestrator:spec --audit-only <path>` (explicit) OR Wave 3-spec auto-classifier picks `spec-audit-only` based on the spec already being implemented (`spec.json.phase` is `post_impl_validation` or `closed`) and the user's intent being congruence audit, not new feature work.
- Read-only by Iron Law: no implementation steps, no production writes — only congruence corrections (spec.json updates, traceability fixes, doc alignment with shipped code).

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|----------------|
| 0 | task-orchestrator (Wave 3-spec) | 0a | Pre-classified type=Spec, classifier picks `spec-audit-only` (typically signal #4 — spec.json phase = closed or post_impl_validation) |
| 0 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification + warn if `spec.json.phase` is `open` (audit-only normally targets shipped specs) |
| 0 | information-gate | 0b | Verify the 5 spec artifacts are reachable + working tree present |
| 1 | spec-format-gate | 2 | **[GATE]** 25-check Format Gate |
| 2 | spec-content-reviewer | 2 | **[GATE]** Content Review (12 axes, full — same as Heavy) |
| 3 | (orchestrator inline) | 2 | **[GATE]** Audit Loop — parallel dispatch of adversarial-architecture-critic + adversarial-security-scanner + spec-post-impl-validator (3 subagents in one message), then consolidation + congruence fix-loop (no new feature work) |
| 4 | (orchestrator inline) | 2 | Confidence Dashboard — scoring math, advisory only |
| 5 | spec-closer | 3 | Formal closure: re-record audit verdict in `spec.json.audit_history`, finalize audit-trail |
| — | sanity-checker | 3 | Build + tests proportional (no regression suite — code is unchanged) |
| — | final-validator (Pa de Cal) | 3 | GO / CONDITIONAL / NO-GO on the audit verdict (NOT on the original implementation) |
| — | finishing-branch | 3 | Closeout options (typically commit-only — there's no PR for an audit) |

### Pipeline Discipline (MANDATORY)

- **Sentinel checkpoints:** `pre_1`, `pre_3`, `pre_5` — defined in `skills/spec-audit-only/SKILL.md` frontmatter.
- **No TDD seed:** audit-only does not implement, so ATDD is not applicable. Existing tests are inputs to the post-impl-validator, not artifacts to create.
- **No implementation:** Step 3's fix-loop is restricted to congruence corrections (spec.json updates, traceability matrix repair, documentation alignment with shipped code). New feature work is OUT OF SCOPE — escalate to `spec-light` or `spec-heavy` in a separate cycle.
- **STOP RULE:** `stop_rule_max_failures: 2` — audit-only is shorter than Heavy and tolerates less consecutive churn.
- **Phase transitions:** Phase Transition Summary block emitted before every phase change.
- **Gate decisions:** Logged to `gate-decisions.jsonl` (append-only).

## Step-by-Step Flow

### Step 1: Format Gate **[GATE]**
- **Agent:** `pipeline-orchestrator:executor:type-specific:spec-format-gate`
- **Input:** `spec_context.yaml` from task-orchestrator + spec_path
- **Action:** 25-check Format Gate audit (especially: `spec.json.phase` should be `post_impl_validation` or `closed`; `open` triggers a warn)
- **Output:** Verdict `GO` / `GO-WARN` / `NO-GO` / `BLOCK` + correction list
- **Gate:** `format-gate-approval`

### Step 2: Content Review (12 axes, full) **[GATE]**
- **Agent:** `pipeline-orchestrator:executor:type-specific:spec-content-reviewer`
- **Input:** Spec artifacts + Format Gate verdict + working tree (for cross-reference)
- **Action:** Full 12-axis content review — same as Heavy Step 2; here the focus is congruence between what the spec describes and what the code delivers
- **Output:** Verdict + mandatory corrections list (limited to congruence fixes, no new feature scope)
- **Gate:** `content-review-approval`

### Step 3: Audit Loop **[GATE]**
- **Agent:** orchestrator inline (dispatches 3 subagents in PARALLEL in a single message)
  - `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic`
  - `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner`
  - `pipeline-orchestrator:executor:type-specific:spec-post-impl-validator`
- **Input:** Final shipped code (immutable) + spec artifacts + content-review corrections
- **Action:** Parallel audit of the same immutable code — no agent modifies another's findings. After collection, orchestrator inline consolidates findings and runs a congruence fix-loop (correct spec.json, repair traceability, align docs — NEVER add new feature code).
- **Output:** Consolidated audit verdict + applied congruence corrections
- **Gate:** `adversarial-loop-checkpoint` — user picks `continue` / `escalate` / `accept-warnings` / `abort`

### Step 4: Confidence Dashboard
- **Agent:** orchestrator inline
- **Input:** All prior step outcomes + parallel audit findings
- **Action:** Compute advisory confidence score across format / content / architecture / security / post-impl axes
- **Output:** `confidence-score.yaml` written to PIPELINE_DOC_PATH

### Step 5: Closure
- **Agent:** `pipeline-orchestrator:executor:spec-closer`
- **Input:** All prior outputs + final audit verdict
- **Action:** Append audit verdict + corrections summary to `spec.json.audit_history` (additive — does NOT regress `phase`); finalize audit-trail; write closure log
- **Output:** Spec audit formally recorded; pipeline hands off to Phase 3

## Batch Configuration

- No batches — Step 3 is a single parallel-dispatch + fix-loop unit
- Adversarial intensity: full set (architecture + security + post-impl in parallel)
- Checkpoint: not applicable (no code changes, only doc/spec.json updates)

## Success Criteria

- Format Gate: GO or GO-WARN
- Content Review: no unresolved BLOCKER findings (excluding new-feature scope, which is out of bounds)
- Audit Loop: all 3 audits returned, findings consolidated, congruence corrections applied or accepted as warnings
- spec.json: `audit_history` entry appended with verdict + timestamp + corrections list
- No production writes outside `.kiro/specs/<feature>/` and `spec.json` (Iron Law: read-only on shipped code)

## Escalation

- If audit reveals gaps that require new feature work → escalate to `spec-light` or `spec-heavy` in a separate cycle (this pipeline is read-only by design)
- If Format Gate or Content Review yields BLOCKER findings rejected by user → STOP and document; user decides whether to spawn a remediation cycle
- If 2 consecutive failures in Step 3's fix-loop → STOP RULE triggers, propose alternatives via `AskUserQuestion`
- If `spec.json.phase` is `open` → warn-only at Step 1; user can proceed or pause to first close the spec via `spec-light` / `spec-heavy`

---

### Type-Specific Agent Team

**Team:** Spec Lifecycle Audit-Only
**Mode:** report-only (no production writes outside spec artifacts)
**Backing skill:** `pipeline-orchestrator:spec-audit-only` — invoked via `Skill(skill: "pipeline-orchestrator:spec-audit-only")` from the `/spec --audit-only` entry-point or by `pipeline-controller` when the Wave 3-spec classifier picks `pipeline_variant: spec-audit-only`.

**Agents (execution order):**
1. spec-format-gate — 25-check Format Gate (Step 1)
2. spec-content-reviewer — 12-axis content review (Step 2)
3. adversarial-architecture-critic + adversarial-security-scanner + spec-post-impl-validator — parallel audit (Step 3)
4. spec-closer — audit verdict closure (Step 5)

**Reused executor agents:** None (audit-only never dispatches `executor-controller` or `executor-implementer-task`). The orchestrator-inline fix-loop in Step 3 only touches `.kiro/specs/<feature>/` and `spec.json` — production code is read-only.

**Note:** Step 3 collapses three concerns (parallel dispatch + consolidation + fix-loop + commit policy) into a single inline step intentionally — separating them would over-engineer the 5-step audit-only pipeline. See `skills/spec-audit-only/SKILL.md` for the design rationale.
