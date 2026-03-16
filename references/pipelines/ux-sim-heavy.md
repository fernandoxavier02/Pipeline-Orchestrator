# UX Simulation Pipeline — Heavy

## When Selected
- Type: UX Simulation
- Complexity: COMPLEXA (5+ journeys, cross-device, accessibility)

**Focus: Comprehensive user experience audit with E2E simulation. Report-first.**

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as UX Simulation + COMPLEXA |
| 2 | information-gate | Deep verification: journeys, devices, accessibility, personas |
| 3 | executor-controller | Execute comprehensive simulations, 1 journey per batch |
| 4 | adversarial-batch | UX-focused adversarial (error-handling, edge cases) |
| 5 | sanity-checker | Verify coverage completeness |
| 6 | final-validator | Full UX assessment |

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

### Step 6: Adversarial UX Review
- Input: All findings + error-handling checklist
- Action: Test error states, empty states, loading states, edge cases
- Output: Edge case findings

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
