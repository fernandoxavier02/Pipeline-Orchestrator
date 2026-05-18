# Alternatives — 001-csv-export-contracts (v6.2 step-01b)

## Implicit plan (anchor)

> The user's implicit plan is: **expose** a CSV-export route on the contracts router using FastAPI conventions, bounded by `status='active'` and authenticated like list_contracts.

## Alternatives proposed

### A1 — Minimal (auth-gated query, no new route)
- **Description:** Add `?format=csv` query param to existing `GET /contracts` — same route, content-negotiation switch.
- **Trade-off:** Smaller diff, no new test surface. But muddies the list_contracts contract (return type becomes union), breaks OpenAPI codegen for any client expecting JSON.
- **Wins when:** team treats route count as a cost and clients tolerate union return types.
- **Evidence:** `contracts.py:232` list_contracts currently returns `List[ContractRead]`; adding format param would require Response | StreamingResponse return-type annotation.

### A2 — Pattern-aligned (new dedicated route)
- **Description:** `GET /contracts/export.csv` as a separate route. Clear semantics, dedicated OpenAPI entry. **THIS IS THE IMPLICIT PLAN.**
- **Trade-off:** One extra route to maintain; clean separation.
- **Wins when:** team values endpoint clarity; OpenAPI doc is consumed by external clients.
- **Evidence:** Matches FastAPI community convention (Tiangolo docs on response_class for CSV). No existing export precedent in the codebase to align against.

### A3 — Aggressive (generic export framework)
- **Description:** Build `app/core/export.py` registry: any router can register a model as exportable, get `/{resource}/export.csv` for free.
- **Trade-off:** Big surface — touches 5+ files, introduces an abstraction. Pays off only if 3+ resources need export.
- **Wins when:** roadmap shows export needs for companies, contracts, payments, etc.
- **Evidence:** `routers/` has 14 resource routers (`ls backend/app/routers`); only contracts has a clear export need today (per prompt). Premature.

### A4 — Contrarian (skip server-side; client downloads JSON and converts)
- **Description:** Don't build CSV export at all. Frontend (`dashboard/`) fetches paginated JSON via existing list_contracts and converts client-side.
- **Trade-off:** Zero backend change; offloads transformation cost to browser. Loses LGPD access-log capability (no server hook for audit). Loses ability to enforce server-side cap.
- **Wins when:** team is backend-constrained and dashboard is the only client.
- **Evidence:** `dashboard/` exists with React stack (per `ls D:/IFRS 16 (do replit para o Cursor)`). Audit trail concern is a hard blocker per CLAUDE.md LGPD section, though — A4 likely fails compliance.

---

## User choice (simulated for dogfood)

- **Chosen:** A2 — Pattern-aligned (the implicit plan)
- **Rationale:** A1 breaks contract clarity; A3 premature; A4 fails LGPD audit-trail requirement. A2 wins on every axis except diff size, which is acceptable.

## Synthesis (updated)

`GET /contracts/export.csv` as a new dedicated route. Same auth/active-license guard as list_contracts. StreamingResponse with chunk-per-row generator. Full active set (no pagination cap), 60s timeout. PII logged to lgpd_access_log. Integration test with testcontainers fixture mirroring tests/integration/test_contracts.py.
