# Requirements — Langfuse Cloud Observability

**Spec:** `2026-05-21-langfuse-observability`
**Generated:** 2026-05-21 by brainstorm-controller Phase 1.5a (inline)
**Pattern:** EARS (Easy Approach to Requirements Syntax) — Ubiquitous / Event-driven / State-driven / Optional / Unwanted-behavior
**Plugin target:** v7.3.0

---

## Glossary

| Term | Definition |
|---|---|
| **trace** | One pipeline run end-to-end (root span = controller execution) |
| **span** | One agent invocation lifecycle (open at PreToolUse:Agent, close at PostToolUse:Agent) |
| **event** | A gate decision or protocol emission attached to the current span |
| **opt-in** | LANGFUSE_ENABLED env var resolved to truthy (`"true"`, `"1"`); anything else (unset, empty, `"false"`, `"0"`) means disabled |
| **flush** | Forced drain of Langfuse SDK in-memory queue to network |
| **PPID** | Parent process ID — used to scope the tmp trace-carrier file per session |

---

## Functional Requirements (FR)

### FR-1 — Opt-in activation gate (Ubiquitous)

**The system SHALL** read `process.env.LANGFUSE_ENABLED` at hook startup AND treat any value other than `"true"` or `"1"` as DISABLED.

**The system SHALL NOT** load the `langfuse` npm package, instantiate any Langfuse client, write to `/tmp/langfuse-span-*.json`, or perform any network call WHEN LANGFUSE_ENABLED is not truthy.

**Source:** D5 (sanitizer module) and D6 (sampling) only run after this gate passes.

---

### FR-2 — Span open on agent spawn (Event-driven)

**WHEN** the `PreToolUse:Agent` hook fires AND opt-in is active AND sampling roll passes (`Math.random() <= LANGFUSE_SAMPLE_RATE`), **the system SHALL** open a new Langfuse span with:

- `name` = agent name (e.g., `pipeline-orchestrator:core:sentinel`)
- `input` = sanitized agent prompt (per FR-7)
- `metadata.phase` = current phase from sentinel-state.json
- `metadata.pipeline_doc_path` = PIPELINE_DOC_PATH (relative to plugin root)
- `metadata.agent_name` = matcher payload value
- `parent_id` = root trace span id (created on first hook invocation per session)

**AND THEN the system SHALL** persist `{ traceId, spanId, startedAt, agentName }` to `/tmp/langfuse-span-<PPID>.json` (atomic write).

**Source:** D2 (tmp file carrier), D6 (sampling).

---

### FR-3 — Span close on agent return (Event-driven)

**WHEN** the `PostToolUse:Agent` hook fires AND `/tmp/langfuse-span-<PPID>.json` exists, **the system SHALL** read the file, close the span with:

- `output` = sanitized tool result (per FR-7)
- `endTime` = now
- `level` = `ERROR` if the tool result indicates failure; `DEFAULT` otherwise
- `statusMessage` = sanitized error message if applicable

**AND THEN the system SHALL** delete the tmp file.

**Source:** D2.

---

### FR-4 — Gate event mapping (Event-driven)

**WHEN** `lib/gate-decision-writer.cjs` writes a gate decision to `gate-decisions.jsonl` AND opt-in is active, **the system SHALL** also emit a Langfuse event attached to the current open span (or root span if none open) with `name` = gate name, `metadata.decision` = one of the 8 canonical decision values, `metadata.hardness` = one of {HARD, SOFT, AUDIT, CIRCUIT_BREAKER}.

The Langfuse event emission MUST be a side-call from the same writer, AFTER the JSONL write succeeds — JSONL remains SSOT.

**Source:** Brainstorm scope ("Map gate-decisions.jsonl entries to Langfuse events under the parent span").

---

### FR-5 — Flush at session end (State-driven)

**WHILE** the `Stop` hook is executing AND opt-in is active, **the system SHALL** call `langfuse.flushAsync()` (or equivalent) AND wait at most 3000 ms for completion BEFORE allowing the Stop hook to exit.

**The system SHALL NOT** block the Stop hook past the 3000 ms timeout — on timeout, the system logs a warning and exits.

**Source:** D3.

---

### FR-6 — Soft-fail error contract (Unwanted-behavior)

**IF** any Langfuse SDK call throws OR `/tmp/langfuse-span-<PPID>.json` cannot be read/written OR network egress fails, **THEN the system SHALL**:

1. Catch the exception (never let it propagate),
2. Append a sanitized entry to `.pipeline/langfuse-errors.jsonl` with schema:
   ```json
   {"timestamp": "ISO-8601", "error_type": "string", "message_truncated": "string ≤200 chars", "run_id": "string|null", "hook_name": "langfuse-hook|stop-hook|gate-decision-writer"}
   ```
3. Exit with code 0 (pipeline never blocked).

**The system SHALL NOT** include any value matching the secret patterns from FR-7 in `message_truncated`.

**Source:** D4.

---

### FR-7 — 3-layer sanitization (Ubiquitous)

**Before** any payload field (input, output, metadata, statusMessage, error message) is passed to the Langfuse SDK OR written to `.pipeline/langfuse-errors.jsonl`, **the system SHALL** apply in this order via `lib/langfuse-sanitizer.cjs::sanitizeSpanPayload(text, pluginRoot)`:

1. **Truncate:** if string length > 2000 chars, replace with first 1997 chars + `"..."`
2. **Path redaction:** for every match of an absolute path containing `pluginRoot` (case-insensitive on Windows), replace with the relative path under plugin root using forward slashes
3. **Secret redaction:** regex-replace all of these patterns with `[REDACTED]`:
   - `sk_live_\S+`
   - `sk_test_\S+`
   - `ghp_\S+`
   - `npm_\S+`
   - `LANGFUSE_SECRET_KEY=\S+`
   - Every value from `process.env` whose key matches `/(SECRET|TOKEN|KEY|PASSWORD)/i` AND whose value length is > 8 chars

The function MUST be deterministic AND MUST NOT mutate inputs.

**Source:** D5.

---

### FR-8 — Configurable sampling (Optional feature)

**WHERE** `process.env.LANGFUSE_SAMPLE_RATE` is set to a parseable float in `[0.0, 1.0]`, **the system SHALL** use that value as the sampling probability.

**WHERE** the env var is unset OR not parseable OR out of range, **the system SHALL** default to `1.0` (100%) AND log a single warning to `.pipeline/langfuse-errors.jsonl` if the value was present-but-invalid.

**Source:** D6.

---

### FR-9 — Env key handling (Ubiquitous)

**The system SHALL** read these env keys at hook startup:

| Key | Purpose | Default | Required when opt-in |
|---|---|---|---|
| `LANGFUSE_ENABLED` | Master switch | unset (= false) | n/a (this IS the switch) |
| `LANGFUSE_PUBLIC_KEY` | SDK auth public | none | YES |
| `LANGFUSE_SECRET_KEY` | SDK auth secret | none | YES |
| `LANGFUSE_HOST` | API endpoint | `https://cloud.langfuse.com` | NO |
| `LANGFUSE_SAMPLE_RATE` | Sampling probability | `1.0` | NO |

**IF** opt-in is active AND either `LANGFUSE_PUBLIC_KEY` or `LANGFUSE_SECRET_KEY` is missing, **THEN the system SHALL** log an entry to `.pipeline/langfuse-errors.jsonl` (`error_type: "missing_credentials"`) AND disable Langfuse for the session AND exit 0. The pipeline is never blocked.

**The system SHALL NOT** print the value of any `LANGFUSE_*` env var to stdout, stderr, or any JSONL file. Only key names may appear in error logs.

**Source:** D4, D5, brainstorm scope.

---

### FR-10 — Hook registration (Ubiquitous)

**The system SHALL** register, in `hooks/hooks.json` (NOT `.claude/settings.json`):

- Under `PreToolUse`: matcher `"Agent"`, command `node "${CLAUDE_PLUGIN_ROOT}/.claude/hooks/langfuse-hook.cjs"` — added AFTER the existing sentinel-hook entry in the same matcher array
- Under `PostToolUse`: NEW root key, matcher `"Agent"`, command `node "${CLAUDE_PLUGIN_ROOT}/.claude/hooks/langfuse-hook.cjs"`

**The same hook file** handles both events by branching on the Claude Code hook event env var (e.g., `process.env.CLAUDE_HOOK_EVENT` — executor must verify the exact env var name at implementation time per information-gate Gap C inference).

**Source:** D7.

---

### FR-11 — Codex mirror (Ubiquitous)

**WHEN** `.claude/hooks/langfuse-hook.cjs` is created or modified, **the system SHALL** also create or modify `.codex/hooks/langfuse-hook.cjs` with identical contents (byte-equivalent).

**The system SHALL** create the `.codex/hooks/` directory if absent (currently absent per information-gate Gap A).

**Source:** CLAUDE.md Iron Law; information-gate Gap A.

---

## Non-Functional Requirements (NFR)

### NFR-1 — Zero behavior change when disabled

**Acceptance:** With LANGFUSE_ENABLED unset OR false:
- Pipeline phases, gates, sentinel checkpoints, and adversarial reviews produce byte-identical artifacts vs a baseline run without the Langfuse hook installed.
- No `/tmp/langfuse-span-*.json` files appear.
- No network connections are attempted (verifiable via mock-network test or strace-equivalent).
- `package.json` may include `langfuse` as a dep, but the module must NOT be `require()`d at the top of hook files — lazy-load behind the opt-in gate.

**Test:** F8 in `tests/regression/v7.3.0/`.

---

### NFR-2 — Soft-fail contract

**Acceptance:** Hook NEVER exits non-zero due to Langfuse-related failure. Verified by:
- Mock test injecting SDK throw → hook exits 0
- Mock test with malformed `/tmp/langfuse-span-<PPID>.json` → hook exits 0
- Mock test with network error → hook exits 0

**Test:** F9 in `tests/regression/v7.3.0/`.

---

### NFR-3 — No secret leak

**Acceptance:** Across a corpus of synthetic payloads each containing one of (NPM_TOKEN, LANGFUSE_SECRET_KEY, `sk_live_*`, `ghp_*`, custom `*_PASSWORD` env value):
- 100% of payloads passed to mock-SDK MUST have all secret values replaced by `[REDACTED]`
- 100% of entries in `.pipeline/langfuse-errors.jsonl` MUST have no secret values

**Test:** F10 in `tests/regression/v7.3.0/`.

---

### NFR-4 — Sub-100ms hook overhead when disabled

**Acceptance:** With LANGFUSE_ENABLED=false, `langfuse-hook.cjs` start-to-exit time MUST be < 100 ms on baseline hardware (measured via `process.hrtime.bigint()` wrapper in F8 test).

**Rationale:** Hook runs on critical path for every Agent spawn. Latency budget already consumed by sentinel-hook.

**Test:** F8 sub-assertion in `tests/regression/v7.3.0/`.

---

### NFR-5 — No top-level require of langfuse

**Acceptance:** Static-analysis grep over `.claude/hooks/langfuse-hook.cjs` MUST confirm `require('langfuse')` appears ONLY inside a function body guarded by the opt-in check, never at module top level.

**Rationale:** When LANGFUSE_ENABLED=false, the npm package should not even be loaded (cold-start cost + reduces attack surface if package is compromised).

**Test:** F8 static check in `tests/regression/v7.3.0/`.

---

### NFR-6 — Iron Law compliance

**Acceptance:** Edits made by this feature are confined to:
- `.claude/hooks/` (langfuse-hook.cjs, possibly small additions to stop-hook.cjs for flush)
- `.codex/hooks/` (mirror)
- `lib/` (langfuse-sanitizer.cjs, langfuse-client.cjs)
- `lib/gate-decision-writer.cjs` (small additive call to Langfuse event emit)
- `hooks/hooks.json` (registration)
- `package.json` + `package-lock.json` (new dep)
- `.env.example` (documentation)
- `tests/regression/v7.3.0/` (new tests)

No edits to `agents/**`, `skills/**`, `references/**`, `commands/**`, `designs/**`, `CLAUDE.md`, or `sentinel-hook.cjs`.

---

### NFR-7 — License compatibility

**Acceptance:** The `langfuse` npm package MUST be MIT (verified live by information-gate). The `package.json` MUST pin a specific minor version (no `^` floating) to prevent supply-chain drift.

---

## Out of Scope (reaffirmed)

- Self-hosted Langfuse Docker setup
- OpenTelemetry exporter
- Real-time contract verifier (separate future pipeline)
- End-user marketplace telemetry opt-in flow
- Modifying `sentinel-hook.cjs` (preserved untouched per D1)
- Cross-run dashboard beyond Langfuse Cloud's built-in UI

---

## Acceptance Criteria — Test Mapping

| AC | Requirement(s) | Test |
|---|---|---|
| AC1 — Disabled = noop | FR-1, NFR-1, NFR-4, NFR-5 | F8_langfuse_disabled_noop.cjs |
| AC2 — Span schema correct | FR-2, FR-3, FR-4, FR-5, FR-8 | F9_langfuse_span_schema.cjs (mock SDK) |
| AC3 — Sanitization works | FR-7, NFR-3 | F10_langfuse_sanitization.cjs |
| AC4 — Soft-fail | FR-6, NFR-2 | F9 (error-injection subcases) |
| AC5 — Secrets never logged | FR-6, FR-7, FR-9, NFR-3 | F10 (.pipeline/langfuse-errors.jsonl scan) |

---

## Phase doc metadata

```
pipeline: feature-heavy
phase: 1.5a (brainstorm-controller inline)
artifact: requirements.md
status: COMPLETE
next_artifact: validate-gap then design.md
```
