#!/usr/bin/env node
'use strict';

// =============================================================================
// F12 (v8.7.0) — gate-log governance ↔ step-ledger CONTRACT test (ARCH-2).
//
// gate-log-guard.REQUIRED_GATES_BEFORE is keyed by agent leaf. Each such agent is
// a phase-transition agent that the FULL workflow already knows about via
// step-ledger.AGENT_STEP_MAP.FULL (leaf → step). If a future edit adds a
// gate-log-governed agent that is NOT a known FULL-workflow agent (or renames one
// on one side only), the two maps drift apart silently and the gate-log gate
// governs an agent the ledger never marks. This test pins the subset relationship
// so that drift fails CI instead of shipping.
// =============================================================================

const assert = require('node:assert/strict');

const { REQUIRED_GATES_BEFORE } = require('../../../lib/gate-log-guard.cjs');
const { AGENT_STEP_MAP } = require('../../../lib/step-ledger.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F12 v8.7.0 — gate-log ↔ step-ledger contract ===');

test('F12-1 — both maps load with the expected shape', () => {
  assert.ok(REQUIRED_GATES_BEFORE && typeof REQUIRED_GATES_BEFORE === 'object');
  assert.ok(AGENT_STEP_MAP && typeof AGENT_STEP_MAP === 'object');
  assert.ok(AGENT_STEP_MAP.FULL && typeof AGENT_STEP_MAP.FULL === 'object');
});

test('F12-2 — every gate-log-governed agent is a known FULL-workflow agent', () => {
  const fullAgents = new Set(Object.keys(AGENT_STEP_MAP.FULL));
  const governed = Object.keys(REQUIRED_GATES_BEFORE);
  assert.ok(governed.length > 0, 'expected at least one gate-log-governed agent');
  const orphans = governed.filter((leaf) => !fullAgents.has(leaf));
  assert.deepEqual(
    orphans,
    [],
    `gate-log-governed agents missing from AGENT_STEP_MAP.FULL: [${orphans.join(', ')}]`
  );
});

test('F12-3 — the seeded governed agents are present on BOTH sides (drift guard)', () => {
  // Pins the current contract explicitly so a one-sided rename is caught even if
  // the subset check above still passes by coincidence.
  for (const leaf of ['executor-controller', 'final-validator']) {
    assert.ok(REQUIRED_GATES_BEFORE[leaf], `${leaf} missing from REQUIRED_GATES_BEFORE`);
    assert.ok(AGENT_STEP_MAP.FULL[leaf], `${leaf} missing from AGENT_STEP_MAP.FULL`);
  }
});

console.log(`\n=== F12 v8.7.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
