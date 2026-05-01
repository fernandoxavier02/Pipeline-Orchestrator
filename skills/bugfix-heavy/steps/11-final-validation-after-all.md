---
step_number: 11
step_name: "final-validation-after-all"
execution_mode: subagent
agent_type: "general-purpose"
expected_inputs:
  - go_no_go: from_step_10
  - fix_diff: from_step_6
  - regression_test_path: from_step_5
  - rollback_plan: from_step_10
  - observability_hooks: from_step_10
expected_outputs:
  - artifacts_intact: boolean
  - commits_made: list
  - branch_clean: boolean
  - cold_checkout_tests_status: "PASSING | FAILING"
  - audit_log_present: boolean
  - sweep_status: "GREEN | YELLOW | RED"
  - sweep_notes: list
expected_next: null
gate_required: false
allowed_tools: [Bash, Read, Grep, Glob]
---

# Step 11 — Final Validation After-All (POST-DECISION SANITY SWEEP) — GAP CLOSED

## Objective

A post-decision sanity sweep run **after** step 10's GO/NO-GO decision. This step is the explicit Heavy 11 gap closure: v4.3.1 conflated "Pa de Cal" with "final validation". Here they are **distinct**: step 10 is the GO/NO-GO decision based on synthesized evidence; step 11 is the mechanical verification that everything declared in step 10 is actually true on disk and in git — that artifacts are intact, commits were made, the branch is clean, and tests pass on a cold checkout.

## Why distinct from step 10 (Pa de Cal)

| Aspect | Step 10 (Pa de Cal) | Step 11 (After-All Sweep) |
|--------|---------------------|---------------------------|
| Nature | Subjective synthesis | Mechanical verification |
| Output | Decision (GO / CONDITIONAL / NO-GO) | Status (GREEN / YELLOW / RED) |
| Gate | Yes (AskUserQuestion) | No (read-only assertion) |
| When | Before close-out | After-all (post-decision) |
| Risk model | Residual risks accepted | Discovers latent risks (after-all) |
| Failure handling | NO-GO loops back to earlier step | RED triggers caller-level decision |

The two steps must be distinct. Pa de Cal can declare GO based on best-available evidence yet still miss something mechanical (e.g., the regression test was edited but not staged; a commit was made on the wrong branch; the fix works in IDE but not on a cold checkout because of a build cache). The after-all sweep catches those.

## Why subagent (general-purpose, read-only)

The sweep runs Bash commands and reports compactly. The subagent does NOT modify state — purely a verification pass.

## Inputs

- `go_no_go` (from step 10) — must be GO or CONDITIONAL to enter this step.
- `fix_diff` (from step 6) — to know what changed.
- `regression_test_path` (from step 5) — to verify it exists and runs.
- `rollback_plan`, `observability_hooks` (from step 10) — to verify they are documented.

## Instructions

### 11.1 Artifacts intact (on disk)

Verify every deliverable named in earlier steps actually exists on disk:

```bash
# Fix diff files
ls -la <files from fix_diff>

# Test files from step 5
ls -la <files from test_files_created>

# Regression promotion path
ls -la <regression_test_path>

# Audit log
ls -la .pipeline/gate-decisions.jsonl
```

If any expected artifact is missing → flag as RED.

### 11.2 Commits made

Verify the expected commits exist in git history:

```bash
git log --oneline -10
git log --all --oneline | grep -E "<bug-id>|test\(regression\)|fix\("
```

Expected at minimum:
- The fix commit(s) covering the diff from step 6.
- Test pre-impl commit(s) from step 5 (RED tests).
- Regression promotion commit if the workflow promoted RED → regression.

If any expected commit is missing → flag as YELLOW (or RED if the absence breaks the audit chain).

### 11.3 Branch clean

```bash
git status
git diff --stat
```

Working tree must be clean. Untracked files must be intentional. Stash residue is suspicious.

### 11.4 Cold checkout test pass

This is the distinct value-add of the after-all sweep: simulate a fresh contributor checking out the branch and running tests from cold (no IDE caches, no in-memory state).

```bash
# In a fresh worktree or after a clean
git worktree add /tmp/cold-checkout-<bug-id> <branch>
cd /tmp/cold-checkout-<bug-id>
<install command, e.g. npm ci / poetry install --no-cache>
<test command for relevant suite>
```

The cold checkout reveals issues that the warm dev environment hides (build caches, local DB state, lockfile drift). If cold checkout tests fail while warm tests passed → flag as RED and surface to caller.

(If the project doesn't support a cold-checkout pattern, run the full suite from a freshly cleaned environment as the closest equivalent.)

### 11.5 Audit log present

```bash
test -f .pipeline/gate-decisions.jsonl && wc -l .pipeline/gate-decisions.jsonl
```

The audit log must exist and contain entries for the gates at steps 4, 8, 10. If missing or under-populated → flag as YELLOW.

### 11.6 Rollback plan + observability hooks documented

Confirm the `rollback_plan` and `observability_hooks` from step 10 are captured somewhere durable (PR description, deployment runbook, or a tracked artifact). The after-all sweep verifies the documentation is in a place future on-call engineers will actually find.

### 11.7 Sweep status

Roll up findings:
- **GREEN** — every check passed; safe to close out.
- **YELLOW** — non-critical gaps (e.g., missing optional commit metadata, audit log under-populated but present); annotate and proceed.
- **RED** — at least one critical check failed (cold checkout broken, branch dirty, fix file missing); halt and surface to caller. The caller decides whether to revert step 10's GO or hold the merge until the gap is closed.

## Why this step matters (gap closure rationale)

v4.3.1 conflated "Pa de Cal" and "final validation". A GO at Pa de Cal was treated as "we're done", but mechanical issues (missing commit, dirty branch, cold-checkout failure) sometimes surfaced only after merge — too late. By making step 11 a distinct, mandatory after-all sweep, we catch the mechanical class of issues before close-out, and we keep the subjective "is this ready?" question (step 10) cleanly separated from the objective "is everything actually present and working?" question (step 11).

## Done criteria

- All five mechanical checks executed with explicit status.
- Cold checkout test result captured.
- Sweep status (GREEN / YELLOW / RED) declared.
- Notes capture any YELLOW/RED findings with remediation suggestions.

## Outputs (terminal step — handoff back to caller)

```yaml
artifacts_intact: true|false
commits_made:
  - <sha>: <message>
branch_clean: true|false
cold_checkout_tests_status: PASSING|FAILING
audit_log_present: true|false
sweep_status: GREEN|YELLOW|RED
sweep_notes:
  - <finding or "none">
```

## Skill exit

This is the terminal step (`expected_next: null`). On `GREEN` or `YELLOW`, the skill returns control to the caller (pipeline-controller or direct invoker) for closeout (PR finalization, merge, deploy, post-fix monitoring). On `RED`, the caller is expected to address the mechanical gap before merge — typically a small follow-up commit, occasionally a rollback to step 10 to re-evaluate GO.
