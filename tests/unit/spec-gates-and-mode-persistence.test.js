#!/usr/bin/env node
/**
 * tests/unit/spec-gates-and-mode-persistence.test.js
 *
 * Unit tests for Wave 5-spec (v4.13.0) — Spec Gates Registry + Inline Pipeline
 * Invariants + Mode Persistence Contract.
 *
 * GREEN phase (Batch D): stubs replaced with real implementations that read truth
 * from the SSOT files modified in Batches A-C:
 *
 *   - getGateHardness / getGateRecoveryAction → parse references/gates.md.
 *   - shouldEscalate                          → pure per-batch counter rule (Q1).
 *   - getInlineGatesFromPipeline              → parse commands/pipeline.md inline list
 *     (v4.13.0); v4.12.0 baseline is a frozen constant in this file.
 *   - mapVariantToModeUsed                    → pure spec-* → mode_used mapping.
 *
 * SSOT pointers (DO NOT modify in this phase):
 *   - references/gates.md                     → 22-gate registry
 *   - commands/pipeline.md                    → "Inline Invariants" gate list
 *   - agents/executor/spec-closer.md          → mode_used write contract
 *   - agents/core/pipeline-controller.md      → ADVERSARIAL_LOOP_CHECKPOINT counter
 *
 * Run:  node --test tests/unit/spec-gates-and-mode-persistence.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ─── Frozen SSOT — Scenario 1: the 6 new gates from v4.13.0 ───────────────────────────

const EXPECTED_NEW_GATES = Object.freeze({
  SPEC_ARTIFACT_MISSING:        'MANDATORY',
  SPEC_FORMAT_GATE_FAIL:        'HARD',
  SPEC_CONTENT_REVIEW_NOGO:     'HARD',
  SPEC_AC_TRACEABILITY_GAP:     'HARD',
  SPEC_POST_IMPL_FAIL:          'HARD',
  ADVERSARIAL_LOOP_CHECKPOINT:  'SOFT',
});

// ─── Frozen SSOT — Scenario 3: inline-gate lists per pipeline version ─────────────────
//
// v4.12.0 baseline: 15 inline gates already enforced by commands/pipeline.md.
// v4.13.0 = v4.12.0 ∪ {6 new spec gates}. The proper-subset relationship is what
// catches accidental removals/renames during Wave 5 edits.

const INLINE_GATES_V4_12_0 = Object.freeze([
  'SSOT_CONFLICT', 'ADVERSARIAL_GATE_MANDATORY',
  'INFO_GATE_BLOCKED', 'TDD_APPROVAL', 'PLAN_REJECTED', 'MICRO_GATE_GAP',
  'CHECKPOINT_FAIL', 'ADVERSARIAL_BLOCK', 'FINAL_ADVERSARIAL_REWORK',
  'STOP_RULE', 'FIX_LOOP_EXHAUSTED',
  'STALE_CONTEXT', 'ADVERSARIAL_GATE', 'FINAL_ADVERSARIAL_GATE', 'CLOSEOUT_CONFIRM',
]);

const INLINE_GATES_V4_13_0 = Object.freeze([
  ...INLINE_GATES_V4_12_0,
  'SPEC_ARTIFACT_MISSING',
  'SPEC_FORMAT_GATE_FAIL', 'SPEC_CONTENT_REVIEW_NOGO',
  'SPEC_AC_TRACEABILITY_GAP', 'SPEC_POST_IMPL_FAIL',
  'ADVERSARIAL_LOOP_CHECKPOINT',
  // v4.13.0 final-adversarial fix (CONSENSUS-1): inline list now matches the
  // 22-gate registry. COMPLEXITY_GATE was always in references/gates.md but
  // had been omitted from the inline list — closing pre-existing drift.
  'COMPLEXITY_GATE',
]);

// Sanity floor for inline-gate parser (Fix 3 / ARCH-Q3): if the live
// commands/pipeline.md ever drops below this many gates, the doc is corrupted
// or someone deleted invariants — fail loud rather than pass against a
// silently-shrunken reality. Baseline v4.12.0 already exposes 15 gates; v4.13.0
// adds 6 spec gates + COMPLEXITY_GATE (CONSENSUS-1 drift-fix) = 22. Floor stays
// at 15 so a one-time regression below v4.13.0 is still caught here (the
// v4.13.0 expectation of 22 is asserted in the Scenario 3b test).
const INLINE_GATES_PARSER_FLOOR = 15;

// ─── Custom error class — Scenario 4 ──────────────────────────────────────────────────

class ErrUnknownVariant extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErrUnknownVariant';
    this.code = 'ERR_UNKNOWN_VARIANT';
  }
}

// ─── SSOT file paths (resolved relative to this file, cwd-independent) ────────────────

const REPO_ROOT     = path.resolve(__dirname, '..', '..');
const GATES_MD_PATH = path.resolve(REPO_ROOT, 'references', 'gates.md');
const PIPELINE_MD_PATH = path.resolve(REPO_ROOT, 'commands', 'pipeline.md');

// ─── Lazy parsers — load files at first use, then cache ───────────────────────────────

let _gateRegistryCache = null;

/**
 * Parse references/gates.md and build a map from gate name to {hardness, action}.
 * Rows have shape: `| GATE_NAME | **HARDNESS** | trigger | **ACTION_LABEL** rest... | recovery |`
 *
 * Tolerance contract (Fix 4 / ADV-A3): every cell after the gate-name column
 * uses `[^|]*` (any non-pipe content). This lets the parser survive:
 *   - Hardness cell with trailing prose: `**SOFT** (with escalation)`.
 *   - Action cell with bold prefix and tail: `**TOTAL BLOCK** — abort batch`.
 *   - Trigger / recovery cells with embedded em-dashes, parens, bold spans, etc.
 *
 * The gate-name column is intentionally STRICT (`[A-Z][A-Z0-9_]+`) — gate names
 * are an enforced naming convention and any drift there should fail loudly.
 */
function _loadGateRegistry() {
  if (_gateRegistryCache) return _gateRegistryCache;

  const raw = fs.readFileSync(GATES_MD_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  const map = new Map();

  // Match table data rows that look like gate registry entries.
  // Skip header row (`| Gate | Hardness |...`) and separator (`|------|...`).
  // Hardness cell may contain trailing prose (e.g. "**SOFT** (with escalation)") —
  // match the bold token then allow any non-pipe tail.
  const rowRegex = /^\|\s*([A-Z][A-Z0-9_]+)\s*\|\s*\*\*([A-Z_]+)\*\*[^|]*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/;

  for (const line of lines) {
    const m = line.match(rowRegex);
    if (!m) continue;
    const [, name, hardness, , actionRaw, recoveryRaw] = m;

    // Extract bold-wrapped action label if present, else first phrase before " — ".
    let action = actionRaw.trim();
    const boldMatch = action.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      action = boldMatch[1].trim();
    } else {
      // Fall back to text before em-dash separator.
      action = action.split(/\s+—\s+/)[0].trim();
    }

    map.set(name, {
      hardness: hardness.trim(),
      action,
      recovery: recoveryRaw.trim(),
    });
  }

  _gateRegistryCache = map;
  return map;
}

// ─── Scenario 1: gate-registry hardness + action lookup ───────────────────────────────

function getGateHardness(gateName) {
  const reg = _loadGateRegistry();
  const row = reg.get(gateName);
  return row ? row.hardness : undefined;
}

function getGateRecoveryAction(gateName) {
  const reg = _loadGateRegistry();
  const row = reg.get(gateName);
  return row ? row.action : undefined;
}

// ─── Scenario 2: ADVERSARIAL_LOOP_CHECKPOINT escalation (per-batch, every 3) ──────────
//
// Per Q1 user decision (see 04-quality-gate-router.md): the counter is per-batch.
// When batch_changed=true, the counter has just been reset, so the current attempt
// is attempt #1 of the new batch and MUST NOT escalate. Otherwise, escalate at every
// positive multiple of 3 (3, 6, 9, ...) within the same batch.

function shouldEscalate(attempt_count, batch_changed) {
  if (batch_changed === true) return false;
  if (typeof attempt_count !== 'number') return false;
  if (attempt_count <= 0) return false;
  return attempt_count % 3 === 0;
}

// ─── Scenario 3: inline-gate names per pipeline version ───────────────────────────────
//
// v4.12.0 is a frozen baseline (file is now at v4.13.0, so historical state cannot
// be read live). v4.13.0 is parsed from the live commands/pipeline.md "Inline
// Invariants" block — specifically the bullet starting with "Gate names that must
// exist". Names are all-caps with underscores, wrapped in backticks.

let _inlineGatesV413Cache = null;

function _parseInlineGatesV413() {
  if (_inlineGatesV413Cache) return _inlineGatesV413Cache;

  const raw = fs.readFileSync(PIPELINE_MD_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);

  // Find the bullet line that lists the gate names.
  const bulletLine = lines.find((l) => l.includes('Gate names that must exist'));
  if (!bulletLine) {
    throw new Error(
      'Inline-invariants bullet "Gate names that must exist" not found in commands/pipeline.md'
    );
  }

  // Extract all backtick-wrapped tokens that look like gate names (UPPER_SNAKE).
  const matches = bulletLine.match(/`([A-Z][A-Z0-9_]+)`/g) || [];
  const names = matches
    .map((s) => s.slice(1, -1))
    // Filter out tokens that aren't gate names (e.g., flag names like `--hotfix`).
    .filter((s) => /^[A-Z][A-Z0-9_]+$/.test(s));

  // Deduplicate while preserving first-seen order.
  const seen = new Set();
  const uniq = [];
  for (const n of names) {
    if (!seen.has(n)) {
      seen.add(n);
      uniq.push(n);
    }
  }

  // Sanity floor (Fix 3 / ARCH-Q3): if the parsed list is suspiciously short,
  // fail loud. A doc edit that accidentally removes most invariants would
  // otherwise let tests pass against a silently-reduced reality. Floor is the
  // v4.12.0 baseline (15) — anything below means the inline-invariants block
  // was corrupted, renamed, or partially deleted.
  if (uniq.length < INLINE_GATES_PARSER_FLOOR) {
    throw new Error(
      `Inline gate parser found only ${uniq.length} gates in ${PIPELINE_MD_PATH}; ` +
      `expected at least ${INLINE_GATES_PARSER_FLOOR} (v4.12.0 baseline). Possible doc corruption.`
    );
  }

  // Freeze the cache so accidental in-place mutation by a test cannot pollute
  // subsequent test runs (defensive — getInlineGatesFromPipeline also returns a
  // fresh array on every call, so mutation of the returned value is harmless).
  Object.freeze(uniq);
  _inlineGatesV413Cache = uniq;
  return uniq;
}

function getInlineGatesFromPipeline(version) {
  // Fix 2 / ADV-A2: ALWAYS return a defensive copy. The cached array (whether
  // the frozen v4.12.0 constant or the parsed v4.13.0 cache) must never escape
  // by reference — a test that mutates the result accidentally would otherwise
  // pollute every subsequent call. Spread copy is O(n) and n ≤ ~25; cheap.
  if (version === '4.12.0') {
    return [...INLINE_GATES_V4_12_0];
  }
  if (version === '4.13.0') {
    return [..._parseInlineGatesV413()];
  }
  return [];
}

// ─── Scenario 4: spec-* variant → mode_used token ─────────────────────────────────────

function mapVariantToModeUsed(pipeline_variant) {
  switch (pipeline_variant) {
    case 'spec-light':      return 'slim';
    case 'spec-heavy':      return 'full';
    case 'spec-audit-only': return 'audit';
    default:
      throw new ErrUnknownVariant(
        `Unknown pipeline_variant: ${String(pipeline_variant)} — expected one of spec-light | spec-heavy | spec-audit-only`
      );
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────────────

module.exports = {
  EXPECTED_NEW_GATES,
  INLINE_GATES_V4_12_0,
  INLINE_GATES_V4_13_0,
  ErrUnknownVariant,
  getGateHardness,
  getGateRecoveryAction,
  shouldEscalate,
  getInlineGatesFromPipeline,
  mapVariantToModeUsed,
};

// ─── Tests ────────────────────────────────────────────────────────────────────────────
//
// Tests are registered at module load via node:test's `test()` calls — the runner
// (`node --test`) discovers them on require. No `if (require.main === module)`
// wrapper is needed; that wrapper would skip registration when this file is
// require()'d by other test runners or by glob discovery in some scenarios
// (Fix 1 / ARCH-Q7).

// ─── Scenario 1: gate-registry hardness + recovery action ─────────────────────────

test('Scenario 1a: each new gate has the correct hardness in the 22-gate registry', () => {
  for (const [name, expectedHardness] of Object.entries(EXPECTED_NEW_GATES)) {
    assert.equal(
      getGateHardness(name),
      expectedHardness,
      `Gate ${name} must be registered with hardness=${expectedHardness} in references/gates.md`
    );
  }
});

test('Scenario 1b: SPEC_ARTIFACT_MISSING recovery action is "TOTAL BLOCK"', () => {
  assert.equal(
    getGateRecoveryAction('SPEC_ARTIFACT_MISSING'),
    'TOTAL BLOCK',
    'SPEC_ARTIFACT_MISSING is MANDATORY → its recovery action must be TOTAL BLOCK'
  );
});

// ─── Scenario 2: ADVERSARIAL_LOOP_CHECKPOINT escalation per-batch ─────────────────

test('Scenario 2a: attempt 1 in fresh batch does not escalate', () => {
  assert.equal(shouldEscalate(1, false), false, 'attempt 1 → no escalation');
});

test('Scenario 2b: attempt 2 in same batch does not escalate', () => {
  assert.equal(shouldEscalate(2, false), false, 'attempt 2 → no escalation');
});

test('Scenario 2c: attempt 3 in same batch DOES escalate', () => {
  assert.equal(
    shouldEscalate(3, false),
    true,
    'attempt 3 in same batch → ADVERSARIAL_LOOP_CHECKPOINT escalates (every 3 attempts)'
  );
});

test('Scenario 2d: attempt 4 with batch_changed=true is attempt #1 of new batch (no escalation)', () => {
  assert.equal(
    shouldEscalate(4, true),
    false,
    'batch_changed=true resets the counter — fresh batch attempt #1 must not escalate'
  );
});

test('Scenario 2e: attempt 6 in same batch escalates (second escalation, every-3 cadence)', () => {
  assert.equal(
    shouldEscalate(6, false),
    true,
    'attempt 6 in same batch → second escalation in the same batch (every 3 attempts)'
  );
});

// ─── Scenario 3: inline-gate set v4.12.0 ⊂ v4.13.0 (proper subset) ────────────────

test('Scenario 3a: v4.12.0 has exactly 15 inline gates', () => {
  assert.equal(
    getInlineGatesFromPipeline('4.12.0').length,
    15,
    'v4.12.0 baseline must expose exactly 15 inline gates in commands/pipeline.md'
  );
});

test('Scenario 3b: live pipeline.md has exactly 49 inline gates (synced with references/gates.md registry; v8.5.0 enforcement + v8.6.0 ADVERSARIAL_LOOP_BREAKER + v8.8.0 REFACTOR_SCOPE_LOCK)', () => {
  assert.equal(
    getInlineGatesFromPipeline('4.13.0').length,
    49,
    'live pipeline.md must expose 49 inline gates (35 prior baseline + 8 v8.0.0 spec-authoring + 4 v8.5.0 spec-authoring enforcement: SPEC_AUTHORING_INCOMPLETE, SPEC_AUTHORING_STEP_BYPASS, SPEC_CONTRACT_DISCIPLINE_MISSING, PARALLEL_DISPATCH_VIOLATION + 1 v8.6.0 ADVERSARIAL_LOOP_BREAKER CIRCUIT_BREAKER + 1 v8.8.0 REFACTOR_SCOPE_LOCK HARD)'
  );
});

test('Scenario 3c: every v4.12.0 inline gate is preserved in v4.13.0 (no regressions)', () => {
  const v413 = getInlineGatesFromPipeline('4.13.0');
  for (const name of INLINE_GATES_V4_12_0) {
    assert.ok(
      v413.includes(name),
      `Regression: gate ${name} present in v4.12.0 must still be inline in v4.13.0`
    );
  }
});

test('Scenario 3d: the 6 new gates are NOT present in v4.12.0 (they are new in v4.13.0)', () => {
  const v412 = getInlineGatesFromPipeline('4.12.0');
  const newGateNames = Object.keys(EXPECTED_NEW_GATES);
  for (const name of newGateNames) {
    assert.equal(
      v412.includes(name),
      false,
      `Sanity: ${name} is new in v4.13.0 — must NOT appear in v4.12.0 baseline`
    );
  }
});

// ─── Scenario 4: mode persistence — mapVariantToModeUsed contract ─────────────────

test('Scenario 4a: spec-light → mode_used="slim"', () => {
  assert.equal(
    mapVariantToModeUsed('spec-light'),
    'slim',
    'spec-light variant must be persisted by spec-closer as mode_used="slim"'
  );
});

test('Scenario 4b: spec-heavy → mode_used="full"', () => {
  assert.equal(
    mapVariantToModeUsed('spec-heavy'),
    'full',
    'spec-heavy variant must be persisted by spec-closer as mode_used="full"'
  );
});

test('Scenario 4c: spec-audit-only → mode_used="audit"', () => {
  assert.equal(
    mapVariantToModeUsed('spec-audit-only'),
    'audit',
    'spec-audit-only variant must be persisted by spec-closer as mode_used="audit"'
  );
});

test('Scenario 4d: non-spec variant raises ErrUnknownVariant (code=ERR_UNKNOWN_VARIANT)', () => {
  assert.throws(
    () => mapVariantToModeUsed('feature-light'),
    { code: 'ERR_UNKNOWN_VARIANT' },
    'feature-light is not a spec-* variant — mode mapping must throw ErrUnknownVariant'
  );
});

test('Scenario 4e: undefined variant raises ErrUnknownVariant (defensive)', () => {
  assert.throws(
    () => mapVariantToModeUsed(undefined),
    { code: 'ERR_UNKNOWN_VARIANT' },
    'undefined input must throw ErrUnknownVariant — never silently produce wrong mode_used'
  );
});
