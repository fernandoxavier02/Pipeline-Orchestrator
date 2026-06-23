#!/usr/bin/env node
'use strict';

// =============================================================================
// audit-read-counter-hook.cjs — v8.13.0 — PostToolUse COUNTER (Read|Grep|Glob)
// =============================================================================
// The producer half of the read-budget pair (see audit-read-budget-gate.cjs).
// After a read actually executes, if it is a genuine governed-unarmed audit
// investigation read (isCountableRead), increment the signed ledger. NEVER
// blocks, NEVER throws, ALWAYS exits 0 — counting a read that already happened
// must not affect the harness. The PreToolUse blocker then denies the
// (budget+1)th read off the count this hook maintains.
//
// Window derivation is SHARED with the blocker (readMarker / isAlignedRead) and
// the arm-gate (runStateContext) — single source of truth, no second scheme.
// =============================================================================

let budget = null;
try { budget = require('../../lib/audit-read-budget.cjs'); } catch { budget = null; }
let blocker = null;
try { blocker = require('./audit-read-budget-gate.cjs'); } catch { blocker = null; }
let armGate = null;
try { armGate = require('./pipeline-arm-gate.cjs'); } catch { armGate = null; }

function handlePostToolUse(payload) {
  try {
    if (!budget || !blocker) return;
    const dir = payload && payload.cwd;
    if (typeof dir !== 'string' || !dir) return;
    const marker = (typeof blocker.readMarker === 'function') ? blocker.readMarker(dir) : null;
    if (!marker) return; // out of the governed window → nothing to count
    const rs = (armGate && typeof armGate.runStateContext === 'function')
      ? armGate.runStateContext(dir) : { runActive: false };
    const ctx = {
      armPending: true,
      runActive: rs.runActive,
      budgeted: budget.READ_ONLY_ESCAPABLE_TYPES.has(marker.type),
      pipelineAligned: (typeof blocker.isAlignedRead === 'function') ? blocker.isAlignedRead(payload, dir) : false,
    };
    if (budget.isCountableRead(ctx)) budget.bumpLedger(dir, marker);
  } catch { /* additive counter — never throws into the harness */ }
}

if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (c) => { stdin += c; });
  process.stdin.on('end', () => {
    try { handlePostToolUse(JSON.parse(stdin)); } catch { /* swallow */ }
    process.exit(0); // counter NEVER blocks
  });
}

module.exports = { handlePostToolUse };
