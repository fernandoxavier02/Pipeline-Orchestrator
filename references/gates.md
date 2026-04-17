# Gate System Reference

> **SSOT** for the gate taxonomy, registry, phase transition summaries, and the append-only gate decision log. `commands/pipeline.md` Grep-redirects here for the full rules. If you change gate hardness levels, field schemas, or rule numbers, update this file — downstream tooling parses it.

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

**Rules:**
1. When a SOFT gate is skipped, the decision MUST be logged to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl` with `decision: "SKIPPED"`. The `final-validator` MUST check this log and factor skipped gates into the GO/CONDITIONAL/NO-GO decision.
2. **Gate decision log is controller-only:** Only the pipeline controller writes to `gate-decisions.jsonl`. Subagents report gate outcomes in their structured YAML output; the controller appends entries. No subagent writes directly to this file.

---

## Phase Transition Summary (MANDATORY)

**Before transitioning from one phase to the next**, emit a Phase Transition Summary block. This provides visibility into what happened in the completed phase and what carries forward.

```
╔══════════════════════════════════════════════════════════════════╗
║  PHASE TRANSITION: [N] → [N+1]                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  Phase [N] Summary:                                              ║
║    [✓|✗|○] [Agent/Step]: [status]                                ║
║    [✓|✗|○] [Agent/Step]: [status]                                ║
║  Gates triggered: [N] ([list with hardness])                     ║
║  Gates skipped: [N] ([list — SOFT only])                         ║
║  Confidence: [score or N/A]                                      ║
║  Carry-forward: [list of artifacts passed to next phase]         ║
╚══════════════════════════════════════════════════════════════════╝
```

**Symbols:** `✓` = success, `✗` = failed, `○` = skipped/not triggered

**Rules:**
1. Emit BEFORE every phase transition. Possible transitions: `0→1`, then either `1→1.5→2` (if planning runs) or `1→2` (if planning is skipped), then `2→3`. These are mutually exclusive paths — emit only the transitions that actually occur
2. List every gate that was triggered with its hardness level
3. List every SOFT gate that was skipped (for audit trail)
4. Include confidence score if available
5. List exact artifacts being passed to the next phase

---

## Gate Decision Log (MANDATORY)

Every gate decision MUST be appended to `{PIPELINE_DOC_PATH}/gate-decisions.jsonl`. This is a machine-readable audit trail.

**Format (one JSON object per line):**

```jsonl
{"gate":"INFO_GATE_BLOCKED","hardness":"HARD","phase":0,"decision":"RESOLVED","decided_by":"user","timestamp":"2026-03-29T14:30:00","detail":"2 gaps answered","confidence_impact":0.0}
{"gate":"TDD_APPROVAL","hardness":"HARD","phase":2,"decision":"APPROVED","decided_by":"user","timestamp":"2026-03-29T14:45:00","detail":"3 scenarios approved","confidence_impact":0.0}
{"gate":"ADVERSARIAL_GATE","hardness":"SOFT","phase":2,"decision":"SKIPPED","decided_by":"user","timestamp":"2026-03-29T15:00:00","detail":"user chose to skip batch 1 review","confidence_impact":-0.10}
```

**Fields:**
- `gate`: Gate name from the Gate Registry
- `hardness`: MANDATORY | HARD | CIRCUIT_BREAKER | SOFT
- `phase`: Phase number where gate was triggered (0, 1, 1.5, 2, 3)
- `decision`: RESOLVED | APPROVED | BLOCKED | SKIPPED | STOPPED | FAILED
- `decided_by`: `user` (explicit user response via AskUserQuestion) | `system` (pipeline controller enforced — e.g., MANDATORY gates, CIRCUIT_BREAKER triggers) | `auto` (automatic resolution without user interaction — e.g., info-gate self-answered from code)
- `timestamp`: ISO 8601
- `detail`: Human-readable summary
- `confidence_impact`: Numeric impact on confidence score (negative = reduces confidence)

**Rules:**
1. EVERY gate trigger MUST be logged — no exceptions
2. The file is append-only during a pipeline run
3. `final-validator` MUST read this file to factor skipped gates into the decision
4. SOFT gates skipped carry `confidence_impact: -0.10` by default (ADVERSARIAL_GATE: -0.15, FINAL_ADVERSARIAL_GATE: -0.15, CLOSEOUT_CONFIRM: -0.05)
5. MANDATORY/HARD gates cannot have `decision: "SKIPPED"`
6. **Controller-only writes:** Only the pipeline controller appends to this file. Subagents report gate outcomes in structured YAML; the controller serializes them. This eliminates injection surface at the file level
7. **Sanitization:** The `detail` field MUST be truncated to 200 characters and stripped of newline characters (`\n`, `\r`) before serialization. Entries MUST be written via a strict JSON serializer, never via string interpolation
8. **Parse-time validation (final-validator):** Each line MUST parse as a single valid JSON object with exactly these keys: `gate`, `hardness`, `phase`, `decision`, `decided_by`, `timestamp`, `detail`, `confidence_impact`. Lines that fail to parse or contain unexpected keys MUST be flagged as anomalous and reported to the user. The `hardness` value MUST match the Gate Registry for the named `gate` — mismatches indicate tampering
