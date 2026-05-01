---
step_number: 9
step_name: "ux-user-journey-e2e"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:ux-simulator"
expected_inputs:
  - fix_diff: from_step_6
  - correction_evidence: from_step_7
  - consolidated_blockers: from_step_8
expected_outputs:
  - user_story: string
  - explicit_expectation: string
  - journey_steps: list
  - technical_checkpoints: list
  - failure_scenarios: list
  - friction_points: list
  - telemetry_recommendations: list
  - ux_recommendations: list
  - post_fix_e2e_status: "PASS | FAIL | PARTIAL"
expected_next: 10
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Step 09 — UX User Journey End-to-End (POST-FIX) — GAP CLOSED

## Objective

Verify the fix as a real user would experience it, end-to-end (E2E), on mobile-first. This is **post-fix verification** — not a generic UX exercise. We are confirming that the diff from step 6, after passing the test suite (step 7) and adversarial review (step 8), actually delivers the correct experience to the user. Heavy 9 gap closure: previously this was framed as generic UX simulation. Now it is explicitly post-fix and E2E.

## Why this is post-fix (not generic UX)

The previous tier (v4.3.1) ran "UX simulation" early and abstractly. The post-fix framing means:
- The fix has already been written (step 6) and validated by tests (step 7) and adversaries (step 8).
- We now exercise the actual code path — not a hypothetical one — through the user's eyes.
- Failures here are real-deployment failures, not design speculation.

## Why subagent (ux-simulator)

The `ux-simulator` subagent walks the journey methodically, captures checkpoints, and reports back compactly. Specialized for E2E mental walkthroughs.

## Inputs

- `fix_diff` (from step 6) — to know what code path is exercised.
- `correction_evidence` (from step 7) — to anchor expected behavior.
- `consolidated_blockers` (from step 8) — to confirm none survived to user-facing layer.

## Instructions

### 9.1 User story

```
As <user role>, I want <action> so that <outcome>.
```

### 9.2 Explicit expectation (post-fix)

What the user expects to see/receive:
- immediately (within seconds)
- at completion (final state)

### 9.3 Mental journey (step by step)

Walk the journey on a mobile device (mobile-first):
- user action (tap/click)
- immediate feedback (loading, button state, multi-tap blocking)
- visible result (new content, screen, modal, scroll)
- associated controls (audio, share, save)
- error cases (network, timeout, backend failure)
- recovery (retry, clear message, consistent state)

### 9.4 Technical checkpoints (post-fix E2E verification)

For each critical journey point, define a checkpoint with replicable verification commands:

```
#### Checkpoint N: <name>

Objective: <what we verify>

Verification commands:
  grep -r "pattern" path/
  Read: file.ts (lines X-Y)

Questions to answer:
  - [ ] Does function X exist?
  - [ ] Is Y called after Z?
  - [ ] Is field W present in <persistence layer>?

Result:
  - Expected: <description>
  - Found: <description>
  - Gap: <if any>
```

Minimum E2E checkpoints:
1. **Trigger**: what initiates the flow?
2. **Notification / push** (if applicable): is it sent? when? content?
3. **UI**: does the component render? data correct? visual state right?
4. **Persistence**: was the persistence layer updated correctly?
5. **Feedback**: does the user receive visual/audible confirmation?

### 9.5 E2E test artifacts (when feasible)

If the project has E2E tooling (Playwright, RTL, Espresso, XCUITest), include or update an E2E test exercising the journey: happy path + error + retry + double-tap. The test must run against the post-fix build.

### 9.6 Validations specific to bugfix context

1. UI reflects the source of truth (no phantom content; no hidden actual content).
2. Multiple taps don't create duplicates (idempotency at the UX level).
3. Backend latency does not break UI predictability.
4. Partial failures don't leave the user stuck.
5. Friction points + telemetry to measure them.

### 9.7 Failure scenarios

For each failure mode discovered:

```
Failure A: <name>
  Symptom: <what user perceives>
  Possible causes: 1) ... 2) ...
  Diagnose: <command>
  Impact: High|Medium|Low
```

### 9.8 Telemetry recommendations

Suggest analytics events to measure each friction point:

| Event | Trigger | Properties |
|-------|---------|------------|
| `feature_triggered` | user starts action | source, timestamp |
| `feature_completed` | finished | duration_ms, success |
| `feature_error` | failure | error_type, recovery_shown |

## Done criteria

- User story + expectation captured.
- Journey walked end-to-end with checkpoints.
- Failure scenarios documented.
- Friction points + telemetry recommendations listed.
- Post-fix E2E status declared (PASS / FAIL / PARTIAL).

## Outputs (handoff to step 10)

```yaml
user_story: <text>
explicit_expectation: <text>
journey_steps:
  - action: <text>
    immediate_feedback: <text>
    visible_result: <text>
technical_checkpoints:
  - name: <text>
    expected: <text>
    found: <text>
    gap: <text or none>
failure_scenarios:
  - name: <text>
    symptom: <text>
    impact: High|Medium|Low
friction_points:
  - point: <text>
    risk: High|Medium|Low
telemetry_recommendations:
  - event: <text>
    trigger: <text>
    properties: [<list>]
ux_recommendations:
  - <text>
post_fix_e2e_status: PASS
```

## Next

Proceed to `steps/10-pa-de-cal.md` — final GO/NO-GO gate.
