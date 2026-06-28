#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 — v8.16.0 — subagent return stamps step-ledger via PostToolUse hook
// =============================================================================
// Pins the fix for Glitch A (HIGH, weight 1) caught by the v8.15.0 E2E evaluator
// in the 2026-06-28-audit-recent-pipeline-runs run: agent-step `final` was never
// stamped in sentinel-state.json:step_ledger after the final-validator subagent
// returned, because the stamping path was tied to a specific tool-name shape.
//
// FIX (option A2 hybrid): step-ledger-stamp.cjs is the authoritative stamper.
// It now (a) accepts the legacy 'Agent' tool_name AND (b) parses the
// PIPELINE_AGENT_RESULT_V1 fence from tool_response when present, and stamps
// step from the agent map even when the harness path differs. The post-fix
// invariant: after a governed subagent returns with a usable tool_response,
// the matching step IS stamped into the run's signed step_ledger.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f1-v8160-step-ledger-stable-secret-0123456789abcdef';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const stamp = require(path.join(ROOT, '.claude', 'hooks', 'step-ledger-stamp.cjs'));
const { writeSignedState, readHmacKey } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | ${label}`); }
  else console.log(`OK   | ${label}`);
}

function setupRun(workflowKey) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-v8160-'));
  const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-Heavy-action', 'demo', '001-run');
  fs.mkdirSync(docPath, { recursive: true });
  const statePath = path.join(docPath, 'sentinel-state.json');
  const state = {
    run_id: 'f1-v8160',
    workflow_key: workflowKey || 'FULL',
    task_type: 'Bug Fix',
    complexity: 'MEDIA',
    pipeline_active: true,
    step_ledger: ['classify', 'info-gate', 'plan', 'tdd', 'execute', 'adversarial', 'sanity'],
    pipeline_doc_path: docPath,
  };
  // Sign the state so step-ledger-stamp's SEC-1 verify passes.
  writeSignedState(statePath, state);
  return { repoRoot, docPath };
}

function readLedger(docPath) {
  const s = JSON.parse(fs.readFileSync(path.join(docPath, 'sentinel-state.json'), 'utf8'));
  return Array.isArray(s.step_ledger) ? s.step_ledger : [];
}

// --- Case 1: final-validator returns via Agent — `final` stamped --------------
{
  const { repoRoot, docPath } = setupRun('FULL');
  process.env.PIPELINE_DOC_PATH = docPath;
  const payload = {
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' },
    tool_response: { status: 'completed', content: [{ type: 'text', text: 'done' }] },
  };
  stamp.stamp(payload);
  const ledger = readLedger(docPath);
  check('Case1: final stamped after final-validator Agent return', ledger.includes('final'));
  delete process.env.PIPELINE_DOC_PATH;
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 2: final-validator returns with PIPELINE_AGENT_RESULT_V1 text -------
// Simulates the audit-run shape where tool_response is the raw string the agent
// emitted (or where the harness wrapped it). step-ledger-stamp must still stamp.
{
  const { repoRoot, docPath } = setupRun('FULL');
  process.env.PIPELINE_DOC_PATH = docPath;
  const resultBlock = [
    '=== PIPELINE_AGENT_RESULT_V1 ===',
    JSON.stringify({ status: 'completed', summary: 'Pa de Cal GO @ 0.97' }),
    '=== END PIPELINE_AGENT_RESULT_V1 ===',
  ].join('\n');
  const payload = {
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' },
    tool_response: resultBlock, // string form
  };
  stamp.stamp(payload);
  check('Case2: final stamped when tool_response is the raw V1 result string', readLedger(docPath).includes('final'));
  delete process.env.PIPELINE_DOC_PATH;
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 3: a no-op / errored return must NOT stamp final --------------------
{
  const { repoRoot, docPath } = setupRun('FULL');
  process.env.PIPELINE_DOC_PATH = docPath;
  const payload = {
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:final-validator' },
    tool_response: { is_error: true, error: 'boom' },
  };
  stamp.stamp(payload);
  check('Case3: errored return does NOT stamp final', !readLedger(docPath).includes('final'));
  delete process.env.PIPELINE_DOC_PATH;
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 4: an unrecognized subagent returns — nothing stamped ---------------
{
  const { repoRoot, docPath } = setupRun('FULL');
  process.env.PIPELINE_DOC_PATH = docPath;
  const before = readLedger(docPath).slice();
  const payload = {
    tool_name: 'Agent',
    cwd: repoRoot,
    tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel' }, // ungoverned
    tool_response: { status: 'completed' },
  };
  stamp.stamp(payload);
  const after = readLedger(docPath);
  check('Case4: ungoverned agent return does not mutate ledger', JSON.stringify(after) === JSON.stringify(before));
  delete process.env.PIPELINE_DOC_PATH;
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

console.log('');
console.log(`F1 v8.16.0: ${failures === 0 ? 'PASS' : `FAIL (${failures})`}`);
process.exit(failures > 0 ? 1 : 0);
