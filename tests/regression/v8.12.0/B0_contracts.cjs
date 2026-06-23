#!/usr/bin/env node
'use strict';

// =============================================================================
// B0 (v8.12.0) — T0.2 — INTERNAL CONTRACTS (RED, TDD).
// Spec 006-enforcement-fail-closed-arming. Satisfies: R4 + R8 data/contract.
// Evidence: design §3 (Data / contract design).
//
// Pins the on-the-wire shape of the new corrective-dispatch contracts BEFORE any
// production code exists, so Batch 4/5 must conform to them:
//
//   CorrectivePayload { invariant_id, what_failed, what_is_missing,
//       fix_instruction, resume_instruction, agent_ref, run_id, observer,
//       blocking } — blocking===true for R4 (gate trip), false for R8 (in-exec).
//   ErrorSignal { run_id, observer, invariant_id, agent_ref, detail,
//       detected_at, dedup_key }.
//   sanitize() — strips CR/LF + control chars + caps length (reuse the
//       sanitizeWorkflow semantics already proven in pipeline-arm-gate.cjs).
//   BLOCKING_R4 / NONBLOCKING_R8 — the canonical blocking-flag constants.
//
// These assert lib/corrective-dispatch.cjs exports (buildCorrectivePayload,
// buildErrorSignal, sanitize, BLOCKING_R4, NONBLOCKING_R8). The module does NOT
// exist yet → RED. EXPECTED RED REASON: the optional require() yields an empty
// stub, so each assertion fails on the MISSING export — not a harness/syntax
// error. When Batch 4/5 create the module, these go GREEN unchanged.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b0-contracts-stable-secret-0123456789abcdef-pad';

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');

// Optional require so the module's absence is a clean RED (missing export),
// never an uncaught crash that masquerades as a harness error.
let cd = null;
try { cd = require(path.join(ROOT, 'lib/corrective-dispatch.cjs')); } catch { cd = {}; }

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== B0 v8.12.0 — corrective-dispatch contracts (CorrectivePayload, ErrorSignal, sanitize) ===');

// ---- module presence --------------------------------------------------------
check('lib/corrective-dispatch.cjs exists and exports the contract builders', () => {
  assert.equal(typeof cd.buildCorrectivePayload, 'function', 'must export buildCorrectivePayload()');
  assert.equal(typeof cd.buildErrorSignal, 'function', 'must export buildErrorSignal()');
  assert.equal(typeof cd.sanitize, 'function', 'must export sanitize()');
});

// ---- BLOCKING_R4 / NONBLOCKING_R8 constants ---------------------------------
check('BLOCKING_R4 / NONBLOCKING_R8 constants are the canonical blocking flags', () => {
  assert.equal(cd.BLOCKING_R4, true, 'BLOCKING_R4 must be the boolean true (R4 gate-trip keeps the hard block)');
  assert.equal(cd.NONBLOCKING_R8, false, 'NONBLOCKING_R8 must be the boolean false (R8 in-execution fire-and-continue)');
});

// ---- CorrectivePayload shape ------------------------------------------------
const CP_FIELDS = ['invariant_id', 'what_failed', 'what_is_missing', 'fix_instruction',
  'resume_instruction', 'agent_ref', 'run_id', 'observer', 'blocking'];

check('CorrectivePayload has EXACTLY the 9 contract fields', () => {
  assert.equal(typeof cd.buildCorrectivePayload, 'function', 'buildCorrectivePayload() missing — RED');
  const p = cd.buildCorrectivePayload({
    invariant_id: 'NOT_ARMED', what_failed: 'no run armed', what_is_missing: 'a signed run-active state',
    fix_instruction: 'dispatch a pipeline-orchestrator: agent', resume_instruction: 'resume after arming',
    agent_ref: 'controller', run_id: 'r1', observer: 'arm-gate', blocking: cd.BLOCKING_R4,
  });
  for (const f of CP_FIELDS) assert.ok(f in p, `CorrectivePayload missing field: ${f}`);
  const extra = Object.keys(p).filter((k) => !CP_FIELDS.includes(k));
  assert.equal(extra.length, 0, `CorrectivePayload has unexpected extra fields: ${extra.join(', ')}`);
});

check('CorrectivePayload.blocking === true for an R4 gate trip', () => {
  assert.equal(typeof cd.buildCorrectivePayload, 'function', 'buildCorrectivePayload() missing — RED');
  const p = cd.buildCorrectivePayload({
    invariant_id: 'CORRUPT_STATE', what_failed: 'state unreadable', what_is_missing: 're-create signed state',
    fix_instruction: 'recreate via signer', resume_instruction: 'resume', agent_ref: 'controller',
    run_id: 'r1', observer: 'arm-gate', blocking: cd.BLOCKING_R4,
  });
  assert.equal(p.blocking, true, 'R4 (gate trip) → blocking:true (the LAYER-A hard block stays in force)');
});

check('CorrectivePayload.blocking === false for an R8 in-execution corrective', () => {
  assert.equal(typeof cd.buildCorrectivePayload, 'function', 'buildCorrectivePayload() missing — RED');
  const p = cd.buildCorrectivePayload({
    invariant_id: 'AC_DEVIATION', what_failed: 'slice drift', what_is_missing: 'fix the slice',
    fix_instruction: 'align to AC', resume_instruction: 'resume', agent_ref: 'feature-implementer',
    run_id: 'r1', observer: 'spec-reviewer', blocking: cd.NONBLOCKING_R8,
  });
  assert.equal(p.blocking, false, 'R8 (in-execution) → blocking:false (fire-and-continue)');
});

// ---- ErrorSignal shape ------------------------------------------------------
const ES_FIELDS = ['run_id', 'observer', 'invariant_id', 'agent_ref', 'detail', 'detected_at', 'dedup_key'];

check('ErrorSignal has EXACTLY the 7 contract fields (incl. a derived dedup_key)', () => {
  assert.equal(typeof cd.buildErrorSignal, 'function', 'buildErrorSignal() missing — RED');
  const s = cd.buildErrorSignal({
    run_id: 'r1', observer: 'sentinel', invariant_id: 'AC_DEVIATION', agent_ref: 'feature-implementer',
    detail: 'slice 2 contract drift', detected_at: '2026-06-22T00:00:00.000Z',
  });
  for (const f of ES_FIELDS) assert.ok(f in s, `ErrorSignal missing field: ${f}`);
  const extra = Object.keys(s).filter((k) => !ES_FIELDS.includes(k));
  assert.equal(extra.length, 0, `ErrorSignal has unexpected extra fields: ${extra.join(', ')}`);
});

check('ErrorSignal.dedup_key is derived (not blindly trusted from caller input)', () => {
  assert.equal(typeof cd.buildErrorSignal, 'function', 'buildErrorSignal() missing — RED');
  const base = {
    run_id: 'r1', observer: 'sentinel', invariant_id: 'AC_DEVIATION', agent_ref: 'feature-implementer',
    detail: 'drift', detected_at: '2026-06-22T00:00:00.000Z',
  };
  const a = cd.buildErrorSignal(base);
  const b = cd.buildErrorSignal({ ...base, observer: 'a-different-observer' });
  assert.equal(typeof a.dedup_key, 'string', 'dedup_key must be a string');
  assert.ok(a.dedup_key.length > 0, 'dedup_key must be non-empty');
  assert.equal(a.dedup_key, b.dedup_key, 'dedup_key must NOT vary with the observer (N observers → 1 key)');
});

// ---- sanitize() semantics (mirror sanitizeWorkflow) -------------------------
check('sanitize() strips CR/LF and control chars (no injection into a corrective)', () => {
  assert.equal(typeof cd.sanitize, 'function', 'sanitize() missing — RED');
  const dirty = 'fix the\r\nslice\tnow\x00\x07 please';
  const clean = cd.sanitize(dirty);
  assert.ok(!/[\r\n\t]/.test(clean), 'CR/LF/TAB must be stripped/replaced');
  assert.ok(!/[\x00-\x1F\x7F]/.test(clean), 'control characters must be removed');
});

check('sanitize() caps length (no unbounded payload field)', () => {
  assert.equal(typeof cd.sanitize, 'function', 'sanitize() missing — RED');
  const huge = 'a'.repeat(5000);
  const clean = cd.sanitize(huge);
  assert.ok(clean.length <= 500, `sanitize() must cap length, got ${clean.length}`);
});

check('sanitize() on a non-string yields an empty string (defensive)', () => {
  assert.equal(typeof cd.sanitize, 'function', 'sanitize() missing — RED');
  assert.equal(cd.sanitize(undefined), '', 'undefined → empty string');
  assert.equal(cd.sanitize(null), '', 'null → empty string');
  assert.equal(cd.sanitize({ a: 1 }), '', 'object → empty string');
});

check('CorrectivePayload string fields are sanitized (injection-safe by construction)', () => {
  assert.equal(typeof cd.buildCorrectivePayload, 'function', 'buildCorrectivePayload() missing — RED');
  const p = cd.buildCorrectivePayload({
    invariant_id: 'NOT_ARMED', what_failed: 'line1\r\nline2', what_is_missing: 'tab\there',
    fix_instruction: 'do\nthe\nfix', resume_instruction: 'resume\rnow', agent_ref: 'controller',
    run_id: 'r1', observer: 'arm-gate', blocking: cd.BLOCKING_R4,
  });
  for (const f of ['what_failed', 'what_is_missing', 'fix_instruction', 'resume_instruction']) {
    assert.ok(!/[\r\n\t]/.test(String(p[f])), `CorrectivePayload.${f} must be sanitized (no CR/LF/TAB)`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
