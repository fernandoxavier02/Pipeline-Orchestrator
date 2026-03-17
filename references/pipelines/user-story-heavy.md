# User Story Pipeline — Heavy

## When Selected
- Type: User Story
- Complexity: COMPLEXA (6+ files, >100 lines, 3+ domains)

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as User Story + COMPLEXA |
| 2 | information-gate | Deep verification: persona, journey, acceptance criteria, domain rules |
| 3 | executor-controller | Translate + execute, 1 task per batch |
| 4 | checkpoint-validator | Build + tests + regression after each batch |
| 5 | review-orchestrator | Independent batch review (adversarial + architecture in parallel) |
| 6 | sanity-checker | Full validation + regression + journey verification |
| 7 | final-validator | Go/No-Go with complete evidence |
| 8 | final-adversarial-orchestrator | Independent final review (recommended, opt-in) |

## Step-by-Step Flow

### Step 1: Story Intake (NLP)
- Input: User narrative (possibly informal/incomplete)
- Action: Parse, structure, identify implicit requirements
- Output: Formal user story + acceptance criteria + edge cases
- Gate: User approval of structured story

### Step 2: Cause-Root Matrix
- Input: Structured story
- Action: Identify why this story exists — what problem does it solve?
- Output: Problem statement + success metrics
- Gate: If problem unclear, ASK user

### Step 3: Domain & SSOT
- Input: Story + problem statement
- Action: Map to code domains, verify SSOT, identify contracts
- Output: Domain map with truth sources
- Gate: SSOT conflict -> BLOCK

### Step 4: Task Breakdown
- Input: Domain map + story
- Action: Decompose into vertical slices, each delivering end-to-end value
- Output: Task list with acceptance criteria per task
- Gate: User approval of breakdown

### Step 5: Implementation (TDD)
- Input: Approved tasks
- Action: Per-task TDD, 1 per batch, maximum control
- Output: Story implemented incrementally
- Gate: Micro-gate + checkpoint + adversarial per batch

### Step 6: Adversarial Gate + Independent Review
- Input: Checkpoint PASS result + files modified
- Action: ADVERSARIAL GATE (user approves) → review-orchestrator spawns reviewers in parallel
- Output: Consolidated findings → fix loop (max 3) if needed
- Gate: User must approve review start. Mandatory if auth/crypto/data touched.

### Step 6b: Final Adversarial Review (Recommended)
- Input: All files modified across all batches
- Action: FINAL ADVERSARIAL GATE (user opts in) → 3 independent reviewers in parallel
- Output: Cross-batch findings, consensus analysis
- Gate: Opt-in. Strongly recommended for COMPLEXA.

### Step 7: Journey Verification
- Input: Complete implementation
- Action: Trace full user journey end-to-end
- Output: Journey verification report

### Step 8: Final Decision
- Input: All evidence
- Action: Verify all acceptance criteria, journey works
- Output: Go/Conditional/No-Go

## Batch Configuration
- Tasks per batch: 1
- Adversarial intensity: Complete (all 7 checklists)
- Checkpoint: Build + tests + regression

## Success Criteria
- All acceptance criteria met
- Full user journey works end-to-end
- Comprehensive test coverage
- No critical or important adversarial findings
- User approved story structure and task breakdown

## Escalation
- SSOT conflict -> BLOCK
- 2 consecutive failures -> STOP RULE
- 3 adversarial attempts fail -> propose alternatives
- Story requirements change mid-execution -> re-plan
