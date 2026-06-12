#!/usr/bin/env node
'use strict';

/**
 * F06 (v7.13.0 — R6): session-lock entry-point coverage via the shared registry.
 *
 * Proves:
 *   - lib/entry-points.cjs matches EVERY supported /pipeline-orchestrator:*
 *     command including hyphenated (user-story, ux-sim) and -light/-heavy
 *     variants and spec — the cases the old hand-maintained regex silently missed.
 *   - Case-insensitive; legacy aliases (userstory→user-story, ux→ux-sim) normalize.
 *   - No over-match: unknown variants, setup-paperclip, foreign commands → no lock.
 *   - session-lock-hook creates a lock for each entry point (Scenario Outline).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ep = require('../../../lib/entry-points.cjs');
const lock = require('../../../.claude/hooks/session-lock-hook.cjs');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F06 v7.13.0 entry-point registry + session-lock coverage ===');

// --- helper: detection ---------------------------------------------------
const COVERED = [
  ['pipeline', 'pipeline'],
  ['bugfix', 'bugfix'], ['bugfix-light', 'bugfix-light'], ['bugfix-heavy', 'bugfix-heavy'],
  ['feature-light', 'feature-light'], ['feature-heavy', 'feature-heavy'],
  ['user-story', 'user-story'], ['user-story-light', 'user-story-light'], ['user-story-heavy', 'user-story-heavy'],
  ['audit', 'audit'], ['audit-light', 'audit-light'], ['audit-heavy', 'audit-heavy'],
  ['ux-sim', 'ux-sim'], ['ux-sim-light', 'ux-sim-light'], ['ux-sim-heavy', 'ux-sim-heavy'],
  ['spec', 'spec'], ['spec-light', 'spec-light'], ['spec-heavy', 'spec-heavy'], ['spec-audit-only', 'spec-audit-only'],
  ['review', 'review'],
];

test('detectEntryPoint matches every supported variant', () => {
  for (const [cmd, canonical] of COVERED) {
    const got = ep.detectEntryPoint(`/pipeline-orchestrator:${cmd} do some work`);
    assert.equal(got, canonical, `/${cmd} must detect as ${canonical}, got ${got}`);
  }
});

test('detectEntryPoint is case-insensitive', () => {
  assert.equal(ep.detectEntryPoint('/PIPELINE-ORCHESTRATOR:BUGFIX-HEAVY fix it'), 'bugfix-heavy');
  assert.equal(ep.detectEntryPoint('/Pipeline-Orchestrator:UX-Sim run'), 'ux-sim');
});

test('legacy aliases normalize to canonical', () => {
  assert.equal(ep.detectEntryPoint('/pipeline-orchestrator:userstory do x'), 'user-story');
  assert.equal(ep.detectEntryPoint('/pipeline-orchestrator:ux do x'), 'ux-sim');
});

test('does NOT over-match unknown variants or foreign commands', () => {
  for (const neg of [
    '/pipeline-orchestrator:bugfix-foo x',
    '/pipeline-orchestrator:setup-paperclip x',
    '/pipeline-orchestrator:measure-paperclip-fidelity x',
    '/other-plugin:bugfix x',
    '/bugfix without namespace',
    'just chatting about a bugfix',
    '',
  ]) {
    assert.equal(ep.detectEntryPoint(neg), null, `must NOT match: ${JSON.stringify(neg)}`);
  }
});

// --- session-lock integration (Scenario Outline) -------------------------
function mkcwd() { return fs.mkdtempSync(path.join(os.tmpdir(), 'f06-lock-')); }

test('session-lock creates a lock for EVERY entry point variant', () => {
  const variants = ['pipeline', 'bugfix-light', 'feature-heavy', 'user-story', 'user-story-heavy',
    'audit-light', 'ux-sim', 'ux-sim-heavy', 'spec-light', 'spec-audit-only', 'review'];
  variants.forEach((v, i) => {
    const cwd = mkcwd();
    const sid = `sess-f06-${i}`;
    const res = lock.handleUserPromptSubmit({ prompt: `/pipeline-orchestrator:${v} do work`, session_id: sid, cwd });
    assert.equal(res.action, 'lock_created', `/${v} must create a lock, got ${res.action}`);
    assert.ok(fs.existsSync(path.join(cwd, '.pipeline', 'sessions', `${sid}.lock`)), `/${v} lock file must exist`);
  });
});

test('session-lock is case-insensitive for variants', () => {
  const cwd = mkcwd();
  const res = lock.handleUserPromptSubmit({ prompt: '/PIPELINE-ORCHESTRATOR:UX-SIM-HEAVY go', session_id: 'sess-ci', cwd });
  assert.equal(res.action, 'lock_created', 'uppercase ux-sim-heavy must create a lock');
});

test('session-lock does NOT lock a non-entry-point command', () => {
  const cwd = mkcwd();
  const res = lock.handleUserPromptSubmit({ prompt: '/pipeline-orchestrator:setup-paperclip go', session_id: 'sess-np', cwd });
  assert.notEqual(res.action, 'lock_created', 'setup-paperclip must NOT create a lock');
});

// --- degraded-mode robustness (adversarial MEDIUM fix) -------------------
test('embedded FALLBACK list does not drift from the JSON registry', () => {
  const reg = JSON.parse(fs.readFileSync(ep.REGISTRY_PATH, 'utf8'));
  const jsonNames = [...(reg.entry_points || [])].sort();
  const fbNames = [...ep.FALLBACK_ENTRY_POINTS].sort();
  assert.deepEqual(fbNames, jsonNames, 'FALLBACK_ENTRY_POINTS must mirror references/entry-points.json');
  assert.deepEqual(
    Object.keys(ep.FALLBACK_ALIASES).sort(),
    Object.keys(reg.legacy_aliases || {}).sort(),
    'FALLBACK_ALIASES must mirror the JSON legacy_aliases',
  );
});

test('corrupt/unreadable registry degrades to COMPLETE coverage, never throws/fail-open', () => {
  const bad = path.join(os.tmpdir(), 'f06-nonexistent-registry-xyz.json');
  let reg;
  assert.doesNotThrow(() => { reg = ep.loadRegistry({ path: bad }); }, 'must not throw on unreadable registry');
  // Must still recognize every entry point (degrade SAFE, not to an empty set).
  for (const name of ['pipeline', 'bugfix-light', 'user-story', 'ux-sim', 'spec-heavy', 'review']) {
    assert.ok(reg.names.has(name), `fallback registry must still cover ${name}`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
