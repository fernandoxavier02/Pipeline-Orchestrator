#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 (v8.19.0) — Stop gate: seal evidence as the clean-close condition (REQ-C).
// Spawns the real .claude/hooks/stop-gate-hook.cjs with a Stop/SessionEnd payload.
//
// EXPECTED RED (before T4.2): a Spec run closes cleanly merely because it went
//   inactive — the inactivity allow (line ~308) fires whether or not seal evidence
//   exists. So a sealed run is NOT marked completed, and an inactive-but-UNSEALED run
//   is ALLOWED instead of blocked / capped to hard_failed.
// EXPECTED GREEN (after T4.2): a sealed spec → writeCompleted + allow; an
//   inactive-but-unsealed spec → block(armed) / inert(warn) / cap 3 → hard_failed;
//   non-spec inactive + SessionEnd + corrupt are unchanged (allow / recover).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f4-stop-gate-seal-evidence-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/stop-gate-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

// Seed a run dir + signed sentinel + active pointer. `manifestStatus` writes a
// manifest.yaml; `tamper` corrupts the signature after signing.
function seedRun(root, extra, manifestStatus, tamper) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rspec', pipeline_active: false, pipeline_doc_path: docDir,
    state_version: 1, current_phase: '9-seal', pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rspec', updated_at: '2026-06-29T00:00:00.000Z' }, null, 2));
  if (manifestStatus) fs.writeFileSync(path.join(docDir, 'manifest.yaml'), `status: ${manifestStatus}\ntype: "Spec"\n`);
  if (tamper) {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    raw.current_phase = 'tampered-after-signing';
    fs.writeFileSync(statePath, JSON.stringify(raw, null, 2));
  }
  return { docDir, statePath };
}

function run(payload, env) {
  const base = { ...process.env }; delete base.PIPELINE_STOP_BLOCK_ENFORCEMENT;
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function stopPayload(root, event) { return { hook_event_name: event || 'Stop', cwd: root }; }
function decisionOf(r) { try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; } }
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function terminalOf(p) { const s = readState(p) || {}; return s.terminal_state || s.status || null; }

// A spec run signal: spec_authoring_progress present, NO `workflow`.
const SPEC = { spec_authoring_progress: { intake: 'done', requirements: 'done' } };

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f4-stopgate-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F4 v8.19.0 — Stop gate requires seal evidence to close a Spec run cleanly ===');

// ---- F4-S1: sealed spec (final_decision SEALED) → allow + completed ----------
liveTest('F4-S1 [sealed] a SEALED spec run closes cleanly and is marked terminal completed', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ final_decision: 'SEALED' }, SPEC));
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a sealed spec run must close cleanly');
  assert.equal(terminalOf(statePath), 'completed', 'seal evidence must persist terminal_state=completed (RED today: not written)');
});

// ---- F4-S2: sealed via manifest.yaml status: sealed → allow + completed ------
liveTest('F4-S2 [sealed-manifest] seal evidence from manifest.yaml status: sealed closes cleanly', (root) => {
  const { docDir, statePath } = seedRun(root, SPEC, /* manifestStatus */ 'sealed');
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a manifest-sealed spec run must close cleanly');
  assert.equal(terminalOf(statePath), 'completed', 'manifest seal evidence must persist completed (RED today: not written)');
});

// ---- F4-S3: inactive spec, NO seal evidence → block(armed) (RED today) -------
liveTest('F4-S3 [unsealed-block] an inactive-but-unsealed spec run does NOT close cleanly (block, armed)', (root) => {
  const { docDir } = seedRun(root, SPEC);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'inactivity alone must not be a clean close for a spec run (RED today: inactive → allow)');
});

// ---- F4-S3b: warn escape makes the unsealed block inert ----------------------
liveTest('F4-S3b [warn] the warn escape disarms the unsealed-spec block', (root) => {
  const { docDir } = seedRun(root, SPEC);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir, PIPELINE_STOP_BLOCK_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'the warn escape must disarm the block (REQ-C / NFR-3)');
});

// ---- F4-S4: cap 3 continuities → hard_failed (no infinite block) -------------
liveTest('F4-S4 [cap] an unsealed spec run at the continuity cap converts to hard_failed and ALLOWS', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ continuity_attempts: 2 }, SPEC));
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'at the cap the gate must not block a 3rd time');
  assert.equal(terminalOf(statePath), 'hard_failed', 'the cap converts to an honest hard_failed terminal (RED today: never reached)');
});

// ---- F4-S5: non-spec inactive run → unchanged allow --------------------------
liveTest('F4-S5 [non-spec] a non-spec inactive run still closes cleanly (unchanged allow)', (root) => {
  const { docDir } = seedRun(root, { workflow: 'FULL' });
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a non-spec inactive run must be unaffected (no seal requirement)');
});

// ---- F4-S6: SessionEnd / StopFailure on an unsealed spec → allow (recovery) --
liveTest('F4-S6 [recovery-SessionEnd] SessionEnd on an unsealed spec never blocks', (root) => {
  const { docDir } = seedRun(root, SPEC);
  const r = run(stopPayload(root, 'SessionEnd'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'SessionEnd is recovery — never block (NFR-4)');
});
liveTest('F4-S6b [recovery-StopFailure] StopFailure on an unsealed spec never blocks', (root) => {
  const { docDir } = seedRun(root, SPEC);
  const r = run(stopPayload(root, 'StopFailure'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'StopFailure is recovery — never block (NFR-4)');
});

// ---- F4-S7: corrupt state → allow (Stop never blocks teardown on corrupt) ----
liveTest('F4-S7 [corrupt] corrupt signed state allows teardown (anti-deadlock)', (root) => {
  const { docDir } = seedRun(root, SPEC, null, /* tamper */ true);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'the Stop gate must not block teardown on corrupt state');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
