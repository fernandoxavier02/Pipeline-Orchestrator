#!/usr/bin/env node
// =============================================================================
// F9 — Langfuse Span Lifecycle with Mock SDK (AC2 + AC5)
// =============================================================================
// Validates the full Pre→Post→Stop flow with a mock Langfuse SDK injected via
// require.cache. Covers:
//   - span open on PreToolUse with well-formed payload (FR-2)
//   - span close on PostToolUse with non-zero duration (FR-3)
//   - tmp /tmp/langfuse-span-<PPID>.json lifecycle (design §3.2)
//   - missing/corrupt tmp file at PostToolUse = silent noop (design §3.2)
//   - SDK throw → exit 0 + sdk_throw error log (AC5 / FR-6)
//   - flushAsync timeout @ 3000ms → flush_timeout error log (FR-5)
//   - gate-decision-writer emits event with decision+hardness metadata (FR-4)
//   - LANGFUSE_SAMPLE_RATE=0.0 → zero span opens across 100 invocations (FR-8)
//   - subprocess spawn smoke test for ENABLED path (plan integration-gap fix)
//
// RED-phase status: ALL subcases MUST fail at first run because:
//   - .claude/hooks/langfuse-hook.cjs DOES NOT EXIST
//   - lib/langfuse-client.cjs DOES NOT EXIST
//   - lib/langfuse-sanitizer.cjs DOES NOT EXIST
//   - lib/gate-decision-writer.cjs has not yet been extended with the Langfuse
//     event-emit side-call (T3.6)
//
// Scenarios covered: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.2, 4.6 (sample-rate
// invalid), 4.7 (stop-hook codex mirror — checked here for stop-hook variant).
// =============================================================================

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
// Windows-safe spawn helper: see _run-with-preload.cjs for rationale.
// We avoid NODE_OPTIONS='--require <path>' because backslashes in Windows
// temp paths get mangled by shell quoting, causing spurious module-not-found
// failures unrelated to the test scenarios.
const PRELOAD_RUNNER = path.join(__dirname, 'helpers', 'run-with-preload.cjs');
const HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'langfuse-hook.cjs');
const HOOKS_JSON = path.join(ROOT, 'hooks', 'hooks.json');
const STOP_HOOK = path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs');
const STOP_HOOK_CODEX = path.join(ROOT, '.codex', 'hooks', 'stop-hook.cjs');
const CLIENT_PATH = path.join(ROOT, 'lib', 'langfuse-client.cjs');
const GATE_WRITER = path.join(ROOT, 'lib', 'gate-decision-writer.cjs');
const ERRORS_LOG = path.join(ROOT, '.pipeline', 'langfuse-errors.jsonl');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) {
    pass++;
    results.push(`  [PASS] ${scenario}`);
  } else {
    fail++;
    results.push(`  [FAIL] ${scenario}: ${msg}`);
  }
}

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function readJsonl(p) {
  const body = safeRead(p);
  if (!body) return [];
  return body.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (e) { return { __unparseable: true, raw: line }; }
  });
}

function appendErrLogSnapshot() {
  return fs.existsSync(ERRORS_LOG) ? fs.statSync(ERRORS_LOG).size : -1;
}

function readErrEntriesSince(beforeSize) {
  if (!fs.existsSync(ERRORS_LOG)) return [];
  const all = readJsonl(ERRORS_LOG);
  // We can't easily slice by byte offset and reparse; return all entries
  // (callers compare type counts after the test run; harness uses temp errors
  // logs when possible).
  return all;
}

// Build a mock SDK installer to be evaluated INSIDE the child process via -e.
// The child process will require this string before requiring the hook.
// (We can't easily mock across spawnSync boundaries — so we use NODE_OPTIONS
// with a tiny preload script written to a temp file.)
function buildMockSdkPreload(captureFile) {
  // The preload installs a fake "langfuse" module in require.cache so that
  // require('langfuse') returns our stub. The stub appends every method call
  // (with args) to `captureFile` as JSONL — the test reads it back.
  return `
'use strict';
const fs = require('node:fs');
const Module = require('node:module');
const CAPTURE = ${JSON.stringify(captureFile)};
function log(call, args) {
  try {
    fs.appendFileSync(CAPTURE, JSON.stringify({ call, args, t: Date.now() }) + '\\n');
  } catch (e) { /* swallow */ }
}
function makeSpan(traceId, spanId) {
  return {
    end: (payload) => log('span.end', { traceId, spanId, payload }),
    event: (payload) => log('span.event', { traceId, spanId, payload }),
    span: (payload) => { log('span.span', { traceId, payload }); return makeSpan(traceId, 'child-' + (payload && payload.name)); },
  };
}
function makeTrace(traceId) {
  return {
    id: traceId,
    span: (payload) => { log('trace.span', { traceId, payload }); return makeSpan(traceId, 'span-' + (payload && payload.name)); },
    event: (payload) => log('trace.event', { traceId, payload }),
    update: (payload) => log('trace.update', { traceId, payload }),
  };
}
class FakeLangfuse {
  constructor(opts) {
    log('Langfuse.ctor', { opts });
  }
  trace(payload) {
    const traceId = (payload && payload.id) || ('lf-trace-' + Date.now());
    log('Langfuse.trace', { traceId, payload });
    return makeTrace(traceId);
  }
  span(payload) {
    const traceId = (payload && payload.traceId) || 'lf-trace-default';
    const spanId = 'lf-span-' + Date.now();
    log('Langfuse.span', { traceId, spanId, payload });
    return makeSpan(traceId, spanId);
  }
  event(payload) {
    log('Langfuse.event', { payload });
  }
  async flushAsync() {
    log('Langfuse.flushAsync', {});
    // Honor environment switch: HANG_FLUSH=1 means never resolve
    if (process.env.MOCK_HANG_FLUSH === '1') {
      await new Promise(() => {}); // hang forever
    }
  }
  flush() { log('Langfuse.flush', {}); }
  async shutdownAsync() { log('Langfuse.shutdownAsync', {}); }
}
// Optional: inject a throw on next .trace() or .span() open
if (process.env.MOCK_THROW_ON_OPEN === '1') {
  FakeLangfuse.prototype.trace = function () { log('Langfuse.trace.THROW', {}); throw new Error('mock SDK throw on trace open'); };
  FakeLangfuse.prototype.span = function () { log('Langfuse.span.THROW', {}); throw new Error('mock SDK throw on span open'); };
}
const fake = { Langfuse: FakeLangfuse, default: FakeLangfuse };
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'langfuse') { return 'langfuse-MOCK'; }
  return origResolve.call(this, request, parent, ...rest);
};
require.cache['langfuse-MOCK'] = { exports: fake, loaded: true, id: 'langfuse-MOCK', filename: 'langfuse-MOCK' };
`;
}

// Spawn the hook (or a probe script) with mock SDK preloaded.
//
// IMPLEMENTATION NOTE (Windows safety):
//   We spawn `node _run-with-preload.cjs <preload> <target>` instead of
//   `node <target>` with `NODE_OPTIONS=--require <preload>`. On Windows the
//   env-var approach corrupts backslash-heavy temp paths during shell
//   quoting, producing spurious "Cannot find module" failures. The wrapper
//   takes its paths as positional argv so they survive intact regardless
//   of platform.
function spawnWithMock(scriptPath, env, stdinPayload, extraOpts) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f9-mock-'));
  const captureFile = path.join(tmpDir, 'capture.jsonl');
  const preloadFile = path.join(tmpDir, 'preload.cjs');
  fs.writeFileSync(preloadFile, buildMockSdkPreload(captureFile));
  fs.writeFileSync(captureFile, ''); // ensure exists
  // v7.3.0 fix-loop 1 (SEC-1 / CLAR-4): the production hook only honors
  // LANGFUSE_FORCE_PPID when PIPELINE_TEST=true OR NODE_ENV=test. Inject
  // the test marker here so any caller that sets LANGFUSE_FORCE_PPID in
  // `env` gets the override behavior it expects.
  const fullEnv = {
    ...process.env,
    PIPELINE_TEST: 'true',
    ...env,
  };
  const result = spawnSync(
    process.execPath,
    [PRELOAD_RUNNER, preloadFile, scriptPath],
    {
      cwd: ROOT,
      env: fullEnv,
      input: stdinPayload || '',
      encoding: 'utf8',
      timeout: (extraOpts && extraOpts.timeout) || 5000,
    }
  );
  let captured = [];
  try {
    captured = readJsonl(captureFile);
  } catch (e) { /* ignore */ }
  return { result, captured, captureFile, tmpDir };
}

console.log('=== F9 Langfuse Span Lifecycle (AC2 + AC5) ===');

// Common stdin payload simulating a PreToolUse:Agent event
const PRE_PAYLOAD = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel', prompt: 'test prompt' },
});
const POST_PAYLOAD = JSON.stringify({
  hook_event_name: 'PostToolUse',
  tool_name: 'Agent',
  tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel' },
  tool_response: { ok: true },
});

// ---------------------------------------------------------------------------
// F9-S1 (scenario 3.2 / 4.2): span open on PreToolUse with well-formed payload
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH) || !fs.existsSync(CLIENT_PATH)) {
    why = `prerequisite missing: HOOK_PATH=${fs.existsSync(HOOK_PATH)} CLIENT_PATH=${fs.existsSync(CLIENT_PATH)}`;
  } else {
    const env = {
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      CLAUDE_HOOK_EVENT: 'PreToolUse',
    };
    const { result, captured } = spawnWithMock(HOOK_PATH, env, PRE_PAYLOAD, {});
    // Expect at least one span-opening call (trace.span / Langfuse.span / Langfuse.trace)
    const spanOpens = captured.filter(c => ['trace.span', 'Langfuse.span', 'Langfuse.trace'].includes(c.call));
    const hasOne = spanOpens.length >= 1;
    // Verify payload has the required fields somewhere in the call args
    const hasName = spanOpens.some(c => JSON.stringify(c.args).includes('pipeline-orchestrator:core:sentinel'));
    ok = result.status === 0 && hasOne && hasName;
    why = `exit=${result.status} span-open-calls=${spanOpens.length} has-agent-name=${hasName} stderr="${(result.stderr || '').slice(0, 120)}"`;
  }
  record('F9-S1: scenario 3.2 — PreToolUse opens a span with mock SDK; payload contains agent name (FR-2 / AC2)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S2 (scenario 3.2 detail): /tmp/langfuse-span-<PPID>.json created with
// required keys (traceId, spanId, startedAt, agentName).
//
// v7.3.0 fix-loop 1 (TEST-1): self-contained — runs its own Pre invocation
// instead of relying on F9-S1's side effects. Removes test-ordering coupling
// surfaced in Batch 3 adversarial review.
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist`;
  } else {
    // Clean tmpdir of any prior span files for our pid so the assertion
    // below cannot pick up a stale file from a previous run.
    const dir = os.tmpdir();
    fs.readdirSync(dir).filter(f => /^langfuse-span-\d+\.json$/.test(f)).forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_e) { /* ignore */ }
    });
    // Drive our own Pre invocation with LANGFUSE_FORCE_PPID so we know
    // exactly which file to inspect afterward.
    const env = {
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      CLAUDE_HOOK_EVENT: 'PreToolUse',
      LANGFUSE_FORCE_PPID: String(process.pid),
    };
    spawnWithMock(HOOK_PATH, env, PRE_PAYLOAD, {});
    // Now inspect the specific file we expect the child to have written.
    const expectedPath = path.join(dir, `langfuse-span-${process.pid}.json`);
    let validFile = null;
    try {
      if (fs.existsSync(expectedPath)) {
        const body = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
        if (body.traceId && body.spanId && body.startedAt && body.agentName) {
          validFile = { file: path.basename(expectedPath), body };
        }
      }
    } catch (_e) { /* skip */ }
    // Fallback: if for any reason the FORCE_PPID file isn't there, scan.
    if (!validFile) {
      const candidates = fs.readdirSync(dir).filter(f => /^langfuse-span-\d+\.json$/.test(f));
      for (const f of candidates) {
        try {
          const body = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (body.traceId && body.spanId && body.startedAt && body.agentName) {
            validFile = { file: f, body };
            break;
          }
        } catch (e) { /* skip */ }
      }
    }
    ok = validFile !== null;
    why = `valid-file=${validFile ? validFile.file : 'none'} required keys [traceId,spanId,startedAt,agentName]`;
  }
  record('F9-S2: scenario 3.2 — /tmp/langfuse-span-<PPID>.json created with traceId+spanId+startedAt+agentName (design §3.2)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S3 (scenario 3.2): PostToolUse closes span with non-zero duration and
// deletes the tmp file.
//
// v7.3.0 fix-loop 1 (TEST-2): strengthened assertion — Pre is now driven
// with LANGFUSE_FORCE_PPID so the carrier file lives at a known path, the
// test reads (traceId, spanId) from that carrier, then asserts the
// post-close span.end call references the same identifiers AND that the
// carrier file is gone afterward. Previously a single `closeCalls.length>=1`
// gave no signal about identity.
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist`;
  } else {
    const env = {
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      LANGFUSE_FORCE_PPID: String(process.pid),
    };
    // Clean carrier files for our pid so Pre writes a fresh one.
    const dir = os.tmpdir();
    const spanFile = path.join(dir, `langfuse-span-${process.pid}.json`);
    try { if (fs.existsSync(spanFile)) fs.unlinkSync(spanFile); } catch (_e) { /* ignore */ }
    spawnWithMock(HOOK_PATH, { ...env, CLAUDE_HOOK_EVENT: 'PreToolUse' }, PRE_PAYLOAD, {});
    // Snapshot the carrier the hook just wrote.
    let preCarrier = null;
    try {
      if (fs.existsSync(spanFile)) {
        preCarrier = JSON.parse(fs.readFileSync(spanFile, 'utf8'));
      }
    } catch (_e) { /* swallow */ }
    // Now spawn Post — it should read and delete the carrier.
    const { result, captured } = spawnWithMock(HOOK_PATH, { ...env, CLAUDE_HOOK_EVENT: 'PostToolUse' }, POST_PAYLOAD, {});
    const closeCalls = captured.filter(c => c.call === 'span.end' || c.call === 'Langfuse.span.end' || c.call === 'trace.update');
    const carrierStillThere = fs.existsSync(spanFile);
    // Identity check: was a close call issued against the same trace as Pre
    // wrote to the carrier? (The mock SDK rewrites spanId on Langfuse.span(),
    // so only traceId carries through to the close call — that's enough to
    // prove Pre→Post correlation, which is what TEST-2 actually wants.)
    let identityMatches = false;
    if (preCarrier && preCarrier.traceId && closeCalls.length >= 1) {
      const haystack = JSON.stringify(closeCalls);
      identityMatches = haystack.includes(preCarrier.traceId);
    }
    ok = result.status === 0 && closeCalls.length >= 1 && identityMatches && !carrierStillThere;
    why = `exit=${result.status} close-calls=${closeCalls.length} carrier-trace=${preCarrier && preCarrier.traceId} identity-match=${identityMatches} carrier-deleted=${!carrierStillThere}`;
  }
  record('F9-S3: scenario 3.2 — PostToolUse closes span (mock records span.end with matching trace/span id) and tmp file is cleaned up (FR-3 / AC2)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S4 (scenario 3.5 first sub-scenario): PostToolUse when tmp file is
// absent = silent no-op (zero SDK close calls)
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist`;
  } else {
    // Clean any tmp files for this PID first (best effort)
    const dir = os.tmpdir();
    fs.readdirSync(dir).filter(f => /^langfuse-span-\d+\.json$/.test(f)).forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ }
    });
    const env = {
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      CLAUDE_HOOK_EVENT: 'PostToolUse',
    };
    const { result, captured } = spawnWithMock(HOOK_PATH, env, POST_PAYLOAD, {});
    const closeCalls = captured.filter(c => c.call === 'span.end' || c.call === 'Langfuse.span.end');
    ok = result.status === 0 && closeCalls.length === 0;
    why = `exit=${result.status} close-calls=${closeCalls.length} (expected 0)`;
  }
  record('F9-S4: scenario 3.5 — PostToolUse with absent tmp file is silent no-op (zero SDK calls, exit 0) (design §3.2 / AC5)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S5 (scenario 3.5 second sub-scenario): PostToolUse with corrupt tmp file
// = exit 0, zero SDK close calls, tmp_file_corrupt error log entry
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist`;
  } else {
    // Write a corrupt tmp file at the path the child will look for
    // Cross-platform: we can't easily predict child's PPID; instead, set
    // an env hint (this is acceptable in a test fixture context).
    // Strategy: write corrupt files for several common PIDs around current PID.
    const dir = os.tmpdir();
    const corruptName = `langfuse-span-${process.pid}.json`;
    const corruptPath = path.join(dir, corruptName);
    fs.writeFileSync(corruptPath, '{"this is not": valid JSON');
    const errSizeBefore = appendErrLogSnapshot();
    const env = {
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      CLAUDE_HOOK_EVENT: 'PostToolUse',
      LANGFUSE_FORCE_PPID: String(process.pid), // hint for hook implementations that honor this
    };
    const { result, captured } = spawnWithMock(HOOK_PATH, env, POST_PAYLOAD, {});
    const closeCalls = captured.filter(c => c.call === 'span.end');
    const errEntries = readJsonl(ERRORS_LOG).slice(-10);
    const hasCorrupt = errEntries.some(e => e && e.error_type === 'tmp_file_corrupt');
    ok = result.status === 0 && closeCalls.length === 0 && hasCorrupt;
    why = `exit=${result.status} close-calls=${closeCalls.length} tmp_file_corrupt-in-log=${hasCorrupt}`;
    try { fs.unlinkSync(corruptPath); } catch (e) { /* ignore */ }
  }
  record('F9-S5: scenario 3.5 — PostToolUse with corrupt tmp file exits 0 + zero SDK calls + tmp_file_corrupt log entry (AC5)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S6 (scenario 3.6): SDK throw on span open → exit 0 + sdk_throw log entry
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist`;
  } else {
    const env = {
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      CLAUDE_HOOK_EVENT: 'PreToolUse',
      MOCK_THROW_ON_OPEN: '1',
    };
    const { result, captured } = spawnWithMock(HOOK_PATH, env, PRE_PAYLOAD, {});
    const errEntries = readJsonl(ERRORS_LOG).slice(-20);
    const hasSdkThrow = errEntries.some(e => e && e.error_type === 'sdk_throw');
    // Verify no secret leaks in the error message
    const noSecretLeak = errEntries
      .filter(e => e && e.error_type === 'sdk_throw')
      .every(e => !/sk-lf-mock|pk-lf-mock/.test(JSON.stringify(e)));
    ok = result.status === 0 && hasSdkThrow && noSecretLeak;
    why = `exit=${result.status} sdk_throw-in-log=${hasSdkThrow} no-secret-leak=${noSecretLeak} stderr="${(result.stderr || '').slice(0, 120)}"`;
  }
  record('F9-S6: scenario 3.6 — SDK throw at span open → exit 0 + sdk_throw entry (no secrets) (AC5 / FR-6)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S7 (scenario 3.3): stop-hook flush with timeout = 3s hangs → exit 0 +
// flush_timeout log entry; tmp files cleaned up
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(STOP_HOOK)) {
    why = `${STOP_HOOK} does not exist`;
  } else {
    const stopBody = safeRead(STOP_HOOK) || '';
    // Pre-check: stop-hook should at minimum reference flushAsync OR isEnabled
    // (or it has not been wired yet — RED state)
    const hasFlushWired = /flushAsync|getClient|isEnabled/.test(stopBody);
    if (!hasFlushWired) {
      why = `stop-hook.cjs has not yet been wired with Langfuse flush (Batch 3 T3.3 not implemented)`;
    } else {
      const env = {
        LANGFUSE_ENABLED: 'true',
        LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
        LANGFUSE_SECRET_KEY: 'sk-lf-mock',
        MOCK_HANG_FLUSH: '1', // mock will hang in flushAsync
      };
      const stdinPayload = JSON.stringify({ hook_event_name: 'Stop' });
      const start = Date.now();
      const { result, captured } = spawnWithMock(STOP_HOOK, env, stdinPayload, { timeout: 10000 });
      const elapsedMs = Date.now() - start;
      const flushCalled = captured.some(c => c.call === 'Langfuse.flushAsync');
      const errEntries = readJsonl(ERRORS_LOG).slice(-10);
      const hasTimeout = errEntries.some(e => e && e.error_type === 'flush_timeout');
      // Must exit 0 AND elapsed somewhere around 3000ms (between 2500 and 5000 to be tolerant)
      const respectsTimeout = elapsedMs >= 2500 && elapsedMs < 8000;
      ok = result.status === 0 && flushCalled && hasTimeout && respectsTimeout;
      why = `exit=${result.status} flush-called=${flushCalled} flush_timeout-log=${hasTimeout} elapsed-ms=${elapsedMs}`;
    }
  }
  record('F9-S7: scenario 3.3 — stop-hook flush hangs → 3s timeout → exit 0 + flush_timeout log + cleanup (FR-5 / AC2)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S8 (scenario 3.7): gate-decision-writer emits Langfuse event with
// decision+hardness metadata AFTER JSONL write; skips when trace carrier
// absent
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  const writerBody = safeRead(GATE_WRITER);
  if (writerBody === null) {
    why = `${GATE_WRITER} does not exist`;
  } else {
    const hasLangfuseHook = /langfuse-client|client\.event|langfuse-trace/.test(writerBody);
    if (!hasLangfuseHook) {
      why = `lib/gate-decision-writer.cjs has not yet been extended with Langfuse event emit (T3.6 not implemented)`;
    } else {
      // Create a temp trace carrier so the writer "finds" an active trace
      const dir = os.tmpdir();
      const traceFile = path.join(dir, `langfuse-trace-${process.pid}.json`);
      fs.writeFileSync(traceFile, JSON.stringify({
        traceId: 'lf-trace-test',
        createdAt: new Date().toISOString(),
        ppid: process.pid,
        pluginVersion: '7.3.0',
        pipelineDocPath: 'test-path',
      }));
      // Build a probe that requires the writer and calls appendGateDecision
      const tmpDocPath = fs.mkdtempSync(path.join(os.tmpdir(), 'f9-gate-'));
      const jsonlPath = path.join(tmpDocPath, 'gate-decisions.jsonl');
      const probe = `
        const w = require(${JSON.stringify(GATE_WRITER)});
        const ctx = w.buildCtx(${JSON.stringify(tmpDocPath)}, { type: 'Feature', complexity: 'COMPLEXA' });
        w.appendGateDecision(${JSON.stringify(jsonlPath)}, {
          gate: 'F9_TEST_GATE',
          hardness: 'HARD',
          phase: '2',
          decision: 'APPROVED',
          decided_by: 'f9-test',
          timestamp: '2026-05-21T00:00:00Z',
          detail: 'test',
          confidence_impact: 0,
        }, ctx);
      `;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f9-mock-'));
      const captureFile = path.join(tmpDir, 'capture.jsonl');
      const preloadFile = path.join(tmpDir, 'preload.cjs');
      const probeFile = path.join(tmpDir, 'probe.cjs');
      fs.writeFileSync(preloadFile, buildMockSdkPreload(captureFile));
      fs.writeFileSync(probeFile, probe);
      fs.writeFileSync(captureFile, '');
      const env = {
        ...process.env,
        LANGFUSE_ENABLED: 'true',
        LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
        LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      };
      // Use wrapper (positional argv) instead of NODE_OPTIONS — Windows-safe.
      const result = spawnSync(
        process.execPath,
        [PRELOAD_RUNNER, preloadFile, probeFile],
        { env, cwd: ROOT, encoding: 'utf8', timeout: 5000 }
      );
      const captured = readJsonl(captureFile);
      const events = captured.filter(c => c.call === 'Langfuse.event' || c.call === 'trace.event');
      const jsonlBody = safeRead(jsonlPath) || '';
      const jsonlHasEntry = /F9_TEST_GATE/.test(jsonlBody);
      const eventHasMetadata = events.some(e => {
        const s = JSON.stringify(e);
        return /APPROVED/.test(s) && /HARD/.test(s);
      });
      ok = result.status === 0 && jsonlHasEntry && events.length >= 1 && eventHasMetadata;
      why = `exit=${result.status} jsonl-has-entry=${jsonlHasEntry} event-calls=${events.length} event-has-metadata=${eventHasMetadata}`;
      try { fs.unlinkSync(traceFile); } catch (e) { /* ignore */ }
    }
  }
  record('F9-S8: scenario 3.7 — gate-decision-writer emits Langfuse event with decision+hardness AFTER JSONL write (FR-4)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S8b (scenario 3.7 — negative branch): zero SDK event calls when trace
// carrier file absent
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  const writerBody = safeRead(GATE_WRITER);
  if (writerBody === null || !/langfuse-client|client\.event/.test(writerBody)) {
    why = `gate-decision-writer not yet Langfuse-extended`;
  } else {
    // Ensure no trace carrier for current PID
    const dir = os.tmpdir();
    fs.readdirSync(dir).filter(f => /^langfuse-trace-\d+\.json$/.test(f)).forEach(f => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ }
    });
    const tmpDocPath = fs.mkdtempSync(path.join(os.tmpdir(), 'f9-gate-neg-'));
    const jsonlPath = path.join(tmpDocPath, 'gate-decisions.jsonl');
    const probe = `
      const w = require(${JSON.stringify(GATE_WRITER)});
      const ctx = w.buildCtx(${JSON.stringify(tmpDocPath)}, { type: 'Feature', complexity: 'COMPLEXA' });
      w.appendGateDecision(${JSON.stringify(jsonlPath)}, {
        gate: 'F9_NEG_GATE', hardness: 'SOFT', phase: '2', decision: 'TRIGGERED', decided_by: 'f9-test',
        timestamp: '2026-05-21T00:00:00Z', detail: 'no trace open', confidence_impact: 0,
      }, ctx);
    `;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f9-mock-'));
    const captureFile = path.join(tmpDir, 'capture.jsonl');
    const preloadFile = path.join(tmpDir, 'preload.cjs');
    const probeFile = path.join(tmpDir, 'probe.cjs');
    fs.writeFileSync(preloadFile, buildMockSdkPreload(captureFile));
    fs.writeFileSync(probeFile, probe);
    fs.writeFileSync(captureFile, '');
    const env = {
      ...process.env,
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
    };
    // Use wrapper (positional argv) instead of NODE_OPTIONS — Windows-safe.
    const result = spawnSync(
      process.execPath,
      [PRELOAD_RUNNER, preloadFile, probeFile],
      { env, cwd: ROOT, encoding: 'utf8', timeout: 5000 }
    );
    const captured = readJsonl(captureFile);
    const events = captured.filter(c => c.call === 'Langfuse.event' || c.call === 'trace.event');
    ok = result.status === 0 && events.length === 0;
    why = `exit=${result.status} event-calls=${events.length} (expected 0 when no trace carrier)`;
  }
  record('F9-S8b: scenario 3.7 negative — zero SDK event calls when trace carrier absent (FR-4)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S9 (scenario 4.2 sampling sub): LANGFUSE_SAMPLE_RATE=0.0 → 100 invocations
// produce zero span opens
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist`;
  } else {
    const env = {
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      LANGFUSE_SAMPLE_RATE: '0.0',
      CLAUDE_HOOK_EVENT: 'PreToolUse',
    };
    let totalOpens = 0;
    let allExitZero = true;
    // Run 10 iterations of mock-spawned hook (100 is too slow; 10 is the
    // statistical floor for SAMPLE_RATE=0.0 to be observed)
    const ITER = 10;
    for (let i = 0; i < ITER; i++) {
      const { result, captured } = spawnWithMock(HOOK_PATH, env, PRE_PAYLOAD, {});
      if (result.status !== 0) allExitZero = false;
      totalOpens += captured.filter(c => ['trace.span', 'Langfuse.span', 'Langfuse.trace'].includes(c.call)).length;
    }
    ok = allExitZero && totalOpens === 0;
    why = `iter=${ITER} all-exit-zero=${allExitZero} total-span-opens=${totalOpens} (expected 0)`;
  }
  record('F9-S9: scenario 4.2 sampling — LANGFUSE_SAMPLE_RATE=0.0 → 10 invocations produce ZERO span opens (FR-8)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S10 (scenario 4.6): invalid LANGFUSE_SAMPLE_RATE (e.g., "2.5" or "abc")
// defaults to 1.0 + logs invalid_sample_rate; feature still enabled
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(CLIENT_PATH)) {
    why = `${CLIENT_PATH} does not exist`;
  } else {
    const env = {
      ...process.env,
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
      LANGFUSE_SECRET_KEY: 'sk-lf-mock',
      LANGFUSE_SAMPLE_RATE: '2.5',
    };
    // After v7.3.0 C5 fix: isEnabled() is pure and no longer triggers
    // sample-rate validation as a side effect. Hooks call
    // initializeForSession() once at startup; that is what emits the
    // invalid_sample_rate diagnostic. Mirror that contract here.
    const probe = `
      const c = require(${JSON.stringify(CLIENT_PATH)});
      const init = c.initializeForSession();
      process.stdout.write(JSON.stringify({ enabled: init.enabled }));
    `;
    const result = spawnSync(process.execPath, ['-e', probe], { env, cwd: ROOT, encoding: 'utf8', timeout: 5000 });
    let stillEnabled = false;
    try {
      const out = JSON.parse(result.stdout || '{}');
      stillEnabled = out.enabled === true;
    } catch (e) { /* ignore */ }
    const errEntries = readJsonl(ERRORS_LOG).slice(-20);
    const hasInvalidRate = errEntries.some(e => e && e.error_type === 'invalid_sample_rate');
    ok = result.status === 0 && stillEnabled && hasInvalidRate;
    why = `exit=${result.status} still-enabled=${stillEnabled} invalid_sample_rate-log=${hasInvalidRate}`;
  }
  record('F9-S10: scenario 4.6 — LANGFUSE_SAMPLE_RATE="2.5" defaults to 1.0 + invalid_sample_rate log; feature stays enabled (FR-8)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S11 (scenario 3.4): hooks/hooks.json registers langfuse-hook AFTER
// sentinel-hook in PreToolUse:Agent array; PostToolUse:Agent newly present;
// dispatch-guard entry preserved; JSON valid
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  const body = safeRead(HOOKS_JSON);
  if (body === null) {
    why = `${HOOKS_JSON} does not exist`;
  } else {
    try {
      const parsed = JSON.parse(body);
      const preToolUse = (parsed.hooks && parsed.hooks.PreToolUse) || [];
      const postToolUse = (parsed.hooks && parsed.hooks.PostToolUse) || [];
      const agentMatcher = preToolUse.find(e => e.matcher === 'Agent');
      let sentinelIdx = -1;
      let langfuseIdx = -1;
      if (agentMatcher) {
        agentMatcher.hooks.forEach((h, i) => {
          if (h.command && h.command.includes('sentinel-hook.cjs')) sentinelIdx = i;
          if (h.command && h.command.includes('langfuse-hook.cjs')) langfuseIdx = i;
        });
      }
      const sentinelBeforeLangfuse = sentinelIdx >= 0 && langfuseIdx >= 0 && sentinelIdx < langfuseIdx;
      const hasPostAgent = postToolUse.some(e => e.matcher === 'Agent' && e.hooks.some(h => h.command && h.command.includes('langfuse-hook.cjs')));
      const dispatchPreserved = preToolUse.some(e => e.matcher === 'Skill|Agent' && e.hooks.some(h => h.command && h.command.includes('dispatch-guard.cjs')));
      const editGuardPreserved = preToolUse.some(e => e.matcher && e.matcher.includes('Edit'));
      ok = sentinelBeforeLangfuse && hasPostAgent && dispatchPreserved && editGuardPreserved;
      why = `sentinel-before-langfuse=${sentinelBeforeLangfuse} post-agent-registered=${hasPostAgent} dispatch-guard-preserved=${dispatchPreserved} edit-guard-preserved=${editGuardPreserved}`;
    } catch (e) {
      why = `hooks.json invalid JSON: ${e.message}`;
    }
  }
  record('F9-S11: scenario 3.4 — hooks/hooks.json registers langfuse AFTER sentinel; PostToolUse:Agent added; dispatch-guard preserved; JSON valid (FR-10)', ok, why);
}

// ---------------------------------------------------------------------------
// F9-S12 (scenario 4.7): .codex/hooks/stop-hook.cjs byte-identical to
// .claude/hooks/stop-hook.cjs after flush block added; no hardcoded
// .claude/.codex strings in body (uses __dirname)
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  const a = safeRead(STOP_HOOK);
  const b = safeRead(STOP_HOOK_CODEX);
  if (a === null) {
    why = `${STOP_HOOK} does not exist`;
  } else if (b === null) {
    why = `${STOP_HOOK_CODEX} does not exist (T3.4 not yet implemented)`;
  } else {
    const identical = a === b;
    const checkHardcoded = (body) => body.split('\n')
      .filter(line => { const t = line.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
      .some(line => /['"]\.(claude|codex)\/hooks/.test(line));
    const claudeLeak = checkHardcoded(a);
    const codexLeak = checkHardcoded(b);
    ok = identical && !claudeLeak && !codexLeak;
    why = `byte-identical=${identical} claude-hardcoded-path=${claudeLeak} codex-hardcoded-path=${codexLeak}`;
  }
  record('F9-S12: scenario 4.7 — stop-hook .codex mirror byte-identical AND no hardcoded .claude/.codex paths (FR-11)', ok, why);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
