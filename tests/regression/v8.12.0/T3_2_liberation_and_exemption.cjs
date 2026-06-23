#!/usr/bin/env node
'use strict';

// =============================================================================
// T3.2 + T3.3 (v8.12.0) — LIBERATION ON THE REAL ACT + pipeline-runs/ EXEMPTION.
// Spec 006-enforcement-fail-closed-arming, Batch 3. Satisfies: R3.2, R3.3, R3.4,
// R6.1, NFR4, R-MED containment, F4 cross-platform.
//
// T3.2 — the gate RELEASES (allow) when the REAL ACT of starting the run occurs:
//   (a) a real pipeline-orchestrator: Agent is dispatched (isPipelineTarget), OR
//   (b) a governed write lands in .pipeline/ OR pipeline-runs/ (R6), OR
//   (c) a signed pipeline_active:true state exists (runActive).
//   Crucially (a)/(b) MUST NOT require the policed LLM to have authored a
//   run-active file. Releasing on a forged/absent LLM run-active file ALONE is
//   NOT sufficient — a non-aligned Edit while armed and NOT runActive still DENIES.
//   R3.4 no-double-gating: an already-armed+active run allows (own gates take over).
//
// T3.3 — a write inside pipeline-runs/<run>/ is pipeline-aligned (parity with
//   .pipeline/), CONTAINED to the resolved project tree (out-of-tree pipeline-runs
//   does NOT exempt), matching BOTH path separators (\\ and /) for F4.
//
// Exercised at the REAL hook (spawnSync) and the pure predicates
// (isPipelineTarget / isPipelineDocWrite) so both the wiring and the brain hold.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't3-2-liberation-exemption-stable-secret-0123456789';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs');
const armGate = require(path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs'));
const { writeArmPending } = require(path.join(ROOT, 'lib/pipeline-arm.cjs'));

function arm(root) {
  writeArmPending(root, '/pipeline-orchestrator:feature add a share button', new Date().toISOString());
}
function run(payload, env) {
  const base = { ...process.env };
  delete base.PIPELINE_ARM_ENFORCEMENT;
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) },
  });
}
function pre(root, toolName, toolInput) {
  return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput || {}, cwd: root };
}
function denyReason(r) {
  try {
    const o = JSON.parse(r.stdout || '{}');
    return o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision === 'deny'
      ? o.hookSpecificOutput.permissionDecisionReason : null;
  } catch { return null; }
}

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3-2-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}
function unitTest(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== T3.2+T3.3 v8.12.0 — liberation on the REAL ACT + pipeline-runs/ exemption ===');

// ===========================================================================
// T3.2 — LIBERATION on the REAL ACT (not on a forged/absent LLM run-active file)
// ===========================================================================

// --- (a) release on a REAL pipeline-orchestrator: Agent dispatch (R3.3) --------
liveTest('T3.2-a [release/dispatch] armed + dispatch pipeline-orchestrator: Agent → ALLOWED', (root) => {
  arm(root);
  const r = run(pre(root, 'Agent', { subagent_type: 'pipeline-orchestrator:core:pipeline-controller' }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'dispatching a real pipeline agent IS the act of starting the run → release');
});

// --- (a.2) a NON-pipeline Agent dispatch is NOT the act → still DENIES ----------
liveTest('T3.2-a2 [release/dispatch] armed + dispatch a GENERIC (non-pipeline) Agent → still DENIED', (root) => {
  arm(root);
  const r = run(pre(root, 'Agent', { subagent_type: 'general-purpose' }));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(denyReason(r), 'a generic agent dispatch is NOT starting the governed run → must stay blocked');
});

// --- (b) release on a governed write into .pipeline/ (R3.3) ---------------------
liveTest('T3.2-b [release/write] armed + governed Write into .pipeline/ → ALLOWED', (root) => {
  arm(root);
  const r = run(pre(root, 'Write', { file_path: path.join(root, '.pipeline', 'active-run.json') }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'a governed write into .pipeline/ IS the act of arming → release');
});

// --- (b.2) release on a governed write into pipeline-runs/ (R6, the NEW parity) -
liveTest('T3.2-b2 [release/write] armed + governed Write into pipeline-runs/<run>/ → ALLOWED', (root) => {
  arm(root);
  const r = run(pre(root, 'Write', { file_path: path.join(root, 'pipeline-runs', '006-spec', '01-spec', 'requirements.md') }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'a governed write into pipeline-runs/ must be pipeline-aligned at parity with .pipeline/ (R6.1)');
});

// --- (c) NOT released by a forged/absent LLM-authored run-active file ALONE -----
//     Armed window, NO runActive, a non-aligned Edit → DENIES. The ONLY way a
//     forged run-active could release is if the gate trusted an LLM-written file;
//     it must not — release requires the REAL act (a/b) or an OBSERVED signed
//     active state, neither of which a bare Edit provides.
liveTest('T3.2-c [forgery] armed + non-aligned Edit (no real act) → DENIED (forged run-active not enough)', (root) => {
  arm(root);
  // Plant a forged, UNSIGNED-but-pipeline_active run-active file the way a policed
  // LLM might — it must NOT, by itself, release the gate, because discovery only
  // honours an AUTHORITATIVELY-pointed + (in strict) signed state, and a bare Edit
  // is not pipeline-aligned.
  fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true });
  fs.writeFileSync(path.join(root, '.pipeline', 'forged-run-active.json'),
    JSON.stringify({ pipeline_active: true }));
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(denyReason(r), 'a forged LLM-authored run-active file ALONE must NOT release the gate (R3.2/R3.3)');
});

// --- (c.2) DATA-1: forged but SIGNED state denies by HMAC REJECTION (R2.4) -------
//     T3.2-c above proves deny by ABSENCE (an unsigned, NON-authoritatively-pointed
//     forged file is never discovered). This sub-test proves the STRONGER property:
//     a forged sentinel-state that IS signed — but whose signature was produced under
//     the WRONG key, so it will NOT verify against the real HMAC key — is treated as
//     CORRUPT (HMAC rejection), NOT as an active run. Inside the governed window
//     (armed && !runActive) that corrupt state fails CLOSED, so a non-pipeline Edit is
//     STILL DENIED. This locks the forged-run-active non-release property by REJECTION,
//     not merely by absence. We make the state AUTHORITATIVELY pointed (active-run.json)
//     so discovery verifies its signature (the path the SEC-1 verify-on-read guards).
liveTest('T3.2-c2 [forgery/HMAC] armed + AUTHORITATIVE state signed under WRONG key → DENIED by REJECTION (R2.4)', (root) => {
  arm(root);
  const signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));
  // Sign a pipeline_active:true state under an ATTACKER key (≠ the real test key set in
  // PIPELINE_HMAC_SECRET). verifyState against the real key → valid:false (not unsigned,
  // not key_unavailable) → findActiveSentinelState returns CORRUPT_SENTINEL.
  const attackerKey = 'attacker-forged-key-that-will-not-verify-9876543210';
  const forged = signer.signState({ pipeline_active: true, run_id: 'forged' }, attackerKey);
  assert.ok(forged && forged[signer.SIGNATURE_FIELD], 'precondition: the forged state must carry a signature');

  // Author it as the run's REAL sentinel-state and point to it authoritatively so
  // discovery treats the on-disk signature as load-bearing (not the mtime fallback).
  const runDir = path.join(root, '.pipeline', 'docs', 'Pre-feature-action', 'forged-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(forged, null, 2));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: runDir }));

  // Sanity: the real verifier (with the REAL key) must REJECT the forged signature.
  const v = signer.verifyState(forged, { key: process.env.PIPELINE_HMAC_SECRET });
  assert.equal(v.valid, false, 'precondition: forged signature must NOT verify under the real key');
  assert.ok(!v.unsigned && !v.key_unavailable, 'precondition: rejection is a real signature MISMATCH (not unsigned / no-key)');

  // The gate must DENY the non-pipeline Edit: the tampered signed state is corrupt →
  // treated as NOT active → governed window fails CLOSED (R2.4). A forged signed
  // run-active does NOT release the gate.
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(denyReason(r), 'a forged SIGNED state that fails HMAC verification must be rejected → Edit STILL denied (R2.4)');
});

// --- (d) R3.4 no-double-gating: already armed + active → ALLOW (own gates) ------
unitTest('T3.2-d [no-double-gating/R3.4] decideArmGate: armPending && runActive → allow', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: true, runActive: true, corrupt: false, pipelineAligned: false,
  });
  assert.equal(out.decision, 'allow', 'an already-armed+active run allows — the run\'s own gates take over');
});

// --- (e) pure predicate: isPipelineTarget recognizes the pipeline namespace -----
unitTest('T3.2-e [brain] isPipelineTarget true for pipeline-orchestrator: Agent, false for generic', () => {
  assert.equal(armGate.isPipelineTarget({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:x' } }), true);
  assert.equal(armGate.isPipelineTarget({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose' } }), false);
  assert.equal(armGate.isPipelineTarget({ tool_name: 'Skill', tool_input: { skill: 'pipeline-orchestrator:pipeline' } }), true);
});

// ===========================================================================
// T3.3 — pipeline-runs/ exemption parity + project-tree containment + F4
// ===========================================================================

// --- (1) in-tree pipeline-runs/ write → pipeline-aligned (forward slash) --------
unitTest('T3.3-1 [exempt/brain] isPipelineDocWrite true for in-tree pipeline-runs/ (forward slash)', () => {
  const dir = '/proj/root';
  const ok = armGate.isPipelineDocWrite(
    { tool_input: { file_path: '/proj/root/pipeline-runs/006-spec/01-spec/requirements.md' } }, dir);
  assert.equal(ok, true, 'a path inside pipeline-runs/ must be pipeline-aligned (R6.1)');
});

// --- (2) in-tree pipeline-runs/ write → pipeline-aligned (BACKslash, F4) ---------
unitTest('T3.3-2 [exempt/brain/F4] isPipelineDocWrite true for in-tree pipeline-runs/ (backslash)', () => {
  const dir = 'C:\\proj\\root';
  const ok = armGate.isPipelineDocWrite(
    { tool_input: { file_path: 'C:\\proj\\root\\pipeline-runs\\006-spec\\01-spec\\requirements.md' } }, dir);
  assert.equal(ok, true, 'F4: the exemption must match the BACKslash separator too (cross-platform)');
});

// --- (3) CONTAINMENT: an OUT-OF-TREE pipeline-runs/ does NOT exempt (R-MED) ------
//     The fallback regex alone would match ANY "pipeline-runs" segment; the
//     containment guard must reject a pipeline-runs that is NOT inside the
//     resolved project tree, so an attacker cannot escape via a sibling path.
unitTest('T3.3-3 [containment] out-of-tree pipeline-runs/ is NOT exempt (R-MED, no escape)', () => {
  const dir = '/proj/root';
  const ok = armGate.isPipelineDocWrite(
    { tool_input: { file_path: '/somewhere/else/pipeline-runs/x/evil.js' } }, dir);
  assert.equal(ok, false, 'an OUT-OF-TREE pipeline-runs path must NOT be treated as pipeline-aligned (containment)');
});

// --- (4) a plain source path is NOT exempt --------------------------------------
unitTest('T3.3-4 [negative] a normal source file is NOT pipeline-aligned', () => {
  const dir = '/proj/root';
  assert.equal(armGate.isPipelineDocWrite({ tool_input: { file_path: '/proj/root/src/app.js' } }, dir), false);
  assert.equal(armGate.isPipelineDocWrite({ tool_input: { file_path: '/proj/root/src/pipeline-runs-helper.js' } }, dir), false,
    'a filename that merely CONTAINS the substring must not exempt — only a real path segment');
});

// --- (5) real hook end-to-end: in-tree pipeline-runs/ write ALLOWED, out-of-tree DENIED
liveTest('T3.3-5 [hook] armed: in-tree pipeline-runs/ write ALLOWED; out-of-tree pipeline-runs DENIED', (root) => {
  arm(root);
  const inTree = run(pre(root, 'Write', { file_path: path.join(root, 'pipeline-runs', 'r1', 'design.md') }));
  assert.equal(denyReason(inTree), null, 'in-tree pipeline-runs/ write must be allowed');

  const outOfTree = run(pre(root, 'Write', { file_path: path.join(os.tmpdir(), 'attacker', 'pipeline-runs', 'x', 'evil.js') }));
  assert.ok(denyReason(outOfTree), 'an out-of-tree pipeline-runs/ write must be DENIED (containment, no escape)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
