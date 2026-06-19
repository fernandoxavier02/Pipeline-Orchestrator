---
step_number: 11
step_name: "final-validation-after-all"
execution_mode: subagent
agent_type: "general-purpose"
expected_inputs:
  - go_no_go: from_step_10
  - refactor_diff: from_step_5
  - characterization_test_files: from_step_3
  - before_snapshot: from_step_3
  - change_contract: from_step_4
expected_outputs:
  - artifacts_intact: boolean
  - commits_made: list
  - branch_clean: boolean
  - cold_checkout_characterization_status: "IDENTICAL | DIVERGED | FAILING"
  - audit_log_present: boolean
  - sweep_status: "GREEN | YELLOW | RED"
  - sweep_notes: list
expected_next: null
gate_required: false
allowed_tools: [Bash, Read, Grep, Glob]
---

# Step 11 — Final Validation After-All (POST-DECISION SANITY SWEEP)

## Objective

A post-decision sanity sweep run **after** step 10's GO/NO-GO. This step is distinct from Pa de Cal: step 10 is the subjective synthesis ("is this refactor ready?"); step 11 is the mechanical verification that everything declared is actually true on disk and in git — artifacts intact, commits made, branch clean, and the characterization snapshot still IDENTICAL on a cold checkout (no warm caches hiding a problem). This mirrors bugfix-heavy step 11, specialized so the cold-checkout test is the characterization rerun.

## Why distinct from step 10 (Pa de Cal)

| Aspect | Step 10 (Pa de Cal) | Step 11 (After-All Sweep) |
|--------|---------------------|---------------------------|
| Nature | Subjective synthesis | Mechanical verification |
| Output | Decision (GO / CONDITIONAL / NO-GO) | Status (GREEN / YELLOW / RED) |
| Gate | Yes (AskUserQuestion) | No (read-only assertion) |
| When | Before close-out | After-all (post-decision) |
| Behavior-preservation check | Trusts step-6 IDENTICAL | Re-verifies IDENTICAL on a COLD checkout |

Pa de Cal can declare GO on best-available evidence yet miss a mechanical issue (the characterization test was edited but not staged; a commit landed on the wrong branch; the restructure works warm but a cold checkout reveals an import cycle introduced by a move). The after-all sweep catches those.

## Why subagent (general-purpose, read-only)

The sweep runs Bash commands and reports compactly. It does NOT modify state — purely a verification pass.

## Inputs

- `go_no_go` (from step 10) — must be GO or CONDITIONAL to enter this step.
- `refactor_diff` (from step 5) — to know what changed.
- `characterization_test_files`, `before_snapshot` (from step 3) — to re-verify IDENTICAL on a cold checkout.
- `change_contract` (from step 4) — to assert no out-of-scope file was touched.

## Instructions

### 11.1 Artifacts intact (on disk)

Verify every deliverable exists:

```bash
ls -la <files from refactor_diff>
ls -la <characterization_test_files>
ls -la .pipeline/gate-decisions.jsonl
```

If any expected artifact is missing → flag RED.

### 11.2 Commits made + scope respected

```bash
git log --oneline -10
git diff --stat <base>..HEAD
```

Confirm the restructure commit(s) exist and that the changed-files set is a subset of `change_contract.allowed_files` / `allowed_new_files`. A file outside the contract → flag RED (scope violation that slipped past).

### 11.3 Branch clean

```bash
git status
git diff --stat
```

Working tree must be clean; untracked files intentional; stash residue suspicious.

### 11.4 Cold-checkout characterization rerun (the distinct value-add)

Simulate a fresh contributor and re-run the characterization snapshot from cold (no warm caches, no in-memory state):

```bash
git worktree add /tmp/cold-checkout-refactor <branch>
cd /tmp/cold-checkout-refactor
<install command, e.g. npm ci>
<test_command for the characterization_test_files>
```

Compare the cold result to `before_snapshot`:
- **IDENTICAL** — behavior preserved even on a cold checkout. Good.
- **DIVERGED** — the cold checkout shows a public-behavior difference the warm run hid → flag RED.
- **FAILING** — the characterization suite cannot even run cold (e.g., an import cycle introduced by a move) → flag RED.

(If the project does not support worktrees, run the suite from a freshly cleaned environment as the closest equivalent.)

### 11.5 Audit log present

```bash
test -f .pipeline/gate-decisions.jsonl && wc -l .pipeline/gate-decisions.jsonl
```

Must exist and contain the REFACTOR_SCOPE_LOCK (step 4), adversarial (step 8), and Pa de Cal (step 10) entries. Missing/under-populated → flag YELLOW.

### 11.6 Sweep status

Roll up findings:
- **GREEN** — every check passed; safe to close out.
- **YELLOW** — non-critical gaps (audit log under-populated but present, optional commit metadata missing); annotate and proceed.
- **RED** — at least one critical check failed (cold-checkout DIVERGED/FAILING, branch dirty, out-of-scope file touched, artifact missing); halt and surface to caller. The caller decides whether to revert step 10's GO or hold the merge until the gap is closed.

## Done criteria

- All mechanical checks executed with explicit status.
- Cold-checkout characterization result captured (IDENTICAL / DIVERGED / FAILING).
- Sweep status (GREEN / YELLOW / RED) declared.
- Notes capture any YELLOW/RED findings with remediation suggestions.

## Outputs (terminal step — handoff back to caller)

```yaml
artifacts_intact: true|false
commits_made:
  - <sha>: <message>
branch_clean: true|false
cold_checkout_characterization_status: IDENTICAL|DIVERGED|FAILING
audit_log_present: true|false
sweep_status: GREEN|YELLOW|RED
sweep_notes:
  - <finding or "none">
```

## Skill exit

This is the terminal step (`expected_next: null`). On `GREEN` or `YELLOW`, the skill returns control to the caller for closeout (PR finalization, merge). On `RED`, the caller addresses the mechanical gap before merge — typically a small follow-up commit, occasionally a rollback to step 10 to re-evaluate GO, or back to step 5 if cold-checkout DIVERGED.
