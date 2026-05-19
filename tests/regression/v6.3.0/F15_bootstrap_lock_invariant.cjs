#!/usr/bin/env node
'use strict';

/**
 * F15 — Bootstrap Lock Invariant.
 *
 * The CHANGE_CONTRACT.bootstrap.active flag was introduced in v6.3.0 to
 * permit the one-time creation of the discipline-layer machinery itself
 * (T1-T3 of the v6.3.0 release ran without runtime SCOPE LOCK CHECK
 * enforcement because that mechanism was being born in those very tasks).
 *
 * After v6.3.0 ships, the flag MUST never be set to true again on any
 * committed plan or template. This test asserts the invariant at CI time
 * across the repo.
 *
 * Allow-list:
 *   - The historical v6.3.0 plan, archived at
 *     .pipeline/docs/Pre-Complexa-action/2026-05-19-batch-adversarial-discipline/03-plan-architect.md
 *     (the one-time legitimate exemption — preserved for audit transparency).
 *
 * Triggers added 2026-05-19 per consensus finding SEC-1 / RISK-1 from the
 * v6.3.0 final adversarial review (3 independent reviewers flagged that
 * the flag had no machine-checkable guard).
 *
 * Covers v6.3.0 batch-adversarial-discipline hardening pass.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

// ---------------------------------------------------------------------------
// Allow-list: the one path where bootstrap.active: true is legitimate.
// Use forward slashes for cross-platform comparison; we normalise at compare
// time.
// ---------------------------------------------------------------------------
const ALLOWED_BOOTSTRAP_PATHS = [
  // Historical v6.3.0 plan archive (cross-tree, lives outside the plugin repo)
  '.pipeline/docs/Pre-Complexa-action/2026-05-19-batch-adversarial-discipline/03-plan-architect.md',
];

// ---------------------------------------------------------------------------
// Targets we scan: every committed plan-like file inside the plugin repo.
// Boundaries: we scan agent definitions, references, designs, docs, tests.
// We do NOT scan `.pipeline/` (gitignored working state) or
// `node_modules/`.
// ---------------------------------------------------------------------------
const SCAN_DIRS = [
  'agents',
  'references',
  'commands',
  'skills',
  'designs',
  'docs',
  'tests',
  '.claude-plugin',
];

const SKIP_BASENAMES = new Set(['node_modules', '.git', '.pipeline']);

function listMarkdownAndYamlAndJson(dir, accumulator) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_BASENAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listMarkdownAndYamlAndJson(full, accumulator);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.md', '.yaml', '.yml', '.json'].includes(ext)) {
        accumulator.push(full);
      }
    }
  }
}

function relFromRoot(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function isAllowedPath(relPath) {
  return ALLOWED_BOOTSTRAP_PATHS.some(allowed => relPath === allowed);
}

// ---------------------------------------------------------------------------
// Detection pattern — context-aware.
//
// A "live plan emission" is identified by all three anchors appearing together:
//   1. `IMPLEMENTATION_PLAN:` yaml key (start of a plan block)
//   2. `CHANGE_CONTRACT:` yaml key (inside the plan)
//   3. `active: true` (the bootstrap value being set)
//
// Documentation files (SSOT, agent prompts, CHANGELOG) may DESCRIBE
// `bootstrap.active: true` as a concept — that is not itself emitting a
// live plan. To catch a real violation, we require the IMPLEMENTATION_PLAN
// anchor within the same window as the active:true assignment.
//
// We use a sliding window: for each occurrence of `active: true`, we look
// backwards ~6000 chars for `IMPLEMENTATION_PLAN:` AND `CHANGE_CONTRACT:`
// (in that order, both before the active:true line). If both are found,
// the file is emitting a live plan with bootstrap on.
// ---------------------------------------------------------------------------
const ACTIVE_TRUE_RE = /\bactive\s*:\s*['"]?true['"]?\b/gi;
// WINDOW_BEFORE_CHARS: how far back to search for IMPLEMENTATION_PLAN +
// CHANGE_CONTRACT + bootstrap anchors before the `active: true` assignment.
// Sized at 6000 chars (~150 lines of 40-char YAML) to cover any realistic
// plan-architect emission header. CLAR-1 attempt-2: renamed from WINDOW_BEFORE
// and documented.
const WINDOW_BEFORE_CHARS = 6000;

function findPlanEmissions(content) {
  // Returns array of { offset, snippet } for each live-plan emission.
  const emissions = [];
  let match;
  ACTIVE_TRUE_RE.lastIndex = 0;
  while ((match = ACTIVE_TRUE_RE.exec(content)) !== null) {
    const activeIdx = match.index;

    // Skip YAML pure-comment lines. Column-aware: only skip if `#` appears
    // BEFORE the start of the `active:` token (a trailing-comment `#` does
    // not suppress the assignment). Word-boundary search on the current line
    // avoids landing inside `inactive` / `reactive` / `proactive`.
    const lineStart = content.lastIndexOf('\n', activeIdx) + 1;
    const currentLine = content.slice(lineStart, activeIdx + match[0].length);
    const wordBoundaryMatch = currentLine.match(/(^|[^A-Za-z0-9_])active\s*:/);
    let activeKeyCol = 0;
    if (wordBoundaryMatch) {
      // Index inside currentLine where the `active` word starts (skip the
      // captured non-word-char prefix, if any).
      const prefixLen = wordBoundaryMatch[1] ? wordBoundaryMatch[1].length : 0;
      activeKeyCol = wordBoundaryMatch.index + prefixLen;
    } else {
      // Fallback: no clean word-boundary match in current line — be
      // conservative and skip this candidate to avoid misclassification.
      continue;
    }
    const lineBeforeKey = currentLine.slice(0, activeKeyCol);
    if (lineBeforeKey.includes('#')) continue;

    const windowStart = Math.max(0, activeIdx - WINDOW_BEFORE_CHARS);
    const before = content.slice(windowStart, activeIdx);

    // Look for both anchors BEFORE the active:true assignment, in order.
    const planIdx = before.lastIndexOf('IMPLEMENTATION_PLAN:');
    if (planIdx < 0) continue;
    const contractIdx = before.indexOf('CHANGE_CONTRACT:', planIdx);
    if (contractIdx < 0) continue;
    // Also verify the active:true line is reasonably close to a `bootstrap:` key.
    const bootstrapIdx = before.lastIndexOf('bootstrap:');
    if (bootstrapIdx < 0 || bootstrapIdx < contractIdx) continue;

    emissions.push({
      offset: activeIdx,
      snippet: content.slice(windowStart + planIdx, activeIdx + 20),
    });
  }
  return emissions;
}

// SEC-D attempt-2: direct unit assertion that isAllowedPath actually works.
// The main scan skips `.pipeline/` via SKIP_BASENAMES so the allow-listed path
// is never encountered during the scan. Without this direct test, a future bug
// in isAllowedPath would pass CI undetected.
function _selfTestAllowedPath() {
  for (const p of ALLOWED_BOOTSTRAP_PATHS) {
    if (!isAllowedPath(p)) {
      throw new Error(`isAllowedPath() broken: did not recognise ${p}`);
    }
  }
  if (isAllowedPath('agents/quality/some-rogue-plan.md')) {
    throw new Error('isAllowedPath() too permissive: accepted non-allow-listed path');
  }
}

function fileViolatesInvariant(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return findPlanEmissions(content).length > 0;
}

console.log('=== F15 bootstrap lock invariant (no plan/template carries bootstrap.active: true) ===');

test('scan dirs exist (sanity)', () => {
  for (const d of SCAN_DIRS) {
    assert.ok(fs.existsSync(path.join(ROOT, d)), `scan dir missing: ${d}`);
  }
});

test('isAllowedPath() works for the historical bootstrap exemption (SEC-D coverage)', () => {
  // The main scan skips `.pipeline/`, so the allow-list branch is never
  // exercised by the structural scan. We assert it directly to prevent
  // silent regressions in isAllowedPath().
  _selfTestAllowedPath();
});

test('detector catches active: true with trailing inline comment (TEST-1 coverage)', () => {
  // Build a synthetic plan emission with an inline-comment on the active line.
  // Previously this was suppressed by the over-eager `#` guard.
  const synthetic = [
    'IMPLEMENTATION_PLAN:',
    '  total_tasks: 1',
    '  CHANGE_CONTRACT:',
    '    bootstrap:',
    '      active: true  # explanatory comment that should NOT suppress the violation',
  ].join('\n');
  const emissions = findPlanEmissions(synthetic);
  assert.equal(emissions.length, 1,
    'detector must flag active: true even when followed by a trailing inline comment');
});

test('detector still skips PURE comment lines (TEST-1 negative path)', () => {
  const synthetic = [
    'IMPLEMENTATION_PLAN:',
    '  # active: true  ← this is just documentation, not an assignment',
    '  CHANGE_CONTRACT:',
    '    bootstrap:',
    '      active: false',
  ].join('\n');
  const emissions = findPlanEmissions(synthetic);
  assert.equal(emissions.length, 0,
    'detector must skip pure comment lines that incidentally contain `active: true`');
});

test('detector word-boundary: does not confuse `reactive:` / `inactive:` with `active:` (SEC-3 attempt-3 fix)', () => {
  // SEC-3 attempt-3 finding: lastIndexOf('active', activeIdx) could land
  // inside `reactive` / `inactive` / `proactive`, giving a misleading column
  // and bypassing the comment guard. The word-boundary regex prevents this.
  const synthetic = [
    'IMPLEMENTATION_PLAN:',
    '  CHANGE_CONTRACT:',
    '    bootstrap:',
    '      reactive: false  # active: true  ← this is inside a comment, MUST be skipped',
  ].join('\n');
  const emissions = findPlanEmissions(synthetic);
  assert.equal(emissions.length, 0,
    'detector must NOT flag `active: true` that appears inside a comment on a `reactive:` line');
});

test('detector catches active: true even when other ...active words exist nearby', () => {
  const synthetic = [
    'IMPLEMENTATION_PLAN:',
    '  notes: "proactive monitoring not enabled"',
    '  CHANGE_CONTRACT:',
    '    bootstrap:',
    '      active: true',
  ].join('\n');
  const emissions = findPlanEmissions(synthetic);
  assert.equal(emissions.length, 1,
    'detector must still flag the real assignment even when sibling text contains `proactive`/`reactive`');
});

test('no committed plan or template carries bootstrap.active: true (allow-list applies)', () => {
  const files = [];
  for (const dir of SCAN_DIRS) {
    listMarkdownAndYamlAndJson(path.join(ROOT, dir), files);
  }

  const violations = [];
  for (const file of files) {
    const rel = relFromRoot(file);
    if (isAllowedPath(rel)) continue;
    if (fileViolatesInvariant(file)) {
      violations.push(rel);
    }
  }

  assert.equal(violations.length, 0,
    'unexpected files carry bootstrap.active: true:\n  ' +
    violations.map(v => `- ${v}`).join('\n  ') +
    '\n\nbootstrap.active: true is a one-time exemption for the v6.3.0 release ' +
    'plan and must NEVER be re-introduced. If you genuinely need scope relaxation, ' +
    'use escalation_required_if instead. See references/implementation-discipline.md ' +
    '§ "Bootstrap Lock Invariant".'
  );
});

test('implementation-discipline.md documents the lock invariant', () => {
  const ssot = path.join(ROOT, 'references/implementation-discipline.md');
  assert.ok(fs.existsSync(ssot), 'implementation-discipline.md must exist (F8 covers presence)');
  const content = fs.readFileSync(ssot, 'utf8');
  assert.ok(/Bootstrap\s+Lock\s+Invariant/i.test(content),
    'implementation-discipline.md must contain a "Bootstrap Lock Invariant" section');
  assert.ok(/three\s+layers\s+of\s+defense/i.test(content),
    'invariant section must mention the three layers of defense (prose, test, audit)');
});

test('plan-architect.md declares the LLM-level lock', () => {
  const planArchitect = path.join(ROOT, 'agents/quality/plan-architect.md');
  assert.ok(fs.existsSync(planArchitect), 'plan-architect.md must exist');
  const content = fs.readFileSync(planArchitect, 'utf8');
  assert.ok(/NORMATIVE\s+LOCK/i.test(content),
    'plan-architect.md must contain the NORMATIVE LOCK declaration');
  assert.ok(/bootstrap_replay_attempt/i.test(content),
    'NORMATIVE LOCK must define the bootstrap_replay_attempt status code');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
