# Feature Implementation Pipeline — Heavy

## When Selected
- Type: Feature
- Complexity: COMPLEXA (6+ files, >100 lines, 3+ domains)

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Feature + COMPLEXA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Deep verification: spec, UX, data model, domain rules, SSOT |
| 4 | design-interrogator | 0c | Walk design decision tree (automatic for COMPLEXA) |
| 5 | sentinel (phase_0_to_1) | 0→1 | Validate Phase 0 coherence |
| 6 | plan-architect | 1.5 | Enter Plan Mode, research codebase, generate implementation plan |
| 7 | sentinel (phase_1_to_2) | 1→2 | Validate Phase 1 coherence |
| 8 | quality-gate-router | 2 (TDD) | Generate test scenarios in plain language for user approval |
| 9 | pre-tester | 2 (TDD) | Convert approved scenarios to automated tests (RED phase) |
| 10 | executor-controller | 2 | Dispatch per-task subagents, 1 task per batch |
| 11 | checkpoint-validator | 2 | Build + tests + regression after each batch |
| 12 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 13 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 14 | sanity-checker | 3 | Full validation + regression |
| 15 | final-adversarial-orchestrator | 3 | Independent final review (strongly recommended, opt-in) |
| 16 | final-validator (Pa de Cal) | 3 | Go/No-Go with complete evidence |
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
