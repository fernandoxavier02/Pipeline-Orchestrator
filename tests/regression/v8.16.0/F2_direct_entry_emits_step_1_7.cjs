#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 — v8.16.0 — direct /pipeline --audit entry auto-emits STEP_1_7_ROUTING
// =============================================================================
// Pins the fix for Glitch B (MEDIUM, weight 0.5) caught by the v8.15.0 E2E
// evaluator: the v7.14.0 STEP_1_7_ROUTING gate requires every MEDIA/COMPLEXA/
// Spec run to log one of {load-existing, dispatch-brainstorm, no-prep-override,
// simples-bypass} in gate-decisions.jsonl. A direct entry via
// /pipeline-orchestrator:pipeline --audit (or any direct COMPLEXA path that
// did not flow through /brainstorm) never auto-emits `no-prep-override`, so
// the final-validator's hygiene check raises BRAINSTORM_EVIDENCE_MISSING.
//
// FIX: the pipeline-arm-writer (UserPromptSubmit) — which already classifies
// the workflow in code — also records the no-prep-override branch the moment
// the run dir is born (auto-stamped lazily by step-ledger-stamp.cjs on the
// FIRST governed step, since the run dir does not exist at UserPromptSubmit).
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f2-v8160-step17-stable-secret-0123456789abcdef';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const stamp = require(path.join(ROOT, '.claude', 'hooks', 'step-ledger-stamp.cjs'));
const arm = require(path.join(ROOT, 'lib', 'pipeline-arm.cjs'));
const { writeSignedState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | ${label}`); }
  else console.log(`OK   | ${label}`);
}

function setupRun(complexity, type) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-v8160-'));
  const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-Heavy-action', 'demo', '001-run');
  fs.mkdirSync(docPath, { recursive: true });
  return { repoRoot, docPath };
}

function readGateDecisions(docPath) {
  const p = path.join(docPath, 'gate-decisions.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// --- Case 1: direct /pipeline --audit entry writes the arm marker -------------
{
  const { repoRoot } = setupRun();
  const marker = arm.writeArmPending(repoRoot, '/pipeline-orchestrator:pipeline --audit recent runs');
  check('Case1: arm marker written for direct audit entry', !!marker);
  check('Case1: marker classifies as Audit type', marker && marker.type === 'Audit');
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 2: stamping `classify` over a direct-entry marker auto-emits 1.7 ----
// This is the core fix: when step-ledger-stamp stamps the FIRST governed step
// for a run whose arm-marker indicates direct entry (no brainstorm came first),
// it ALSO writes STEP_1_7_ROUTING(no-prep-override) once.
{
  const { repoRoot, docPath } = setupRun();
  // 1. Arm the run (writes the marker under .pipeline/).
  arm.writeArmPending(repoRoot, '/pipeline-orchestrator:pipeline --audit recent runs');
  // 2. Birth the run dir + signed state with NO step yet stamped.
  const statePath = path.join(docPath, 'sentinel-state.json');
  writeSignedState(statePath, {
    run_id: 'f2-v8160',
    workflow_key: 'FULL',
    task_type: 'Audit',
    complexity: 'COMPLEXA',
    pipeline_active: true,
    step_ledger: [],
    pipeline_doc_path: docPath,
  });
  process.env.PIPELINE_DOC_PATH = docPath;
  // 3. Stamp the FIRST governed step via task-orchestrator return.
  stamp.stamp({
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' },
    tool_response: { status: 'completed' },
  });
  // 4. Assert: gate-decisions.jsonl has exactly ONE STEP_1_7_ROUTING entry with
  //    branch=no-prep-override (encoded in detail).
  const entries = readGateDecisions(docPath);
  const step17 = entries.filter((e) => e.gate === 'STEP_1_7_ROUTING');
  check('Case2: exactly one STEP_1_7_ROUTING entry emitted', step17.length === 1);
  check('Case2: branch is no-prep-override',
    step17[0] && typeof step17[0].detail === 'string' && step17[0].detail.includes('no-prep-override'));
  // 5. Idempotency: a second stamp must NOT add a second entry.
  stamp.stamp({
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:information-gate' },
    tool_response: { status: 'completed' },
  });
  const after = readGateDecisions(docPath).filter((e) => e.gate === 'STEP_1_7_ROUTING');
  check('Case2: still exactly one STEP_1_7_ROUTING after a second stamp (idempotent)', after.length === 1);
  delete process.env.PIPELINE_DOC_PATH;
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 3: a run that already has STEP_1_7_ROUTING does NOT get a duplicate -
{
  const { repoRoot, docPath } = setupRun();
  arm.writeArmPending(repoRoot, '/pipeline-orchestrator:pipeline --audit recent runs');
  const statePath = path.join(docPath, 'sentinel-state.json');
  writeSignedState(statePath, {
    run_id: 'f2-v8160-pre',
    workflow_key: 'FULL',
    task_type: 'Audit',
    complexity: 'COMPLEXA',
    pipeline_active: true,
    step_ledger: [],
    pipeline_doc_path: docPath,
    step_1_7: { decision: 'dispatch-brainstorm', prep_run_id: null, timestamp: new Date().toISOString() },
  });
  // Pre-existing gate-decisions entry as if brainstorm wrote one.
  fs.writeFileSync(path.join(docPath, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'STEP_1_7_ROUTING', decision: 'DISPATCHED', detail: 'branch=dispatch-brainstorm' }) + '\n');
  process.env.PIPELINE_DOC_PATH = docPath;
  stamp.stamp({
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' },
    tool_response: { status: 'completed' },
  });
  const step17 = readGateDecisions(docPath).filter((e) => e.gate === 'STEP_1_7_ROUTING');
  check('Case3: pre-existing STEP_1_7_ROUTING is not duplicated', step17.length === 1);
  check('Case3: pre-existing branch was preserved (dispatch-brainstorm)',
    step17[0] && step17[0].detail && step17[0].detail.includes('dispatch-brainstorm'));
  delete process.env.PIPELINE_DOC_PATH;
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 4: a SIMPLES run is exempt (no auto-stamp expected) -----------------
{
  const { repoRoot, docPath } = setupRun();
  arm.writeArmPending(repoRoot, '/pipeline-orchestrator:bugfix-light fix a typo');
  const statePath = path.join(docPath, 'sentinel-state.json');
  writeSignedState(statePath, {
    run_id: 'f2-v8160-simples',
    workflow_key: 'FULL',
    task_type: 'Bug Fix',
    complexity: 'SIMPLES',
    pipeline_active: true,
    step_ledger: [],
    pipeline_doc_path: docPath,
  });
  process.env.PIPELINE_DOC_PATH = docPath;
  stamp.stamp({
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' },
    tool_response: { status: 'completed' },
  });
  const step17 = readGateDecisions(docPath).filter((e) => e.gate === 'STEP_1_7_ROUTING');
  // SIMPLES is OUT-OF-SCOPE per the v7.14.0 enforcement target (dispatch-guard
  // handleBrainstormDispatch). Accept either 0 entries OR exactly one stamped as
  // simples-bypass — the contract is "no missing-evidence". We assert 0 here as the
  // minimal-diff default; if a future fix prefers explicit simples-bypass marking,
  // tighten the assertion in lockstep with the implementation.
  check('Case4: SIMPLES run does not get an auto STEP_1_7_ROUTING entry', step17.length === 0);
  delete process.env.PIPELINE_DOC_PATH;
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

console.log('');
console.log(`F2 v8.16.0: ${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
process.exit(failures > 0 ? 1 : 0);
