# GATE_REQUEST and DISPATCH_REQUEST protocol

**Status:** Active. Achado #7 mitigation (M-1 partial + M-2 hybrid). See `docs/findings/achado-7-subagent-runtime.md` for the empirical evidence and architectural rationale.

**Purpose:** workaround the Claude Code runtime constraint that strips `AskUserQuestion`, `Agent`, and `EnterPlanMode` from the subagent tool manifest. Subagents cannot ask the user questions or dispatch nested subagents directly. This protocol formalizes the "hoist to parent" pattern: the subagent emits a structured block in its tool result, the parent (main LLM, where these tools work) processes the block and re-dispatches the subagent with the answer or result attached.

This protocol does NOT change which agents exist, what they classify, or what artifacts they produce. It only changes HOW an agent that needs an interactive surface delegates that surface upward.

---

## When to use which

| Subagent need | Block type to emit | Parent handles |
|---|---|---|
| Ask user a multiple-choice question (formerly AskUserQuestion) | `GATE_REQUEST` | Calls `AskUserQuestion`, captures answer, re-dispatches subagent with `GATE_RESPONSE` payload |
| Dispatch a peer/leaf agent (formerly Agent tool) | `DISPATCH_REQUEST` | Calls `Agent(subagent_type, prompt)`, captures result, re-dispatches caller with `DISPATCH_RESULT` payload |
| Enter plan mode (formerly EnterPlanMode) | `PLAN_MODE_REQUEST` | Calls `EnterPlanMode` directly in parent context, runs the plan in-place, returns plan to caller |
| Continue without user interaction | (no block) | n/a — subagent returns final result normally |

A subagent MAY emit multiple blocks of different types in a single tool result. The parent processes them in declaration order.

---

## Block schemas

All blocks are emitted as fenced YAML in the subagent's tool result, with a sentinel header line for parser anchoring.

### GATE_REQUEST

```yaml
=== GATE_REQUEST v1 ===
gate_id: <unique-id-within-run>     # e.g. "explore-q1", "plan-approval", "tdd-scenario-3"
question: <full question text, leiga PT>
header: <max-12-char chip label>
multi_select: <true|false>          # default false
options:
  - label: "<text>"
    description: "<one-sentence trade-off>"
    recommended: <true|false>       # exactly one option may be recommended (first option per UI convention)
  - label: "<text>"
    description: "<...>"
context: |
  <optional 1-3 sentence context for the user — what's at stake>
=== END GATE_REQUEST ===
```

After emitting `GATE_REQUEST`, the subagent MUST stop work that depends on the answer and either: (a) emit additional blocks that don't need this answer, OR (b) end the tool result with `STATUS: AWAITING_GATE_RESPONSES` and the list of pending `gate_id`s.

### Handshake timeout (Patch 3 / v7.1.2+) — PROTOCOL_HANDSHAKE_TIMEOUT

The parent (pipeline-controller) records every block emission in `sentinel-state.json.pending_blocks` with an `emitted_at` ISO timestamp. Timeout detection runs in **two layers**:

**Primary (out-of-band):** `.claude/hooks/cleanup-orphan-sentinel-state-hook.cjs` fires unconditionally on every Claude Code `SessionStart`, scans all `sentinel-state.json` files under the project tree, iterates each `pending_blocks` entry, and emits `PROTOCOL_HANDSHAKE_TIMEOUT` to `gate-decisions.jsonl` for any aged-out entry. This layer is essential because the failure mode the gate targets (parent did not implement the protocol and never re-dispatches) precludes the controller from running again. The hook closes the circularity.

**Secondary (controller re-entry check):** when the parent IS re-dispatching the controller, it ALSO inspects pending entries and emits the same gate as defense-in-depth. The controller skips emission if the hook already wrote an entry for the same block in this session (recognized via `decided_by: "cleanup-orphan-sentinel-state-hook"` field).

If any pending block is older than the **handshake window** AND its response (`GATE_RESPONSES` / `DISPATCH_RESULTS` / `PLAN_MODE_RESULTS`) has not arrived, the appropriate layer emits gate `PROTOCOL_HANDSHAKE_TIMEOUT` (hardness HARD per `references/gates.md`) and stops the pipeline.

**Window defaults:**

- Default: **30 minutes** (1800000 ms).
- Override: env var `PIPELINE_HANDSHAKE_TIMEOUT_MS` (positive integer, milliseconds).
- **Sanity floor: 60000 ms (1 minute).** Values below the floor — including 0, negative, NaN, and non-numeric strings — are rejected and the default (30 minutes) is used. This prevents env-var typos from hard-blocking every pipeline run.
- Suggested minimum reasonable window: 5 minutes (300000 ms).

**Cross-session pending_blocks:** if `sentinel-state.session_id` does not match the current Claude Code session_id, the entries belong to a prior abandoned session. Both detection layers demote to `hardness: SOFT`, `decision: CLEARED_CROSS_SESSION` (informational only — do NOT HARD-block the fresh session's work). This is the explicit recovery path for the abandoned-session case.

**Write timing contract:** the parent (controller) MUST append to `pending_blocks` IMMEDIATELY upon receiving a subagent tool-result containing one of the three block types, BEFORE invoking AskUserQuestion or any other side-effecting work. This prevents a crash-mid-ask from losing the audit trail.

**Clock skew defenses:**
- Negative age (clock went backward — NTP correction, VM resume, daylight saving on non-UTC `emitted_at`): treat as 0, do not fire.
- Age >= 7 days (`HANDSHAKE_MAX_AGE_MS`): defer to cleanup-orphan archive path. The timeout gate does not double-fire on orphan-territory entries.

**Typical causes when this gate fires:**

- The parent main LLM did not implement the GATE_REQUEST / DISPATCH_REQUEST / PLAN_MODE_REQUEST parsing protocol (Achado #7 contract violation).
- The `AskUserQuestion` handler was absent or stripped from the parent's tool manifest.
- The session was abandoned mid-flight (user closed the terminal, network drop, machine sleep).
- A custom embedding of the controller into a non-Claude-Code runtime that lacks the response loop.

**Recovery:** fix the parent handler, then user re-invokes the pipeline. The stale `pending_blocks` entry is cleared on the new run's initial state-file write (different session_id → demoted to SOFT/CLEARED_CROSS_SESSION). No automatic retry — repeated timeouts indicate a structural integration bug, not a transient failure.

The full gate row (trigger / action / recovery) lives in `references/gates.md` under `PROTOCOL_HANDSHAKE_TIMEOUT`.

### DISPATCH_REQUEST

```yaml
=== DISPATCH_REQUEST v1 ===
dispatch_id: <unique-id-within-run>
target_kind: agent | skill          # agent for top-level Agent tool; skill for Skill tool (works in subagents)
target_name: <subagent_type or skill name>
description: <short label for the parent's tool call>
prompt: |
  <full prompt text, multiline, verbatim — the parent passes this through>
context_for_parent: |
  <optional notes for the parent: why this dispatch, what the result is used for>
=== END DISPATCH_REQUEST ===
```

If `target_kind: skill`, the subagent SHOULD prefer to dispatch the skill itself directly (Skill tool works in subagents). Only emit DISPATCH_REQUEST for skills when the dispatch must be observed/audited by the parent for some reason.

For `target_kind: agent`, the parent uses `Agent(subagent_type: <target_name>, ...)`.

### PLAN_MODE_REQUEST

```yaml
=== PLAN_MODE_REQUEST v1 ===
plan_id: <unique-id-within-run>
research_scope: |
  <multi-line description of what the parent should research in plan mode>
expected_deliverables:
  - <bullet of what to produce>
  - <bullet>
=== END PLAN_MODE_REQUEST ===
```

The parent invokes `EnterPlanMode`, conducts the read-only research per `research_scope`, exits plan mode with the plan, and re-dispatches the caller with the plan attached as `PLAN_MODE_RESULT`.

### Response payloads (parent → subagent on re-dispatch)

When the parent re-dispatches a subagent with answers, it prepends the original prompt with one of:

```
GATE_RESPONSES:
  <gate_id>:
    selected_label: "<option label the user picked>"
    selected_index: <0-based index>
    user_notes: "<text from user, if any>"
  <gate_id>: ...
```

```
DISPATCH_RESULTS:
  <dispatch_id>:
    success: true|false
    result: |
      <full text of the agent/skill tool result>
    error: "<if success=false>"
  <dispatch_id>: ...
```

```
PLAN_MODE_RESULTS:
  <plan_id>:
    plan: |
      <full plan text the parent produced in plan mode>
```

The subagent reads these payloads at the top of its prompt, applies them to its in-progress state, and continues from where it stopped.

---

## Parent-side handler protocol (canonical)

When a parent dispatches a subagent that uses this protocol, it MUST:

1. Read the entire tool result for `=== <BLOCK_TYPE> v1 ===` ... `=== END <BLOCK_TYPE> ===` markers.
2. Process blocks in declaration order:
   - `GATE_REQUEST` → invoke `AskUserQuestion` with the gate's question + options. Collect answer.
   - `DISPATCH_REQUEST` → invoke the target via `Agent` or `Skill`. Capture result.
   - `PLAN_MODE_REQUEST` → invoke `EnterPlanMode`, conduct research, exit with plan.
3. Aggregate all responses/results into `GATE_RESPONSES` / `DISPATCH_RESULTS` / `PLAN_MODE_RESULTS` payloads.
4. If the subagent's tool result ended with `STATUS: AWAITING_GATE_RESPONSES` (or AWAITING_DISPATCH_RESULTS, AWAITING_PLAN_MODE_RESULTS), re-dispatch the SAME subagent with the original prompt + the response payloads prepended.
5. If the subagent emitted blocks but did NOT end with AWAITING_*, the parent MUST still process the blocks but MAY skip the re-dispatch (the subagent decided it could continue past the blocks; the responses are still recorded for audit).
6. Persist every gate response and dispatch result to a SEPARATE log file `{PIPELINE_DOC_PATH}/protocol-events.jsonl` (NOT to `gate-decisions.jsonl`) with the `gate_id` / `dispatch_id` for cross-reference. See "Audit-trail entries" below for the exact schema and the rationale (avoiding collision with the strict 35-gate registry validation in `final-validator`).

The parent MUST NOT silently default. If a `GATE_REQUEST` is malformed (missing required fields, no options), the parent emits an error to the user and does NOT re-dispatch the subagent until the malformed block is corrected.

## Audit-trail entries

**Schema collision with gate-decisions.jsonl:** the strict validator in `agents/core/final-validator.md` requires `decided_by` to be in the enum `{user, system, auto}` and `gate` to be a name from the 35-gate registry (see `references/gates.md`). Protocol bookkeeping introduces neither value, so it MUST live in a separate log file to avoid being flagged as anomalous tampering.

**Separate file:** every block processing produces a `{PIPELINE_DOC_PATH}/protocol-events.jsonl` entry (NOT `gate-decisions.jsonl`). Schema:

```json
{"event":"GATE_REQUEST","gate_id":"<id>","phase":"<phase>","decision":"<selected_label>","decided_by":"gate_request_protocol_parent_handler","timestamp":"<iso>","detail":"<≤200 chars>"}
{"event":"DISPATCH_REQUEST","dispatch_id":"<id>","phase":"<phase>","target_kind":"agent|skill","target_name":"<name>","decision":"<success|error>","decided_by":"gate_request_protocol_parent_handler","timestamp":"<iso>","detail":"<≤200 chars>"}
{"event":"PLAN_MODE_REQUEST","plan_id":"<id>","phase":"<phase>","decision":"<plan_returned|aborted>","decided_by":"gate_request_protocol_parent_handler","timestamp":"<iso>","detail":"<≤200 chars>"}
```

Note the field is `event:`, NOT `gate:` — this signals to any reader that the file is not the gate decision log. final-validator does NOT parse `protocol-events.jsonl`.

**Cross-reference back to gate-decisions.jsonl:** when the GATE_REQUEST corresponds to a NAMED gate in the 35-gate registry (e.g., the Phase 1 proposal corresponds to no specific gate; the Phase 2 adversarial corresponds to ADVERSARIAL_GATE; the closeout to CLOSEOUT_CONFIRM), the parent SHOULD ALSO write the canonical `gate-decisions.jsonl` entry per the existing audit-trail rules, with `decided_by: user` and `detail` mentioning the protocol event id for traceability:

```json
{"gate":"ADVERSARIAL_GATE","hardness":"SOFT","phase":"2","decision":"APPROVED","decided_by":"user","timestamp":"<iso>","detail":"via protocol-events GATE_REQUEST gate_id=adv-batch-1","confidence_impact":0.0}
```

This dual-write keeps gate-decisions.jsonl complete (final-validator sees the user decision) AND keeps protocol bookkeeping isolated (no schema collision).

These entries do NOT introduce new gates in the 35-gate registry. The Inline Invariants in `commands/pipeline.md` are unchanged by this protocol. The 35-gate registry is unchanged.

## gate_id → canonical gate mapping (A.8 fix)

When a GATE_REQUEST corresponds to a gate in the 35-gate registry, the parent dual-writes both `protocol-events.jsonl` AND `gate-decisions.jsonl`. Use this canonical mapping table:

| gate_id pattern | Canonical gate (registry) | Hardness |
|---|---|---|
| `phase-1-pipeline-proposal` | (no canonical gate — Phase 1 confirm has no named gate; write only protocol-events) | n/a |
| `phase-2-tdd-approval-*` | `TDD_APPROVAL` | HARD |
| `phase-1-5-plan-approval` | `PLAN_REJECTED` (only when user rejects) | HARD |
| `phase-2-adversarial-batch-<N>` | `ADVERSARIAL_GATE` | SOFT |
| `phase-3-final-adversarial` | `FINAL_ADVERSARIAL_GATE` | SOFT |
| `phase-3-closeout` | `CLOSEOUT_CONFIRM` | SOFT |
| `phase-0-info-gate-<topic>` | `INFO_GATE_BLOCKED` (only when blocking) | HARD |
| `brainstorm-explore-q<N>` | (no canonical gate — protocol-events only) | n/a |
| `brainstorm-handoff` | (no canonical gate — protocol-events only) | n/a |
| Any other custom gate_id | (no canonical gate — protocol-events only) | n/a |

When a gate has "no canonical gate" in this table, the parent writes ONLY to `protocol-events.jsonl`. When a canonical gate is named, the parent ALSO writes to `gate-decisions.jsonl` with `decided_by: user`, `gate: <canonical>`, `hardness: <from registry>`, `decision: <user's selected_label mapped to APPROVED|REJECTED|SKIPPED|RESOLVED|BLOCKED>`, and `detail: "via protocol-events GATE_REQUEST gate_id=<gate_id>"`.

The mapping is the parent handler's responsibility. Subagents emit gate_ids from the patterns above; they do NOT name canonical gates themselves (subagents lack the registry context).

## Lock cleanup limitation (A.5 disclosure)

Each subagent dispatch creates a `.pipeline/sessions/<session-id>.lock` file (via `session-lock-hook.cjs`). When a subagent halts via `STATUS: AWAITING_*` (rather than completing), the lock remains held until the parent re-dispatches and the subagent completes the eventual `PIPELINE COMPLETE` block. If the user closes Claude Code mid-AWAITING, `session-cleanup-hook.cjs` clears the lock via the Stop event. **But:** if a NEW slash-command invocation happens within the same Claude Code session before the previous one completes, the new invocation's edit-guard will encounter the still-active prior lock and BLOCK direct edits — exactly the failure mode observed during this fix's own dogfood (twice, same session).

**Current workaround:** the user manually deletes the orphan lock with `rm .pipeline/sessions/<id>.lock`. This is documented in the edit-guard error message ("As a last resort only, you may manually delete...").

**Permanent fix (deferred to v5.2 follow-up):** add a stale-lock detection in `edit-guard-hook.cjs` — when a lock is found AND the lock is older than N minutes (suggested: 30 min default, configurable), AND the lock's owning session is no longer the active session, treat as stale and ignore. Requires schema extension to lock files (add `last_heartbeat_at` updated by re-dispatch events). Estimated 3-5h.

Until v5.2, when you (the parent) hit a PIPELINE_LOCK_ACTIVE error during legitimate protocol re-dispatch, present the user via AskUserQuestion: "stale lock from prior session — delete manually OR abort pipeline". Do NOT auto-delete without explicit user authorization.

## Skill dispatch (works in subagents — no protocol needed)

Skills can be dispatched directly from inside a subagent via the `Skill` tool (confirmed available by empirical probe). When a subagent's contract says "dispatch skill X", it does so directly without going through `DISPATCH_REQUEST`. The protocol only kicks in for `Agent` tool dispatches that the subagent cannot perform itself.

Mixed dispatch is fine: a subagent may use `Skill` directly for some peers AND emit `DISPATCH_REQUEST` for others.

## Backward compatibility

Subagents that do NOT emit any of these blocks behave identically to the pre-protocol contract. The protocol is additive: adoption is per-agent, opt-in via the agent body referencing this file.

## Migration status (Achado #7 v5.2 implementation)

| Agent | Adopted? | Notes |
|---|---|---|
| `agents/core/brainstorm-controller.md` | YES | Replaces "fallback to numbered prose options" silent default at step-01-explore with GATE_REQUEST emission. |
| `agents/core/pipeline-controller.md` | YES | Phase 1 proposal, Phase 1.5 plan approval, Phase 2 adversarial gates, Phase 3 closeout — all emit GATE_REQUEST. Sub-agent dispatches emit DISPATCH_REQUEST. |
| `agents/executor/executor-controller.md` | YES | Per-task implementer/reviewer chain emits DISPATCH_REQUEST. |
| Other 16 agents | N/A | Do not require user interaction or sub-sub-agent dispatch in their bodies. |

The migration was executed inline (not via the pipeline itself, which could not run end-to-end pre-fix). Audit trail in `pipeline-runs/001-fix-6-contract-drift-findings/04-final-report.md`.
