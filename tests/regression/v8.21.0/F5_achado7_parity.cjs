#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.21.0) — Achado #7 protocol-block PARITY across the 8 carrier skills
// (Slice S4 / task 5.1). TDD RED.
// =============================================================================
// GOAL: pin AC 4.1 (a regression check that all copies of the Achado #7
// GATE_REQUEST-handler block stay in parity) + AC 4.2 (when a copy drifts, the
// check FAILS and NAMES the divergent file). The block lives, today, in exactly
// 8 skills — pipeline, bugfix, feature, audit, refactor, user-story, ux-sim,
// spec — each anchored by the literal heading:
//     "## Achado #7 GATE_REQUEST handler"
// The block is a fixed-size 16-line fragment carrying 2 SLOTS that legitimately
// vary per skill:
//     {{CONTROLLER}} — the dispatched controller name (pipeline-controller /
//                      spec-controller)
//     {{TERMINAL}}   — the terminal block phrase (PIPELINE COMPLETE /
//                      SPEC AUTHORING COMPLETE)
// After SLOT-NORMALIZATION (replacing each file's two slot values with the
// tokens) every copy must be byte-identical to ONE canonical fragment.
//
// LINE-ENDING NORMALIZATION (deliberate): the current tree carries MIXED line
// endings across these files (some CRLF, some LF — a pre-existing artifact the
// repo's `.gitattributes eol=lf` policy addresses SEPARATELY). This parity check
// is about protocol CONTENT, not the CR byte, so every read normalizes CRLF/CR to
// LF before comparing. Without this, the comparator would flag a byte-identical
// copy as "drifted" purely because of its line-ending representation — a false
// divergence that has nothing to do with AC 4.1/4.2.
//
// WHY THIS IS A GENUINE RED (right reason), TWO independent failing anchors:
//   (1) The single source of truth `references/achado-7-skill-handler.md` does
//       NOT exist yet (it is the task 5.2 deliverable). Case F5-1 loads it
//       DEFENSIVELY (try/caught, mirroring F1's missing-module pattern) so the
//       file RUNS to completion and fails on a CLEAN existence assertion, NOT an
//       import/read crash. -> RED now, GREEN once 5.2 ships the file + resyncs.
//   (2) Against the CURRENT tree, 3 of the 8 copies are drifted: user-story and
//       ux-sim were condensed to a single paragraph, and spec carries 3 micro-
//       divergences that survive slot-normalization (backticked controller name,
//       a missing "e.g., " before the terminal phrase, and an omitted explicit
//       named-gates list). Case F5-2 compares all 8 copies against the DE-FACTO
//       reference (the pipeline copy, which already exists in-tree) and asserts
//       ZERO drift — so it FAILS now and NAMES exactly {spec, user-story,
//       ux-sim}. -> RED now, GREEN once 5.2 resyncs those 3.
//
// The remaining cases (F5-3..F5-6) are TEETH / self-check cases: they exercise
// the comparator against SYNTHETIC in-memory fragments so they PASS now and
// stay stable across time, PROVING the comparator is not a
// whitespace-only / length-only tautology (a divergence must be caught by
// CONTENT, and the divergent name must be reported).
//
// After task 5.2 (create the canonical file + resync the 3 drifted copies) every
// case in this file goes GREEN with ZERO test edits.
// -----------------------------------------------------------------------------
// This file writes NOTHING and mutates NO production file — it only reads the 8
// SKILL.md copies + (defensively) the not-yet-existing canonical file.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const CANON_PATH = path.join(REPO_ROOT, 'references', 'achado-7-skill-handler.md');

// The literal SECTION heading the block is anchored on. Matching is a
// startsWith on this exact string (the real heading has a "(2026-05-07+, ...)"
// suffix) — deliberately NOT a loose "Achado #7" substring, so a mere prose
// mention (e.g. skills/unblock/SKILL.md cites the finding in a sentence) is
// never mistaken for a real copy of the block.
const HEADING_PREFIX = '## Achado #7 GATE_REQUEST handler';

// The end-anchor used ONLY to MEASURE the reference fragment length from the
// pipeline copy (the de-facto standard). All other extraction uses that fixed
// line count.
const END_ANCHOR_PREFIX = '**Never silently default.';

// Boundary markers the canonical file (task 5.2) will use to delimit the shared
// fragment. Kept here so this test reads the canonical fragment the moment 5.2
// ships it, with no edit.
const FRAGMENT_START = '<!-- ACHADO7_FRAGMENT_START -->';
const FRAGMENT_END = '<!-- ACHADO7_FRAGMENT_END -->';

// The 8-file ALLOWLIST of block carriers + each file's two slot values. The slot
// values are read off the current tree (not invented): the 5 synced copies +
// user-story + ux-sim dispatch "pipeline-controller" and terminate on
// "PIPELINE COMPLETE"; spec dispatches "spec-controller" and terminates on
// "SPEC AUTHORING COMPLETE".
const SKILL_SLOTS = {
  pipeline: { controller: 'pipeline-controller', terminal: 'PIPELINE COMPLETE' },
  bugfix: { controller: 'pipeline-controller', terminal: 'PIPELINE COMPLETE' },
  feature: { controller: 'pipeline-controller', terminal: 'PIPELINE COMPLETE' },
  audit: { controller: 'pipeline-controller', terminal: 'PIPELINE COMPLETE' },
  refactor: { controller: 'pipeline-controller', terminal: 'PIPELINE COMPLETE' },
  'user-story': { controller: 'pipeline-controller', terminal: 'PIPELINE COMPLETE' },
  'ux-sim': { controller: 'pipeline-controller', terminal: 'PIPELINE COMPLETE' },
  spec: { controller: 'spec-controller', terminal: 'SPEC AUTHORING COMPLETE' },
};
const ALLOWLIST = Object.keys(SKILL_SLOTS);

// --- helpers -----------------------------------------------------------------

function skillPath(name) {
  return path.join(SKILLS_DIR, name, 'SKILL.md');
}

// Normalize CRLF/CR to LF so the comparator measures CONTENT, not line-ending
// representation (see the LINE-ENDING NORMALIZATION note in the header).
function normalizeEol(raw) {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readLines(file) {
  return normalizeEol(fs.readFileSync(file, 'utf8')).split('\n');
}

// Index of the FIRST line that STARTS WITH the section heading (never a loose
// substring). -1 if the block heading is absent.
function findHeadingIndex(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(HEADING_PREFIX)) return i;
  }
  return -1;
}

// Literal, global slot-normalization (split/join, so slot values are treated as
// plain strings, not regex). Replacing the terminal first vs controller first is
// irrelevant — the two slot vocabularies never overlap.
function normalizeSlots(text, slots) {
  return text
    .split(slots.terminal).join('{{TERMINAL}}')
    .split(slots.controller).join('{{CONTROLLER}}');
}

// Extract exactly `count` lines starting at the block heading of a skill file,
// then slot-normalize with that skill's slot values. Returns null when the block
// heading is absent (so a missing block is a clean mismatch, not a crash).
function normalizedFragmentForSkill(name, count) {
  const lines = readLines(skillPath(name));
  const start = findHeadingIndex(lines);
  if (start === -1) return null;
  const raw = lines.slice(start, start + count).join('\n');
  return normalizeSlots(raw, SKILL_SLOTS[name]);
}

// Derive the DE-FACTO reference fragment from the pipeline copy: from the
// heading through the end-anchor line (inclusive). Returns { text, count }.
function deriveReferenceFragment() {
  const lines = readLines(skillPath('pipeline'));
  const start = findHeadingIndex(lines);
  assert.notEqual(start, -1, 'precondition: pipeline/SKILL.md must carry the Achado #7 block heading');
  let end = -1;
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].startsWith(END_ANCHOR_PREFIX)) { end = i; break; }
  }
  assert.notEqual(end, -1, 'precondition: pipeline block must terminate on the "Never silently default." line');
  const slice = lines.slice(start, end + 1);
  return { text: slice.join('\n'), count: slice.length };
}

// Read the canonical fragment (between the boundary markers) from the not-yet-
// existing SSOT file — DEFENSIVELY, so absence becomes a clean assertion later.
function loadCanonicalFragment() {
  let raw = null;
  let err = null;
  try {
    raw = fs.readFileSync(CANON_PATH, 'utf8');
  } catch (e) {
    err = e;
  }
  if (raw == null) return { fragment: null, err };
  raw = normalizeEol(raw);
  const s = raw.indexOf(FRAGMENT_START);
  const e = raw.indexOf(FRAGMENT_END);
  if (s === -1 || e === -1 || e <= s) {
    return { fragment: null, err: new Error('canonical file present but ACHADO7_FRAGMENT_START/END markers not found in order') };
  }
  const between = raw.slice(s + FRAGMENT_START.length, e);
  // Trim exactly one leading/trailing newline introduced by the marker lines.
  return { fragment: between.replace(/^\n/, '').replace(/\n$/, ''), err: null };
}

// A shape-only comparator (line count + per-line length) — used ONLY in F5-6 to
// PROVE it would MISS a same-shape content change, and that the real comparator
// (content equality) does not.
function sameShape(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  if (la.length !== lb.length) return false;
  for (let i = 0; i < la.length; i += 1) {
    if (la[i].length !== lb[i].length) return false;
  }
  return true;
}

// --- harness -----------------------------------------------------------------

let pass = 0;
let fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass += 1; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e && e.message}`); fail += 1; failed.push(name); }
}

console.log('=== F5 v8.21.0 — Achado #7 protocol-block parity across 8 skills [RED] ===');

// Reference fragment (de-facto standard from the pipeline copy). Sanity-pinned so
// a future structural change to the block length FAILS loudly instead of silently
// re-scoping the comparison window.
const REF = deriveReferenceFragment();
const REFERENCE_TEMPLATE = normalizeSlots(REF.text, SKILL_SLOTS.pipeline);

// 1 — [MAIN] AC 4.1: all 8 copies match the CANONICAL SSOT fragment ------------
// RED now: references/achado-7-skill-handler.md does not exist yet (task 5.2).
// The load is defensive; this fails on a clean existence assertion, and once the
// file exists it additionally requires every copy to match it.
test('F5-1 [MAIN] AC4.1 — all 8 copies match the canonical references/achado-7-skill-handler.md fragment after slot-normalization', () => {
  const { fragment, err } = loadCanonicalFragment();
  assert.ok(
    typeof fragment === 'string' && fragment.length > 0,
    'references/achado-7-skill-handler.md must exist and expose a fragment between '
      + `${FRAGMENT_START} / ${FRAGMENT_END}`
      + (err ? ` (load error: ${err.message})` : ''),
  );
  const count = fragment.split('\n').length;
  const mismatches = [];
  for (const name of ALLOWLIST) {
    const norm = normalizedFragmentForSkill(name, count);
    if (norm !== fragment) mismatches.push(name);
  }
  assert.deepEqual(
    mismatches, [],
    `these copies do NOT match the canonical fragment after slot-normalization: ${mismatches.join(', ')}`,
  );
});

// 2 — [MAIN / RED baseline] AC 4.1: current tree fails, NAMING the drifted files
// Uses the pipeline copy as the de-facto reference (it exists today), so this is
// a real drift detector independent of the not-yet-created canonical file. RED
// now: it names exactly the 3 drifted copies; GREEN once 5.2 resyncs them.
test('F5-2 [MAIN] RED baseline — against the CURRENT tree the parity check FAILS and NAMES exactly {spec, user-story, ux-sim}', () => {
  assert.equal(REF.count, 16,
    `sanity: the Achado #7 fragment must be 16 lines (got ${REF.count}) — update the taxonomy if the block structure changed`);
  const divergent = [];
  for (const name of ALLOWLIST) {
    const norm = normalizedFragmentForSkill(name, REF.count);
    if (norm !== REFERENCE_TEMPLATE) divergent.push(name);
  }
  divergent.sort();
  assert.deepEqual(
    divergent, [],
    `the Achado #7 block has drifted in these copies (must be resynced to the canonical fragment): ${divergent.join(', ')}`,
  );
});

// 3 — [REGRESSION] AC 4.2: a 1-char injection in an already-synced copy is caught
// and the file is NAMED. Synthetic (in-memory) so it PASSES now and proves the
// comparator's teeth. Starts from the pipeline reference (a synced copy), injects
// a single character, and asserts the divergence is detected + attributed.
test('F5-3 [REGRESSION] AC4.2 — a 1-char divergence in a synced copy is caught and the file is named', () => {
  // Take a genuinely-synced fragment (pipeline), inject exactly one character.
  const injected = REF.text.replace('tool result.', 'tool result!'); // 1 char changed ('.'->'!')
  assert.notEqual(injected, REF.text, 'precondition: the injection must actually change the fragment');
  const candidates = {
    'audit(synced-copy)': REF.text, // untouched synced copy -> must NOT be flagged
    'feature(injected-copy)': injected, // 1-char drift -> MUST be flagged + named
  };
  const named = [];
  for (const [label, text] of Object.entries(candidates)) {
    if (normalizeSlots(text, SKILL_SLOTS.pipeline) !== REFERENCE_TEMPLATE) named.push(label);
  }
  assert.deepEqual(named, ['feature(injected-copy)'],
    'a single-character divergence must be caught and ONLY the drifted copy named (AC4.2 sensitivity)');
});

// 4 — [REGRESSION] block-heading allowlist: the full block appearing OUTSIDE the
// 8 is flagged, but a loose "Achado #7" prose mention is NOT. Real-tree part
// asserts today's heading-bearing set is exactly the allowlist; synthetic part
// proves the block-vs-mention distinction (literal heading, not loose substring).
test('F5-4 [REGRESSION] allowlist — full block outside the 8 is flagged; a loose "Achado #7" mention is not', () => {
  // A) Real tree: which skills/*/SKILL.md carry the literal block heading?
  const dirents = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const headingBearers = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const p = skillPath(d.name);
    if (!fs.existsSync(p)) continue;
    if (findHeadingIndex(readLines(p)) !== -1) headingBearers.push(d.name);
  }
  headingBearers.sort();
  assert.deepEqual(headingBearers, ALLOWLIST.slice().sort(),
    `exactly the 8 allowlisted skills may carry the Achado #7 block heading; got: ${headingBearers.join(', ')}`);

  // B) Teeth: a hasBlockHeading() built on the literal heading must accept a real
  //    block but reject the real skills/unblock/SKILL.md prose mention.
  const hasBlockHeading = (content) => normalizeEol(content).split('\n').some((l) => l.startsWith(HEADING_PREFIX));
  assert.ok(hasBlockHeading(`${HEADING_PREFIX} (2026-05-07+, v5.2.0-rc.2+)\n\nWhen the dispatched ...`),
    'a real block heading must be recognized');
  const looseMention = 'it is the one executable exit for BOTH readers: a parent ... (which does not, per Achado #7, so it emits a `DISPATCH_REQUEST` block instead).';
  assert.ok(!hasBlockHeading(looseMention),
    'a loose in-prose "Achado #7" mention (e.g. skills/unblock/SKILL.md) must NOT be treated as a block copy');

  // C) Teeth: a 9th carrier (block copied into a non-allowlisted skill) is flagged.
  const outsideAllowlist = (names) => names.filter((n) => !SKILL_SLOTS[n]);
  assert.deepEqual(outsideAllowlist(['pipeline', 'spec', 'refactor-light']), ['refactor-light'],
    'the block appearing in a non-allowlisted skill (e.g. refactor-light) must be flagged as outside the allowlist');
});

// 5 — [EDGE] fragment boundary: the spec copy's extra re-dispatch paragraph and
// its ## Flags section are OUTSIDE the 16-line fragment and must NOT be compared.
// Passes now: proves spec's drift (F5-2) is due to the 3 micro-divergences, NOT
// the trailing paragraph/section.
test('F5-5 [EDGE] boundary — spec extra re-dispatch paragraph + ## Flags are OUTSIDE the compared fragment', () => {
  const lines = readLines(skillPath('spec'));
  const start = findHeadingIndex(lines);
  assert.notEqual(start, -1, 'precondition: spec/SKILL.md must carry the block heading');
  const fragment = lines.slice(start, start + REF.count).join('\n');
  // The trailing content EXISTS in the file...
  const fullFile = lines.join('\n');
  assert.ok(/Re-dispatch = a FRESH/.test(fullFile),
    'precondition: spec/SKILL.md must actually contain the extra re-dispatch paragraph');
  assert.ok(/\n## Flags/.test(fullFile),
    'precondition: spec/SKILL.md must actually contain the ## Flags section');
  // ...but neither must fall inside the compared 16-line fragment window.
  assert.ok(!/Re-dispatch = a FRESH/.test(fragment),
    'the extra re-dispatch paragraph (line ~49) must be OUTSIDE the 16-line fragment');
  assert.ok(!/## Flags/.test(fragment),
    'the ## Flags section must be OUTSIDE the 16-line fragment');
});

// 6 — [EDGE] content teeth: a word-level change that preserves EXACT shape (same
// line count, same per-line length, same whitespace) must STILL be caught — the
// comparator inspects content, not shape. Passes now; proves no shape-only
// tautology. Also demonstrates a shape-only comparator would MISS it.
test('F5-6 [EDGE] content teeth — a same-shape word swap is still caught (no whitespace/length-only tautology)', () => {
  // "Parse" (5) -> "Merge" (5): identical length, identical whitespace, identical
  // line count — only the word changes.
  assert.ok(REF.text.includes('Parse each block'),
    'precondition: the reference fragment must contain the word "Parse each block"');
  const mutated = REF.text.replace('Parse each block', 'Merge each block');
  assert.notEqual(mutated, REF.text, 'precondition: the word swap must change the fragment');
  // Shape is byte-for-byte identical...
  assert.equal(mutated.length, REF.text.length, 'the mutation must preserve total character length');
  assert.equal(mutated.split('\n').length, REF.text.split('\n').length, 'the mutation must preserve line count');
  assert.ok(sameShape(mutated, REF.text),
    'a shape-only comparator (line count + per-line length) would consider the two IDENTICAL — the tautology trap');
  // ...yet the content comparator MUST flag the divergence.
  assert.notEqual(
    normalizeSlots(mutated, SKILL_SLOTS.pipeline), REFERENCE_TEMPLATE,
    'the content comparator must catch a same-shape word change (proves it is content-sensitive, not shape-only)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
