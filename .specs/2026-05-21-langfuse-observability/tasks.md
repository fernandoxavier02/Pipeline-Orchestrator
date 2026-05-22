# Tasks — Langfuse Cloud Observability

**Spec:** `2026-05-21-langfuse-observability`
**Generated:** 2026-05-21 by brainstorm-controller Phase 1.5a (inline) step-07
**Backbone:** 4 batches from `01-task-orchestrator.md` mapped to 13 files from `design.md` §2
**Plugin target:** v7.3.0

---

## Batch dependency graph

```
Batch 1 (Foundation)
  T1.1 .env.example          T1.2 package.json + langfuse dep
       |                          |
       +-----------+--------------+
                   v
        Batch 2 (Library layer)
          T2.1 lib/langfuse-sanitizer.cjs
          T2.2 lib/langfuse-client.cjs
                   |
                   v
        Batch 3 (Hook integration)
          T3.1 .claude/hooks/langfuse-hook.cjs
          T3.2 .codex/hooks/langfuse-hook.cjs (mirror)
          T3.3 .claude/hooks/stop-hook.cjs (flush)
          T3.4 .codex/hooks/stop-hook.cjs (mirror)
          T3.5 hooks/hooks.json (register)
          T3.6 lib/gate-decision-writer.cjs (event emit)
                   |
                   v
        Batch 4 (Tests + acceptance)
          T4.1 F8 disabled-noop
          T4.2 F9 span-schema
          T4.3 F10 sanitization
          T4.4 npm test full suite + AC verification
```

Each batch ends with `npm test` GREEN gate (CHECKPOINT_FAIL HARD per task-orchestrator §business-rules). No batch may begin until predecessor batch is GREEN.

---

## Batch 1 — Foundation (config + dep)

Goal: land non-executable scaffolding (env documentation + npm dep). Zero behavior change; sanity-check that adding the dep does not break `npm install` or `npm test`.

### T1.1 — Document Langfuse env keys in `.env.example`

**File target:** `.env.example`
**Change type:** Add new section (additive, no edits to existing keys)
**Dependency:** none

**Acceptance criteria:**
- File contains a new section header `# === Langfuse Cloud Observability (OPT-IN) ===` with 5 keys (LANGFUSE_ENABLED, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST commented, LANGFUSE_SAMPLE_RATE commented) per design §9
- Every key has an inline comment explaining purpose and default
- `LANGFUSE_ENABLED=false` is uncommented (so `cp .env.example .env` yields a safe disabled state)
- Optional keys (LANGFUSE_HOST, LANGFUSE_SAMPLE_RATE) are commented out
- Grep `.env.example` for `sk-lf-` returns only placeholder values, no real keys

**Covers:** FR-9, design §9
**Testable via:** static file inspection

---

### T1.2 — Add `langfuse` npm dependency

**File target:** `package.json` + regenerate `package-lock.json`
**Change type:** Add to `"dependencies"` block, exact-version pin (no caret)
**Dependency:** none (parallel with T1.1)

**Acceptance criteria:**
- `package.json` `dependencies` contains `"langfuse": "X.Y.Z"` where X.Y.Z is a specific minor version (latest stable at time of implementation; no `^`, no `~`)
- `npm install` completes without error or warning about peer-dep conflicts
- `npm test` (full existing suite) remains GREEN — adding the dep must not break any of the 46 existing test suites
- `npm ls langfuse` reports the pinned version with zero unresolved dependencies
- License field of installed `langfuse` package reads "MIT" (sanity re-check)

**Covers:** NFR-7, design §2 (langfuse dep row)
**Testable via:** `npm install && npm test && npm ls langfuse`

---

### Batch 1 Gate

Run `npm test`. MUST be GREEN. If RED, halt and root-cause before Batch 2. No batch advance on failure (CHECKPOINT_FAIL).

---

## Batch 2 — Library layer (sanitizer + client singleton)

Goal: ship the two `lib/` modules in isolation. Pure functions and singleton — fully unit-testable without touching hooks or network.

### T2.1 — Implement `lib/langfuse-sanitizer.cjs`

**File target:** `lib/langfuse-sanitizer.cjs` (NEW, ~120 LOC budget per design §2)
**Change type:** New module
**Dependency:** none (parallel with T2.2)

**Acceptance criteria:**
- Exports exactly one public function: `sanitizeSpanPayload(text, pluginRoot)`
- Layer 1 (truncate): inputs > 2000 chars become 1997 chars + `"..."` (per design §5.2)
- Layer 2 (path redaction): absolute paths containing `pluginRoot` become plugin-root-relative with forward slashes (case-insensitive on Windows, per design §5.3)
- Layer 3 (secret redaction): 5 regex patterns (sk_live_*, sk_test_*, ghp_*, npm_*, LANGFUSE_SECRET_KEY=*) replaced with `[REDACTED]` (per design §5.4)
- Layer 3 dynamic env scan: every `process.env` value whose key matches `/(SECRET|TOKEN|KEY|PASSWORD)/i` AND value length > 8 is literal-replaced with `[REDACTED]` (handles regex metachars in values)
- Null/undefined inputs return empty string (no throw)
- Deterministic: same input + same env → same output
- Does NOT mutate inputs

**Covers:** FR-7, NFR-3, design §5
**Testable via:** unit-style test in tests/regression/v7.3.0/F10 (Batch 4)

---

### T2.2 — Implement `lib/langfuse-client.cjs`

**File target:** `lib/langfuse-client.cjs` (NEW, ~80 LOC budget per design §2)
**Change type:** New module
**Dependency:** none (parallel with T2.1)

**Acceptance criteria:**
- Exports exactly two public functions: `isEnabled()` and `getClient()`
- `isEnabled()` returns true ONLY when `process.env.LANGFUSE_ENABLED` lowercased equals `"true"` or `"1"` (per design §4.2)
- `isEnabled()` returns false (and logs `missing_credentials` error) when LANGFUSE_ENABLED is truthy but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is missing
- `isEnabled()` result is memoized for the process lifetime
- `getClient()` returns `null` when `!isEnabled()`
- `getClient()` `require('langfuse')` happens INSIDE the function body, NEVER at module top level (per NFR-5)
- `getClient()` returns the same Langfuse instance on repeated calls (singleton)
- Reads `LANGFUSE_HOST` env var, defaults to `https://cloud.langfuse.com`
- Reads `LANGFUSE_SAMPLE_RATE`; if unparseable or out-of-range, defaults to 1.0 and logs `invalid_sample_rate` error (per FR-8)
- Module top-level static-grep for `require('langfuse')` returns ZERO matches outside function bodies

**Covers:** FR-1, FR-8, FR-9, NFR-5, design §4.2
**Testable via:** F8 (Batch 4) plus a static-analysis assertion (regex on file content)

---

### Batch 2 Gate

Run `npm test`. MUST be GREEN. No hook changes yet → existing test suite must remain unaffected. New modules in `lib/` exist but are not imported by any hook yet (no behavior change).

---

## Batch 3 — Hook integration (the risky batch)

Goal: wire library modules into the hook chain. This is the CRITICAL PATH batch — adversarial review mandatory per `ADVERSARIAL_GATE_MANDATORY`. All 6 tasks in this batch must land atomically; partial application leaves hooks half-registered and could break sentinel.

### T3.1 — Implement `.claude/hooks/langfuse-hook.cjs`

**File target:** `.claude/hooks/langfuse-hook.cjs` (NEW, ~180 LOC budget per design §2)
**Change type:** New hook file
**Dependency:** T2.1 + T2.2 complete

**Acceptance criteria:**
- Top-level requires include `path`, `fs`, and `./lib/langfuse-client.cjs` — NEVER `require('langfuse')` at top level (per NFR-5; literal grep assertion in F8)
- `main()` wraps all logic in try/catch with `finally { process.exit(0); }` (per FR-6, NFR-2)
- Early-exits with code 0 in <100ms when `!isEnabled()` (per NFR-4)
- Branches on Claude Code hook event env var (e.g., `process.env.CLAUDE_HOOK_EVENT`); executor MUST verify the exact env var name live (per design §11 risk row)
- `handlePre()` performs: sampling roll → load/create root trace via `/tmp/langfuse-trace-<PPID>.json` → open span → write `/tmp/langfuse-span-<PPID>.json` atomically (`writeFileSync` to `.tmp` sibling + rename)
- `handlePre()` and `handlePost()` contain the LITERAL comment `// do NOT await` (per design §4.1 G1 resolution; F8 asserts this comment present)
- `handlePost()` reads `/tmp/langfuse-span-<PPID>.json`, closes span (output sanitized via T2.1), deletes the tmp file
- Missing/corrupt tmp file at PostToolUse → silent no-op (per design §3.2)
- ALL payloads passed to Langfuse SDK pass through `sanitizeSpanPayload(text, pluginRoot)` first (per FR-7)
- Uses `os.tmpdir()` not literal `/tmp/` for cross-platform compatibility (per design §11)

**Covers:** FR-1, FR-2, FR-3, FR-6, FR-7, FR-8, NFR-2, NFR-4, NFR-5
**Testable via:** F8 (disabled noop), F9 (span schema with mock SDK)

---

### T3.2 — Mirror to `.codex/hooks/langfuse-hook.cjs`

**File target:** `.codex/hooks/langfuse-hook.cjs` (NEW; directory `.codex/hooks/` does NOT exist yet per information-gate Gap A)
**Change type:** New file (byte-identical mirror of T3.1) + new directory
**Dependency:** T3.1 complete

**Acceptance criteria:**
- Directory `.codex/hooks/` exists (created in this task)
- File contents are byte-equivalent to `.claude/hooks/langfuse-hook.cjs` (verifiable via `diff` or hash comparison)
- Path references inside the file remain agnostic — no `.claude` or `.codex` literal in the file body (uses `__dirname` resolution)

**Covers:** FR-11, CLAUDE.md Iron Law "Espelhamento Codex"
**Testable via:** static-analysis test or simple `cmp` check

---

### T3.3 — Add Langfuse flush to `.claude/hooks/stop-hook.cjs`

**File target:** `.claude/hooks/stop-hook.cjs` (MODIFIED, +~20 LOC per design §2)
**Change type:** Additive — append flush block before existing exit
**Dependency:** T2.2 complete

**Acceptance criteria:**
- Imports `isEnabled` and `getClient` from `lib/langfuse-client.cjs`
- When `isEnabled()` true: calls `client.flushAsync()` (or equivalent SDK method) and races against a 3000 ms timeout (per FR-5, design §4.3)
- Timeout reached → logs `flush_timeout` entry to `.pipeline/langfuse-errors.jsonl`, then exits
- After flush (success or timeout): cleans up `/tmp/langfuse-trace-<PPID>.json` AND `/tmp/langfuse-span-<PPID>.json` if either still exists
- Existing stop-hook behavior (completion-checklist + session-cleanup) is preserved unchanged — Langfuse block is additive only
- Wrapped in try/catch — never propagates exception to pipeline

**Covers:** FR-5, FR-6, design §4.3
**Testable via:** F9 includes a flush-timeout subcase

---

### T3.4 — Mirror to `.codex/hooks/stop-hook.cjs`

**File target:** `.codex/hooks/stop-hook.cjs` (MODIFIED, byte-identical mirror)
**Change type:** Apply same diff as T3.3
**Dependency:** T3.3 complete

**Acceptance criteria:**
- File contents byte-equivalent to `.claude/hooks/stop-hook.cjs` post-T3.3
- If `.codex/hooks/stop-hook.cjs` did not previously exist, create it as full copy

**Covers:** CLAUDE.md Iron Law
**Testable via:** `cmp` check

---

### T3.5 — Register hooks in `hooks/hooks.json`

**File target:** `hooks/hooks.json` (MODIFIED, +~12 lines JSON)
**Change type:** Add entry to existing `PreToolUse:Agent` matcher array + add NEW top-level `PostToolUse` key
**Dependency:** T3.1 complete

**Acceptance criteria:**
- Under existing `PreToolUse` `Agent` matcher array: append a SECOND hook entry pointing to `node "${CLAUDE_PLUGIN_ROOT}/.claude/hooks/langfuse-hook.cjs"` AFTER the existing sentinel-hook entry (ordering matters per design §7 — sentinel runs first as critical-path enforcement)
- Add new top-level `PostToolUse` key with `Agent` matcher pointing to the same langfuse-hook command
- JSON remains valid (parseable by `node -e "JSON.parse(...)"`)
- No existing entries (UserPromptSubmit, SessionStart, Stop, dispatch-guard) are modified or reordered

**Covers:** FR-10, design §7
**Testable via:** JSON parse + structural assertion in F9 setup

---

### T3.6 — Emit Langfuse events from `lib/gate-decision-writer.cjs`

**File target:** `lib/gate-decision-writer.cjs` (MODIFIED, +~25 LOC per design §2)
**Change type:** Add side-call AFTER existing JSONL write
**Dependency:** T2.2 complete

**Acceptance criteria:**
- After the existing `appendJsonl(gateDecisionsPath, entry)` call: NEW try/catch block that reads `/tmp/langfuse-trace-<PPID>.json`, gets the client via `lib/langfuse-client.cjs`, and emits `client.event({ traceId, name: entry.gate_name, metadata: { decision, hardness, run_id } })` (per FR-4, design §6)
- If trace carrier file missing OR `!isEnabled()` → skip the Langfuse emission silently (no error log — this is normal when Langfuse is off OR no trace open yet)
- Exception in the new block → caught, logged to `.pipeline/langfuse-errors.jsonl`, never propagated (per FR-6)
- Existing JSONL write behavior is fully preserved — single-writer invariant maintained; Langfuse emission is additive side-effect AFTER JSONL succeeds
- Escape hatch documented in code comment: if v7.3.0 ships and Langfuse server-side dedup proves unreliable, this entire block can be commented out for v7.4.0 fix (per design §6)

**Covers:** FR-4, FR-6, design §6
**Testable via:** F9 asserts gate-decision event appears in mock-SDK capture

---

### Batch 3 Gate

Run `npm test`. MUST be GREEN. F7 line-cap on sentinel-hook (250-450 lines) MUST still pass — sentinel-hook is untouched by design, but verify line count regression test stays in band. Hooks now wired but with `LANGFUSE_ENABLED=false` (default) — behavior MUST be byte-identical to pre-Batch-3 baseline.

**Adversarial review checkpoint:** invoke adversarial-pass agent on this batch's diff before declaring complete (ADVERSARIAL_GATE_MANDATORY).

---

## Batch 4 — Regression tests + acceptance

Goal: lock in the 5 ACs from spec.json via 3 new regression tests in `tests/regression/v7.3.0/`. Tests run in the existing pure-Node fs+assert harness (per information-gate finding on test framework).

### T4.1 — F8 disabled-noop test

**File target:** `tests/regression/v7.3.0/F8_langfuse_disabled_noop.cjs` (NEW, ~150 LOC budget)
**Change type:** New test file
**Dependency:** Batch 3 complete

**Acceptance criteria:**
- F8-S1: static grep `require\(['"]langfuse['"]\)` on `.claude/hooks/langfuse-hook.cjs` and `lib/langfuse-client.cjs` returns ZERO matches at module top level (regex matched only inside function bodies)
- F8-S2: with `LANGFUSE_ENABLED` unset, run langfuse-hook.cjs as subprocess simulating PreToolUse:Agent → process exits 0 in < 100ms (measured via `process.hrtime.bigint()` wrapper)
- F8-S3: with `LANGFUSE_ENABLED=false`, same as F8-S2 → exits 0, no `/tmp/langfuse-*-*.json` files created, no `.pipeline/langfuse-errors.jsonl` entries
- F8-S4: literal grep for the string `do NOT await` in `.claude/hooks/langfuse-hook.cjs` returns AT LEAST 2 matches (one in handlePre, one in handlePost — per design §4.1 G1 resolution)
- F8-S5: byte-equivalence check between `.claude/hooks/langfuse-hook.cjs` and `.codex/hooks/langfuse-hook.cjs`

**Covers:** AC1, AC4, NFR-1, NFR-4, NFR-5, FR-1, FR-11

---

### T4.2 — F9 span-schema test (with mock SDK)

**File target:** `tests/regression/v7.3.0/F9_langfuse_span_schema.cjs` (NEW, ~200 LOC budget)
**Change type:** New test file with monkey-patched `langfuse` module via `require.cache` injection
**Dependency:** Batch 3 complete; T4.1 GREEN

**Acceptance criteria:**
- F9-S1: with mock SDK installed in require.cache and `LANGFUSE_ENABLED=true`, simulate PreToolUse → mock SDK records ONE `trace.span()` call with well-formed payload (traceId, spanId, name, input, metadata.phase, metadata.agent_name, metadata.pipeline_doc_path all present)
- F9-S2: after Pre, `/tmp/langfuse-span-<PPID>.json` (via `os.tmpdir()`) exists with required keys (traceId, spanId, startedAt, agentName, sampled)
- F9-S3: simulate PostToolUse → mock SDK records `span.end()` with non-zero duration AND tmp file is deleted
- F9-S4: simulate PostToolUse when tmp file is absent → mock SDK records ZERO calls (silent no-op per design §3.2)
- F9-S5: simulate PostToolUse when tmp file is corrupt JSON → exits 0, mock SDK records ZERO calls, `.pipeline/langfuse-errors.jsonl` gets `tmp_file_corrupt` entry
- F9-S6: inject SDK throw on span open → exits 0, `.pipeline/langfuse-errors.jsonl` gets `sdk_throw` entry
- F9-S7: simulate stop-hook flush → mock SDK `flushAsync()` is called exactly once with timeout race; on injected hang → `flush_timeout` log entry appears
- F9-S8: simulate gate-decision-writer with active trace → mock SDK records `event()` call with `metadata.decision` and `metadata.hardness` populated
- F9-S9: with `LANGFUSE_SAMPLE_RATE=0.0`, simulate 100 PreToolUse invocations → mock SDK records ZERO span opens

**Covers:** AC2, AC4, FR-2, FR-3, FR-4, FR-5, FR-6, FR-8, NFR-2

---

### T4.3 — F10 sanitization test

**File target:** `tests/regression/v7.3.0/F10_langfuse_sanitization.cjs` (NEW, ~180 LOC budget)
**Change type:** New test file exercising `lib/langfuse-sanitizer.cjs` directly + integration via mock SDK
**Dependency:** T2.1 complete (can run earlier in principle but Batch 4 keeps tests cohesive)

**Acceptance criteria:**
- F10-S1: unit — input > 2000 chars truncated to 2000 chars exactly (1997 chars + "...")
- F10-S2: unit — absolute path containing pluginRoot replaced with relative path using forward slashes (Windows backslash variant included)
- F10-S3: unit — each of 5 secret regex patterns (sk_live_*, sk_test_*, ghp_*, npm_*, LANGFUSE_SECRET_KEY=*) replaced with `[REDACTED]`
- F10-S4: unit — dynamic env scan: set `process.env.FAKE_SECRET_TOKEN = "abc12345xyz"` then sanitize a text containing that value → value becomes `[REDACTED]`; value of length ≤ 8 chars NOT redacted (to avoid false positives on short generic values)
- F10-S5: unit — env value containing regex metacharacters (e.g. `$^.*+?()[]{}|\`) is literal-replaced, not regex-interpreted
- F10-S6: unit — null/undefined input returns empty string, no throw
- F10-S7: integration — corpus of 5 synthetic payloads (NPM_TOKEN, LANGFUSE_SECRET_KEY, sk_live_*, ghp_*, custom *_PASSWORD) → 100% of mock-SDK-captured payloads have all secret values replaced
- F10-S8: integration — `.pipeline/langfuse-errors.jsonl` scan after error-injection run → ZERO lines contain any of the original secret values
- F10-S9: stress — 100KB input with embedded secret → sanitizer completes in < 50ms (regex catastrophic-backtrack guard per design §11)

**Covers:** AC3, AC5, FR-7, FR-9, NFR-3

---

### T4.4 — Full suite + acceptance verification

**File target:** none (verification task)
**Change type:** Run `npm test` and verify all 5 ACs from spec.json
**Dependency:** T4.1 + T4.2 + T4.3 complete

**Acceptance criteria:**
- `npm test` GREEN — all existing 46 suites PLUS F8 + F9 + F10 pass
- AC1 (disabled = noop) verified via F8-S1..S5
- AC2 (span schema with mock SDK) verified via F9-S1..S9
- AC3 (sanitizer removes secrets) verified via F10-S3..S5, S7
- AC4 (< 100ms overhead disabled) verified via F8-S2
- AC5 (no secrets in any log) verified via F10-S8
- F7 regression test (sentinel-hook line cap 250-450) still PASSES — sentinel-hook untouched, line count unchanged
- `git diff --stat` against pre-feature baseline shows only files listed in design §2 module inventory (no rogue edits to agents/skills/references/CLAUDE.md/sentinel-hook)

**Covers:** all ACs end-to-end
**Testable via:** `npm test` exit code 0 + manual checklist

---

### Batch 4 Gate

Final acceptance. After GREEN: feature is implementation-complete. CHANGELOG entry + README section follow as separate publish-prep tasks (out of this pipeline scope).

---

## Cross-batch invariants (must hold after every batch)

| Invariant | Source | Check |
|---|---|---|
| `sentinel-hook.cjs` untouched | D1, NFR-6 | `git diff --stat` shows zero changes to `sentinel-hook.cjs` |
| F7 line-cap PASS | information-gate Gap B | F7 test GREEN |
| Iron Law file scope | NFR-6 | `git diff --name-only` confined to design §2 list |
| Codex mirror parity | FR-11 | `.codex/hooks/*.cjs` byte-equivalent to `.claude/hooks/*.cjs` counterparts |
| No top-level langfuse require | NFR-5 | F8-S1 static grep |
| Default OFF behavior preserved | NFR-1, AC1 | F8 + baseline comparison |
| Single-writer JSONL | task-orchestrator business rules | gate-decision-writer remains sole writer for `gate-decisions.jsonl`; only langfuse-hook/client/stop-hook write `langfuse-errors.jsonl` |

---

## Risk index

| Task | Risk | Mitigation |
|---|---|---|
| T3.1 | `CLAUDE_HOOK_EVENT` env var name guess wrong | Executor verifies live before T3.1 → falls back to argv/stdin parse if env var absent |
| T3.5 | Hook order regression breaks sentinel critical path | Sentinel entry MUST stay first in PreToolUse:Agent array (design §7 explicit) |
| T3.6 | Cross-process SDK dedup issue | Escape hatch — comment out the new try/catch block for v7.4.0; rest of feature still functional |
| T3.2/T3.4 | `.codex/hooks/` does not exist | T3.2 creates the directory (information-gate Gap A noted; tasks.md surfaces explicitly) |
| Batch 3 overall | Hooks on critical path | Adversarial review MANDATORY before declaring Batch 3 complete |
| T1.2 | Adding langfuse npm dep breaks existing tests | Batch 1 gate catches immediately; revert is trivial |

---

## Phase doc metadata

```
pipeline: feature-heavy
phase: 1.5a (brainstorm-controller inline)
artifact: tasks.md
status: COMPLETE
batches: 4
tasks_total: 13 (T1.1, T1.2, T2.1, T2.2, T3.1-T3.6, T4.1-T4.4)
next_phase: 1.6 (plan-architect) -> 1.7 (closeout) -> 2 (executor)
```
