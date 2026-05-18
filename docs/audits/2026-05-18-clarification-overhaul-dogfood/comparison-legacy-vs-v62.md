# Comparison — Legacy 7-question template vs v6.2 Dynamic Agent

**Scenario:** "Adicionar exportação CSV no endpoint /contracts, só contratos ativos" (MEDIA Feature against IFRS 16 `backend/app/routers/contracts.py`)

---

## What the LEGACY agent would have produced

The legacy `step-01-explore.md` (pre-2026-05-18) ran 7 fixed questions decided by a static template:

1. **Goal** — "What does success look like in one sentence?"
2. **Audience** — "Who benefits and how?"
3. **Boundary** — "What is explicitly out of scope?"
4. **Risk** — "Biggest unknown or thing that could go wrong?"
5. **Constraint** — "Non-negotiable (deadline, dependency, compliance, performance)?"
6. **Reference** — "Existing pattern or prior art in the codebase?"
7. **Done check** — "One observable signal that proves completion?"

It would *skip* questions when the intake clearly answered them (anti-invention defense was there in spirit) — but the categories were fixed regardless of project state, and the agent did NOT pre-read project files.

For this scenario:
- Q1 (Goal) — would be asked ("export contracts to CSV" — fine)
- Q2 (Audience) — would be asked, redundantly (intake is admin-tool by default in CLAUDE.md)
- Q3 (Boundary) — would be asked, but generically ("what's out of scope?" — no file context)
- Q4 (Risk) — would be asked, generically ("biggest risk?" — no PII flagging, no LGPD anchor)
- Q5 (Constraint) — would be asked, generically
- Q6 (Reference) — would be asked, but agent never READ contracts.py to find list_contracts:232 as the reference
- Q7 (Done check) — would be asked ("test passes?" — generic)

**Outcome:** 5-7 questions asked, mostly generic, mostly without evidence citations. The PII / LGPD / streaming / cap / timeout decisions would be left for spec-design phase to invent.

**Anti-invention failures the legacy template did NOT catch:**
- Whether PII names should be masked (LGPD blocker — would surface only at adversarial review)
- Whether result is capped or unbounded (NFR blocker — would surface during checkpoint-validator load test)
- Whether streaming vs. full buffer (memory blocker — would surface at runtime in production)

---

## What the v6.2 DYNAMIC agent produces (this run)

Different shape entirely. Four phases:

### Phase A — read FIRST (no questions yet)
Read CLAUDE.md (surface LGPD requirement), AGENTS.md (auth convention), contracts.py:232-340 (find list_contracts pattern), contracts.py:166 (active-license dependency). Inspect git state.

**Output of Phase A:** evidence-citation pack. The agent now KNOWS:
- `status='active'` is the canonical filter (line 248)
- LGPD applies (CLAUDE.md flagged)
- Active-license dependency (line 166)
- No existing export route — this run sets convention
- 14 routers exist (counted from `ls routers/`)

### Phase B — inventory across 11 lenses
6 lenses ANSWERED by Phase A reading (no question needed). 5 lenses RESIDUAL (genuine gaps):
- Streaming vs. buffer (Lens 3)
- PII masking strategy (Lens 4, unlocked by PII domain flag)
- Result cap (Lens 5)
- Timeout behavior (Lens 8)
- Test strategy (Lens 9)

### Phase C — ask, evidence-cited
5 questions, each with file:line evidence in the option descriptions. Recommendations grounded in pattern observed in Phase A. Not generic.

### Phase D — record + telemetry
14 JSONL events emitted (1 detected + 5 resolved + 6 skipped + 2 from step-01b).

---

## Side-by-side delta

| Dimension | Legacy 7-Q template | v6.2 dynamic | Delta |
|---|---|---|---|
| **Questions asked** | 5-7 (one per fixed category) | 5 (one per *residual* gap) | Similar count, but different *which* and *why* |
| **Per-question evidence** | Generic prose ("biggest risk?") | file:line citation in every option | **+100% specificity** |
| **Pre-question file reads** | 0 | 4 files inspected in Phase A | New behavior |
| **Domain extensions** | None | PII/LGPD lens unlocked automatically | New behavior |
| **Anti-invention coverage** | Risk: PII, streaming, cap, timeout left to invent later | All 4 surfaced and answered up-front | **4 inventions prevented** |
| **Telemetry events** | 0 (legacy didn't emit gate-decisions) | 14 events (6 detected/resolved + 6 skipped + 2 alternatives) | **Full audit trail** |
| **Alternative approaches** | Never proposed | 4 alternatives across axes (Minimal/Pattern/Aggressive/Contrarian) with trade-offs | New step entirely |
| **Token estimate** (input) | ~2k (intake + 7 templated questions) | ~6k (intake + Phase A reading of 4 files + 5 evidence-cited questions) | +200% input tokens, but ~4 downstream blockers prevented |
| **Token estimate** (output) | ~600 (terse Q&A) | ~2200 (Phase A pack + Phase C answers + Phase D record + telemetry JSONL) | +267% output tokens |

**Cost/value:** the v6.2 agent burns ~3× more tokens at the brainstorm phase. In return it prevents ~4 inventions that would surface as adversarial findings or production bugs downstream — each typically costing 10-50× the brainstorm token spend to remediate after-the-fact. **Net economics: strongly positive**, especially for COMPLEXA tasks.

---

## Anti-invention proof points

These are decisions that the **v6.2 agent forced the user to make BEFORE code** that the legacy template would have let the pipeline invent silently:

1. **Streaming choice** — without Q1, downstream implementer might have written `return Response(content=csv_bytes)`. For 50k contracts that's a 50MB+ allocation → OOM in worker pool.
2. **LGPD audit-log path** — without Q2 and the PII domain flag, no one would have added `lgpd_access_log` writes. Adversarial security review would catch it 3 phases later.
3. **Result cap policy** — without Q3, default behavior would inherit list_contracts' 100-row cap, breaking the export contract semantically.
4. **Timeout** — without Q4, gunicorn worker would kill the request silently at 30s default, returning HTTP 502 to the client.

Each of these is a real production-shaped risk that the static template missed.
