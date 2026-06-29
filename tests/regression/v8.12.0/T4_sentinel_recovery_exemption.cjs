#!/usr/bin/env node
'use strict';

// =============================================================================
// T4 (v8.12.0) — dispatch-pending-gate: SENTINEL RECOVERY EXEMPTION (deadlock fix)
// =============================================================================
// DEFECT (found by live dogfood 2026-06-22): a two-hook deadlock.
//   - sentinel-hook.cjs:278 already exempts the sentinel agent ("sentinel itself
//     always passes" — anti-loop), and on a sequence DIVERGENCE it INSTRUCTS the
//     parent to "Spawn the sentinel agent ... mode SEQUENCE_VALIDATION to diagnose
//     and auto-correct".
//   - BUT dispatch-pending-gate.cjs (added later, v8.3.0) was NOT synced with that
//     exemption. While a handshake is pending+live (or the signed state is CORRUPT),
//     it blocks every non-resolution Agent — INCLUDING the sentinel. So the one
//     actor the other hook tells you to run is the one this hook forbids.
//     Result: an irrecoverable deadlock (one gate sends for the guard; the other
//     bars the guard at the door).
//
// FIX UNDER TEST: dispatch-pending-gate must exempt a spawn of the sentinel agent
// in BOTH branches (live-pending AND corrupt-state) — mirroring sentinel-hook's
// own "sentinel always passes". The sentinel is a recovery/diagnosis action, not
// inline work; it cannot relax the lock for production work.
//
// BDD scenarios (Given / When / Then):
//   D1 Given a live pending handshake     When the sentinel is dispatched   Then ALLOW
//   D2 Given a live pending handshake     When a non-sentinel agent (no marker) Then BLOCK
//   D3 Given a live pending handshake     When an inline Read               Then BLOCK (F37 regression intact)
//   D4 Given a CORRUPT signed state       When the sentinel is dispatched   Then ALLOW (guard can rebuild the seal)
//   D5 Given a CORRUPT signed state       When a non-sentinel agent (no marker) Then BLOCK (fail-closed intact)
//   D6 Given a live pending handshake     When the sentinel is dispatched via the REAL hook process  Then no deny emitted
//
// RED until dispatch-pending-gate exempts the sentinel: D1, D4, D6 fail today
// (sentinel is blocked); D2, D3, D5 already pass today and must STAY passing.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't4-sentinel-exemption-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/dispatch-pending-gate.cjs');
const gate = require(HOOK);

const SENTINEL = 'pipeline-orchestrator:core:sentinel';
const NON_SENTINEL = 'pipeline-orchestrator:quality:plan-architect';

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }
const RECENT = () => ([{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'phase-0a-task-orchestrator', emitted_at: iso(60_000) }]);

// Live pending: non-authoritative discovery (mtime fallback), unsigned state →
// NOT corrupt → exercises findLivePendingBlock (mirrors F37 setup).
function setupLive(pending) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't4-live-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-22-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({
    schema_version: 1, run_id: '2026-06-22-run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '0a', pending_blocks: pending,
  }, null, 2));
  return tmp;
}

// Corrupt: authoritative discovery (active-run pointer) + present-but-invalid
// signature + a configured key → findActiveSentinelState returns CORRUPT_SENTINEL,
// exercising the corrupt branch of decideInlineGate.
function setupCorrupt(pending) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't4-corrupt-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-06-22-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({
    schema_version: 1, run_id: '2026-06-22-run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '0a', pending_blocks: pending,
    __signature: { algorithm: 'sha256', value: '0'.repeat(64), schema_version: 1 },
  }, null, 2));
  fs.writeFileSync(path.join(tmp, '.pipeline', 'active-run.json'), JSON.stringify({
    pipeline_doc_path: runDir, run_id: '2026-06-22-run', updated_at: new Date().toISOString(),
  }));
  return tmp;
}

let pass = 0, fail = 0; const failed = [];
function check(name, setupFn, payloadFn, expected) {
  let tmp;
  try {
    tmp = setupFn();
    const r = gate.decideInlineGate(payloadFn(tmp));
    assert.equal(r.decision, expected,
      `expected '${expected}', got '${r.decision}'${r.reason ? ' — ' + String(r.reason).slice(0, 100) : ''}`);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}

console.log('=== T4 v8.12.0 — dispatch-pending-gate sentinel recovery exemption (deadlock fix) ===');

// D1 — THE DEADLOCK: live pending + sentinel dispatch must be ALLOWED.
check('D1 [live] handshake vivo + Agent(sentinel, SEQUENCE_VALIDATION) → ALLOW (recovery não pode ser barrado)',
  () => setupLive(RECENT()),
  (tmp) => ({ tool_name: 'Agent', tool_input: { subagent_type: SENTINEL, prompt: 'mode: SEQUENCE_VALIDATION' }, cwd: tmp }),
  'allow');

// D2 — SECURITY: a non-sentinel, non-resolution agent must STILL be blocked.
check('D2 [live] handshake vivo + Agent(plan-architect, sem marcador) → BLOCK (não afrouxar)',
  () => setupLive(RECENT()),
  (tmp) => ({ tool_name: 'Agent', tool_input: { subagent_type: NON_SENTINEL, prompt: 'trabalho inline disfarçado' }, cwd: tmp }),
  'block');

// D3 — v8.18.0: Read agora é investigação (ALWAYS_ALLOW_TOOLS), liberado mesmo com pending.
check('D3 [live] handshake vivo + Read inline → ALLOW (investigação liberada, v8.18.0)',
  () => setupLive(RECENT()),
  (tmp) => ({ tool_name: 'Read', tool_input: { file_path: path.join(tmp, 'src/foo.cjs') }, cwd: tmp }),
  'allow');

// D4 — CORRUPT branch: the guard must be able to run to rebuild the seal.
check('D4 [corrupt] estado CORRUPT + Agent(sentinel) → ALLOW (guardião reconstrói o selo)',
  () => setupCorrupt(RECENT()),
  (tmp) => ({ tool_name: 'Agent', tool_input: { subagent_type: SENTINEL, prompt: 'mode: SEQUENCE_VALIDATION' }, cwd: tmp }),
  'allow');

// D5 — CORRUPT branch SECURITY: non-sentinel work still fails closed.
check('D5 [corrupt] estado CORRUPT + Agent(plan-architect, sem marcador) → BLOCK (fail-closed preservado)',
  () => setupCorrupt(RECENT()),
  (tmp) => ({ tool_name: 'Agent', tool_input: { subagent_type: NON_SENTINEL, prompt: 'x' }, cwd: tmp }),
  'block');

// D6 — dogfood via the REAL hook process: sentinel dispatch must NOT emit a deny.
(function d6() {
  let tmp;
  const name = 'D6 [live/CLI] hook real não nega o spawn do sentinel com handshake vivo';
  try {
    tmp = setupLive(RECENT());
    const res = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: SENTINEL, prompt: 'mode: SEQUENCE_VALIDATION' }, cwd: tmp }),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, res.stderr);
    assert.doesNotMatch(res.stdout || '', /permissionDecision":"deny"/,
      'the real hook must NOT deny a sentinel recovery spawn while a handshake is pending');
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
})();

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
