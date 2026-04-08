# Audit Pipeline — Heavy

## When Selected
- Type: Audit
- Complexity: COMPLEXA (6+ files, 3+ domains)

**CRITICAL: Audit pipelines produce REPORTS ONLY. No implementation.**

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as Audit + COMPLEXA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Deep verification: scope, baseline, stakeholder, axes |
| 4 | design-interrogator | 0c | Walk audit scope decision tree (automatic for COMPLEXA) |
| 5 | sentinel (phase_0_to_1) | 0→1 | Validate Phase 0 coherence |
| 6 | plan-architect | 1.5 | Enter Plan Mode, plan audit execution order |
| 7 | sentinel (phase_1_to_2) | 1→2 | Validate Phase 1 coherence |
| 8 | executor-controller | 2 | Dispatch analysis tasks across all axes (READ-ONLY) |
| 9 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 10 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 11 | sanity-checker | 3 | Verify report completeness and evidence quality |
| 12 | final-adversarial-orchestrator | 3 | Independent final review (strongly recommended, opt-in) |
| 13 | final-validator (Pa de Cal) | 3 | Report quality + risk matrix assessment |
| 14 | sentinel (post_final_validator) | 3 | Final coherence validation |
| 15 | finishing-branch | 3 | Present closeout options |

**Note:** Audit pipelines produce REPORTS ONLY — no TDD (quality-gate-router/pre-tester not applicable).

### Pipeline Discipline (MANDATORY — ALL checkpoints for COMPLEXA)

- **Sentinel checkpoints:** ALL 5 checkpoints (#1-#5) are MANDATORY for COMPLEXA.
- **Design interrogation:** Automatic for COMPLEXA — defines audit scope decisions.
- **Plan mode:** Automatic for COMPLEXA — plans audit execution order.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

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
