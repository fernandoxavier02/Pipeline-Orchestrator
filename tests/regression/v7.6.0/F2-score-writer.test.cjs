#!/usr/bin/env node
// =============================================================================
// F2 — score-writer behavior under Langfuse on/off + invalid input
// =============================================================================
// Spec: v7.6.0 user-score collection — lib/score-writer.cjs
// Covers: validation, silent no-op when Langfuse disabled, no-op when no trace
// carrier, valid scores trigger client.score() per axis with correct names.
// =============================================================================

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.PIPELINE_TEST = 'true';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCORE_WRITER = path.join(ROOT, 'lib', 'score-writer.cjs');
const LANGFUSE_CLIENT = path.join(ROOT, 'lib', 'langfuse-client.cjs');
const CARRIER = path.join(ROOT, 'lib', 'langfuse-carrier.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg || ''}`); }
}

function freshRequire(modPath) {
  delete require.cache[modPath];
  return require(modPath);
}

function resetLangfuseState() {
  const clientMod = freshRequire(LANGFUSE_CLIENT);
  if (typeof clientMod._resetForTests === 'function') {
    clientMod._resetForTests();
  }
}

// -----------------------------------------------------------------------------
// Scenario 1: Module loads + exports
// -----------------------------------------------------------------------------
let mod;
try {
  mod = freshRequire(SCORE_WRITER);
  record('S1 module loads with writeScores + ALLOWED_AXES',
    typeof mod.writeScores === 'function' &&
    Array.isArray(mod.ALLOWED_AXES) &&
    mod.ALLOWED_AXES.length === 4);
} catch (e) {
  record('S1 module loads', false, e.message);
  console.log(results.join('\n'));
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Scenario 2: Invalid input rejected without side effect
// -----------------------------------------------------------------------------
try {
  const r1 = mod.writeScores(); // no args
  record('S2a no args returns ok=false', r1.ok === false && /object/.test(r1.reason));

  const r2 = mod.writeScores({ scores: { plan: 6 } }); // out of range
  record('S2b out-of-range value rejected', r2.ok === false && /outside/.test(r2.reason));

  const r3 = mod.writeScores({ scores: { plan: 'high' } }); // wrong type
  record('S2c non-integer rejected', r3.ok === false && /integer/.test(r3.reason));

  const r4 = mod.writeScores({ scores: { unknownAxis: 3 } }); // typo
  record('S2d unknown axis rejected', r4.ok === false && /unknown axis/.test(r4.reason));

  const r5 = mod.writeScores({ scores: { plan: 3.5 } }); // float
  record('S2e float rejected (must be integer)', r5.ok === false);
} catch (e) {
  record('S2 input validation', false, e.message);
}

// -----------------------------------------------------------------------------
// Scenario 3: Langfuse disabled → silent skip
// -----------------------------------------------------------------------------
delete process.env.LANGFUSE_ENABLED;
delete process.env.LANGFUSE_PUBLIC_KEY;
delete process.env.LANGFUSE_SECRET_KEY;
resetLangfuseState();

try {
  const writer = freshRequire(SCORE_WRITER);
  const r = writer.writeScores({ scores: { plan: 4, execution: 5, review: 3, result: 4 } });
  record('S3a disabled returns ok=true skipped=true',
    r.ok === true && r.skipped === true && r.reason === 'langfuse_disabled');
} catch (e) {
  record('S3 langfuse disabled skip', false, e.message);
}

// -----------------------------------------------------------------------------
// Scenario 4: Langfuse enabled but no creds → still skipped (creds gate)
// -----------------------------------------------------------------------------
process.env.LANGFUSE_ENABLED = 'true';
delete process.env.LANGFUSE_PUBLIC_KEY;
delete process.env.LANGFUSE_SECRET_KEY;
resetLangfuseState();

try {
  const writer = freshRequire(SCORE_WRITER);
  const r = writer.writeScores({ scores: { plan: 5 } });
  record('S4 enabled but no creds skips', r.ok === true && r.skipped === true);
} catch (e) {
  record('S4 no creds', false, e.message);
}

// -----------------------------------------------------------------------------
// Scenario 5: Langfuse enabled with creds, no trace carrier → no_trace_open
// -----------------------------------------------------------------------------
process.env.LANGFUSE_ENABLED = 'true';
process.env.LANGFUSE_PUBLIC_KEY = 'pk-test-stub';
process.env.LANGFUSE_SECRET_KEY = 'sk-test-stub';
process.env.LANGFUSE_HOST = 'http://localhost:9999'; // never reached, but valid scheme
process.env.PIPELINE_RUN_ID = 'test-run-no-carrier-' + Date.now();
resetLangfuseState();

try {
  const writer = freshRequire(SCORE_WRITER);
  const r = writer.writeScores({ scores: { plan: 4 } });
  // With test stub creds the SDK constructor may succeed but client.score will
  // never run because there is no trace carrier file in tmpdir.
  record('S5 no carrier returns skipped no_trace_open',
    r.ok === true && r.skipped === true && r.reason === 'no_trace_open');
} catch (e) {
  record('S5 no trace carrier', false, e.message);
}

// -----------------------------------------------------------------------------
// Scenario 6: Carrier present + scores sent — uses mock SDK via require cache
// -----------------------------------------------------------------------------
const fakeTraceId = 'trace-abc-' + Date.now();
const carrier = freshRequire(CARRIER);
const carrierPath = carrier.getTracePath(process.env.PIPELINE_RUN_ID, null);
fs.writeFileSync(carrierPath, JSON.stringify({ traceId: fakeTraceId, sessionId: 's1' }), 'utf8');

// Install a mock Langfuse client via require cache before reloading.
const mockCalls = [];
const fakeClient = {
  score: (payload) => { mockCalls.push(payload); },
  event: () => {},
};

// Override langfuse-client to return our fake.
delete require.cache[LANGFUSE_CLIENT];
const clientMod = require(LANGFUSE_CLIENT);
clientMod.getClient = () => fakeClient;
clientMod.isEnabled = () => true;
require.cache[LANGFUSE_CLIENT].exports = clientMod;

try {
  const writer = freshRequire(SCORE_WRITER);
  const r = writer.writeScores({
    scores: { plan: 4, execution: 5, review: null, result: 3 },
    comments: { plan: 'planejamento direto' }
  });
  record('S6a writeScores ok with 3 non-null axes', r.ok === true && Array.isArray(r.written));
  record('S6b wrote 3 axes (skipped null review)', r.written && r.written.length === 3);
  record('S6c mockClient saw 3 score calls', mockCalls.length === 3);
  if (mockCalls.length >= 1) {
    const c = mockCalls[0];
    record('S6d call has traceId from carrier', c.traceId === fakeTraceId);
    record('S6e call name is user.plan', c.name === 'user.plan');
    record('S6f call value is 4', c.value === 4);
    record('S6g comment forwarded', c.comment === 'planejamento direto');
  }
  if (mockCalls.length >= 3) {
    const names = mockCalls.map((c) => c.name).sort();
    record('S6h all expected axis names present',
      names[0] === 'user.execution' && names[1] === 'user.plan' && names[2] === 'user.result');
  }
} finally {
  try { fs.unlinkSync(carrierPath); } catch (_e) {}
  delete process.env.LANGFUSE_ENABLED;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_HOST;
  delete process.env.PIPELINE_RUN_ID;
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------
console.log('');
console.log(`F2 — score-writer (v7.6.0)`);
console.log(results.join('\n'));
console.log('');
console.log(`Total: ${pass + fail}, Pass: ${pass}, Fail: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
