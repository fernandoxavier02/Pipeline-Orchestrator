# BDD Gherkin artifact — Batch 2, Bounded Context: Telemetry Writer Validation
# Slice: canonical writer accepts a superset of runtime-used gate names

Feature: gate-decision-writer accepts new v7.2.0 gate names without rejection
  As the Pipeline-Orchestrator maintainer
  I want lib/gate-decision-writer.cjs to NEVER reject a write based on the gate NAME
  So that AUDIT-class events (like ATDD_STEP_1B_BYPASS) can be emitted from any agent
    without requiring a registry-list amendment first

  Background:
    Given the SSOT canonical writer is lib/gate-decision-writer.cjs (v7.1.0+)
    And the writer enforces an 8-value decision vocabulary (BLOCKED, DISPATCHED, SKIPPED, APPROVED, CONFIRMED, REJECTED, TRIGGERED, NOT_TRIGGERED)
    And the writer enforces a 5-class hardness vocabulary (MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, AUDIT)
    And the writer DOES NOT enforce a closed list of gate names by design (extensibility contract)

  Scenario: ATDD_STEP_1B_BYPASS gate (AUDIT class) writes successfully
    Given a temporary gate-decisions.jsonl file
    And a valid ctx built from a synthetic pipeline_doc_path
    When I call appendGateDecision with gate="ATDD_STEP_1B_BYPASS", hardness="AUDIT", decision="SKIPPED"
    Then no TypeError is thrown
    And the file contains exactly one line with the expected fields

  Scenario: BOUNDED_CONTEXT_MISSING name does not trigger writer rejection
    Given a temporary gate-decisions.jsonl file
    When I call appendGateDecision with gate="BOUNDED_CONTEXT_MISSING", hardness="SOFT", decision="TRIGGERED"
    Then no TypeError is thrown
    Note: in production this event goes to protocol-events.jsonl via a different code path; this test only proves the writer does NOT reject the NAME if someone routes it through here by mistake.

  Scenario: Invalid decision still rejects (negative — invariant preserved)
    Given a temporary gate-decisions.jsonl file
    When I call appendGateDecision with gate="ATDD_STEP_1B_BYPASS", hardness="AUDIT", decision="PASS"
    Then a TypeError is thrown mentioning the canonical decision vocabulary
    So that the v7.1.0 hygiene rule is not weakened by this regression

  Scenario: Invalid hardness still rejects (negative — invariant preserved)
    Given a temporary gate-decisions.jsonl file
    When I call appendGateDecision with gate="anything", hardness="INFO", decision="SKIPPED"
    Then a TypeError is thrown mentioning the canonical hardness vocabulary

  Scenario: Module exports CANONICAL_DECISIONS and CANONICAL_HARDNESS for runtime inspection
    Given the writer module
    When I inspect its exports
    Then CANONICAL_DECISIONS contains the 8 canonical decision values
    And CANONICAL_HARDNESS contains AUDIT (introduced in v6.2.0, was missing before v7.1.0)

  Scenario: Auto-correlation fields are present in the written line
    Given a ctx with type="Bug Fix" and complexity="MEDIA"
    When I write any valid entry
    Then the resulting JSONL line contains run_id, plugin_version, schema_version, type, complexity
