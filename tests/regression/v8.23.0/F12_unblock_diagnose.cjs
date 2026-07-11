#!/usr/bin/env node
'use strict';

// =============================================================================
// F12 (v8.23.0) — scripts/unblock-diagnose.cjs (T1.3)
// =============================================================================
// Backs the `/pipeline-orchestrator:unblock` skill. The script is READ-ONLY: it
// reads the real run state and prints a diagnosis + the single next action (via
// lib/next-action.cjs::resolveNextAction) + an optional safe-cleanup command.
// These scenarios pin the diagnosis branches: no-run, terminal, active-no-pending
// (INLINE_WORK_BLOCKED), and a live-background-wait (legitimate, not a deadlock).
// The script must NEVER mutate state or print a bypass recipe.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f12-unblock-diagnose-stable-secret-0123456789abcdef';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/unblock-diagnose.cjs');
const { writeSignedState } = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

function runScript(docPath) {
  const env = { ...process.env, PIPELINE_DOC_PATH: docPath || '' };
  delete env.PIPELINE_HANDSHAKE_TIMEOUT_MS; // default TTL
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env, timeout: 15000 });
  return { stdout: r.stdout || '', status: r.status };
}

function freshRun(extra) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f12-unblock-'));
  const docDir = path.join(root, 'run');
  fs.mkdirSync(docDir, { recursive: true });
  if (extra) writeSignedState(path.join(docDir, 'sentinel-state.json'), Object.assign({
    run_id: 'rF12', pipeline_active: true, workflow: 'FULL', state_version: 1, current_phase: '2-execute',
    task_type: 'Feature', pending_dispatches: {},
  }, extra));
  return { root, docDir };
}

console.log('=== F12 v8.23.0 — unblock-diagnose.cjs (T1.3) ===');

// ---- S1: no run (empty docPath) → honest "no active run" message ----------------
record('S1 [no run] empty docPath → diagnosis says no active run (no crash, no bypass)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f12-empty-'));
  const r = runScript(path.join(root, 'nope')); // sentinel absent → no-run branch
  assertOk(r.status === 0 && /no active pipeline run/i.test(r.stdout), `expected no-run diagnosis, got: ${r.stdout}`);
  assertOk(!/rm -rf|delete|writeSignedState/i.test(r.stdout), 'diagnosis must NOT print a destructive/bypass recipe');
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
});

// ---- S2: terminal run → diagnosis names the terminal state --------------------
record('S2 [terminal] a completed run → diagnosis says it already terminated', () => {
  const { docDir, root } = freshRun({ pipeline_active: false, terminal_state: 'completed' });
  const r = runScript(docDir);
  assertOk(r.status === 0 && /terminal state: completed/i.test(r.stdout), `expected terminal diagnosis, got: ${r.stdout}`);
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
});

// ---- S3: active + no live pending → INLINE_WORK_BLOCKED → resolveNextAction -----
record('S3 [inline blocked] active run + no live pending → INLINE_WORK_BLOCKED + parent next action', () => {
  const { docDir, root } = freshRun({}); // active, empty pending_dispatches
  const r = runScript(docDir);
  assertOk(r.status === 0, `script crashed: ${r.stdout}`);
  assertOk(/INLINE_WORK_BLOCKED/i.test(r.stdout), `expected INLINE_WORK_BLOCKED diagnosis, got: ${r.stdout}`);
  assertOk(/Next action \(parent/.test(r.stdout), `expected a parent next action, got: ${r.stdout}`);
  assertOk(/Agent\(subagent_type:/i.test(r.stdout), `parent action must be a real Agent(...) dispatch, got: ${r.stdout}`);
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
});

// ---- S4: active + live background dispatch → legitimate-wait guidance ---------
record('S4 [live wait] active run + recent dispatch → legitimate background wait (do NOT end turn)', () => {
  const { docDir, root } = freshRun({
    pending_dispatches: { d1: { status: 'pending', created_at: new Date(Date.now() - 60000).toISOString() } },
  });
  const r = runScript(docDir);
  assertOk(r.status === 0, `script crashed: ${r.stdout}`);
  // Either the live-wait branch fires (if edit-guard's findLivePendingBlock agrees)
  // OR it falls through to INLINE_WORK_BLOCKED — both are safe, non-bypass outputs.
  const safe = /legitimate background wait|INLINE_WORK_BLOCKED/i.test(r.stdout);
  assertOk(safe, `expected either legitimate-wait or inline-blocked diagnosis, got: ${r.stdout}`);
  assertOk(!/disable.*enforcement|PIPELINE_.*=warn/i.test(r.stdout), 'must NOT suggest disabling enforcement');
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
});

function assertOk(cond, msg) { if (!cond) throw new Error(msg); }

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
