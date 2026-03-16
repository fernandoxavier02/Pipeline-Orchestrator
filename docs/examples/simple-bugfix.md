# Example: Simple Bug Fix

A complete walkthrough of a simple bug fix through the pipeline, from initial request to final closure.

---

## User Input

```
/pipeline fix the login button not responding on mobile
```

---

## Phase 0: Automatic Triage

The **task-orchestrator** receives the request and classifies it immediately.

### Classification Result

```
+==================================================================+
|  TASK-ORCHESTRATOR v2 - PROPOSAL READY                            |
|  Type: Bug Fix                                                    |
|  Complexity: SIMPLES                                              |
|  Pipeline: DIRETO (direct execution)                              |
|  Info-Gate: CLEAR (no gaps detected)                              |
|  Status: AWAITING USER CONFIRMATION                               |
+==================================================================+
```

**Why SIMPLES?** The request points to a single UI element (login button), a single platform (mobile), and a clear symptom (not responding). Likely 1-2 files affected.

### Information Gate

The information-gate runs and finds no critical gaps:
- The affected component is clear (login button)
- The symptom is specific (not responding on mobile)
- No ambiguity about scope

Status: **CLEAR** -- no questions needed.

---

## Phase 1: Proposal

The pipeline presents a proposal for confirmation:

```
PIPELINE PROPOSAL:

  Type:       Bug Fix
  Complexity: SIMPLES
  Pipeline:   DIRETO (direct execution)
  Batch size: all tasks in 1 batch
  Adversarial: auth checklist only (if auth code touched)
  Sanity:     build only

  Confirm? (yes / no / adjust)
```

**User:** `yes`

---

## Phase 2: Execution

### Quality Gate

The quality-gate-router generates a plain-language test scenario:

```
Test Scenario 1: Login button responds to tap on mobile viewports
  - Given: the login page is loaded on a mobile-width screen
  - When: the user taps the login button
  - Then: the button triggers the authentication flow
```

User approves the scenario. The pre-tester converts it into an automated test (RED phase -- test is written but fails because the fix does not exist yet).

### Implementation

The executor runs all tasks in a single batch (SIMPLES complexity):

1. **Micro-gate**: Locates the login button component and its click handler
2. **Implementer**: Identifies the root cause (e.g., touch event not bound, CSS `pointer-events: none` on mobile, z-index overlap) and applies the minimal fix
3. **Spec-reviewer**: Skipped (no spec for SIMPLES bug fix)
4. **Quality-reviewer**: Quick check -- fix is minimal, no unnecessary changes

### Checkpoint

The checkpoint-validator runs:

```
+==================================================================+
|  CHECKPOINT-VALIDATOR                                              |
|  Batch: 1 of 1                                                    |
|  Level: SIMPLES                                                    |
|  Build: PASS                                                       |
|  Tests: PASS (1 new test green)                                   |
+==================================================================+
```

### Adversarial Review

For SIMPLES tasks, the adversarial reviewer runs at **MINIMAL** intensity. Since the login button touches authentication flow, the `auth` checklist loads:

- Authentication flow still triggers correctly after fix: **PASS**
- No new unprotected paths introduced: **PASS**

Result: **0 findings**. No fix loop needed.

---

## Phase 3: Closure

### Sanity Check

```
+==================================================================+
|  SANITY-CHECKER                                                    |
|  Build: PASS                                                       |
|  Tests: PASS (all existing + 1 new)                               |
|  Scope: PASS (changes limited to expected files)                  |
+==================================================================+
```

### Final Validator

```
+==================================================================+
|  FINAL-VALIDATOR                                                   |
|  Decision: GO                                                      |
|  Reason: Build passes, tests pass, scope is contained             |
+==================================================================+
```

### Closeout Options

The pipeline presents options to the user:

```
Pipeline complete. What would you like to do?

  A) Commit changes to current branch
  B) Push and create a Pull Request
  C) Keep changes uncommitted (review manually)
  D) Discard all changes
```

**User selects A.** The finishing-branch agent creates a commit with a descriptive message summarizing the fix.

---

## Summary

| Phase | Duration | Agent(s) |
|-------|----------|----------|
| Triage | ~5s | task-orchestrator, information-gate |
| Proposal | User confirmation | -- |
| Execution | ~1-2 min | quality-gate, pre-tester, executor, checkpoint |
| Adversarial | ~10s | adversarial-batch (MINIMAL) |
| Closure | ~10s | sanity-checker, final-validator, finishing-branch |

**Total pipeline time:** Under 3 minutes for a simple, well-described bug fix.
