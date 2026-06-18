#!/usr/bin/env node
'use strict';

// F6 (v8.4.0) — spec-authoring runs leave a measurable telemetry trail.
//
// Root cause being closed: telemetry discovers runs via
//   .pipeline/active-run.json -> sentinel-state.json (pointer fast-path), or by
//   scanning .pipeline/docs/ (fallback). Spec authoring runs live under
//   pipeline-runs/<run_id>/ and write NEITHER, so they are invisible to the
//   run-log + Langfuse + fidelity-reporter pipeline.
//
// The fix is ADDITIVE:
//   W1 — run-directory.allocate() writes the pointer + an active sentinel-state
//        (fail-safe).
//   W2 — stop-hook + langfuse-hook honor a pointer that targets a pipeline-runs/
//        run EVEN when pipeline_active===false (a sealed spec run logs once); the
//        .pipeline/docs/ scan semantics stay byte-identical.
//   W3 — lib/run-seal.cjs seals a spec run (manifest + sentinel + gate-decisions).
//   W4 — fidelity-reporter mandatorySetFor is flow-aware via the threaded variant
//        (authoring yardstick vs processing regression).
//   W5 — this file.
//
// Mirrors the framework of tests/regression/v8.0.0/F1_spec_authoring_surfaces.cjs.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

const { RunDirectory } = require(path.join(ROOT, 'lib', 'run-directory.cjs'));
const { RunManifest } = require(path.join(ROOT, 'lib', 'run-manifest.cjs'));
const { verifyState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));
const stopHook = require(path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs'));
const fidelity = require(path.join(ROOT, 'lib', 'fidelity-reporter.cjs'));

// Temp-dir helpers ----------------------------------------------------------
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

// Allocate a spec run under <project>/pipeline-runs/, returning paths.
function allocateSpecRun(projectRoot, prompt) {
  const rootDir = path.join(projectRoot, 'pipeline-runs');
  const savedRunId = process.env.PIPELINE_RUN_ID;
  const rd = RunDirectory.allocate(rootDir, prompt || 'author a spec for billing');
  // Restore caller env so one test's allocate doesn't leak PIPELINE_RUN_ID into
  // the next.
  if (savedRunId === undefined) delete process.env.PIPELINE_RUN_ID;
  else process.env.PIPELINE_RUN_ID = savedRunId;
  return { rootDir, runDir: rd.absPath, runId: rd.runId };
}

console.log('=== F6 v8.4.0 spec telemetry bridge ===');

// --- S1: allocate writes pointer + active sentinel ---------------------------
test('S1: allocate() writes .pipeline/active-run.json pointer + an active signed sentinel-state', () => {
  const project = mkTmp('f6-s1-');
  const { runDir, runId } = allocateSpecRun(project, 'spec authoring run one');

  const ptrPath = path.join(project, '.pipeline', 'active-run.json');
  assert.ok(fs.existsSync(ptrPath), 'pointer file written');
  const ptr = JSON.parse(fs.readFileSync(ptrPath, 'utf8'));
  assert.equal(ptr.pipeline_doc_path, runDir, 'pointer.pipeline_doc_path == run absPath');
  assert.equal(ptr.run_id, runId, 'pointer.run_id matches');
  assert.ok(typeof ptr.updated_at === 'string' && ptr.updated_at.length > 0, 'pointer carries updated_at');

  const sf = path.join(runDir, 'sentinel-state.json');
  assert.ok(fs.existsSync(sf), 'sentinel-state.json written inside the run dir');
  const st = JSON.parse(fs.readFileSync(sf, 'utf8'));
  assert.equal(st.run_id, runId, 'sentinel run_id matches');
  assert.equal(st.pipeline_doc_path, runDir, 'sentinel pipeline_doc_path == absPath');
  assert.equal(st.pipeline_active, true, 'sentinel starts active');
  assert.ok(Array.isArray(st.pending_blocks), 'pending_blocks is an array');
  assert.equal(st.schema_version, 1, 'schema_version stamped');
  // Signed via the canonical signer.
  const v = verifyState(st);
  assert.equal(v.valid, true, `sentinel signature valid (${v.reason})`);
});

// --- S2: stop-hook discovery returns a SEALED pipeline-runs/ run via pointer --
test('S2: findActiveRunFolder returns a sealed pipeline-runs/ run via pointer (pipeline_active===false)', () => {
  const project = mkTmp('f6-s2-');
  const { runDir, runId } = allocateSpecRun(project, 'spec run to be sealed');

  // Seal it: pointer stays, but sentinel flips to inactive (what a finished spec
  // run looks like). The discovery MUST still return it because the pointer
  // targets a pipeline-runs/ path (outside .pipeline/docs).
  const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));
  const res = sealSpecRun(runDir, { variant: 'spec-author', grade: 'A' });
  assert.ok(res && res.ok === true, `sealSpecRun ok (${res && res.error})`);

  // Refresh the pointer's updated_at so the freshness window is satisfied
  // (allocate wrote it moments ago, so it is already fresh — but be explicit).
  const ptrPath = path.join(project, '.pipeline', 'active-run.json');
  const ptr = JSON.parse(fs.readFileSync(ptrPath, 'utf8'));
  ptr.updated_at = new Date().toISOString();
  fs.writeFileSync(ptrPath, JSON.stringify(ptr));

  const savedRunId = process.env.PIPELINE_RUN_ID;
  delete process.env.PIPELINE_RUN_ID; // exercise the no-env path
  let found;
  try { found = stopHook.findActiveRunFolder(project); }
  finally { if (savedRunId !== undefined) process.env.PIPELINE_RUN_ID = savedRunId; }
  assert.equal(path.resolve(found || ''), path.resolve(runDir),
    'sealed pipeline-runs run discovered via pointer despite pipeline_active=false');
});

test('S2b: .pipeline/docs scan semantics unaffected — the legacy mtime scan returns its newest candidate regardless of pipeline_active', () => {
  // FIX-I (v8.4.0): the prior name/comment said the inactive docs run is NOT
  // returned / discovery returns null — but the assertion (correctly) verifies
  // the OPPOSITE: the legacy docs mtime scan never filtered on pipeline_active,
  // so an inactive run living INSIDE .pipeline/docs with no pointer present IS
  // still returned. The assertion is the correct contract (byte-identical legacy
  // behavior); only the misleading name/comment are fixed here.
  const project = mkTmp('f6-s2b-');
  const docRun = path.join(project, '.pipeline', 'docs', 'Pre-feature-action', 'some-slug');
  fs.mkdirSync(docRun, { recursive: true });
  fs.writeFileSync(path.join(docRun, 'sentinel-state.json'),
    JSON.stringify({ run_id: 'docs-run', pipeline_active: false }));

  const savedRunId = process.env.PIPELINE_RUN_ID;
  delete process.env.PIPELINE_RUN_ID;
  let found;
  try { found = stopHook.findActiveRunFolder(project); }
  finally { if (savedRunId !== undefined) process.env.PIPELINE_RUN_ID = savedRunId; }
  // mtime fallback returns the newest candidate REGARDLESS of active flag (that
  // is the existing docs-scan contract — it never filtered on pipeline_active).
  assert.equal(path.resolve(found || ''), path.resolve(docRun),
    'docs scan still returns its candidate exactly as before (semantics byte-identical)');
});

// --- S3: sealSpecRun updates manifest + sentinel + gate-decisions -------------
test('S3: sealSpecRun seals manifest (status/phase/spec_lifecycle/notes), sentinel, and appends SPEC_SEALED', () => {
  const project = mkTmp('f6-s3-');
  const { runDir, runId } = allocateSpecRun(project, 'spec run for seal');

  const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));
  const res = sealSpecRun(runDir, { variant: 'spec-authoring', grade: 'B' });
  assert.ok(res && res.ok === true, `sealSpecRun ok (${res && res.error})`);

  // manifest.yaml
  const manText = fs.readFileSync(path.join(runDir, 'manifest.yaml'), 'utf8');
  const man = RunManifest.fromYaml(manText); // must still validate
  const m = man.toObject();
  assert.equal(m.status, 'sealed', 'status sealed');
  assert.equal(m.phase, 3, 'phase 3');
  assert.equal(m.step_completed, 9, 'step_completed 9');
  assert.equal(m.spec_lifecycle_completed, true, 'spec_lifecycle_completed true');
  assert.equal(m.type, 'Spec', 'type Spec');
  // notes is an object with options.spec_sealed + options.controller_type
  const notes = typeof m.notes === 'string' ? JSON.parse(m.notes) : m.notes;
  assert.ok(notes && notes.options, 'notes.options present');
  assert.equal(notes.options.spec_sealed, true, 'notes.options.spec_sealed true');
  assert.equal(notes.options.controller_type, 'spec', 'notes.options.controller_type spec');

  // sentinel-state.json
  const st = JSON.parse(fs.readFileSync(path.join(runDir, 'sentinel-state.json'), 'utf8'));
  assert.equal(st.pipeline_active, false, 'sentinel pipeline_active false');
  assert.equal(st.type, 'Spec', 'sentinel type Spec');
  assert.equal(st.pipeline_variant, 'spec-authoring', 'sentinel variant');
  assert.equal(st.final_decision, 'SEALED', 'sentinel final_decision SEALED');
  assert.equal(st.run_id, runId, 'sentinel run_id preserved');
  assert.equal(verifyState(st).valid, true, 're-signed sentinel still valid');

  // gate-decisions.jsonl
  const gd = fs.readFileSync(path.join(runDir, 'gate-decisions.jsonl'), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim());
  const last = JSON.parse(gd[gd.length - 1]);
  assert.equal(last.gate, 'SPEC_SEALED', 'SPEC_SEALED gate appended');
  assert.equal(last.decision, 'CONFIRMED', 'decision CONFIRMED');
  assert.equal(last.hardness, 'AUDIT', 'hardness AUDIT');
  assert.equal(last.decided_by, 'spec-controller', 'decided_by spec-controller');
});

test('S3b: sealSpecRun is idempotent — second seal does not duplicate the SPEC_SEALED line', () => {
  const project = mkTmp('f6-s3b-');
  const { runDir } = allocateSpecRun(project, 'spec run idempotent seal');
  const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));

  assert.ok(sealSpecRun(runDir, { variant: 'spec-author' }).ok, 'first seal ok');
  assert.ok(sealSpecRun(runDir, { variant: 'spec-author' }).ok, 'second seal ok');

  const lines = fs.readFileSync(path.join(runDir, 'gate-decisions.jsonl'), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim());
  const sealed = lines.filter((l) => { try { return JSON.parse(l).gate === 'SPEC_SEALED'; } catch { return false; } });
  assert.equal(sealed.length, 1, 'exactly one SPEC_SEALED entry after two seals');
});

// --- S4: fidelity authoring yardstick vs processing regression ---------------
test('S4: mandatorySetFor authoring variant yields the authoring yardstick', () => {
  // generateFidelityReport threads `variant` into mandatorySetFor. The authoring
  // yardstick is the two-gate authoring set, NOT the legacy processing SPEC set.
  const project = mkTmp('f6-s4-');
  const runDir = path.join(project, 'pipeline-runs', '001-x-spec');
  fs.mkdirSync(runDir, { recursive: true });
  // Real gate log with the authoring gates triggered.
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'SPEC_SEALED', decision: 'CONFIRMED', hardness: 'AUDIT' }) + '\n' +
    JSON.stringify({ gate: 'SPEC_REVIEW_FINDINGS', decision: 'CONFIRMED', hardness: 'AUDIT' }) + '\n');

  const authoring = fidelity.generateFidelityReport({
    pipelineDocPath: runDir, complexity: 'MEDIA', type: 'Spec',
    repoRoot: project, variant: 'spec-author',
  });
  assert.ok(authoring.ok, `authoring report ok (${authoring.error})`);
  const aj = JSON.parse(fs.readFileSync(path.join(runDir, 'fidelity-report.json'), 'utf8'));
  const aGates = aj.mandatory_gates.map((g) => g.gate).sort();
  assert.deepEqual(aGates, ['SPEC_REVIEW_FINDINGS', 'SPEC_SEALED'],
    'authoring yardstick = the two authoring gates only');
  assert.equal(aj.mandatory_expected, 2, 'authoring expected count is 2');
  assert.equal(aj.fidelity_score, 1, 'both authoring gates triggered -> score 1');
});

test('S4b: processing variant keeps the EXISTING SPEC mandatory set (no regression)', () => {
  const project = mkTmp('f6-s4b-');
  const runDir = path.join(project, '.pipeline', 'docs', 'Pre-spec-action', 'proc');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'SPEC_FORMAT_GATE_FAIL', decision: 'TRIGGERED', hardness: 'HARD' }) + '\n');

  const proc = fidelity.generateFidelityReport({
    pipelineDocPath: runDir, complexity: 'MEDIA', type: 'Spec',
    repoRoot: project, variant: 'spec-heavy',
  });
  assert.ok(proc.ok, `processing report ok (${proc.error})`);
  const pj = JSON.parse(fs.readFileSync(path.join(runDir, 'fidelity-report.json'), 'utf8'));
  const pGates = pj.mandatory_gates.map((g) => g.gate);
  // The legacy SPEC set is additive on top of MEDIA — must still include the
  // legacy spec gates and NOT collapse to the 2 authoring ones.
  assert.ok(pGates.includes('SPEC_FORMAT_GATE_FAIL'), 'processing keeps SPEC_FORMAT_GATE_FAIL');
  assert.ok(pGates.includes('SPEC_ARTIFACT_MISSING'), 'processing keeps SPEC_ARTIFACT_MISSING');
  assert.ok(pj.mandatory_expected > 2, 'processing expected count > 2 (full set, no regression)');
});

test('S4c: backward compatible — no variant -> current behavior (legacy SPEC set)', () => {
  const project = mkTmp('f6-s4c-');
  const runDir = path.join(project, '.pipeline', 'docs', 'Pre-spec-action', 'legacy');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'SPEC_FORMAT_GATE_FAIL', decision: 'TRIGGERED', hardness: 'HARD' }) + '\n');

  const def = fidelity.generateFidelityReport({
    pipelineDocPath: runDir, complexity: 'MEDIA', type: 'Spec', repoRoot: project,
  });
  assert.ok(def.ok, `default report ok (${def.error})`);
  const dj = JSON.parse(fs.readFileSync(path.join(runDir, 'fidelity-report.json'), 'utf8'));
  const dGates = dj.mandatory_gates.map((g) => g.gate);
  assert.ok(dGates.includes('SPEC_ARTIFACT_MISSING'), 'no-variant keeps legacy SPEC set');
  assert.ok(!dGates.includes('SPEC_SEALED'), 'no-variant does NOT switch to authoring yardstick');
});

test('S4e: FIX-B — a near-miss variant does NOT hijack the authoring yardstick', () => {
  // The original isAuthoringVariant matched the substring 'spec-author' plus a
  // bare 'spec', so 'spec-authority-check' (and anything starting with 'spec')
  // would collapse the mandatory set to the 2 authoring gates. The exact
  // allowlist must reject these near-misses.
  assert.equal(fidelity.isAuthoringVariant('spec-authority-check'), false, 'near-miss rejected');
  assert.equal(fidelity.isAuthoringVariant('spec'), false, 'bare spec no longer triggers');
  assert.equal(fidelity.isAuthoringVariant('spec-heavy'), false, 'processing variant rejected');
  assert.equal(fidelity.isAuthoringVariant('controller_type=spec'), false, 'controller_type string no longer triggers');
  // Canonical + alias still accepted (case-insensitive, trimmed).
  assert.equal(fidelity.isAuthoringVariant('spec-authoring'), true, 'canonical accepted');
  assert.equal(fidelity.isAuthoringVariant('  Spec-Author  '), true, 'alias accepted, trimmed, case-insensitive');

  // End-to-end: a near-miss variant keeps the full legacy SPEC set.
  const project = mkTmp('f6-s4e-');
  const runDir = path.join(project, '.pipeline', 'docs', 'Pre-spec-action', 'nearmiss');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'SPEC_FORMAT_GATE_FAIL', decision: 'TRIGGERED', hardness: 'HARD' }) + '\n');
  const res = fidelity.generateFidelityReport({
    pipelineDocPath: runDir, complexity: 'MEDIA', type: 'Spec',
    repoRoot: project, variant: 'spec-authority-check',
  });
  assert.ok(res.ok, `report ok (${res.error})`);
  const j = JSON.parse(fs.readFileSync(path.join(runDir, 'fidelity-report.json'), 'utf8'));
  const g = j.mandatory_gates.map((x) => x.gate);
  assert.ok(g.includes('SPEC_ARTIFACT_MISSING'), 'near-miss keeps legacy SPEC set');
  assert.ok(!g.includes('SPEC_SEALED'), 'near-miss does NOT switch to authoring yardstick');
  assert.ok(j.mandatory_expected > 2, 'near-miss expected count > 2 (full set)');
});

test('S4d: stop-hook TEARDOWN path applies the authoring yardstick from a SEALED sentinel (FIX-A)', () => {
  // This is the bug S4 missed: S4 calls generateFidelityReport(variant=...)
  // DIRECTLY, so it could pass while the production teardown path still ignored
  // the variant. Here we drive the stop-hook's ensureFidelityReport — the real
  // teardown entry — with the SEALED sentinel (which carries pipeline_variant at
  // its ROOT, NOT under orchestrator_decision) and assert the 2-gate authoring
  // yardstick is used. Without FIX-A.1 (root pipeline_variant fallback in
  // readClassification) + FIX-A.2 (thread variant into generateFidelityReport)
  // this report would carry the full legacy SPEC mandatory set instead.
  const project = mkTmp('f6-s4d-');
  const { runDir } = allocateSpecRun(project, 'spec run teardown yardstick');

  // The authoring gates the run actually fired.
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'SPEC_SEALED', decision: 'CONFIRMED', hardness: 'AUDIT' }) + '\n' +
    JSON.stringify({ gate: 'SPEC_REVIEW_FINDINGS', decision: 'CONFIRMED', hardness: 'AUDIT' }) + '\n');

  // Seal: this is what stamps pipeline_variant at the ROOT of the sentinel.
  const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));
  assert.ok(sealSpecRun(runDir, { variant: 'spec-authoring', grade: 'A' }).ok, 'seal ok');

  // Read the SEALED sentinel exactly as the stop-hook does, then call the real
  // teardown entry point (NOT generateFidelityReport directly).
  const sentinel = JSON.parse(fs.readFileSync(path.join(runDir, 'sentinel-state.json'), 'utf8'));
  assert.equal(sentinel.pipeline_variant, 'spec-authoring', 'sentinel carries root pipeline_variant');
  assert.ok(!sentinel.orchestrator_decision, 'variant is NOT under orchestrator_decision (the bug condition)');

  stopHook.ensureFidelityReport(runDir, project, sentinel);

  const rep = JSON.parse(fs.readFileSync(path.join(runDir, 'fidelity-report.json'), 'utf8'));
  const gates = rep.mandatory_gates.map((g) => g.gate).sort();
  assert.deepEqual(gates, ['SPEC_REVIEW_FINDINGS', 'SPEC_SEALED'],
    'teardown path used the 2-gate authoring yardstick (FIX-A wired end-to-end)');
  assert.equal(rep.mandatory_expected, 2, 'authoring expected count is 2 on the teardown path');
  assert.equal(rep.fidelity_score, 1, 'both authoring gates triggered -> score 1');

  // And the run-log entry's total_gates_expected must AGREE with the report
  // (FIX-A.3): buildRunLogEntry now uses the same mandatorySetFor SSOT.
  const entry = stopHook.buildRunLogEntry(runDir, project);
  assert.equal(entry.total_gates_expected, 2,
    'run-log total_gates_expected agrees with fidelity-report (authoring yardstick)');
  assert.equal(entry.variant, 'spec-authoring', 'run-log entry carries the authoring variant');
});

test('S4f: FIX-K — a TAMPERED sentinel signature cannot downgrade the yardstick to the authoring set', () => {
  // FIX-K: the teardown path only honors the (smaller) authoring yardstick when
  // the sentinel's HMAC verifies. A forged/unsigned sentinel that sets
  // pipeline_variant:'spec-authoring' purely to shrink a processing run's
  // mandatory gate count must FALL BACK to the legacy type/complexity (larger,
  // safe) set. A correctly-signed authoring sentinel still gets the 2-gate set.
  const project = mkTmp('f6-s4f-');
  const { runDir } = allocateSpecRun(project, 'spec run tampered sig');

  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'SPEC_SEALED', decision: 'CONFIRMED', hardness: 'AUDIT' }) + '\n' +
    JSON.stringify({ gate: 'SPEC_REVIEW_FINDINGS', decision: 'CONFIRMED', hardness: 'AUDIT' }) + '\n');

  // Seal -> writes a correctly SIGNED sentinel carrying pipeline_variant at root.
  const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));
  assert.ok(sealSpecRun(runDir, { variant: 'spec-authoring', grade: 'A' }).ok, 'seal ok');

  const sentinelPath = path.join(runDir, 'sentinel-state.json');

  // (a) POSITIVE control: a correctly-signed authoring sentinel verifies, so the
  //     teardown trust gate allows the downgrade -> 2-gate authoring yardstick.
  const signed = JSON.parse(fs.readFileSync(sentinelPath, 'utf8'));
  assert.equal(stopHook.authoringVariantAllowed(signed), true, 'signed authoring sentinel is trusted');
  stopHook.ensureFidelityReport(runDir, project, signed);
  const repSigned = JSON.parse(fs.readFileSync(path.join(runDir, 'fidelity-report.json'), 'utf8'));
  assert.equal(repSigned.mandatory_expected, 2, 'signed: authoring yardstick (2 gates)');

  // (b) NEGATIVE: tamper with the signature value so verification FAILS, while
  //     keeping pipeline_variant:'spec-authoring'. The trust gate must reject it,
  //     so the yardstick falls back to the legacy SPEC set (> 2 gates). Stamp a
  //     real complexity so the legacy path can actually score it (a sealed run's
  //     placeholder is 'unknown', which the authoring branch would normalize but
  //     the legacy branch correctly rejects — see generateFidelityReport).
  const tampered = JSON.parse(fs.readFileSync(sentinelPath, 'utf8'));
  assert.ok(tampered.__signature && typeof tampered.__signature.value === 'string', 'sentinel is signed');
  tampered.complexity = 'MEDIA';
  // Flip the last hex char of the signature so the HMAC no longer matches.
  const v = tampered.__signature.value;
  tampered.__signature.value = v.slice(0, -1) + (v.slice(-1) === '0' ? '1' : '0');
  assert.equal(stopHook.authoringVariantAllowed(tampered), false, 'tampered sentinel is NOT trusted');

  // Remove the stale report so ensureFidelityReport regenerates from scratch
  // (it is idempotent/keep-max otherwise).
  fs.rmSync(path.join(runDir, 'fidelity-report.json'), { force: true });
  fs.rmSync(path.join(runDir, 'fidelity-report.md'), { force: true });
  stopHook.ensureFidelityReport(runDir, project, tampered);
  const repTampered = JSON.parse(fs.readFileSync(path.join(runDir, 'fidelity-report.json'), 'utf8'));
  const tGates = repTampered.mandatory_gates.map((g) => g.gate);
  assert.ok(repTampered.mandatory_expected > 2,
    `tampered sentinel did NOT collapse to 2 (got ${repTampered.mandatory_expected}, legacy set used)`);
  assert.ok(!tGates.includes('SPEC_SEALED') || repTampered.mandatory_expected > 2,
    'tampered: yardstick is the legacy SPEC set, not the 2-gate authoring set');
});

// --- S5: allocate bridge is fail-safe ---------------------------------------
test('S5: allocate() never throws even when the pointer write fails (fail-safe bridge)', () => {
  // Force the bridge write to fail by making <project>/.pipeline a FILE, so
  // mkdir/write of .pipeline/active-run.json cannot succeed. allocate() must
  // still return a valid run directory (the run dir creation is independent).
  const project = mkTmp('f6-s5-');
  // Pre-create .pipeline as a regular file so mkdir(.pipeline) throws EEXIST/ENOTDIR.
  fs.writeFileSync(path.join(project, '.pipeline'), 'not a directory');

  const rootDir = path.join(project, 'pipeline-runs');
  let rd;
  const savedRunId = process.env.PIPELINE_RUN_ID;
  assert.doesNotThrow(() => { rd = RunDirectory.allocate(rootDir, 'fail safe bridge'); },
    'allocate must not throw when the bridge cannot write the pointer');
  if (savedRunId === undefined) delete process.env.PIPELINE_RUN_ID;
  else process.env.PIPELINE_RUN_ID = savedRunId;

  assert.ok(rd && fs.existsSync(rd.absPath), 'run directory still created');
  assert.ok(fs.existsSync(path.join(rd.absPath, 'manifest.yaml')), 'manifest still written');
});

// --- S6: run-seal CLI entry (FIX-C) -----------------------------------------
test('S6: run-seal.cjs has a CLI entry that seals a run and prints JSON (FIX-C)', () => {
  const { execFileSync } = require('node:child_process');
  const project = mkTmp('f6-s6-');
  const { runDir } = allocateSpecRun(project, 'spec run cli seal');

  const out = execFileSync('node',
    [path.join(ROOT, 'lib', 'run-seal.cjs'), runDir, '--variant', 'spec-authoring', '--grade', 'A'],
    { encoding: 'utf8' });
  const parsed = JSON.parse(out.trim().split(/\r?\n/).pop());
  assert.equal(parsed.ok, true, 'CLI prints { ok:true }');

  // The seal actually happened.
  const st = JSON.parse(fs.readFileSync(path.join(runDir, 'sentinel-state.json'), 'utf8'));
  assert.equal(st.final_decision, 'SEALED', 'CLI sealed the sentinel');
  assert.equal(st.pipeline_variant, 'spec-authoring', 'CLI stamped the variant');
});

test('S6b: run-seal CLI exits non-zero on { ok:false } (missing runDir)', () => {
  const { execFileSync } = require('node:child_process');
  let threw = false;
  try {
    execFileSync('node', [path.join(ROOT, 'lib', 'run-seal.cjs')], { encoding: 'utf8' });
  } catch (e) {
    threw = true;
    assert.equal(e.status, 1, 'exit code 1 on missing runDir');
    // FIX-O (v8.4.0): parse the LAST non-empty stdout line, matching the robust
    // pattern S6 uses (.split(/\r?\n/).filter(Boolean).pop()), so an incidental
    // leading line (e.g. a future warn on stdout) cannot break the JSON parse.
    const parsed = JSON.parse(String(e.stdout).split(/\r?\n/).filter(Boolean).pop());
    assert.equal(parsed.ok, false, 'prints { ok:false }');
  }
  assert.ok(threw, 'CLI exited non-zero');
});

// --- S6c: FIX-L — a RELATIVE runDir is rejected without writing -------------
test('S6c: FIX-L — run-seal CLI rejects a relative runDir (exit 1, no write)', () => {
  const { execFileSync } = require('node:child_process');
  let threw = false;
  try {
    // A relative path must be refused before the filesystem is touched.
    execFileSync('node', [path.join(ROOT, 'lib', 'run-seal.cjs'), 'some/relative/run', '--variant', 'spec-authoring'],
      { encoding: 'utf8', cwd: ROOT });
  } catch (e) {
    threw = true;
    assert.equal(e.status, 1, 'exit code 1 on relative runDir');
    const parsed = JSON.parse(String(e.stdout).split(/\r?\n/).filter(Boolean).pop());
    assert.equal(parsed.ok, false, 'prints { ok:false }');
    assert.match(parsed.error || '', /absolute/i, 'error names the absolute-path requirement');
  }
  assert.ok(threw, 'CLI exited non-zero on relative runDir');
  // No run directory was created under ROOT for the relative argument.
  assert.ok(!fs.existsSync(path.join(ROOT, 'some', 'relative', 'run', 'sentinel-state.json')),
    'relative runDir was not sealed (no sentinel written)');
});

// --- S6d: FIX-P — sealSpecRun() library surface rejects a relative runDir -----
test('S6d: FIX-P — sealSpecRun(relative) returns { ok:false } and writes nothing', () => {
  const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));
  // The library surface must enforce the same absolute-path floor as the CLI
  // (FIX-L only guarded the CLI entry). A relative runDir is refused BEFORE any
  // existsSync/filesystem touch, so programmatic callers stay consistent.
  const relPath = path.join('some', 'relative', 'seal-run');
  const res = sealSpecRun(relPath, { variant: 'spec-authoring', grade: 'A' });
  assert.equal(res.ok, false, 'relative runDir returns { ok:false }');
  assert.match(res.error || '', /absolute/i, 'error names the absolute-path requirement');
  // Nothing was created for the relative argument (resolved against the test CWD).
  const resolved = path.resolve(relPath);
  assert.ok(!fs.existsSync(path.join(resolved, 'sentinel-state.json')),
    'no sentinel-state.json written for the relative runDir');
  assert.ok(!fs.existsSync(path.join(resolved, 'gate-decisions.jsonl')),
    'no gate-decisions.jsonl written for the relative runDir');
});

// --- S7: FIX-F — newline injection in variant cannot forge a JSONL line ------
test('S7: FIX-F — a newline-injected variant cannot inject an extra gate-decisions line', () => {
  const project = mkTmp('f6-s7-');
  const { runDir } = allocateSpecRun(project, 'spec run injection seal');
  const { sealSpecRun } = require(path.join(ROOT, 'lib', 'run-seal.cjs'));

  // Malicious variant: a newline plus a forged JSONL object.
  const evil = 'spec-authoring\n{"gate":"FORGED","decision":"CONFIRMED"}';
  assert.ok(sealSpecRun(runDir, { variant: evil, grade: 'A' }).ok, 'seal ok');

  const lines = fs.readFileSync(path.join(runDir, 'gate-decisions.jsonl'), 'utf8')
    .split(/\r?\n/).filter((l) => l.trim());
  // No forged line may exist; exactly one SPEC_SEALED line.
  assert.ok(!lines.some((l) => { try { return JSON.parse(l).gate === 'FORGED'; } catch { return false; } }),
    'no forged gate line injected');
  const sealed = lines.filter((l) => { try { return JSON.parse(l).gate === 'SPEC_SEALED'; } catch { return false; } });
  assert.equal(sealed.length, 1, 'exactly one SPEC_SEALED line');
  // The sealed line's detail carries the sanitized (single-line) variant.
  const sealedObj = JSON.parse(sealed[0]);
  assert.ok(!/[\r\n]/.test(sealedObj.detail || ''), 'detail has no newline');
});

// ----------------------------------------------------------------------------
cleanup();
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
