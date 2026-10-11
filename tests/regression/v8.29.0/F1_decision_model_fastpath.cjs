#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 — v8.29.0 decision-model fast path (Phase 0a-pre).
//
// When the controller consumes a decision-model verdict and SKIPS the
// task-orchestrator dispatch, the step ledger never receives the `classify`
// stamp that step-ledger-stamp.cjs writes on the agent's return. The fast path
// therefore stamps `classify` by hand through scripts/record-step.cjs. These
// tests lock the contract:
//   1. signed active run WITHOUT the stamp → information-gate spawn is DENIED
//   2. after `record-step.cjs <doc> classify` → information-gate spawn is ALLOWED
//   3. references/decision-classificador.json is the approved decision file
//      (3 questions, inverse present, gate not loosened)
//   4. lib/decision-client.cjs is a faithful copy of the skill adapter when the
//      skill is present on this machine (skipped otherwise)
//   5. preclassify.read() refuses when the flag is off (default-off invariant)
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GATE = path.join(ROOT, '.claude', 'hooks', 'step-ledger-gate.cjs');
const REC = path.join(ROOT, 'scripts', 'record-step.cjs');
const { writeSignedState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));
const pre = require(path.join(ROOT, 'lib', 'preclassify.cjs'));

let pass = 0, fail = 0;
const tmp = [];
function record(name, ok, why) {
  if (ok) { pass++; console.log(`  [PASS] ${name}`); } else { fail++; console.log(`  [FAIL] ${name}: ${why || ''}`); }
}
function makeCwd() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-dm-')); tmp.push(d); return d; }

function seedRun(cwd) {
  const docDir = path.join(cwd, '.pipeline', 'docs', 'Pre-Media-bugfix', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    schema_version: 1,
    run_id: 'run',
    pipeline_active: true,
    pipeline_doc_path: docDir,
    current_phase: '0a',
    task_type: 'Bug Fix',
    expected_next: 'information-gate',
    orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA', pipeline_variant: 'bugfix-light', source: 'decision-model', ssot_status: 'DEFERRED' },
    step_ledger: [],
  });
  fs.writeFileSync(path.join(cwd, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: docDir, run_id: 'run', updated_at: new Date().toISOString() }, null, 2));
  return docDir;
}

function runGate(cwd, agentType) {
  const payload = JSON.stringify({ tool_name: 'Agent', cwd, tool_input: { subagent_type: agentType } });
  const env = { ...process.env, PIPELINE_DOC_PATH: '', PIPELINE_RUN_ID: '', PIPELINE_STEP_LEDGER_ENFORCEMENT: 'deny' };
  const res = spawnSync(process.execPath, [GATE], { input: payload, cwd, env, encoding: 'utf8', timeout: 15000 });
  let decision = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); decision = (j.hookSpecificOutput && j.hookSpecificOutput.permissionDecision) || j.decision || decision; } catch { /* ignore */ }
  }
  return { status: res.status, decision, stdout: res.stdout, stderr: res.stderr };
}

console.log('F1 — decision-model fast path (v8.29.0)');

// 1 + 2: ledger denies information-gate until `classify` is stamped by record-step
{
  const cwd = makeCwd();
  const docDir = seedRun(cwd);
  const before = runGate(cwd, 'pipeline-orchestrator:core:information-gate');
  record('without classify stamp → information-gate DENIED', /deny|block/i.test(String(before.decision)) || before.status === 2,
    `decision=${before.decision} status=${before.status} out=${(before.stdout || '').slice(0, 160)}`);

  const rec = spawnSync(process.execPath, [REC, docDir, 'classify'], { cwd, encoding: 'utf8', timeout: 15000 });
  record('record-step.cjs <doc> classify exits 0', rec.status === 0, `status=${rec.status} ${rec.stdout} ${rec.stderr}`);
  const state = JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8'));
  record('step_ledger now contains classify', Array.isArray(state.step_ledger) && state.step_ledger.includes('classify'), JSON.stringify(state.step_ledger));

  const after = runGate(cwd, 'pipeline-orchestrator:core:information-gate');
  record('with classify stamp → information-gate ALLOWED', !/deny|block/i.test(String(after.decision)) && after.status === 0,
    `decision=${after.decision} status=${after.status} out=${(after.stdout || '').slice(0, 160)}`);

  // positive control: the SAME stamped ledger still denies a later step (executor-controller) → gate not neutralized
  const late = runGate(cwd, 'pipeline-orchestrator:executor:executor-controller');
  record('stamp does not neutralize the ledger (executor-controller still DENIED)', /deny|block/i.test(String(late.decision)) || late.status === 2,
    `decision=${late.decision} status=${late.status}`);
}

// 3: approved decision file shape + gate not loosened
{
  const d = JSON.parse(fs.readFileSync(pre.QUESTIONS_PATH, 'utf8'));
  record('decision file name', d.name === 'classificador-de-tarefa', d.name);
  record('decision file: 3 questions', Object.keys(d.questions || {}).sort().join(',') === 'complexity,needs_pipeline,task_type', Object.keys(d.questions || {}).join(','));
  record('decision file: needs_pipeline has inverse', !!(d.questions.needs_pipeline && d.questions.needs_pipeline.inverse && d.questions.needs_pipeline.inverse.criteria));
  record('decision file: min_confidence ≥ 0.7', Number(d.min_confidence) >= 0.7, String(d.min_confidence));
  record('decision file: gate ≥ 0.85 / ≤ 0.05', d.gate && d.gate.min_accuracy >= 0.85 && d.gate.max_flips <= 0.05, JSON.stringify(d.gate));
}

// 4: adapter copy is byte-identical to the skill (when the skill exists on this machine)
{
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const skillCopy = path.join(home, '.claude', 'skills', 'decision-model', 'scripts', 'decision-client.cjs');
  if (home && fs.existsSync(skillCopy)) {
    const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    record('lib/decision-client.cjs == skill adapter (sha256)', sha(skillCopy) === sha(path.join(ROOT, 'lib', 'decision-client.cjs')));
  } else {
    console.log('  [SKIP] skill adapter not present on this machine; copy-fidelity check skipped');
  }
}

// 5: default-off invariant
{
  const cwd = makeCwd();
  const r = pre.read({ cwd, sessionId: 's', request: 'x', env: {} });
  record('read() with flag off → match:false flag-off', r.match === false && r.reason === 'flag-off', JSON.stringify(r));
  record('isEnabled() default false', pre.isEnabled({}) === false);
}

for (const d of tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
console.log(`\nF1_decision_model_fastpath — pass ${pass} / fail ${fail}`);
process.exit(fail ? 1 : 0);
