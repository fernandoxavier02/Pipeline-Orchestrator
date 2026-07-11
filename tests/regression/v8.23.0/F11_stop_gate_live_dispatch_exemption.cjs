#!/usr/bin/env node
'use strict';

// =============================================================================
// F11 (v8.23.0) — stop-gate-hook.cjs live-pending-dispatch exemption (T2.2)
// =============================================================================
// SOURCE: loops/next-action-contract/LOOP_PLAN.md task T2.2 + 2026-07-08 agent-
// lockup audit. The Stop gate's continuity counter (continuity_attempts, capped
// at CONTINUITY_CAP=3 -> hard_failed) was incrementing on EVERY Stop of an
// incomplete armed run that had a pending_dispatches entry — INCLUDING the
// legitimate case of a dispatched subagent still running in the background. So 3
// legitimate background waits dropped the run into hard_failed for no fault.
//
// FIX (this batch): a LIVE pending dispatch (recent within TTL, well-formed
// created_at, not committed) is legitimate background work — the Stop is a turn
// boundary while a subagent runs, NOT a continuity failure. hasLivePendingDispatch
// exempts it (allow WITHOUT advancing the counter). Stale (beyond TTL), committed,
// or malformed (bad created_at) dispatches do NOT exempt — they fall through to
// the continuity block (fail-safe).
//
// TDD: S1 + S6 are RED against the UNFIXED hook (the bug: live wait counts as
// continuity). S2/S3/S4/S5/S7 are GREEN pre-fix too (the old logic reached the
// right DECISION for those by not distinguishing live from stale — the fix
// reaches the same decision via the correct logic and must not regress them).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f11-stop-live-dispatch-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/stop-gate-hook.cjs');
const { writeSignedState } = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));

const MIN = 60 * 1000;
function isoAgo(ms) { return new Date(Date.now() - ms).toISOString(); }

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rF11', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    workflow: 'FULL', state_version: 1, current_phase: '2-execute',
    pending_dispatches: {}, continuity_attempts: 0,
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rF11', updated_at: '2026-07-09T00:00:00.000Z' }, null, 2));
  return { docDir, statePath };
}

// Strip any inherited escape so the default-ON arming applies (matches B5's posture).
function runStop(root, docDir) {
  const base = { ...process.env }; delete base.PIPELINE_STOP_BLOCK_ENFORCEMENT;
  const payload = JSON.stringify({ hook_event_name: 'Stop', cwd: root });
  return spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8', env: { ...base, PIPELINE_DOC_PATH: docDir } });
}
// The Stop hook only writes stdout when it BLOCKS (silence === allow, exit 0). So
// "no block JSON in stdout" maps to 'allow'. (A thrown/error path also stays
// silent + exit 0 by the fail-open catch in the hook's main block.)
function decisionOf(r) {
  try { return JSON.parse(r.stdout || '{}').decision === 'block' ? 'block' : 'allow'; }
  catch { return 'allow'; }
}
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

// Each scenario runs in its own tmp root so state files never leak across.
function scenario(name, seed, check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f11-stop-live-'));
  try {
    const { docDir, statePath } = seedRun(root, seed);
    const r = runStop(root, docDir);
    check({ r, state: readState(statePath) });
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

console.log('=== F11 v8.23.0 — stop-gate live-pending-dispatch exemption (T2.2) ===');

// ---- S1: live + recent pending dispatch -> allow WITHOUT advancing counter ----
scenario('S1 [live wait] a recent non-committed dispatch exempts the Stop (allow, no counter bump)',
  { pending_dispatches: { d1: { status: 'pending', created_at: isoAgo(1 * MIN) } }, continuity_attempts: 0 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), 'allow', 'a live background dispatch must NOT block the Stop');
    assert.equal((state || {}).continuity_attempts, 0, 'a live wait must NOT advance the continuity counter');
  });

// ---- S2: no pending, active incomplete -> block + increment (preserved) --------
scenario('S2 [continuity] no pending + active incomplete run blocks and advances the counter',
  { pending_dispatches: {}, continuity_attempts: 0 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), 'block', 'an incomplete run with no live dispatch must block');
    assert.equal((state || {}).continuity_attempts, 1, 'the counter must advance on a real continuity Stop');
  });

// ---- S3: pending beyond TTL (stale) -> counts as continuity -------------------
scenario('S3 [stale] a pending dispatch beyond the TTL does NOT exempt (counts as continuity)',
  { pending_dispatches: { d1: { status: 'pending', created_at: isoAgo(300 * MIN) } }, continuity_attempts: 0 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), 'block', 'a stale dispatch must not exempt — block + advance');
    assert.equal((state || {}).continuity_attempts, 1, 'a stale wait counts as a continuity Stop');
  });

// ---- S4: committed pending -> not live -> counts as continuity ----------------
scenario('S4 [committed] a committed dispatch is not live (does not exempt)',
  { pending_dispatches: { d1: { status: 'committed', created_at: isoAgo(1 * MIN) } }, continuity_attempts: 0 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), 'block', 'a committed dispatch is not live — block + advance');
    assert.equal((state || {}).continuity_attempts, 1, 'a committed dispatch counts as a continuity Stop');
  });

// ---- S5: cap still fires with continuity_attempts:2 + no live dispatch ---------
scenario('S5 [cap] continuity_attempts:2 + no live dispatch -> hard_failed terminal',
  { pending_dispatches: {}, continuity_attempts: 2 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(decisionOf(r), 'block', 'the 3rd continuity must NOT block (converts to terminal)');
    assert.equal((state || {}).terminal_state, 'hard_failed', 'the 3rd continuity converts to hard_failed');
  });

// ---- S6: multiple records, one live one dead -> the live one exempts -----------
scenario('S6 [mixed] one live + one committed dispatch -> the live one exempts (allow, no bump)',
  { pending_dispatches: {
      d1: { status: 'committed', created_at: isoAgo(1 * MIN) },
      d2: { status: 'pending', created_at: isoAgo(1 * MIN) },
    }, continuity_attempts: 0 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), 'allow', 'the live dispatch in the mix exempts the Stop');
    assert.equal((state || {}).continuity_attempts, 0, 'the live wait must NOT advance the counter');
  });

// ---- S7: malformed created_at -> fail-safe, does NOT exempt -------------------
scenario('S7 [malformed] a dispatch with a bad created_at does NOT exempt (fail-safe)',
  { pending_dispatches: { d1: { status: 'pending', created_at: 'not-a-date' } }, continuity_attempts: 0 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), 'block', 'a malformed created_at must not exempt — block + advance');
    assert.equal((state || {}).continuity_attempts, 1, 'a malformed dispatch counts as a continuity Stop');
  });

// ---- S8: forged future created_at -> does NOT exempt (anti-bypass) -------------
scenario('S8 [future ts] a dispatch with a future created_at does NOT exempt (no perpetual bypass)',
  { pending_dispatches: { d1: { status: 'pending', created_at: isoAgo(-60 * MIN) } }, continuity_attempts: 0 },
  ({ r, state }) => {
    assert.equal(r.status, 0, r.stderr);
    assert.equal(decisionOf(r), 'block', 'a future created_at must not exempt — block + advance');
    assert.equal((state || {}).continuity_attempts, 1, 'a forged-future dispatch counts as a continuity Stop');
  });

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
