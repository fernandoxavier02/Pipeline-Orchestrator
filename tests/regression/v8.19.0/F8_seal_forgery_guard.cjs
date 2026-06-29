#!/usr/bin/env node
'use strict';

// =============================================================================
// F8 (v8.19.0) — SEAL-FORGERY GUARD (defense-in-depth, closes the LOW residual).
//
// THREAT: hasSealEvidence used to return true if EITHER the signed sentinel's
//   final_decision === 'SEALED' OR the run's UNSIGNED manifest.yaml carried
//   `status: sealed`. The manifest is not signature-verified, so a forged
//   `status: sealed` line ALONE granted "seal evidence" — marking a run
//   terminal/sealed even when the authoritative sentinel did NOT say SEALED.
//
// FIX: seal AUTHORITY consolidates onto the sentinel `final_decision === 'SEALED'`
//   (the run's authoritative state). The unsigned manifest.yaml `status: sealed` is
//   NO LONGER an independent grant of seal evidence. Legit seals are unaffected —
//   lib/run-seal.cjs::sealSpecRun writes BOTH the sentinel final_decision SEALED
//   AND the manifest status sealed, so every real seal still passes via the
//   sentinel path.
//
// EXPECTED RED (current code): the manifest path still grants seal evidence, so
//   F8-S1 closes the spec run cleanly (allow + completed) and F8-S3 blocks the
//   forged terminal — the asserted contract below is the OPPOSITE of today.
// EXPECTED GREEN (after fix): manifest-only sealed is NOT seal evidence.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const STOP_HOOK = path.resolve(__dirname, '../../../.claude/hooks/stop-gate-hook.cjs');
const SUBAGENT_HOOK = path.resolve(__dirname, '../../../.claude/hooks/subagent-stop-commit-hook.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

process.env.PIPELINE_HMAC_SECRET = 'f8-seal-forgery-guard-stable-secret-0123456789abcdef';

// A spec run signal: spec_authoring_progress present, NO `workflow`.
const SPEC = { spec_authoring_progress: { intake: 'done', requirements: 'done' } };

// A GENUINE-looking seal close whose prose body carries a stray line-start
// `STATUS: AWAITING_*` and NO valid PIPELINE_AGENT_RESULT_V1 block.
const SEAL_PROSE_WITH_STRAY_AWAITING = [
  'SPEC AUTHORING COMPLETE. The controller has SEALED the run.',
  'Earlier this run we paused with:',
  'STATUS: AWAITING_GATE_RESPONSES',
  'but that handshake is long resolved. STOP.',
].join('\n');

// Seed a run dir + signed sentinel + active pointer. `manifestStatus` writes manifest.yaml.
function seedRun(root, extra, manifestStatus) {
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
  return { docDir, statePath };
}

function runStop(root, docDir, event, env) {
  const base = { ...process.env }; delete base.PIPELINE_STOP_BLOCK_ENFORCEMENT;
  return spawnSync(process.execPath, [STOP_HOOK], {
    input: JSON.stringify({ hook_event_name: event || 'Stop', cwd: root }),
    encoding: 'utf8', env: { ...base, PIPELINE_DOC_PATH: docDir, ...(env || {}) },
  });
}
function runSubagent(root, docDir, agentType, lastMsg, env) {
  const base = { ...process.env }; delete base.PIPELINE_SUBAGENTSTOP_ENFORCEMENT;
  return spawnSync(process.execPath, [SUBAGENT_HOOK], {
    input: JSON.stringify({ hook_event_name: 'SubagentStop', agent_type: agentType, agent_id: `id-${agentType}`, last_assistant_message: lastMsg, cwd: root }),
    encoding: 'utf8', env: { ...base, PIPELINE_DOC_PATH: docDir, ...(env || {}) },
  });
}
function decisionOf(r) { try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; } }
function terminalOf(p) { try { const s = JSON.parse(fs.readFileSync(p, 'utf8')); return s.terminal_state || s.status || null; } catch { return null; } }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f8-forgery-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F8 v8.19.0 — forged manifest status:sealed is NOT seal evidence ===');

// ---- F8-S1 [stop-gate forgery] manifest sealed + sentinel NOT sealed → BLOCK -----
liveTest('F8-S1 [stop-gate-forgery] a spec run with manifest status:sealed but sentinel NOT SEALED does NOT close cleanly (block, armed) and is NOT marked completed', (root) => {
  const { docDir, statePath } = seedRun(root, SPEC, /* manifestStatus */ 'sealed');
  const r = runStop(root, docDir, 'Stop');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'a forged manifest-only seal must NOT close a spec run cleanly (RED today: allowed)');
  assert.notEqual(terminalOf(statePath), 'completed', 'a forged manifest-only seal must NOT persist terminal_state=completed (RED today: completed)');
});

// ---- F8-S2 [stop-gate legit] sentinel SEALED (no manifest) → allow + completed ---
liveTest('F8-S2 [stop-gate-legit] a spec run with sentinel final_decision SEALED (no manifest) still closes cleanly and is marked completed', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ final_decision: 'SEALED' }, SPEC));
  const r = runStop(root, docDir, 'Stop');
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'an authentically-sealed spec run must still close cleanly (no regression)');
  assert.equal(terminalOf(statePath), 'completed', 'an authentically-sealed spec run must persist terminal_state=completed');
});

// ---- F8-S3 [subagent forgery] manifest sealed + sentinel NOT sealed + stray AWAITING → ALLOW (hoist) ----
liveTest('F8-S3 [subagent-forgery] a forged manifest-only seal is NOT treated as a sealed terminal: a stray-AWAITING stop is an intermediate hoist → ALLOWED', (root) => {
  const { docDir } = seedRun(root, SPEC, /* manifestStatus */ 'sealed');
  const r = runSubagent(root, docDir, 'spec-controller', SEAL_PROSE_WITH_STRAY_AWAITING);
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'manifest-only sealed must NOT promote a run to a governed sealed terminal (RED today: blocked via forged seal evidence)');
});

// ---- F8-S4 [subagent legit] sentinel SEALED + stray AWAITING + no block → BLOCK --
liveTest('F8-S4 [subagent-legit] an authentically-sealed terminal (sentinel SEALED) with a stray AWAITING line and NO valid block stays governed → BLOCK', (root) => {
  const { docDir } = seedRun(root, Object.assign({ final_decision: 'SEALED' }, SPEC));
  const r = runSubagent(root, docDir, 'spec-controller', SEAL_PROSE_WITH_STRAY_AWAITING);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'a genuine seal terminal must stay governed — the stray AWAITING line must not bypass the result-block requirement');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
