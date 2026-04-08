# Bug Fix Pipeline — Heavy

## When Selected
- Type: Bug Fix
- Complexity: COMPLEXA (6+ files, >100 lines, 3+ domains)
- Also selected for: production incidents, data integrity issues, security-related bugs

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Bug Fix + COMPLEXA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Deep verification: reproduction, environment, frequency, data state |
| 4 | design-interrogator | 0c | Walk design decision tree (automatic for COMPLEXA) |
| 5 | sentinel (phase_0_to_1) | 0→1 | Validate Phase 0 coherence |
| 6 | plan-architect | 1.5 | Enter Plan Mode, research root cause, generate fix plan |
| 7 | sentinel (phase_1_to_2) | 1→2 | Validate Phase 1 coherence |
| 8 | quality-gate-router | 2 (TDD) | Generate test scenarios — regression + reproduction + edge cases |
| 9 | pre-tester | 2 (TDD) | Convert approved scenarios to automated tests (RED phase) |
| 10 | executor-controller | 2 | Dispatch per-task subagents, 1 task per batch |
| 11 | checkpoint-validator | 2 | Build + tests + regression suite after each batch |
| 12 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 13 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 14 | sanity-checker | 3 | Full validation + regression + symptom verification |
| 15 | final-adversarial-orchestrator | 3 | Independent final review (strongly recommended, opt-in) |
| 16 | final-validator (Pa de Cal) | 3 | Go/No-Go decision with full evidence |
| 17 | sentinel (post_final_validator) | 3 | Final coherence validation |
| 18 | finishing-branch | 3 | Present closeout options (commit/PR/keep/discard) |

### Pipeline Discipline (MANDATORY — ALL checkpoints for COMPLEXA)

- **Sentinel checkpoints:** ALL 5 checkpoints (#1-#5) are MANDATORY for COMPLEXA.
- **Design interrogation:** Automatic for COMPLEXA — design-interrogator walks decision tree.
- **Plan mode:** Automatic for COMPLEXA — plan-architect enters read-only Plan Mode.
- **TDD:** quality-gate-router + pre-tester are MANDATORY before executor-controller.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

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
