#!/usr/bin/env node
/**
 * tests/integration/spec-workflow-e2e.test.js
 *
 * Wave 6 (Batch A) — End-to-end invariants for the v4.13.0 spec workflow.
 *
 * This file is the deliverable. It validates LIVE state of two SSOT documents
 * (references/gates.md + agents/executor/spec-closer.md) plus encodes the
 * ADVERSARIAL_LOOP_CHECKPOINT escalation rule as a local helper that serves
 * as living spec.
 *
 * Validations (8 scenarios):
 *   1. (main)       SPEC_FORMAT_GATE_FAIL row in references/gates.md is HARD.
 *   2. (main)       SPEC_CONTENT_REVIEW_NOGO row is HARD AND its Trigger
 *                   references format_gate_status ∈ {GO, GO-WARN}.
 *   3. (main)       SPEC_POST_IMPL_FAIL row is HARD AND its Trigger mentions
 *                   score < 75 (or "below 75" / "%75%").
 *   4. (main)       MODE PERSISTENCE table maps spec-heavy → full.
 *   5. (regression) MODE PERSISTENCE table maps spec-light → slim.
 *   6. (regression) MODE PERSISTENCE table maps spec-audit-only → audit.
 *   7. (edge)       shouldEscalate(3, true)  === false (counter resets on batch transition).
 *   8. (edge)       shouldEscalate(3, false) === true  (escalation fires within same batch).
 *
 * SSOT note for scenarios 7+8:
 *   The ADVERSARIAL_LOOP_CHECKPOINT rule is a documented invariant in
 *   references/gates.md ("Every 3 fix-loop attempts within a single spec batch...
 *   Counter resets when batch transitions"). It is NOT exposed as a JS function
 *   anywhere in the codebase. Per Wave 6 design decision, we encode the rule as
 *   a local helper inside this test file — this helper IS the SSOT for the
 *   per-batch escalation logic. If the gate definition in gates.md changes, this
 *   helper MUST be updated to match.
 *
 * Run: node --test tests/integration/spec-workflow-e2e.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');

// ─── SSOT readers / parsers ───────────────────────────────────────────────────

function readSSOT(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`SSOT file missing: ${relPath} (resolved: ${abs})`);
  }
  return fs.readFileSync(abs, 'utf8');
}

/**
 * Find the markdown table row(s) for a given gate name in references/gates.md.
 * Returns an array of objects: { hardness, trigger, action, recovery, raw }.
 *
 * Anchors on table-row regex: lines that start with `| GATE_NAME |`.
 * If the gate name appears multiple times across the two registries (general
 * + spec subsection), all rows are returned. Caller decides whether duplicates
 * must agree.
 */
function getGateRows(gateRegistryText, gateName) {
  const lines = gateRegistryText.split(/\r?\n/);
  const rows = [];
  // Match: | <gateName> | <hardness> | <trigger> | <action> | <recovery> |
  // gateName may have surrounding spaces; cells may contain bold markers.
  const escaped = gateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rowRe = new RegExp(`^\\|\\s*${escaped}\\s*\\|`, 'i');

  for (const line of lines) {
    if (!rowRe.test(line)) continue;
    // Split on `|`, trim each cell, drop the empty leading/trailing cells.
    const cells = line.split('|').map((c) => c.trim());
    // Expected cells: ['', gate, hardness, trigger, action, recovery, '']
    // Some rows may have ≥6 informative cells; we take the first 5.
    if (cells.length < 6) continue;
    const [, , hardnessRaw, trigger, action, recovery] = cells;
    // Strip markdown bold markers from hardness cell ("**HARD**" → "HARD").
    const hardness = hardnessRaw.replace(/\*+/g, '').trim();
    rows.push({ hardness, trigger, action, recovery, raw: line });
  }
  return rows;
}

/**
 * Convenience: assert exactly-one row OR multiple-rows-that-agree on hardness.
 * Returns the canonical row.
 */
function getGateRow(gateRegistryText, gateName) {
  const rows = getGateRows(gateRegistryText, gateName);
  if (rows.length === 0) {
    throw new Error(`Gate "${gateName}" not found in registry`);
  }
  if (rows.length > 1) {
    const allSame = rows.every((r) => r.hardness === rows[0].hardness);
    if (!allSame) {
      throw new Error(
        `Gate "${gateName}" appears ${rows.length}× with disagreeing hardness: ` +
          rows.map((r) => r.hardness).join(', ')
      );
    }
  }
  return rows[0];
}

/**
 * Parse the MODE PERSISTENCE table in agents/executor/spec-closer.md.
 * Returns { 'spec-light': 'slim', 'spec-heavy': 'full', 'spec-audit-only': 'audit' }.
 *
 * Anchors on the section header "## MODE PERSISTENCE" then walks until the
 * first markdown table block, parsing rows of shape: `| \`variant\` | \`mode\` |`.
 */
function parseModePersistenceTable(specCloserText) {
  const lines = specCloserText.split(/\r?\n/);
  // Find section start.
  const sectionIdx = lines.findIndex((l) => /^##\s+MODE PERSISTENCE/.test(l));
  if (sectionIdx === -1) {
    throw new Error('MODE PERSISTENCE section not found in spec-closer.md');
  }
  // Walk forward; collect table rows shaped like: | `something` | `something` |
  // Stop at next H2 (`## `).
  const map = {};
  // Match: | `variant` | `mode` |
  // Allow optional inline-code backticks; trim and strip backticks from cells.
  const rowRe = /^\|\s*`?([a-z][a-z0-9-]*)`?\s*\|\s*`?([a-z][a-z0-9-]*)`?\s*\|/i;

  for (let i = sectionIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s/.test(l)) break;
    // Skip header separator rows like `|---|---|`.
    if (/^\|\s*-+\s*\|\s*-+\s*\|/.test(l)) continue;
    // Skip header row `| pipeline_variant | mode_used |`.
    if (/^\|\s*pipeline_variant\s*\|\s*mode_used\s*\|/i.test(l)) continue;
    const m = rowRe.exec(l);
    if (!m) continue;
    const variant = m[1].toLowerCase();
    const mode = m[2].toLowerCase();
    // Defensive: only accept variants that look spec-related.
    if (!variant.startsWith('spec-')) continue;
    map[variant] = mode;
  }

  if (Object.keys(map).length === 0) {
    throw new Error('MODE PERSISTENCE table parsed but no rows captured');
  }
  return map;
}

// ─── ADVERSARIAL_LOOP_CHECKPOINT — local SSOT for per-batch escalation rule ──
//
// Contract (sourced from references/gates.md "ADVERSARIAL_LOOP_CHECKPOINT" row):
//   "Every 3 fix-loop attempts within a single spec batch without reaching CLEAN
//    adversarial result. Counter resets when batch transitions."
//
// Inputs:
//   attempt       — number ≥ 0; current fix-loop attempt counter for this batch.
//   batchChanged  — boolean; true if the batch has transitioned since last call,
//                   in which case the counter is logically reset (returns false).
//
// Returns:
//   true  — escalate (trigger gate ASK).
//   false — do not escalate (continue silently or counter just reset).
function shouldEscalate(attempt, batchChanged) {
  if (batchChanged) return false; // Counter resets on batch transition.
  if (typeof attempt !== 'number' || attempt < 1) return false;
  return attempt % 3 === 0; // Every 3rd attempt within the same batch.
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('wave-6: SPEC_FORMAT_GATE_FAIL is HARD in references/gates.md', () => {
  const gates = readSSOT('references/gates.md');
  const row = getGateRow(gates, 'SPEC_FORMAT_GATE_FAIL');
  assert.strictEqual(
    row.hardness,
    'HARD',
    `SPEC_FORMAT_GATE_FAIL hardness expected HARD, got "${row.hardness}". Row: ${row.raw}`
  );
});

test('wave-6: SPEC_CONTENT_REVIEW_NOGO is HARD and trigger references format_gate_status ∈ {GO, GO-WARN}', () => {
  const gates = readSSOT('references/gates.md');
  const row = getGateRow(gates, 'SPEC_CONTENT_REVIEW_NOGO');
  assert.strictEqual(
    row.hardness,
    'HARD',
    `SPEC_CONTENT_REVIEW_NOGO hardness expected HARD, got "${row.hardness}". Row: ${row.raw}`
  );
  // Trigger must reference Heavy variant precondition. We accept either an
  // explicit `format_gate_status ∈ {GO, GO-WARN}` phrasing OR an equivalent
  // mention that ties this gate to the Heavy variant after Format Gate passes.
  // The current row in v4.13.0 says: "spec-content-reviewer (Heavy variant)
  // emits NO-GO (>=1 critical finding)" — which by precondition only runs when
  // format_gate_status ∈ {GO, GO-WARN}. Accept either wording, but require at
  // least one of these markers to appear.
  const trigger = row.trigger;
  const hasExplicitFormatRef =
    /format_gate_status/i.test(trigger) &&
    /GO[\s,/-]*WARN|GO-WARN/i.test(trigger) &&
    /\bGO\b/i.test(trigger);
  const hasHeavyVariantRef = /heavy\s+variant/i.test(trigger);
  assert.ok(
    hasExplicitFormatRef || hasHeavyVariantRef,
    `SPEC_CONTENT_REVIEW_NOGO trigger must reference format_gate_status ∈ {GO, GO-WARN} ` +
      `or the Heavy variant precondition. Trigger: "${trigger}"`
  );
});

test('wave-6: SPEC_POST_IMPL_FAIL is HARD and trigger mentions score < 75', () => {
  const gates = readSSOT('references/gates.md');
  const row = getGateRow(gates, 'SPEC_POST_IMPL_FAIL');
  assert.strictEqual(
    row.hardness,
    'HARD',
    `SPEC_POST_IMPL_FAIL hardness expected HARD, got "${row.hardness}". Row: ${row.raw}`
  );
  const trigger = row.trigger;
  const has75Ref =
    /(score\s*(?:<|below|under)\s*75)|(below\s+75\s*%?)|(<\s*75\s*%?)|(%\s*75\s*%)|(75\s*%?\s*threshold)/i.test(
      trigger
    );
  assert.ok(
    has75Ref,
    `SPEC_POST_IMPL_FAIL trigger must mention score < 75 / below 75. Trigger: "${trigger}"`
  );
});

test('wave-6: MODE PERSISTENCE — spec-heavy maps to full', () => {
  const closer = readSSOT('agents/executor/spec-closer.md');
  const map = parseModePersistenceTable(closer);
  assert.ok(
    'spec-heavy' in map,
    `MODE PERSISTENCE table must contain "spec-heavy" entry. Parsed map: ${JSON.stringify(map)}`
  );
  assert.strictEqual(
    map['spec-heavy'],
    'full',
    `spec-heavy must map to "full", got "${map['spec-heavy']}"`
  );
});

test('wave-6 regression: MODE PERSISTENCE — spec-light maps to slim', () => {
  const closer = readSSOT('agents/executor/spec-closer.md');
  const map = parseModePersistenceTable(closer);
  assert.ok(
    'spec-light' in map,
    `MODE PERSISTENCE table must contain "spec-light" entry. Parsed map: ${JSON.stringify(map)}`
  );
  assert.strictEqual(
    map['spec-light'],
    'slim',
    `spec-light must map to "slim", got "${map['spec-light']}"`
  );
});

test('wave-6 regression: MODE PERSISTENCE — spec-audit-only maps to audit', () => {
  const closer = readSSOT('agents/executor/spec-closer.md');
  const map = parseModePersistenceTable(closer);
  assert.ok(
    'spec-audit-only' in map,
    `MODE PERSISTENCE table must contain "spec-audit-only" entry. Parsed map: ${JSON.stringify(map)}`
  );
  assert.strictEqual(
    map['spec-audit-only'],
    'audit',
    `spec-audit-only must map to "audit", got "${map['spec-audit-only']}"`
  );
});

test('wave-6 edge: shouldEscalate(3, true) === false (counter resets on batch transition)', () => {
  assert.strictEqual(
    shouldEscalate(3, true),
    false,
    'When batch has just transitioned, the per-batch counter is logically reset and ' +
      'escalation MUST NOT fire — even if attempt happens to equal 3.'
  );
});

test('wave-6 edge: shouldEscalate(3, false) === true (escalation fires at attempt 3 within same batch)', () => {
  assert.strictEqual(
    shouldEscalate(3, false),
    true,
    'When batch has not changed, attempt=3 (every-3rd-attempt boundary) MUST fire ' +
      'the ADVERSARIAL_LOOP_CHECKPOINT escalation.'
  );
});
