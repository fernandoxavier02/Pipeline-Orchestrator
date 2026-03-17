# User Story Pipeline — Light

## When Selected
- Type: User Story
- Complexity: MEDIA (3-5 files, 30-100 lines, 2 domains)

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as User Story + MEDIA |
| 2 | information-gate | Verify: persona, trigger, acceptance criteria |
| 3 | executor-controller | Translate story -> tasks, execute in batches of 2-3 |
| 4 | checkpoint-validator | Build + tests after each batch |
| 5 | review-orchestrator | Independent batch review (adversarial + architecture in parallel) |
| 6 | sanity-checker | Build + tests + user journey verification |
| 7 | final-validator | Go/No-Go decision |
| 8 | final-adversarial-orchestrator | Independent final review (recommended, opt-in) |

## Step-by-Step Flow

### Step 1: Story Intake
- Input: User's narrative (natural language)
- Action: Parse into structured User Story format (As a..., I want..., So that...)
- Output: Structured user story with acceptance criteria
- Gate: If persona or trigger unclear, ASK user

### Step 2: Story Decomposition
- Input: Structured user story
- Action: Break into implementable tasks with clear acceptance criteria each
- Output: Task list mapped to acceptance criteria
- Gate: User confirmation of task breakdown

### Step 3: Domain Mapping
- Input: Task list
- Action: Map tasks to code domains, identify SSOT, find patterns
- Output: File map + integration points
- Gate: If crossing unexpected domains, re-assess complexity

### Step 4: Implementation (TDD)
- Input: Approved tasks
- Action: Per-task TDD in batches of 2-3
- Output: Story implemented, tests passing
- Gate: Micro-gate per task, checkpoint per batch

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
- Action: Verify story acceptance criteria met end-to-end
- Output: Go/Conditional/No-Go

## Batch Configuration
- Tasks per batch: 2-3
- Adversarial intensity: 3 checklists
- Checkpoint: Build + tests

## Success Criteria
- All acceptance criteria from user story are met
- User journey works end-to-end
- All new code has tests
- No critical adversarial findings

## Escalation
- Story too large (6+ tasks) -> escalate to user-story-heavy
- Acceptance criteria ambiguous -> ASK user for clarification
- Crosses 3+ domains -> re-assess complexity
