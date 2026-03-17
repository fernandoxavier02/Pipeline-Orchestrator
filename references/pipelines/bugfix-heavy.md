# Bug Fix Pipeline — Heavy

## When Selected
- Type: Bug Fix
- Complexity: COMPLEXA (6+ files, >100 lines, 3+ domains)
- Also selected for: production incidents, data integrity issues, security-related bugs

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as Bug Fix + COMPLEXA |
| 2 | information-gate | Deep verification: reproduction, environment, frequency, data state |
| 3 | executor-controller | Dispatch per-task subagents, 1 task per batch |
| 4 | checkpoint-validator | Build + tests + regression suite after each batch |
| 5 | review-orchestrator | Independent batch review (adversarial + architecture in parallel) |
| 6 | sanity-checker | Full validation + regression + symptom verification |
| 7 | final-validator | Go/No-Go decision with full evidence |
| 8 | final-adversarial-orchestrator | Independent final review (recommended, opt-in) |

## Step-by-Step Flow

### Step 1: Terrain Reconnaissance
- Input: User's bug report + classification
- Action: Deep grep for root cause, trace full execution path, map all affected files
- Output: Diagnostic report with evidence chain
- Gate: If cause still unclear after investigation, ASK user

### Step 2: Root Cause Consolidation
- Input: Diagnostic report
- Action: Verify root cause with multiple evidence points, rule out false positives
- Output: Confirmed root cause with confidence level
- Gate: User approval required before proceeding to fix

### Step 3: Domain Truth Model
- Input: Confirmed root cause
- Action: Identify SSOT for affected data, verify no conflicting sources
- Output: Domain map with truth sources
- Gate: SSOT conflict -> BLOCK pipeline

### Step 4: Controlled Change Proposal
- Input: Root cause + domain map
- Action: Propose minimal diff with explicit scope boundaries
- Output: Change proposal with risk assessment
- Gate: User approval required

### Step 5: Fix Implementation (TDD)
- Input: Approved change proposal
- Action: Per-task execution with TDD, 1 task per batch
- Output: Fix applied, tests passing per batch
- Gate: Micro-gate per task + checkpoint per batch

### Step 6: Post-Change Sanity
- Input: All modified files
- Action: Full build + all tests + regression suite
- Output: Complete validation report
- Gate: STOP RULE if 2 consecutive failures

### Step 7: Adversarial Gate + Independent Review
- Input: Checkpoint PASS result + files modified
- Action: ADVERSARIAL GATE (user approves) → review-orchestrator spawns reviewers in parallel
- Output: Consolidated findings → fix loop (max 3) if needed
- Gate: User must approve review start. Mandatory if auth/crypto/data touched.

### Step 7b: Final Adversarial Review (Recommended)
- Input: All files modified across all batches
- Action: FINAL ADVERSARIAL GATE (user opts in) → 3 independent reviewers in parallel
- Output: Cross-batch findings, consensus analysis
- Gate: Opt-in. Strongly recommended for COMPLEXA.

### Step 8: Final Validation
- Input: All stage results
- Action: Consolidate evidence, verify original symptom gone
- Output: Go/Conditional/No-Go with full justification

## Batch Configuration
- Tasks per batch: 1 (maximum control)
- Adversarial intensity: Complete (all 7 checklists)
- Checkpoint: Build + tests + regression

## Success Criteria
- Root cause confirmed with evidence
- Original bug no longer reproducible
- Full regression suite passes
- No critical or important adversarial findings
- User approved change proposal before implementation
- All modified files within declared scope

## Escalation
- SSOT conflict detected -> BLOCK until user resolves
- 2 consecutive checkpoint failures -> STOP RULE
- 3 adversarial fix attempts fail -> propose 2 alternatives + discard
- Root cause unclear after investigation -> user decision required
