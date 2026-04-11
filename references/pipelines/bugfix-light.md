# Bug Fix Pipeline — Light

## When Selected
- Type: Bug Fix
- Complexity: MEDIA (3-5 files, 30-100 lines, 2 domains)

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Bug Fix + MEDIA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Verify: reproduction steps, expected vs actual, recent changes |
| 4 | quality-gate-router | 2 (TDD) | Generate test scenarios — regression + edge cases |
| 5 | pre-tester | 2 (TDD) | Convert approved scenarios to automated tests (RED phase) |
| 6 | executor-controller | 2 | Dispatch per-task subagents in batches of 2-3 |
| 7 | checkpoint-validator | 2 | Build + tests after each batch |
| 8 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 9 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 10 | sanity-checker | 3 | Build + tests + symptom verification |
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

### Step 5: Adversarial Gate + Independent Review
- Input: Checkpoint PASS result + files modified
- Action: ADVERSARIAL GATE (user approves) → review-orchestrator spawns reviewers in parallel
- Output: Consolidated findings → fix loop (max 3) if needed
- Gate: User must approve review start. Mandatory if auth/crypto/data touched.

### Step 5b: Final Adversarial Review (Recommended)
- Input: All files modified across all batches
- Action: FINAL ADVERSARIAL GATE (user opts in) → 3 independent reviewers in parallel
- Output: Cross-batch findings, consensus analysis
- Gate: Opt-in. Recommended for all. Strongly recommended for COMPLEXA.

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

---

### Type-Specific Agent Team

**Team:** Bug Fix Light
**Mode:** code-changing
**Agents (execution order):**
1. bugfix-diagnostic-agent — diagnosis, root cause hypothesis, file:line evidence
2. executor-implementer-task — fix implementation (TDD, batches of 2-3) *(shared executor agent, not type-specific — lives at `agents/executor/executor-implementer-task.md`)*
3. bugfix-regression-tester — post-fix validation, symptom verification

**Note:** bugfix-root-cause-analyzer is SKIPPED in Light (root cause consolidation handled inline by bugfix-diagnostic-agent).
