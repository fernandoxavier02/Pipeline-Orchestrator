#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 — e2e-eval-gate Stop hook: trigger, clean-allow, glitch-block, anti-recursion
// =============================================================================
// - incomplete run            → allow (stop-gate-hook owns it)
// - completed clean run        → allow + marker completed + artifacts written
// - completed run w/ glitches  → block + additionalContext + pending + pipeline_active:false
// - marker already completed    → allow (anti-recursion)
// - SessionEnd / StopFailure    → allow (recovery path, never evaluate)
// - continuity cap reached      → allow (forced, never deadlock)
// - observe mode + glitches     → allow (still scored + logged, never blocks)
// - success signal (not terminal)→ acts (hook-ordering robustness)
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const GATE = require(path.join(root, '.claude', 'hooks', 'e2e-eval-gate.cjs'));
const { mandatorySetFor } = require(path.join(root, 'lib', 'fidelity-reporter.cjs'));
const { agentStepsFor } = require(path.join(root, 'lib', 'step-ledger.cjs'));

let failures = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) { failures++; console.log(`FAIL | exp=${JSON.stringify(exp)} got=${JSON.stringify(got)} | ${label}`); }
  else console.log(`OK   | ${label}`);
}
function checkTrue(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | expected truthy | ${label}`); }
  else console.log(`OK   | ${label}`);
}

const FULL_STEPS = agentStepsFor('FULL');
const MEDIA_GATES = mandatorySetFor('MEDIA', 'Bug Fix', null);

// Build a run on disk: active-run.json pointer + sentinel-state.json + trace.
function setupRun(stateExtra, gates, protocolEvents) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-gate-'));
  const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-bugfix-action', 'demo', '001-run');
  fs.mkdirSync(docPath, { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docPath, run_id: '001-run' })
  );
  const state = Object.assign({ run_id: '001-run', task_type: 'Bug Fix', complexity: 'MEDIA' }, stateExtra);
  fs.writeFileSync(path.join(docPath, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  if (gates && gates.length) {
    fs.writeFileSync(
      path.join(docPath, 'gate-decisions.jsonl'),
      gates.map((g) => JSON.stringify({ gate: g, hardness: 'MANDATORY', decision: 'TRIGGERED', timestamp_utc: '2026-06-26T00:00:00Z' })).join('\n') + '\n'
    );
  }
  if (protocolEvents && protocolEvents.length) {
    fs.writeFileSync(
      path.join(docPath, 'protocol-events.jsonl'),
      protocolEvents.map((e) => JSON.stringify({ event: e, detail: 'test', ts: '2026-06-26T00:00:00Z' })).join('\n') + '\n'
    );
  }
  return { repoRoot, docPath };
}
function readState(docPath) {
  return JSON.parse(fs.readFileSync(path.join(docPath, 'sentinel-state.json'), 'utf8'));
}
function cleanup(repoRoot) { fs.rmSync(repoRoot, { recursive: true, force: true }); }

// Ensure env precedence does not hijack discovery / enforcement.
delete process.env.PIPELINE_DOC_PATH;
delete process.env.PIPELINE_RUN_ID;
delete process.env.PIPELINE_E2E_EVAL_ENFORCEMENT;
delete process.env.PIPELINE_HMAC_STRICT;

// H1 — incomplete run → allow (defer to stop-gate) ---------------------------
{
  const { repoRoot } = setupRun({ pipeline_active: true }, [], []);
  const out = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
  check('H1: incomplete → allow', out.decision, 'allow');
  cleanup(repoRoot);
}

// H2 — completed clean run → allow + marker + artifacts ----------------------
{
  const { repoRoot, docPath } = setupRun(
    { terminal_state: 'completed', step_ledger: FULL_STEPS.slice() }, MEDIA_GATES, []
  );
  const out = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
  check('H2: clean → allow', out.decision, 'allow');
  check('H2: marker completed=true', readState(docPath).e2e_eval_completed, true);
  checkTrue('H2: e2e-eval.json written', fs.existsSync(path.join(docPath, 'e2e-eval.json')));
  checkTrue('H2: eval-log appended', fs.existsSync(path.join(repoRoot, '.pipeline', 'eval-log.jsonl')));
  cleanup(repoRoot);
}

// H3 — completed run with glitches → block + pending + pipeline_active:false --
{
  const { repoRoot, docPath } = setupRun(
    { terminal_state: 'completed', step_ledger: ['classify', 'plan'] }, MEDIA_GATES.slice(0, 2), ['PLAN_MODE_BYPASS']
  );
  const out = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
  check('H3: glitches → block', out.decision, 'block');
  checkTrue('H3: reason names self-eval', /E2E_SELF_EVAL_REQUIRED/.test(out.reason || ''));
  checkTrue('H3: context says run /self-eval', /self-eval/.test(out.additionalContext || ''));
  const st = readState(docPath);
  check('H3: marker pending', st.e2e_eval_pending, true);
  check('H3: pipeline_active zeroed', st.pipeline_active, false);
  check('H3: continuity = 1', st.e2e_continuity_attempts, 1);
  cleanup(repoRoot);
}

// H4 — already completed marker → allow (anti-recursion) ---------------------
{
  const { repoRoot } = setupRun(
    { terminal_state: 'completed', e2e_eval_completed: true, step_ledger: ['classify'] }, MEDIA_GATES.slice(0, 1), ['PLAN_MODE_BYPASS']
  );
  const out = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
  check('H4: completed marker → allow', out.decision, 'allow');
  cleanup(repoRoot);
}

// H5 — SessionEnd → allow (recovery path) ------------------------------------
{
  const { repoRoot, docPath } = setupRun(
    { terminal_state: 'completed', step_ledger: ['classify'] }, MEDIA_GATES.slice(0, 1), ['PLAN_MODE_BYPASS']
  );
  const out = GATE.decide({ hook_event_name: 'SessionEnd', cwd: repoRoot });
  check('H5: SessionEnd → allow', out.decision, 'allow');
  checkTrue('H5: did NOT score on recovery', !fs.existsSync(path.join(docPath, 'e2e-eval.json')));
  cleanup(repoRoot);
}

// H6 — continuity cap → forced allow (never deadlock) ------------------------
{
  const { repoRoot, docPath } = setupRun(
    { terminal_state: 'completed', step_ledger: ['classify'], e2e_continuity_attempts: 2 }, MEDIA_GATES.slice(0, 1), ['PLAN_MODE_BYPASS']
  );
  const out = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
  check('H6: at cap → allow', out.decision, 'allow');
  check('H6: marker completed=forced', readState(docPath).e2e_eval_completed, 'forced');
  cleanup(repoRoot);
}

// H7 — observe mode + glitches → allow but still scored ----------------------
{
  process.env.PIPELINE_E2E_EVAL_ENFORCEMENT = 'warn';
  const { repoRoot, docPath } = setupRun(
    { terminal_state: 'completed', step_ledger: ['classify'] }, MEDIA_GATES.slice(0, 1), ['PLAN_MODE_BYPASS']
  );
  const out = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
  check('H7: observe → allow', out.decision, 'allow');
  check('H7: marker completed=observe', readState(docPath).e2e_eval_completed, 'observe');
  checkTrue('H7: still scored (json written)', fs.existsSync(path.join(docPath, 'e2e-eval.json')));
  delete process.env.PIPELINE_E2E_EVAL_ENFORCEMENT;
  cleanup(repoRoot);
}

// H8 — success signal (not terminal) → acts (hook-ordering robustness) --------
{
  const { repoRoot } = setupRun(
    { pipeline_active: true, final_decision: 'GO', step_ledger: ['classify', 'plan'] }, MEDIA_GATES.slice(0, 2), []
  );
  const out = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
  check('H8: success signal w/ glitches → block', out.decision, 'block');
  cleanup(repoRoot);
}

console.log(failures === 0 ? '\n>>> F2 PASS' : `\n>>> F2 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
