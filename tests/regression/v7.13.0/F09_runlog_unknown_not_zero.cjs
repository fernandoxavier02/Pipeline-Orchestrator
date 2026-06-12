#!/usr/bin/env node
'use strict';

/**
 * F09 (v7.13.0 — R10): run-log must not coerce UNKNOWN numeric audit values to a
 * misleading 0. An unknown `total_gates_expected` / `duration_seconds` /
 * `total_gates_triggered` stays null; a genuine 0 stays 0; a non-finite value
 * becomes null (not 0) so "unknown" and "genuinely zero" remain distinguishable.
 *
 * This completes the v7.9.1 D4 fix (buildRunLogEntry already produced null for
 * date-only/clock-skew durations, but normalizeEntry was silently re-coercing
 * that null back to 0). It also lets a downstream watchdog tell a run with all
 * gates triggered from a run where the expected-gate count is simply unknown.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const rl = require(path.join(ROOT, 'lib/run-log.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}
function mktmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'f09-')); }

function entry(over = {}) {
  return Object.assign({
    run_id: 'r1', timestamp_start: '2026-06-12T00:00:00Z', timestamp_end: '2026-06-12T00:10:00Z',
    type: 'Bug Fix', complexity: 'COMPLEXA', variant: 'bugfix-heavy',
    total_gates_triggered: 5, total_gates_expected: 11, fidelity_score: 0.8,
    duration_seconds: 600, final_decision: 'GO', pipeline_doc_path: '/x',
  }, over);
}

console.log('=== F09 v7.13.0 run-log unknown != 0 (R10) ===');

test('unknown total_gates_expected stays null (not 0)', () => {
  const repo = mktmp();
  rl.appendRunLog(repo, entry({ total_gates_expected: null }));
  const e = rl.readRunLog(repo)[0];
  assert.equal(e.total_gates_expected, null, 'unknown expected gates must stay null');
});

test('unknown duration_seconds stays null (not 0)', () => {
  const repo = mktmp();
  rl.appendRunLog(repo, entry({ duration_seconds: null }));
  const e = rl.readRunLog(repo)[0];
  assert.equal(e.duration_seconds, null, 'unknown duration must stay null');
});

test('a non-finite numeric becomes null, not 0', () => {
  const repo = mktmp();
  rl.appendRunLog(repo, entry({ total_gates_expected: 'not-a-number' }));
  const e = rl.readRunLog(repo)[0];
  assert.equal(e.total_gates_expected, null, 'garbage numeric must become null, not 0');
});

test('a GENUINE zero stays zero (zero is true)', () => {
  const repo = mktmp();
  rl.appendRunLog(repo, entry({ total_gates_triggered: 0 }));
  const e = rl.readRunLog(repo)[0];
  assert.equal(e.total_gates_triggered, 0, 'a real 0 must be preserved');
});

test('known numeric values (incl. numeric strings) are preserved', () => {
  const repo = mktmp();
  rl.appendRunLog(repo, entry({ total_gates_expected: '11', duration_seconds: 600 }));
  const e = rl.readRunLog(repo)[0];
  assert.equal(e.total_gates_expected, 11, 'numeric string coerced to number');
  assert.equal(e.duration_seconds, 600);
});

test('watchdog can distinguish full coverage from unknown coverage', () => {
  // all gates triggered, expected known → coverage computable
  const repo1 = mktmp();
  rl.appendRunLog(repo1, entry({ total_gates_triggered: 11, total_gates_expected: 11, final_decision: 'NO-GO' }));
  const a = rl.readRunLog(repo1)[0];
  assert.equal(a.total_gates_triggered, 11);
  assert.equal(a.total_gates_expected, 11);
  assert.equal(a.final_decision, 'NO-GO'); // R10: full coverage + failed outcome are both visible
  // unknown expected → coverage NOT misrepresented as 0
  const repo2 = mktmp();
  rl.appendRunLog(repo2, entry({ total_gates_expected: null }));
  assert.equal(rl.readRunLog(repo2)[0].total_gates_expected, null);
});

test('docs distinguish gate coverage from quality outcome (R10.1/R10.2)', () => {
  const md = fs.readFileSync(path.join(ROOT, 'references/fidelity-report-schema.md'), 'utf8');
  assert.match(md, /Coverage vs\.?\s*Quality/i, 'schema must have a coverage-vs-quality section');
  assert.match(md, /fidelity_score[\s\S]{0,80}COVERAGE/i, 'must state fidelity_score is coverage, not quality');
  assert.match(md, /final_decision/, 'must point the quality outcome to final_decision');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
