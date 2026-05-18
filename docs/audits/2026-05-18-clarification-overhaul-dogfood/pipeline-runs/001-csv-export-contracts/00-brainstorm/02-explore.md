# Explore — 001-csv-export-contracts (v6.2 dynamic agent)

## Phase A: Context analysis

### Intake summary
User wants CSV export endpoint for contracts, filtered to "active". Prompt is short; multiple operational decisions implicit.

### Project context read
- **CLAUDE.md (IFRS 16):** enforces ORCHESTRATOR_DECISION YAML prefix for non-trivial tasks; mandates LGPD compliance for PII fields; FastAPI + SQLAlchemy + Alembic stack.
- **pipeline.local.md:** not present (using defaults).
- **AGENTS.md:** routers follow async pattern with `Depends(get_db)` and `Depends(get_current_user)`.

### Affected files inspected

**`backend/app/routers/contracts.py:232-340` — list_contracts**
- Signature: `async def list_contracts(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user), skip: int = 0, limit: int = 100)`
- Returns `List[ContractRead]` (paginated, max 100/page)
- Active filter present: line 248 `.where(Contract.status == 'active')` — answers Lens-2 partially
- **No CSV export endpoint exists yet.** No `/export` route in the router.

**`backend/app/routers/contracts.py:166` — get_active_license**
- Active-license dependency required by all contracts routes; would also apply to export

**`backend/app/schemas/contract.py` (inferred from imports):**
- `ContractRead` fields: id, lessor_name (PII), lessee_name (PII), start_date, end_date, status, monthly_amount, currency

### SSOT collisions detected
None. "Active" semantically consistent — status column with enum `['active', 'terminated', 'draft']`. No conflicting definitions.

### Git state
- branch: test/po-eval/C8-clarification-overhaul
- recent commits in scope: zero (contracts.py untouched recently)
- uncommitted: none

### Domain flags
- **Auth** ✓ (active-license dependency)
- **PII** ✓ (lessor/lessee names — LGPD applies per CLAUDE.md)
- payment: no
- migration: no
- concurrency: no

---

## Phase B: Gap inventory

| Lens | Status | Notes |
|---|---|---|
| 1. Intent | ANSWERED | "Export filtered list of contracts for offline review" — clear |
| 2. Scope boundary | ANSWERED | Endpoint = `/contracts/export`; "active" = `status='active'` (line 248 confirms convention) |
| 3. Acceptance signal | **ASKED Q1** | Stream-on-the-fly vs. full-buffer-then-download not implied by prompt |
| 4. Domain risk (PII) | **ASKED Q2** | LGPD masking strategy for lessor/lessee names not specified |
| 5. Non-functional (perf) | **ASKED Q3** | Existing pagination caps at 100/page; export must decide cap or stream |
| 6. Integration contract | ANSWERED | Same `Depends(get_current_user)` + active-license pattern as list_contracts |
| 7. Migration & rollout | ANSWERED | Additive route, no schema change, no migration |
| 8. Failure surface | **ASKED Q4** | What happens if user has 50k contracts? Timeout? Background job? |
| 9. Test strategy | **ASKED Q5** | Real DB fixture vs. mock for testing CSV bytes? |
| 10. Pattern alignment | ANSWERED | No existing export route — this run sets the convention |
| 11. Stakeholders & timing | ANSWERED | Internal admin tool, no deadline specified |
| **Auth ext** | ANSWERED | Same active-license requirement |
| **PII ext** | rolled into Q2 | — |

Total: **5 gaps** out of 11 lenses → 5 GATE_REQUEST emissions.

---

## Phase C: Q&A (simulated for dogfood — auto-mode bypassed real questioning)

### Q1 (explore-Q1) — Streaming
- **Asked because:** Lens 3 — prompt doesn't say if response is full file (download) or streaming (HTTP chunked); affects memory budget
- **Options presented:**
  - (A) StreamingResponse, chunk per row (recommended — FastAPI native, memory-safe for large exports)
  - (B) Full buffer → Response(content=csv_bytes) (simpler, OK for <10k contracts)
  - (C) Background job + email link (over-engineered for V1)
- **User chose (simulated):** A — StreamingResponse
- **Telemetry tag:** CLARIFICATION_RESOLVED

### Q2 (explore-Q2) — PII masking
- **Asked because:** Lens 4 + LGPD flag from CLAUDE.md; lessor/lessee names are PII
- **Options presented:**
  - (A) Full names in CSV, log access to lgpd_access_log table (recommended — admin-only endpoint, audit-trail satisfies LGPD)
  - (B) Mask names (initials only) (over-restrictive — admin needs full data)
  - (C) Configurable via query param `?mask=true` (adds complexity)
- **User chose (simulated):** A
- **Telemetry tag:** CLARIFICATION_RESOLVED

### Q3 (explore-Q3) — Result cap
- **Asked because:** Lens 5 — existing pagination caps at 100; export must override or inherit
- **Options presented:**
  - (A) No cap, full active set (recommended for /export semantics)
  - (B) Cap at 10k with HTTP 413 if exceeded
  - (C) Default 1000, query param to override
- **User chose (simulated):** A
- **Telemetry tag:** CLARIFICATION_RESOLVED

### Q4 (explore-Q4) — Timeout behaviour
- **Asked because:** Lens 8 — pairs with Q3; if no cap, what's the deadline?
- **Options presented:**
  - (A) 60s timeout, error response if exceeded (recommended — matches gunicorn worker timeout)
  - (B) No timeout, rely on client cancel
  - (C) Background job for >5k rows
- **User chose (simulated):** A
- **Telemetry tag:** CLARIFICATION_RESOLVED

### Q5 (explore-Q5) — Test strategy
- **Asked because:** Lens 9 — IFRS 16 test fixtures vary; integration tests use real PostgreSQL via testcontainers
- **Options presented:**
  - (A) Integration test with testcontainers Postgres + 5 contracts fixture (recommended — matches existing contracts test in tests/integration/test_contracts.py)
  - (B) Unit test with mocked AsyncSession
  - (C) Both
- **User chose (simulated):** A
- **Telemetry tag:** CLARIFICATION_RESOLVED

---

## Skipped lenses & rationale

- **Lens 1 (Intent):** answered in prompt — "export for offline review"
- **Lens 2 (Scope):** answered by reading contracts.py:248 — "active" = `status='active'`
- **Lens 6 (Integration):** convention established in list_contracts
- **Lens 7 (Migration):** additive, no migration needed
- **Lens 10 (Pattern):** no precedent, this run establishes convention
- **Lens 11 (Stakeholders):** internal admin, no deadline

---

## Synthesis

Add `GET /contracts/export.csv` to `backend/app/routers/contracts.py`. Uses `StreamingResponse` with chunk-per-row generator filtering `status='active'`. Inherits the `Depends(get_current_user)` + active-license guard already enforced by list_contracts. Logs access to `lgpd_access_log` for PII audit trail. 60-second worker timeout. Integration test mirrors `tests/integration/test_contracts.py` pattern with testcontainers Postgres + 5-contract fixture. No DB migration.
