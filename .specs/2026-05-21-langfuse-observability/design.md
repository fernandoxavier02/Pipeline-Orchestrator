# Design — Langfuse Cloud Observability

**Spec:** `2026-05-21-langfuse-observability`
**Generated:** 2026-05-21 by brainstorm-controller Phase 1.5a (inline)
**Backbone:** 7 design decisions from `04-design-interrogator.md` (D1-D7)
**Plugin target:** v7.3.0

---

## 1. Architecture Overview

```
+-----------------------------------------------------------------+
|                     CLAUDE CODE RUNTIME                         |
|                                                                 |
|   PreToolUse:Agent ----+                                        |
|                        |                                        |
|                        v                                        |
|   +-----------------+ +-------------------------+ +-----------+ |
|   | sentinel-hook   | | langfuse-hook (NEW)    | | dispatch- | |
|   | (UNTOUCHED)     | | branch on event:       | | guard     | |
|   |                 | |  Pre  -> open span     | |           | |
|   +-----------------+ |  Post -> close span    | +-----------+ |
|                       +-------------------------+               |
|                                  |                              |
|                                  v                              |
|                       +-------------------------+               |
|                       | lib/langfuse-client    |               |
|                       | (singleton + opt-in)   |               |
|                       +-------------------------+               |
|                                  |                              |
|                  +---------------+---------------+              |
|                  v                               v              |
|       +-------------------+              +-------------------+  |
|       | lib/langfuse-     |              | langfuse npm SDK  |  |
|       | sanitizer         |              | (lazy-loaded)     |  |
|       | (3-layer redact)  |              +---------+---------+  |
|       +-------------------+                        |            |
|                                                    v            |
|                                          +-------------------+  |
|                                          | Langfuse Cloud    |  |
|                                          | HTTP (egress)     |  |
|                                          +-------------------+  |
+-----------------------------------------------------------------+

State files (transient, per-PPID, /tmp):
  /tmp/langfuse-trace-<PPID>.json   <- root traceId (created on first Pre, deleted on Stop)
  /tmp/langfuse-span-<PPID>.json    <- current open span (created on Pre, deleted on Post)

Error log (persistent, gitignored):
  .pipeline/langfuse-errors.jsonl
```

---

## 2. Module Inventory

| Module | New? | Purpose | LOC budget |
|---|---|---|---|
| `.claude/hooks/langfuse-hook.cjs` | NEW | Pre/Post event branching; span open/close; soft-fail wrapper | ~180 |
| `.codex/hooks/langfuse-hook.cjs` | NEW | Byte-identical mirror (Iron Law) | ~180 |
| `lib/langfuse-client.cjs` | NEW | Singleton `getClient()`; opt-in guard; lazy-load langfuse npm | ~80 |
| `lib/langfuse-sanitizer.cjs` | NEW | `sanitizeSpanPayload(text, pluginRoot)` — 3 layers | ~120 |
| `.claude/hooks/stop-hook.cjs` | MODIFIED | Add `langfuse.flushAsync()` with 3s timeout | +20 |
| `.codex/hooks/stop-hook.cjs` | MODIFIED | Mirror | +20 |
| `lib/gate-decision-writer.cjs` | MODIFIED | After JSONL write, emit Langfuse event (option (b) per G4) | +25 |
| `hooks/hooks.json` | MODIFIED | Add langfuse-hook to PreToolUse:Agent chain + new PostToolUse:Agent | +12 lines JSON |
| `package.json` | MODIFIED | Add `"langfuse": "X.Y.Z"` (pin exact minor, no caret) | +1 line |
| `.env.example` | MODIFIED | Document 5 LANGFUSE_* keys | +10 lines |
| `tests/regression/v7.3.0/F8_langfuse_disabled_noop.cjs` | NEW | NFR-1, NFR-4, NFR-5 | ~150 |
| `tests/regression/v7.3.0/F9_langfuse_span_schema.cjs` | NEW | AC2, NFR-2 with mock SDK | ~200 |
| `tests/regression/v7.3.0/F10_langfuse_sanitization.cjs` | NEW | AC3, AC5, NFR-3 | ~180 |

**Total:** 4 new prod files + 3 modified + 3 new tests + 2 config + Codex mirror = 13 files (matches task-orchestrator estimate of 12; +1 for langfuse-client.cjs being promoted out of langfuse-hook).

---

## 3. State File Contracts

### 3.1 `/tmp/langfuse-trace-<PPID>.json` (root trace carrier)

```json
{
  "traceId": "lf-trace-01HXXXX...",
  "createdAt": "2026-05-21T10:00:00.000Z",
  "ppid": 12345,
  "pluginVersion": "7.3.0",
  "pipelineDocPath": "Pipeline-Orchestrator/.pipeline/docs/Pre-Heavy-action/2026-05-21-foo/"
}
```

**Lifecycle:**
- Created by `langfuse-hook.cjs` on first PreToolUse:Agent invocation when no file exists for current PPID.
- Read by every subsequent PreToolUse:Agent (to set parent_id on child spans).
- Read by every PostToolUse:Agent.
- Read by `lib/gate-decision-writer.cjs` (when emitting Langfuse events).
- Deleted by stop-hook.cjs after final flush.

**Race condition handling:** writes use atomic `fs.writeFileSync` to a `.tmp` sibling + rename. Reads tolerate missing file (treat as "trace not yet open" → create new root).

### 3.2 `/tmp/langfuse-span-<PPID>.json` (current open span carrier)

```json
{
  "traceId": "lf-trace-01HXXXX...",
  "spanId": "lf-span-01HYYY...",
  "startedAt": "2026-05-21T10:00:01.234Z",
  "agentName": "pipeline-orchestrator:core:sentinel",
  "sampled": true
}
```

**Lifecycle:**
- Created by PreToolUse:Agent IF sampling roll passes.
- Read+deleted by PostToolUse:Agent.
- If file is missing at PostToolUse (sampling skipped at Pre, OR Pre crashed), Post is a no-op.

**Single-span invariant:** Pipeline-Orchestrator never has nested concurrent agent spawns within a single Claude Code session (sentinel enforces sequential spawn). One span open at a time → single file is sufficient.

**Note (G2 resolution):** Sampling decision is made ONLY at PreToolUse. The presence of `/tmp/langfuse-span-<PPID>.json` is the implicit "this span was sampled" signal. PostToolUse never re-rolls.

---

## 4. Hook Implementation

### 4.1 Event branching (`langfuse-hook.cjs`)

```javascript
// Top-level: NEVER require('langfuse') here — lazy load only
const path = require('path');
const fs = require('fs');
const { isEnabled, getClient } = require(path.join(__dirname, '..', '..', 'lib', 'langfuse-client.cjs'));

function main() {
  try {
    if (!isEnabled()) { process.exit(0); }

    const event = process.env.CLAUDE_HOOK_EVENT || process.env.CC_HOOK_EVENT; // exact name TBD by executor
    if (event === 'PreToolUse') { handlePre(); }
    else if (event === 'PostToolUse') { handlePost(); }
    // else: unknown event — silent exit 0
  } catch (err) {
    logError(err, 'langfuse-hook');
  } finally {
    process.exit(0);
  }
}

function handlePre() {
  // ... sampling roll, span open, write tmp file ...
  // CRITICAL: do NOT await any SDK promise — fire and forget
}

function handlePost() {
  // ... read tmp file, close span, delete tmp file ...
  // CRITICAL: do NOT await any SDK promise — fire and forget
}

main();
```

**G1 resolution (explicit):** Comments in `handlePre` and `handlePost` MUST contain the literal text "do NOT await" to prevent regression. F8 test asserts the comment is present.

### 4.2 Singleton client (`lib/langfuse-client.cjs`)

```javascript
let _client = null;
let _enabled = null;

function isEnabled() {
  if (_enabled !== null) return _enabled;
  const flag = (process.env.LANGFUSE_ENABLED || '').toLowerCase();
  _enabled = (flag === 'true' || flag === '1');
  if (_enabled && (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY)) {
    logMissingCreds();
    _enabled = false;
  }
  return _enabled;
}

function getClient() {
  if (!isEnabled()) return null;
  if (_client) return _client;
  const { Langfuse } = require('langfuse'); // lazy
  _client = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
    // never log secrets even on debug
  });
  return _client;
}

module.exports = { isEnabled, getClient };
```

### 4.3 Stop-hook flush addition

```javascript
// Append to existing stop-hook.cjs main()
const { isEnabled, getClient } = require('../../lib/langfuse-client.cjs');
if (isEnabled()) {
  const client = getClient();
  if (client) {
    const flushPromise = client.flushAsync ? client.flushAsync() : Promise.resolve();
    const timeout = new Promise(res => setTimeout(res, 3000));
    await Promise.race([flushPromise, timeout]).catch(e => logError(e, 'stop-hook'));
  }
  // cleanup tmp files
  cleanupTmpFiles(process.ppid);
}
```

---

## 5. Sanitizer (`lib/langfuse-sanitizer.cjs`)

### 5.1 Public API

```javascript
/**
 * @param {string} text - input/output/metadata field
 * @param {string} pluginRoot - absolute path to plugin root for path redaction
 * @returns {string} sanitized text, never null/undefined
 */
function sanitizeSpanPayload(text, pluginRoot) { /* ... */ }

module.exports = { sanitizeSpanPayload };
```

### 5.2 Layer 1 — Truncate

```javascript
if (typeof text !== 'string') text = String(text ?? '');
if (text.length > 2000) text = text.slice(0, 1997) + '...';
```

### 5.3 Layer 2 — Path redaction

```javascript
const normalizedRoot = pluginRoot.replace(/\\/g, '/').replace(/\/+$/, '');
// Case-insensitive match for Windows
const escapedRoot = escapeRegex(normalizedRoot);
const pathRegex = new RegExp(escapedRoot + '[\\\\/][\\w\\-./\\\\]+', 'gi');
text = text.replace(pathRegex, (match) => {
  const normalized = match.replace(/\\/g, '/');
  return normalized.slice(normalizedRoot.length + 1); // strip root + leading slash
});
```

### 5.4 Layer 3 — Secret redaction

```javascript
const SECRET_PATTERNS = [
  /sk_live_\S+/g,
  /sk_test_\S+/g,
  /ghp_\S+/g,
  /npm_\S+/g,
  /LANGFUSE_SECRET_KEY=\S+/g,
];
SECRET_PATTERNS.forEach(p => { text = text.replace(p, '[REDACTED]'); });

// Dynamic env scan
const ENV_KEY_REGEX = /(SECRET|TOKEN|KEY|PASSWORD)/i;
for (const [key, value] of Object.entries(process.env)) {
  if (!value || value.length <= 8) continue;
  if (!ENV_KEY_REGEX.test(key)) continue;
  // literal substring replace, no regex (value may contain regex chars)
  while (text.includes(value)) {
    text = text.replace(value, '[REDACTED]');
  }
}
return text;
```

**Edge cases handled:**
- `text` is null/undefined → returns `""` after String coercion
- pluginRoot has trailing slash → normalized
- env value contains regex metacharacters → literal replace, not regex
- env value appears multiple times → loop replace

---

## 6. Gate Event Mapping (FR-4, G4 resolution)

### 6.1 Architecture choice — option (b)

`lib/gate-decision-writer.cjs` opens its OWN Langfuse client (same singleton accessed in same process). After the JSONL write succeeds:

```javascript
// Existing: appendJsonl(gateDecisionsPath, entry);
// NEW:
try {
  const { isEnabled, getClient } = require('./langfuse-client.cjs');
  if (isEnabled()) {
    const traceCarrier = readTraceCarrier(process.ppid); // tmp file
    const client = getClient();
    if (client && traceCarrier) {
      client.event({
        traceId: traceCarrier.traceId,
        name: entry.gate_name,
        metadata: {
          decision: entry.decision,
          hardness: entry.hardness,
          run_id: entry.run_id,
        },
      });
    }
  }
} catch (e) {
  logError(e, 'gate-decision-writer');
  // never propagate
}
```

**Why option (b):** The controller process and hook processes both have access to `/tmp/langfuse-trace-<PPID>.json` (same PPID). Langfuse server deduplicates by spanId/eventId. Each process has its own SDK queue, both flush at Stop (controller process flush is implicit via stop-hook; gate-writer process flushes when its parent process exits or via shared stop-hook orchestration).

**Escape hatch:** If empirical testing in F9 shows server-side dedup issues, fallback is to defer gate-event mirroring to v7.4.0 — easy revert because the addition is fully additive (one try/catch block).

---

## 7. Hook Registration (`hooks/hooks.json`)

Modified excerpt:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/.claude/hooks/sentinel-hook.cjs\"" },
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/.claude/hooks/langfuse-hook.cjs\"" }
        ]
      }
      /* ...existing PreToolUse:Skill|Agent dispatch-guard entry preserved... */
    ],
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/.claude/hooks/langfuse-hook.cjs\"" }
        ]
      }
    ]
    /* ...existing UserPromptSubmit, SessionStart, Stop entries preserved... */
  }
}
```

**Ordering rationale:** sentinel-hook runs FIRST (critical-path enforcement). langfuse-hook runs AFTER (observability is best-effort). If sentinel blocks, langfuse-hook does not fire — correct (no observability for blocked spawns).

---

## 8. Error Log Schema (`.pipeline/langfuse-errors.jsonl`)

One JSON object per line:

```json
{"timestamp":"2026-05-21T10:00:00.000Z","error_type":"sdk_throw","message_truncated":"Langfuse API returned 401","run_id":"2026-05-21-foo","hook_name":"langfuse-hook"}
{"timestamp":"2026-05-21T10:00:05.000Z","error_type":"missing_credentials","message_truncated":"LANGFUSE_ENABLED=true but LANGFUSE_PUBLIC_KEY unset","run_id":null,"hook_name":"langfuse-client"}
{"timestamp":"2026-05-21T10:00:10.000Z","error_type":"tmp_file_corrupt","message_truncated":"JSON.parse failed on /tmp/langfuse-span-<PPID>.json","run_id":"2026-05-21-foo","hook_name":"langfuse-hook"}
{"timestamp":"2026-05-21T10:00:15.000Z","error_type":"flush_timeout","message_truncated":"Langfuse flush exceeded 3000ms","run_id":"2026-05-21-foo","hook_name":"stop-hook"}
{"timestamp":"2026-05-21T10:00:20.000Z","error_type":"invalid_sample_rate","message_truncated":"LANGFUSE_SAMPLE_RATE=2.5 out of range; using 1.0","run_id":null,"hook_name":"langfuse-client"}
```

**Allowed `error_type` values:** `sdk_throw`, `missing_credentials`, `tmp_file_corrupt`, `flush_timeout`, `invalid_sample_rate`, `network_error`, `unknown`. F10 test asserts only these values appear.

**Sanitization:** Every `message_truncated` field MUST pass through `sanitizeSpanPayload(message, pluginRoot)` BEFORE being written.

---

## 9. Env Configuration (`.env.example`)

Added section:

```bash
# === Langfuse Cloud Observability (OPT-IN) ===
# Master switch. Set to "true" or "1" to enable. Anything else = disabled.
# When disabled, the langfuse hook exits in <100ms with zero side effects.
LANGFUSE_ENABLED=false

# Langfuse Cloud credentials. Required only when LANGFUSE_ENABLED=true.
# Obtain from https://cloud.langfuse.com -> Project -> Settings -> API Keys
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# Custom Langfuse endpoint (optional). Defaults to cloud.langfuse.com.
# Use for self-hosted Langfuse or staging environments.
# LANGFUSE_HOST=https://cloud.langfuse.com

# Sampling probability 0.0-1.0. Default 1.0 (every run).
# Set to 0.1 to instrument ~10% of runs if cost or volume is a concern.
# LANGFUSE_SAMPLE_RATE=1.0
```

---

## 10. Mapping to Requirements

| Requirement | Design section |
|---|---|
| FR-1 — Opt-in gate | §4.2 `isEnabled()` |
| FR-2 — Span open | §4.1 `handlePre`, §3.2 tmp file |
| FR-3 — Span close | §4.1 `handlePost`, §3.2 |
| FR-4 — Gate event mapping | §6 |
| FR-5 — Flush at Stop | §4.3 |
| FR-6 — Soft-fail | §4.1 try/catch, §8 error log schema |
| FR-7 — Sanitization 3-layer | §5 |
| FR-8 — Sampling | §4 sampling roll, §3.2 G2 resolution |
| FR-9 — Env handling | §4.2 missing-creds, §9 .env.example |
| FR-10 — Hook registration | §7 hooks.json |
| FR-11 — Codex mirror | §2 module table (both .claude/ and .codex/ entries) |
| NFR-1 — Disabled = noop | §4 early exit + §4.2 lazy load |
| NFR-2 — Soft-fail | §4.1 finally exit 0 |
| NFR-3 — No secret leak | §5.4 + §8 sanitization gate on logs |
| NFR-4 — Sub-100ms | §4 early exit before any heavy work |
| NFR-5 — No top-level require | §4.1 module-top comment + §4.2 lazy load pattern |
| NFR-6 — Iron Law | §2 file list constrained |
| NFR-7 — License pin | §2 `langfuse: "X.Y.Z"` exact |

100% requirement coverage. No requirement orphaned. No design feature unattributed.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `CLAUDE_HOOK_EVENT` env var name guess wrong | Executor verifies live; if wrong, fallback to argv inspection or stdin payload parse |
| Cross-process SDK dedup (G4) | Option (b) with escape hatch to defer gate events to v7.4.0 |
| PID reuse between sessions on long-running shells | tmp files include `createdAt`; consumers reject files older than 1 hour |
| Sanitizer regex catastrophic backtrack | All patterns linear-time (no nested quantifiers); F10 includes a 100KB stress input |
| Langfuse npm major version bump breaks API | package.json pins exact minor; renovate/dependabot must explicit-approve langfuse bumps |
| `/tmp/` not writable on Windows | Use `os.tmpdir()` not literal `/tmp/`; all design code samples use literal for brevity but executor uses `os.tmpdir()` |

---

## 12. Phase doc metadata

```
pipeline: feature-heavy
phase: 1.5a (brainstorm-controller inline)
artifact: design.md
status: COMPLETE
next_artifact: validate-design then tasks.md
```
