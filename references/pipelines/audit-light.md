# Audit Pipeline — Light

## When Selected
- Type: Audit
- Complexity: MEDIA (3-5 files, 2 domains)

**CRITICAL: Audit pipelines produce REPORTS ONLY. No implementation.**

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Audit + MEDIA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Verify: scope, axes of analysis, stakeholder |
| 4 | executor-controller | 2 | Dispatch analysis tasks (READ-ONLY) |
| 5 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 6 | sanity-checker | 3 | Verify report completeness |
| 7 | final-adversarial-orchestrator | 3 | Independent final review (recommended, opt-in) |
| 8 | final-validator (Pa de Cal) | 3 | Report quality assessment |
| 9 | finishing-branch | 3 | Present closeout options |

**Note:** Audit pipelines produce REPORTS ONLY — no TDD (quality-gate-router/pre-tester not applicable).

### Pipeline Discipline (MANDATORY)

- **Sentinel checkpoints:** #1 (post_orchestrator) and #4 (phase_2_to_3) are MANDATORY. #2, #3, #5 are recommended.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

## Step-by-Step Flow

### Step 1: Scope Definition
- Input: User's audit request
- Action: Define which modules/files to audit, which quality axes
- Output: Audit scope document
- Gate: If scope unclear, ASK user

### Step 2: Architecture Analysis
- Input: Audit scope
- Action: Analyze file organization, dependencies, responsibility boundaries
- Output: Architecture findings

### Step 3: Domain & Business Rules
- Input: Architecture map
- Action: Verify SSOT, business rule consistency, contract compliance
- Output: Domain findings

### Step 4: Quality Assessment
- Input: Code in scope
- Action: Check patterns, error handling, test coverage, code quality
- Output: Quality findings with severity ratings

### Step 4b: Final Adversarial Review (Recommended)
- Input: Audit report + all files analyzed
- Action: FINAL ADVERSARIAL GATE (user opts in) → independent security review
- Output: Security findings on analyzed code
- Gate: Opt-in. Recommended if code touches auth/data.

### Step 5: Report Assembly
- Input: All findings
- Action: Consolidate into structured audit report
- Output: AUDIT_REPORT with findings, severity, recommendations

## Report Format

```yaml
AUDIT_REPORT:
  scope: "[modules audited]"
  axes: ["architecture", "domain", "quality"]
  findings:
    critical: [N]
    important: [N]
    minor: [N]
  recommendations: ["list"]
  overall_assessment: "[summary]"
```

## Batch Configuration
- Tasks per batch: 2-3 (analysis tasks, not implementation)
- Adversarial intensity: N/A (audit IS the review)
- Checkpoint: Report completeness check

## Success Criteria
- All declared scope covered
- Each finding has evidence (file:line)
- Each finding classified by severity
- Actionable recommendations provided
- No implementation performed (REPORT ONLY)

## Escalation
- Scope too large -> suggest breaking into focused audits
- Critical security findings -> recommend immediate action
- SSOT conflicts discovered -> flag as highest priority

---

### Type-Specific Agent Team

**Team:** Audit Light
**Mode:** report-only
**Agents (execution order):**
1. audit-intake — scope definition, axis selection, audit plan
2. audit-compliance-checker — architecture analysis, domain rules, quality assessment, findings with severity ratings
3. audit-risk-matrix-generator — finding consolidation, structured AUDIT_REPORT generation, recommendations

**Note:** audit-domain-analyzer is SKIPPED in Light (domain analysis handled inline by audit-compliance-checker).

**Phase 3 Note:**
This is a report-only pipeline. final-adversarial-orchestrator is SKIPPED (zero code review surface). Pipeline proceeds directly to final-validator.
