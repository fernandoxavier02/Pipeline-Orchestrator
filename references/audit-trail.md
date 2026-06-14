# Audit Trail Reference

> **SSOT** for the operational audit mechanics: Phase Transition Summary block template and Gate Decision Log JSONL format. Gate definitions (Hardness Taxonomy + Registry) are in `references/gates.md`. `commands/pipeline.md` Grep-redirects here for the transition and log formats.

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

Each line carries the 8 base fields plus the 5 correlation-envelope fields (`run_id`, `plugin_version`, `schema_version`, `type`, `complexity`) that the v7.1.0+ writer injects:

```jsonl
{"run_id":"2026-03-29-fix-login","plugin_version":"7.14.0","schema_version":"1","type":"Bug Fix","complexity":"MEDIA","gate":"INFO_GATE_BLOCKED","hardness":"HARD","phase":0,"decision":"CONFIRMED","decided_by":"user","timestamp":"2026-03-29T14:30:00","detail":"2 gaps answered","confidence_impact":0.0}
{"run_id":"2026-03-29-fix-login","plugin_version":"7.14.0","schema_version":"1","type":"Bug Fix","complexity":"MEDIA","gate":"TDD_APPROVAL","hardness":"HARD","phase":2,"decision":"APPROVED","decided_by":"user","timestamp":"2026-03-29T14:45:00","detail":"3 scenarios approved","confidence_impact":0.0}
{"run_id":"2026-03-29-fix-login","plugin_version":"7.14.0","schema_version":"1","type":"Bug Fix","complexity":"MEDIA","gate":"ADVERSARIAL_GATE","hardness":"SOFT","phase":2,"decision":"SKIPPED","decided_by":"user","timestamp":"2026-03-29T15:00:00","detail":"user chose to skip batch 1 review","confidence_impact":-0.10}
```

**Fields:**
- `run_id`, `plugin_version`, `schema_version`, `type`, `complexity`: correlation envelope (v7.1.0+) — SSOT `lib/contracts/gate-decision.cjs`
- `gate`: Gate name from the Gate Registry (see `references/gates.md`)
- `hardness`: MANDATORY | HARD | CIRCUIT_BREAKER | SOFT | AUDIT
- `phase`: Phase number where gate was triggered (0, 1, 1.5, 2, 3)
- `decision`: BLOCKED | DISPATCHED | SKIPPED | APPROVED | CONFIRMED | REJECTED | TRIGGERED | NOT_TRIGGERED (the canonical 8-value vocabulary defined in `lib/contracts/gate-decision.cjs` and enforced at write time by `lib/gate-decision-writer.cjs`; anything outside throws a `TypeError`)
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
8. **Parse-time validation (final-validator):** Each line MUST parse as a single valid JSON object whose keys are a subset of the canonical `GateDecisionEntry` key set: the 8 base fields (`gate`, `hardness`, `phase`, `decision`, `decided_by`, `timestamp`, `detail`, `confidence_impact`) plus the 5 correlation-envelope fields (`run_id`, `plugin_version`, `schema_version`, `type`, `complexity`) that the v7.1.0+ writer injects. The canonical key set is defined once in `lib/contracts/gate-decision.cjs` and consumed by `lib/gate-decision-writer.cjs` and `lib/jsonl-sanitizer.cjs`. Lines whose keys fall OUTSIDE that set, or that fail to parse, MUST be flagged as anomalous and reported to the user. A line missing the correlation envelope is legacy (pre-v7.1.0) — acceptable with a warning, not a fatal anomaly. The `hardness` value MUST match the Gate Registry in `references/gates.md` for the named `gate` — mismatches indicate tampering

---

## Verdict vs Gate Decision Vocabulary

> Disambiguates two distinct decision vocabularies in the pipeline. This section was added in v4.11.0 (Wave 3-spec) to resolve confusion flagged in Wave 2 adversarial review where reviewers conflated final-validator verdicts (`GO/CONDITIONAL/NO-GO`) with gate states (`PASS/FAIL/SKIPPED/...`).

### Two distinct vocabularies

| Vocabulary | Producer | Values | Where it appears |
|------------|----------|--------|------------------|
| **Pipeline Verdict** | `final-validator` ONLY | `GO` \| `CONDITIONAL` \| `NO-GO` | Pipeline output FINAL DECISION line; pipeline summary block |
| **Gate Decision** (written) | Each gate, via the controller | `BLOCKED` \| `DISPATCHED` \| `SKIPPED` \| `APPROVED` \| `CONFIRMED` \| `REJECTED` \| `TRIGGERED` \| `NOT_TRIGGERED` (the 8 canonical values — SSOT `lib/contracts/gate-decision.cjs`) | `gate-decisions.jsonl` (one per gate trigger); audit trail entries |

> **Normalization note (v7.1.0+):** the per-producer value labels in the cross-reference table below (`PASS`, `FAIL`, etc.) are **legacy producer-intent** labels describing what each gate conceptually decides. At write time the controller normalizes them onto the 8 canonical `decision` values via `lib/gate-decision-writer.cjs` (which throws on anything outside the canonical set). There is no `RESOLVED` written decision — a gate that "resolves" is recorded with a canonical value (e.g. a cleared blocker is no longer `BLOCKED`; an approval is `APPROVED`). Only the 8 canonical values ever appear in `gate-decisions.jsonl`.

### Cross-reference table

| Producer | Vocabulary | Notes |
|----------|------------|-------|
| `task-orchestrator` | n/a (emits ORCHESTRATOR_DECISION YAML, no verdict) | — |
| `information-gate` | Gate Decision (CONFIRMED \| BLOCKED) | Logs to gate-decisions.jsonl |
| `quality-gate-router` | Gate Decision (APPROVED) | TDD_APPROVAL gate |
| `executor-controller` | Gate Decision (PASS \| FAIL per checkpoint) | CHECKPOINT_FAIL gate |
| `adversarial-review-coordinator` | Gate Decision (PASS \| BLOCKED) | ADVERSARIAL_BLOCK / ADVERSARIAL_GATE |
| `spec-format-gate` | Gate Decision (GO \| GO-WARN \| NO-GO mapped to PASS \| PASS \| FAIL) | SPEC_FORMAT_GATE_FAIL gate |
| `spec-content-reviewer` | Gate Decision (GO \| NO-GO mapped to PASS \| FAIL) | SPEC_CONTENT_REVIEW_NOGO gate |
| `spec-post-impl-validator` | Gate Decision (PASS \| FAIL) | SPEC_POST_IMPL_FAIL gate |
| **`final-validator`** | **Pipeline Verdict (GO \| CONDITIONAL \| NO-GO)** | **Terminal verdict only — never appears in gate-decisions.jsonl** |
| `spec-closer` | n/a (emits `spec_grade` STRING — cosmetic, not a gate decision) | `spec_grade` is a letter grade for closure summary; does NOT replace the final-validator verdict |

### Key rule

`spec_grade` (produced by `spec-closer`) is **cosmetic only** — it's a human-readable letter grade for the closure summary block. It is NEVER a substitute for the pipeline verdict. The `final-validator` GO/CONDITIONAL/NO-GO verdict is what determines whether the pipeline ships.

---

## Cross-Run Accumulated Log (run-log.jsonl)

> Distinct from `gate-decisions.jsonl`. `gate-decisions.jsonl` is **per-run** (lives inside the run's `{PIPELINE_DOC_PATH}/` folder, captures every gate trigger within that one pipeline invocation). `run-log.jsonl` is **cross-run** (lives at the repo level, accumulates one summary line per completed run so trends like "fidelity drift over the last 30 days" are queryable without scanning every run folder).

**Location:** `<repoRoot>/.pipeline/run-log.jsonl`

**Write policy:** ONLY `lib/run-log.cjs` (helper module) appends to this file via `appendRunLog(...)`. Since v7.1.0 the authorized call site is the `.claude/hooks/stop-hook.cjs` Stop hook, which fires on every session end (including crashes) — this closed the earlier "one line per ~20 runs" aggregate bug. Subagents NEVER write here directly — same single-writer invariant as `gate-decisions.jsonl`. The helper reuses `sanitizeDetail` from `lib/jsonl-sanitizer.cjs` to keep round-trip parsing safe (newlines/tabs stripped, length capped, JSON-serialized strictly).

**Payload builder (v7.9.1):** the per-line payload is assembled by `stop-hook.cjs::buildRunLogEntry(runFolder, repoRoot)` (mirrored byte-identically in the Codex hook). It reads the run's `sentinel-state.json`, `session.json`, `fidelity-report.json`, and `gate-decisions.jsonl` and derives each field as described in the field table below. Missing inputs fall back to `null` (or `UNKNOWN` for `final_decision`) rather than to hardcoded placeholders.

**Read API:** `lib/run-log.cjs` also exposes `readRunLog(repoRoot)` which returns an array of parsed entries (empty array when the file does not exist). Malformed lines are skipped silently — the helper never throws on bad input.

**Format (one JSON object per line, 12 required fields):**

```jsonl
{"run_id":"run-2026-05-15-fidelity","timestamp_start":"2026-05-15T13:00:00Z","timestamp_end":"2026-05-15T13:42:00Z","type":"Feature","complexity":"COMPLEXA","variant":"feature-heavy","total_gates_triggered":14,"total_gates_expected":17,"fidelity_score":0.824,"duration_seconds":2520,"final_decision":"GO","pipeline_doc_path":".pipeline/docs/Pre-Heavy-action/2026-05-15-fidelity-report-and-log/"}
```

**Required fields (in canonical order):**

| Field | Type | Meaning |
|-------|------|---------|
| `run_id` | string | Unique identifier for the run (typically the pipeline-doc folder slug) |
| `timestamp_start` | ISO 8601 string | When the controller marked Phase 0 as started |
| `timestamp_end` | ISO 8601 string | When the controller (or final-validator) emitted PIPELINE COMPLETE |
| `type` | string \| null | Classification: `Bug Fix` \| `Feature` \| `Spec` \| `Audit` \| `UX Simulation` \| `Adversarial Review`. `buildRunLogEntry` reads it from `sentinel.orchestrator_decision` first (`.type` then `.task_type`), then the legacy `classification_post_orchestrator` / `classification` shapes, then `session.type`; `null` when none present. |
| `complexity` | string \| null | `SIMPLES` \| `MEDIA` \| `COMPLEXA`. Same SSOT order as `type`: `sentinel.orchestrator_decision.complexity` → legacy classification → `session.complexity` → `null`. |
| `variant` | string \| null | Variant used (e.g., `feature-heavy`, `feature-light`, `bugfix`, `spec-heavy`); read from `orchestrator_decision` → legacy classification → session, else `null`. |
| `total_gates_triggered` | number | Count of lines in the run's `gate-decisions.jsonl` (every gate trigger logged during the run). |
| `total_gates_expected` | number \| null | Derived by `buildRunLogEntry` from `MANDATORY_GATES_BY_COMPLEXITY` (lazy-loaded from `lib/fidelity-reporter.cjs`): the mandatory-set length for the run's `complexity` (COMPLEXA = 17, MEDIA = 11, SIMPLES = 6), plus the Spec (+) set length when `type === 'Spec'`. `null` when complexity is unknown or the constant cannot be loaded. |
| `fidelity_score` | number \| null | Read straight from the run's persisted `fidelity-report.json` (`fidelity_score` field); `null` when that file is absent or the value is non-numeric. NOT recomputed by the hook. |
| `duration_seconds` | number \| null | `floor((timestamp_end - timestamp_start) / 1000)`. A **date-only** `started_at` (matching `YYYY-MM-DD`) has no time component, so the builder returns `null` rather than inflating the duration to UTC-midnight-relative hours. |
| `final_decision` | string | Resolved by a cascade in `buildRunLogEntry`: `session.status` → `sentinel.final_decision` → tail-scan of `gate-decisions.jsonl` for the last `CLOSEOUT_CONFIRM` / `PA_DE_CAL` entry (mapping `CONFIRMED`/`APPROVED` → `GO`, `BLOCKED`/`REJECTED` → `NO-GO`) → `UNKNOWN` only when none of those resolve. Sanitized via `sanitizeDetail`. |
| `pipeline_doc_path` | string | Repo-relative path to the run's pipeline-doc folder, so the per-run `gate-decisions.jsonl` and `fidelity-report.*` can be located later |

**Rules:**
1. Append-only. Existing lines are NEVER mutated. A correction means appending a new line with a different `run_id` or annotation, not editing an old one.
2. One line per completed run. Aborted runs MAY append a line with `final_decision: "ABORTED"` for traceability.
3. The helper auto-creates `.pipeline/` and the file when missing — first call on a fresh repo is safe.
4. Single-writer invariant: only `lib/run-log.cjs::appendRunLog` writes. Any other code path that needs to write must be refactored to go through the helper.
5. The aggregate consumer of this file is `lib/fidelity-reporter.cjs` (computes the per-run fidelity number) and downstream trend analyses (not yet implemented at v6.1.0).

---

## Concurrency Invariants (v7.5.0)

Spec: `.kiro/specs/tracing-concurrent-execution-id/`. Four invariants govern how concurrent pipeline runs share a working directory without corrupting each other's trace data.

- **I-1 — Multiple simultaneous runs.** The system permits more than one pipeline to be in flight in the same working directory at the same time. No global lock; coexistence is by isolation, not by serialization.
- **I-2 — Run-scoped artefacts.** Every tracing artefact (run-directory manifests, Langfuse trace/span carrier files, sentinel state files) is keyed by a unique, collision-resistant per-run identifier propagated through the environment variable `PIPELINE_RUN_ID`. The id is allocated by `lib/run-directory.cjs::RunDirectory.allocate` and published on `process.env.PIPELINE_RUN_ID` before that function returns.
- **I-3 — Explicit scope contract.** The set of events that turn into observations in Langfuse is governed by `PIPELINE_TRACING_SCOPE`, never by a silent code-level filter. The three accepted values are `agent-only` (default; v7.4.0 parity), `agent-plus-skill`, and `full`.
- **I-4 — Opt-in cost reductions.** Filters that exist purely to reduce observability cost (e.g., dropping non-Agent tool events) must be opt-in flags with a default that preserves prior behavior. Silent drops are forbidden.

## Tracing Scope Policy (`PIPELINE_TRACING_SCOPE`)

`PIPELINE_TRACING_SCOPE` is read once per hook invocation by `.claude/hooks/langfuse-hook.cjs::shouldTrace`. Accepted values:

| Value | Tools that drive a span | Notes |
|-------|-------------------------|-------|
| (unset) / `agent-only` | `Agent` | Default. Bit-for-bit identical to v7.4.0 behavior. |
| `agent-plus-skill` | `Agent`, `Skill` | Opt-in. Emits `TRACING_SCOPE_EXPANDED` once per session. |
| `full` | every tool the hook sees | Opt-in. Useful for end-to-end audit traces; expect higher Langfuse ingest cost. |
| any other string | falls back to `agent-only` | Emits `TRACING_SCOPE_UNKNOWN` once per session so typos surface in stderr. |

Backward compatibility is the contract here: users who never set `PIPELINE_TRACING_SCOPE` see no behavior change relative to v7.4.0.

## AUDIT Events (v7.5.0 additions)

These events surface as JSONL lines on `stderr` from the relevant module. They are informational breadcrumbs — not gates. They are deduped per process so a single hook invocation only emits one line per (event, key) pair.

| Event | Origin | Meaning |
|-------|--------|---------|
| `RUN_DIR_COLLISION_RETRY` | `lib/run-directory.cjs::allocate` | The exclusive `mkdirSync` lost a race; a new `uniqueId` is being generated for retry. Expected under high concurrency; rare otherwise. |
| `CARRIER_PPID_FALLBACK` | `lib/langfuse-carrier.cjs` | Caller did not pass a `runId` to `getTracePath` / `getSpanPath`; the module fell back to the PPID key. Indicates a legacy caller not yet propagating `PIPELINE_RUN_ID`. |
| `DISCOVERY_RUN_ID_NO_MATCH` | `sentinel-hook` / `stop-hook` | `PIPELINE_RUN_ID` is set but no `sentinel-state.json` in the candidate set carries a matching `run_id`. The hook falls back to mtime-newest. Possible causes: orphan state, env-var leak, races between cleanup and discovery. |
| `DISCOVERY_MTIME_FALLBACK` | `sentinel-hook` / `stop-hook` | Discovery picked the mtime-newest candidate because no `runId` match was available (env-var absent or non-matching). Includes `total` (candidate count) and `picked` (absolute path). |
| `TRACING_SCOPE_UNKNOWN` | `langfuse-hook` | `PIPELINE_TRACING_SCOPE` carries a value not in `{agent-only, agent-plus-skill, full}`. The hook applies the `agent-only` safe-default. |
| `TRACING_SCOPE_EXPANDED` | `langfuse-hook` | `PIPELINE_TRACING_SCOPE` was set to a non-default value and the hook honored it. One-shot per process per scope; useful for confirming opt-in in production. |

All six events are documented at the SSOT level (this file). The schema is `{ "audit_event": <name>, "ts": <ISO 8601>, ...event-specific fields }`. Operators who want to alert on a particular event can grep stderr / journalctl logs for the `audit_event` key.
