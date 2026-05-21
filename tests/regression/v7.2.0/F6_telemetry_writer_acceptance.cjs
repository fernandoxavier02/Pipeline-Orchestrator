#!/usr/bin/env node
// =============================================================================
// F6 — Telemetry Writer Acceptance (Bounded Context: writer accepts gate names)
// =============================================================================
// Pins the contract that lib/gate-decision-writer.cjs (the v7.1.0+ SSOT writer)
// does NOT enforce a closed list of gate names. It only validates `decision`
// (8 canonical values) and `hardness` (5 canonical classes). The gate-NAME is
// open by design so AUDIT-class events (e.g. ATDD_STEP_1B_BYPASS) can be added
// by any agent without touching the writer.
//
// Maps to BDD feature: features/F6_telemetry_writer_acceptance.feature
// Maps to ATDD AC2 in IMPLEMENTATION_PLAN.md
//
// Test type: behavioral — actually invokes the writer against a temp file.
// =============================================================================

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const WRITER_PATH = path.join(ROOT, 'lib', 'gate-decision-writer.cjs');

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

console.log('=== F6 Telemetry Writer Acceptance (gate-decision-writer.cjs) ===');

// Sanity: writer must exist before we try to require it
if (!fs.existsSync(WRITER_PATH)) {
  console.error(`FATAL: writer not found at ${WRITER_PATH}`);
  process.exit(1);
}

const writer = require(WRITER_PATH);
const { appendGateDecision, buildCtx, CANONICAL_DECISIONS, CANONICAL_HARDNESS } = writer;

// Create a unique temp dir for this test run (mirrors safeAppendJsonl-friendly path)
const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'po-f6-'));
const tmpDocPath = path.join(TMPDIR, 'fake-run-slug');
fs.mkdirSync(tmpDocPath, { recursive: true });
const tmpJsonl = path.join(tmpDocPath, 'gate-decisions.jsonl');

const ctx = buildCtx(tmpDocPath, { type: 'Bug Fix', complexity: 'MEDIA' });

// ---------------------------------------------------------------------------
// F6-S1 POSITIVE: ATDD_STEP_1B_BYPASS gate (AUDIT) writes successfully
// ---------------------------------------------------------------------------
{
  let threw = null;
  try {
    appendGateDecision(tmpJsonl, {
      gate: 'ATDD_STEP_1B_BYPASS',
      hardness: 'AUDIT',
      phase: '2',
      decision: 'SKIPPED',
      decided_by: 'quality-gate-router',
      timestamp: '2026-05-21T00:00:00Z',
      detail: 'F6-S1 smoke test: bypass for complexity=SIMPLES',
      confidence_impact: 0,
    }, ctx);
  } catch (e) {
    threw = e;
  }
  record(
    'F6-S1: appendGateDecision accepts gate="ATDD_STEP_1B_BYPASS" + hardness="AUDIT" + decision="SKIPPED"',
    threw === null,
    threw ? `threw: ${threw.message}` : 'unreachable'
  );

  // Cross-check: the line was actually written
  let raw = '';
  try { raw = fs.readFileSync(tmpJsonl, 'utf8'); } catch (_) {}
  const lines = raw.split('\n').filter((l) => l.length > 0);
  record(
    'F6-S1b: written file contains exactly one line after the write',
    lines.length === 1,
    `expected 1 line, got ${lines.length}`
  );
}

// ---------------------------------------------------------------------------
// F6-S2 POSITIVE: BOUNDED_CONTEXT_MISSING name not rejected by writer
// (in production this event goes to protocol-events.jsonl via a different
// code path; this test only proves the writer does NOT reject the NAME if
// someone routes it through here by mistake)
// ---------------------------------------------------------------------------
{
  let threw = null;
  try {
    appendGateDecision(tmpJsonl, {
      gate: 'BOUNDED_CONTEXT_MISSING',
      hardness: 'SOFT',
      phase: '1.5',
      decision: 'TRIGGERED',
      decided_by: 'pipeline-controller',
      timestamp: '2026-05-21T00:00:01Z',
      detail: 'F6-S2 smoke test: COMPLEXA plan missing bounded_contexts',
      confidence_impact: 0,
    }, ctx);
  } catch (e) {
    threw = e;
  }
  record(
    'F6-S2: writer accepts gate="BOUNDED_CONTEXT_MISSING" (name is open by design)',
    threw === null,
    threw ? `threw: ${threw.message}` : 'unreachable'
  );
}

// ---------------------------------------------------------------------------
// F6-S3 NEGATIVE: invalid decision still rejects (invariant preserved)
// ---------------------------------------------------------------------------
{
  let threw = null;
  try {
    appendGateDecision(tmpJsonl, {
      gate: 'ATDD_STEP_1B_BYPASS',
      hardness: 'AUDIT',
      phase: '2',
      decision: 'PASS', // not in canonical 8-value vocab
      decided_by: 'quality-gate-router',
      timestamp: '2026-05-21T00:00:02Z',
      detail: 'F6-S3 smoke test: invalid decision must reject',
    }, ctx);
  } catch (e) {
    threw = e;
  }
  const isTypeError = threw && threw.name === 'TypeError';
  const mentionsVocab = threw && /CANONICAL_DECISIONS/.test(threw.message);
  record(
    'F6-S3: invalid decision="PASS" throws TypeError mentioning CANONICAL_DECISIONS',
    isTypeError && mentionsVocab,
    threw ? `threw ${threw.name}: ${threw.message}` : 'did not throw — invariant broken'
  );
}

// ---------------------------------------------------------------------------
// F6-S4 NEGATIVE: invalid hardness still rejects (invariant preserved)
// ---------------------------------------------------------------------------
{
  let threw = null;
  try {
    appendGateDecision(tmpJsonl, {
      gate: 'anything',
      hardness: 'INFO', // not in canonical 5-class vocab
      phase: '2',
      decision: 'SKIPPED',
      decided_by: 'test',
      timestamp: '2026-05-21T00:00:03Z',
      detail: 'F6-S4 smoke test: invalid hardness must reject',
    }, ctx);
  } catch (e) {
    threw = e;
  }
  const isTypeError = threw && threw.name === 'TypeError';
  const mentionsVocab = threw && /CANONICAL_HARDNESS/.test(threw.message);
  record(
    'F6-S4: invalid hardness="INFO" throws TypeError mentioning CANONICAL_HARDNESS',
    isTypeError && mentionsVocab,
    threw ? `threw ${threw.name}: ${threw.message}` : 'did not throw — invariant broken'
  );
}

// ---------------------------------------------------------------------------
// F6-S5 INTROSPECTION: module exports the canonical sets for runtime inspection
// ---------------------------------------------------------------------------
{
  const expected8 = ['BLOCKED', 'DISPATCHED', 'SKIPPED', 'APPROVED', 'CONFIRMED', 'REJECTED', 'TRIGGERED', 'NOT_TRIGGERED'];
  const ok = expected8.every((v) => CANONICAL_DECISIONS.has(v)) && CANONICAL_DECISIONS.size === 8;
  record(
    'F6-S5a: CANONICAL_DECISIONS contains exactly the 8 canonical values',
    ok,
    `got: ${Array.from(CANONICAL_DECISIONS).join(', ')}`
  );
  const auditOk = CANONICAL_HARDNESS.has('AUDIT') && CANONICAL_HARDNESS.size === 5;
  record(
    'F6-S5b: CANONICAL_HARDNESS contains AUDIT (v6.2.0+) and totals 5 classes',
    auditOk,
    `got: ${Array.from(CANONICAL_HARDNESS).join(', ')}`
  );
}

// ---------------------------------------------------------------------------
// F6-S6 INTROSPECTION: auto-correlation fields present in written line
// ---------------------------------------------------------------------------
{
  let raw = '';
  try { raw = fs.readFileSync(tmpJsonl, 'utf8'); } catch (_) {}
  const lines = raw.split('\n').filter((l) => l.length > 0);
  // Find ANY successfully-written line (from S1 or S2) and check correlation
  let foundLine = null;
  for (const l of lines) {
    try {
      const obj = JSON.parse(l);
      if (obj.gate === 'ATDD_STEP_1B_BYPASS' || obj.gate === 'BOUNDED_CONTEXT_MISSING') {
        foundLine = obj;
        break;
      }
    } catch (_) { /* skip malformed */ }
  }
  if (!foundLine) {
    record('F6-S6: parsed at least one written line', false, 'no line with expected gate found');
  } else {
    const requiredCorr = ['run_id', 'plugin_version', 'schema_version', 'type', 'complexity'];
    const missing = requiredCorr.filter((k) => !(k in foundLine));
    record(
      `F6-S6: written line carries auto-correlation fields (${requiredCorr.join(', ')})`,
      missing.length === 0,
      `missing: ${missing.join(', ')}`
    );
    record(
      'F6-S6b: correlation envelope reflects ctx (type="Bug Fix", complexity="MEDIA")',
      foundLine.type === 'Bug Fix' && foundLine.complexity === 'MEDIA',
      `got type=${foundLine.type}, complexity=${foundLine.complexity}`
    );
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch (_) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
