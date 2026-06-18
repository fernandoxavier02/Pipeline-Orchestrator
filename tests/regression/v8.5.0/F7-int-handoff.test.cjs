#!/usr/bin/env node
'use strict';

/**
 * F7 (v8.5.0) — INT-1: deterministic sealed-spec handoff enforcement that does
 *   NOT depend on the controller's prose Step 0.5 having propagated the contract
 *   into the CURRENT run's sentinel.
 *
 * Background (the anti-pattern this cures): handleSealedSpecImplementation used
 * to read ONLY the current run's PIPELINE_DOC_PATH/sentinel-state.json. If the
 * prose Step 0.5 propagation was skipped, the current sentinel carried no
 * contract → the hook fail-OPENed and allowed every Phase 2 dispatch with zero
 * enforcement. INT-1 makes the hook ALSO look up the PRIOR sealed run directly
 * via PREP_RUN_ID and enforce ITS verified contract.
 *
 * The hook is exercised end-to-end the way it actually runs: a PreToolUse:Agent
 * JSON on stdin, PIPELINE_DOC_PATH + enforcement env set, decision read off
 * stdout. The hook always exits 0; a deny appears as permissionDecision:"deny".
 *
 * Scenarios:
 *   INT1-S1 (main):  current sentinel has NO contract BUT the prior sealed run
 *                    (pipeline-runs/<PREP_RUN_ID>/) has a VERIFIED sealed contract
 *                    with UNSATISFIED gates → hook DENIES under deny + audits.
 *   INT1-S2 (regression / fail-open): neither the current run NOR any prior run
 *                    carries a contract → hook ALLOWS (genuine non-spec run).
 *   INT1-S3 (security, B1 CRYPTO / INT-2): the prior run carries a contract but
 *                    its sentinel is UNSIGNED → not authoritative → hook ALLOWS.
 *   INT1-S4 (positive control): prior contract's gates ARE satisfied in the
 *                    CURRENT run's gate-decisions.jsonl → hook ALLOWS.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const DISPATCH_GUARD = path.join(ROOT, '.claude', 'hooks', 'dispatch-guard.cjs');
const { writeSignedState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

const IMPL_AGENT = 'pipeline-orchestrator:executor:executor-implementer-task';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

const _tmpDirs = [];
function mkRunsRoot(prefix) {
  // The hook treats dirname(PIPELINE_DOC_PATH) as the runs root, so the current
  // run dir and the prior run dir must be SIBLINGS under one parent. We model the
  // parent as the "pipeline-runs" root and create both runs inside it.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  _tmpDirs.push(root);
  return root;
}
function cleanup() {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* best-effort */ }
  }
}

// Run the guard with a PreToolUse:Agent payload. The two pre-existing enforcers
// (plan-mode, brainstorm) are pinned to warn so any deny on stdout MUST come from
// the sealed-spec handler under test. PIPELINE_PREP_RUN_ID/RUN_ID are cleared and
// then set explicitly per-scenario so the host env can't leak in.
function runGuard(docPath, { enforcement, prepRunId, prompt } = {}) {
  const env = {
    ...process.env,
    PIPELINE_DOC_PATH: docPath,
    PIPELINE_PLAN_MODE_ENFORCEMENT: 'warn',
    PIPELINE_BRAINSTORM_ENFORCEMENT: 'warn',
  };
  delete env.PIPELINE_RUN_ID;
  delete env.PIPELINE_PREP_RUN_ID;
  if (prepRunId) env.PIPELINE_PREP_RUN_ID = prepRunId;
  if (enforcement) env.PIPELINE_SPEC_AUTHORING_ENFORCEMENT = enforcement;
  else delete env.PIPELINE_SPEC_AUTHORING_ENFORCEMENT;
  const input = JSON.stringify({
    tool_name: 'Agent',
    tool_input: {
      subagent_type: IMPL_AGENT,
      description: 'impl',
      prompt: prompt || 'do work',
    },
  });
  try {
    const stdout = execFileSync(process.execPath, [DISPATCH_GUARD], {
      input, env, encoding: 'utf8', timeout: 15000,
    });
    return { code: 0, stdout: stdout || '' };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, stdout: (e.stdout || '').toString() };
  }
}

function isDeny(stdout) { return /"permissionDecision"\s*:\s*"deny"/.test(stdout); }
function readEvents(docPath) {
  const p = path.join(docPath, 'protocol-events.jsonl');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

// Build a current run dir (signed sentinel, NO contract) + a prior sealed run dir
// (sibling) under the same root. `priorSigned=false` writes the prior sentinel
// UNSIGNED on purpose (INT-2 security case). `currentGateDecisions` seeds the
// CURRENT run's gate-decisions.jsonl (gate satisfaction is read from the run that
// dispatches, i.e. the current run).
function seedSiblings(root, {
  prepRunId, priorContract, priorSigned = true, currentGateDecisions, currentStep17,
} = {}) {
  const currentDir = path.join(root, 'current-run');
  fs.mkdirSync(currentDir, { recursive: true });
  const currentState = { run_id: 'current-run' };
  if (currentStep17) currentState.step_1_7 = currentStep17;
  writeSignedState(path.join(currentDir, 'sentinel-state.json'), currentState);
  if (currentGateDecisions) {
    fs.writeFileSync(path.join(currentDir, 'gate-decisions.jsonl'),
      currentGateDecisions.map((g) => JSON.stringify(g)).join('\n') + '\n');
  }

  if (prepRunId && priorContract !== undefined) {
    const priorDir = path.join(root, prepRunId);
    fs.mkdirSync(priorDir, { recursive: true });
    const priorState = { run_id: prepRunId, implementation_contract: priorContract };
    const priorSentinel = path.join(priorDir, 'sentinel-state.json');
    if (priorSigned) {
      writeSignedState(priorSentinel, priorState);
    } else {
      // UNSIGNED on purpose — no __signature field.
      fs.writeFileSync(priorSentinel, JSON.stringify(priorState, null, 2));
    }
  }
  return currentDir;
}

const SEALED_CONTRACT = {
  sealed: true,
  ready_for_implementation: true,
  required_impl_gates: ['TDD_APPROVAL', 'ADVERSARIAL_BLOCK', 'ADVERSARIAL_LOOP_CHECKPOINT'],
  spec_dir: '01-spec',
};

console.log('=== F7 v8.5.0 — INT-1 deterministic sealed-spec handoff (no prose propagation) ===');

// ---- INT1-S1 (main) — prior verified contract, unsatisfied gates → deny ------
test('INT1-S1: current run has NO contract but prior sealed run (PREP_RUN_ID) has unsatisfied gates → DENY under deny', () => {
  const root = mkRunsRoot('f7-s1-');
  const currentDir = seedSiblings(root, {
    prepRunId: 'prep-spec-run',
    priorContract: SEALED_CONTRACT,
    // current run has NO satisfying gate lines.
    currentGateDecisions: [{ gate: 'SOME_OTHER', decision: 'CONFIRMED' }],
  });
  const { code, stdout } = runGuard(currentDir, { enforcement: 'deny', prepRunId: 'prep-spec-run' });
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(isDeny(stdout), 'prior verified contract with unsatisfied gates → deny');
  assert.match(readEvents(currentDir), /SPEC_CONTRACT_DISCIPLINE_MISSING/,
    'must audit SPEC_CONTRACT_DISCIPLINE_MISSING in the CURRENT run protocol-events');
});

// ---- INT1-S1b — same, but PREP_RUN_ID resolved from current sentinel step_1_7 -
test('INT1-S1b: PREP_RUN_ID recovered from current sentinel step_1_7.prep_run_id (no env, no prompt) → DENY', () => {
  const root = mkRunsRoot('f7-s1b-');
  const currentDir = seedSiblings(root, {
    prepRunId: 'prep-spec-run',
    priorContract: SEALED_CONTRACT,
    currentGateDecisions: [{ gate: 'SOME_OTHER', decision: 'CONFIRMED' }],
    currentStep17: { decision: 'load-existing', prep_run_id: 'prep-spec-run' },
  });
  // No prepRunId env, default prompt with no anchored line — must resolve via sentinel.
  const { stdout } = runGuard(currentDir, { enforcement: 'deny' });
  assert.ok(isDeny(stdout), 'step_1_7.prep_run_id is the SSOT source → deny');
});

// ---- INT1-S2 (fail-open) — no contract anywhere → allow ----------------------
test('INT1-S2: neither current run nor any prior run has a contract → ALLOW (fail-open, genuine non-spec run)', () => {
  const root = mkRunsRoot('f7-s2-');
  // Current run signed, no contract; PREP_RUN_ID points at a run with NO contract.
  const currentDir = seedSiblings(root, {
    prepRunId: 'prep-empty-run',
    priorContract: { sealed: false }, // not a sealed contract
  });
  const { code, stdout } = runGuard(currentDir, { enforcement: 'deny', prepRunId: 'prep-empty-run' });
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'no enforceable contract in either location → allow');
  assert.doesNotMatch(readEvents(currentDir), /SPEC_CONTRACT_DISCIPLINE_MISSING/,
    'no audit event when there is no contract to enforce');
});

// ---- INT1-S2b — PREP_RUN_ID points to a NON-EXISTENT prior run → allow --------
test('INT1-S2b: PREP_RUN_ID names a run dir that does not exist → ALLOW (fail-open)', () => {
  const root = mkRunsRoot('f7-s2b-');
  const currentDir = seedSiblings(root, { /* no prior run created */ });
  const { stdout } = runGuard(currentDir, { enforcement: 'deny', prepRunId: 'no-such-run' });
  assert.ok(!isDeny(stdout), 'missing prior run → no contract found → allow');
});

// ---- INT1-S3 (security, INT-2) — prior contract UNSIGNED → not trusted → allow
test('INT1-S3: prior sealed contract is UNSIGNED → not authoritative → ALLOW (B1 CRYPTO / INT-2)', () => {
  const root = mkRunsRoot('f7-s3-');
  const currentDir = seedSiblings(root, {
    prepRunId: 'prep-unsigned-run',
    priorContract: SEALED_CONTRACT,
    priorSigned: false, // UNSIGNED prior sentinel
    currentGateDecisions: [{ gate: 'SOME_OTHER', decision: 'CONFIRMED' }],
  });
  const { code, stdout } = runGuard(currentDir, { enforcement: 'deny', prepRunId: 'prep-unsigned-run' });
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'an unsigned prior contract must NOT be honored → allow');
});

// ---- INT1-S4 (positive control) — prior gates satisfied in current run → allow
test('INT1-S4: prior contract gates ARE satisfied in the current run gate-decisions → ALLOW', () => {
  const root = mkRunsRoot('f7-s4-');
  const currentDir = seedSiblings(root, {
    prepRunId: 'prep-spec-run',
    priorContract: SEALED_CONTRACT,
    currentGateDecisions: [
      { gate: 'TDD_APPROVAL', decision: 'APPROVED' },
      { gate: 'ADVERSARIAL_BLOCK', decision: 'CONFIRMED' },
      { gate: 'ADVERSARIAL_LOOP_CHECKPOINT', decision: 'TRIGGERED' },
    ],
  });
  const { stdout } = runGuard(currentDir, { enforcement: 'deny', prepRunId: 'prep-spec-run' });
  assert.ok(!isDeny(stdout), 'all required gates satisfied → allow');
});

cleanup();
console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
