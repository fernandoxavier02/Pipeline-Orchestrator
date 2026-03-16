# Example: Medium Feature

A complete walkthrough of a medium-complexity feature through the pipeline, showing batched execution, adversarial findings, and a fix loop.

---

## User Input

```
/pipeline add dark mode toggle to settings page
```

---

## Phase 0: Automatic Triage

The **task-orchestrator** classifies the request.

### Classification Result

```
+==================================================================+
|  TASK-ORCHESTRATOR v2 - PROPOSAL READY                            |
|  Type: Feature                                                    |
|  Complexity: MEDIA                                                |
|  Pipeline: implement-light                                        |
|  Info-Gate: 1 GAP DETECTED                                        |
|  Status: RESOLVING GAPS                                           |
+==================================================================+
```

**Why MEDIA?** The feature touches multiple files (settings page, theme provider, storage layer, possibly CSS/styles), but the scope is well-bounded and does not affect critical paths like auth or payments.

### Information Gate

The information-gate detects one gap:

```
+==================================================================+
|  INFORMATION-GATE                                                  |
|  Gaps detected: 1                                                  |
|  Status: ASKING                                                    |
+==================================================================+

Question: How should the dark mode preference be persisted?
  A) localStorage (client-only, lost on clear)
  B) User profile in database (syncs across devices)
```

**User:** `A, localStorage is fine`

```
+==================================================================+
|  INFORMATION-GATE - COMPLETE                                       |
|  Gaps detected: 1                                                  |
|  Gaps resolved: 1                                                  |
|  Status: RESOLVED                                                  |
+==================================================================+
```

---

## Phase 1: Proposal

```
PIPELINE PROPOSAL:

  Type:       Feature
  Complexity: MEDIA
  Pipeline:   implement-light
  Batch size: 2-3 tasks per batch
  Adversarial: auth + input-validation + error-handling
  Sanity:     build + tests

  Tasks identified:
    1. Create theme context/provider with toggle logic
    2. Add toggle component to settings page
    3. Apply theme class to root element + persist to localStorage

  Confirm? (yes / no / adjust)
```

**User:** `yes`

---

## Phase 2: Execution

### Quality Gate

The quality-gate-router generates test scenarios for user approval:

```
Scenario 1: Toggle switches between light and dark mode
  - Given: the app is in light mode
  - When: the user clicks the dark mode toggle
  - Then: the UI switches to dark mode

Scenario 2: Preference persists across page reloads
  - Given: the user enabled dark mode
  - When: the page is reloaded
  - Then: dark mode is still active

Scenario 3: Toggle reflects current state accurately
  - Given: the app loaded with a saved dark mode preference
  - When: the settings page renders
  - Then: the toggle shows "on" for dark mode
```

**User approves.** The pre-tester writes automated tests (RED phase -- all 3 tests fail).

### Batch 1: Tasks 1-2 (theme provider + toggle component)

**Executor dispatches two tasks in parallel:**

| Task | Subagent | Result |
|------|----------|--------|
| 1. Theme context/provider | executor-implementer-task | Created `ThemeProvider` with toggle function |
| 2. Toggle component | executor-implementer-task | Created `DarkModeToggle` on settings page |

**Checkpoint (Batch 1):**

```
+==================================================================+
|  CHECKPOINT-VALIDATOR                                              |
|  Batch: 1 of 2                                                    |
|  Build: PASS                                                       |
|  Tests: 2 of 3 GREEN (scenario 3 still RED - expected)            |
+==================================================================+
```

**Adversarial (Batch 1):**

Intensity: **PROPORTIONAL** (3 checklists loaded: auth, input-validation, error-handling)

```
Findings:
  1. [LOW] accessibility - toggle has no aria-label for screen readers
     Checklist: input-validation
     Location: DarkModeToggle component
```

**Fix Loop (Attempt 1 of 3):**

The executor-fix subagent adds `aria-label="Toggle dark mode"` and `role="switch"` attributes to the toggle.

**Re-check:** Finding resolved. Adversarial review passes.

### Batch 2: Task 3 (root class + localStorage persistence)

**Executor dispatches one task:**

| Task | Subagent | Result |
|------|----------|--------|
| 3. Apply theme + persist | executor-implementer-task | Added class toggle on `<html>` + localStorage read/write |

**Checkpoint (Batch 2):**

```
+==================================================================+
|  CHECKPOINT-VALIDATOR                                              |
|  Batch: 2 of 2                                                    |
|  Build: PASS                                                       |
|  Tests: 3 of 3 GREEN (all scenarios passing)                     |
+==================================================================+
```

**Adversarial (Batch 2):**

```
Findings: 0
All checklists pass.
```

---

## Phase 3: Closure

### Sanity Check

```
+==================================================================+
|  SANITY-CHECKER                                                    |
|  Build: PASS                                                       |
|  Tests: PASS (all existing + 3 new)                               |
|  Scope: PASS (4 files changed, all within expected scope)         |
+==================================================================+
```

Files changed:
- `src/contexts/ThemeContext.ts` (new)
- `src/components/DarkModeToggle.tsx` (new)
- `src/pages/Settings.tsx` (modified -- added toggle)
- `src/App.tsx` (modified -- wrapped with ThemeProvider)

### Final Validator

```
+==================================================================+
|  FINAL-VALIDATOR                                                   |
|  Decision: GO                                                      |
|  Reason: All tests pass, adversarial finding resolved,            |
|          scope matches proposal, build clean                       |
+==================================================================+
```

### Closeout Options

```
Pipeline complete. What would you like to do?

  A) Commit changes to current branch
  B) Push and create a Pull Request
  C) Keep changes uncommitted (review manually)
  D) Discard all changes
```

**User selects B.** The finishing-branch agent pushes the branch and creates a pull request with a summary of changes, test results, and the resolved adversarial finding.

---

## Summary

| Phase | Duration | Key Events |
|-------|----------|------------|
| Triage | ~10s | Classified as Feature/MEDIA |
| Information Gate | ~30s | 1 gap about persistence strategy |
| Proposal | User confirmation | 3 tasks identified |
| Quality Gate | User approval | 3 test scenarios |
| Batch 1 | ~2-3 min | 2 tasks, 1 adversarial finding (accessibility) |
| Fix Loop | ~30s | Added aria-label, resolved in 1 attempt |
| Batch 2 | ~1-2 min | 1 task, 0 findings |
| Closure | ~15s | GO, push + PR |

**Total pipeline time:** About 5-7 minutes, including user interactions.

**Key takeaway:** The adversarial reviewer caught an accessibility issue that would have been easy to miss. The fix loop resolved it automatically without requiring user intervention.
