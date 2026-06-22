#!/usr/bin/env node
'use strict';

// =============================================================================
// B3 (v8.11.0) — REQ-CONSUME-ONCE (DoD#8): a step-unlocking verdict file must not
// be re-read by a LATER stamp. Without this, a new batch whose agent did NOT
// re-emit checkpoint-verdict.json would have the PREVIOUS batch's stale verdict
// re-recorded — unlocking a step it never produced. TDD RED phase — today the
// stamp reads the verdict file every time and never consumes it.
//
// CONTRACT under test: step-ledger-stamp, after SUCCESSFULLY recording a verdict
// file, renames it (…consumed-<mtime>) so it cannot be re-read. A new file (a
// fresh batch) is consumed normally; an absent (already-consumed) file records
// nothing (verdict stays unknown — no stale unlock).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b3-consume-once-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rB3', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1, step_ledger: {},
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rB3', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}
function writeVerdictFile(docDir, name, obj) { fs.writeFileSync(path.join(docDir, name), JSON.stringify(obj)); }
function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
}
function agentPayload(root, subagentType) {
  return {
    hook_event_name: 'PostToolUse', tool_name: 'Agent',
    tool_input: { subagent_type: subagentType },
    tool_response: { status: 'completed', content: [{ type: 'text', text: 'done' }] },
    cwd: root,
  };
}
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function consumedFiles(docDir, base) { return fs.readdirSync(docDir).filter((f) => f.startsWith(base + '.consumed')); }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-consume-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== B3 v8.11.0 — consume-once verdict files (RED until step-ledger-stamp consumes them) ===');

// ---- B3-S1: a checkpoint verdict is recorded AND the file is consumed (renamed)
liveTest('B3-S1 [consume] a checkpoint verdict is recorded and the source file is renamed out of the way', (root) => {
  const { docDir, statePath } = seedRun(root);
  writeVerdictFile(docDir, 'checkpoint-verdict.json', { verdict: 'fail' });
  const r = run(agentPayload(root, 'checkpoint-validator'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((readState(statePath) || {}).last_checkpoint_verdict, 'fail', 'the verdict must be recorded');
  assert.ok(!fs.existsSync(path.join(docDir, 'checkpoint-verdict.json')), 'the source verdict file must be consumed (renamed away)');
  assert.equal(consumedFiles(docDir, 'checkpoint-verdict.json').length, 1, 'a .consumed-<mtime> copy must be kept for audit');
});

// ---- B3-S2: a stale (already-consumed) verdict does NOT unlock a new batch -----
liveTest('B3-S2 [stale-no-unlock] after consume, a new stamp with NO fresh file does not re-record a stale verdict', (root) => {
  const { docDir, statePath } = seedRun(root);
  writeVerdictFile(docDir, 'checkpoint-verdict.json', { verdict: 'pass' });
  run(agentPayload(root, 'checkpoint-validator'), { PIPELINE_DOC_PATH: docDir }); // batch 1 consumes
  assert.ok(!fs.existsSync(path.join(docDir, 'checkpoint-verdict.json')), 'file consumed after batch 1');
  // Simulate a new batch: reset the field, agent did NOT re-emit the file.
  const s = readState(statePath); delete s.last_checkpoint_verdict; writeSignedState(statePath, s);
  const r = run(agentPayload(root, 'checkpoint-validator'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((readState(statePath) || {}).last_checkpoint_verdict, undefined,
    'a consumed (absent) verdict must NOT re-unlock — the field stays unknown without a fresh file');
});

// ---- B3-S3: a FRESH verdict file (new batch) is consumed normally -------------
liveTest('B3-S3 [fresh] a freshly re-emitted verdict file is consumed normally', (root) => {
  const { docDir, statePath } = seedRun(root);
  writeVerdictFile(docDir, 'checkpoint-verdict.json', { verdict: 'fail' });
  run(agentPayload(root, 'checkpoint-validator'), { PIPELINE_DOC_PATH: docDir }); // batch 1
  // batch 2 re-emits a NEW file (green this time).
  writeVerdictFile(docDir, 'checkpoint-verdict.json', { verdict: 'pass' });
  const r = run(agentPayload(root, 'checkpoint-validator'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((readState(statePath) || {}).last_checkpoint_verdict, 'pass', 'the fresh verdict must be recorded');
  assert.ok(!fs.existsSync(path.join(docDir, 'checkpoint-verdict.json')), 'the fresh file is also consumed');
});

// ---- B3-S4: a phase verdict file (ssot) is consumed once too ------------------
liveTest('B3-S4 [phase] a phase verdict file (ssot-verdict.json) is consumed once', (root) => {
  const { docDir } = seedRun(root);
  writeVerdictFile(docDir, 'ssot-verdict.json', { ssot_status: 'ok' });
  const r = run(agentPayload(root, 'task-orchestrator'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(docDir, 'ssot-verdict.json')), 'the phase verdict file must be consumed');
  assert.equal(consumedFiles(docDir, 'ssot-verdict.json').length, 1, 'a .consumed copy must be kept');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until step-ledger-stamp consume-once ships):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
