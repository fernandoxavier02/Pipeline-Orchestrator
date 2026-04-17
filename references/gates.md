# Gate System Reference

> **SSOT** for gate definitions — hardness taxonomy and the 15-gate registry. `commands/pipeline.md` Grep-redirects here when it needs the full table with trigger conditions and recovery actions. Operational audit mechanics (Phase Transition Summary block template, Gate Decision Log JSONL format + parse/sanitization rules) live in `references/audit-trail.md` — they evolve independently from gate definitions. If you change gate hardness levels or registry rows, update this file; downstream tooling parses it.

---

## Gate Hardness Taxonomy

Each gate has a formal **hardness** level that determines enforcement behavior:

| Hardness | Meaning | Can be skipped? | User override? | Operational distinction |
|----------|---------|-----------------|----------------|------------------------|
| **MANDATORY** | Never bypassed — not even by `--hotfix` or `--force` flags | No | No | Applies regardless of mode, flags, or user request. Cannot be downgraded. Used for structural integrity (SSOT) and domain-mandated security reviews |
| **HARD** | Blocks until resolved — pipeline waits for resolution | No | No | Can be resolved by user action (answering questions, approving tests, fixing code). Once resolved, pipeline proceeds. Differs from MANDATORY in that HARD gates have a clear resolution path; MANDATORY gates have no "resolve and continue" — they represent invariants |
| **CIRCUIT_BREAKER** | Pipeline stops for safety — requires explicit reset | No | Reset only | Triggered by repeated failures. Pipeline cannot continue without user intervention. **Reset procedure:** user is presented with options: (A) retry from Phase 1.5 with re-planning, (B) retry the failed step with different approach, (C) exit pipeline. User must explicitly choose one. The reset choice is logged to gate-decisions.jsonl with `decision: "RESET"` |
| **SOFT** | Recommended, user can skip with explicit acknowledgment | Yes (logged) | Yes | Always logged when skipped. Skipping applies confidence penalty. Some SOFT gates escalate to HARD when sensitive domains are touched (see Gate Registry) |

---

## Gate Registry

| Gate | Hardness | Trigger | Action | Recovery |
|------|----------|---------|--------|----------|
| SSOT_CONFLICT | **MANDATORY** | Multiple sources of truth | **TOTAL BLOCK** | User must resolve |
| ADVERSARIAL_GATE_MANDATORY | **MANDATORY** | Batch touches auth/crypto/data | **BLOCK** — cannot skip | Must approve |
| INFO_GATE_BLOCKED | **HARD** | Critical information gap | **BLOCK** Phase 0 | Answer questions |
| TDD_APPROVAL | **HARD** | Tests need approval | **BLOCK** until approved | User approves |
| PLAN_REJECTED | **HARD** | User rejects implementation plan | **RETURN** to Phase 1 | Re-classify or exit |
| STOP_RULE | **CIRCUIT_BREAKER** | 2 consecutive failures | **STOP pipeline** | Escalate to user |
| FIX_LOOP_EXHAUSTED | **CIRCUIT_BREAKER** | 3 fix attempts failed | **STOP pipeline** | Propose alternatives |
| STALE_CONTEXT | **SOFT** | `/pipeline continue` with context > 24h | **ASK** — revalidate? | Re-run Phase 0 or proceed |
| MICRO_GATE_GAP | **HARD** | Per-task missing info | **STOP** task | Report gap, ask user |
| CHECKPOINT_FAIL | **HARD** | Build/test fails | Return to executor | Fix and re-validate |
| ADVERSARIAL_BLOCK | **HARD** | Critical findings | Fix loop (max 3) | Fix or escalate |
| ADVERSARIAL_GATE | **SOFT** | Post-checkpoint per batch | **ASK** user (yes/skip/adjust) | Must approve/skip |
| FINAL_ADVERSARIAL_GATE | **SOFT** | Post-sanity, pre-validator | **ASK** user (recommended) | Must approve/skip |
| FINAL_ADVERSARIAL_REWORK | **HARD** | Final adversarial reports CRITICAL findings | **ASK** user (A: fix batch / B: proceed / C: discard) | Fix batch or proceed with penalty |
| CLOSEOUT_CONFIRM | **SOFT** | Push+PR or Discard | **PAUSE** — confirm | User confirms |

**Rules (definitions only — operational write mechanics are in `references/audit-trail.md`):**
1. When a SOFT gate is skipped, the decision MUST be logged with `decision: "SKIPPED"`. The `final-validator` MUST check this log and factor skipped gates into the GO/CONDITIONAL/NO-GO decision. (Write path mechanics: see `references/audit-trail.md`.)


---

## See Also

- **`references/audit-trail.md`** — Phase Transition Summary block template + Gate Decision Log JSONL format with its 8 parse/sanitization rules. Pipeline controllers grep that file for transition/log formats.
- **`commands/pipeline.md`** — the authoritative pipeline flow. The Inline Invariants block there overrides any Grep-loaded content from this file if they disagree (tampering defense).
