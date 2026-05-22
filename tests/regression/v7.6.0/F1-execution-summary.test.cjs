#!/usr/bin/env node
// =============================================================================
// F1 — execution-summary 4-axis Portuguese rendering
// =============================================================================
// Spec: v7.6.0 user-score collection — final-validator Step 3.5
// Covers: summarize(pipelineDocPath) returns 4 axes filled from gate-decisions
// and sentinel-state; graceful neutral fallback when files missing; no throws.
// =============================================================================

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MODULE = path.join(ROOT, 'lib', 'execution-summary.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg || ''}`); }
}

function makeTempRun() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-v7.6-f1-'));
}

function rimraf(p) {
  try {
    if (!fs.existsSync(p)) return;
    for (const f of fs.readdirSync(p)) fs.unlinkSync(path.join(p, f));
    fs.rmdirSync(p);
  } catch (_e) { /* swallow */ }
}

function writeGates(dir, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'gate-decisions.jsonl'), lines, 'utf8');
}

function writeState(dir, state) {
  fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(state), 'utf8');
}

// -----------------------------------------------------------------------------
// Scenario 1: Module loads and exports summarize
// -----------------------------------------------------------------------------
let mod;
try {
  mod = require(MODULE);
  record('S1 module loads', typeof mod.summarize === 'function');
} catch (e) {
  record('S1 module loads', false, e.message);
  console.log(results.join('\n'));
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Scenario 2: Missing path → neutral fallback (no throw)
// -----------------------------------------------------------------------------
try {
  const result = mod.summarize('/nonexistent/path/that/cannot/exist');
  record('S2 missing path returns neutral object', result &&
    typeof result.plan === 'string' &&
    typeof result.execution === 'string' &&
    typeof result.review === 'string' &&
    typeof result.result === 'string');
} catch (e) {
  record('S2 missing path returns neutral object', false, e.message);
}

// -----------------------------------------------------------------------------
// Scenario 3: Empty pipelineDocPath → neutral
// -----------------------------------------------------------------------------
try {
  const result = mod.summarize('');
  record('S3 empty string returns neutral', result && result.plan.includes('Sem dados'));
} catch (e) {
  record('S3 empty string returns neutral', false, e.message);
}

// -----------------------------------------------------------------------------
// Scenario 4: Null input → neutral
// -----------------------------------------------------------------------------
try {
  const result = mod.summarize(null);
  record('S4 null input returns neutral', result && result.execution.includes('Sem dados'));
} catch (e) {
  record('S4 null input returns neutral', false, e.message);
}

// -----------------------------------------------------------------------------
// Scenario 5: Full happy path — gates + state present
// -----------------------------------------------------------------------------
const dir1 = makeTempRun();
try {
  writeGates(dir1, [
    { gate: 'INFORMATION_GATE', hardness: 'HARD', phase: '0-pre-dispatch', decision: 'APPROVED', timestamp: '2026-05-22T10:00:00Z' },
    { gate: 'CLARIFICATION_QUESTION', hardness: 'AUDIT', phase: '0-clarify', decision: 'TRIGGERED', timestamp: '2026-05-22T10:01:00Z' },
    { gate: 'QUALITY_GATE_APPROVED', hardness: 'MANDATORY', phase: '2-pre-impl', decision: 'APPROVED', timestamp: '2026-05-22T10:05:00Z' },
    { gate: 'CHECKPOINT_VALIDATOR', hardness: 'HARD', phase: '2-batch-1', decision: 'APPROVED', timestamp: '2026-05-22T10:10:00Z' },
    { gate: 'ADVERSARIAL_BLOCK', hardness: 'HARD', phase: '2-review-1', decision: 'BLOCKED', timestamp: '2026-05-22T10:12:00Z' },
    { gate: 'ADVERSARIAL_BLOCK', hardness: 'HARD', phase: '2-review-2', decision: 'APPROVED', timestamp: '2026-05-22T10:15:00Z' },
    { gate: 'SANITY_BUILD', hardness: 'MANDATORY', phase: '3-sanity', decision: 'APPROVED', timestamp: '2026-05-22T10:20:00Z' },
  ]);
  writeState(dir1, {
    classification: { type: 'Bug Fix', complexity: 'MEDIA' },
    final_decision: 'GO',
  });

  // Force fresh require so file system reads are not memoized across scenarios.
  delete require.cache[MODULE];
  const freshMod = require(MODULE);
  const result = freshMod.summarize(dir1);

  record('S5a plan mentions classification', result.plan.includes('correcao de bug') && result.plan.includes('media'));
  // QUAL-4: tighten — 'execucao' substring is also in the neutral fallback,
  // so the OR would mask a regression. Assert only on 'lote' which is unique
  // to the populated summary path.
  record('S5b execution mentions batch', result.execution.includes('lote'));
  // QUAL-4: same reasoning — '2 vez' is the unique signal of correct counting.
  record('S5c review mentions adversarial count', result.review.includes('2 vez'));
  record('S5d result mentions verdict', result.result.includes('aprovado'));
  record('S5e all 4 axes are non-empty strings',
    result.plan.length > 10 && result.execution.length > 10 &&
    result.review.length > 10 && result.result.length > 10);
} finally {
  rimraf(dir1);
}

// -----------------------------------------------------------------------------
// Scenario 6: Audit-style run (no execution, no adversarial)
// -----------------------------------------------------------------------------
const dir2 = makeTempRun();
try {
  writeGates(dir2, [
    { gate: 'INFORMATION_GATE', hardness: 'HARD', phase: '0-pre-dispatch', decision: 'APPROVED', timestamp: '2026-05-22T10:00:00Z' },
  ]);
  writeState(dir2, {
    classification: { type: 'Audit', complexity: 'MEDIA' },
    final_decision: 'CONDITIONAL',
  });

  delete require.cache[MODULE];
  const freshMod = require(MODULE);
  const result = freshMod.summarize(dir2);

  record('S6a audit plan mentions auditoria', result.plan.includes('auditoria'));
  record('S6b audit execution acknowledges no code', result.execution.includes('Nenhum lote') || result.execution.includes('sem codigo'));
  record('S6c audit review acknowledges no review', result.review.includes('Nao houve') || result.review.includes('somente relatorio'));
  record('S6d audit result captures CONDITIONAL', result.result.includes('condicional'));
} finally {
  rimraf(dir2);
}

// -----------------------------------------------------------------------------
// Scenario 7: Malformed JSONL line → not counted, no throw
// -----------------------------------------------------------------------------
const dir3 = makeTempRun();
try {
  // Mix valid + invalid lines — invalid must be silently skipped.
  fs.writeFileSync(
    path.join(dir3, 'gate-decisions.jsonl'),
    [
      JSON.stringify({ gate: 'QUALITY_GATE_APPROVED', hardness: 'MANDATORY', phase: '2', decision: 'APPROVED' }),
      'this is not json',
      JSON.stringify({ gate: 'CHECKPOINT_VALIDATOR', hardness: 'HARD', phase: '2', decision: 'APPROVED' }),
      '{ broken: json,',
    ].join('\n') + '\n',
    'utf8'
  );

  delete require.cache[MODULE];
  const freshMod = require(MODULE);
  const result = freshMod.summarize(dir3);
  record('S7 malformed lines do not throw', typeof result.plan === 'string');
} finally {
  rimraf(dir3);
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------
console.log('');
console.log(`F1 — execution-summary (v7.6.0)`);
console.log(results.join('\n'));
console.log('');
console.log(`Total: ${pass + fail}, Pass: ${pass}, Fail: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
