#!/usr/bin/env node
'use strict';

/**
 * F08 (v7.13.0 — R7): gate-decision vocabulary coherence.
 *
 * Static scanner over first-party prompts (agents / commands / skills /
 * references) for `decision:` literal values. A literal UPPER_SNAKE value must
 * be either one of the 8 CANONICAL writer decisions OR an explicitly-documented
 * SEPARATE vocabulary (spec/Pa-de-Cal verdicts, protocol bookkeeping). Anything
 * else — like the non-canonical `FORCE_VARIANT_OVERRIDDEN` this batch removes —
 * fails. Plus: the runtime writer rejects non-canonical decisions, and the
 * STRICT_SPEC_REJECTION example now uses a canonical decision.
 *
 * NOTE on scope (R7): the codebase has THREE coexisting `decision:` vocabularies —
 *   (1) the gate-decisions.jsonl writer's 8 canonical machine values;
 *   (2) spec-lifecycle / Pa-de-Cal verdicts (GO / NO-GO / PASS / FAIL / ...);
 *   (3) protocol + circuit-breaker bookkeeping (CLEARED_CROSS_SESSION / RESET / ...).
 * R7's target is keeping (1) canonical (the writer-bound examples). (2) and (3)
 * are separate, pre-existing vocabularies and are allow-listed here, not rewritten.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const { CANONICAL_DECISIONS } = require(path.join(ROOT, 'lib/gate-decision-writer.cjs'));

// (2)+(3): documented separate vocabularies that legitimately appear as `decision:`
// in non-gate-writer contexts. Keeping this list explicit makes a NEW stray value
// (or a re-introduced FORCE_VARIANT_OVERRIDDEN) fail loudly.
const KNOWN_SEPARATE_VOCAB = new Set([
  // spec-lifecycle / Pa-de-Cal verdicts
  'GO', 'NO_GO', 'CONDITIONAL', 'PASS', 'FAIL', 'PASS_WITH_WARNINGS', 'WARN', 'BLOCK',
  'CLOSED', 'STOPPED', 'CONDITIONAL_SKIP',
  // protocol / circuit-breaker bookkeeping
  'CLEARED_CROSS_SESSION', 'RESET', 'RESOLVED',
]);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F08 v7.13.0 gate-decision vocabulary coherence (R7) ===');

function listMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listMd(full));
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}
const files = ['agents', 'commands', 'skills', 'references'].flatMap((d) => listMd(path.join(ROOT, d)));

// Capture the value of `decision:` (NOT `gate_decision:`) PRECISELY — the quoted
// content exactly, or a bare token. This closes the "decision: \"EVIL\" | FAIL"
// evasion (the | is outside the quotes, so the captured value is just EVIL).
const DECISION_RE = /(?<!gate_)\bdecision:\s*(?:"([^"\n]*)"|'([^'\n]*)'|([A-Za-z][A-Za-z0-9_-]*))/g;
const UPPER_SNAKE = /^[A-Z][A-Z0-9_]+$/;
// A gate-decisions.jsonl ENTRY has a sibling `gate:` field on the same line.
// In that context the decision MUST be canonical (it goes through the writer);
// elsewhere (agent output schemas, protocol bookkeeping prose) separate
// vocabularies are tolerated.
const GATE_ENTRY_RE = /\bgate:\s*["'A-Z]/;

function lineAt(text, idx) {
  const start = text.lastIndexOf('\n', idx) + 1;
  let end = text.indexOf('\n', idx);
  if (end < 0) end = text.length;
  return text.slice(start, end);
}

test('scanner runs over a non-trivial prompt corpus', () => {
  assert.ok(files.length >= 30, `expected >=30 md files, got ${files.length}`);
});

test('decision: in a gate-entry is canonical; elsewhere only documented-separate', () => {
  const offenders = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    let m;
    DECISION_RE.lastIndex = 0;
    while ((m = DECISION_RE.exec(text))) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      if (/[|<\[]/.test(raw)) continue;            // enum/placeholder (e.g. "PASS | FAIL")
      const v = raw.trim();
      if (!UPPER_SNAKE.test(v)) continue;          // lowercase/hyphen/prose — runtime writer is the backstop
      if (CANONICAL_DECISIONS.has(v)) continue;    // canonical always ok
      const line = lineAt(text, m.index);
      const lineNo = text.slice(0, m.index).split('\n').length;
      const rel = `${path.relative(ROOT, f)}:${lineNo}`;
      if (GATE_ENTRY_RE.test(line)) {
        offenders.push(`${rel} → decision: ${v} (NON-CANONICAL in a gate-decisions entry)`);
      } else if (!KNOWN_SEPARATE_VOCAB.has(v)) {
        offenders.push(`${rel} → decision: ${v} (undocumented value)`);
      }
    }
  }
  assert.equal(offenders.length, 0,
    `gate-decision vocabulary violation(s):\n  - ${offenders.join('\n  - ')}`);
});

test('STATE_FILE_INIT_FAIL gate-entry uses a canonical decision (not PASS)', () => {
  const ctrl = fs.readFileSync(path.join(ROOT, 'agents/core/pipeline-controller.md'), 'utf8');
  // every STATE_FILE_INIT_FAIL gate-entry line's decision must be canonical
  for (const line of ctrl.split('\n')) {
    if (!/gate:\s*"STATE_FILE_INIT_FAIL"/.test(line)) continue;
    const m = line.match(/decision:\s*"([A-Z_]+)"/);
    if (m) assert.ok(CANONICAL_DECISIONS.has(m[1]), `STATE_FILE_INIT_FAIL decision "${m[1]}" must be canonical`);
  }
});

test('FORCE_VARIANT_OVERRIDDEN no longer appears as a decision value', () => {
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(
      !/decision:\s*["']?FORCE_VARIANT_OVERRIDDEN/.test(text),
      `${path.relative(ROOT, f)} still uses decision: FORCE_VARIANT_OVERRIDDEN (move it to detail)`,
    );
  }
});

test('STRICT_SPEC_REJECTION example uses a canonical decision (TRIGGERED)', () => {
  const ctrl = fs.readFileSync(path.join(ROOT, 'agents/core/pipeline-controller.md'), 'utf8');
  const m = ctrl.match(/STRICT_SPEC_REJECTION"[^`]*decision:\s*"([A-Z_]+)"/);
  assert.ok(m, 'STRICT_SPEC_REJECTION gate-decisions example must exist in pipeline-controller');
  assert.ok(CANONICAL_DECISIONS.has(m[1]), `decision "${m[1]}" must be canonical`);
});

test('runtime writer still rejects a non-canonical decision', () => {
  const { appendGateDecision, buildCtx } = require(path.join(ROOT, 'lib/gate-decision-writer.cjs'));
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f08-'));
  const ctx = buildCtx(tmp, { type: 'Bug Fix', complexity: 'COMPLEXA' });
  assert.throws(
    () => appendGateDecision(path.join(tmp, 'gate-decisions.jsonl'),
      { gate: 'X', hardness: 'AUDIT', phase: '0', decision: 'FORCE_VARIANT_OVERRIDDEN', decided_by: 'x', timestamp: new Date().toISOString(), detail: '', confidence_impact: 0 }, ctx),
    /not in CANONICAL_DECISIONS/,
    'writer must throw on a non-canonical decision',
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
