# Feature Implementation Pipeline — Light

## When Selected
- Type: Feature
- Complexity: MEDIA (3-5 files, 30-100 lines, 2 domains)

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Feature + MEDIA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Verify: spec exists, UX flow, data persistence strategy |
| 4 | quality-gate-router | 2 (TDD) | Generate test scenarios in plain language for user approval |
| 5 | pre-tester | 2 (TDD) | Convert approved scenarios to automated tests (RED phase) |
| 6 | executor-controller | 2 | Dispatch per-task subagents in batches of 2-3 |
| 7 | checkpoint-validator | 2 | Build + tests after each batch |
| 8 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 9 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 10 | sanity-checker | 3 | Build + tests + scope verification |
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

---

### Type-Specific Agent Team

**Team:** Feature Light
**Mode:** code-changing
**Agents (execution order):**
1. feature-vertical-slice-planner — scope decomposition, task mapping, acceptance criteria per task
2. feature-implementer — per-task TDD implementation, batches of 2-3

**Note:** feature-integration-validator is SKIPPED in Light (cross-slice integration handled inline by checkpoint-validator).
