# Audit Pipeline — Light

## When Selected
- Type: Audit
- Complexity: MEDIA (3-5 files, 2 domains)

**CRITICAL: Audit pipelines produce REPORTS ONLY. No implementation.**

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as Audit + MEDIA |
| 2 | information-gate | Verify: scope, axes of analysis, stakeholder |
| 3 | executor-controller | Dispatch analysis tasks (READ-ONLY) |
| 4 | sanity-checker | Verify report completeness |
| 5 | final-validator | Report quality assessment |

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
