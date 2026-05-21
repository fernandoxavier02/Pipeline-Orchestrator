# Gate System Reference

> **SSOT** for gate definitions — hardness taxonomy and the 22-gate registry. `commands/pipeline.md` Grep-redirects here when it needs the full table with trigger conditions and recovery actions. Operational audit mechanics (Phase Transition Summary block template, Gate Decision Log JSONL format + parse/sanitization rules) live in `references/audit-trail.md` — they evolve independently from gate definitions. If you change gate hardness levels or registry rows, update this file; downstream tooling parses it.

---

## Gate Hardness Taxonomy

Each gate has a formal **hardness** level that determines enforcement behavior:

| Hardness | Meaning | Can be skipped? | User override? | Operational distinction |
|----------|---------|-----------------|----------------|------------------------|
| **MANDATORY** | Never bypassed — not even by `--hotfix` or `--force` flags | No | No | Applies regardless of mode, flags, or user request. Cannot be downgraded. Used for structural integrity (SSOT) and domain-mandated security reviews |
| **HARD** | Blocks until resolved — pipeline waits for resolution | No | No | Can be resolved by user action (answering questions, approving tests, fixing code). Once resolved, pipeline proceeds. Differs from MANDATORY in that HARD gates have a clear resolution path; MANDATORY gates have no "resolve and continue" — they represent invariants |
| **CIRCUIT_BREAKER** | Pipeline stops for safety — requires explicit reset | No | Reset only | Triggered by repeated failures. Pipeline cannot continue without user intervention. **Reset procedure:** user is presented with options: (A) retry from Phase 1.5 with re-planning, (B) retry the failed step with different approach, (C) exit pipeline. User must explicitly choose one. The reset choice is logged to gate-decisions.jsonl with `decision: "RESET"` |
| **SOFT** | Recommended, user can skip with explicit acknowledgment | Yes (logged) | Yes | Always logged when skipped. Skipping applies confidence penalty. Some SOFT gates escalate to HARD when sensitive domains are touched (see Gate Registry) |
| **AUDIT** (v6.2+) | Informational telemetry — never blocks, never asks | n/a | n/a | Used for observability events that need a first-class gate row in `gate-decisions.jsonl` rather than being smuggled into SOFT/COMPLETED entries. Examples: `CLARIFICATION_GAPS_DETECTED`, `ALTERNATIVES_PROPOSED`. Does NOT count toward fidelity score; does NOT apply confidence penalty |

---

## Gate Registry

| Gate | Hardness | Trigger | Action | Recovery |
|------|----------|---------|--------|----------|
| SSOT_CONFLICT | **MANDATORY** | Multiple sources of truth | **TOTAL BLOCK** | User must resolve |
| ADVERSARIAL_GATE_MANDATORY | **MANDATORY** | Batch touches auth/crypto/data | **BLOCK** — cannot skip | Must approve |
| INFO_GATE_BLOCKED | **HARD** | Critical information gap | **BLOCK** Phase 0 | Answer questions |
| TDD_APPROVAL | **HARD** | Tests need approval | **BLOCK** until approved | User approves |
| PLAN_REJECTED | **HARD** | User rejects implementation plan | **RETURN** to Phase 1 | Re-classify or exit |
| COMPLEXITY_GATE | **SOFT** | User overrides classifier (`--simples` on COMPLEXA task, etc.) OR classifier confidence below threshold | **ASK** — confirm override or accept classifier | User confirms override (logged) or accepts classification |
| STOP_RULE | **CIRCUIT_BREAKER** | 2 consecutive failures | **STOP pipeline** | Escalate to user |
| FIX_LOOP_EXHAUSTED | **CIRCUIT_BREAKER** | 3 fix attempts failed | **STOP pipeline** | Propose alternatives |
| STALE_CONTEXT | **SOFT** (HARD if COMPLEXA + sensitive domain) | `/pipeline continue` with context > 24h. See `references/stale-thresholds.md` for nomenclature (STALE_SPAWN 5min, STALE_HEARTBEAT 10min, STALE_CONTEXT 24h are three distinct concepts) | **ASK** — revalidate? | Re-run Phase 0 or proceed |
| MICRO_GATE_GAP | **HARD** | Per-task missing info | **STOP** task | Report gap, ask user |
| CHECKPOINT_FAIL | **HARD** | Build/test fails | Return to executor | Fix and re-validate |
| ADVERSARIAL_BLOCK | **HARD** | Critical findings | Fix loop (max 3) | Fix or escalate |
| ADVERSARIAL_GATE | **SOFT** | Post-checkpoint per batch | **ASK** user (yes/skip/adjust) | Must approve/skip |
| FINAL_ADVERSARIAL_GATE | **SOFT** | Post-sanity, pre-validator | **ASK** user (recommended) | Must approve/skip |
| FINAL_ADVERSARIAL_REWORK | **HARD** | Final adversarial reports CRITICAL findings | **ASK** user (A: fix batch / B: proceed / C: discard) | Fix batch or proceed with penalty |
| CLOSEOUT_CONFIRM | **SOFT** | Push+PR or Discard | **PAUSE** — confirm | User confirms |
| STATE_FILE_INIT_FAIL | **CIRCUIT_BREAKER** | `Write` of `{PIPELINE_DOC_PATH}/sentinel-state.json` fails at Phase 0 init (any IO error — permission, disk full, invalid path, read-only fs, signer raise) | **STOP pipeline** before any Agent spawn / DISPATCH_REQUEST | Fix IO root cause (permission, disk, path, parent dir); user re-runs pipeline |
| PROTOCOL_HANDSHAKE_TIMEOUT | **HARD** | A `GATE_REQUEST` / `DISPATCH_REQUEST` / `PLAN_MODE_REQUEST` block emitted by a subagent (information-gate, plan-architect, etc.) is not answered by the parent within the handshake window (default 30 minutes; configurable via `PIPELINE_HANDSHAKE_TIMEOUT_MS` env var). Indicates the parent did not implement the protocol, the AskUserQuestion handler was absent, or the session was abandoned mid-flight. | **STOP pipeline**; emit gate entry; return partial PIPELINE COMPLETE with status `PROTOCOL_HANDSHAKE_TIMEOUT` | Fix parent handler (verify gate-request-protocol parsing wired); user re-invokes pipeline once the handler is restored |

### Spec pipeline gates (Wave 5-spec, v4.13.0)

| Gate | Hardness | Trigger | Action | Recovery |
|------|----------|---------|--------|----------|
| SPEC_ARTIFACT_MISSING | **MANDATORY** | Spec detected but one or more required artifacts (requirements.md / design.md / tasks.md) is missing from `.kiro/specs/<id>/` | **TOTAL BLOCK** — list missing artifacts, halt pipeline | User must create missing artifacts before retry |
| SPEC_FORMAT_GATE_FAIL | **HARD** | spec-format-gate agent emits NO-GO (less than 22 of 25 format checks pass) | **BLOCK** — fix spec artifacts and re-run format gate | AskUserQuestion: Edit / Bypass / Abort |
| SPEC_CONTENT_REVIEW_NOGO | **HARD** | spec-content-reviewer (Heavy variant) emits NO-GO (>=1 critical finding) | **BLOCK** Phase 1.5 | AskUserQuestion: Edit / Justified Bypass / Abort |
| SPEC_AC_TRACEABILITY_GAP | **HARD** | quality-gate-router fails to derive >=1 ATDD scenario per Acceptance Criterion (less than 100% AC coverage) | **BLOCK** TDD phase | AskUserQuestion: Add manually / Re-extract / Mark AC non-testable |
| SPEC_POST_IMPL_FAIL | **HARD** | spec-post-impl-validator score below 75% after adversarial loop exhausted | **BLOCK** | AskUserQuestion: New fix batch (1x) / Accept warnings (limited) / Abort |
| ADVERSARIAL_LOOP_CHECKPOINT | **SOFT** (with escalation) | Every 3 fix-loop attempts within a single spec batch without reaching CLEAN adversarial result. Counter resets when batch transitions | **ASK** | AskUserQuestion: Continue (next 3) / Escalate to Heavy variant / Accept warnings / Abort |

> **Note on "SOFT (with escalation)":** the hardness taxonomy describes LEVELS, not GATES. `ADVERSARIAL_LOOP_CHECKPOINT` is fundamentally a SOFT gate (user can continue), but its repeated triggering within a single batch is itself a signal that recovery should escalate (e.g., switch to Heavy variant). The escalation is a recovery-action pattern, not a new hardness level.

### Pipeline routing gates (v5.1.0)

| Gate | Hardness | Trigger | Action | Recovery |
|------|----------|---------|--------|----------|
| STEP_1_7_ROUTING | HARD | Pipeline pre-execution routing decision in STEP 1.7 (load-existing / dispatch-brainstorm / no-prep-override / simples-bypass). | Append entry to gate-decisions.jsonl with the chosen branch. | None — informational. |
| STEP_1_7_RECURSION_GUARD | CIRCUIT_BREAKER | STEP 1.7 entered >=3 times in same pipeline invocation. | Halt pipeline; emit RUN_PARTIAL with cause. | User re-invokes pipeline (no automatic retry). |
| STOP_BEFORE_PA_DE_CAL | HARD | verify-completion returned FAIL before final-validator dispatch. | Skip Pa de Cal; set pipeline status NO-GO; write 04-final-report.md with FAIL details. | User addresses verify-completion findings; re-runs pipeline. |

### Brainstorm clarification gates (v6.2.0, dynamic exhaustive clarification + alternatives)

| Gate | Hardness | Trigger | Action | Recovery |
|------|----------|---------|--------|----------|
| CLARIFICATION_GAPS_DETECTED | AUDIT | step-01-explore Phase B completes inventory; logs gap count per lens. | Append informational entry to gate-decisions.jsonl with gap totals + lens coverage. | None — informational, drives downstream metrics. |
| CLARIFICATION_RESOLVED | HARD | User answers a clarification GATE_REQUEST emitted by step-01-explore Phase C. | Append entry per resolved question with `decided_by: user`. | None — answer recorded, controller advances. |
| CLARIFICATION_SKIPPED | SOFT | step-01-explore Phase A determined a lens was already answered by intake — no question raised. | Append entry per skipped lens with rationale (where intake answered it). | None — confidence-neutral. |
| ALTERNATIVES_PROPOSED | AUDIT | step-01b-alternatives Phase B emitted N alternative approaches alongside the implicit plan. | Append informational entry with axis list + alternative names. | None — informational. |
| ALTERNATIVE_CHOSEN | SOFT | User picked an approach from step-01b GATE_REQUEST (implicit plan or named alternative). | Append entry with decision = chosen approach name. | None — choice persisted in 02b-alternatives.md. |
| ALTERNATIVES_SKIPPED | SOFT | step-01b auto-skip rule satisfied (mechanical + zero open lenses + ≤2 files + SIMPLES). | Append informational entry. | None. |
| STEP_01_GAP_LEAKED | SOFT | step-01b detected a clarification gap that should have been caught in step-01 Phase B. | Append entry; recommend re-running step-01-explore. | Controller may decide to loop back to step-01 (Phase 0 retry). |

**AUDIT hardness:** new level in the taxonomy as of v6.2.0. Informational only — never blocks, never asks, never penalises confidence. Exists so observability events have a first-class gate row rather than masquerading as SOFT skipped/COMPLETED entries.

**Rules (definitions only — operational write mechanics are in `references/audit-trail.md`):**
1. When a SOFT gate is skipped, the decision MUST be logged with `decision: "SKIPPED"`. The `final-validator` MUST check this log and factor skipped gates into the GO/CONDITIONAL/NO-GO decision. (Write path mechanics: see `references/audit-trail.md`.)


---

## Mandatory Gates by Complexity

> Which gates are MANDATORY to trigger (at least once during a run) for each complexity bucket. The `fidelity-reporter` library (`lib/fidelity-reporter.cjs`) consumes this table to compute the fidelity score = `mandatory_triggered / mandatory_expected`. The table is parsed by `tests/regression/v6.1.0/F1_gates_mandatory_section.cjs` — adding/removing rows or columns will break that test on purpose (the table and the JS constant must stay in sync).
>
> Reading: a `✓` in a complexity column means "this gate is part of the mandatory set for that complexity". Empty cell = not mandatory (still allowed to trigger; just not required). Spec-pipeline rows have `✓` in the rightmost "Spec (+)" column to indicate they are additionally mandatory when `type=Spec`.

| Gate | SIMPLES | MEDIA | COMPLEXA | Spec (+) |
|------|---------|-------|----------|----------|
| STATE_FILE_INIT_FAIL | ✓ | ✓ | ✓ |  |
| INFO_GATE_BLOCKED | ✓ | ✓ | ✓ |  |
| TDD_APPROVAL | ✓ | ✓ | ✓ |  |
| CHECKPOINT_FAIL | ✓ | ✓ | ✓ |  |
| COMPLEXITY_GATE | ✓ | ✓ | ✓ |  |
| CLOSEOUT_CONFIRM | ✓ | ✓ | ✓ |  |
| PLAN_REJECTED |  | ✓ | ✓ |  |
| MICRO_GATE_GAP |  | ✓ | ✓ |  |
| ADVERSARIAL_GATE |  | ✓ | ✓ |  |
| ADVERSARIAL_BLOCK |  | ✓ | ✓ |  |
| STOP_RULE |  | ✓ | ✓ |  |
| FINAL_ADVERSARIAL_GATE |  |  | ✓ |  |
| FINAL_ADVERSARIAL_REWORK |  |  | ✓ |  |
| FIX_LOOP_EXHAUSTED |  |  | ✓ |  |
| ADVERSARIAL_GATE_MANDATORY |  |  | ✓ |  |
| SSOT_CONFLICT |  |  | ✓ |  |
| STALE_CONTEXT |  |  | ✓ |  |
| SPEC_ARTIFACT_MISSING |  |  |  | ✓ |
| SPEC_FORMAT_GATE_FAIL |  |  |  | ✓ |
| SPEC_CONTENT_REVIEW_NOGO |  |  |  | ✓ |
| SPEC_AC_TRACEABILITY_GAP |  |  |  | ✓ |
| SPEC_POST_IMPL_FAIL |  |  |  | ✓ |
| ADVERSARIAL_LOOP_CHECKPOINT |  |  |  | ✓ |

**Counts:**
- SIMPLES: 5 (the structural minimum: every code-changing run needs intake validation + TDD approval + checkpoint signal + complexity confirmation + closeout)
- MEDIA: 10 (SIMPLES set + planning gate + per-task micro-gate + adversarial pair + stop rule)
- COMPLEXA: 16 (MEDIA set + final adversarial pair + fix-loop circuit breaker + mandatory adversarial domain trigger + SSOT/STALE invariants)
- Spec (+): +6 when `type=Spec`, regardless of complexity (the Wave 5 spec-pipeline gates from the registry above)

**Cumulative rule:** higher complexity SUPERSETS lower complexity. Anything mandatory for SIMPLES is mandatory for MEDIA and COMPLEXA. Anything mandatory for MEDIA is mandatory for COMPLEXA. Spec (+) gates are additive on top of whatever complexity bucket applies.

---

## See Also

- **`references/audit-trail.md`** — Phase Transition Summary block template + Gate Decision Log JSONL format with its 8 parse/sanitization rules. Pipeline controllers grep that file for transition/log formats. Also documents the cross-run `run-log.jsonl` accumulated log consumed by the fidelity reporter.
- **`references/fidelity-report-schema.md`** — output spec for the per-run `fidelity-report.md` + `fidelity-report.json` files produced by `lib/fidelity-reporter.cjs`.
- **`commands/pipeline.md`** — the authoritative pipeline flow. The Inline Invariants block there overrides any Grep-loaded content from this file if they disagree (tampering defense).
