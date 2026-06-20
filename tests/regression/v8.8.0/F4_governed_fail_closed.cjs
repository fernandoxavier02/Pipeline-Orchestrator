#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 (v8.8.0) — B2: fail-CLOSED on a corrupt sentinel-state for governed gates
// (AUDIT-003).
//
// TDD RED phase. The five user-APPROVED B2 scenarios as labeled sub-checks.
//
// ----------------------------------------------------------------------------
// EXPECTED RED SPLIT — read before running.
// ----------------------------------------------------------------------------
// step-ledger-gate, gate-log-gate, and dispatch-pending-gate ALL currently treat
// a corrupt (tampered-HMAC) sentinel-state as `allow` (fail-OPEN):
//   step-ledger-gate.cjs : `if (!state || state === eg.CORRUPT_SENTINEL) return {decision:'allow'}`
//   gate-log-gate.cjs    : same line
//   dispatch-pending-gate.cjs : `if (!state || state === eg.CORRUPT_SENTINEL) return {decision:'allow'}`
// An adversary who forges a signed field can therefore neutralize the gate.
// batch-review-gate already fails CLOSED on corrupt state (F1-17), so the fix is
// to bring the other three to parity: corrupt state + governed action → deny.
//
//   NEW-BEHAVIOR (must FAIL now, on an assertion — valid RED):
//     B2-MAIN  corrupt state + governed agent (deny mode) → deny + /CORRUPT/
//              for step-ledger-gate AND gate-log-gate AND dispatch-pending-gate
//
//   INVARIANT-GUARD (PASS now, must STAY passing — by design):
//     B2-REG-1   null/absent state + governed → allow (absent ≠ corrupt)
//     B2-REG-2   corrupt state + warn escape   → allow (warn overrides fail-closed)
//     B2-EDGE-1  corrupt state + ungoverned    → allow (no deadlock)
//     B2-EDGE-2  batch-review-gate parity: corrupt + governed → deny (already fixed)
//
// Each check is tagged [NEW] or [GUARD].
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

const HOOKS = path.resolve(__dirname, '../../../.claude/hooks');
const GATE_STEP_LEDGER = path.join(HOOKS, 'step-ledger-gate.cjs');
const GATE_GATE_LOG = path.join(HOOKS, 'gate-log-gate.cjs');
const GATE_DISPATCH_PENDING = path.join(HOOKS, 'dispatch-pending-gate.cjs');
const GATE_BATCH_REVIEW = path.join(HOOKS, 'batch-review-gate.cjs');

// Per-gate config: which agent leaf is GOVERNED by that gate, which env var puts
// it in warn mode, and which extra signed fields its decision path requires so
// the corrupt-state branch (not some earlier short-circuit) is the one exercised.
const GATES = {
  'step-ledger-gate': {
    file: GATE_STEP_LEDGER,
    governedAgent: 'pipeline-orchestrator:executor:executor-controller',
    ungovernedAgent: 'pipeline-orchestrator:quality:plan-architect',
    warnEnv: { PIPELINE_STEP_LEDGER_ENFORCEMENT: 'warn' },
    seedExtra: { step_ledger: [] }, // make the ledger path live (not inert)
  },
  'gate-log-gate': {
    file: GATE_GATE_LOG,
    governedAgent: 'pipeline-orchestrator:executor:executor-controller',
    ungovernedAgent: 'pipeline-orchestrator:quality:plan-architect',
    warnEnv: { PIPELINE_GATE_LOG_ENFORCEMENT: 'warn' },
    seedExtra: {},
  },
  'dispatch-pending-gate': {
    file: GATE_DISPATCH_PENDING,
    // dispatch-pending blocks ANY work tool while a handshake is live; with a
    // corrupt state it currently fails open. "Governed" here = a non-resolution
    // work action (Edit a production file). The ungoverned analogue = a resolution
    // Agent spawn (always allowed).
    governedAgent: null, // uses a work tool instead (see buildPayload)
    ungovernedAgent: null,
    warnEnv: { PIPELINE_DISPATCH_INLINE_ENFORCEMENT: 'warn' },
    seedExtra: {},
  },
};

// Seed a SIGNED active run, then TAMPER one signed field (without re-signing) so
// the HMAC no longer verifies → findActiveSentinelState returns CORRUPT_SENTINEL.
// If signing is inactive in this env (no HMAC key) the state cannot be made
// "corrupt" by tampering, so such checks are skipped rather than false-passing.
function seedCorrupt(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const p = path.join(docDir, 'sentinel-state.json');
  writeSignedState(p, Object.assign({
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-19T12:00:00.000Z' }, null, 2)
  );
  // Determine whether the just-written state actually carries a verifiable signature.
  const { verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');
  const written = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = verifyState(written, { key: readHmacKey() });
  const signingActive = !(v.unsigned || v.key_unavailable);
  // Tamper a signed field so verification fails (only meaningful if signing active).
  written.run_id = 'TAMPERED';
  fs.writeFileSync(p, JSON.stringify(written));
  return { docDir, signingActive };
}

function seedNull(root) {
  // No sentinel-state at all (absent ≠ corrupt). Just an empty .pipeline dir.
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true });
  return root;
}

function run(file, payload, env) {
  return spawnSync(process.execPath, [file], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

// Build the payload that a given gate governs. For the two Agent-spawn gates we
// spawn the governed/ungoverned subagent; for dispatch-pending we use a work tool
// (Edit a production file) vs a resolution Agent spawn.
function buildPayload(gateName, governed, root) {
  if (gateName === 'dispatch-pending-gate') {
    if (governed) {
      return { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src', 'prod.cjs') }, cwd: root };
    }
    // resolution Agent (carries a resolution marker) — always allowed
    return { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:pipeline-controller', prompt: 'DISPATCH_RESULTS\nok' }, cwd: root };
  }
  const cfg = GATES[gateName];
  const leaf = governed ? cfg.governedAgent : cfg.ungovernedAgent;
  return { tool_name: 'Agent', tool_input: { subagent_type: leaf }, cwd: root };
}

function permissionDecision(r) {
  const out = JSON.parse(r.stdout || '{}');
  return out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision;
}
function permissionReason(r) {
  const out = JSON.parse(r.stdout || '{}');
  return (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecisionReason) || '';
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failclosed-f4-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== F4 v8.8.0 — B2 governed gates fail CLOSED on corrupt state (RED: NEW fail, GUARD pass) ===');

// ---- B2-MAIN [NEW] corrupt + governed (deny mode) → deny + /CORRUPT/ ---------
for (const gateName of ['step-ledger-gate', 'gate-log-gate', 'dispatch-pending-gate']) {
  liveTest(`B2-MAIN [NEW] ${gateName}: corrupt signed state + governed action (deny) → deny + reason /CORRUPT/`, (root) => {
    const cfg = GATES[gateName];
    const { docDir, signingActive } = seedCorrupt(root, cfg.seedExtra);
    if (!signingActive) { console.log('         (signing inactive in env — skipped, cannot forge a corrupt signature)'); return; }
    const payload = buildPayload(gateName, /* governed */ true, root);
    const r = run(cfg.file, payload, { PIPELINE_DOC_PATH: docDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      permissionDecision(r), 'deny',
      r.stdout || '(empty stdout — corrupt state FAILED OPEN; expected fail-closed deny)'
    );
    assert.match(permissionReason(r), /CORRUPT/, 'deny reason must name the corrupt state');
  });
}

// ---- B2-REG-1 [GUARD] null/absent state + governed → allow ------------------
for (const gateName of ['step-ledger-gate', 'gate-log-gate', 'dispatch-pending-gate']) {
  liveTest(`B2-REG-1 [GUARD] ${gateName}: absent state + governed action → allow (absent ≠ corrupt, no freeze)`, (root) => {
    seedNull(root);
    const cfg = GATES[gateName];
    const payload = buildPayload(gateName, true, root);
    const r = run(cfg.file, payload, {}); // no PIPELINE_DOC_PATH; nothing on disk
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout || '').trim(), '', 'absent state must stay fail-open (allow)');
  });
}

// ---- B2-REG-2 [GUARD] corrupt + warn escape → allow ------------------------
for (const gateName of ['step-ledger-gate', 'gate-log-gate', 'dispatch-pending-gate']) {
  liveTest(`B2-REG-2 [GUARD] ${gateName}: corrupt state + warn escape → allow (warn overrides fail-closed)`, (root) => {
    const cfg = GATES[gateName];
    const { docDir, signingActive } = seedCorrupt(root, cfg.seedExtra);
    if (!signingActive) { console.log('         (signing inactive — skipped)'); return; }
    const payload = buildPayload(gateName, true, root);
    const r = run(cfg.file, payload, Object.assign({ PIPELINE_DOC_PATH: docDir }, cfg.warnEnv));
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout || '').trim(), '', 'warn escape must relax even the corrupt-state branch');
  });
}

// ---- B2-EDGE-1 [GUARD] corrupt + ungoverned → allow (no deadlock) -----------
for (const gateName of ['step-ledger-gate', 'gate-log-gate', 'dispatch-pending-gate']) {
  liveTest(`B2-EDGE-1 [GUARD] ${gateName}: corrupt state + ungoverned action → allow (never deadlocks ungoverned)`, (root) => {
    const cfg = GATES[gateName];
    const { docDir, signingActive } = seedCorrupt(root, cfg.seedExtra);
    if (!signingActive) { console.log('         (signing inactive — skipped)'); return; }
    const payload = buildPayload(gateName, /* governed */ false, root);
    const r = run(cfg.file, payload, { PIPELINE_DOC_PATH: docDir });
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout || '').trim(), '', 'ungoverned action must not be blocked even on corrupt state');
  });
}

// ---- B2-EDGE-2 [GUARD] batch-review-gate parity (already fixed) -------------
liveTest('B2-EDGE-2 [GUARD] batch-review-gate: corrupt state + governed spawn → deny (parity maintained, no regression)', (root) => {
  // Seed a run with the batch counters so the governed branch is live, then tamper.
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const p = path.join(docDir, 'sentinel-state.json');
  writeSignedState(p, {
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    batch_checkpoints_done: 1, batch_reviews_done: 0,
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-19T12:00:00.000Z' }, null, 2)
  );
  const { verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');
  const written = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = verifyState(written, { key: readHmacKey() });
  if (v.unsigned || v.key_unavailable) { console.log('         (signing inactive — skipped)'); return; }
  written.batch_reviews_done = 999; // forge to try to satisfy the gate
  fs.writeFileSync(p, JSON.stringify(written));
  const r = run(GATE_BATCH_REVIEW,
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root },
    { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'deny', PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(permissionDecision(r), 'deny', r.stdout || '(batch-review parity regressed — corrupt state failed open!)');
  assert.match(permissionReason(r), /CORRUPT/);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED for [NEW]; [GUARD] should NOT appear here):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
