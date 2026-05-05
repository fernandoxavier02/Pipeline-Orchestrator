# spec-context.yaml — Canonical Schema

**SSOT for the artifact piped into every step of `spec-light`, `spec-heavy`, and `spec-audit-only`.**

This document is the single source of truth for the `spec-context.yaml` shape. The 3 spec lifecycle skills (`skills/spec-light/SKILL.md`, `skills/spec-heavy/SKILL.md`, `skills/spec-audit-only/SKILL.md`) link here instead of redeclaring the schema inline — keeping a single declaration prevents silent drift across the trio.

## Origin and population

`spec-context.yaml` is **created by the task-orchestrator (Phase 0a)** when a spec lifecycle skill is invoked. It is then **populated incrementally by the early steps**:

- `spec-light` — populated by steps 01 (format-gate) and 02 (tdd-scenarios).
- `spec-heavy` — populated by steps 01 (format-gate), 02 (content-review), and 03 (tdd-scenarios).
- `spec-audit-only` — populated by steps 01 (format-gate) and 02 (content-review).

Later steps **read** the artifact but should not mutate fields that earlier steps own. The orchestrator is the only writer for top-level shape; steps fill in their owned sub-fields.

## Required fields

```yaml
spec_context_schema:
  feature_name: string (required)
  spec_path: string (required, abs path to .kiro/specs/<feature>/)
  estimated_complexity: "Light" | "Heavy" | "Audit-Only" (required)
  acceptance_criteria: list of objects (each: { id: "AC#N", text: string, testable: boolean })
  domains_touched: list of strings
  files_affected: integer
  business_rules: list of strings
```

## Field semantics

- **`feature_name`** — the spec slug (e.g., `payment-flow`, `user-onboarding`). Must match `^[a-zA-Z0-9_-]+$` (sanitization allowlist enforced at closure time).
- **`spec_path`** — absolute path to the spec folder, ending in a trailing slash (e.g., `.kiro/specs/payment-flow/`). Used by the format-gate, content-reviewer, and audit-loop to scope file operations.
- **`estimated_complexity`** — one of three discriminated values; determines which lifecycle skill is appropriate (Light / Heavy / Audit-Only). Set by the task-orchestrator's complexity classifier.
- **`acceptance_criteria`** — populated by step 01 (format-gate) after parsing `requirements.md`. Each AC carries `id` (e.g., `AC#1`), `text` (the criterion as written), and `testable` (boolean — `true` if it can become a GIVEN/WHEN/THEN without ambiguity, `false` if it is vague like "system should be fast" without metrics).
- **`domains_touched`** — list of domain areas touched by the feature (e.g., `["billing", "auth", "notifications"]`). Used to size the adversarial review surface and to alert reviewers about cross-cutting concerns.
- **`files_affected`** — rough integer count from the design's component listing or task summary. Used as a complexity signal during planning and to project review effort.
- **`business_rules`** — list of strings extracted from `requirements.md` (the "Business Rules" section if present, or inferred from EARS-form ACs that encode invariants).

## Sub-field reference convention

Steps that consume a sub-field MUST reference it as `spec_context.<field>`, NOT receive it as a separate input. For example:

- step 02 (Light) reads `spec_context.acceptance_criteria` to derive ATDD scenarios.
- step 03 (Heavy) reads `spec_context.acceptance_criteria` similarly.
- step 02 (Audit-Only) reads `spec_context.acceptance_criteria` for the 12-axis content review.

This convention keeps the orchestrator's pipe contract simple (one artifact passed to every step) and makes step ownership of fields explicit.

## Skill cross-references

- `skills/spec-light/SKILL.md` — section "spec-context.yaml schema"
- `skills/spec-heavy/SKILL.md` — section "spec-context.yaml schema"
- `skills/spec-audit-only/SKILL.md` — section "spec-context.yaml schema"

Each of those sections links here. Do not redeclare the schema in any other file — update this one and the linkers will pick it up.
