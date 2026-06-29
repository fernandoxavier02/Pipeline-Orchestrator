#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.19.0) — Enforcer: govern the spec-controller's SubagentStop
// (REQ-B2/B3/B4 + HIGH-1). Spawns the real .claude/hooks/subagent-stop-commit-hook.cjs
// with a SubagentStop payload on stdin (same harness style as the v8.11.0 B-tests).
//
// EXPECTED RED (before T2.2): spec-controller is ungoverned (Spec spine is null →
//   stepForAgentType returns null), and the inactive early-return allows a just-sealed
//   spec controller through. So a prose-only close is ALLOWED (want block), the cap
//   never converts to hard_failed (want hard_failed), and the post-seal inactive case
//   is bypassed (want block).
// EXPECTED GREEN (after T1.2 + T2.2): resolveWorkflowKey reads spec_authoring_progress
//   → 'Spec', the existing armed flow governs spec-controller identically to a FULL
//   leaf, and the narrowed inactive guard no longer bypasses the governed terminal leaf.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f2-subagent-stop-spec-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/subagent-stop-commit-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

const VALID_BLOCK = [
  '=== PIPELINE_AGENT_RESULT_V1 ===',
  JSON.stringify({ status: 'completed', summary: 'SPEC AUTHORING COMPLETE — run sealed', metrics: { requirements: 3 }, next_agent: '' }),
  '=== END PIPELINE_AGENT_RESULT_V1 ===',
].join('\n');
const PROSE_ONLY = 'SPEC AUTHORING COMPLETE. Voice scorecard: 3 requirements, 2 decisions, 1 finding fixed. STOP.';

// Seed a run dir + signed sentinel-state + active-run pointer. `tamper` rewrites the
// on-disk JSON after signing so the signature no longer verifies (→ CORRUPT_SENTINEL).
function seedRun(root, extra, tamper) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'rspec', pipeline_active: true, pipeline_doc_path: docDir,
    state_version: 1, current_phase: '9-seal', pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'rspec', updated_at: '2026-06-29T00:00:00.000Z' }, null, 2));
  if (tamper) {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    raw.current_phase = 'tampered-after-signing';
    fs.writeFileSync(statePath, JSON.stringify(raw, null, 2));
  }
  return { docDir, statePath };
}

function run(payload, env) {
  const base = { ...process.env }; delete base.PIPELINE_SUBAGENTSTOP_ENFORCEMENT;
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function payload(root, agentType, lastMsg) {
  return { hook_event_name: 'SubagentStop', agent_type: agentType, agent_id: `id-${agentType}`, last_assistant_message: lastMsg, cwd: root };
}
function decisionOf(r) { try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; } }
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

// A spec run signal: spec_authoring_progress present, NO `workflow`, NO `type`.
const SPEC = { spec_authoring_progress: { intake: 'done', requirements: 'done' } };

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-substop-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F2 v8.19.0 — SubagentStop governs the spec-controller ===');

// ---- F2-S1: active spec run + valid block → allow ---------------------------
liveTest('F2-S1 [allow] a spec-controller finishing on a valid PIPELINE_AGENT_RESULT_V1 block is allowed', (root) => {
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', VALID_BLOCK), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a valid terminal block must be allowed');
});

// ---- F2-S2: active spec run + prose only + armed → block (RED today) ---------
liveTest('F2-S2 [block-armed] a prose-only close is rejected (armed default)', (root) => {
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'a prose-only spec-controller close must be BLOCKED when armed (RED today: ungoverned → allow)');
});

// ---- F2-S3: active spec run + prose only + warn → allow + breadcrumb ---------
liveTest('F2-S3 [warn] the warn escape reverts the spec-controller to observe-only (allow)', (root) => {
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir, PIPELINE_SUBAGENTSTOP_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'the warn escape must not block (REQ-B4)');
});

// ---- F2-S4: 3 corrections → hard_failed terminal, never a 4th block ----------
liveTest('F2-S4 [cap] at the 3-correction cap the gate writes hard_failed and ALLOWS (no 4th block)', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({
    pipeline_active: true, subagent_corrections: { 'rspec::spec-controller': 3 },
  }, SPEC));
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'at the cap the gate must not block a 4th time');
  assert.equal((readState(statePath) || {}).terminal_state, 'hard_failed', 'the cap converts to an honest hard_failed terminal (RED today: never reached)');
});

// ---- F2-S5: corrupt signed state → deny(armed) / allow(warn) ----------------
liveTest('F2-S5 [corrupt-armed] a corrupt signed spec state is denied (armed)', (root) => {
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC), /* tamper */ true);
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'corrupt signed state on a governed close must deny when armed (fail-closed)');
});
liveTest('F2-S5b [corrupt-warn] the warn escape lets a corrupt-state close through', (root) => {
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC), /* tamper */ true);
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir, PIPELINE_SUBAGENTSTOP_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'warn disarms even the corrupt-state deny');
});

// ---- F2-S6: bare type:'Spec' (NO progress) is NOT auto-resolved to Spec (REQ-B3) -
liveTest('F2-S6 [REQ-B3] a bare type:"Spec" state with NO spec_authoring_progress is NOT resolved to Spec', (root) => {
  // No spec_authoring_progress, no workflow — only a seal-time-style type flag. The
  // resolver must NOT treat this as Spec, so spec-controller stays ungoverned → allow
  // even on a prose-only close (proves resolution is not the seal-time type flag).
  const { docDir } = seedRun(root, { pipeline_active: true, type: 'Spec' });
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a bare type:Spec (no progress) must NOT be governed as Spec (REQ-B3)');
});

// ---- F2-S7: post-seal inactive (HIGH-1) → armed block (RED today) ------------
liveTest('F2-S7 [HIGH-1] a sealed-but-inactive spec run with a missing block is BLOCKED when armed', (root) => {
  // sealSpecRun sets pipeline_active:false + final_decision:'SEALED' BEFORE the controller
  // emits its terminal block. The old inactive early-return would bypass the result check
  // exactly for the governed spec leaf — the narrowed guard must still block.
  const { docDir } = seedRun(root, Object.assign({ pipeline_active: false, final_decision: 'SEALED' }, SPEC));
  const r = run(payload(root, 'spec-controller', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'the inactive early-return must NOT bypass the governed terminal leaf (RED today: inactive → allow)');
});

// ---- F2-S8: a FULL leaf finishing on an inactive run → unchanged allow -------
liveTest('F2-S8 [FULL-unchanged] a FULL governed leaf on an inactive run with a valid block is unchanged → allow', (root) => {
  const { docDir } = seedRun(root, { pipeline_active: false, workflow: 'FULL' });
  const r = run(payload(root, 'final-validator', VALID_BLOCK), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'the narrowing must not newly block a FULL leaf that did its job');
});
liveTest('F2-S8b [non-governed-unchanged] a non-spine agent on an inactive run still allowed (inactivity exemption preserved)', (root) => {
  const { docDir } = seedRun(root, { pipeline_active: false, workflow: 'FULL' });
  const r = run(payload(root, 'general-purpose', PROSE_ONLY), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a non-governed agent on an inactive run must remain allowed');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
