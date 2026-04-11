# Adversarial Review Pipeline — Light

## When Selected
- Type: Audit (sub-routed via adversarial keyword detection + user confirmation)
- Complexity: SIMPLES (1-2 files, <30 lines, 1 domain)

**Sub-route trigger:** executor-controller detects adversarial keywords ("adversarial review", "security audit", "threat model") in the task description AND user confirms via AskUserQuestion.

**CRITICAL: Review-only mode produces REPORTS ONLY. Fix mode spawns executor-implementer-task for critical/high findings.**

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Audit + SIMPLES |
| 2 | information-gate | 0b | Quick verification: scope, targets |
| 3 | executor-controller | 2 | Dispatch adversarial team via sub-routing |
| 4 | sanity-checker | 3 | Verify report completeness |
| 5 | final-validator (Pa de Cal) | 3 | Consolidated findings + Go/No-Go |

### Pipeline Discipline (SIMPLES — reduced ceremony)

- **Sentinel checkpoints:** Checkpoint #1 only (ORCHESTRATOR_VALIDATION).
- **Design interrogation:** SKIPPED for SIMPLES.
- **Plan mode:** SKIPPED for SIMPLES.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE phase changes.

## Step-by-Step Flow

### Step 1: Coordination & Mode Selection
- Input: Task description with adversarial keywords, user-confirmed sub-route
- Action: adversarial-review-coordinator determines scope, selects review-only or fix mode
- Output: Review plan with target files, mode selection

### Step 2: Security Review Only
- Input: Target files from coordinator
- Action: adversarial-security-scanner reviews files independently
- Output: SECURITY_FINDINGS
- Note: adversarial-architecture-critic is SKIPPED in light variant (per team-registry skip_in_light)

### Step 3: Consolidation
- Input: SECURITY_FINDINGS (single source in light variant)
- Action: adversarial-review-coordinator consolidates into ADVERSARIAL_CONSOLIDATED
- Output: Consolidated report

### Step 4 (fix mode only): Critical/High Fix
- Input: Critical/high findings from ADVERSARIAL_CONSOLIDATED
- Action: executor-implementer-task applies targeted fixes → spec-reviewer → quality-reviewer
- Output: Fixed code + verification

### Step 5: Pipeline Closeout
- **Review-only mode:** CONDITIONAL_SKIP { hardness: "SOFT" } — proceed to sanity-checker → final-validator.
- **Fix mode:** Normal code-changing post-chain.

## Success Criteria
- Security scanner ran with zero prior context
- Every finding has evidence (file:line)
- Fix mode: critical/high findings addressed
- Review-only mode: actionable report delivered, no code modified

---

### Type-Specific Agent Team

**Team:** Adversarial Light
**Mode:** review +/- fix
**Agents (execution order):**
1. adversarial-review-coordinator — scope definition, mode selection, finding consolidation
2. adversarial-security-scanner — independent security review (architecture-critic SKIPPED in light)
3. (fix mode only) executor-implementer-task — targeted fixes for critical/high findings *(shared executor agent, not type-specific — lives at `agents/executor/executor-implementer-task.md`)*

**Phase 3 Note:**
- Review-only mode: report-only pipeline. Proceeds directly to final-validator.
- Fix mode: code-changing pipeline. Normal Phase 3 applies.
