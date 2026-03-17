# Audit Pipeline — Heavy

## When Selected
- Type: Audit
- Complexity: COMPLEXA (6+ files, 3+ domains)

**CRITICAL: Audit pipelines produce REPORTS ONLY. No implementation.**

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as Audit + COMPLEXA |
| 2 | information-gate | Deep verification: scope, baseline, stakeholder, axes |
| 3 | executor-controller | Dispatch analysis tasks across all axes (READ-ONLY) |
| 4 | review-orchestrator | Independent batch review (adversarial + architecture in parallel) |
| 5 | sanity-checker | Verify report completeness and evidence quality |
| 6 | final-validator | Report quality + risk matrix assessment |
| 7 | final-adversarial-orchestrator | Independent final review (recommended, opt-in) |

## Step-by-Step Flow

### Step 1: Intake & Scope
- Input: Audit request
- Action: Define comprehensive scope, all analysis axes, baseline if available
- Output: Audit plan with scope boundaries
- Gate: User approval of audit plan

### Step 2: Architecture & Dependencies
- Input: Audit plan
- Action: Map full architecture, module boundaries, dependency graph
- Output: Architecture findings with diagrams

### Step 3: Domain & SSOT
- Input: Architecture map
- Action: Verify all SSOT, business rules, data contracts across domains
- Output: Domain findings, SSOT map

### Step 4: Contracts & APIs
- Input: Domain map
- Action: Audit API contracts, endpoint validation, data formats
- Output: Contract compliance findings

### Step 5: Data & Persistence
- Input: Data model map
- Action: Verify data integrity, migration safety, schema consistency
- Output: Data findings

### Step 6: Adversarial Gate + Independent Review
- Input: Checkpoint PASS result + files analyzed
- Action: ADVERSARIAL GATE (user approves) → review-orchestrator spawns reviewers in parallel
- Output: Consolidated findings → fix loop (max 3) if needed
- Gate: User must approve review start. Mandatory if auth/crypto/data touched.

### Step 7: Quality & Testing
- Input: Test coverage data
- Action: Assess test quality, coverage gaps, observability
- Output: Quality findings

### Step 7b: Final Adversarial Review (Recommended)
- Input: Audit report + all files analyzed
- Action: FINAL ADVERSARIAL GATE (user opts in) → independent security review
- Output: Security findings on analyzed code
- Gate: Opt-in. Recommended if code touches auth/data.

### Step 8: Risk Matrix Assembly
- Input: All findings from steps 2-7
- Action: Consolidate into risk matrix with priority ordering
- Output: AUDIT_REPORT with risk matrix

## Report Format

```yaml
AUDIT_REPORT:
  scope: "[modules audited]"
  axes: ["architecture", "domain", "contracts", "data", "security", "quality"]
  methodology:
    - verification: "[what was checked]"
      command: "[grep/glob command used]"
      result: "[finding]"
  findings:
    critical: [N]
    important: [N]
    minor: [N]
  risk_matrix:
    - id: "[CATEGORY-N]"
      finding: "[description]"
      severity: "[Critical|Important|Minor]"
      evidence: "[file:line]"
      recommendation: "[action]"
      tag: "[VERIFIED|HYPOTHESIS|DESIGN]"
  overall_assessment: "[summary with confidence level]"
```

## Batch Configuration
- Tasks per batch: 1 (thorough analysis per axis)
- Adversarial intensity: Complete (all 7 checklists as part of audit)
- Checkpoint: Evidence quality verification

## Success Criteria
- All declared scope covered across all axes
- Every finding has evidence (file:line + grep command)
- Every finding tagged as VERIFIED/HYPOTHESIS/DESIGN
- Risk matrix with priority ordering
- Methodology section showing commands used
- No implementation performed (REPORT ONLY)
- Actionable recommendations linked to specs/issues

## Escalation
- Critical security findings -> recommend immediate remediation
- SSOT conflicts -> flag as P0
- Scope too large for single audit -> propose phased approach
