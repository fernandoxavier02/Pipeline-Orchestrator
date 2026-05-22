# Plan — Langfuse Cloud Observability

**Spec:** `2026-05-21-langfuse-observability`
**Generated:** 2026-05-21 by plan-architect (Phase 1.5b)
**Input:** spec triple (spec.json + requirements.md + design.md + tasks.md) + codebase reality verification
**Plugin target:** v7.3.0

---

## Codebase Reality Verification

### File target status (per tasks.md Module Inventory)

| File | Status | Finding |
|---|---|---|
| `.env.example` | DOES NOT EXIST | T1.1 creates it from scratch (not an edit) — additive, no conflict |
| `package.json` | EXISTS (verified) | No `dependencies` block currently — T1.2 adds the block + langfuse entry |
| `lib/langfuse-sanitizer.cjs` | DOES NOT EXIST | Safe to create |
| `lib/langfuse-client.cjs` | DOES NOT EXIST | Safe to create |
| `.claude/hooks/langfuse-hook.cjs` | DOES NOT EXIST | Safe to create |
| `.codex/hooks/langfuse-hook.cjs` | DOES NOT EXIST | `.codex/hooks/` directory also absent — T3.2 creates dir + file |
| `.claude/hooks/stop-hook.cjs` | EXISTS (233 lines, verified) | Sync handler architecture — see Risk R3 below |
| `.codex/hooks/stop-hook.cjs` | DOES NOT EXIST | T3.4 creates it as full copy of T3.3 result |
| `hooks/hooks.json` | EXISTS (82 lines, verified) | No `PostToolUse` key currently — clean addition |
| `lib/gate-decision-writer.cjs` | EXISTS (193 lines, verified) | Clean insertion point after `appendGateDecision` return |
| `tests/regression/v7.3.0/F8_*.cjs` | DOES NOT EXIST | Directory `v7.3.0/` also absent — T4.1 creates dir + file |
| `tests/regression/v7.3.0/F9_*.cjs` | DOES NOT EXIST | Same directory |
| `tests/regression/v7.3.0/F10_*.cjs` | DOES NOT EXIST | Same directory |

**No file conflicts detected.** All creates are clean; all modifications are additive.

---

### Critical Discovery: Hook Event Detection

**Finding (HIGH — affects T3.1):** The spec (design §4.1) assumes `langfuse-hook.cjs` branches on `process.env.CLAUDE_HOOK_EVENT`. However, codebase reality shows that existing hooks (dispatch-guard.cjs, sentinel-hook.cjs) read the hook payload from **stdin as JSON** and detect the tool type via `input.tool_name`. There is no evidence of `CLAUDE_HOOK_EVENT` or `CC_HOOK_EVENT` env vars being set by the Claude Code runtime.

**Pattern confirmed:** `dispatch-guard.cjs` line 185: `if (input && input.tool_name === 'Agent')` — reads `process.stdin` payload.

**Resolution for T3.1:** Executor MUST verify the actual Claude Code hook contract (stdin JSON schema for PostToolUse:Agent) before implementing the event branching. Design §4.1 already includes `// exact name TBD by executor`. The executor should read the `process.env.CLAUDE_HOOK_EVENT` if available, but fall back to inspecting `stdin.tool_name` or `stdin.type` from the JSON payload — whichever the runtime provides. This is already documented as the #1 risk in tasks.md risk index.

**Finding (MEDIUM — affects T3.3):** `stop-hook.cjs` uses a synchronous-style callback pattern (`process.stdin.on('end', () => { handleStop(); process.exit(0); })`). The design §4.3 shows `await Promise.race(...)` for the flush. Adding an `await` inside a non-async callback requires either: (a) making the callback `async`, or (b) using `.then()` chain without `await`. The executor must choose option (a) — make the `process.stdin.on('end')` callback `async` — to preserve the `await Promise.race` pattern from design §4.3. This is a small but critical structural decision.

---

### Codex Mirror Reality

`.codex/` exists with only `artifacts/html/` inside. The `.codex/hooks/` directory is absent — confirmed by direct inspection. T3.2 (and T3.4 for stop-hook mirror) must create the directory before creating files. This is already noted in tasks.md T3.2 acceptance criteria.

---

### Test Infrastructure Compatibility

Test runner (`scripts/run-tests.cjs`) auto-discovers directories matching `/^v\d+\.\d+\.\d+$/`. A new `tests/regression/v7.3.0/` directory will be auto-picked up on the next `npm test` run. No runner changes needed. F7 (sentinel-hook line cap test at lines 250-450) is confirmed safe — sentinel-hook is 335 lines and is explicitly not touched by this feature.

---

### Package.json Dependencies Block

Current `package.json` has NO `dependencies` field (only `devDependencies` is absent too — it is a zero-runtime-dependency package). T1.2 adds `"dependencies": { "langfuse": "X.Y.Z" }` as a new top-level block. This is clean — no merge conflict risk.

---

## Risk Assessment (codebase-grounded)

| ID | Task | Risk | Severity | Blast Radius | Mitigation |
|---|---|---|---|---|---|
| R1 | T3.1 | Hook event detection: `CLAUDE_HOOK_EVENT` env var may not exist in Claude Code runtime | HIGH | T3.1 entire implementation | Executor verifies live via test hook invocation; fallback to stdin `tool_name` field inspection per dispatch-guard.cjs pattern |
| R2 | T3.5 | Hooks.json ordering: sentinel must stay FIRST in PreToolUse:Agent array | HIGH | All agent spawns | Append langfuse-hook AFTER sentinel entry; F9 asserts hook order |
| R3 | T3.3 | stop-hook.cjs async/await: existing handler callback is not async | MEDIUM | Stop hook behavior | Make `stdin 'end'` callback `async`; wrap new flush block in `await`; test with F9-S7 |
| R4 | T3.6 | gate-decision-writer trace carrier: tmp file may not exist if langfuse is disabled | MEDIUM | gate-decision-writer modification | Guard with `if (isEnabled() && traceCarrier)` — already in design §6 |
| R5 | T3.2/T3.4 | `.codex/hooks/` does not exist | LOW | Codex mirror | T3.2 creates dir explicitly; confirmed gap |
| R6 | T1.2 | `npm install langfuse` may introduce peer-dep warnings | LOW | CI/build | Batch 1 gate catches immediately; `npm ls langfuse` check in T1.2 AC |
| R7 | T4.2 | `require.cache` injection for mock SDK is test-infrastructure-specific | LOW | F9 test only | Established pattern in Node.js test ecosystem; not touching prod code |

**Highest blast radius:** T3.5 (hooks.json ordering) + T3.1 (event detection). Both are in Batch 3 — the adversarial review gate is correctly placed.

---

## Batch Composition Health Check

| Batch | Tasks | Deliverable | Checkpoint-valid? |
|---|---|---|---|
| Batch 1 | T1.1 + T1.2 | Config + dep scaffolding, zero behavior change | YES — `npm test` passes with no new code paths |
| Batch 2 | T2.1 + T2.2 | Two new lib/ modules, no imports from hooks yet | YES — `npm test` passes; new files exist but are not imported |
| Batch 3 | T3.1-T3.6 | Full hook wiring + hooks.json registration | YES — but FRAGILE if partial; must land atomically per tasks.md warning |
| Batch 4 | T4.1-T4.4 | Regression tests + acceptance verification | YES — `npm test` + F8/F9/F10 GREEN is the terminal gate |

**Batch 3 atomicity concern:** tasks.md correctly flags that Batch 3 must land atomically (6 tasks). The executor should NOT checkpoint between T3.1 and T3.5 — hooks.json (T3.5) must be updated before running `npm test` for Batch 3, otherwise the hook exists on disk but is not registered. The RECOMMENDED sequence within Batch 3 is: T3.1 → T3.5 (register) → T3.2 (mirror) → T3.3 (stop-hook) → T3.4 (mirror stop) → T3.6 (gate-writer) → npm test.

---

## Hidden Dependencies (explicit arrows)

```
T1.1 (env.example)
  ∅ (no deps)

T1.2 (package.json + npm install)
  ∅ (no deps, parallel with T1.1)
  → [BATCH 1 GATE: npm test GREEN]

T2.1 (langfuse-sanitizer.cjs)
  ← Batch 1 complete
  ∅ within Batch 2 (parallel with T2.2)

T2.2 (langfuse-client.cjs)
  ← Batch 1 complete (needs langfuse npm installed)
  ← T2.1 is parallel, not a dep
  → [BATCH 2 GATE: npm test GREEN]

T3.1 (langfuse-hook.cjs)
  ← T2.1 + T2.2 (requires both lib modules at require() time)
  ← Batch 2 complete

T3.5 (hooks.json)
  ← T3.1 (file must exist before registration is meaningful)
  MUST follow T3.1 in same batch

T3.2 (codex mirror langfuse-hook)
  ← T3.1 (byte-copy source)

T3.3 (stop-hook.cjs flush)
  ← T2.2 (imports isEnabled + getClient)

T3.4 (codex mirror stop-hook)
  ← T3.3

T3.6 (gate-decision-writer)
  ← T2.2 (imports langfuse-client)
  ← T3.1 (reads trace carrier file written by langfuse-hook)
  → [BATCH 3 GATE: npm test GREEN + adversarial review]

T4.1 (F8 disabled-noop test)
  ← Batch 3 complete (tests hooks that are now registered)

T4.2 (F9 span-schema test)
  ← Batch 3 complete
  ← T4.1 GREEN (sequenced per tasks.md)

T4.3 (F10 sanitization test)
  ← T2.1 complete (tests lib/langfuse-sanitizer.cjs directly)
  ← Batch 3 complete (for integration subcases)
  NOTE: Can be parallelized with T4.2 since both only require Batch 3 done

T4.4 (full suite + AC verification)
  ← T4.1 + T4.2 + T4.3 all GREEN
  → [BATCH 4 GATE: final acceptance]
```

---

## Integration Test Gap Analysis

**Question:** Does the design need an end-to-end smoke test (mock Langfuse endpoint + assert spans formed) beyond F8/F9/F10?

**Analysis:** F9 (`F9_langfuse_span_schema.cjs`) covers the full span lifecycle with `require.cache` mock SDK injection. This IS the integration test — it simulates the complete Pre→Post→Stop flow without real network calls. The 9 subcases (F9-S1 through F9-S9) cover: span schema, tmp file lifecycle, flush timeout, gate event emission, and sampling at 0%.

**Gap identified:** F9 mocks the SDK internally within the test process. It does NOT test langfuse-hook.cjs as a subprocess (spawned by Claude Code). F8-S2 and F8-S3 DO spawn the hook as a subprocess (disabled path). There is no subprocess spawn test for the ENABLED path.

**Recommendation:** Add one subprocess smoke test as F9-S1b within F9: spawn `langfuse-hook.cjs` as a child process with `LANGFUSE_ENABLED=true` + mock credentials + a mock stdin payload, verify it exits 0 and creates the expected tmp file. This closes the gap between "SDK mock in-process" and "hook as real subprocess." Estimated +20 LOC in F9.

**Decision:** Include this as a sub-task of T4.2 (not a separate task) — it augments F9, keeps the batch structure clean.

---

## Task Order (dependency-sorted, within-batch sequencing)

### Batch 1 — Foundation

Safe to parallel-execute T1.1 and T1.2.

**T1.1** — Create `.env.example` (NEW file, additive)
**T1.2** — Modify `package.json` + run `npm install` (add `dependencies` block)

*Batch 1 Gate: `npm test` GREEN*

### Batch 2 — Library Layer

Safe to parallel-execute T2.1 and T2.2.

**T2.1** — Create `lib/langfuse-sanitizer.cjs` (~120 LOC)
**T2.2** — Create `lib/langfuse-client.cjs` (~80 LOC)

*Batch 2 Gate: `npm test` GREEN (no imports yet, pure existence check)*

### Batch 3 — Hook Integration (CRITICAL, land atomically)

Recommended within-batch sequence: T3.1 → T3.5 → T3.2 → T3.3 → T3.4 → T3.6

**T3.1** — Create `.claude/hooks/langfuse-hook.cjs` (~180 LOC)
  - MUST resolve event detection (stdin vs env var) BEFORE writing
**T3.5** — Modify `hooks/hooks.json` (register langfuse-hook in PreToolUse + new PostToolUse)
  - MUST follow T3.1 (file must exist)
**T3.2** — Create `.codex/hooks/langfuse-hook.cjs` (byte-identical mirror + create dir)
  - AFTER T3.1
**T3.3** — Modify `.claude/hooks/stop-hook.cjs` (add async flush + cleanup)
  - Make `stdin 'end'` callback `async` to support `await Promise.race`
**T3.4** — Create/update `.codex/hooks/stop-hook.cjs` (mirror)
  - AFTER T3.3
**T3.6** — Modify `lib/gate-decision-writer.cjs` (add Langfuse event emit after JSONL write)

*Batch 3 Gate: `npm test` GREEN + adversarial review (MANDATORY)*

### Batch 4 — Regression Tests + Acceptance

T4.1 and T4.2/T4.3 can be parallelized after Batch 3.

**T4.1** — Create `tests/regression/v7.3.0/F8_langfuse_disabled_noop.cjs` (~150 LOC + create dir)
**T4.2** — Create `tests/regression/v7.3.0/F9_langfuse_span_schema.cjs` (~220 LOC with subprocess subcases)
**T4.3** — Create `tests/regression/v7.3.0/F10_langfuse_sanitization.cjs` (~180 LOC)
**T4.4** — Run full suite + AC verification (no file output)

*Batch 4 Gate: `npm test` GREEN, all 5 ACs verified*

---

## Cross-Batch Invariants (unchanged from tasks.md)

| Invariant | Check |
|---|---|
| `sentinel-hook.cjs` untouched (335 lines) | `git diff` shows zero changes; F7-S6 still passes |
| F7 line-cap PASS | F7 test GREEN throughout |
| Iron Law file scope | `git diff --name-only` confined to design §2 list |
| Codex mirror parity | `.codex/hooks/*.cjs` byte-equivalent to `.claude/hooks/*.cjs` |
| No top-level langfuse require | F8-S1 static grep |
| Default OFF behavior | F8 + baseline comparison |
| Single-writer JSONL | gate-decision-writer remains sole writer for `gate-decisions.jsonl` |

---

## Bounded Contexts (DDD Lightweight)

| Context | Aggregate Root | Key Invariants |
|---|---|---|
| observability | LangfuseSpan | span always has traceId; open at Pre, close at Post; missing carrier at Post = no-op; sampled flag set at Pre only |
| secret-handling | SanitizedPayload | every payload passes 3-layer sanitizer before egress; error logs never contain raw secret values; sanitizer is deterministic and non-mutating |
| hook-chain | HookInvocation | hooks exit 0 always; langfuse-hook runs AFTER sentinel-hook in PreToolUse:Agent chain; event detection resolved from stdin payload or env var |
| config | FeatureToggle | LANGFUSE_ENABLED=false (or unset) = zero behavior change; missing credentials auto-disable with log; sample rate out of range defaults to 1.0 with log |

---

## Phase Doc Metadata

```
pipeline: feature-heavy
phase: 1.5b (plan-architect)
artifact: plan.md
status: COMPLETE
files_verified: 13
risks_identified: 7 (1 HIGH-new, 6 pre-existing)
hidden_deps_found: 2 (hook event detection, stop-hook async pattern)
integration_gap_found: 1 (subprocess smoke test for enabled path, resolved inline in T4.2)
batches: 4
tasks_total: 13
next_phase: 1.7 (closeout) -> 2 (executor)
```
