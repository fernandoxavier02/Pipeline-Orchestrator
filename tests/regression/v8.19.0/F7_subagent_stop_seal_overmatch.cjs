#!/usr/bin/env node
'use strict';

// =============================================================================
// F7 (v8.19.0) — Enforcer residual: the emit-and-hoist detector must NOT swallow a
// GENUINE TERMINAL (sealed) stop whose body happens to contain a line-start
// `STATUS: AWAITING_*`.
//
// LOW residual (adversarial review): HOIST_STATUS_RE uses `/m`, so it anchors to the
// start of ANY line. A genuine terminal stop — the controller has SEALED the run —
// whose final message contains a stray line beginning `STATUS: AWAITING_GATE_RESPONSES`
// (echoed prose, a quoted earlier handshake, a leftover status line) is mis-classified
// as an intermediate hoist → the result-block requirement is bypassed → the original
// "prose-instead-of-block at the seal" bug reopens.
//
// FIX: a stop with ON-DISK SEAL EVIDENCE (final_decision SEALED, or manifest status
// sealed — reusing stop-gate-hook.cjs::hasSealEvidence logic) is TERMINAL by definition,
// so the hoist bypass fires ONLY when the run is NOT yet sealed.
//
// EXPECTED RED (before fix): F7-S1/F7-S2 are ALLOWED (over-match treats the sealed
//   terminal as a hoist). EXPECTED GREEN (after fix): they BLOCK (governed result-block
//   requirement applies to a sealed terminal). The guards (active hoist still allowed;
//   sealed terminal WITH a valid block still allowed) must never regress.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f7-subagent-stop-seal-overmatch-stable-secret-0123456789';

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

// A GENUINE TERMINAL seal close whose prose body happens to contain a line-start
// `STATUS: AWAITING_*` — exactly the over-match the residual is about. NO valid block.
const SEAL_PROSE_WITH_STRAY_AWAITING = [
  'SPEC AUTHORING COMPLETE. The controller has SEALED the run.',
  'Earlier this run we paused with:',
  'STATUS: AWAITING_GATE_RESPONSES',
  'but that handshake is long resolved. STOP.',
].join('\n');

// A live INTERMEDIATE hoist on an active (NOT sealed) spec leaf — the legitimate case.
const HOIST_DISPATCH = [
  '=== DISPATCH_REQUEST v1 ===',
  'dispatch_id: step-2-spec-init',
  'target_kind: skill',
  'target_name: pipeline-orchestrator:spec-init',
  'description: run spec-init',
  '=== END DISPATCH_REQUEST ===',
  '',
  'STATUS: AWAITING_DISPATCH_RESULTS',
  'pending: [step-2-spec-init]',
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
function run(payload, env) {
  const base = { ...process.env }; delete base.PIPELINE_SUBAGENTSTOP_ENFORCEMENT;
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...base, ...(env || {}) } });
}
function payload(root, agentType, lastMsg) {
  return { hook_event_name: 'SubagentStop', agent_type: agentType, agent_id: `id-${agentType}`, last_assistant_message: lastMsg, cwd: root };
}
function decisionOf(r) { try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; } }
function readState(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function correctionCount(p) {
  const s = readState(p) || {};
  const c = s.subagent_corrections || {};
  return Number.isFinite(c['rspec::spec-controller']) ? c['rspec::spec-controller'] : 0;
}

const SPEC = { spec_authoring_progress: { intake: 'done', requirements: 'done' } };

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f7-substop-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F7 v8.19.0 — a sealed terminal with a stray AWAITING line is not a hoist ===');

// ---- F7-S1: sealed (final_decision) terminal + stray AWAITING line, no block → BLOCK
liveTest('F7-S1 [residual-block] sealed terminal (final_decision SEALED) with a stray STATUS: AWAITING_GATE_RESPONSES line and NO valid block is BLOCKED when armed', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ final_decision: 'SEALED' }, SPEC));
  const r = run(payload(root, 'spec-controller', SEAL_PROSE_WITH_STRAY_AWAITING), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'a SEALED terminal stop must stay governed — the stray AWAITING line must not bypass the result-block requirement (RED today: allowed via over-match)');
  assert.equal(correctionCount(statePath), 1, 'the armed block must bump the correction counter once');
});

// ---- F7-S2: sealed via manifest.yaml + stray AWAITING line, no block → BLOCK
liveTest('F7-S2 [residual-block-manifest] sealed terminal (manifest status: sealed) with a stray AWAITING line and NO valid block is BLOCKED when armed', (root) => {
  const { docDir } = seedRun(root, SPEC, /* manifestStatus */ 'sealed');
  const r = run(payload(root, 'spec-controller', SEAL_PROSE_WITH_STRAY_AWAITING), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'block', 'manifest seal evidence must keep the terminal governed (RED today: allowed via over-match)');
});

// ---- F7-S3: GUARD — active (NOT sealed) intermediate hoist still allowed, not counted
liveTest('F7-S3 [guard-allow] an active (NOT sealed) AWAITING_DISPATCH_RESULTS hoist is still ALLOWED and not counted', (root) => {
  const { docDir, statePath } = seedRun(root, Object.assign({ pipeline_active: true }, SPEC));
  const r = run(payload(root, 'spec-controller', HOIST_DISPATCH), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a legitimate hoist on a still-active run must NOT regress to block');
  assert.equal(correctionCount(statePath), 0, 'a legitimate hoist must not bump the counter');
});

// ---- F7-S4: GUARD — sealed terminal WITH a valid block → allowed
liveTest('F7-S4 [guard-allow] a sealed terminal WITH a valid PIPELINE_AGENT_RESULT_V1 block is ALLOWED', (root) => {
  const { docDir } = seedRun(root, Object.assign({ final_decision: 'SEALED' }, SPEC));
  const r = run(payload(root, 'spec-controller', VALID_BLOCK), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'block', 'a sealed terminal with a valid block must close cleanly');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
