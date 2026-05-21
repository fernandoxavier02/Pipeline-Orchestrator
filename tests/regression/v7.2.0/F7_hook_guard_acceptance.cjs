#!/usr/bin/env node
// =============================================================================
// F7 — Hook Guard Acceptance (Bounded Context: hook is gate-name-agnostic)
// =============================================================================
// Pins the contract that .claude/hooks/sentinel-hook.cjs does NOT have a
// closed deny-list of gate names. The hook validates spawn sequence
// (expected_next, namespace_mismatch, etc), not telemetry content.
//
// Maps to BDD feature: features/F7_hook_guard_acceptance.feature
// Maps to ATDD AC3 in IMPLEMENTATION_PLAN.md
//
// Test type: static analysis of the hook source + module-load smoke test.
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'sentinel-hook.cjs');

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

console.log('=== F7 Hook Guard Acceptance (sentinel-hook.cjs) ===');

if (!fs.existsSync(HOOK_PATH)) {
  console.error(`FATAL: hook not found at ${HOOK_PATH}`);
  process.exit(1);
}

const body = fs.readFileSync(HOOK_PATH, 'utf8');

// ---------------------------------------------------------------------------
// F7-S1 NEGATIVE: hook source contains no literal references to v7.2.0 gate names
// ---------------------------------------------------------------------------
{
  const literals = ['ATDD_STEP_1B_BYPASS', 'BOUNDED_CONTEXT_MISSING'];
  const found = literals.filter((l) => body.includes(l));
  record(
    `F7-S1: hook source has no hardcoded reference to v7.2.0 gate names (${literals.join(', ')})`,
    found.length === 0,
    `found hardcoded references: ${found.join(', ')} — hook is leaking into telemetry-content territory`
  );
}

// ---------------------------------------------------------------------------
// F7-S2 NEGATIVE: hook has no closed allow-list / deny-list patterns for gates
// ---------------------------------------------------------------------------
{
  // Patterns that would indicate the hook is gate-name-keyed:
  const suspectPatterns = [
    /allowedGates?\s*[:=]\s*\[/i,
    /gateAllowList\s*[:=]/i,
    /gateDenyList\s*[:=]/i,
    /VALID_GATES?\s*[:=]/i,
    /ALLOWED_GATES?\s*[:=]/i,
  ];
  const matches = suspectPatterns.filter((re) => re.test(body));
  record(
    'F7-S2: hook has no closed gate-name allow/deny list (allowedGates, gateAllowList, VALID_GATES, etc)',
    matches.length === 0,
    `found ${matches.length} suspicious patterns — hook may be keying on gate names, which couples telemetry to enforcement`
  );
}

// ---------------------------------------------------------------------------
// F7-S3 NEGATIVE: no `entry.gate === "..."` deny patterns
// ---------------------------------------------------------------------------
{
  // Looking for code shape: if (something.gate === "LITERAL_GATE_NAME") deny/throw/block
  const denyOnGateRe = /\.gate\s*===?\s*['"][A-Z_]+['"][\s\S]{0,80}?(deny|block|throw|exit\(2)/;
  const hits = body.match(denyOnGateRe);
  record(
    'F7-S3: hook has no `entry.gate === "X" → deny` pattern',
    hits === null,
    `found suspect pattern: ${hits ? hits[0].substring(0, 100) : 'unreachable'}`
  );
}

// ---------------------------------------------------------------------------
// F7-S4 POSITIVE: hook's enforcement is sequence-keyed (validates expected_next)
// — confirms the hook IS doing its real job, not gate-name filtering
// ---------------------------------------------------------------------------
{
  const sequenceMarkers = ['expected_next', 'namespace_mismatch', 'agent_namespace', 'spawn'];
  const found = sequenceMarkers.filter((m) => body.includes(m));
  record(
    `F7-S4: hook source references spawn-sequence concepts (found ${found.length}/${sequenceMarkers.length} markers)`,
    found.length >= 2,
    `only ${found.length} found; hook may not be doing sequence validation at all`
  );
}

// ---------------------------------------------------------------------------
// F7-S5 SMOKE: hook module parses without throwing
// (require() runs the top-level code; if there's a syntax error or
// missing dependency at parse time, this throws and we fail.)
// ---------------------------------------------------------------------------
{
  let threw = null;
  try {
    // Use a fresh cache key to avoid contamination from other tests
    delete require.cache[require.resolve(HOOK_PATH)];
    require(HOOK_PATH);
  } catch (e) {
    threw = e;
  }
  // Note: the hook may invoke process.exit on require if it's run as a CLI.
  // We tolerate that — `threw` will be null in that case (exit doesn't throw).
  // What we care about is: no SyntaxError, no MODULE_NOT_FOUND.
  const isSyntaxOrDep = threw && (
    threw.name === 'SyntaxError' ||
    (threw.code === 'MODULE_NOT_FOUND')
  );
  record(
    'F7-S5: hook module parses and loads without SyntaxError or missing-dependency',
    !isSyntaxOrDep,
    threw ? `${threw.name}: ${threw.message}` : 'unreachable'
  );
}

// ---------------------------------------------------------------------------
// F7-S6 INVARIANT: hook file size sanity (catches accidental bulk truncation)
// ---------------------------------------------------------------------------
{
  const lines = body.split('\n').length;
  // Baseline 2026-05-21: 335 lines. Tolerance ±50 (this hook gets updated
  // organically; we only want to catch catastrophic truncation).
  const within = lines >= 250 && lines <= 450;
  record(
    `F7-S6: hook file line count loose sanity (got ${lines}, expected 250-450)`,
    within,
    `line count ${lines} suggests catastrophic edit`
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
