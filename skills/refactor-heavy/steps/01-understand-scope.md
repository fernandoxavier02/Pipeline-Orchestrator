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
  - modules_in_scope: list
  - decision_points: list
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 01 — Understand Scope (Heavy)

## Objective

Understand what the target code does today and what its PUBLIC surface is across the modules involved, before any restructure proposal. This step is read-only — no proposals, no code changes, no tests yet. The public surface identified here is what step 3 characterizes and step 6 proves unchanged; the modules in scope determine the cross-module blast radius that justified routing to heavy.

## Inputs

- `refactor_description` (from user $ARGUMENTS): which modules/region, and the restructure goal (rename, extract, inline, move, restructure internal data) across module boundaries.

## Instructions

Using the description and codebase exploration tools (`Read`, `Grep`, `Glob`), answer:

1. **What does the target code do today?** Current behavior in plain language, grounded in code (cite file:line). This is the behavior that must NOT change.
2. **What is the PUBLIC surface?** Enumerate the externally observable contract across all modules in scope: exported functions/classes/endpoints, signatures, error codes/exceptions, output formats, side-effects. This is the anchor for the characterization snapshot.
3. **What is the restructure goal?** State plainly the cleaner shape you want and why it crosses module boundaries.
4. **Which modules are in scope?** List the modules/packages the restructure touches — this is the cross-module blast radius the heavy tier exists for.
5. **Where are the relevant decision points / seams?** Branches, polymorphic dispatch, configuration toggles, the module boundaries the restructure crosses or preserves.

Do NOT propose the diff yet. Do NOT write tests yet. Do NOT change code.

If the public/internal boundary is ambiguous, use AskUserQuestion to disambiguate before proceeding (Non-Invention guard) — it determines what the IDENTICAL check in step 6 binds to.

## Done criteria

- Current behavior described in 2-5 sentences with file:line citations.
- Public surface enumerated across all in-scope modules.
- Restructure goal stated in 1-3 sentences.
- Modules in scope listed.
- 1-5 key decision points / seams listed.

## Outputs (handoff to step 2)

```yaml
current_structure: <description grounded in code>
public_surface:
  - <exported name / signature / error code / output format / side-effect>
restructure_goal: <what cleaner shape is wanted>
modules_in_scope:
  - <module/package>
decision_points:
  - <file:line — seam or branch>
```

## Next

Proceed to `steps/02-terrain-impact.md` (map the terrain + who depends on this surface across modules).
