# UX Simulation Pipeline — Light

## When Selected
- Type: UX Simulation
- Complexity: MEDIA (2-3 user journeys, standard flow)

**Focus: Simulate real user interactions, identify UX problems. Report-first.**

## Team Composition

| Step | Agent | Responsibility |
|------|-------|---------------|
| 1 | task-orchestrator | Classify as UX Simulation + MEDIA |
| 2 | information-gate | Verify: target journey, devices, accessibility requirements |
| 3 | executor-controller | Execute journey simulations |
| 4 | sanity-checker | Verify report completeness |
| 5 | final-validator | UX assessment decision |

## Step-by-Step Flow

### Step 1: Journey Definition
- Input: User's UX simulation request
- Action: Define target user journey(s), entry/exit points
- Output: Journey map with steps
- Gate: If journey unclear, ASK user

### Step 2: Environment Setup
- Input: Journey map
- Action: Identify pages/components involved, state requirements
- Output: Simulation plan

### Step 3: Journey Simulation
- Input: Simulation plan
- Action: Walk through each journey step, note friction points
- Output: Per-step findings (problems, confusions, dead ends)

### Step 4: Problem Classification
- Input: All journey findings
- Action: Classify by severity and type
- Output: Prioritized problem list

### Step 4b: Final Adversarial Review (Recommended)
- Input: UX report + all files analyzed
- Action: FINAL ADVERSARIAL GATE (user opts in) → independent security review
- Output: Security findings on analyzed code
- Gate: Opt-in. Recommended if code touches auth/data.

### Step 5: Report
- Input: Classified problems
- Action: Assemble problems-first report with recommendations
- Output: UX_SIMULATION_REPORT

## Report Format

```yaml
UX_SIMULATION_REPORT:
  journeys_tested: [N]
  problems_found:
    blocker: [N]
    major: [N]
    minor: [N]
  top_problems:
    - journey: "[which journey]"
      step: "[where in journey]"
      problem: "[what went wrong]"
      recommendation: "[how to fix]"
```

## Batch Configuration
- Tasks per batch: 2-3 journeys
- Adversarial intensity: N/A
- Checkpoint: Report completeness

## Success Criteria
- All target journeys simulated
- Problems prioritized by impact
- Actionable recommendations provided
- Report is problems-first (not praise-first)

## Escalation
- Blocker-level UX problems -> recommend immediate fix
- Journey impossible to complete -> flag as critical
