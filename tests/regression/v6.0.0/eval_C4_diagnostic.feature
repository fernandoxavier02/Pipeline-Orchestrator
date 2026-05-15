Feature: Pipeline-orchestrator DIAGNOSTIC mode contract compliance
  As an audit subject of pipeline-orchestrator v5.2.0
  Pipeline-controller must classify a request and halt cleanly
  Without executing implementation phases

  Background:
    Given a clean session with cwd in a worktree of the target project
    And pipeline-orchestrator v5.2.0 is installed
    And no orphan sentinel-state.json exists in the cwd .pipeline tree

  Scenario: Successful DIAGNOSTIC classification of a MEDIA Feature
    When the user invokes "/pipeline-orchestrator:pipeline diagnostic <request>"
    Then a fresh sentinel-state.json is created with pipeline_active=true and expected_next="task-orchestrator"
    And task-orchestrator is dispatched as a subagent via Agent tool
    And task-orchestrator returns ORCHESTRATOR_DECISION with type, complexity, pipeline_variant, ssot_status, persona
    And sentinel ORCHESTRATOR_VALIDATION is invoked and returns PASS
    And information-gate is dispatched as a subagent
    And information-gate emits a structured GATE_REQUEST v1 block when user input is required
    And the parent handler processes the GATE_REQUEST via AskUserQuestion
    And a phase-1-pipeline-proposal gate is presented to the user
    And on Yes confirmation a DIAGNOSTIC COMPLETE block is emitted
    And sentinel-state.json is updated with pipeline_active=false
    And gate-decisions.jsonl contains entries for every gate in the 22-gate registry that was triggered
    And protocol-events.jsonl contains a paired DISPATCH_REQUEST_EMITTED + DISPATCH_RESULT_CAPTURED for every subagent invoked
    And no Phase 2 or Phase 3 artifacts are created
    And no executor-controller is dispatched

  Scenario: Subagent must NOT emit prose questions when GATE_REQUEST is required
    Given information-gate detects a BLOCKER gap during Phase 0b
    When the gap requires user decision
    Then information-gate MUST emit "=== GATE_REQUEST v1 ===" with STATUS: AWAITING_GATE_RESPONSES
    And the subagent MUST NOT return a free-prose A/B question
    And the parent handler MUST detect and reject prose-fallback outputs

  Scenario: Orphan sentinel-state must not block new pipelines
    Given a sentinel-state.json from a previous session exists with pipeline_active=true and last_updated older than 24h
    When the user starts a new pipeline-orchestrator pipeline
    Then the sentinel auto-detects the orphan state via TTL
    And presents the user a GATE_REQUEST to archive or resume the orphan
    And does not block dispatch by default

  Scenario: pipeline-controller must be dispatchable as subagent OR the contract must declare it inline-only
    When the user dispatches Agent(subagent_type="pipeline-orchestrator:core:pipeline-controller")
    Then either the dispatch succeeds and the controller acts as subagent
    Or the dispatch is denied with an explicit message documenting that pipeline-controller is parent-inline-only by design
    But the current behavior of denying without explicit documentation is a contract gap
