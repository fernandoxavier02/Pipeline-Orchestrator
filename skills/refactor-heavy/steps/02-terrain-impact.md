---
step_number: 2
step_name: "terrain-impact"
execution_mode: inline
expected_inputs:
  - current_structure: from_step_1
  - public_surface: from_step_1
  - modules_in_scope: from_step_1
expected_outputs:
  - callers: list
  - blast_radius: string
  - invariants_to_preserve: list
  - cross_module_couplings: list
  - regression_risk: "low | medium | high"
expected_next: 3
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 02 — Terrain + Impact (Heavy)

## Objective

Map who depends on the public surface from step 1 across all in-scope modules and assess the cross-module blast radius, BEFORE characterization tests are authored. Read-only. The goal is to know exactly what must remain observably identical and to surface cross-module couplings the adversarial review (step 8) will scrutinize.

## Inputs

- `current_structure`, `public_surface`, `modules_in_scope` (from step 1)

## Instructions

1. **Find the callers across modules.** Grep for every consumer of each public-surface name. Record call sites (file:line) and which module each lives in. Cross-module callers are the heavy-tier concern.
2. **Assess blast radius.** Confirm the cross-module reach: which module boundaries the restructure crosses, and which downstream modules would notice if behavior changed.
3. **Enumerate invariants to preserve.** Domain/behavioral invariants the public surface guarantees today (ordering, null-handling, write-once semantics, idempotency, atomicity). These become assertions in the characterization snapshot and review focus for step 8.
4. **Map cross-module couplings.** Shared state, implicit ordering between modules, transactional boundaries, cache/SSOT relationships that the restructure must not perturb.
5. **Rate regression risk** (`low | medium | high`) from caller count, blast radius, and coupling subtlety.

Do NOT change code. Do NOT write tests yet.

## Done criteria

- Callers enumerated with file:line and owning module.
- Blast radius stated with the crossed module boundaries.
- 1-N invariants to preserve listed.
- Cross-module couplings mapped.
- Regression risk rated with rationale.

## Outputs (handoff to step 3)

```yaml
callers:
  - <file:line — module — consumer>
blast_radius: <crossed module boundaries + downstream reach>
invariants_to_preserve:
  - <invariant 1>
cross_module_couplings:
  - <shared state / ordering / transaction / cache-SSOT relationship>
regression_risk: <low | medium | high>
```

## Next

Proceed to `steps/03-characterization-tests.md` (capture current behavior as a MUST-PASS snapshot).
