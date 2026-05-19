#!/usr/bin/env node
'use strict';

/**
 * F1 — lib/gate-decision-writer.cjs exists with canonical enum, auto-injection,
 * and runtime rejection of legacy/unknown decision values.
 *
 * EXPECTED RED STATE on first run: file does not exist yet.
 *
 * Covers v7.1.0 telemetry-hygiene scenario F1 (Finding #1 + part of #4).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'lib/gate-decision-writer.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F1 gate-decision-writer.cjs (SSOT writer) ===');

test('lib/gate-decision-writer.cjs exists', () => {
  assert.ok(fs.existsSync(TARGET), `expected file at ${TARGET}`);
});

test('module exports appendGateDecision, CANONICAL_DECISIONS, CANONICAL_HARDNESS, buildCtx', () => {
  const mod = require(TARGET);
  assert.equal(typeof mod.appendGateDecision, 'function', 'appendGateDecision must be a function');
  assert.ok(mod.CANONICAL_DECISIONS instanceof Set, 'CANONICAL_DECISIONS must be a Set');
  assert.ok(mod.CANONICAL_HARDNESS instanceof Set, 'CANONICAL_HARDNESS must be a Set');
  assert.equal(typeof mod.buildCtx, 'function', 'buildCtx must be a function');
});

test('CANONICAL_DECISIONS contains the 8 canonical values', () => {
  const { CANONICAL_DECISIONS } = require(TARGET);
  const expected = ['BLOCKED', 'DISPATCHED', 'SKIPPED', 'APPROVED', 'CONFIRMED', 'REJECTED', 'TRIGGERED', 'NOT_TRIGGERED'];
  for (const v of expected) {
    assert.ok(CANONICAL_DECISIONS.has(v), `CANONICAL_DECISIONS missing "${v}"`);
  }
  assert.equal(CANONICAL_DECISIONS.size, expected.length, `CANONICAL_DECISIONS should have exactly ${expected.length} values, got ${CANONICAL_DECISIONS.size}`);
});

test('CANONICAL_HARDNESS contains all 5 hardness classes including AUDIT', () => {
  const { CANONICAL_HARDNESS } = require(TARGET);
  const expected = ['MANDATORY', 'HARD', 'CIRCUIT_BREAKER', 'SOFT', 'AUDIT'];
  for (const v of expected) {
    assert.ok(CANONICAL_HARDNESS.has(v), `CANONICAL_HARDNESS missing "${v}"`);
  }
  assert.equal(CANONICAL_HARDNESS.size, expected.length);
});

test('appendGateDecision throws on unknown decision value (legacy "PASS")', () => {
  const { appendGateDecision } = require(TARGET);
  const tmp = path.join(os.tmpdir(), `gdw-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  assert.throws(() => {
    appendGateDecision(tmp, {
      gate: 'COMPLEXITY_GATE',
      hardness: 'SOFT',
      phase: '1',
      decision: 'PASS',  // legacy chaos value — must throw
      decided_by: 'user',
      timestamp: '2026-05-19T00:00:00Z',
      detail: 'test',
      confidence_impact: 0,
    }, { run_id: 'test-run', plugin_version: '7.1.0', schema_version: '1', type: 'Bug Fix', complexity: 'COMPLEXA' });
  }, /decision.*PASS|unknown decision|not in CANONICAL/i);
});

test('appendGateDecision throws on unknown hardness value', () => {
  const { appendGateDecision } = require(TARGET);
  const tmp = path.join(os.tmpdir(), `gdw-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  assert.throws(() => {
    appendGateDecision(tmp, {
      gate: 'COMPLEXITY_GATE',
      hardness: 'SOFTISH',  // bogus
      phase: '1',
      decision: 'APPROVED',
      decided_by: 'user',
      timestamp: '2026-05-19T00:00:00Z',
      detail: 'test',
      confidence_impact: 0,
    }, { run_id: 'test-run', plugin_version: '7.1.0', schema_version: '1', type: 'Bug Fix', complexity: 'COMPLEXA' });
  }, /hardness.*SOFTISH|unknown hardness|not in CANONICAL/i);
});

test('appendGateDecision auto-injects run_id, plugin_version, schema_version, type, complexity', () => {
  const { appendGateDecision } = require(TARGET);
  const tmp = path.join(os.tmpdir(), `gdw-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  appendGateDecision(tmp, {
    gate: 'COMPLEXITY_GATE',
    hardness: 'SOFT',
    phase: '1',
    decision: 'CONFIRMED',
    decided_by: 'user',
    timestamp: '2026-05-19T00:00:00Z',
    detail: 'test',
    confidence_impact: 0.05,
  }, { run_id: 'my-run-123', plugin_version: '7.1.0', schema_version: '1', type: 'Bug Fix', complexity: 'COMPLEXA' });
  const raw = fs.readFileSync(tmp, 'utf8').trim();
  const entry = JSON.parse(raw);
  assert.equal(entry.run_id, 'my-run-123', 'run_id missing or wrong');
  assert.equal(entry.plugin_version, '7.1.0', 'plugin_version missing or wrong');
  assert.equal(entry.schema_version, '1', 'schema_version missing or wrong');
  assert.equal(entry.type, 'Bug Fix', 'type missing or wrong');
  assert.equal(entry.complexity, 'COMPLEXA', 'complexity missing or wrong');
  assert.equal(entry.gate, 'COMPLEXITY_GATE');
  assert.equal(entry.decision, 'CONFIRMED');
  fs.unlinkSync(tmp);
});

test('buildCtx derives run_id from PIPELINE_DOC_PATH slug', () => {
  const { buildCtx } = require(TARGET);
  const ctx = buildCtx('.pipeline/docs/Pre-Heavy-action/2026-05-19-fix-telemetry-hygiene/', {
    type: 'Bug Fix',
    complexity: 'COMPLEXA',
  });
  assert.equal(ctx.run_id, '2026-05-19-fix-telemetry-hygiene', 'run_id should be folder basename');
  assert.equal(typeof ctx.plugin_version, 'string', 'plugin_version must be a string');
  assert.ok(ctx.plugin_version.length > 0, 'plugin_version cannot be empty');
  assert.equal(ctx.schema_version, '1');
  assert.equal(ctx.type, 'Bug Fix');
  assert.equal(ctx.complexity, 'COMPLEXA');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
