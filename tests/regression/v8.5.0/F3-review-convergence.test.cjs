#!/usr/bin/env node
'use strict';

/**
 * F3 (v8.5.0) — B3: spec_review_converged check in sealSpecRun() +
 *                    implementation_contract stamp in the sentinel.
 *
 * RED phase (TDD). These tests MUST FAIL today because:
 *   - sealSpecRun() has NO 4th check for spec_review_converged — it seals even
 *     when the review loop never converged.
 *   - The implementation_contract object is never written to the sentinel by
 *     any code path that exists today (spec-controller Step 8 has no such
 *     instruction yet), so a behavioral assertion of "convergence stamp also
 *     wrote a contract" has nothing producing it.
 *
 * Scenarios covered (5): B3-S1 .. B3-S5.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));
const { RunManifest } = require(path.join(ROOT, 'lib', 'run-manifest.cjs'));
const { writeSignedState, readVerifiedState } =
  require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

const _tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  _tmpDirs.push(d);
  return d;
}
function cleanup() {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* best-effort */ }
  }
}

// All B1 preconditions satisfied: a VALID manifest with spec_review_done + the
// 5 required artifacts. Built via RunManifest so the seal's round-trip passes
// and execution reaches the B3 convergence check.
function seedReadyRun(runDir) {
  const man = RunManifest.fromObject({
    schema_version: 1,
    run_id: 'f3-run',
    created_at: '2026-06-18T00:00:00Z',
    updated_at: '2026-06-18T00:00:00Z',
    status: 'executing',
    phase: 2,
    step_completed: 8,
    type: 'Spec',
    complexity: 'COMPLEXA',
    brainstorm_completed: true,
    spec_lifecycle_completed: false,
    handoff_decision: 'stop',
    linked_pipeline_doc_path: null,
    notes: { options: { spec_review_done: true } },
  });
  fs.writeFileSync(path.join(runDir, 'manifest.yaml'), man.toYaml());
  const specDir = path.join(runDir, '01-spec');
  fs.mkdirSync(specDir, { recursive: true });
  for (const f of ['requirements.md', 'design.md', 'tasks.md', 'research.md']) {
    fs.writeFileSync(path.join(specDir, f), `# ${f}\n`);
  }
  fs.writeFileSync(path.join(specDir, 'spec.json'), '{"feature":"f3"}');
}

console.log('=== F3 v8.5.0 — spec_review_converged + implementation_contract (RED) ===');

// ---- B3-S1 (main) — converged absent → ok:false ----------------------------
test('B3-S1: sealSpecRun() blocks when spec_review_converged is absent', () => {
  const runDir = mkTmp('f3-s1-');
  seedReadyRun(runDir);
  writeSignedState(path.join(runDir, 'sentinel-state.json'), { run_id: 'f3-s1' }); // no converged
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, false, 'must block when spec_review_converged is absent');
  assert.match(String(res.error || ''), /spec_review_converged not set/i);
});

// ---- B3-S2 (main) — converged === false → ok:false -------------------------
test('B3-S2: sealSpecRun() blocks when spec_review_converged is explicitly false', () => {
  const runDir = mkTmp('f3-s2-');
  seedReadyRun(runDir);
  writeSignedState(path.join(runDir, 'sentinel-state.json'),
    { run_id: 'f3-s2', spec_review_converged: false });
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, false, 'must block when spec_review_converged is false');
  assert.match(String(res.error || ''), /spec_review_converged not set/i);
});

// ---- B3-S3 (main, happy path) — converged true → ok:true -------------------
test('B3-S3: sealSpecRun() seals when spec_review_converged is true and all 4 checks pass', () => {
  const runDir = mkTmp('f3-s3-');
  seedReadyRun(runDir);
  writeSignedState(path.join(runDir, 'sentinel-state.json'),
    { run_id: 'f3-s3', spec_review_converged: true });
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, true, `happy path must seal; got ${JSON.stringify(res)}`);
});

// ---- B3-S4 (regression) — the SEAL deterministically PRODUCES the contract ---
// CORRECTED (v8.5.0, B4): the prior version pre-wrote the sentinel itself and
// then "asserted" the contract it had just written — testing nothing about
// production. This version exercises the REAL mechanism: a converged
// spec-authoring run is sealed via sealSpecRun(), and the re-signed sentinel
// must now carry an implementation_contract that the SEAL produced (not the
// fixture), under a VALID signature.
test('B3-S4: sealSpecRun() deterministically produces a signed implementation_contract on a converged spec-authoring run', () => {
  const runDir = mkTmp('f3-s4-');
  seedReadyRun(runDir);
  // Converged spec run: signed sentinel with spec_review_converged:true (the
  // fixture does NOT write any implementation_contract — the seal must).
  writeSignedState(path.join(runDir, 'sentinel-state.json'),
    { run_id: 'f3-s4', spec_review_converged: true });

  const res = sealSpecRun(runDir, { variant: 'spec-authoring' });
  assert.equal(res.ok, true, `converged spec-authoring run must seal; got ${JSON.stringify(res)}`);

  // Read back the RE-SIGNED sentinel and require a VALID signature — the
  // contract must live inside the signed body, not be a loose append.
  const { state, verification } =
    readVerifiedState(path.join(runDir, 'sentinel-state.json'));
  assert.equal(verification && verification.valid, true,
    're-signed sentinel must verify (contract is part of the signed body)');

  const ic = state.implementation_contract;
  assert.ok(ic && typeof ic === 'object', 'sealSpecRun must produce implementation_contract');
  assert.equal(ic.sealed, true, 'implementation_contract.sealed must be true');
  assert.equal(ic.ready_for_implementation, true,
    'implementation_contract.ready_for_implementation must be true');
  assert.equal(ic.spec_dir, '01-spec', "implementation_contract.spec_dir must be '01-spec'");
  assert.ok(Array.isArray(ic.required_impl_gates), 'required_impl_gates must be an array');
  for (const g of ['TDD_APPROVAL', 'ADVERSARIAL_BLOCK', 'ADVERSARIAL_LOOP_CHECKPOINT']) {
    assert.ok(ic.required_impl_gates.includes(g), `required_impl_gates must include ${g}`);
  }
});

// ---- B3-S5 (edge) — convergence check fails open on unreadable sentinel -----
test('B3-S5: sealSpecRun() fails open on the convergence check when sentinel is unreadable', () => {
  const runDir = mkTmp('f3-s5-');
  seedReadyRun(runDir); // all artifacts + spec_review_done present
  // No sentinel-state.json at all — convergence check cannot read it. The B1
  // checks pass, so the seal must succeed (convergence check fails OPEN, does
  // not block on an unreadable sentinel).
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, true,
    `unreadable sentinel must not block the seal; got ${JSON.stringify(res)}`);
});

cleanup();
console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
