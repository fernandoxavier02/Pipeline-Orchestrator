---
step_number: 6
step_name: "persistence-quick-check"
execution_mode: subagent
agent_type: "general-purpose"
expected_inputs:
  - fix_diff: from_step_4
  - invariants: from_step_3
  - regression_test_path: from_step_5
expected_outputs:
  - persistence_relevant: "yes | no"
  - persistence_stable: bool
  - side_effects_detected: list
  - duplication_risk: "low | medium | high"
  - recommendation: string
expected_next: 7
gate_required: false
allowed_tools: [Bash, Read, Grep, Glob]
---

# Step 06 — Persistence Quick Check — GAP CLOSED (was ABSENT)

## Objective

Detect side effects of the fix on persistent state (database rows, key/value stores, file caches, browser localStorage, session state, etc.). This step has **no v4.3.1 plugin equivalent** — it is the explicit gap closure for Light 6 from spec §21.1.

## When this step is non-trivial

This step is non-trivial whenever the fix touches:

- Database writes / reads.
- Key/value caches (Redis, Memcached).
- File-system caches or persisted artifacts.
- Browser-side persistence (localStorage, sessionStorage, IndexedDB).
- In-memory caches that survive across requests.
- Any of the invariants from step 3 mention persistence, idempotency, atomicity, or "must not duplicate."

If NONE of the above apply, the step short-circuits: set `persistence_relevant: no` and proceed to step 7 immediately (still record the assessment in the output).

## Why subagent

A `general-purpose` subagent runs the rerun protocol and inspects state without polluting main context.

## Inputs

- `fix_diff` (from step 4) — files changed.
- `invariants` (from step 3) — particularly any persistence / idempotency invariants.
- `regression_test_path` (from step 5) — for re-running the fixed scenario.

## Instructions

### 6.1 Triage — does the fix touch persistence?

Inspect `fix_diff` files:

```bash
grep -E "INSERT|UPDATE|DELETE|save|persist|cache|localStorage|sessionStorage|writeFile|setItem|setCache|atomic|transaction" <fix_diff files>
```

Also check whether any invariant from step 3 mentions persistence, idempotency, "no duplicate," "atomic," or similar. If neither inspection nor invariants surface persistence concerns, set `persistence_relevant: no`, fill outputs accordingly, and proceed.

### 6.2 Rerun-twice protocol (state-stability check)

If `persistence_relevant: yes`, run the fixed scenario at least TWICE in succession with the SAME inputs:

1. **First run**: execute the regression test (or manual reproduction). Capture the resulting persistent state — e.g., DB row IDs and content, cache entries, localStorage keys.
2. **Second run** (immediately after): execute the SAME scenario with the SAME inputs.
3. **Compare states**:
   - Does the persisted state diverge between runs (e.g. duplicated rows, drifting cache entries, stale data)?
   - Is the user-visible outcome identical on both runs?
   - Was a side effect produced on the second run that was unexpected (extra notification, double-charge, redundant write)?

```bash
# Example pattern; adapt to project
<run regression test once>; <inspect state>
<run regression test again>; <inspect state>
<diff states>
```

State must be **stable** — running the same scenario twice MUST NOT produce divergent persisted outcomes (idempotency).

### 6.3 Side-effects detection

Enumerate ALL detected side effects on the second run:

- Duplicated records.
- Cache entries growing without bound.
- Stale state leaking across runs.
- External notifications fired twice (email / webhook / push).
- Counters incremented twice.

If any side effect is non-zero, set `persistence_stable: false` and record under `side_effects_detected`. This is a STOP signal — the fix has an idempotency / persistence regression and step 7 (Complexity Gate) should escalate to bugfix-heavy.

### 6.4 Duplication risk classification

Independent of detection: rate the risk that a future user retry / double-click / job re-execution could cause duplication or inconsistent state given the fix in place. Pick one: `low | medium | high`.

If `high`, surface it as a residual risk in step 7 — even if `persistence_stable: true` empirically, "high duplication risk" warrants stronger guards (often only available in bugfix-heavy via the Domain Truth Model step).

## Done criteria

- `persistence_relevant` decided yes/no with one-line justification.
- If yes: rerun-twice protocol executed; state stability checked; side effects enumerated (possibly empty).
- Duplication risk classified.
- Recommendation recorded — proceed to step 7, or escalate to bugfix-heavy.

## Outputs (handoff to step 7)

```yaml
persistence_relevant: <yes | no>
persistence_stable: <true | false>
side_effects_detected:
  - <side effect 1 or empty>
duplication_risk: <low | medium | high>
recommendation: "<proceed | escalate-to-heavy with reason>"
```

## Why this step matters (gap closure rationale)

Plugin v4.3.1 had **no agent or step** for persistence quick checks (Light 6 🔴 AUSENTE in spec §21.1). The classic failure mode this step prevents: a small fix passes its unit tests but the persisted state silently drifts under repeated execution (double-charge on retry, duplicated records on double-click, cache poisoning under concurrency). Catching that here — before step 7's complexity gate and step 8's Pa de Cal — costs minutes; catching it post-deploy can cost incidents.

## Next

Proceed to `steps/07-complexity-gate.md` (AskUserQuestion gate — should this remain light or escalate?).
