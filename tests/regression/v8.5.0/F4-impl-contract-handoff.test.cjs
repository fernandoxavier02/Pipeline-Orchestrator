#!/usr/bin/env node
'use strict';

/**
 * F4 (v8.5.0) — B4: implementation_contract enforcement —
 *   dispatch-guard.handleSealedSpecImplementation() + final-validator Step 1c.
 *
 * RED phase (TDD). These tests MUST FAIL today because:
 *   - .claude/hooks/dispatch-guard.cjs has NO handleSealedSpecImplementation()
 *     branch in handleInput, so an Agent dispatch against a sealed
 *     implementation_contract with unsatisfied gates is never denied / audited.
 *   - agents/core/final-validator.md has NO Step 1c (the GO→CONDITIONAL
 *     downgrade prose for SPEC_CONTRACT_DISCIPLINE_MISSING) — asserted by a
 *     static prose check.
 *
 * The hook is exercised end-to-end the way it actually runs: a PreToolUse:Agent
 * JSON on stdin, PIPELINE_DOC_PATH + enforcement env set, decision read off
 * stdout. The hook always exits 0; a deny appears as permissionDecision:"deny".
 *
 * Scenarios covered (7): B4-S1 .. B4-S7.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const DISPATCH_GUARD = path.join(ROOT, '.claude', 'hooks', 'dispatch-guard.cjs');
const FINAL_VALIDATOR = path.join(ROOT, 'agents', 'core', 'final-validator.md');
const { writeSignedState } = require(path.join(ROOT, 'lib', 'sentinel-state-signer.cjs'));

// An implementation agent (a valid roster leaf the sealed-spec handler targets).
const IMPL_AGENT = 'pipeline-orchestrator:executor:executor-implementer-task';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

const _tmpDirs = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  _tmpDirs.push(d);
  return d;
}
function cleanup() {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* best-effort */ }
  }
}

// Run dispatch-guard as a child process with a PreToolUse:Agent payload.
//
// Isolation: dispatch-guard ALSO runs the pre-existing PLAN_MODE and BRAINSTORM
// handlers on this Agent dispatch (executor-implementer-task is in both
// rosters). To isolate the NEW handleSealedSpecImplementation behavior, we force
// the two pre-existing enforcers to warn-first so they can NEVER emit a deny —
// any deny that appears on stdout must therefore come from the sealed-spec
// handler under test. The sentinel here carries NO orchestrator_decision, which
// already takes the brainstorm handler out of scope; pinning warn is belt-and-
// suspenders so an unreadable-sentinel fixture (B4-S5/S6) cannot trip the
// brainstorm default-deny.
function runGuard(docPath, { enforcement, hmacStrict } = {}) {
  const env = {
    ...process.env,
    PIPELINE_DOC_PATH: docPath,
    PIPELINE_PLAN_MODE_ENFORCEMENT: 'warn',
    PIPELINE_BRAINSTORM_ENFORCEMENT: 'warn',
  };
  delete env.PIPELINE_RUN_ID;
  if (enforcement) env.PIPELINE_SPEC_AUTHORING_ENFORCEMENT = enforcement;
  else delete env.PIPELINE_SPEC_AUTHORING_ENFORCEMENT;
  if (hmacStrict) env.PIPELINE_HMAC_STRICT = 'true';
  const input = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { subagent_type: IMPL_AGENT, description: 'impl', prompt: 'do work' },
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

// Seed a signed sentinel with a given implementation_contract (or none).
function seed(docPath, { contract, gateDecisions } = {}) {
  const state = { run_id: 'f4-run' };
  if (contract !== undefined) state.implementation_contract = contract;
  writeSignedState(path.join(docPath, 'sentinel-state.json'), state);
  if (gateDecisions) {
    fs.writeFileSync(path.join(docPath, 'gate-decisions.jsonl'),
      gateDecisions.map((g) => JSON.stringify(g)).join('\n') + '\n');
  }
}

console.log('=== F4 v8.5.0 — implementation_contract handoff (RED) ===');

// ---- B4-S1 (main) — no contract → allow (back-compat) ----------------------
test('B4-S1: handler allows dispatch when no implementation_contract exists', () => {
  const docPath = mkTmp('f4-s1-');
  seed(docPath, { contract: undefined });
  const { code, stdout } = runGuard(docPath, { enforcement: 'deny' });
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'no contract → allow');
  assert.doesNotMatch(readEvents(docPath), /SPEC_CONTRACT_DISCIPLINE_MISSING/,
    'no audit event for a missing contract');
});

// ---- B4-S2 (main) — gates satisfied → allow --------------------------------
test('B4-S2: handler allows when required_impl_gates are satisfied in gate-decisions.jsonl', () => {
  const docPath = mkTmp('f4-s2-');
  seed(docPath, {
    contract: { sealed: true, required_impl_gates: ['TDD_APPROVAL'], spec_dir: '01-spec' },
    gateDecisions: [{ gate: 'TDD_APPROVAL', decision: 'APPROVED', hardness: 'MANDATORY' }],
  });
  const { code, stdout } = runGuard(docPath, { enforcement: 'deny' });
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'satisfied gates → allow');
});

// ---- B4-S3 (main) — gates unsatisfied + deny → deny + audit ----------------
test('B4-S3: handler denies + emits SPEC_CONTRACT_DISCIPLINE_MISSING when gates unsatisfied under deny', () => {
  const docPath = mkTmp('f4-s3-');
  seed(docPath, {
    contract: { sealed: true, required_impl_gates: ['TDD_APPROVAL'], spec_dir: '01-spec' },
    // gate-decisions.jsonl present but WITHOUT a satisfying TDD_APPROVAL entry.
    gateDecisions: [{ gate: 'SOME_OTHER', decision: 'CONFIRMED' }],
  });
  const { stdout } = runGuard(docPath, { enforcement: 'deny' });
  assert.ok(isDeny(stdout), 'unsatisfied gates under deny → deny');
  assert.match(readEvents(docPath), /SPEC_CONTRACT_DISCIPLINE_MISSING/,
    'must write SPEC_CONTRACT_DISCIPLINE_MISSING to protocol-events.jsonl');
});

// ---- B4-S4 (regression) — empty required_impl_gates → allow ----------------
test('B4-S4: handler allows when required_impl_gates is an empty array', () => {
  const docPath = mkTmp('f4-s4-');
  seed(docPath, { contract: { sealed: true, required_impl_gates: [], spec_dir: '01-spec' } });
  const { code, stdout } = runGuard(docPath, { enforcement: 'deny' });
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'no required gates → allow');
});

// ---- B4-S5 (regression) — unreadable sentinel + deny → fail-closed ---------
test('B4-S5: handler fails closed (deny) when sentinel unreadable and enforcement=deny', () => {
  const docPath = mkTmp('f4-s5-'); // no sentinel-state.json written
  const { stdout } = runGuard(docPath, { enforcement: 'deny' });
  assert.ok(isDeny(stdout), 'unreadable sentinel under deny → fail-closed deny');
});

// ---- B4-S6 (regression) — unreadable sentinel + warn → fail-open -----------
test('B4-S6: handler fails open (allow) when sentinel unreadable and enforcement=warn (default)', () => {
  const docPath = mkTmp('f4-s6-'); // no sentinel-state.json
  const { code, stdout } = runGuard(docPath, { enforcement: 'warn' });
  assert.equal(code, 0, 'hook exits 0');
  assert.ok(!isDeny(stdout), 'unreadable sentinel under warn → fail-open allow');
});

// ---- B4-S7 (edge) — final-validator Step 1c downgrade prose ----------------
test('B4-S7: final-validator declares Step 1c GO→CONDITIONAL downgrade for SPEC_CONTRACT_DISCIPLINE_MISSING', () => {
  const md = fs.readFileSync(FINAL_VALIDATOR, 'utf8');
  // Step 1c must (a) name the event and (b) describe a GO→CONDITIONAL downgrade.
  assert.match(md, /SPEC_CONTRACT_DISCIPLINE_MISSING/,
    'final-validator must reference SPEC_CONTRACT_DISCIPLINE_MISSING');
  assert.match(md, /Step\s*1c/i, 'final-validator must declare a Step 1c');
  assert.match(md, /GO\s*(?:→|->|to)\s*CONDITIONAL/i,
    'Step 1c must describe a GO→CONDITIONAL downgrade');
});

cleanup();
console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
