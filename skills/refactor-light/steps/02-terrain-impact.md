---
step_number: 2
step_name: "terrain-impact"
execution_mode: inline
expected_inputs:
  - current_structure: from_step_1
  - public_surface: from_step_1
  - restructure_goal: from_step_1
expected_outputs:
  - callers: list
  - blast_radius: string
  - invariants_to_preserve: list
  - regression_risk: "low | medium | high"
expected_next: 3
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 02 — Terrain + Impact (Light)

## Objective

Map who depends on the public surface from step 1 and assess the blast radius of the restructure, BEFORE characterization tests are authored. This is read-only. The goal is to know exactly what must remain observably identical, and to surface early any signal that this is actually a cross-module job (→ escalate at step 7).

## Inputs

- `current_structure`, `public_surface`, `restructure_goal` (from step 1)

## Instructions

1. **Find the callers.** Grep for every consumer of each public-surface name from step 1. Record the call sites (file:line). These are who would notice if behavior changed.
2. **Assess blast radius.** Is the restructure truly contained in one module, or do the callers cross module/package boundaries? A cross-module blast radius is a strong signal to escalate to `refactor-heavy` at step 7.
3. **Enumerate invariants to preserve.** List the domain/behavioral invariants the public surface guarantees today (e.g., "returns sorted ascending", "never throws on empty input — returns []", "writes exactly once per call"). These become assertions in the characterization snapshot.
4. **Rate regression risk** (`low | medium | high`) based on caller count, blast radius, and whether any invariant is subtle/implicit. This feeds the step 7 complexity gate.

Do NOT change code. Do NOT write tests yet.

## Done criteria

- Callers enumerated with file:line (or "none — internal only").
- Blast radius stated as single-module or cross-module, with evidence.
- 1-N invariants to preserve listed.
- Regression risk rated with a one-line rationale.

## Outputs (handoff to step 3)

```yaml
callers:
  - <file:line — consumer>
  - ...
blast_radius: <single-module | cross-module> — <evidence>
invariants_to_preserve:
  - <invariant 1>
  - ...
regression_risk: <low | medium | high>
```

## Next

Proceed to `steps/03-characterization-tests.md` (capture current behavior as a MUST-PASS snapshot).
