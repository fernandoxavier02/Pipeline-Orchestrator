#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-agent-result-contract.test.cjs — T2 (REQ-RESULT-CONTRACT), TDD RED.
//
// Pure-parser tests for the not-yet-existing module
//   lib/contracts/pipeline-agent-result.cjs  →  parseResultBlock(text)
// covering the 13 user-APPROVED scenarios S2-1..S2-13 from
//   05-quality-gate-router.md → T2.
//
// EXPECTED RED REASON: require() throws MODULE_NOT_FOUND (module absent). The
// harness converts that into one [FAIL] per check so the RED is observable as
// assertion-style failures, not a runner abort. Turns GREEN when the strict
// parser ships.
//
// Contract under test (strict rules, no inference / no YAML / no eval):
//   - exactly one well-formed === PIPELINE_AGENT_RESULT_V1 === block, JSON body
//   - LAST complete block wins when two are present
//   - oversize JSON rejected (not truncated-and-accepted)
//   - duplicate JSON key rejected
//   - wrong field types rejected
//   - unknown governance key rejected
//   - closed status vocabulary only: completed | awaiting_user_gate | failed
//   - absence of a block == failure result (absence is NOT success)
//
// CONTRACT SHAPE ASSUMPTION (declared so the GREEN author honors it):
//   parseResultBlock returns an object with a boolean-ish disposition. These
//   tests treat a result as "rejected/failure" when `ok === false` (and accept
//   `status: 'failed'`/an error field as corroborating). A success is `ok===true`
//   with the parsed `status` in the closed vocabulary. If the GREEN author picks
//   a different success flag name, this is the single contract point to reconcile
//   — it is asserted explicitly below, never inferred.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../../lib/contracts/pipeline-agent-result.cjs');

function load() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(MODULE_PATH);
}

// CRLF-safe block builder: the parser must tolerate \r\n line endings (Windows).
function block(jsonText, eol = '\n') {
  return ['=== PIPELINE_AGENT_RESULT_V1 ===', jsonText, '=== END PIPELINE_AGENT_RESULT_V1 ==='].join(eol);
}

function isRejected(r) {
  // A rejection/failure result: ok must be strictly false.
  return r && r.ok === false;
}
function isSuccess(r) {
  return r && r.ok === true;
}

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== T2 pipeline-agent-result.cjs strict parser (RED until module ships) ===');

// ---- S2-1 [main] one well-formed completed block → parsed success -----------
test('S2-1 [main] single completed block → success with status completed + fields', () => {
  const m = load();
  assert.equal(typeof m.parseResultBlock, 'function', 'parseResultBlock must be exported');
  const text = 'preamble prose\n' + block(JSON.stringify({ status: 'completed', summary: 'done', next_agent: 'final-validator' }));
  const r = m.parseResultBlock(text);
  assert.ok(isSuccess(r), `expected ok:true success, got ${JSON.stringify(r)}`);
  assert.equal(r.status, 'completed');
});

// ---- S2-2 [deny-bad] no block at all → failure (absence ≠ success) ----------
test('S2-2 [deny-bad] no result block → failure (absence is never success)', () => {
  const m = load();
  const r = m.parseResultBlock('the agent only returned prose, no block here');
  assert.ok(isRejected(r), `absence of a block must be a failure result, got ${JSON.stringify(r)}`);
  assert.notEqual(r.status, 'completed', 'absence must never resolve to completed');
});

// ---- S2-3 [deny-bad] two blocks → LAST complete block wins -------------------
test('S2-3 [deny-bad] two blocks → last wins (earlier block not silently trusted)', () => {
  const m = load();
  const first = block(JSON.stringify({ status: 'completed', summary: 'FIRST' }));
  const second = block(JSON.stringify({ status: 'failed', summary: 'SECOND' }));
  const r = m.parseResultBlock(first + '\nfiller\n' + second);
  // The last block declares 'failed'; the result must reflect the last block,
  // never the earlier 'completed'.
  assert.notEqual(r && r.summary, 'FIRST', 'must not return the earlier block');
  assert.equal(r && r.status, 'failed', 'last-block-wins: status must come from the second block');
});

// ---- S2-4 [deny-bad] oversize JSON → rejection ------------------------------
test('S2-4 [deny-bad] oversize block → rejection (not truncated-and-accepted)', () => {
  const m = load();
  const huge = 'x'.repeat(200000); // well past any sane size limit
  const r = m.parseResultBlock(block(JSON.stringify({ status: 'completed', summary: huge })));
  assert.ok(isRejected(r), `oversize block must be rejected, got ${JSON.stringify(r && r.ok)}`);
});

// ---- S2-5 [deny-bad] duplicate JSON key → rejection -------------------------
test('S2-5 [deny-bad] duplicate JSON key → rejection (ambiguous JSON refused)', () => {
  const m = load();
  // Hand-written JSON with a repeated key — JSON.parse silently keeps the last,
  // so the parser must detect the duplicate textually and reject.
  const dupJson = '{ "status": "completed", "status": "failed" }';
  const r = m.parseResultBlock(block(dupJson));
  assert.ok(isRejected(r), 'duplicate-key JSON must be rejected, not last-key-wins-accepted');
});

// ---- S2-6 [deny-bad] wrong field types → rejection --------------------------
test('S2-6 [deny-bad] wrong field types → rejection', () => {
  const m = load();
  // status must be a string; here it is a number. (And/or an array field given a string.)
  const r1 = m.parseResultBlock(block(JSON.stringify({ status: 42 })));
  assert.ok(isRejected(r1), 'numeric status must be rejected');
  const r2 = m.parseResultBlock(block(JSON.stringify({ status: 'completed', findings: 'should-be-array' })));
  assert.ok(isRejected(r2), 'string where an array is required must be rejected');
});

// ---- S2-7 [deny-bad] unknown governance key → rejection ---------------------
test('S2-7 [deny-bad] unknown governance key → rejection', () => {
  const m = load();
  const r = m.parseResultBlock(block(JSON.stringify({ status: 'completed', extra_field: true })));
  assert.ok(isRejected(r), 'an unknown governance key must be rejected, not tolerated');
});

// ---- S2-8 [main] status awaiting_user_gate parsed ---------------------------
test('S2-8 [main] status awaiting_user_gate → parsed success in closed vocab', () => {
  const m = load();
  const r = m.parseResultBlock(block(JSON.stringify({ status: 'awaiting_user_gate' })));
  assert.ok(isSuccess(r), `awaiting_user_gate must parse to a success, got ${JSON.stringify(r)}`);
  assert.equal(r.status, 'awaiting_user_gate');
});

// ---- S2-9 [main] status failed parsed ---------------------------------------
test('S2-9 [main] status failed → parsed with status failed', () => {
  const m = load();
  const r = m.parseResultBlock(block(JSON.stringify({ status: 'failed' })));
  assert.equal(r && r.status, 'failed', 'failed branch must be handled and reported as status failed');
});

// ---- S2-10 [regression] embedded eval-like string is never evaluated --------
test('S2-10 [regression] eval-like string in JSON is never executed (JSON.parse only)', () => {
  const m = load();
  let sideEffect = false;
  global.__T2_SIDE_EFFECT__ = () => { sideEffect = true; };
  try {
    const payload = block(JSON.stringify({ status: 'completed', summary: 'global.__T2_SIDE_EFFECT__()' }));
    m.parseResultBlock(payload); // must NOT run the embedded call
    assert.equal(sideEffect, false, 'parser must not evaluate strings as code');
  } finally {
    delete global.__T2_SIDE_EFFECT__;
  }
});

// ---- S2-11 [regression] YAML body → rejection (JSON only) -------------------
test('S2-11 [regression] YAML-formatted body → rejection (never YAML)', () => {
  const m = load();
  const yamlBody = 'status: completed\nsummary: done';
  const r = m.parseResultBlock(block(yamlBody));
  assert.ok(isRejected(r), 'a YAML body must be rejected — the parser only accepts JSON');
});

// ---- S2-12 [edge] empty output → failure ------------------------------------
test('S2-12 [edge] empty (zero-byte) output → failure', () => {
  const m = load();
  const r = m.parseResultBlock('');
  assert.ok(isRejected(r), 'empty output must be a failure result, never success');
});

// ---- S2-13 [edge] status outside closed vocab → rejection -------------------
test('S2-13 [edge] open/unknown status value → rejection', () => {
  const m = load();
  for (const bad of ['open', 'in_progress', 'success', 'done']) {
    const r = m.parseResultBlock(block(JSON.stringify({ status: bad })));
    assert.ok(isRejected(r), `status "${bad}" is outside the closed vocab and must be rejected`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until lib/contracts/pipeline-agent-result.cjs ships):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
