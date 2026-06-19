---
step_number: 1
step_name: "understand-scope"
execution_mode: inline
expected_inputs:
  - refactor_description: from_user
expected_outputs:
  - current_structure: string
  - public_surface: list
  - restructure_goal: string
  - decision_points: list
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 01 — Understand Scope (Light)

## Objective

Quickly understand what the target code does today and what its PUBLIC surface is, before any restructure proposal. This step is read-only — no proposals, no code changes, no tests yet. The public surface identified here is what step 3 will characterize and step 6 will prove unchanged.

## Inputs

- `refactor_description` (from user $ARGUMENTS): free-form description of the cleanup — which module/region, and what the restructure goal is (rename, extract, inline, move, restructure internal data).

## Instructions

Using the description and codebase exploration tools (`Read`, `Grep`, `Glob`), answer:

1. **What does the target code do today?** Describe current behavior in plain language, grounded in the actual code (cite file:line references). This is the behavior that must NOT change.
2. **What is the PUBLIC surface?** Enumerate the externally observable contract: exported functions/classes/endpoints, their signatures, error codes/exceptions raised, output formats, and side-effects (writes, emits, network calls). This list is the anchor for the characterization snapshot in step 3.
3. **What is the restructure goal?** State plainly what cleaner shape you want (e.g., "extract the 80-line `parse()` into three named helpers", "rename `mgr` → `connectionManager`", "move validation out of the controller into a pure function").
4. **Where are the relevant decision points / seams?** Branches, polymorphic dispatch, configuration toggles, module boundaries that the restructure will cross or preserve.

Do NOT propose the diff yet. Do NOT write tests yet. Do NOT change code.

If the description is ambiguous about which behavior is "public" vs "internal", use AskUserQuestion to disambiguate before proceeding (Non-Invention guard) — the public/internal boundary determines what the IDENTICAL check in step 6 binds to.

## Done criteria

- Current behavior described in 2-5 sentences with file:line citations.
- Public surface enumerated (exported names + signatures + error codes + output formats + side-effects).
- Restructure goal stated in 1-3 sentences.
- 1-5 key decision points / seams listed.

## Outputs (handoff to step 2)

```yaml
current_structure: <description grounded in code>
public_surface:
  - <exported name / signature / error code / output format / side-effect>
  - ...
restructure_goal: <what cleaner shape is wanted>
decision_points:
  - <file:line — seam or branch>
  - ...
```

## Next

Proceed to `steps/02-terrain-impact.md` (map the terrain + who depends on this surface).
