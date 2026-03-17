# Feature Implementation Pipeline — Heavy

## When Selected
- Type: Feature
- Complexity: COMPLEXA (6+ files, >100 lines, 3+ domains)

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as Feature + COMPLEXA |
| 2 | information-gate | Deep verification: spec, UX, data model, domain rules, SSOT |
| 3 | executor-controller | Dispatch per-task subagents, 1 task per batch |
| 4 | checkpoint-validator | Build + tests + regression after each batch |
| 5 | review-orchestrator | Independent batch review (adversarial + architecture in parallel) |
| 6 | sanity-checker | Full validation + regression |
| 7 | final-validator | Go/No-Go with complete evidence |
| 8 | final-adversarial-orchestrator | Independent final review (recommended, opt-in) |

## Step-by-Step Flow

### Step 1: Intent & Scope
- Input: Feature request + classification
- Action: Define precise scope, acceptance criteria, non-goals
- Output: Scope document with boundaries
- Gate: User approval required

### Step 2: Terrain Recon
- Input: Approved scope
- Action: Deep grep for related code, SSOT verification, pattern mapping
- Output: Complete file map + integration points + dependency graph
- Gate: SSOT conflict -> BLOCK

### Step 3: Domain & Data Model
- Input: Terrain map
- Action: Verify data model, persistence strategy, contracts
- Output: Data model specification
- Gate: If data model undefined, ASK user

### Step 4: Architecture Options
- Input: Scope + terrain + data model
- Action: Propose max 2 implementation approaches with pros/cons
- Output: Selected approach with justification
- Gate: User approval of approach

### Step 5: Implementation (TDD)
- Input: Approved approach + task breakdown
- Action: Per-task TDD, 1 task per batch, maximum control
- Output: Feature implemented incrementally
- Gate: Micro-gate per task + checkpoint + adversarial per batch

### Step 6: Post-Implementation Validation
- Input: All modified/created files
- Action: Full build + tests + regression + acceptance criteria check
- Output: Complete validation report

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

### Step 8: Final Decision
- Input: All stage evidence
- Action: Full assessment against acceptance criteria
- Output: Go/Conditional/No-Go

## Batch Configuration
- Tasks per batch: 1 (maximum control)
- Adversarial intensity: Complete (all 7 checklists)
- Checkpoint: Build + tests + regression

## Success Criteria
- Feature meets all acceptance criteria
- All new code has comprehensive tests
- Full regression suite passes
- No critical or important adversarial findings
- Architecture approach approved by user
- Data model verified against SSOT

## Escalation
- SSOT conflict -> BLOCK until resolved
- 2 consecutive checkpoint failures -> STOP RULE
- 3 adversarial attempts fail -> propose alternatives
- Architecture disagreement -> user decides
