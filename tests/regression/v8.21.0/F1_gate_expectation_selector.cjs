#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 (v8.21.0) — GateExpectation selector contract (Slice S2). TDD RED.
// =============================================================================
// GOAL: pin the contract of the NEW pure leaf module
// `lib/contracts/gate-expectation.cjs` that subtasks 3.1/3.2 will CREATE. It
// exports:
//   * GATE_CLASS — Object.freeze mapping every gate name → one of exactly 3
//     classes: 'happy-path' | 'exception-only' | 'phase-conditional'.
//   * recalibratedExpectedGates(input) — a PURE, IO-free selector that filters a
//     caller-injected baseSet down to the gates a run should ACTUALLY be measured
//     against, given the run's failure contexts and reached phases.
//   * RULER_VERSION = '2'.
//
// WHY THIS IS A GENUINE RED (right reason): the module does NOT exist yet, so
// `require()` of it throws MODULE_NOT_FOUND. To keep this a VALID assertion-style
// RED (a test that RUNS and fails on assertions, not one that crashes on an
// import/syntax error — see the pre-tester RED matrix), the require is wrapped in
// a try/catch and every case asserts the module + its exports are present FIRST.
// Each case therefore fails on a clean assertion ("module/export must exist")
// while the test file itself loads, parses and runs to completion and exits
// non-zero. After 3.1/3.2 ship the real leaf, every case goes GREEN with zero
// test edits.
//
// -----------------------------------------------------------------------------
// CONTRACT (from design.md "GateExpectation — contrato (bloco completo)"):
//   recalibratedExpectedGates(input) with
//     input = { baseSet: string[], workflowKey, variant, terminalStage,
//               complexity, type, failureContexts: string[], phasesReached: string[] }
//   returns { expected: string[], excluded: [{gate,class,reason}], rulerVersion }
//   Rules:
//     - expected ⊆ baseSet (never invents a gate outside the injected baseSet);
//     - 'happy-path' gate is UNCONDITIONALLY required (stays in expected);
//     - 'exception-only' gate enters expected ONLY IF failureContexts carries its
//       corresponding context — with no failures, every exception-only gate is
//       excluded;
//     - 'phase-conditional' gate enters expected ONLY IF its phase ∈ phasesReached;
//     - an UNKNOWN gate (absent from GATE_CLASS) defaults to 'happy-path'
//       (conservative: it stays required, never silently dropped);
//     - malformed input → returns baseSet UNCHANGED + degraded:true (fail-safe:
//       an error NEVER makes the ruler MORE permissive).
//   Completeness: Object.keys(GATE_CLASS) covers 1:1 the UNION of
//   MANDATORY_GATES_BY_COMPLEXITY (26 gates) — a forgotten classification FAILS
//   the parity case (the conservative unknown→happy-path default must not be
//   allowed to mask a missing classification).
//
// The production module is a PURE LEAF (zero require of lib/). This TEST imports
// MANDATORY_GATES_BY_COMPLEXITY from lib/fidelity-reporter.cjs to DERIVE the
// completeness union — deriving it (never hardcoding) is what makes the parity
// case catch a future table edit.
// =============================================================================

const assert = require('node:assert/strict');

// --- module under test: load defensively so the file RUNS even while absent ---
const MOD_PATH = '../../../lib/contracts/gate-expectation.cjs';
let mod = null;
let loadErr = null;
try {
  mod = require(MOD_PATH); // eslint-disable-line global-require
} catch (e) {
  loadErr = e;
}

// Import the mandatory-gates SSOT ONLY in the test (the production leaf must not
// depend on it). This require MUST succeed — if it throws, the RED is the WRONG
// kind (a real path error to fix) rather than "module not implemented yet".
const { MANDATORY_GATES_BY_COMPLEXITY } = require('../../../lib/fidelity-reporter.cjs');

const VALID_CLASSES = new Set(['happy-path', 'exception-only', 'phase-conditional']);

// Assert the module loaded + return it. Turns "module absent" into a clean
// assertion failure instead of a top-level crash.
function need() {
  assert.ok(
    mod && typeof mod === 'object',
    `lib/contracts/gate-expectation.cjs must exist and export an object`
      + (loadErr ? ` (load error: ${loadErr.message})` : ''),
  );
  return mod;
}

// Derive the completeness union from the mandatory-gates table (NOT hardcoded).
function mandatoryUnion() {
  const set = new Set();
  for (const arr of Object.values(MANDATORY_GATES_BY_COMPLEXITY)) {
    if (Array.isArray(arr)) for (const g of arr) set.add(g);
  }
  return set;
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

// Find a gate of a given class from GATE_CLASS (so cases stay mapping-agnostic:
// they select the gate to test FROM the module's own taxonomy).
function gateOfClass(cls) {
  const gc = mod && mod.GATE_CLASS;
  if (!gc || typeof gc !== 'object') return null;
  for (const [gate, c] of Object.entries(gc)) if (c === cls) return gate;
  return null;
}

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e && e.message}`); fail++; failed.push(name); }
}

console.log('=== F1 v8.21.0 — GateExpectation selector contract [RED] ===');

// 1 — [MAIN] exports present + correct shapes ---------------------------------
test('F1-1 [MAIN] exports GATE_CLASS (frozen), recalibratedExpectedGates (fn), RULER_VERSION==="2"', () => {
  const M = need();
  assert.equal(typeof M.recalibratedExpectedGates, 'function', 'recalibratedExpectedGates must be a function');
  assert.ok(M.GATE_CLASS && typeof M.GATE_CLASS === 'object', 'GATE_CLASS must be an object');
  assert.ok(Object.isFrozen(M.GATE_CLASS), 'GATE_CLASS must be Object.freeze-d (frozen taxonomy)');
  assert.equal(M.RULER_VERSION, '2', 'RULER_VERSION must be the string "2"');
  for (const [gate, cls] of Object.entries(M.GATE_CLASS)) {
    assert.ok(VALID_CLASSES.has(cls), `GATE_CLASS['${gate}'] = '${cls}' must be one of the 3 valid classes`);
  }
});

// 2 — [MAIN] subset invariant: expected ⊆ baseSet -----------------------------
test('F1-2 [MAIN] subset — expected is always a subset of the injected baseSet', () => {
  const M = need();
  const baseSet = ['COMPLEXITY_GATE', 'STOP_RULE', 'FINAL_ADVERSARIAL_GATE'];
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'MEDIA', type: 'Bug Fix',
    failureContexts: ['anything'], phasesReached: ['everything'],
  });
  assert.ok(Array.isArray(out.expected), 'result.expected must be an array');
  for (const g of out.expected) {
    assert.ok(baseSet.includes(g), `expected gate '${g}' must come from baseSet (no gate invented outside baseSet)`);
  }
});

// 3 — exception-only excluded when there is NO failure context (core "SOMENTE se")
test('F1-3 exception-only — excluded from expected when failureContexts is empty', () => {
  const M = need();
  const exc = gateOfClass('exception-only');
  assert.ok(exc, 'GATE_CLASS must classify at least one gate as exception-only');
  const baseSet = [exc, 'COMPLEXITY_GATE'];
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'MEDIA', type: 'Bug Fix',
    failureContexts: [], phasesReached: [],
  });
  assert.ok(!out.expected.includes(exc),
    `an exception-only gate ('${exc}') must NOT be expected on a run with no failures`);
  const ex = (out.excluded || []).find((e) => e && e.gate === exc);
  assert.ok(ex, `the excluded gate '${exc}' must appear in result.excluded`);
  assert.equal(ex.class, 'exception-only', 'the excluded entry must carry its class');
});

// 4 — phase-conditional excluded when its phase was NOT reached (core "SOMENTE se")
test('F1-4 phase-conditional — excluded from expected when phasesReached does not include its phase', () => {
  const M = need();
  const pc = gateOfClass('phase-conditional');
  assert.ok(pc, 'GATE_CLASS must classify at least one gate as phase-conditional');
  const baseSet = [pc, 'COMPLEXITY_GATE'];
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'COMPLEXA', type: 'Spec',
    failureContexts: [], phasesReached: [], // no phases reached at all
  });
  assert.ok(!out.expected.includes(pc),
    `a phase-conditional gate ('${pc}') must NOT be expected when its phase was never reached`);
});

// 5 — happy-path is UNCONDITIONALLY required ----------------------------------
test('F1-5 happy-path — always in expected, even with empty contexts and phases', () => {
  const M = need();
  const hp = gateOfClass('happy-path');
  assert.ok(hp, 'GATE_CLASS must classify at least one gate as happy-path');
  const baseSet = [hp];
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'SIMPLES', type: 'Bug Fix',
    failureContexts: [], phasesReached: [],
  });
  assert.ok(out.expected.includes(hp),
    `a happy-path gate ('${hp}') is unconditionally required and must stay in expected`);
});

// 6 — [EDGE] unknown gate → conservative happy-path default → stays required ---
test('F1-6 [EDGE] unknown gate — absent from GATE_CLASS defaults to happy-path (stays required)', () => {
  const M = need();
  const unknown = 'TOTALLY_MADE_UP_GATE_XYZ';
  assert.ok(!(unknown in M.GATE_CLASS), 'precondition: the fake gate must be unknown to GATE_CLASS');
  const out = M.recalibratedExpectedGates({
    baseSet: [unknown], workflowKey: 'FULL', complexity: 'MEDIA', type: 'Bug Fix',
    failureContexts: [], phasesReached: [],
  });
  assert.ok(out.expected.includes(unknown),
    'an unknown gate must be treated conservatively as happy-path and remain required');
});

// 7 — [EDGE] malformed input → degraded + baseSet unchanged (never more permissive)
test('F1-7 [EDGE] malformed input — returns baseSet UNCHANGED + degraded:true (fail-safe)', () => {
  const M = need();
  const baseSet = ['COMPLEXITY_GATE', 'STOP_RULE', 'SPEC_SEALED'];
  // failureContexts is a string, not an array → malformed shape.
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'MEDIA', type: 'Spec',
    failureContexts: 'not-an-array', phasesReached: null,
  });
  assert.equal(out.degraded, true, 'malformed input must set degraded:true');
  assert.deepEqual(
    out.expected.slice().sort(),
    baseSet.slice().sort(),
    'on malformed input the ruler must fall back to the FULL baseSet (most-demanding — never more permissive)',
  );
  // A totally malformed (null) input must also degrade, not throw.
  const out2 = M.recalibratedExpectedGates(null);
  assert.equal(out2.degraded, true, 'null input must degrade gracefully (no throw)');
  assert.ok(Array.isArray(out2.expected), 'degraded result still exposes an expected array');
});

// 8 — DI: the baseSet is injected; nothing outside it is ever expected ---------
test('F1-8 DI — baseSet is injected; a gate absent from baseSet is never expected', () => {
  const M = need();
  const hp = gateOfClass('happy-path') || 'COMPLEXITY_GATE';
  // Inject a baseSet that OMITS a well-known happy-path gate to prove the ruler
  // does not pull expectations from a global/hidden set.
  const injected = ['SPEC_SEALED'];
  const out = M.recalibratedExpectedGates({
    baseSet: injected, workflowKey: 'Spec', complexity: 'COMPLEXA', type: 'Spec',
    terminalStage: 'sealed', failureContexts: [], phasesReached: ['seal'],
  });
  assert.ok(!out.expected.includes(hp) || injected.includes(hp),
    `'${hp}' is not in the injected baseSet, so it must not appear in expected (baseSet is the sole source)`);
});

// 9 — purity: no input mutation + deterministic -------------------------------
test('F1-9 purity — does not mutate input and is deterministic (no hidden IO/state)', () => {
  const M = need();
  const input = deepFreeze({
    baseSet: ['COMPLEXITY_GATE', 'STOP_RULE', 'FINAL_ADVERSARIAL_GATE'],
    workflowKey: 'FULL', complexity: 'COMPLEXA', type: 'Spec',
    failureContexts: [], phasesReached: [],
  });
  const snapshot = JSON.stringify(input);
  const a = M.recalibratedExpectedGates(input); // frozen input → a mutation attempt would throw
  const b = M.recalibratedExpectedGates(input);
  assert.equal(JSON.stringify(input), snapshot, 'input must not be mutated');
  assert.deepEqual(a.expected, b.expected, 'identical input must yield identical expected (deterministic)');
  assert.equal(a.rulerVersion, '2', 'result must carry rulerVersion "2"');
});

// 10 — [REGRESSION] completeness parity: GATE_CLASS covers the union 1:1 -------
test('F1-10 [REGRESSION] parity — GATE_CLASS classifies every gate in the MANDATORY_GATES_BY_COMPLEXITY union', () => {
  const M = need();
  const union = mandatoryUnion();
  assert.equal(union.size, 26,
    `sanity: the mandatory-gates union must be 26 gates (got ${union.size}) — update the taxonomy if the table changed`);
  const missing = [];
  for (const gate of union) {
    const cls = M.GATE_CLASS[gate];
    if (!VALID_CLASSES.has(cls)) missing.push(gate);
  }
  assert.deepEqual(missing, [],
    `every mandatory gate must have an explicit class — a forgotten classification (relying on the unknown→happy-path default) FAILS: ${missing.join(', ')}`);
});

// 11 — exception-only POSITIVE branch: own name IN failureContexts → INCLUDED ------
// Complements F1-3 (exclusion): F1-3 alone would still pass if the predicate were
// broken to ALWAYS-exclude every exception-only gate. This pins the inclusion side.
test('F1-11 exception-only — INCLUDED when its own name IS present in failureContexts', () => {
  const M = need();
  const exc = gateOfClass('exception-only');
  assert.ok(exc, 'GATE_CLASS must classify at least one gate as exception-only');
  const baseSet = [exc, 'COMPLEXITY_GATE'];
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'MEDIA', type: 'Bug Fix',
    failureContexts: [exc], phasesReached: [], // the gate's OWN name is the failure context
  });
  assert.ok(out.expected.includes(exc),
    `an exception-only gate ('${exc}') whose own name IS in failureContexts must be INCLUDED in expected`);
  const stillExcluded = (out.excluded || []).find((e) => e && e.gate === exc);
  assert.ok(!stillExcluded,
    `the now-expected gate '${exc}' must NOT also appear in result.excluded`);
});

// 12 — phase-conditional POSITIVE branch: mapped phase IN phasesReached → INCLUDED --
// Complements F1-4 (exclusion): F1-4 alone would still pass if the phase branch were
// broken to ALWAYS-exclude. FINAL_ADVERSARIAL_GATE is the canonical phase-conditional
// gate; its mapped phase is 'final' (design.md "GateExpectation — contrato"). The
// precondition assert makes a taxonomy drift fail loudly instead of silently skipping.
test('F1-12 phase-conditional — INCLUDED when its mapped phase IS present in phasesReached', () => {
  const M = need();
  const pc = 'FINAL_ADVERSARIAL_GATE';
  assert.equal(M.GATE_CLASS[pc], 'phase-conditional',
    `precondition: '${pc}' must be classified phase-conditional in GATE_CLASS`);
  const baseSet = [pc, 'COMPLEXITY_GATE'];
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'COMPLEXA', type: 'Spec',
    failureContexts: [], phasesReached: ['final'], // the gate's mapped phase WAS reached
  });
  assert.ok(out.expected.includes(pc),
    `a phase-conditional gate ('${pc}') whose mapped phase ('final') IS in phasesReached must be INCLUDED in expected`);
  const stillExcluded = (out.excluded || []).find((e) => e && e.gate === pc);
  assert.ok(!stillExcluded,
    `the now-expected gate '${pc}' must NOT also appear in result.excluded`);
});

// 13 — [EDGE] present-but-wrong-type phasesReached (a string) → degrade to FULL set --
// Covers the fail-safe branch for a phasesReached that is present, non-null and
// non-array while the rest of the input is valid: it must still degrade to the
// conservative FULL baseSet, NEVER the permissive empty set.
test('F1-13 [EDGE] wrong-type phasesReached — a present non-array value degrades to the FULL baseSet (never empty)', () => {
  const M = need();
  const baseSet = ['COMPLEXITY_GATE', 'STOP_RULE', 'SPEC_SEALED'];
  const out = M.recalibratedExpectedGates({
    baseSet, workflowKey: 'FULL', complexity: 'COMPLEXA', type: 'Spec',
    failureContexts: [], // valid array — ONLY phasesReached is malformed
    phasesReached: 'not-an-array',
  });
  assert.equal(out.degraded, true,
    'a present-but-wrong-type phasesReached (a string) must set degraded:true');
  assert.deepEqual(
    out.expected.slice().sort(),
    baseSet.slice().sort(),
    'wrong-type phasesReached must fall back to the FULL baseSet (conservative/most-demanding — NOT the permissive empty set)');
  assert.ok(out.expected.length > 0,
    'the degraded result must be the FULL baseSet, never the empty (most-permissive) set');
});

// 14 — [REGRESSION] explicit taxonomy pins for the spec-authoring gates ---------
// The selector-driven cases pick a class representative via gateOfClass(), which
// returns only the FIRST class member in insertion order — so each class is
// exercised through ONE gate. The spec-authoring gates that Batch 2/3 scoring
// depends on (SPEC_SEALED / SPEC_REVIEW_FINDINGS score a sealed spec-authoring
// run) are otherwise only validated as "member of a valid class" (F1-1 / F1-10),
// never that they are classified CORRECTLY. A silent inversion (e.g. SPEC_SEALED
// becoming exception-only by mistake) would still pass every other F1 assertion
// yet corrupt downstream scoring. These explicit pins mirror F1-12's
// FINAL_ADVERSARIAL_GATE pin and fail loudly on any such drift.
test('F1-14 [REGRESSION] taxonomy pin — spec-authoring gates keep their exact class (SPEC_SEALED/SPEC_REVIEW_FINDINGS happy-path; SPEC_POST_IMPL_FAIL/ADVERSARIAL_LOOP_CHECKPOINT phase-conditional)', () => {
  const M = need();
  const GC = M.GATE_CLASS;
  assert.equal(GC.SPEC_SEALED, 'happy-path',
    "SPEC_SEALED must stay 'happy-path' (unconditionally required to score a sealed spec-authoring run — Batch 2/3 depend on it)");
  assert.equal(GC.SPEC_REVIEW_FINDINGS, 'happy-path',
    "SPEC_REVIEW_FINDINGS must stay 'happy-path' (unconditionally required for spec-authoring scoring — Batch 2/3 depend on it)");
  assert.equal(GC.SPEC_POST_IMPL_FAIL, 'phase-conditional',
    "SPEC_POST_IMPL_FAIL must stay 'phase-conditional' (expected only when its mapped phase was reached)");
  assert.equal(GC.ADVERSARIAL_LOOP_CHECKPOINT, 'phase-conditional',
    "ADVERSARIAL_LOOP_CHECKPOINT must stay 'phase-conditional' (expected only when its mapped phase was reached)");
});

// 15 — [EDGE] exotic baseSet element that THROWS on property-key coercion --------
// Guards the per-gate classification loop: hasOwn.call(GATE_CLASS, gate) coerces
// `gate` to a property key (ToPropertyKey → toString/valueOf/Symbol.toPrimitive).
// A single throwing element must NOT let the exception escape (the module's
// documented "never throws" guarantee) — it degrades and the element is routed
// through the conservative default (kept required), never silently dropped (which
// would relax the ruler). A well-formed sibling gate stays classified normally.
test('F1-15 [EDGE] exotic throwing element — a baseSet element whose toString throws must NOT crash the selector; it degrades and stays required (never relaxes the ruler)', () => {
  const M = need();
  const exotic = { toString() { throw new Error('boom'); } };
  const baseSet = [exotic, 'COMPLEXITY_GATE'];
  let out;
  assert.doesNotThrow(() => {
    out = M.recalibratedExpectedGates({
      baseSet, workflowKey: 'FULL', complexity: 'MEDIA', type: 'Bug Fix',
      failureContexts: [], phasesReached: [],
    });
  }, 'a throwing baseSet element must NOT let the exception escape (module "never throws" guarantee)');
  assert.ok(out && typeof out === 'object', 'must still return a well-formed result object');
  assert.ok(Array.isArray(out.expected), 'result.expected must be an array');
  assert.equal(out.rulerVersion, '2', 'result must still carry rulerVersion "2"');
  // The exotic element must NOT be silently dropped — that would relax the ruler.
  assert.ok(out.expected.includes(exotic),
    'the unclassifiable (throwing) element must be kept required via the conservative default, never dropped');
  // A well-formed sibling gate is unaffected (still classified normally).
  assert.ok(out.expected.includes('COMPLEXITY_GATE'),
    'a valid sibling gate must still be classified normally (happy-path stays required)');
  // This path signals could-not-fully-compute via degraded:true (most-conservative).
  assert.equal(out.degraded, true,
    'a per-element coercion failure must flag degraded:true (the most-conservative could-not-compute signal)');
});

// 16 — [EDGE] element behind a getter that THROWS on RETRIEVAL (distinct from F1-15) --
// F1-15 covers a RETRIEVABLE object whose toString throws during property-key
// coercion (the body try/catch surface). F1-16 covers the DISTINCT surface where
// element RETRIEVAL itself throws: a getter-backed index. With a for-of loop the
// iterator's `.next()` would throw BEFORE the per-element body try/catch is entered
// (`gate` is never bound), so the exception would escape the selector uncaught —
// violating the documented "never throws" guarantee (SELECTOR-LEAF-6). The input
// carries VALID failureContexts/phasesReached so it reaches the PRIMARY (loop) path.
// Contract: NO throw + degraded:true, and a readable sibling gate is still
// classified normally (the unreadable element is skipped, never crashes the loop).
test('F1-16 [EDGE] throwing index getter — a baseSet element whose RETRIEVAL throws (getter) must NOT crash the selector; it degrades and a readable sibling is still classified', () => {
  const M = need();
  // Element 0 is a getter that throws the moment it is read; element 1 is a plain,
  // classifiable happy-path gate. Retrieval of index 0 throws (unlike F1-15, where
  // retrieval succeeds and only the toString coercion throws).
  const hostile = [];
  Object.defineProperty(hostile, 0, {
    get() { throw new Error('boom'); },
    enumerable: true,
    configurable: true,
  });
  hostile[1] = 'COMPLEXITY_GATE'; // sets length to 2; index 0 stays the throwing getter
  let out;
  assert.doesNotThrow(() => {
    out = M.recalibratedExpectedGates({
      baseSet: hostile, workflowKey: 'FULL', complexity: 'MEDIA', type: 'Bug Fix',
      failureContexts: [], phasesReached: [], // VALID arrays → PRIMARY (loop) path
    });
  }, 'an element whose getter throws on retrieval must NOT let the exception escape (module "never throws" guarantee, retrieval surface)');
  assert.ok(out && typeof out === 'object', 'must still return a well-formed result object');
  assert.ok(Array.isArray(out.expected), 'result.expected must be an array');
  assert.equal(out.rulerVersion, '2', 'result must still carry rulerVersion "2"');
  assert.equal(out.degraded, true,
    'an unreadable (throwing-getter) element must flag degraded:true (the most-conservative could-not-compute signal)');
  // The readable sibling is still classified normally — the throwing neighbor must
  // not abort the whole loop (conservative non-empty set on the primary path).
  assert.ok(out.expected.includes('COMPLEXITY_GATE'),
    'a readable sibling gate must still be classified normally despite a throwing-getter neighbor (loop must not abort)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
