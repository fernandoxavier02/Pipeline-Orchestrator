# User Story Pipeline — Heavy

## When Selected
- Type: User Story
- Complexity: COMPLEXA (6+ files, >100 lines, 3+ domains)

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as User Story + COMPLEXA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Deep verification: persona, journey, acceptance criteria, domain rules |
| 4 | design-interrogator | 0c | Walk design decision tree (automatic for COMPLEXA) |
| 5 | sentinel (phase_0_to_1) | 0→1 | Validate Phase 0 coherence |
| 6 | plan-architect | 1.5 | Enter Plan Mode, decompose story into implementation plan |
| 7 | sentinel (phase_1_to_2) | 1→2 | Validate Phase 1 coherence |
| 8 | quality-gate-router | 2 (TDD) | Generate test scenarios from acceptance criteria |
| 9 | pre-tester | 2 (TDD) | Convert approved scenarios to automated tests (RED phase) |
| 10 | executor-controller | 2 | Translate + execute, 1 task per batch |
| 11 | checkpoint-validator | 2 | Build + tests + regression after each batch |
| 12 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 13 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 14 | sanity-checker | 3 | Full validation + regression + journey verification |
| 15 | final-adversarial-orchestrator | 3 | Independent final review (strongly recommended, opt-in) |
| 16 | final-validator (Pa de Cal) | 3 | Go/No-Go with complete evidence |
| 17 | sentinel (post_final_validator) | 3 | Final coherence validation |
| 18 | finishing-branch | 3 | Present closeout options (commit/PR/keep/discard) |

### Pipeline Discipline (MANDATORY — ALL checkpoints for COMPLEXA)

- **Sentinel checkpoints:** ALL 5 checkpoints (#1-#5) are MANDATORY for COMPLEXA.
- **Design interrogation:** Automatic for COMPLEXA — design-interrogator walks decision tree.
- **Plan mode:** Automatic for COMPLEXA — plan-architect decomposes story into plan.
- **TDD:** quality-gate-router + pre-tester are MANDATORY before executor-controller.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

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

---

### Type-Specific Agent Team

**Team:** Feature Heavy (referenced from implement-heavy)
**Mode:** code-changing
**Agents (execution order):**
1. feature-vertical-slice-planner — story decomposition into vertical slices, acceptance criteria per slice
2. feature-implementer — per-task TDD implementation, 1 task per batch
3. feature-integration-validator — cross-slice integration checks, end-to-end journey verification, acceptance criteria confirmation

**Note:** User Story Heavy uses the same agent team as Feature Heavy. The difference is upstream: user-story pipeline includes NLP story intake and cause-root matrix before reaching executor-controller.
