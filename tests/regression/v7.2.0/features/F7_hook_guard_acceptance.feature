# BDD Gherkin artifact — Batch 3, Bounded Context: Hook Guard Validation
# Slice: PreToolUse:Agent sentinel hook does NOT have a closed deny-list of gate names

Feature: sentinel-hook does not block new v7.2.0 gate names
  As the Pipeline-Orchestrator maintainer
  I want .claude/hooks/sentinel-hook.cjs to NOT carry a hardcoded deny-list of gate names
  So that new AUDIT-class events (like ATDD_STEP_1B_BYPASS) and SOFT advisory events
    (like BOUNDED_CONTEXT_MISSING) flow through without requiring a hook amendment

  Background:
    Given the sentinel hook is at .claude/hooks/sentinel-hook.cjs
    And the hook's responsibility is validating spawn sequence (expected_next),
        NOT validating gate names

  Scenario: No hardcoded reference to v7.2.0 gate names exists in the hook source
    Given the source of .claude/hooks/sentinel-hook.cjs
    When I search for hardcoded gate-name literals "ATDD_STEP_1B_BYPASS" or "BOUNDED_CONTEXT_MISSING"
    Then I find zero matches
    So that the hook stays gate-name-agnostic by design

  Scenario: Deny patterns are not name-keyed
    Given the source of the hook
    When I search for the deny-emission code paths
    Then the conditions checked are about spawn-sequence (expected_next, agent_namespace_mismatch, etc),
         NOT about gate names
    And there is no pattern like `if (entry.gate === "X") deny`

  Scenario: Hook module loads without errors
    Given Node.js runtime
    When the hook is required as a module (or executed with no-op stdin)
    Then it does not throw at parse-time

  Scenario: AUDIT-class events do not trigger the hook's enforcement logic
    Given the hook's enforcement function (when present)
    When inspected statically
    Then it focuses on Agent spawn validation, not on gate-decisions.jsonl entries
    So that AUDIT-class telemetry (the open class introduced in v6.2.0) is invisible to the hook
