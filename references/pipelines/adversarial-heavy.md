# Adversarial Review Pipeline — Heavy

## When Selected
- Type: Audit (sub-routed via adversarial keyword detection + user confirmation)
- Complexity: COMPLEXA (6+ files, 3+ domains)

**Sub-route trigger:** executor-controller detects adversarial keywords ("adversarial review", "security audit", "threat model") in the task description AND user confirms via AskUserQuestion.

**CRITICAL: Review-only mode produces REPORTS ONLY. Fix mode spawns executor-implementer-task for critical/high findings.**

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Audit + COMPLEXA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Deep verification: scope, targets, threat model baseline |
| 4 | design-interrogator | 0c | Walk adversarial scope decision tree (automatic for COMPLEXA) |
| 5 | sentinel (phase_0_to_1) | 0→1 | Validate Phase 0 coherence |
| 6 | plan-architect | 1.5 | Enter Plan Mode, plan adversarial execution order |
| 7 | sentinel (phase_1_to_2) | 1→2 | Validate Phase 1 coherence |
| 8 | executor-controller | 2 | Dispatch adversarial team via sub-routing |
| 9 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 10 | sanity-checker | 3 | Verify report completeness and evidence quality |
| 11 | final-validator (Pa de Cal) | 3 | Consolidated findings + Go/No-Go |
| 12 | sentinel (post_final_validator) | 3 | Final coherence validation |
| 13 | finishing-branch | 3 | Present closeout options |

### Pipeline Discipline (MANDATORY — ALL checkpoints for COMPLEXA)

- **Sentinel checkpoints:** ALL 5 checkpoints (#1-#5) are MANDATORY for COMPLEXA.
- **Design interrogation:** Automatic for COMPLEXA — defines adversarial scope.
- **Plan mode:** Automatic for COMPLEXA — plans review execution order.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

## Step-by-Step Flow

### Step 1: Coordination & Mode Selection
- Input: Task description with adversarial keywords, user-confirmed sub-route
- Action: adversarial-review-coordinator determines scope, selects review-only or fix mode
- Output: Review plan with target files, mode selection, scope boundaries

### Step 2: Parallel Independent Reviews
- Input: Target files from coordinator
- Action: adversarial-security-scanner AND adversarial-architecture-critic run in parallel (single message, two Agent tool calls)
- Output: SECURITY_FINDINGS + ARCHITECTURE_FINDINGS (independent, zero shared context)

### Step 3: Consolidation
- Input: SECURITY_FINDINGS + ARCHITECTURE_FINDINGS
- Action: adversarial-review-coordinator consolidates findings into ADVERSARIAL_CONSOLIDATED
- Output: Consolidated report with severity classification

### Step 4 (fix mode only): Critical/High Fix
- Input: Critical/high findings from ADVERSARIAL_CONSOLIDATED
- Action: executor-implementer-task applies targeted fixes → spec-reviewer → quality-reviewer
- Output: Fixed code + verification

### Step 5: Pipeline Closeout
- **Review-only mode:** CONDITIONAL_SKIP { hardness: "SOFT" } — skip spec-reviewer, quality-reviewer, checkpoint-validator. Proceed to sanity-checker → final-validator.
- **Fix mode:** Normal code-changing post-chain (spec-reviewer → quality-reviewer → checkpoint-validator → sanity-checker → final-validator).

## Report Format

```yaml
ADVERSARIAL_CONSOLIDATED:
  mode: "[review-only | fix]"
  scope: "[files reviewed]"
  security_findings:
    critical: [N]
    high: [N]
    medium: [N]
    low: [N]
  architecture_findings:
    critical: [N]
    high: [N]
    medium: [N]
    low: [N]
  fixes_applied: [N]  # fix mode only
  residual_risk: "[assessment]"
```

## Batch Configuration
- Tasks per batch: 1 (comprehensive adversarial review)
- Adversarial intensity: Maximum (both scanners in parallel)
- Checkpoint: Evidence quality verification

## Success Criteria
- Both scanners ran independently with zero shared context
- Every finding has evidence (file:line + specific vulnerability/concern)
- Severity classification follows standard (Critical/High/Medium/Low)
- Fix mode: all critical/high findings addressed or explicitly deferred with rationale
- Review-only mode: actionable report delivered, no code modified

## Escalation
- Critical security vulnerabilities → recommend immediate remediation, flag as P0
- Architecture concerns spanning 3+ modules → recommend phased refactor
- Both scanners find overlapping concerns → high-confidence signal, elevate severity

---

### Type-Specific Agent Team

**Team:** Adversarial Heavy
**Mode:** review +/- fix
**Agents (execution order):**
1. adversarial-review-coordinator — scope definition, mode selection (review-only vs fix), finding consolidation
2. adversarial-security-scanner ‖ adversarial-architecture-critic — parallel independent reviews with ZERO shared context
3. (fix mode only) executor-implementer-task — targeted fixes for critical/high findings *(shared executor agent, not type-specific — lives at `agents/executor/executor-implementer-task.md`)*

**Phase 3 Note:**
- Review-only mode: report-only pipeline. final-adversarial-orchestrator is SKIPPED. Pipeline proceeds directly to final-validator.
- Fix mode: code-changing pipeline. Normal Phase 3 applies (sanity-checker → final-adversarial-orchestrator [opt-in] → final-validator).
