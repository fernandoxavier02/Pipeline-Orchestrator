# Feature Implementation Pipeline — Light

## When Selected
- Type: Feature
- Complexity: MEDIA (3-5 files, 30-100 lines, 2 domains)

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as Feature + MEDIA |
| 2 | information-gate | Verify: spec exists, UX flow, data persistence strategy |
| 3 | executor-controller | Dispatch per-task subagents in batches of 2-3 |
| 4 | checkpoint-validator | Build + tests after each batch |
| 5 | adversarial-batch | auth + input-validation + error-handling checklists |
| 6 | sanity-checker | Build + tests + scope verification |
| 7 | final-validator | Go/No-Go decision |

## Step-by-Step Flow

### Step 1: Intent & Scope
- Input: User's feature request + classification
- Action: Clarify what exactly should be built, boundaries of scope
- Output: Clear scope statement with acceptance criteria
- Gate: If scope unclear, ASK user

### Step 2: Terrain Recon
- Input: Scope statement
- Action: Grep for related code, existing patterns, integration points
- Output: Map of files to create/modify, patterns to follow
- Gate: If touching unexpected domains, re-assess complexity

### Step 3: Implementation (TDD)
- Input: Scope + terrain map
- Action: Per-task TDD in batches of 2-3
- Output: Feature implemented, tests passing
- Gate: Micro-gate per task, checkpoint per batch

### Step 4: Validation
- Input: All modified/created files
- Action: Build + tests + verify acceptance criteria
- Output: Checkpoint result
- Gate: STOP RULE if 2 consecutive failures

### Step 5: Adversarial Review
- Input: Modified files + 3 checklists
- Action: Check auth, input validation, error handling
- Output: Findings -> fix loop (max 3)

### Step 6: Final Decision
- Input: All results
- Action: Verify feature meets acceptance criteria
- Output: Go/Conditional/No-Go

## Batch Configuration
- Tasks per batch: 2-3
- Adversarial intensity: 3 checklists (auth, input-validation, error-handling)
- Checkpoint: Build + tests

## Success Criteria
- Feature works as described in acceptance criteria
- All new code has tests
- Build passes
- No critical adversarial findings
- No scope creep beyond declared boundaries

## Escalation
- Scope exceeds 5 files -> consider implement-heavy
- Data model changes required -> elevate to COMPLEXA
- Auth/security impact discovered -> add security checklists
