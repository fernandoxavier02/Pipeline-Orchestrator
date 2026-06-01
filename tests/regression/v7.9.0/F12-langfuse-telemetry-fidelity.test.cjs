#!/usr/bin/env node
// =============================================================================
// F12 — Langfuse Telemetry Fidelity (3 cloud-audit findings, 2026-05-31)
// =============================================================================
// Reproduces three defects the existing F9 mock-only suite could not catch,
// confirmed against the live Langfuse cloud:
//
//   Finding 1 (P2) — span duration is always null. handlePre/handlePost never
//     set the SDK-recognized startTime/endTime fields; only a custom
//     metadata.duration_ms is sent, which the cloud does NOT use to compute
//     observation duration.
//
//   Finding 2 (P2) — flat hierarchy: one standalone trace per agent dispatch
//     instead of one run-level trace with N child spans. The run-level trace
//     carrier must be reused across dispatches keyed by PIPELINE_RUN_ID, and
//     the trace name must be run-level (set once), not the latest agent name.
//
//   Finding 3 (P3) — user scores never reach Langfuse. Verify-then-wire: prove
//     client.score() reaches the SDK end-to-end for a run that has an open
//     trace carrier (per user gate: lib/ + tests/ only; final-validator.md
//     untouched; NFR-6 preserved).
//
// Plus two regression guards while payload shapes change:
//   F12-S6 — no secret leak through the new startTime/endTime/score paths.
//   F12-S7 — .codex mirror byte-identical; no hardcoded .claude/.codex paths.
//
// RED-phase status: F12-S1..S4 MUST FAIL against current code (no startTime at
// open, no endTime at close, trace re-created per agent). F12-S5 asserts the
// verify-then-wire contract. F12-S6/S7 are guards that should stay GREEN.
//
// Harness: reuses the F9 mock-SDK preload + Windows-safe run-with-preload
// helper. Auto-discovered by scripts/run-tests.cjs (v7.9.0 matches v<semver>).
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PRELOAD_RUNNER = path.join(ROOT, 'tests', 'regression', 'v7.3.0', 'helpers', 'run-with-preload.cjs');
const HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'langfuse-hook.cjs');
const HOOK_CODEX = path.join(ROOT, '.codex', 'hooks', 'langfuse-hook.cjs');
const SCORE_WRITER = path.join(ROOT, 'lib', 'score-writer.cjs');
const CARRIER = path.join(ROOT, 'lib', 'langfuse-carrier.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg}`); }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; } }
function readJsonl(p) {
  const body = safeRead(p);
  if (!body) return [];
  return body.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (_e) { return { __unparseable: true, raw: line }; }
  });
}

// Same mock-SDK preload contract as F9, but records the FULL payload of every
// call so we can inspect startTime/endTime/score args. The mock NEVER fabricates
// startTime/endTime — only real hook code passing them makes the assertions pass.
function buildMockSdkPreload(captureFile) {
  return `
'use strict';
const fs = require('node:fs');
const Module = require('node:module');
const CAPTURE = ${JSON.stringify(captureFile)};
function log(call, args) {
  try { fs.appendFileSync(CAPTURE, JSON.stringify({ call, args, t: Date.now() }) + '\\n'); } catch (e) {}
}
function makeSpan(traceId, spanId) {
  return {
    end: (payload) => log('span.end', { traceId, spanId, payload }),
    update: (payload) => log('span.update', { traceId, spanId, payload }),
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
    score: (payload) => log('trace.score', { traceId, payload }),
  };
}
class FakeLangfuse {
  constructor(opts) { log('Langfuse.ctor', { opts }); }
  trace(payload) {
    const traceId = (payload && payload.id) || ('lf-trace-' + Date.now());
    log('Langfuse.trace', { traceId, payload });
    return makeTrace(traceId);
  }
  span(payload) {
    const traceId = (payload && payload.traceId) || 'lf-trace-default';
    const spanId = (payload && payload.id) || ('lf-span-' + Date.now());
    log('Langfuse.span', { traceId, spanId, payload });
    return makeSpan(traceId, spanId);
  }
  event(payload) { log('Langfuse.event', { payload }); }
  score(payload) { log('Langfuse.score', { payload }); }
  async flushAsync() { log('Langfuse.flushAsync', {}); }
  flush() { log('Langfuse.flush', {}); }
  async shutdownAsync() { log('Langfuse.shutdownAsync', {}); }
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

function spawnWithMock(scriptPath, env, stdinPayload, captureFile) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f12-mock-'));
  const cap = captureFile || path.join(tmpDir, 'capture.jsonl');
  const preloadFile = path.join(tmpDir, 'preload.cjs');
  fs.writeFileSync(preloadFile, buildMockSdkPreload(cap));
  if (!fs.existsSync(cap)) fs.writeFileSync(cap, '');
  const fullEnv = { ...process.env, PIPELINE_TEST: 'true', ...env };
  const result = spawnSync(
    process.execPath,
    [PRELOAD_RUNNER, preloadFile, scriptPath],
    { cwd: ROOT, env: fullEnv, input: stdinPayload || '', encoding: 'utf8', timeout: 8000 }
  );
  let captured = [];
  try { captured = readJsonl(cap); } catch (_e) { /* ignore */ }
  return { result, captured, captureFile: cap, tmpDir };
}

function spanOpenCalls(captured) {
  return captured.filter((c) => ['trace.span', 'Langfuse.span'].includes(c.call));
}
function traceCreateCalls(captured) {
  return captured.filter((c) => c.call === 'Langfuse.trace');
}
function spanCloseCalls(captured) {
  return captured.filter((c) => ['span.end', 'span.update', 'trace.update'].includes(c.call));
}

function cleanCarriers(runId) {
  const dir = os.tmpdir();
  fs.readdirSync(dir)
    .filter((f) => /^langfuse-(span|trace)-.+\.json$/.test(f))
    .forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (_e) {} });
}

function payloadField(call, field) {
  // Dig the named field out of a captured call's payload (open/close shapes vary).
  const p = (call && call.args && call.args.payload) || {};
  return p[field];
}

const RUN_ID = 'f12-run-' + Date.now();
const PRE = (agent, prompt) => JSON.stringify({
  hook_event_name: 'PreToolUse', tool_name: 'Agent',
  tool_input: { subagent_type: agent, prompt: prompt || 'p' },
});
const POST = (agent) => JSON.stringify({
  hook_event_name: 'PostToolUse', tool_name: 'Agent',
  tool_input: { subagent_type: agent }, tool_response: { ok: true },
});
const ENV_BASE = {
  LANGFUSE_ENABLED: 'true',
  LANGFUSE_PUBLIC_KEY: 'pk-lf-mock',
  LANGFUSE_SECRET_KEY: 'sk-lf-mock',
  PIPELINE_RUN_ID: RUN_ID,
};

console.log('=== F12 Langfuse Telemetry Fidelity (3 cloud-audit findings) ===');

// ---------------------------------------------------------------------------
// F12-S1: span open carries startTime; span close carries endTime; endTime>=startTime
// ---------------------------------------------------------------------------
{
  let ok = false, why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} missing`;
  } else {
    cleanCarriers(RUN_ID);
    const cap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f12-s1-')), 'cap.jsonl');
    spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PreToolUse' }, PRE('pipeline-orchestrator:core:sentinel'), cap);
    spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PostToolUse' }, POST('pipeline-orchestrator:core:sentinel'), cap);
    const captured = readJsonl(cap);
    const opens = spanOpenCalls(captured);
    const closes = spanCloseCalls(captured);
    const startTime = opens.map((c) => payloadField(c, 'startTime')).find(Boolean);
    const endTime = closes.map((c) => payloadField(c, 'endTime')).find(Boolean);
    const positive = startTime && endTime && Date.parse(endTime) >= Date.parse(startTime) && Number.isFinite(Date.parse(startTime));
    ok = !!startTime && !!endTime && !!positive;
    why = `open-startTime=${startTime || 'ABSENT'} close-endTime=${endTime || 'ABSENT'} positive=${!!positive}`;
  }
  record('F12-S1: Finding 1 — span open sets startTime, close sets endTime, endTime>=startTime (FR-3 real duration)', ok, why);
}

// ---------------------------------------------------------------------------
// F12-S2: endTime is a top-level SDK field on close, not only metadata.duration_ms
// ---------------------------------------------------------------------------
{
  let ok = false, why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} missing`;
  } else {
    cleanCarriers(RUN_ID);
    const cap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f12-s2-')), 'cap.jsonl');
    spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PreToolUse' }, PRE('agentA'), cap);
    spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PostToolUse' }, POST('agentA'), cap);
    const closes = spanCloseCalls(readJsonl(cap));
    const hasTopLevelEndTime = closes.some((c) => typeof payloadField(c, 'endTime') === 'string');
    ok = hasTopLevelEndTime;
    why = `close-calls=${closes.length} top-level-endTime=${hasTopLevelEndTime} (current code only sets metadata.duration_ms)`;
  }
  record('F12-S2: Finding 1 — close payload sets SDK-recognized top-level endTime (not only metadata.duration_ms)', ok, why);
}

// ---------------------------------------------------------------------------
// F12-S3: 3 agent dispatches in ONE run share exactly ONE traceId, 3 child spans
// ---------------------------------------------------------------------------
{
  let ok = false, why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} missing`;
  } else {
    cleanCarriers(RUN_ID);
    const cap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f12-s3-')), 'cap.jsonl');
    const agents = ['pipeline-orchestrator:core:a', 'pipeline-orchestrator:core:b', 'pipeline-orchestrator:core:c'];
    for (const a of agents) {
      spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PreToolUse' }, PRE(a, 'work for ' + a), cap);
      spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PostToolUse' }, POST(a), cap);
    }
    const captured = readJsonl(cap);
    const opens = spanOpenCalls(captured);
    const traceIds = new Set(opens.map((c) => c.args && c.args.traceId).filter(Boolean));
    ok = traceIds.size === 1 && opens.length >= 3;
    why = `distinct-traceIds=${traceIds.size} (want 1) span-opens=${opens.length} (want >=3)`;
  }
  record('F12-S3: Finding 2 — 3 agent dispatches in one run share exactly ONE traceId with >=3 child spans', ok, why);
}

// ---------------------------------------------------------------------------
// F12-S4: trace name is run-level (set once), not overwritten to latest agent name
// ---------------------------------------------------------------------------
{
  let ok = false, why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} missing`;
  } else {
    cleanCarriers(RUN_ID);
    const cap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f12-s4-')), 'cap.jsonl');
    const agents = ['agent-first', 'agent-second', 'agent-third'];
    for (const a of agents) {
      spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PreToolUse' }, PRE(a), cap);
      spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PostToolUse' }, POST(a), cap);
    }
    const traceCreates = traceCreateCalls(readJsonl(cap));
    const traceNames = new Set(traceCreates.map((c) => payloadField(c, 'name')).filter(Boolean));
    // After fix: trace name should NOT be the last agent name; it should be a
    // stable run-level name (so the set should not contain agent-second/third
    // as distinct trace names). Accept either: no trace re-create after first,
    // OR a single stable run-level name.
    const noAgentNameAsTraceName = !traceNames.has('agent-second') && !traceNames.has('agent-third');
    ok = noAgentNameAsTraceName;
    why = `trace-create-names=${JSON.stringify([...traceNames])} (must not be re-named to latest agent)`;
  }
  record('F12-S4: Finding 2 — trace name is run-level/stable, not re-set to latest agent name on each dispatch', ok, why);
}

// ---------------------------------------------------------------------------
// F12-S5: Finding 3 verify-then-wire — score reaches SDK for a run with open trace
// ---------------------------------------------------------------------------
{
  let ok = false, why = '';
  if (!fs.existsSync(SCORE_WRITER) || !fs.existsSync(CARRIER)) {
    why = `score-writer or carrier missing`;
  } else {
    cleanCarriers(RUN_ID);
    // Pre-create a run-level trace carrier for RUN_ID so the score-writer's
    // readTraceCarrierForCurrentProcess() resolves it.
    const carrier = require(CARRIER);
    const traceCarrier = {
      traceId: 'lf-trace-f12-score',
      createdAt: new Date().toISOString(),
      runId: RUN_ID,
      ppid: process.pid,
    };
    // Write via the carrier's own atomic writer keyed by runId.
    carrier.writeTraceCarrier(RUN_ID, process.pid, traceCarrier);
    const cap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f12-s5-')), 'cap.jsonl');
    const probe = `
      const sw = require(${JSON.stringify(SCORE_WRITER)});
      const r = sw.writeScores({ scores: { plan: 5, execution: 4, review: null, result: 5 } });
      process.stdout.write(JSON.stringify(r));
    `;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f12-s5-probe-'));
    const preloadFile = path.join(tmpDir, 'preload.cjs');
    const probeFile = path.join(tmpDir, 'probe.cjs');
    fs.writeFileSync(preloadFile, buildMockSdkPreload(cap));
    fs.writeFileSync(probeFile, probe);
    fs.writeFileSync(cap, '');
    const result = spawnSync(
      process.execPath,
      [PRELOAD_RUNNER, preloadFile, probeFile],
      { cwd: ROOT, env: { ...process.env, PIPELINE_TEST: 'true', ...ENV_BASE }, encoding: 'utf8', timeout: 8000 }
    );
    const captured = readJsonl(cap);
    const scoreCalls = captured.filter((c) => c.call === 'Langfuse.score' || c.call === 'trace.score');
    const onCorrectTrace = scoreCalls.filter((c) => {
      const p = (c.args && (c.args.payload || c.args)) || {};
      return p.traceId === 'lf-trace-f12-score' && typeof p.name === 'string' && p.name.startsWith('user.');
    });
    let out = {};
    try { out = JSON.parse(result.stdout || '{}'); } catch (_e) {}
    ok = result.status === 0 && onCorrectTrace.length >= 3 && out.ok === true && !out.skipped;
    why = `exit=${result.status} score-calls=${scoreCalls.length} on-correct-trace=${onCorrectTrace.length} (want>=3) writer=${JSON.stringify(out)}`;
    cleanCarriers(RUN_ID);
  }
  record('F12-S5: Finding 3 verify-then-wire — writeScores emits client.score() to the run trace (>=3 axes) (NFR-6 lib-only)', ok, why);
}

// ---------------------------------------------------------------------------
// F12-S6: no secret leak through new startTime/endTime/score payload paths
// ---------------------------------------------------------------------------
{
  let ok = false, why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} missing`;
  } else {
    cleanCarriers(RUN_ID);
    const cap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'f12-s6-')), 'cap.jsonl');
    const secretPrompt = 'token sk_live_DEADBEEFsecret and npm_ABCD1234tok';
    spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PreToolUse' }, PRE('agentSec', secretPrompt), cap);
    spawnWithMock(HOOK_PATH, { ...ENV_BASE, CLAUDE_HOOK_EVENT: 'PostToolUse' }, POST('agentSec'), cap);
    const blob = JSON.stringify(readJsonl(cap));
    const leaked = /sk_live_DEADBEEFsecret|npm_ABCD1234tok/.test(blob);
    const redacted = /\[REDACTED\]/.test(blob);
    ok = !leaked && redacted;
    why = `secret-leaked=${leaked} redacted-marker-present=${redacted}`;
  }
  record('F12-S6: NFR-3 guard — secrets in prompt are [REDACTED] in SDK payload even with new time fields', ok, why);
}

// ---------------------------------------------------------------------------
// F12-S7: .codex mirror byte-identical; no hardcoded .claude/.codex paths
// ---------------------------------------------------------------------------
{
  let ok = false, why = '';
  const a = safeRead(HOOK_PATH);
  const b = safeRead(HOOK_CODEX);
  if (a === null) { why = `${HOOK_PATH} missing`; }
  else if (b === null) { why = `${HOOK_CODEX} missing`; }
  else {
    const identical = a === b;
    const checkHardcoded = (body) => body.split('\n')
      .filter((line) => { const t = line.trim(); return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')); })
      .some((line) => /['"]\.(claude|codex)\/hooks/.test(line));
    ok = identical && !checkHardcoded(a) && !checkHardcoded(b);
    why = `byte-identical=${identical} claude-hardcoded=${checkHardcoded(a)} codex-hardcoded=${checkHardcoded(b)}`;
  }
  record('F12-S7: FR-11 — .codex/.claude langfuse-hook byte-identical + no hardcoded channel paths', ok, why);
}

// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
