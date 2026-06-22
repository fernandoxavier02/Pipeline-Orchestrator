#!/usr/bin/env node
'use strict';

// =============================================================================
// B5 (v8.11.0) — REQ-STOP-BLOCK-DEFAULT-ON: the incomplete-run Stop block is armed
// by default. The crucial safety property (why this does NOT deadlock): a run that
// actually finished (a GO/closeout signal) is marked terminal 'completed' by B1 and
// therefore is NOT blocked even with the gate armed. Only a genuinely incomplete
// governed run is blocked, with a recover-or-abort reason; SessionEnd/StopFailure
// never block; the 3-continuity cap converts to hard_failed (no infinite block).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b5-stop-block-armed-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/stop-gate-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');
const GO_CLOSEOUT = { gate: 'CLOSEOUT_CONFIRM', hardness: 'SOFT', decision: 'CONFIRMED', decided_by: 'spec-closer', timestamp: '2026-06-21T01:00:00.000Z' };

function seedRun(root, extra, gateLines) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rB5', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1, current_phase: '2-execute', pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rB5', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2));
  if (gateLines && gateLines.length) {
    fs.writeFileSync(path.join(docDir, 'gate-decisions.jsonl'), gateLines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }
  return { docDir, statePath };
}
// Force the default (no env) by stripping any inherited escape.
function run(payload, env) {
  const base = { ...process.env }; delete base.PIPELINE_STOP_BLOCK_ENFORCEMENT;
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function stopPayload(root, event) { return { hook_event_name: event || 'Stop', cwd: root }; }
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function decisionOf(r) { try { const o = JSON.parse(r.stdout || '{}'); return o.decision; } catch { return undefined; } }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-stopblock-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== B5 v8.11.0 — Stop block default-on (incomplete blocks; finished does not) ===');

// ---- B5-S1: incomplete + no signal + default-on → block ---------------------
liveTest('B5-S1 [block] an incomplete governed run blocks Stop by default (no env)', (root) => {
  const { docDir } = seedRun(root, { pipeline_active: true });
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'an incomplete run must block under the default-on gate');
});

// ---- B5-S2: incomplete + GO signal → B1 completes it → NOT blocked -----------
liveTest('B5-S2 [no-deadlock] an incomplete run WITH a GO signal is completed by B1 and is NOT blocked even armed', (root) => {
  const { docDir, statePath } = seedRun(root, { pipeline_active: true }, [GO_CLOSEOUT]);
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a finished run (GO) must NOT be blocked — B1 marks it completed');
  assert.equal((readState(statePath) || {}).terminal_state, 'completed', 'the finished run is marked completed');
});

// ---- B5-S3: SessionEnd never blocks (recovery) ------------------------------
liveTest('B5-S3 [recovery] SessionEnd never blocks even armed', (root) => {
  const { docDir } = seedRun(root, { pipeline_active: true });
  const r = run(stopPayload(root, 'SessionEnd'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'SessionEnd is recovery — it must never block');
});

// ---- B5-S4: the 3-continuity cap converts to hard_failed (no infinite block) -
liveTest('B5-S4 [cap] at the continuity cap the gate writes hard_failed and ALLOWS (no infinite block)', (root) => {
  const { docDir, statePath } = seedRun(root, { pipeline_active: true, continuity_attempts: 2 });
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'at the cap the gate must NOT block a 3rd time');
  assert.equal((readState(statePath) || {}).terminal_state, 'hard_failed', 'the cap converts to an honest hard_failed terminal');
});

// ---- B5-S5: the warn escape disarms the block -------------------------------
liveTest('B5-S5 [warn-escape] PIPELINE_STOP_BLOCK_ENFORCEMENT=warn disarms the block', (root) => {
  const { docDir } = seedRun(root, { pipeline_active: true });
  const r = run(stopPayload(root, 'Stop'), { PIPELINE_DOC_PATH: docDir, PIPELINE_STOP_BLOCK_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'the warn escape must disarm the Stop block');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
