---
step_number: 3
step_name: "domain-truth-model"
execution_mode: subagent
agent_type: "Explore"
expected_inputs:
  - primary_root_cause: from_step_2
  - applicable_concepts: from_step_2
  - red_test_files: from_step_2
expected_outputs:
  - business_rules: list
  - source_of_truth_per_state: object
  - invariants: list
  - data_model: object
  - ambiguities_and_risks: list
  - property_tests: list
  - transactional_consistency_tests: list
expected_next: 4
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 03 — Domain Truth Model + Source of Truth + Invariants — GAP CLOSED (NET-NEW)

## Objective

Make explicit "what is correct" in the domain so we don't fix the wrong thing. Without writing production code, model the business rules, the source of truth for each piece of state, the **invariants** that must always hold, and the data/state model. This step is the explicit Heavy 3 gap closure from spec §21.2 — v4.3.1 had no equivalent step. The output drives steps 4 (proposal) and 5 (test pre-impl) and constrains what step 6 may change.

## Why subagent (Explore — read-only)

This is a read-only modeling pass. We use the built-in `Explore` agent: it can grep/read aggressively across the codebase but cannot write. The deliverable is a structured description of the domain truth.

## Inputs

- `primary_root_cause` (from step 2)
- `applicable_concepts` (from step 2)
- `red_test_files` (from step 2)

## Instructions

### 3.1 Business rules (explicit and implicit)

Enumerate the business rules relevant to the bug. Distinguish explicit (documented, in code as constants/policies) from implicit (only present in behavior, comments, tests, or product memory). When a rule is ambiguous, list the options and their impacts — do NOT pick one unilaterally; surface to the user at step 4.

### 3.2 Source of truth per state

For each piece of state involved (status, balance, schedule, queue position, cached payload, UI flag), declare where the **official** value lives:
- DB primary record? Event store? In-memory cache? Client-side state?
- If duplicated (cache vs DB, frontend vs backend), which prevails and why?
- Document the read path and the write path separately.

### 3.3 Domain invariants

List the invariants that the domain requires to ALWAYS hold. Invariants are unconditional truths — violations must be impossible. Examples:

- "An order can never have a negative quantity."
- "A user can never have two active subscriptions for the same product."
- "A scheduled job for date D never executes more than once per user."
- "A balance field equals the sum of associated transactions."

For each invariant, cite where in code/schema it is enforced (or note "NOT ENFORCED" — that itself may be the bug). Each invariant becomes a test target for step 5 — both unit-level and **property tests** (when the invariant generalizes over many inputs) and **transactional consistency tests** (when persistence is involved).

### 3.4 Data / state model

Describe the minimal data and state model:
- entities and their keys
- desirable indexes / unique constraints / foreign keys
- state machines (where applicable): e.g., `queued → generated → available → delivered`. Document allowed transitions and forbidden ones (the forbidden transitions are invariants).

### 3.5 Domain risks

Identify classic domain risks and tag each as in-scope/out-of-scope for this fix:
- timezone / DST
- backlog / catch-up runs
- multiple executions for the same user/day (idempotency)
- concurrency between user devices/tabs
- partial failures and the resulting transactional consistency requirements

### 3.6 Property tests (MANDATORY when invariants generalize)

For invariants that hold over many inputs (numerical, ordering, set-membership), define **property tests** that randomly generate cases and assert the invariant. Use the project's property-testing framework (Hypothesis, fast-check, jqwik, Kotest Property, QuickCheck, etc.). Each property test is a precise statement of an invariant turned into thousands of random checks.

Examples:
- Property: "for any list of transactions, balance == sum(transactions.amount)" — invariant via property test.
- Property: "for any two concurrent submissions of the same idempotency key, exactly one record is created" — invariant via property test simulating concurrency.

### 3.7 Transactional consistency tests (MANDATORY when persistence is in scope)

For each multi-step persistence path, define a **transactional consistency test** that:
- Forces a failure mid-transaction (mock the second write to throw, or kill the process before commit).
- Asserts no partial state is observable afterwards (rollback succeeded; no orphan rows; no half-updated documents).
- Confirms the transactional invariant: "either all writes commit, or none do."

These tests, combined with the property tests, form the invariant-protection harness that step 5 will instantiate as failing/expected-to-pass tests, that step 6 must not violate, and that step 7 must run as part of the regression suite.

### 3.8 Ambiguities surfaced to the user

If during 3.1–3.5 you found ambiguities (rules with multiple valid interpretations, sources of truth that are unclear, invariants that conflict with current behavior), list them explicitly. They will be included in the AskUserQuestion prompt at step 4.

## Done criteria

- Business rules listed (explicit + implicit, with ambiguities flagged).
- Source of truth named for every state involved.
- Invariants enumerated with enforcement location (or "NOT ENFORCED" tag).
- Data/state model described, including state machines where present.
- Property tests proposed for generalizing invariants (≥1 if any invariant generalizes).
- Transactional consistency tests proposed for each multi-step persistence path (≥1 if persistence in scope).
- Ambiguities collected for the step 4 gate.

## Outputs (handoff to step 4)

```yaml
business_rules:
  - rule: <text>
    type: explicit|implicit
    ambiguity: <text or "none">
source_of_truth_per_state:
  <state_name>:
    location: <text>
    read_path: <text>
    write_path: <text>
    duplication_resolution: <text or "none">
invariants:
  - statement: <text>
    enforcement: <file:line or "NOT ENFORCED">
    generalizes: true|false
data_model:
  entities: [<list>]
  state_machine:
    states: [<list>]
    allowed_transitions: [<list>]
    forbidden_transitions: [<list>]
ambiguities_and_risks:
  - <ambiguity or risk to surface>
property_tests:
  - target_invariant: <text>
    framework: <name>
    sketch: <pseudocode>
transactional_consistency_tests:
  - persistence_path: <text>
    failure_injection_point: <text>
    expected_post_state: <text>
```

## Why this step matters (gap closure rationale)

Plugin v4.3.1 had no Domain Truth Model step. Bugs that were really invariant violations were "fixed" by patching symptoms; the invariants were never named, so they were never protected by tests, so the same class of bug recurred. This net-new step forces the team to name what is true in the domain (invariants), where truth lives (source of truth), and to encode those truths as **property tests** and **transactional consistency tests** that step 5 instantiates. The invariants then constrain what step 4's proposal may touch and what step 6's diff may break.

## Next

Proceed to `steps/04-controlled-change-proposal.md` — the first user-facing gate of the heavy workflow.
