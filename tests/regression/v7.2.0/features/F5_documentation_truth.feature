# BDD Gherkin artifact — Batch 1, Bounded Context: Documentation Truth
# Slice: agent prompt narrative MUST NOT contradict runtime behavior
# Followup to v7.2.0 fix (commit 740704c) — auto-confession was left stale by scope-lock

Feature: Plan-architect documentation truth (auto-confession sync)
  As the Pipeline-Orchestrator maintainer
  I want plan-architect.md to NEVER claim a producer is "not wired" when it actually is
  So that auditors reading the agent prompt get the real state of the system

  Background:
    Given the file agents/quality/plan-architect.md exists
    And the BOUNDED_CONTEXT_MISSING producer was wired into pipeline-controller.md Step 1.5-post in v7.2.0 (commit 740704c, 2026-05-20)
    And the previous text in plan-architect.md line ~279 claimed "Status: SPEC-ONLY (v6.1.0) — producer not yet wired; pipeline-controller emission routine slated for v6.2"

  Scenario: Auto-confession is removed (negative assertion)
    Given the content of agents/quality/plan-architect.md
    When I search for the phrase "producer not yet wired"
    Then I find zero matches
    And When I search for the phrase "slated for v6.2"
    Then I find zero matches

  Scenario: WIRED status is declared (positive assertion)
    Given the content of agents/quality/plan-architect.md
    When I search for evidence that the producer is now wired
    Then I find at least one of: "WIRED in v7.2.0", "Status: WIRED", "Step 1.5-post", or "pipeline-controller.md Step 1.5-post"

  Scenario: Cross-reference to test file is documented
    Given the updated WIRED status block in plan-architect.md
    When I read the surrounding paragraph
    Then it mentions the regression test path "tests/regression/v7.2.0/F1.cjs" OR the file name "F1.cjs"
    So that future maintainers can trace the contract back to its proof
