#!/usr/bin/env node
'use strict';

/**
 * F1 (v8.5.0) — B1: Seal pre-conditions in sealSpecRun() + spec-seal-guard.cjs
 *
 * RED phase (TDD). These tests MUST FAIL today because:
 *   - sealSpecRun() has NO checks for spec_review_done / required artifacts /
 *     research.md — it seals an incomplete run silently.
 *   - .claude/hooks/spec-seal-guard.cjs does NOT exist yet (and is not registered).
 *
 * Scenarios covered (8): B1-S1 .. B1-S8.
 *
 * Convention mirrors tests/regression/v7.1.0/F7_version_sync.cjs:
 *   plain test()/assert with pass/fail counts + process.exit(fail>0?1:0).
 * Fixtures live under os.tmpdir() (never pipeline-runs/) and are cleaned up.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));
const { RunManifest } = require(path.join(ROOT, 'lib', 'run-manifest.cjs'));
const { writeSignedState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

const SEAL_GUARD = path.join(ROOT, '.claude', 'hooks', 'spec-seal-guard.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

// ---- temp-dir helpers -------------------------------------------------------
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

// Write a valid manifest.yaml via the canonical RunManifest (so the seal's own
// fromYaml/fromObject round-trip passes and execution REACHES the new
// precondition checks). `specReviewDone` controls notes.options.spec_review_done;
// when undefined the field is absent (options present without it).
function writeManifest(runDir, { specReviewDone } = {}) {
  const options = {};
  if (specReviewDone === true) options.spec_review_done = true;
  else if (specReviewDone === false) options.spec_review_done = false;
  else options.placeholder = true; // options present, spec_review_done absent
  const man = RunManifest.fromObject({
    schema_version: 1,
    run_id: 'f1-test-run',
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
    notes: { options },
  });
  fs.writeFileSync(path.join(runDir, 'manifest.yaml'), man.toYaml());
}

// Create the 01-spec artifacts. `skip` is a Set of basenames to NOT create.
function writeSpecArtifacts(runDir, { skip = new Set() } = {}) {
  const specDir = path.join(runDir, '01-spec');
  fs.mkdirSync(specDir, { recursive: true });
  const files = ['requirements.md', 'design.md', 'tasks.md', 'spec.json', 'research.md'];
  for (const f of files) {
    if (skip.has(f)) continue;
    const body = f === 'spec.json' ? '{"feature":"f1"}' : `# ${f}\nbody\n`;
    fs.writeFileSync(path.join(specDir, f), body);
  }
}

function runSealGuard(inputObj) {
  // The hook reads PreToolUse JSON on stdin and writes a decision (if any) to
  // stdout; it must always exit 0. We return { code, stdout }.
  try {
    const stdout = execFileSync(process.execPath, [SEAL_GUARD], {
      input: JSON.stringify(inputObj),
      encoding: 'utf8',
      timeout: 15000,
    });
    return { code: 0, stdout: stdout || '' };
  } catch (e) {
    // Non-zero exit OR missing file both land here.
    return { code: e.status == null ? 1 : e.status, stdout: (e.stdout || '').toString(), error: e };
  }
}

console.log('=== F1 v8.5.0 — sealSpecRun preconditions + spec-seal-guard (RED) ===');

// ---- B1-S1 (main) — spec_review_done missing → ok:false --------------------
test('B1-S1: sealSpecRun() returns ok:false when spec_review_done is absent', () => {
  const runDir = mkTmp('f1-s1-');
  writeManifest(runDir, { specReviewDone: undefined });
  writeSpecArtifacts(runDir); // all 5 present, but review_done absent
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, false, 'must block when spec_review_done is absent');
  assert.match(String(res.error || ''), /spec_review_done not set/i);
});

// ---- B1-S2 (main) — missing required artifact → ok:false naming it ---------
test('B1-S2: sealSpecRun() returns ok:false listing requirements.md when it is missing', () => {
  const runDir = mkTmp('f1-s2-');
  writeManifest(runDir, { specReviewDone: true });
  writeSpecArtifacts(runDir, { skip: new Set(['requirements.md']) });
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, false, 'must block when a required artifact is missing');
  assert.match(String(res.error || ''), /requirements\.md/i);
});

// ---- B1-S3 (main) — research.md absent → ok:false --------------------------
test('B1-S3: sealSpecRun() returns ok:false with research.md missing error', () => {
  const runDir = mkTmp('f1-s3-');
  writeManifest(runDir, { specReviewDone: true });
  writeSpecArtifacts(runDir, { skip: new Set(['research.md']) }); // 4 core present
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, false, 'must block when research.md is missing');
  assert.match(String(res.error || ''), /research\.md missing/i);
});

// ---- B1-S4 (main, happy path) — all preconditions met → ok:true ------------
test('B1-S4: sealSpecRun() returns ok:true when all 5 artifacts exist + spec_review_done true', () => {
  const runDir = mkTmp('f1-s4-');
  writeManifest(runDir, { specReviewDone: true });
  writeSpecArtifacts(runDir);
  // B3's 4th check (spec_review_converged) also gates the seal; satisfy it so
  // this happy-path scenario isolates the B1 preconditions.
  writeSignedState(path.join(runDir, 'sentinel-state.json'), {
    run_id: 'f1-s4-run', spec_review_converged: true,
  });
  const res = sealSpecRun(runDir);
  assert.equal(res.ok, true, `happy path must seal; got ${JSON.stringify(res)}`);
});

// ---- B1-S5 (regression) — guard denies when sentinel lacks spec_review_done -
test('B1-S5: spec-seal-guard denies a run-seal Bash call + emits SPEC_AUTHORING_INCOMPLETE', () => {
  assert.ok(fs.existsSync(SEAL_GUARD), 'spec-seal-guard.cjs must exist');
  const runDir = mkTmp('f1-s5-');
  writeManifest(runDir, { specReviewDone: undefined });
  // Readable, HMAC-valid sentinel WITHOUT spec_review_done in its manifest options.
  writeSignedState(path.join(runDir, 'sentinel-state.json'), { run_id: 'f1-s5-run' });
  const { stdout } = runSealGuard({
    tool_name: 'Bash',
    tool_input: { command: `node lib/run-seal.cjs ${runDir}` },
  });
  assert.match(stdout, /"permissionDecision"\s*:\s*"deny"/, 'must emit a deny decision');
  // The AUDIT event lands in protocol-events.jsonl inside the run dir.
  const eventsPath = path.join(runDir, 'protocol-events.jsonl');
  const events = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8') : '';
  assert.match(events + stdout, /SPEC_AUTHORING_INCOMPLETE/, 'must record SPEC_AUTHORING_INCOMPLETE');
});

// ---- B1-S6 (regression) — guard fails open when sentinel unreadable --------
test('B1-S6: spec-seal-guard fails open (exit 0, no deny) when sentinel is unreadable', () => {
  assert.ok(fs.existsSync(SEAL_GUARD), 'spec-seal-guard.cjs must exist');
  const runDir = mkTmp('f1-s6-'); // no sentinel-state.json written
  const { code, stdout } = runSealGuard({
    tool_name: 'Bash',
    tool_input: { command: `node lib/run-seal.cjs ${runDir}` },
  });
  assert.equal(code, 0, 'hook must exit 0 (fail-open)');
  assert.doesNotMatch(stdout, /"permissionDecision"\s*:\s*"deny"/, 'no deny when sentinel unreadable');
});

// ---- B1-S7 (edge) — legacy run with no manifest passes silently ------------
test('B1-S7: sealSpecRun() does not raise spec_review_done error for a run with no manifest', () => {
  const runDir = mkTmp('f1-s7-'); // no manifest.yaml at all (legacy run)
  const res = sealSpecRun(runDir);
  // The new precondition must be fail-open when the manifest is absent: it must
  // NOT return a spec_review_done error (it falls through to existing behavior).
  assert.doesNotMatch(String(res.error || ''), /spec_review_done/i,
    `legacy run must not be blocked on spec_review_done; got ${JSON.stringify(res)}`);
});

// ---- B1-S8 (edge) — guard fails open when runDir not extractable -----------
test('B1-S8: spec-seal-guard fails open when runDir cannot be parsed from the command', () => {
  assert.ok(fs.existsSync(SEAL_GUARD), 'spec-seal-guard.cjs must exist');
  const { code, stdout } = runSealGuard({
    tool_name: 'Bash',
    // run-seal.cjs is referenced but no extractable positional arg (piped/aliased).
    tool_input: { command: 'cat foo | node lib/run-seal.cjs' },
  });
  assert.equal(code, 0, 'hook must exit 0 on parse failure (fail-open)');
  assert.doesNotMatch(stdout, /"permissionDecision"\s*:\s*"deny"/, 'no deny on parse failure');
});

cleanup();
console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
