# Intake — 001-csv-export-contracts

## User prompt (verbatim)

> "Adicionar exportação CSV no endpoint /contracts, só contratos ativos"

## Classification (from task-orchestrator)

- **Type:** Feature
- **Complexity:** MEDIA
- **Severity:** Medium
- **Pipeline variant:** implement-light
- **Probable files:**
  - `backend/app/routers/contracts.py` (list_contracts at line 232)
  - `backend/app/schemas/contract.py` (response schema)
  - `backend/app/crud.py` (active filter helper, if exists)
- **Has spec:** No (will be created via brainstorm + spec lifecycle since MEDIA auto-dispatches)

## Git state

- branch: test/po-eval/C8-clarification-overhaul
- uncommitted: none
- recent commits in scope: last 20 untouched contracts.py
- domain flags: PII (lessor/lessee names), auth required (active license dependency)

## Authorization context

User invoked under `--no-prep` would skip brainstorm. Here we run the new brainstorm explicitly to observe behavior.
