# Bug Fix Pipeline — Light

## When Selected
- Type: Bug Fix
- Complexity: MEDIA (3-5 files, 30-100 lines, 2 domains)

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as Bug Fix + MEDIA |
| 2 | information-gate | Verify: reproduction steps, expected vs actual, recent changes |
| 3 | executor-controller | Dispatch per-task subagents in batches of 2-3 |
| 4 | checkpoint-validator | Build + tests after each batch |
| 5 | adversarial-batch | auth + input-validation + error-handling checklists |
| 6 | sanity-checker | Build + tests + symptom verification |
| 7 | final-validator | Go/No-Go decision |

## Step-by-Step Flow

### Step 1: Diagnosis
- Input: User's bug report + orchestrator classification
- Action: Identify root cause via grep, trace execution path
- Output: Root cause hypothesis with file:line evidence
- Gate: If cause unclear, ASK user (don't guess)

### Step 2: Impact Assessment
- Input: Root cause location
- Action: Search for related callers, shared state, side effects
- Output: Impact radius (files, functions, data paths affected)
- Gate: If impact crosses 3+ domains, escalate to bugfix-heavy

### Step 3: Fix Implementation (TDD)
- Input: Root cause + impact assessment
- Action: RED (test that reproduces bug) -> GREEN (minimal fix) -> REFACTOR
- Output: Fix applied, tests passing
- Gate: Micro-gate per task (values defined? paths specified?)

### Step 4: Validation
- Input: Modified files
- Action: Build + test + verify original symptom resolved
- Output: Checkpoint result
- Gate: STOP RULE if 2 consecutive failures

### Step 5: Adversarial Review
- Input: Modified files + relevant checklists
- Action: Check auth, input validation, error handling
- Output: Findings (if any) -> fix loop (max 3)
- Gate: Critical findings block until fixed

### Step 6: Final Decision
- Input: All stage results
- Action: Consolidate, issue Go/Conditional/No-Go
- Output: Final decision with closeout options

## Batch Configuration
- Tasks per batch: 2-3
- Adversarial intensity: 3 checklists (auth, input-validation, error-handling)
- Checkpoint: Build + tests

## Success Criteria
- Original bug no longer reproducible
- No new test failures introduced
- Build passes cleanly
- No critical adversarial findings

## Escalation
- If root cause spans 6+ files -> escalate to bugfix-heavy
- If fix introduces regression -> STOP RULE
- If 3 adversarial fix attempts fail -> propose alternatives to user
