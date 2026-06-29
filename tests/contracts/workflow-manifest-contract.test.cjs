#!/usr/bin/env node
'use strict';

// =============================================================================
// workflow-manifest-contract.test.cjs — T1 (REQ-MANIFEST), TDD RED phase.
//
// Pure-contract tests for the not-yet-existing module
//   lib/contracts/workflow-manifest.cjs
// covering the 13 user-APPROVED scenarios S1-1..S1-13 from
//   05-quality-gate-router.md → T1.
//
// EXPECTED RED REASON: `require('../../lib/contracts/workflow-manifest.cjs')`
// throws MODULE_NOT_FOUND because the module does not exist yet. The harness
// below converts that require failure into a single visible [FAIL] line per
// check (not an uncaught crash) so the RED is observable as an assertion-style
// failure, never a runner abort. When the module ships with the frozen
// WORKFLOWS SSOT + helpers, every check turns GREEN.
//
// Q3 deny-gate pairing for this task:
//   deny-bad : S1-2 (illegal FULL transition denied), S1-8 (governed-corrupt → deny)
//   allow-good: S1-3 (non-FULL spine absent → allow), S1-9 (ungoverned/absent → not deny)
//
// FULL spine SSOT (derived from lib/step-ledger.cjs:28-35 + :74-86, NOT invented):
//   steps : classify, info-gate, proposal, plan, tdd, execute, adversarial, sanity, final
//   agent→step map (FULL): task-orchestrator→classify, information-gate→info-gate,
//     plan-architect→plan, quality-gate-router→tdd, pre-tester→tdd,
//     executor-controller→execute, review-orchestrator→adversarial,
//     sanity-checker→sanity, final-validator→final.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../../lib/contracts/workflow-manifest.cjs');

// Lazy require so a missing module fails each check on an assertion line, not at
// load time (keeps the RED observable as N failing checks, not a runner crash).
function load() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(MODULE_PATH);
}

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== T1 workflow-manifest.cjs pure contract (RED until module ships) ===');

// ---- S1-1 [main] valid FULL transition → true -------------------------------
test('S1-1 [main] isTransitionAllowed(FULL, classify, info-gate) → true', () => {
  const m = load();
  assert.equal(typeof m.isTransitionAllowed, 'function', 'isTransitionAllowed must be exported');
  assert.equal(m.isTransitionAllowed('FULL', 'classify', 'info-gate'), true);
});

// ---- S1-2 [deny-bad] illegal FULL transition → false ------------------------
test('S1-2 [deny-bad] isTransitionAllowed(FULL, final, classify) → false (illegal backward jump denied)', () => {
  const m = load();
  assert.equal(m.isTransitionAllowed('FULL', 'final', 'classify'), false);
});

// ---- S1-3 [allow-good] non-FULL spine absent → allow ------------------------
test('S1-3 [allow-good] isTransitionAllowed(Spec, any, any) → true (absent spine must not block)', () => {
  const m = load();
  assert.equal(m.isTransitionAllowed('Spec', 'requirements', 'design'), true,
    'a mode whose agents_by_step is null must allow every transition (anti-deadlock)');
  assert.equal(m.isTransitionAllowed('Spec', 'design', 'requirements'), true,
    'even a backward pair under a null spine allows (ungoverned)');
});

// ---- S1-4 [main] nextAllowedAgents derived only from the FULL map -----------
test('S1-4 [main] nextAllowedAgents(FULL, info-gate) returns derived leaves, nothing invented', () => {
  const m = load();
  assert.equal(typeof m.nextAllowedAgents, 'function', 'nextAllowedAgents must be exported');
  const next = m.nextAllowedAgents('FULL', 'info-gate');
  const asArray = Array.isArray(next) ? next : Array.from(next || []);
  // The step after info-gate in the FULL spine is 'plan' → plan-architect.
  assert.ok(asArray.includes('plan-architect'),
    `expected plan-architect among next agents after info-gate, got [${asArray.join(', ')}]`);
  // Anti-invention: every returned leaf must be a real key of the FULL agent map.
  const KNOWN = new Set([
    'task-orchestrator', 'information-gate', 'plan-architect', 'quality-gate-router',
    'pre-tester', 'executor-controller', 'review-orchestrator', 'sanity-checker', 'final-validator',
  ]);
  for (const leaf of asArray) {
    assert.ok(KNOWN.has(leaf), `nextAllowedAgents invented an agent not in the FULL map: "${leaf}"`);
  }
});

// ---- S1-5 [main] isTerminal classification ----------------------------------
test('S1-5 [main] isTerminal true for terminal states, false for running/pending', () => {
  const m = load();
  assert.equal(typeof m.isTerminal, 'function', 'isTerminal must be exported');
  for (const t of ['completed', 'hard_failed', 'aborted_by_user', 'cancelled']) {
    assert.equal(m.isTerminal(t), true, `${t} must be terminal`);
  }
  assert.equal(m.isTerminal('running'), false);
  assert.equal(m.isTerminal('pending'), false);
});

// ---- S1-6 [main] buildEvidenceRequired keys all map to real FULL steps ------
test('S1-6 [main] buildEvidenceRequired(FULL) returns per-step object, no invented step keys', () => {
  const m = load();
  assert.equal(typeof m.buildEvidenceRequired, 'function', 'buildEvidenceRequired must be exported');
  const ev = m.buildEvidenceRequired('FULL');
  assert.ok(ev && typeof ev === 'object', 'buildEvidenceRequired must return an object');
  const FULL_STEPS = new Set(['classify', 'info-gate', 'proposal', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final']);
  for (const k of Object.keys(ev)) {
    assert.ok(FULL_STEPS.has(k), `buildEvidenceRequired produced a key for a non-existent FULL step: "${k}"`);
  }
});

// ---- S1-7 [main] denyException(state_corrupt_governed) → 'deny' -------------
test('S1-7 [main] denyException(state_corrupt_governed) → "deny" (v8.8.0 H2 parity)', () => {
  const m = load();
  assert.equal(typeof m.denyException, 'function', 'denyException must be exported');
  assert.equal(m.denyException('state_corrupt_governed'), 'deny');
});

// ---- S1-8 [deny-bad] governed + corrupt → hard deny -------------------------
test('S1-8 [deny-bad] denyException governed-corrupt is a hard "deny" (not warn, not allow)', () => {
  const m = load();
  const r = m.denyException('state_corrupt_governed');
  assert.equal(r, 'deny');
  assert.notEqual(r, 'warn');
  assert.notEqual(r, 'allow');
});

// ---- S1-9 [allow-good] ungoverned/absent → NOT deny -------------------------
test('S1-9 [allow-good] denyException for ungoverned/absent is NOT "deny" (anti-deadlock)', () => {
  const m = load();
  for (const cond of ['ungoverned', 'state_absent', 'state_corrupt_ungoverned']) {
    assert.notEqual(m.denyException(cond), 'deny',
      `condition "${cond}" must NOT hard-deny — ungoverned/absent paths stay open`);
  }
});

// ---- S1-10 [edge] every non-FULL mode present with agents_by_step === null --
test('S1-10 [edge] non-FULL modes present with agents_by_step === null (GAP-02)', () => {
  const m = load();
  assert.ok(m.WORKFLOWS && typeof m.WORKFLOWS === 'object', 'WORKFLOWS SSOT must be exported');
  // v8.19.0: Spec now carries a single-leaf spine (seal → spec-controller), so it is
  // no longer in the null-spine set. Every OTHER non-FULL mode stays null.
  for (const mode of ['DIAGNOSTIC', 'REVIEW-ONLY', 'HOTFIX', 'PAPERCLIP', 'brainstorm']) {
    assert.ok(Object.prototype.hasOwnProperty.call(m.WORKFLOWS, mode),
      `WORKFLOWS must enumerate mode "${mode}"`);
    assert.strictEqual(m.WORKFLOWS[mode].agents_by_step, null,
      `mode "${mode}" must carry agents_by_step === null (exactly null, not {} or partial)`);
  }
});

// ---- S1-11 [edge] zero filesystem side-effects at require time ---------------
// The property under test is: the MODULE'S OWN CODE performs no filesystem
// reads/writes when required. We must NOT confuse that with the module LOADER's
// unavoidable read of the module's own source file — on Node 24 the loader reads
// the .cjs source via fs at require time, so a spy that simply throws on the first
// fs.readFileSync fires on the loader, not on the module's code (false negative).
//
// Mechanism: record the resolved path of every fs call made during the cold
// require, then assert NO recorded call targets a path OTHER than the module's own
// resolved source file or other files inside lib/contracts/ (the loader reading the
// module + its in-package requires are expected). A read of any unrelated
// data/config/state file is the real violation this scenario guards against.
test('S1-11 [edge] require has zero fs/env/io side-effects', () => {
  const fs = require('node:fs');
  const fsRealpath = path.resolve(MODULE_PATH);
  const CONTRACTS_DIR = path.resolve(__dirname, '../../lib/contracts') + path.sep;

  // A recorded path is "the loader reading our own module surface" iff it is the
  // module's own resolved source file or any other file under lib/contracts/.
  // Everything else is a genuine module-initiated side-effect.
  function isLoaderOwnRead(p) {
    if (typeof p !== 'string') return false;
    let resolved;
    try { resolved = path.resolve(p); } catch { return false; }
    return resolved === fsRealpath || resolved.startsWith(CONTRACTS_DIR);
  }

  const recorded = [];   // { key, path } for every fs call during require
  const spies = [];
  function spy(obj, key) {
    const orig = obj[key];
    obj[key] = function (...args) {
      recorded.push({ key, path: args[0] });
      return orig.apply(this, args);   // let the real call proceed (loader needs it)
    };
    spies.push(() => { obj[key] = orig; });
  }
  for (const k of ['writeFileSync', 'mkdirSync', 'appendFileSync', 'readFileSync', 'renameSync']) spy(fs, k);

  const beforeEnv = JSON.stringify(process.env);
  try {
    // Force a cold require so the spies see the module top-level load.
    delete require.cache[require.resolve(MODULE_PATH)];
    load();

    // The loader's read of the module's own source (and any sibling under
    // lib/contracts/) is expected and excluded. Any OTHER recorded fs call is a
    // real require-time side-effect by the module's own code.
    const violations = recorded.filter((r) => !isLoaderOwnRead(r.path));
    assert.equal(violations.length, 0,
      `require() initiated fs side-effect(s) outside the module's own source: ${
        violations.map((v) => `fs.${v.key}(${String(v.path)})`).join(', ')}`);

    // Writes/mkdir/append/rename are never part of the loader's source read — any
    // such recorded call is a side-effect regardless of path.
    const writes = recorded.filter((r) => r.key !== 'readFileSync');
    assert.equal(writes.length, 0,
      `require() performed an fs write/mkdir side-effect: ${
        writes.map((v) => `fs.${v.key}(${String(v.path)})`).join(', ')}`);

    assert.equal(JSON.stringify(process.env), beforeEnv, 'require must not mutate process.env');
  } finally {
    spies.forEach((restore) => restore());
  }
});

// ---- S1-12 [v8.19.0] Spec is a single-leaf spine (seal → spec-controller) ----
test('S1-12 [v8.19.0] WORKFLOWS.Spec is the single-leaf seal spine (one governed terminal leaf, no invented lifecycle)', () => {
  const m = load();
  assert.deepStrictEqual(m.WORKFLOWS.Spec.steps, ['seal']);
  assert.deepStrictEqual(m.WORKFLOWS.Spec.agents_by_step, { seal: ['spec-controller'] });
  assert.deepStrictEqual(m.WORKFLOWS.Spec.step_obligations, { seal: { result_required: true, evidence_required: false } });
  // NFR-7 anti-invention: only 'seal' exists — any other step stays ungoverned.
  assert.equal(m.stepForAgentType('Spec', 'spec-controller'), 'seal');
  assert.equal(m.isTransitionAllowed('Spec', 'requirements', 'design'), true,
    'a non-seal Spec step must stay ungoverned (anti-deadlock preserved)');
});

// ---- S1-13 [regression] brainstorm.agents_by_step === null ------------------
test('S1-13 [regression] WORKFLOWS.brainstorm.agents_by_step === null (prose table, not a code map)', () => {
  const m = load();
  assert.strictEqual(m.WORKFLOWS.brainstorm.agents_by_step, null);
});

// The 9 governed FULL spine leaves, enumerated ONCE here (the SSOT contract location).
const FULL_LEAF_STEP = {
  'task-orchestrator': 'classify',
  'information-gate': 'info-gate',
  'plan-architect': 'plan',
  'quality-gate-router': 'tdd',
  'pre-tester': 'tdd',
  'executor-controller': 'execute',
  'review-orchestrator': 'adversarial',
  'sanity-checker': 'sanity',
  'final-validator': 'final',
};

// ---- S1-14 [v8.18.2] stepForAgentType maps ALL 9 leaves + rejects non-leaf/falsy ----
test('S1-14 [v8.18.2] stepForAgentType maps all 9 FULL leaves and rejects non-leaf/falsy', () => {
  const m = load();
  assert.equal(typeof m.stepForAgentType, 'function', 'stepForAgentType must be exported');
  for (const [leaf, step] of Object.entries(FULL_LEAF_STEP)) {
    assert.equal(m.stepForAgentType('FULL', leaf), step, `stepForAgentType('FULL','${leaf}') must be '${step}'`);
  }
  for (const a of ['Explore', 'general-purpose', 'Plan', '', null, undefined, 42]) {
    assert.equal(m.stepForAgentType('FULL', a), null, `stepForAgentType('FULL',${JSON.stringify(a)}) must be null`);
  }
});

// ---- S1-15 [v8.18.2] isGovernedLeaf: 9 leaves true; harness/brainstorm/falsy false ----
test('S1-15 [v8.18.2] isGovernedLeaf true for the 9 leaves, false for harness/brainstorm/falsy', () => {
  const m = load();
  assert.equal(typeof m.isGovernedLeaf, 'function', 'isGovernedLeaf must be exported');
  for (const leaf of Object.keys(FULL_LEAF_STEP)) {
    assert.equal(m.isGovernedLeaf(leaf), true, `${leaf} must be a governed leaf`);
  }
  for (const a of ['Explore', 'general-purpose', 'Plan', 'code-reviewer', '', null, undefined, 42]) {
    assert.equal(m.isGovernedLeaf(a), false, `${JSON.stringify(a)} must NOT be a governed leaf`);
  }
  // A step-ledger brainstorm SPAWN leaf is deliberately NOT a result-block governed leaf here.
  assert.equal(m.isGovernedLeaf('brainstorm-step-00-intake'), false,
    'a step-ledger brainstorm spawn-order leaf is NOT a result-block-obligated governed leaf');
  // v8.19.0: spec-controller is the 10th governed leaf (Spec single-leaf spine).
  assert.equal(m.isGovernedLeaf('spec-controller'), true,
    'spec-controller must be a governed leaf (the Spec seal terminal leaf, v8.19.0)');
});

// ---- S1-16 [v8.18.2] stepForAgentType on a null-spine / unknown workflow → null ----
test('S1-16 [v8.18.2] stepForAgentType on a null-spine or unknown workflow → null (no invented spine)', () => {
  const m = load();
  assert.equal(m.stepForAgentType('REVIEW-ONLY', 'executor-controller'), null);
  assert.equal(m.stepForAgentType('Spec', 'final-validator'), null);
  assert.equal(m.stepForAgentType('nope-not-a-workflow', 'executor-controller'), null);
});

// ---- S1-17 [v8.18.2 drift-lock] manifest FULL spine ≡ step-ledger AGENT_STEP_MAP.FULL ----
// The manifest's FULL agents_by_step is a hand-transcribed inverse of step-ledger's
// AGENT_STEP_MAP.FULL. Two SSOTs of the SAME 9 governed leaves with no parity check =
// silent drift risk (add a 10th leaf to one, forget the other → the observer stops
// emitting for it while the spawn gate keeps governing it). This pins them in lockstep.
test('S1-17 [v8.18.2] FULL agents_by_step (manifest) is the EXACT inverse of AGENT_STEP_MAP.FULL (step-ledger)', () => {
  const m = load();
  // eslint-disable-next-line global-require
  const ledger = require('../../lib/step-ledger.cjs');
  const ledgerMap = ledger.AGENT_STEP_MAP.FULL;          // leaf -> step
  const manifestMap = m.WORKFLOWS.FULL.agents_by_step;   // step -> [leaves]

  const manifestLeafToStep = {};
  for (const step of Object.keys(manifestMap)) {
    for (const leaf of manifestMap[step]) {
      assert.ok(!(leaf in manifestLeafToStep), `manifest lists leaf ${leaf} under two steps`);
      manifestLeafToStep[leaf] = step;
    }
  }
  assert.deepEqual(
    Object.keys(manifestLeafToStep).sort(),
    Object.keys(ledgerMap).sort(),
    'FULL governed-leaf SET drifted between manifest agents_by_step and step-ledger AGENT_STEP_MAP.FULL',
  );
  for (const leaf of Object.keys(ledgerMap)) {
    assert.equal(manifestLeafToStep[leaf], ledgerMap[leaf],
      `leaf '${leaf}' maps to different steps (manifest='${manifestLeafToStep[leaf]}' ledger='${ledgerMap[leaf]}')`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until lib/contracts/workflow-manifest.cjs ships):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
