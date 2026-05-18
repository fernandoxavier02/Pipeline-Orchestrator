Feature: Codex operational pipeline runtime parity
  The Codex plugin runtime must execute the canonical pipeline contract as an
  operational agent flow, never as a diagnostic harness disguised as execution.

  Scenario: Strict operational mode without an agent adapter blocks explicitly
    Given a target workspace
    And strict agents are enabled
    When the pipeline entrypoint is executed without an agent adapter
    Then the run status is BLOCKED
    And the reason is blocked-no-agent-runtime
    And the dispatch mode is blocked-no-agent-runtime
    And NEXT_STEP records the missing adapter remediation

  Scenario: Operational mode spawns pipeline-controller and dispatches protocol requests
    Given a fake agent adapter
    When the pipeline entrypoint runs a MEDIA task
    Then the first agent spawn is pipeline-controller
    And DISPATCH_REQUEST blocks become adapter dispatches
    And protocol-events.jsonl records emitted and captured dispatch events
    And gate-decisions.jsonl records named gate decisions

  Scenario: Brainstorm Step 1.7 requires gate responses before completion
    Given a MEDIA task reaches Step 1.7
    When brainstorm emits a gate request without matching GATE_RESPONSES
    Then Step 1.7 does not conclude
    And gate-decisions.jsonl records STEP_1_7_ROUTING as BLOCKED

  Scenario: Operational modes persist phase and session artifacts
    Given a fake agent adapter returns all phase milestones
    When the pipeline entrypoint completes
    Then session.json uses the target workspace as execution_identity.cwd
    And sentinel-state.json records pipeline_active false
    And phases 0, 1, 1.5, 2, and 3 are persisted

  Scenario: Continue without prior state blocks with auditable remediation
    Given no previous session state exists
    When the continue mode is executed
    Then the run status is BLOCKED
    And the reason is missing-session-state
    And gate-decisions.jsonl records CONTINUE_STATE
    And NEXT_STEP explains how to resume safely

  Scenario: Review-only without a change list blocks with a report
    Given review-only mode has no explicit changed file list
    When the review-only mode is executed
    Then the run status is BLOCKED
    And the reason is review-only-requires-change-list
    And review-only-report.md explains why no review was run
    And gate-decisions.jsonl records the runtime block
