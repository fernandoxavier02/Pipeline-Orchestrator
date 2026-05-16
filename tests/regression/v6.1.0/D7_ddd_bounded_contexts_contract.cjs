#!/usr/bin/env node
'use strict';

/**
 * D7 — DDD Bounded Contexts contract for plan-architect.md
 *
 * Adds a lightweight Bounded Contexts section (COMPLEXA only, SOFT enforcement)
 * to the plan-architect agent prompt. The section documents bounded contexts
 * touched by the plan with a 3-column table (Context | Aggregate Root |
 * Key Invariants), extends the IMPLEMENTATION_PLAN YAML template with a
 * `bounded_contexts:` array, and adds Rule 10 (SOFT — missing emits
 * BOUNDED_CONTEXT_MISSING event, no hard block, NOT registered in gates.md).
 *
 * Scenarios:
 *   D7-S1 MAIN       — "Bounded Contexts" heading appears AFTER "Risk Assessment"
 *   D7-S2 MAIN       — Bounded Contexts table has exactly 3 columns:
 *                      Context | Aggregate Root | Key Invariants
 *   D7-S3 MAIN       — IMPLEMENTATION_PLAN YAML gains `bounded_contexts:` array
 *                      with sub-fields context_name, aggregate_root, invariants
 *   D7-S4 MAIN       — Rule 10 documents SOFT enforcement +
 *                      BOUNDED_CONTEXT_MISSING event (no hard block)
 *   D7-S5 MAIN       — "COMPLEXA only" qualifier appears in the new section
 *   D7-S6 REGRESSION — Risk Assessment phrases preserved verbatim
 *   D7-S7 REGRESSION — RULES 1-9 preserved with original labels
 *   D7-S8 EDGE       — references/gates.md still has exactly 22 gate rows
 *                      (BOUNDED_CONTEXT_MISSING is NOT a new registry row)
 *   D7-S9 EDGE       — Bounded Contexts table stays lightweight: exactly 3
 *                      columns, no Owner/Team/Status extras
 *
 * Production code under test (NOT yet implemented — tests MUST FAIL for S1-S5,
 * S9; pass for S6, S7, S8):
 *   - agents/quality/plan-architect.md  (Bounded Contexts section not added)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const PLAN_ARCHITECT = path.join(ROOT, 'agents/quality/plan-architect.md');
const GATES_MD = path.join(ROOT, 'references/gates.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log('=== D7 DDD Bounded Contexts contract (plan-architect.md) ===');

// ---------- D7-S1 MAIN ----------
test('D7-S1: "Bounded Contexts" heading exists AND appears AFTER "Risk Assessment"', () => {
  const md = read(PLAN_ARCHITECT);
  const idxRisk = md.search(/^###\s+Risk Assessment\s*$/m);
  const idxBC = md.search(/^###\s+Bounded Contexts\b/m);
  assert.ok(idxRisk >= 0, '"### Risk Assessment" heading not found');
  assert.ok(idxBC >= 0, '"### Bounded Contexts" heading not found');
  assert.ok(idxBC > idxRisk,
    `Bounded Contexts (pos ${idxBC}) must appear AFTER Risk Assessment (pos ${idxRisk})`);
});

// ---------- D7-S2 MAIN ----------
test('D7-S2: Bounded Contexts table header has exactly 3 columns: Context | Aggregate Root | Key Invariants', () => {
  const md = read(PLAN_ARCHITECT);
  const section = extractBoundedContextsSection(md);
  assert.ok(section, 'Bounded Contexts section not found');
  const headerLine = section.split(/\r?\n/).find((l) => /^\|.*Context.*\|/i.test(l));
  assert.ok(headerLine, 'Bounded Contexts table header row not found');
  const cols = headerLine.split('|').map((c) => c.trim()).filter(Boolean);
  assert.equal(cols.length, 3,
    `expected exactly 3 columns, got ${cols.length}: ${JSON.stringify(cols)}`);
  assert.ok(/^Context$/i.test(cols[0]), `col 1 must be "Context", got "${cols[0]}"`);
  assert.ok(/^Aggregate Root$/i.test(cols[1]), `col 2 must be "Aggregate Root", got "${cols[1]}"`);
  assert.ok(/^Key Invariants$/i.test(cols[2]), `col 3 must be "Key Invariants", got "${cols[2]}"`);
});

// ---------- D7-S3 MAIN ----------
test('D7-S3: IMPLEMENTATION_PLAN YAML template has bounded_contexts: array with sub-fields', () => {
  const md = read(PLAN_ARCHITECT);
  // Locate the YAML template that begins with IMPLEMENTATION_PLAN:
  const yamlMatch = md.match(/IMPLEMENTATION_PLAN:[\s\S]*?(?=\n```|\n---|\n##\s)/);
  assert.ok(yamlMatch, 'IMPLEMENTATION_PLAN yaml template not found');
  const yaml = yamlMatch[0];
  assert.ok(/\n\s*bounded_contexts:\s*\n/.test(yaml),
    '`bounded_contexts:` array key not present in IMPLEMENTATION_PLAN template');
  assert.ok(/context_name\s*:/.test(yaml),
    '`context_name` sub-field not present under bounded_contexts');
  assert.ok(/aggregate_root\s*:/.test(yaml),
    '`aggregate_root` sub-field not present under bounded_contexts');
  assert.ok(/\binvariants\b\s*:/.test(yaml),
    '`invariants` sub-field not present under bounded_contexts');
});

// ---------- D7-S4 MAIN ----------
test('D7-S4: RULES has "Rule 10" — SOFT, emits BOUNDED_CONTEXT_MISSING event, no hard block', () => {
  const md = read(PLAN_ARCHITECT);
  const rulesSection = extractSection(md, 'RULES');
  assert.ok(rulesSection, 'RULES section not found');
  // Rule 10 should appear as a numbered list item starting with "10."
  const rule10Line = rulesSection
    .split(/\r?\n/)
    .find((l) => /^\s*10\.\s+/.test(l));
  assert.ok(rule10Line, 'Rule 10 line not found in RULES section');
  // The rule (or its surrounding context within RULES) must mention SOFT,
  // BOUNDED_CONTEXT_MISSING, and indicate no hard block.
  const rule10Idx = rulesSection.indexOf(rule10Line);
  // Capture rule 10 body — from rule10Line until next numbered item or end
  const after = rulesSection.slice(rule10Idx);
  const rule10Body = after.split(/\n\s*\d+\.\s+/)[0];
  assert.ok(/\bSOFT\b/i.test(rule10Body),
    'Rule 10 must mention SOFT enforcement');
  assert.ok(/BOUNDED_CONTEXT_MISSING/.test(rule10Body),
    'Rule 10 must mention BOUNDED_CONTEXT_MISSING event');
  assert.ok(/no\s+hard\s+block|not\s+a\s+hard\s+block|no-block|no\s+block/i.test(rule10Body),
    'Rule 10 must state "no hard block" (or equivalent)');
});

// ---------- D7-S5 MAIN ----------
test('D7-S5: "COMPLEXA only" qualifier appears in the Bounded Contexts section', () => {
  const md = read(PLAN_ARCHITECT);
  const section = extractBoundedContextsSection(md);
  assert.ok(section, 'Bounded Contexts section not found');
  assert.ok(/COMPLEXA\s+only/i.test(section),
    'Bounded Contexts section must contain the qualifier "COMPLEXA only"');
});

// ---------- D7-S6 REGRESSION ----------
test('D7-S6: Risk Assessment phrases preserved verbatim ("High risk:", "Migration needed:", "Rollback strategy:")', () => {
  const md = read(PLAN_ARCHITECT);
  assert.ok(md.includes('**High risk:**'),
    'verbatim phrase "**High risk:**" missing from plan-architect.md');
  assert.ok(md.includes('**Migration needed:**'),
    'verbatim phrase "**Migration needed:**" missing from plan-architect.md');
  assert.ok(md.includes('**Rollback strategy:**'),
    'verbatim phrase "**Rollback strategy:**" missing from plan-architect.md');
});

// ---------- D7-S7 REGRESSION ----------
test('D7-S7: RULES 1-9 preserved with original labels (no rename / no removal)', () => {
  const md = read(PLAN_ARCHITECT);
  const rulesSection = extractSection(md, 'RULES');
  assert.ok(rulesSection, 'RULES section not found');

  const expectedRules = [
    { n: 1, label: 'Read-only in Plan Mode' },
    { n: 2, label: 'Exact file paths' },
    { n: 3, label: 'Pattern references' },
    { n: 4, label: 'Dependency order' },
    { n: 5, label: 'One task = one concern' },
    { n: 6, label: 'Test awareness' },
    { n: 7, label: 'Existing abstractions first' },
    { n: 8, label: 'Risk transparency' },
    { n: 9, label: 'Time-box:' },
  ];

  for (const r of expectedRules) {
    const re = new RegExp(`^\\s*${r.n}\\.\\s+\\*\\*${escapeRegex(r.label)}`, 'm');
    assert.ok(re.test(rulesSection),
      `Rule ${r.n} ("${r.label}") not preserved verbatim in RULES`);
  }
});

// ---------- D7-S8 EDGE ----------
test('D7-S8: references/gates.md still has exactly 22 gate registry rows (BOUNDED_CONTEXT_MISSING not registered)', () => {
  const md = read(GATES_MD);
  // Use the same approach as F1: the Mandatory Gates by Complexity table is
  // the canonical 22-row table parsed by F1. We assert the same count here so
  // any future BOUNDED_CONTEXT_MISSING row addition breaks this test.
  const section = extractSection(md, 'Mandatory Gates by Complexity');
  const dataRows = parseTableDataRows(section);
  assert.equal(dataRows.length, 22,
    `expected 22 gate rows in Mandatory Gates table, got ${dataRows.length}`);
  // And BOUNDED_CONTEXT_MISSING must NOT be a row name in gates.md
  const isBcRow = dataRows.some((row) =>
    Object.values(row).some((v) => /BOUNDED_CONTEXT_MISSING/.test(v)));
  assert.equal(isBcRow, false,
    'BOUNDED_CONTEXT_MISSING must NOT be a registered gate row in gates.md (SOFT event only)');
});

// ---------- D7-S9 EDGE ----------
test('D7-S9: Bounded Contexts table stays lightweight (no Owner/Team/Status columns)', () => {
  const md = read(PLAN_ARCHITECT);
  const section = extractBoundedContextsSection(md);
  assert.ok(section, 'Bounded Contexts section not found');
  const headerLine = section.split(/\r?\n/).find((l) => /^\|.*Context.*\|/i.test(l));
  assert.ok(headerLine, 'Bounded Contexts table header row not found');
  const cols = headerLine.split('|').map((c) => c.trim()).filter(Boolean);
  assert.equal(cols.length, 3,
    `table must have exactly 3 columns, got ${cols.length}: ${JSON.stringify(cols)}`);
  // None of the forbidden column labels may appear in the header row
  const forbidden = ['Owner', 'Team', 'Status'];
  for (const col of cols) {
    for (const bad of forbidden) {
      assert.ok(!new RegExp(`\\b${bad}\\b`, 'i').test(col),
        `forbidden column "${bad}" present in Bounded Contexts table header`);
    }
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

function extractSection(md, headingText) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^(#{2,4})\\s+${escapeRegex(headingText)}\\s*$`));
    if (m) { start = i; level = m[1].length; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  const stopRe = new RegExp(`^#{1,${level}}\\s+\\S`);
  for (let i = start + 1; i < lines.length; i++) {
    if (stopRe.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function extractBoundedContextsSection(md) {
  // Try ### then ## variants
  return extractSection(md, 'Bounded Contexts') ||
         extractSectionStartsWith(md, 'Bounded Contexts');
}

function extractSectionStartsWith(md, headingPrefix) {
  // Allow headings like "### Bounded Contexts (COMPLEXA only)"
  const lines = md.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^(#{2,4})\\s+${escapeRegex(headingPrefix)}\\b`));
    if (m) { start = i; level = m[1].length; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  const stopRe = new RegExp(`^#{1,${level}}\\s+\\S`);
  for (let i = start + 1; i < lines.length; i++) {
    if (stopRe.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function parseTableDataRows(sectionMd) {
  const lines = sectionMd.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return [];
  const header = lines[0].split('|').map((c) => c.trim()).filter(Boolean);
  const data = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map((c) => c.trim());
    if (cells.length && cells[0] === '') cells.shift();
    if (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length === 0) continue;
    const row = {};
    header.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    data.push(row);
  }
  return data;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
