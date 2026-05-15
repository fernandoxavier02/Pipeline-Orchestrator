Feature: Subagent Achado #7 protocol compliance (D2 fix)
  As an audit-confirmed gap in v5.2.0
  The information-gate and plan-architect agents fell back to prose/inline
  instead of emitting structured GATE_REQUEST / PLAN_MODE_REQUEST blocks

  Background:
    Given the pipeline-orchestrator plugin v5.3.0+
    And the parent Claude session has stripped AskUserQuestion, Agent, EnterPlanMode from subagent runtimes

  Scenario: information-gate must emit GATE_REQUEST v1 when gap requires user input
    Given a subagent dispatch of "information-gate" with a BLOCKER gap detected
    When the gap cannot be self-resolved from codebase
    Then the agent's markdown spec MUST contain explicit guidance to emit "=== GATE_REQUEST v1 ===" block
    And the spec MUST contain "STATUS: AWAITING_GATE_RESPONSES"
    And the spec MUST cite Achado #7 explicitly
    And the spec MUST forbid prose-fallback questions
    And the spec MUST show a worked example block

  Scenario: plan-architect must emit PLAN_MODE_REQUEST v1 instead of calling EnterPlanMode inline
    Given a subagent dispatch of "plan-architect" in Phase 1.5
    When the planner needs to enter Plan Mode
    Then the agent's markdown spec MUST contain explicit guidance to emit "=== PLAN_MODE_REQUEST v1 ===" block
    And the spec MUST contain "STATUS: AWAITING_PLAN_MODE_RESULTS"
    And the spec MUST cite Achado #7 explicitly
    And the spec MUST forbid calling EnterPlanMode directly
    And the spec MUST show a worked example block

  Scenario: design-interrogator already compliant (reference example)
    Given the design-interrogator.md spec (control case)
    When inspected for Achado #7 explicit guidance
    Then it should serve as the reference template
    But validation is only required for information-gate and plan-architect in v5.3.0
