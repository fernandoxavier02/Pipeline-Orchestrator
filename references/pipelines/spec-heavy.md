# Spec Lifecycle Pipeline — Heavy (Wave 4-spec, v4.12.0)

> **Source-of-Truth contract:** `skills/spec-heavy/SKILL.md` is the SSOT for the workflow sequence (`sequence: [1,2,3,4,5,6,7,8,9]`, `gates_at: [1,2,3,4,5]`, `sentinel_checkpoints: [pre_1, pre_3, pre_5, pre_9]`, `stop_rule_max_failures: 3`). This file is a **reflex** — team composition + step-by-step flow. If the two ever drift, SKILL.md wins; the cross-ref test in `tests/unit/spec-entry-point-and-pipelines.test.js` enforces 1:1 step and gate count parity.

## When Selected

- Type: Spec
- Pipeline variant: `spec-heavy`
- Trigger: `/pipeline-orchestrator:spec --heavy <path>` (explicit) OR Wave 3-spec auto-classifier picks `spec-heavy` based on relevant impact (domain rico, dados sensíveis, contratos expostos, integrações externas, múltiplos fluxos, jobs, mobile) or when maximum predictability is desired before implementation.

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|----------------|
| 0 | task-orchestrator (Wave 3-spec) | 0a | Pre-classified type=Spec, 4-signal variant detection picks `spec-heavy`, `spec_context.yaml` populated |
| 0 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification + spec_path resolution |
| 0 | information-gate | 0b | Verify the 5 spec artifacts (spec.json + requirements.md + design.md + tasks.md + research.md if applicable) are reachable |
| 1 | spec-format-gate | 2 | **[GATE]** 25-check Format Gate |
| 2 | spec-content-reviewer | 2 | **[GATE]** Content Review (12 axes, full): domain alignment, AC quality, contract completeness, data-model integrity, traceability, risk surface, edge-case coverage, idempotency, error semantics, observability, rollback plan, deprecation strategy |
| 3 | (orchestrator inline) | 2 (TDD) | **[GATE]** TDD Scenarios — ATDD seed: 1 scenario per AC, EARS preserved + bullet normalized |
| 4 | (orchestrator inline) → executor-controller batches | 2 | **[GATE]** Implementation: TDD + Vertical Slices + adversarial loop (max 3 attempts, escalation prompt) |
| 5 | spec-post-impl-validator | 2 | **[GATE]** Post-Impl Validation: 6-axis congruence audit |
| 6 | adversarial-architecture-critic | 2 | Architecture audit — SOLID / DRY / YAGNI / SSOT / code-smells, sequential after Step 5 (independent of code that's already immutable post-Step 4) |
| 7 | adversarial-security-scanner | 2 | Security review — 8-axis red-team (auth, authz, injection, deserialization, secrets, transport, crypto, supply-chain), sequential after Step 6 |
| 8 | (orchestrator inline) | 2 | Confidence Dashboard — scoring math, advisory only |
| 9 | spec-closer | 3 | Formal closure: spec.json transitions to `closed`, audit-trail finalized |
| — | sanity-checker | 3 | Build + tests + regression suite (COMPLEXA proportional) |
| — | final-adversarial-orchestrator | 3 | Independent final review (strongly recommended) |
| — | final-validator (Pa de Cal) | 3 | GO / CONDITIONAL / NO-GO |
| — | finishing-branch | 3 | Closeout options |

### Pipeline Discipline (MANDATORY)

- **Sentinel checkpoints:** `pre_1`, `pre_3`, `pre_5`, `pre_9` — defined in `skills/spec-heavy/SKILL.md` frontmatter.
- **TDD seed:** Step 3 (ATDD) is mandatory before Step 4 (implementation), and gated by Steps 1 + 2 (Format Gate + Content Review).
- **STOP RULE:** `stop_rule_max_failures: 3` — Heavy tolerates more retry-partial churn than Light because the pipeline is longer.
- **Phase transitions:** Phase Transition Summary block emitted before every phase change.
- **Gate decisions:** Logged to `gate-decisions.jsonl` (append-only).
- **State file:** `sentinel-state.json` updated before every Agent spawn.

## Step-by-Step Flow

### Step 1: Format Gate **[GATE]**
- **Agent:** `pipeline-orchestrator:executor:type-specific:spec-format-gate`
- **Input:** `spec_context.yaml` from task-orchestrator + spec_path
- **Action:** 25-check Format Gate audit
- **Output:** Verdict `GO` / `GO-WARN` / `NO-GO` / `BLOCK` + correction list
- **Gate:** `format-gate-approval`

### Step 2: Content Review (12 axes, full) **[GATE]**
- **Agent:** `pipeline-orchestrator:executor:type-specific:spec-content-reviewer`
- **Input:** Spec artifacts + Format Gate verdict
- **Action:** Full 12-axis content review (domain, AC quality, contracts, data-model, traceability, risk, edge cases, idempotency, errors, observability, rollback, deprecation)
- **Output:** Verdict + mandatory corrections list (BLOCKER findings must be addressed before Step 3)
- **Gate:** `content-review-approval`

### Step 3: TDD Scenarios (ATDD seed) **[GATE]**
- **Agent:** orchestrator inline
- **Input:** `spec_context.acceptance_criteria` + content-reviewer corrections (if any)
- **Action:** AC-seeded ATDD — 1 scenario per AC, EARS preserved, traceability matrix built
- **Output:** ATDD scenario set + AC-↔-scenario traceability
- **Gate:** `tdd-scenarios-approval`

### Step 4: Implementation (TDD + Vertical Slices + adversarial loop) **[GATE]**
- **Agent:** orchestrator inline (drives `executor-controller` batches; COMPLEXA → 1 task per batch)
- **Input:** Approved ATDD scenarios + `tasks.md`
- **Action:** RED → GREEN per Vertical Slice; adversarial loop up to 3 attempts; escalation prompt every 3 attempts
- **Output:** Implementation complete, tests GREEN, adversarial findings resolved or escalated
- **Gate:** `adversarial-loop-checkpoint`

### Step 5: Post-Impl Validation (6-axis congruence) **[GATE]**
- **Agent:** `pipeline-orchestrator:executor:type-specific:spec-post-impl-validator`
- **Input:** Final code + tests + spec artifacts (immutable from Step 4 forward)
- **Action:** 6-axis congruence audit
- **Output:** Decision `PASS` / `PASS_WITH_WARNINGS` / `FAIL` + remediation plan
- **Gate:** `post-impl-validation`

### Step 6: Architecture Audit
- **Agent:** `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic`
- **Input:** Final immutable code (same artifact Steps 5+7 audit)
- **Action:** SOLID / DRY / YAGNI / SSOT audit, code-smell catalog, coupling/cohesion review
- **Output:** Architecture findings (advisory; consolidated into Step 8 dashboard)

### Step 7: Security Review
- **Agent:** `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner`
- **Input:** Final immutable code
- **Action:** 8-axis red-team — auth, authz, injection, deserialization, secrets, transport, crypto, supply-chain
- **Output:** Security findings (advisory; consolidated into Step 8 dashboard)

### Step 8: Confidence Dashboard
- **Agent:** orchestrator inline
- **Input:** All prior step outcomes + Steps 5/6/7 audits + gate-decisions.jsonl
- **Action:** Compute advisory confidence score across format / content / TDD / adversarial / post-impl / architecture / security axes
- **Output:** `confidence-score.yaml` written to PIPELINE_DOC_PATH

### Step 9: Closure
- **Agent:** `pipeline-orchestrator:executor:spec-closer`
- **Input:** All prior outputs + final consolidated verdict
- **Action:** Transition `spec.json.phase` to `closed`, finalize audit-trail, write closure log
- **Output:** Spec formally closed; pipeline hands off to Phase 3

## Batch Configuration

- Tasks per batch: 1 (COMPLEXA proportional — maximum control)
- Adversarial intensity: full set (security + architecture + quality + auth + crypto + data-model + payment as applicable)
- Checkpoint: build + tests + regression suite after each batch

## Success Criteria

- Format Gate: GO or GO-WARN
- Content Review: no unresolved BLOCKER findings
- ATDD: every AC has at least one scenario; EARS preserved
- Implementation: all RED tests GREEN; adversarial loop closed
- Post-Impl: PASS or PASS_WITH_WARNINGS
- Architecture audit: no critical SOLID/SSOT violations introduced
- Security review: no critical vulnerabilities
- spec.json: `phase: closed` after Step 9

## Escalation

- If Content Review yields BLOCKER findings rejected by user → return to spec writing (out of pipeline scope)
- If 3 adversarial fix attempts fail in Step 4 → STOP RULE, propose alternatives via `AskUserQuestion`
- If architecture audit (Step 6) reveals critical drift → recommend a follow-up refactor cycle (separate spec)
- If security review (Step 7) reveals critical vulnerabilities → BLOCK closure; require remediation cycle before Step 9

---

### Type-Specific Agent Team

**Team:** Spec Lifecycle Heavy
**Mode:** code-changing (TDD + implementation + parallel audits)
**Backing skill:** `pipeline-orchestrator:spec-heavy` — invoked via `Skill(skill: "pipeline-orchestrator:spec-heavy")` from the `/spec --heavy` entry-point or by `pipeline-controller` when the Wave 3-spec classifier picks `pipeline_variant: spec-heavy`.

**Agents (execution order):**
1. spec-format-gate — 25-check Format Gate (Step 1)
2. spec-content-reviewer — 12-axis content review (Step 2)
3. spec-post-impl-validator — 6-axis congruence (Step 5)
4. adversarial-architecture-critic — architecture audit (Step 6)
5. adversarial-security-scanner — security review (Step 7)
6. spec-closer — formal closure (Step 9)

**Reused executor agents (Phase 2 batches):** `executor-controller`, `executor-implementer-task`, `executor-spec-reviewer`, `executor-quality-reviewer`, `executor-fix`, plus the parallel adversarial trio inside Step 4's adversarial loop.

**Note:** Steps 5 / 6 / 7 audit the same immutable code delivered at the end of Step 4 — they do not modify each other's findings. Sequential dispatch (5 → 6 → 7 → 8) is enforced by `expected_next` and the sentinel hook.
