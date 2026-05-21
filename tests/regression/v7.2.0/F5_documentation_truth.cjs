#!/usr/bin/env node
// =============================================================================
// F5 — Documentation Truth (Bounded Context: agent prompt narrative)
// =============================================================================
// Pins the AC for Batch 1 of the v7.2.0 followup: plan-architect.md MUST NOT
// carry an auto-confession that the BOUNDED_CONTEXT_MISSING producer is "not
// wired" — because as of commit 740704c (2026-05-20) it IS wired in
// pipeline-controller.md Step 1.5-post.
//
// Maps to BDD feature: features/F5_documentation_truth.feature
// Maps to ATDD AC1 in IMPLEMENTATION_PLAN.md
// =============================================================================

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PLAN_ARCHITECT = path.join(ROOT, 'agents', 'quality', 'plan-architect.md');

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

console.log('=== F5 Documentation Truth (plan-architect.md auto-confession sync) ===');

// Load file
let body;
try {
  body = fs.readFileSync(PLAN_ARCHITECT, 'utf8');
} catch (e) {
  console.error(`FATAL: cannot read ${PLAN_ARCHITECT}: ${e.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// F5-S1 NEGATIVE: "producer not yet wired" must NOT appear
// ---------------------------------------------------------------------------
{
  const hasStaleClaim = body.includes('producer not yet wired');
  record(
    'F5-S1: "producer not yet wired" is NOT present (stale auto-confession removed)',
    !hasStaleClaim,
    'found "producer not yet wired" — auto-confession still stale'
  );
}

// ---------------------------------------------------------------------------
// F5-S2 NEGATIVE: "slated for v6.2" must NOT appear (related stale claim)
// ---------------------------------------------------------------------------
{
  const hasSlatedClaim = body.includes('slated for v6.2');
  record(
    'F5-S2: "slated for v6.2" is NOT present (related stale claim removed)',
    !hasSlatedClaim,
    'found "slated for v6.2" — stale plan reference still present'
  );
}

// ---------------------------------------------------------------------------
// F5-S3 POSITIVE: evidence of WIRED status is present (loose match — accepts
// any WIRED phrasing; version-tag is intentionally NOT required, per adversarial
// review ADV-F5-003)
// ---------------------------------------------------------------------------
{
  const wiredMarkers = [
    '**Status:** WIRED',
    'Step 1.5-post',
    'pipeline-controller.md',
  ];
  const found = wiredMarkers.filter((m) => body.includes(m));
  record(
    `F5-S3: WIRED status declared (any of: ${wiredMarkers.map((m) => `"${m}"`).join(', ')}) — found ${found.length}`,
    found.length > 0,
    `no WIRED marker found; expected at least one of: ${wiredMarkers.join(' | ')}`
  );
}

// ---------------------------------------------------------------------------
// F5-S4 CROSS-REFERENCE: surrounding paragraph mentions the regression test
// ---------------------------------------------------------------------------
{
  // Extract the Status block (between "**Status:**" and the next blank line/section)
  const statusMatch = body.match(/\*\*Status:\*\*[\s\S]*?(?=\n\n|\n\d+\.|\n#)/);
  if (!statusMatch) {
    record('F5-S4: Status block parseable', false, 'could not locate **Status:** block');
  } else {
    const statusBlock = statusMatch[0];
    const mentionsTest = statusBlock.includes('F1.cjs') || statusBlock.includes('tests/regression/v7.2.0/F1');
    record(
      'F5-S4: Status block references the regression test (F1.cjs or tests/regression/v7.2.0/F1)',
      mentionsTest,
      'Status block does not mention F1.cjs — trace from contract to proof is missing'
    );
  }
}

// ---------------------------------------------------------------------------
// F5-S5 INVARIANT: line count of plan-architect.md stays within ±5 of baseline
// (sanity — we only edit one line, not bulk-rewrite the file)
// ---------------------------------------------------------------------------
{
  const lines = body.split('\n').length;
  // Baseline at v7.1.0 / pre-followup: 301 lines (verified via wc -l on 2026-05-21).
  // Tolerance widened to ±25 per adversarial review ADV-F5-004 — strict ±5 created
  // false-positive risk for legitimate future growth (new rule, new bullet, paragraph
  // splits). Anti-bulk-rewrite signal is still useful as a loose sanity check.
  const within = lines >= 280 && lines <= 330;
  record(
    `F5-S5: file line count loose sanity (got ${lines}, expected 280-330)`,
    within,
    `line count ${lines} far outside baseline — bulk rewrite likely`
  );
}

// ---------------------------------------------------------------------------
// F5-S6 INVARIANT: Rule 10 header itself is preserved (we don't break the structure)
// ---------------------------------------------------------------------------
{
  const hasRule10 = body.includes('Bounded Contexts (COMPLEXA only — SOFT enforcement)');
  record(
    'F5-S6: Rule 10 header "Bounded Contexts (COMPLEXA only — SOFT enforcement)" preserved',
    hasRule10,
    'Rule 10 header missing — DDD lightweight contract spec broken'
  );
}

// ---------------------------------------------------------------------------
// F5-S7 EXISTENCE: paths cited in the Status block must actually exist
// Per adversarial review ADV-F5-002 — keyword presence is not enough; the
// referenced files must be reachable from disk, otherwise the prompt is
// lying to the runtime model.
// ---------------------------------------------------------------------------
{
  const cited = [
    path.join(ROOT, 'agents', 'core', 'pipeline-controller.md'),
    path.join(ROOT, 'tests', 'regression', 'v7.2.0', 'F1.cjs'),
  ];
  const missing = cited.filter((p) => !fs.existsSync(p));
  record(
    `F5-S7: paths cited in Status block exist on disk (${cited.length} cited, ${missing.length} missing)`,
    missing.length === 0,
    `missing: ${missing.join(', ')}`
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
