# UX Simulation Pipeline — Light

## When Selected
- Type: UX Simulation
- Complexity: MEDIA (2-3 user journeys, standard flow)

**Focus: Simulate real user interactions, identify UX problems. Report-first.**

## Team Composition

| Step | Agent | Phase | Responsibility |
|------|-------|-------|---------------|
| 1 | task-orchestrator | 0a | Classify as UX Simulation + MEDIA |
| 2 | sentinel (ORCHESTRATOR_VALIDATION) | 0 | Validate classification correctness |
| 3 | information-gate | 0b | Verify: target journey, devices, accessibility requirements |
| 4 | executor-controller | 2 | Execute journey simulations |
| 5 | sentinel (phase_2_to_3) | 2→3 | Validate phase transition coherence |
| 6 | sanity-checker | 3 | Verify report completeness |
| 7 | final-adversarial-orchestrator | 3 | Independent final review (recommended, opt-in) |
| 8 | final-validator (Pa de Cal) | 3 | UX assessment decision |
| 9 | finishing-branch | 3 | Present closeout options |

**Note:** UX Simulation pipelines produce REPORTS ONLY — no TDD (quality-gate-router/pre-tester not applicable).

### Pipeline Discipline (MANDATORY)

- **Sentinel checkpoints:** #1 (post_orchestrator) and #4 (phase_2_to_3) are MANDATORY. #2, #3, #5 are recommended.
- **Phase transitions:** Emit Phase Transition Summary block BEFORE every phase change.
- **Gate decisions:** Log EVERY gate trigger to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`.
- **State file:** Update `sentinel-state.json` via Write tool BEFORE every Agent spawn.

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
