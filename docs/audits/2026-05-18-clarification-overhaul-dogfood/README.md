# C8 — Clarification Overhaul Dogfood

Scenario folder for evaluating the v6.2+ clarification + alternatives overhaul of `@fx-studio-ai/pipeline-orchestrator`.

## What changed in v6.2

1. **Drift fix** — `references/complexity-matrix.md` now declares `Has spec: Required (auto-dispatch)` for MEDIA and COMPLEXA, matching `pipeline-controller.md:281` runtime behavior. Previously the matrix said "Optional for MEDIA".
2. **step-01-explore rewritten** — replaced the fixed 7-question template with a 4-phase dynamic agent. Phase A reads project context (CLAUDE.md, manifest, likely-affected files, git state, SSOT collisions). Phase B inventories gaps across 11 lenses + domain extensions. Phase C asks ONE GATE_REQUEST per gap with cited evidence (file:line). Phase D records + emits telemetry.
3. **step-01b-alternatives NEW** — proposes 2-4 alternative approaches (Minimal / Pattern-aligned / Aggressive / Contrarian) after clarification, with auto-skip for trivial mechanical changes.
4. **5 new gates** + new `AUDIT` hardness level for telemetry-only events.

## How to read this folder

- `pipeline-runs/001-csv-export-contracts/` — a representative MEDIA-class scenario simulating the new flow against a real IFRS 16 endpoint (`backend/app/routers/contracts.py`).
- `comparison-legacy-vs-v62.md` — side-by-side: what the legacy 7-question template would have produced vs. what the v6.2 dynamic agent produces.
- `telemetry-delta.md` — gate-decisions.jsonl comparison: event counts, question specificity, anti-invention coverage.

## Scenario chosen

> **Task:** "Adicionar exportação CSV no endpoint /contracts, só contratos ativos"
> **Classification:** Feature / MEDIA / implement-light
> **Probable files (from intake):** backend/app/routers/contracts.py, backend/app/schemas/contract.py, backend/app/crud.py

Realistic gaps the prompt hides:
- "Ativos" — defined how? `is_active` column? Status enum? End-date check?
- Field set — all model fields or curated subset?
- Pagination — endpoint already paginates (line 232 list_contracts), CSV streams full or page-by-page?
- Auth — same dependency injection pattern as list_contracts?
- LGPD — PII fields (lessor/lessee names) need masking?
- Test — fixture source? Real DB or mocked?

The legacy template would fire all 7 fixed questions regardless. The v6.2 agent asks ONLY for the residuals after reading the actual files.

## Cleanup

This folder is committed only to the `test/po-eval/C8-clarification-overhaul` branch. After evaluation, the branch is deleted (per user directive) and the IFRS 16 main repo returns to its pre-test state.
