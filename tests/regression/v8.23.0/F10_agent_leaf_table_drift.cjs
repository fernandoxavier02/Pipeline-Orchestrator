#!/usr/bin/env node
'use strict';

// =============================================================================
// F10 (v8.23.0) — AGENT_LEAF_TO_FQN SSOT drift guard (round-2 architecture review, A4)
// =============================================================================
// AGENT_LEAF_TO_FQN (agent leaf -> fully-qualified subagent_type) is duplicated
// in TWO places by design: lib/next-action.cjs (exported, the SSOT resolver) and
// .claude/hooks/dispatch-guard.cjs (an inline copy, because the hook is a
// standalone Node process with no module.exports and cannot safely require the
// lib at the point the table is needed for matcher construction). Both copies
// carry a comment instructing "keep them in sync", but comments are not
// enforceable — a future agent add/remove/move that edits one table and forgets
// the other drifts silently, and next-action.cjs's fallback resolution would
// then resolve a DIFFERENT FQN than dispatch-guard.cjs's deny sites cite.
//
// This test turns that human sync-obligation into an enforced check: it parses
// the table out of BOTH files the SAME way and deep-compares them. Any drift
// fails the suite.
//
// Extraction note: dispatch-guard.cjs has no module.exports, so the table is
// re-parsed from source (regex over the isolated Object.freeze({ ... }) block).
// next-action.cjs exports the table directly via require. Comparing the two as
// sorted [leaf, fqn] pair arrays gives a precise diff on failure.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/dispatch-guard.cjs');
const { AGENT_LEAF_TO_FQN } = require(path.join(ROOT, 'lib/next-action.cjs'));

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

// Parse the AGENT_LEAF_TO_FQN object literal out of dispatch-guard.cjs's source.
// Isolates the block between `AGENT_LEAF_TO_FQN = Object.freeze({` and its
// closing `})` (the table is FLAT — leaf->fqn strings only, no nested objects —
// so the first `})` after the opening brace is the table's close), then extracts
// every `'leaf': 'pipeline-orchestrator:...'` pair. Returns a Map<leaf, fqn>.
function extractTableFromHook(srcPath) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const decl = src.indexOf('AGENT_LEAF_TO_FQN = Object.freeze({');
  assert.ok(decl >= 0, 'AGENT_LEAF_TO_FQN declaration not found in dispatch-guard.cjs');
  const openBrace = src.indexOf('{', decl);
  assert.ok(openBrace > decl, 'opening brace of AGENT_LEAF_TO_FQN not found');
  const close = src.indexOf('})', openBrace);
  assert.ok(close > openBrace, 'closing of AGENT_LEAF_TO_FQN table not found');
  const block = src.slice(openBrace, close + 1);
  // Flatness guard (round-3 quality review, Q1): extraction assumes the table is
  // a flat leaf->fqn map, so the first `})` after the opening brace is the real
  // close. If a future edit nests an object inside the table, the block-isolation
  // would silently capture too little — fail LOUDLY here instead of returning a
  // partial parse that masks real drift.
  const openBraces = (block.match(/{/g) || []).length;
  assert.equal(openBraces, 1,
    'AGENT_LEAF_TO_FQN block has nested objects — extraction assumes a flat leaf->fqn map; update F10 if the table shape changed');
  const map = new Map();
  // Quote-agnostic pair match (round-3 quality review, Q1): a formatter swapping
  // single for double quotes would silently break a single-quote-only regex (the
  // two source files use single quotes today, but that is not a contract). The \1
  // backreference pins the opening quote char to the closing one, so both
  // 'leaf':'fqn' and "leaf":"fqn" parse — robust to a future reformat without
  // changing comparison semantics. groups: [1]=quote, [2]=leaf, [3]=fqn.
  const re = /(['"])([a-z0-9-]+)\1:\s*\1(pipeline-orchestrator:[a-z0-9:-]+)\1/g;
  let m;
  while ((m = re.exec(block)) !== null) map.set(m[2], m[3]);
  return map;
}

function sortedPairs(entries) {
  return entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

console.log('=== F10 v8.23.0 — AGENT_LEAF_TO_FQN SSOT drift guard ===');

record('S1 [parity] dispatch-guard.cjs table == lib/next-action.cjs table (keys + values identical)', () => {
  const hookTable = extractTableFromHook(HOOK);
  const libEntries = Object.entries(AGENT_LEAF_TO_FQN);
  assert.ok(hookTable.size > 0, 'parsed 0 entries from dispatch-guard.cjs — the extraction regex/block-isolation is broken');
  assert.ok(libEntries.length > 0, 'next-action.cjs exported an empty AGENT_LEAF_TO_FQN');
  const hookPairs = sortedPairs([...hookTable.entries()]);
  const libPairs = sortedPairs(libEntries);
  assert.deepEqual(hookPairs, libPairs,
    `AGENT_LEAF_TO_FQN drifted between lib/next-action.cjs (${libPairs.length} entries) and ` +
    `.claude/hooks/dispatch-guard.cjs (${hookPairs.length} entries). Both copies MUST stay in sync ` +
    `(see the sync comments in BOTH files). Diff above — add/remove/move the missing or extra entry ` +
    `in whichever file is behind.`);
});

record('S2 [shape] every entry maps a leaf to a fully-qualified pipeline-orchestrator:* FQN', () => {
  // Guards against a half-edited entry (leaf present but FQN missing/malformed)
  // surviving in either table.
  for (const [leaf, fqn] of Object.entries(AGENT_LEAF_TO_FQN)) {
    assert.match(String(fqn), /^pipeline-orchestrator:/,
      `lib table: leaf '${leaf}' maps to non-FQN value '${fqn}'`);
  }
  for (const [leaf, fqn] of extractTableFromHook(HOOK)) {
    assert.match(String(fqn), /^pipeline-orchestrator:/,
      `hook table: leaf '${leaf}' maps to non-FQN value '${fqn}'`);
  }
});

record('S3 [no phantom] neither table carries a placeholder/test entry that leaked in', () => {
  // Catches a drift-probe left behind (e.g. a 'zzz-test-phantom' entry used to
  // RED-prove S1 and never removed). Real leaves are lowercase-kebab; this just
  // bans the obvious sentinel prefixes used in ad-hoc mutation tests.
  const banned = /phantom|test-placeholder|do-not-commit/i;
  for (const leaf of Object.keys(AGENT_LEAF_TO_FQN)) {
    assert.doesNotMatch(leaf, banned, `lib table carries a non-real entry '${leaf}'`);
  }
  for (const leaf of extractTableFromHook(HOOK).keys()) {
    assert.doesNotMatch(leaf, banned, `hook table carries a non-real entry '${leaf}'`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
