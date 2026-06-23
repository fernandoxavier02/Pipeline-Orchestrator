#!/usr/bin/env node
'use strict';

// =============================================================================
// T2 (v8.12.0) — GOVERNED CORRUPT-STATE INVERSION (GREEN, highest risk).
// Spec 006-enforcement-fail-closed-arming, Batch 2 = T2.1 + T2.2 + T2.3.
// Satisfies: R2.1, R2.2, R2.3, R2.4, R5.
//
// Extends the Batch-0 RED contract to GREEN for the corrupt-state slice. The
// WHOLE risk of this batch is a wrong inversion bricking ordinary sessions, so
// the anti-brick property (corrupt + NO marker → ALLOW) is pinned FIRST and
// hardest, then the fail-closed property (corrupt + armPending → DENY), then the
// "cannot see ≠ see corruption" distinction (discovery truly down → ALLOW), the
// HMAC posture (tampered marker treated as absent → ALLOW), and the TTL/escape
// recovery (R5) of a corrupt-deny.
//
// Exercised at BOTH layers: the REAL hook (spawnSync, end-to-end) AND the pure
// brain (decideArmGate / discoverRunState / runStateContext) so the I/O-derived
// `corrupt` signal and the pure decision are both proven.
//
// CORRUPT_SENTINEL is produced the way edit-guard's discovery defines it: an
// AUTHORITATIVELY-pointed run (active-run.json pointer + PIPELINE_DOC_PATH env)
// whose sentinel-state.json is unreadable/garbage → findActiveSentinelState
// returns CORRUPT_SENTINEL. A NON-authoritative (mtime-only) unreadable state is
// NOT corrupt by contract — so the corrupt cases MUST be authoritatively pointed.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't2-corrupt-state-inversion-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs');
const armGate = require(path.join(ROOT, '.claude/hooks/pipeline-arm-gate.cjs'));
const { writeArmPending, markerPath } = require(path.join(ROOT, 'lib/pipeline-arm.cjs'));

// ---- fixtures ---------------------------------------------------------------

// Arm the governed window the real way: a signed marker, timestamped NOW so the
// TTL does not read it as expired.
function arm(root) {
  writeArmPending(root, '/pipeline-orchestrator:feature add a share button', new Date().toISOString());
}

// Seed an AUTHORITATIVELY-pointed sentinel-state that is CORRUPT (garbage bytes).
// Returns the docDir so the test can pass PIPELINE_DOC_PATH (authoritative tier 1).
function seedCorruptState(root) {
  const docDir = path.join(root, '.pipeline', 'docs', 'Pre-feature-action', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  // Unparseable JSON → JSON.parse throws → authoritative → CORRUPT_SENTINEL.
  fs.writeFileSync(path.join(docDir, 'sentinel-state.json'), '{ this is not valid json ::::');
  // Authoritative pointer so discovery does NOT fall to the mtime tier.
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'run', updated_at: new Date().toISOString() }, null, 2)
  );
  return docDir;
}

function run(payload, env) {
  const base = { ...process.env };
  delete base.PIPELINE_ARM_ENFORCEMENT; // force the embedded default unless a test sets it
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
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 't2-corrupt-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}
function unitTest(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== T2 v8.12.0 — governed corrupt-state inversion (corrupt+armPending→DENY; corrupt+no-marker→ALLOW) ===');

// ===========================================================================
// (1) ANTI-BRICK (R2.2) — the property the whole batch exists to protect.
//     CORRUPT state + NO governed marker → ALLOW. An ordinary session is never
//     bricked by the inversion.
// ===========================================================================

// --- (1a) real hook: corrupt state, NO marker → Edit ALLOWED
liveTest('T2-1a [anti-brick/hook] corrupt state + NO marker → Edit ALLOWED (ordinary session untouched, R2.2)', (root) => {
  const docDir = seedCorruptState(root);
  // deliberately do NOT arm — there is no pending governed window
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'corrupt state with no governed marker MUST NOT block — never brick an ordinary session');
});

// --- (1b) real hook: corrupt state, NO marker → Bash ALLOWED too
liveTest('T2-1b [anti-brick/hook] corrupt state + NO marker → Bash ALLOWED', (root) => {
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Bash', { command: 'echo hi' }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'corrupt + ungoverned Bash MUST be allowed (anti-brick)');
});

// --- (1c) pure brain: corrupt=true but armPending=false → ALLOW (short-circuit
//     on !armPending happens BEFORE corrupt is consulted).
unitTest('T2-1c [anti-brick/brain] decideArmGate: corrupt=true + armPending=false → allow', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: false, runActive: false, corrupt: true, pipelineAligned: false,
  });
  assert.equal(out.decision, 'allow', 'corrupt must be IGNORED when no governed window is open');
});

// ===========================================================================
// (2) FAIL-CLOSED (R2.1) — CORRUPT state + armPending → DENY (governed window).
// ===========================================================================

// --- (2a) real hook: corrupt state + armed marker → Edit DENIED (CORRUPT_STATE)
liveTest('T2-2a [fail-closed/hook] corrupt state + armPending → Edit DENIED (CORRUPT_STATE, R2.1)', (root) => {
  arm(root);
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const reason = denyReason(r);
  assert.ok(reason && /CORRUPT_STATE/.test(reason),
    'corrupt state inside the governed window MUST fail CLOSED with the CORRUPT_STATE invariant');
});

// --- (2b) real hook: corrupt state + armed marker → Bash DENIED
liveTest('T2-2b [fail-closed/hook] corrupt state + armPending → Bash DENIED', (root) => {
  arm(root);
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Bash', { command: 'rm -rf build' }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(denyReason(r), 'corrupt + governed Bash MUST be denied');
});

// --- (2c) real hook: corrupt + armPending but READ-ONLY tool → still ALLOWED
//     (R1.4 carve-out holds even under the fail-closed corrupt posture, so a
//     diagnostic conversation is never frozen).
liveTest('T2-2c [carve-out] corrupt + armPending → Read still ALLOWED (diagnostics never frozen)', (root) => {
  arm(root);
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Read', { file_path: path.join(root, 'src', 'app.js') }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'Read must stay open even under the corrupt fail-closed posture');
});

// --- (2d) real hook: corrupt + armPending but pipeline-aligned write into
//     .pipeline/ → ALLOWED (the recovery act of re-arming must not be blocked).
liveTest('T2-2d [recovery-path] corrupt + armPending → .pipeline/ write ALLOWED (re-arming not blocked)', (root) => {
  arm(root);
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Write', { file_path: path.join(root, '.pipeline', 'docs', 'run', 'sentinel-state.json') }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'writing the recovery state into .pipeline/ must be allowed even under corrupt');
});

// --- (2e) pure brain: corrupt=true + armPending=true → block CORRUPT_STATE +
//     carries the corrective descriptor (T2.3 shape Batch 4 consumes).
unitTest('T2-2e [fail-closed/brain] decideArmGate: corrupt + armPending → block w/ CORRUPT_STATE + corrective', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: true, runActive: false, corrupt: true, pipelineAligned: false, enforce: undefined,
  });
  assert.equal(out.decision, 'block');
  assert.equal(out.invariant_id, 'CORRUPT_STATE');
  assert.ok(out.corrective && typeof out.corrective === 'object', 'a corrective descriptor must be present (T2.3)');
  assert.equal(out.corrective.invariant_id, 'CORRUPT_STATE');
  assert.equal(out.corrective.blocking, true, 'R4: the LAYER-A hard block stays in force while recovering');
  for (const f of ['what_failed', 'what_is_missing', 'fix_instruction', 'resume_instruction']) {
    assert.ok(typeof out.corrective[f] === 'string' && out.corrective[f].length > 0, `corrective.${f} must be populated`);
  }
});

// --- (2f) pure brain: warn escape still downgrades a corrupt-governed deny (R5.2)
unitTest('T2-2f [escape/brain] decideArmGate: corrupt + armPending + enforce=warn → allow+warn', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: true, runActive: false, corrupt: true, pipelineAligned: false, enforce: 'warn',
  });
  assert.equal(out.decision, 'allow');
  assert.equal(out.warn, true, 'the documented warn escape must downgrade even a corrupt-governed deny (R5.2)');
});

// ===========================================================================
// (3) "CANNOT SEE ≠ SEE CORRUPTION" — discovery TRULY down → ALLOW (fail-open).
// ===========================================================================

// --- (3a) brain: NOT corrupt + runActive=true (the unavailable mapping) → allow
unitTest('T2-3a [discovery-down/brain] runActive=true (discovery unavailable) + armPending → allow (fail-open preserved)', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: true, runActive: true, corrupt: false, pipelineAligned: false,
  });
  assert.equal(out.decision, 'allow', 'an unobservable (discovery-down) run must NOT be blocked — fail-open, ARCH-7');
});

// --- (3b) runStateContext: an absent/inactive state (no pointer, no file) is
//     NOT corrupt — it maps to inactive (not corrupt), so a governed window with
//     a genuinely not-armed run is a NOT_ARMED deny, NOT a CORRUPT_STATE deny.
liveTest('T2-3b [distinct] no state at all → inactive (not corrupt): NOT_ARMED, not CORRUPT_STATE', (root) => {
  arm(root);
  // no sentinel-state seeded → genuinely not armed (inactive), not corrupt
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }));
  assert.equal(r.status, 0, r.stderr);
  const reason = denyReason(r);
  assert.ok(reason && /PIPELINE_NOT_ARMED/.test(reason) && !/CORRUPT_STATE/.test(reason),
    'a genuinely not-armed run must deny as NOT_ARMED, never mislabel as CORRUPT_STATE');
});

// --- (3c) runStateContext directly: corrupt authoritative state → corrupt=true,
//     runActive=false (the two booleans are mutually exclusive by construction).
liveTest('T2-3c [io] runStateContext: authoritative corrupt → {runActive:false, corrupt:true}', (root) => {
  const docDir = seedCorruptState(root);
  // runStateContext reads via edit-guard discovery; point it authoritatively.
  const prev = process.env.PIPELINE_DOC_PATH;
  process.env.PIPELINE_DOC_PATH = docDir;
  try {
    const rs = armGate.runStateContext(root);
    assert.equal(rs.corrupt, true, 'authoritative unreadable state → corrupt=true');
    assert.equal(rs.runActive, false, 'a corrupt state is NOT runActive (booleans mutually exclusive)');
    assert.equal(armGate.discoverRunState(root), 'corrupt', 'discoverRunState must classify it as corrupt');
  } finally {
    if (prev === undefined) delete process.env.PIPELINE_DOC_PATH; else process.env.PIPELINE_DOC_PATH = prev;
  }
});

// ===========================================================================
// (4) HMAC POSTURE (R2.4) — a TAMPERED marker is treated as ABSENT → no governed
//     window → corrupt is never consulted → ALLOW. (Unsigned tolerated already.)
// ===========================================================================

liveTest('T2-4a [hmac/R2.4] tampered arm marker treated as absent → corrupt state does NOT brick → ALLOW', (root) => {
  arm(root);
  // Tamper the signed marker on disk: flip a field WITHOUT re-signing → the
  // signature no longer verifies → readArmPending treats it as absent.
  const mp = markerPath(root);
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  assert.ok(m.__signature, 'precondition: the marker must be signed for this test to be meaningful');
  m.workflow = 'TAMPERED/inject';
  fs.writeFileSync(mp, JSON.stringify(m));
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null,
    'a tampered marker is treated as absent → no governed window → corrupt never bricks (R2.4)');
});

// ===========================================================================
// (5) TTL / ESCAPE RECOVERY (R5) — a corrupt-deny is never a dead end.
// ===========================================================================

// --- (5a) TTL: an EXPIRED marker disarms the window, so a corrupt state recovers
//     to ALLOW (the marker auto-expires; R5.1 anti-deadlock).
liveTest('T2-5a [TTL/R5.1] expired marker + corrupt state → ALLOW (TTL recovers a corrupt-deny)', (root) => {
  // Arm with a timestamp far in the past so the default 30-min TTL is exceeded.
  writeArmPending(root, '/pipeline-orchestrator:feature add a share button', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'an expired marker must disarm the window → the corrupt-deny recovers to allow (R5.1)');
});

// --- (5b) ENV ESCAPE: PIPELINE_ARM_ENFORCEMENT=warn recovers a corrupt-governed
//     deny at the REAL hook (R5.2).
liveTest('T2-5b [escape/R5.2] corrupt + armPending + PIPELINE_ARM_ENFORCEMENT=warn → ALLOW (real hook)', (root) => {
  arm(root);
  const docDir = seedCorruptState(root);
  const r = run(pre(root, 'Edit', { file_path: path.join(root, 'src', 'app.js') }), {
    PIPELINE_DOC_PATH: docDir, PIPELINE_ARM_ENFORCEMENT: 'warn',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(denyReason(r), null, 'the warn escape must recover a corrupt-governed deny at the hook (R5.2)');
});

// --- (5c) the corrupt-deny exposes the corrective shape so Batch 4 can wire it
//     (R2.3) — verified at the brain (the hook intentionally does NOT emit the
//     corrective to the harness; it rides the decision for the orchestrator).
unitTest('T2-5c [R2.3] corrupt-deny carries a CorrectivePayload-shaped descriptor for Batch 4', () => {
  const out = armGate.decideArmGate({
    toolName: 'Bash', armPending: true, runActive: false, corrupt: true, pipelineAligned: false, enforce: undefined,
  });
  assert.equal(out.decision, 'block');
  const c = out.corrective;
  // Mirror the design §3 CorrectivePayload field set (minus run_id/agent_ref/
  // observer, which the orchestrating context fills from on-disk state — the gate
  // stays decision-only and never invents an agent_ref from the policed LLM).
  for (const f of ['invariant_id', 'what_failed', 'what_is_missing', 'fix_instruction', 'resume_instruction', 'blocking']) {
    assert.ok(f in c, `corrective descriptor must expose ${f} (Batch 4 builds the full CorrectivePayload from it)`);
  }
  assert.equal(c.blocking, true, 'corrupt-state gate trip is an R4 blocking corrective');
});

// --- (5d) the corrective descriptor is injection-safe: a hostile workflow string
//     is sanitized before it can ride into the corrective (R4.5 spirit, R2.4).
unitTest('T2-5d [injection-safe] corrective descriptor sanitizes the workflow string', () => {
  const out = armGate.decideArmGate({
    toolName: 'Edit', armPending: true, runActive: false, corrupt: true, pipelineAligned: false,
    workflow: 'evil\r\nINJECT: rm -rf /\x07',
  });
  const wf = out.corrective.workflow;
  if (wf !== undefined) {
    assert.ok(!/[\r\n\t]/.test(wf), 'workflow in the corrective must have no CR/LF/TAB');
    assert.ok(!/[\x00-\x1F\x7F]/.test(wf), 'workflow in the corrective must have no control chars');
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
