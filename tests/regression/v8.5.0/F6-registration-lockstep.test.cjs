#!/usr/bin/env node
'use strict';

/**
 * F6 (v8.5.0) — B6: registration + version lockstep.
 *
 * RED phase (TDD). These tests MUST FAIL today because:
 *   - references/gates.md has NO "Spec-authoring enforcement gates (v8.5.0)"
 *     subsection and none of the 4 new AUDIT gate names.
 *   - The 9 version surfaces still carry 8.4.0, not 8.5.0.
 *   - hooks/hooks.json does NOT register spec-seal-guard.cjs (Bash/PowerShell)
 *     or parallel-dispatch-gate.cjs (Agent).
 *
 * Two scenarios are GUARD scenarios that pass today by design (B6-S2: the F1
 * Mandatory Gates table must stay exactly 23 rows; B6-S6: the new AUDIT gate
 * names must NOT pollute the gate-decision contract). They are included for
 * full coverage; the suite as a whole is RED because S1/S3/S4/S5 fail.
 *
 * Scenarios covered (6): B6-S1 .. B6-S6.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
// Rolled forward each lockstep release (like F7's VERSION pin). Bumped to 8.9.0
// for the determinism-enforcement-hardening release. The 9 version surfaces all
// declare 8.9.0.
const VERSION = '8.19.1';
const GATES_MD = path.join(ROOT, 'references', 'gates.md');
const HOOKS_JSON = path.join(ROOT, 'hooks', 'hooks.json');
const GATE_DECISION_CONTRACT = path.join(ROOT, 'lib', 'contracts', 'gate-decision.cjs');

const NEW_AUDIT_GATES = [
  'SPEC_AUTHORING_INCOMPLETE',
  'SPEC_AUTHORING_STEP_BYPASS',
  'SPEC_CONTRACT_DISCIPLINE_MISSING',
  'PARALLEL_DISPATCH_VIOLATION',
];

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log('=== F6 v8.5.0 — registration + lockstep (RED) ===');

// ---- B6-S1 (main) — new AUDIT subsection in gates.md -----------------------
test('B6-S1: gates.md has the "Spec-authoring enforcement gates (v8.5.0)" subsection with all 4 gates', () => {
  const md = read(GATES_MD);
  assert.match(md, /Spec-authoring enforcement gates \(v8\.5\.0\)/,
    'must contain the v8.5.0 enforcement-gates subsection heading');
  for (const g of NEW_AUDIT_GATES) {
    assert.match(md, new RegExp(g), `subsection must list ${g}`);
  }
});

// ---- B6-S2 (main, GUARD) — F1 Mandatory Gates table count -------------------
// v8.5.0 kept this at 23 (its 4 new gates were AUDIT, never mandatory). The
// v8.6.0 merge deliberately added ADVERSARIAL_LOOP_BREAKER to the Mandatory
// table (its "Deliberate Iron Law change"), taking it to 24. The guard is
// "match the current pinned count", so it now asserts 24.
test('B6-S2: the Mandatory Gates by Complexity table has exactly 24 data rows (post-v8.6.0 merge)', () => {
  const md = read(GATES_MD);
  // Isolate the table under "## Mandatory Gates by Complexity".
  const startIdx = md.indexOf('## Mandatory Gates by Complexity');
  assert.ok(startIdx !== -1, 'Mandatory Gates by Complexity section must exist');
  const after = md.slice(startIdx);
  // Data rows are pipe-rows containing a ✓ in a complexity column, i.e. rows
  // after the header/separator. Count rows that look like "| GATE | ... |" with
  // at least one ✓, bounded to the table (stop at the next "**Counts:**").
  const tableEnd = after.indexOf('**Counts:**');
  const tableBlock = tableEnd !== -1 ? after.slice(0, tableEnd) : after;
  const rows = tableBlock.split(/\r?\n/).filter((l) => /^\|/.test(l) && /✓/.test(l));
  assert.equal(rows.length, 24, `expected exactly 24 mandatory-gate data rows, got ${rows.length}`);
});

// ---- B6-S3 (main) — version across the 9 surfaces (8.6.0 post-merge) -------
test('B6-S3: the canonical version is present across all 9 version surfaces', () => {
  // 1. .claude-plugin/plugin.json
  const plugin = JSON.parse(read(path.join(ROOT, '.claude-plugin/plugin.json')));
  assert.equal(plugin.version, VERSION, `plugin.json version = ${plugin.version}`);

  // 2. .claude-plugin/marketplace.json
  const mkt = JSON.parse(read(path.join(ROOT, '.claude-plugin/marketplace.json')));
  const entry = (mkt.plugins || []).find((p) => p.name === 'pipeline-orchestrator');
  assert.ok(entry, 'marketplace.json pipeline-orchestrator entry present');
  assert.equal(entry.version, VERSION, `marketplace.json version = ${entry.version}`);

  // 3. package.json
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  assert.equal(pkg.version, VERSION, `package.json version = ${pkg.version}`);

  // 4. lib/index.cjs
  const idx = read(path.join(ROOT, 'lib/index.cjs'));
  const m = idx.match(/version:\s*['"]([^'"]+)['"]/);
  assert.ok(m && m[1] === VERSION, `lib/index.cjs version = ${m ? m[1] : '(none)'}`);

  // 5. CLAUDE.md canonical line
  const claudeMd = read(path.join(ROOT, 'CLAUDE.md'));
  assert.match(claudeMd, new RegExp(`Atualmente:\\s*\\*\\*${VERSION.replace(/\./g, '\\.')}\\*\\*`),
    'CLAUDE.md canonical "Atualmente: **8.5.0**"');

  // 6. README badge
  const readme = read(path.join(ROOT, 'README.md'));
  assert.match(readme, new RegExp(`badge/version-${VERSION.replace(/\./g, '\\.')}-`),
    'README badge version-8.5.0-');

  // 7. CHANGELOG header
  const changelog = read(path.join(ROOT, 'CHANGELOG.md'));
  assert.match(changelog, new RegExp(`^##\\s*\\[${VERSION.replace(/\./g, '\\.')}\\]`, 'm'),
    'CHANGELOG "## [8.5.0]" header');

  // 8. .cursor-plugin/plugin.json
  const cursor = JSON.parse(read(path.join(ROOT, '.cursor-plugin/plugin.json')));
  assert.equal(cursor.version, VERSION, `.cursor-plugin version = ${cursor.version}`);

  // 9. hooks/hooks.json — the SessionStart banner declares the loaded version.
  const hooks = read(HOOKS_JSON);
  assert.match(hooks, new RegExp(`v${VERSION.replace(/\./g, '\\.')}`),
    'hooks.json must declare v8.5.0');
});

// ---- B6-S4 (regression) — spec-seal-guard registered for Bash/PowerShell ----
test('B6-S4: hooks/hooks.json registers spec-seal-guard.cjs for Bash/PowerShell', () => {
  const hooks = JSON.parse(read(HOOKS_JSON));
  const pre = (hooks.hooks && hooks.hooks.PreToolUse) || [];
  const match = pre.find((block) =>
    /Bash|PowerShell/.test(block.matcher || '') &&
    (block.hooks || []).some((h) => /spec-seal-guard\.cjs/.test(h.command || '')));
  assert.ok(match, 'a PreToolUse Bash/PowerShell block must register spec-seal-guard.cjs');
});

// ---- B6-S5 (regression) — parallel-dispatch-gate registered for Agent ------
test('B6-S5: hooks/hooks.json registers parallel-dispatch-gate.cjs for Agent', () => {
  const hooks = JSON.parse(read(HOOKS_JSON));
  const pre = (hooks.hooks && hooks.hooks.PreToolUse) || [];
  const match = pre.find((block) =>
    /Agent/.test(block.matcher || '') &&
    (block.hooks || []).some((h) => /parallel-dispatch-gate\.cjs/.test(h.command || '')));
  assert.ok(match, 'a PreToolUse Agent block must register parallel-dispatch-gate.cjs');
});

// ---- B6-S6 (edge, GUARD) — new AUDIT names do not pollute gate-decision SSOT -
test('B6-S6: the 4 new AUDIT gate names do NOT appear in the gate-decision contract', () => {
  const src = read(GATE_DECISION_CONTRACT);
  for (const g of NEW_AUDIT_GATES) {
    assert.doesNotMatch(src, new RegExp(g),
      `${g} is a protocol-events AUDIT event and must NOT enter lib/contracts/gate-decision.cjs`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
