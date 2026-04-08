# UX Simulation Pipeline — Heavy

## When Selected
- Type: UX Simulation
- Complexity: COMPLEXA (5+ journeys, cross-device, accessibility)

**Focus: Comprehensive user experience audit with E2E simulation. Report-first.**

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as UX Simulation + COMPLEXA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Deep verification: journeys, devices, accessibility, personas |
| 4 | design-interrogator | 0c | Walk UX scope decision tree (automatic for COMPLEXA) |
| 5 | sentinel (phase_0_to_1) | 0→1 | Validate Phase 0 coherence |
| 6 | plan-architect | 1.5 | Enter Plan Mode, plan simulation execution order |
| 7 | sentinel (phase_1_to_2) | 1→2 | Validate Phase 1 coherence |
| 8 | executor-controller | 2 | Execute comprehensive simulations, 1 journey per batch |
| 9 | review-orchestrator | 2 | Independent batch review (adversarial + architecture in parallel) |
| 10 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 11 | sanity-checker | 3 | Verify coverage completeness |
| 12 | final-adversarial-orchestrator | 3 | Independent final review (strongly recommended, opt-in) |
| 13 | final-validator (Pa de Cal) | 3 | Full UX assessment |
| 14 | sentinel (post_final_validator) | 3 | Final coherence validation |
| 15 | finishing-branch | 3 | Present closeout options |

**Note:** UX Simulation pipelines produce REPORTS ONLY — no TDD (quality-gate-router/pre-tester not applicable).

### Pipeline Discipline (MANDATORY — ALL checkpoints for COMPLEXA)

- **Sentinel checkpoints:** ALL 5 checkpoints (#1-#5) are MANDATORY for COMPLEXA.
- **Design interrogation:** Automatic for COMPLEXA — defines UX simulation scope.
- **Plan mode:** Automatic for COMPLEXA — plans simulation execution order.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

## Step-by-Step Flow

### Step 1: Journey Inventory
- Input: UX simulation request
- Action: Map ALL user journeys, personas, devices, accessibility needs
- Output: Complete journey inventory
- Gate: User approval of journey scope

### Step 2: Environment & State Matrix
- Input: Journey inventory
- Action: Map required states, data, permissions per journey
- Output: State matrix with setup requirements

### Step 3: Per-Journey Simulation
- Input: State matrix + journey definition
- Action: Simulate each journey step-by-step, testing edge cases
- Output: Per-journey findings
- Gate: 1 journey per batch for maximum detail

### Step 4: Cross-Journey Analysis
- Input: All journey findings
- Action: Identify patterns, systemic issues, inconsistencies
- Output: Cross-cutting findings

### Step 5: Accessibility Audit
- Input: All journeys
- Action: Check keyboard navigation, screen reader, color contrast, motion
- Output: Accessibility findings

### Step 6: Adversarial Gate + Independent Review
- Input: Checkpoint PASS result + files analyzed
- Action: ADVERSARIAL GATE (user approves) → review-orchestrator spawns reviewers in parallel
- Output: Consolidated findings → fix loop (max 3) if needed
- Gate: User must approve review start. Mandatory if auth/crypto/data touched.

### Step 6b: Final Adversarial Review (Recommended)
- Input: Audit/UX report + all files analyzed
- Action: FINAL ADVERSARIAL GATE (user opts in) → independent security review
- Output: Security findings on analyzed code
- Gate: Opt-in. Recommended if code touches auth/data.

### Step 7: Report Assembly
- Input: All findings (journeys + cross-cutting + accessibility + adversarial)
- Action: Prioritize problems-first, group by impact
- Output: UX_SIMULATION_REPORT

## Report Format

```yaml
UX_SIMULATION_REPORT:
  journeys_tested: [N]
  personas_covered: ["list"]
  devices_tested: ["list"]
  problems_found:
    blocker: [N]
    major: [N]
    minor: [N]
    accessibility: [N]
  top_problems:
    - journey: "[which]"
      step: "[where]"
      problem: "[what]"
      impact: "[who is affected]"
      recommendation: "[how to fix]"
  cross_cutting_issues:
    - pattern: "[systemic issue]"
      affected_journeys: [N]
      recommendation: "[fix]"
  accessibility_summary:
    keyboard_nav: "[PASS|FAIL]"
    screen_reader: "[PASS|FAIL]"
    color_contrast: "[PASS|FAIL]"
```

## Batch Configuration
- Tasks per batch: 1 journey
- Adversarial intensity: error-handling + business-logic checklists
- Checkpoint: Coverage verification

## Success Criteria
- All declared journeys simulated
- Cross-device consistency verified
- Accessibility requirements checked
- Problems prioritized by user impact
- Report is problems-first
- Systemic patterns identified

## Escalation
- Blocker UX issues -> recommend immediate fix before release
- Accessibility failures -> flag as compliance risk
- Systemic issues across 3+ journeys -> architectural recommendation
