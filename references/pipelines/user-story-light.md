# User Story Pipeline — Light

## When Selected
- Type: User Story
- Complexity: MEDIA (3-5 files, 30-100 lines, 2 domains)

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as User Story + MEDIA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Verify: persona, trigger, acceptance criteria |
| 4 | quality-gate-router | 2 (TDD) | Generate test scenarios from acceptance criteria |
| 5 | pre-tester | 2 (TDD) | Convert approved scenarios to automated tests (RED phase) |
| 6 | executor-controller | 2 | Translate story → tasks, execute in batches of 2-3 |
| 7 | checkpoint-validator | 2 | Build + tests after each batch |
| 8 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 9 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 10 | sanity-checker | 3 | Build + tests + user journey verification |
| 11 | final-adversarial-orchestrator | 3 | Independent final review (recommended, opt-in) |
| 12 | final-validator (Pa de Cal) | 3 | Go/No-Go decision |
| 13 | finishing-branch | 3 | Present closeout options (commit/PR/keep/discard) |

### Pipeline Discipline (MANDATORY)

- **Sentinel checkpoints:** #1 (post_orchestrator) and #4 (phase_2_to_3) are MANDATORY. #2, #3, #5 are recommended.
- **TDD:** quality-gate-router + pre-tester are MANDATORY before executor-controller.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

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

---

### Type-Specific Agent Team

**Team:** Feature Light (referenced from implement-light)
**Mode:** code-changing
**Agents (execution order):**
1. feature-vertical-slice-planner — story decomposition into implementable tasks, acceptance criteria mapping
2. feature-implementer — per-task TDD implementation, batches of 2-3

**Note:** feature-integration-validator is SKIPPED in Light. User Story Light uses the same agent team as Feature Light. The difference is upstream: user-story pipeline includes story intake and decomposition steps before reaching executor-controller.
