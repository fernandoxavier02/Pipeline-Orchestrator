#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.18.2) — observer governance guard (RED→GREEN, TDD).
// =============================================================================
// BUG (observed live 2026-06-29, error-signals.jsonl): the SubagentStop OBSERVER
// `.claude/hooks/corrective-error-signal-gate.cjs` treated ANY payload with a
// non-empty `agent_type` as a GOVERNED subagent finishing. The harness fires
// SubagentStop for EVERY subagent — including non-pipeline harness agents like
// `Explore` / `general-purpose`. So a plain `Explore` search agent that finished
// without a PIPELINE_AGENT_RESULT_V1 block emitted a FALSE
// `SUBAGENTSTOP_RESULT_MISSING` signal and fired a spurious corrective dispatch
// (run_id:"" — no governed run was even active).
//
// FIX: the observer must only act on a GOVERNED LEAF — an agent the workflow manifest
// recognizes as a spine leaf (membership BY NAME via isGovernedLeaf). The inversion is
// promoted to the manifest SSOT (lib/contracts/workflow-manifest.cjs) as
// `stepForAgentType` + `isGovernedLeaf`, consumed by BOTH hooks (DRY). NOTE: the observer
// is membership-by-name + run-blind on purpose — it is NOT identical to the sibling commit
// gate, which additionally requires pipeline_active===true and keys off state.workflow.
// (The full 9-leaf enumeration + the manifest↔step-ledger parity lock live in the manifest
// contract test; this file pins the OBSERVER behavior — who emits and who is a no-op.)
//
// EXPECTED RED (before the fix):
//   - manifest does NOT export stepForAgentType / isGovernedLeaf  → clean assertion fail.
//   - handleSubagentStop on an `Explore` failure verdict EMITS (emitted:true)     → fail.
// EXPECTED GREEN (after the fix):
//   - manifest exports both, with correct values.
//   - `Explore` / `general-purpose` / other non-spine agents → no-op ('not-governed').
//   - a real governed leaf (`executor-controller`, `final-validator`) STILL emits.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f1-observer-governance-guard-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK_PATH = path.join(ROOT, '.claude/hooks/corrective-error-signal-gate.cjs');
const MANIFEST_PATH = path.join(ROOT, 'lib/contracts/workflow-manifest.cjs');
const CHANNEL_REL = '.pipeline/state/error-signals.jsonl';

let hook = null;
try { hook = require(HOOK_PATH); } catch { hook = {}; }
let manifest = null;
try { manifest = require(MANIFEST_PATH); } catch { manifest = {}; }

// A FAILURE VERDICT for the given agent: finished WITHOUT a result block.
function failurePayload(cwd, agentType, over = {}) {
  return {
    hook_event_name: 'SubagentStop',
    agent_type: agentType,
    agent_id: `id-${agentType}-1`,
    last_assistant_message: 'I finished but I am not emitting a PIPELINE_AGENT_RESULT_V1 block.',
    cwd,
    run_id: '',
    ...over,
  };
}

function readChannel(cwd) {
  const p = path.join(cwd, CHANNEL_REL);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  let tmp;
  try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-')); fn(tmp); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F1 v8.18.2 — observer governance guard (only spine leaves emit) ===');

// ---- manifest SSOT: stepForAgentType + isGovernedLeaf -----------------------
check('manifest exports stepForAgentType + isGovernedLeaf', () => {
  assert.equal(typeof manifest.stepForAgentType, 'function',
    'workflow-manifest.cjs must export stepForAgentType (RED until v8.18.2 promotes it to the SSOT)');
  assert.equal(typeof manifest.isGovernedLeaf, 'function',
    'workflow-manifest.cjs must export isGovernedLeaf (RED until v8.18.2 adds it)');
});

check('stepForAgentType spot-checks representative FULL leaves + rejects non-leaves (full 9-leaf enumeration is in the manifest contract test)', () => {
  assert.equal(manifest.stepForAgentType('FULL', 'executor-controller'), 'execute');
  assert.equal(manifest.stepForAgentType('FULL', 'final-validator'), 'final');
  assert.equal(manifest.stepForAgentType('FULL', 'task-orchestrator'), 'classify');
  assert.equal(manifest.stepForAgentType('FULL', 'Explore'), null);
  assert.equal(manifest.stepForAgentType('FULL', ''), null);
  // a null-spine workflow yields null for everyone (no in-code spine).
  assert.equal(manifest.stepForAgentType('REVIEW-ONLY', 'executor-controller'), null);
});

check('isGovernedLeaf recognizes governed leaves and rejects harness agents', () => {
  assert.equal(manifest.isGovernedLeaf('executor-controller'), true);
  assert.equal(manifest.isGovernedLeaf('final-validator'), true);
  assert.equal(manifest.isGovernedLeaf('review-orchestrator'), true);
  // harness / non-pipeline agents — the false-positive class this fix closes.
  assert.equal(manifest.isGovernedLeaf('Explore'), false);
  assert.equal(manifest.isGovernedLeaf('general-purpose'), false);
  assert.equal(manifest.isGovernedLeaf('Plan'), false);
  assert.equal(manifest.isGovernedLeaf(''), false);
  assert.equal(manifest.isGovernedLeaf(null), false);
});

// ---- the observer: only spine leaves emit ----------------------------------
check('observer exports handleSubagentStop', () => {
  assert.equal(typeof hook.handleSubagentStop, 'function', 'handleSubagentStop must be exported');
});

check('RED→GREEN: an Explore failure verdict is a no-op (not-governed), emits NOTHING', (tmp) => {
  const out = hook.handleSubagentStop(failurePayload(tmp, 'Explore'));
  assert.ok(out && typeof out === 'object', 'handler must return a descriptor');
  assert.equal(out.emitted, false,
    'an Explore (non-spine, harness) failure must NOT emit a SUBAGENTSTOP_RESULT_MISSING signal — RED today (it emits), GREEN after the governance guard');
  assert.equal(out.reason, 'not-governed', 'reason must be not-governed for a non-spine agent');
  assert.equal(readChannel(tmp).length, 0, 'no ErrorSignal line must be written for a non-governed agent');
});

check('other harness/plugin agents (general-purpose, Plan, code-reviewer) are also no-ops', (tmp) => {
  for (const a of ['general-purpose', 'Plan', 'code-reviewer']) {
    const out = hook.handleSubagentStop(failurePayload(tmp, a));
    assert.equal(out.emitted, false, `${a} must not emit (non-spine harness/plugin agent)`);
    assert.equal(out.reason, 'not-governed', `${a} reason must be not-governed`);
  }
  assert.equal(readChannel(tmp).length, 0, 'no signals for any non-governed agent');
});

check('PRESERVE: a real governed leaf (executor-controller) failure STILL emits', (tmp) => {
  const out = hook.handleSubagentStop(failurePayload(tmp, 'executor-controller'));
  assert.equal(out.emitted, true,
    'a genuine governed spine leaf finishing without a result block must STILL emit (no regression)');
  assert.equal(out.reason, 'failure', 'reason must be failure for a governed leaf failure verdict');
  assert.equal(readChannel(tmp).length, 1, 'exactly one ErrorSignal for the governed-leaf failure');
});

check('PRESERVE: a governed leaf clean finish is still a no-op (ok)', (tmp) => {
  const block = [
    '=== PIPELINE_AGENT_RESULT_V1 ===',
    JSON.stringify({ status: 'completed', summary: 'done', next_agent: 'review-orchestrator' }),
    '=== END PIPELINE_AGENT_RESULT_V1 ===',
  ].join('\n');
  const out = hook.handleSubagentStop(failurePayload(tmp, 'final-validator', {
    last_assistant_message: `All good.\n\n${block}`,
  }));
  assert.equal(out.emitted, false, 'a clean finish must not emit');
  assert.equal(out.reason, 'ok', 'a clean governed-leaf finish reason must be ok');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
