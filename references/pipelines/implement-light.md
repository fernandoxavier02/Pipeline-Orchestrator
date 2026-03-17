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
| 5 | review-orchestrator | Independent batch review (adversarial + architecture in parallel) |
| 6 | sanity-checker | Build + tests + scope verification |
| 7 | final-validator | Go/No-Go decision |
| 8 | final-adversarial-orchestrator | Independent final review (recommended, opt-in) |

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

### Step 5: Adversarial Gate + Independent Review
- Input: Checkpoint PASS result + files modified
- Action: ADVERSARIAL GATE (user approves) → review-orchestrator spawns reviewers in parallel
- Output: Consolidated findings → fix loop (max 3) if needed
- Gate: User must approve review start. Mandatory if auth/crypto/data touched.

### Step 5b: Final Adversarial Review (Recommended)
- Input: All files modified across all batches
- Action: FINAL ADVERSARIAL GATE (user opts in) → 3 independent reviewers in parallel
- Output: Cross-batch findings, consensus analysis
- Gate: Opt-in. Recommended for all.

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
