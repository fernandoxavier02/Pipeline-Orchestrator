#!/usr/bin/env node
'use strict';

/**
 * Lock 1 — Agent-count documentation parity (workflow-audit-remediation, S3 / task 4.1).
 *
 * Requirement 6.1/6.4: a SINGLE correct agent count, consistent across every
 * source. The physical truth is the number of agent-definition files under
 * `agents/**\/*.md`. This test discovers that count LIVE, then asserts it equals
 * (a) the canonical `references/agent-registry.json` total and (b) every
 * documentation surface that declares a plugin agent count.
 *
 * NOTHING is hard-coded: the expected number is always the live physical count.
 * Failure messages name the file + expected-vs-found so a drift is actionable.
 *
 * Reserved semver folder: v8.26.0 is NOT a released version — it is the
 * discovery-visible home for the S3 DocParityLocks (v8.25.0 was already taken
 * by an unrelated in-flight slice, so this slice uses the next free semver dir,
 * mirroring how S2's frozen RED tests live under tests/regression/v8.21.0/).
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

// --- Live physical count: walk agents/**/*.md ---------------------------------
function walkMd(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkMd(p));
    else if (ent.isFile() && ent.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const AGENTS_DIR = path.join(ROOT, 'agents');
const PHYSICAL = walkMd(AGENTS_DIR).length;

console.log(`=== Lock 1 — agent-count parity (physical = ${PHYSICAL}) ===`);

// Sanity: the discovery found a plausible roster (guards a broken walk that
// would otherwise make every "=== PHYSICAL" assertion vacuously pass at 0).
test(`physical agent-definition count is discovered (> 0)`, () => {
  assert.ok(PHYSICAL > 0, `walk of agents/**/*.md found ${PHYSICAL} files`);
});

// (a) references/agent-registry.json total === physical
test(`references/agent-registry.json physical_files.total === ${PHYSICAL}`, () => {
  const p = path.join(ROOT, 'references', 'agent-registry.json');
  assert.ok(fs.existsSync(p), `references/agent-registry.json is missing (must be the canonical count SSOT)`);
  const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
  const total = reg && reg.physical_files && reg.physical_files.total;
  assert.equal(total, PHYSICAL,
    `references/agent-registry.json physical_files.total = ${total}; live glob = ${PHYSICAL}`);
});

// (a') per-layer breakdown in the registry sums to the physical total and each
// layer matches the live per-directory count (keeps the SSOT honest, not just
// its grand total).
test(`agent-registry.json per-layer counts match live directories and sum to ${PHYSICAL}`, () => {
  const p = path.join(ROOT, 'references', 'agent-registry.json');
  assert.ok(fs.existsSync(p), `references/agent-registry.json is missing`);
  const pf = JSON.parse(fs.readFileSync(p, 'utf8')).physical_files;
  const liveCore = walkMd(path.join(AGENTS_DIR, 'core')).length;
  const liveBrainstorm = walkMd(path.join(AGENTS_DIR, 'brainstorm')).length;
  const liveQuality = walkMd(path.join(AGENTS_DIR, 'quality')).length;
  // executor top-level (non type-specific) vs deeper (type-specific)
  const execRoot = path.join(AGENTS_DIR, 'executor');
  const execTop = fs.readdirSync(execRoot, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md')).length;
  const execTypeSpecific = walkMd(execRoot).length - execTop;
  assert.equal(pf.core, liveCore, `core: registry ${pf.core} vs live ${liveCore}`);
  assert.equal(pf.brainstorm, liveBrainstorm, `brainstorm: registry ${pf.brainstorm} vs live ${liveBrainstorm}`);
  assert.equal(pf.quality, liveQuality, `quality: registry ${pf.quality} vs live ${liveQuality}`);
  assert.equal(pf.executor, execTop, `executor: registry ${pf.executor} vs live ${execTop}`);
  assert.equal(pf.executor_type_specific, execTypeSpecific,
    `executor_type_specific: registry ${pf.executor_type_specific} vs live ${execTypeSpecific}`);
  const sum = pf.core + pf.brainstorm + pf.executor + pf.executor_type_specific + pf.quality;
  assert.equal(sum, PHYSICAL, `layer sum ${sum} !== physical ${PHYSICAL}`);
  assert.equal(pf.total, PHYSICAL, `registry total ${pf.total} !== physical ${PHYSICAL}`);
});

// (b) documentation surfaces that declare a plugin agent count === physical
// Each surface is checked with a phrase-anchored regex so unrelated numbers
// (e.g. README's "47 agent roles" / "~50 agents on codex_local") are not caught.

function readFile(rel) {
  const p = path.join(ROOT, rel);
  assert.ok(fs.existsSync(p), `${rel} not found`);
  return fs.readFileSync(p, 'utf8');
}

// README version/architecture badge: shields.io "agents-<N>"
test(`README.md badge "agents-<N>" === ${PHYSICAL}`, () => {
  const md = readFile('README.md');
  const m = md.match(/badge\/agents-(\d+)-/);
  assert.ok(m, 'README.md must contain a shields.io "agents-<N>" badge');
  assert.equal(Number(m[1]), PHYSICAL, `README badge agents-${m[1]}; physical = ${PHYSICAL}`);
});

// README "<N> agent definition files" (architecture caption + body) — every
// occurrence must equal the physical total.
test(`README.md every "<N> agent definition files" === ${PHYSICAL}`, () => {
  const md = readFile('README.md');
  const matches = [...md.matchAll(/(\d+)\s+agent definition files/g)];
  assert.ok(matches.length >= 1, 'README.md must state "<N> agent definition files"');
  for (const m of matches) {
    assert.equal(Number(m[1]), PHYSICAL,
      `README.md "${m[1]} agent definition files"; physical = ${PHYSICAL}`);
  }
});

// CLAUDE.md Source-of-Truth Layer Map — the "Team roster" row "<N> agents reais".
// Line-scoped so the historical changelog rows ("38 -> 19 agents reais") are ignored.
test(`CLAUDE.md "Team roster" line "<N> agents reais" === ${PHYSICAL}`, () => {
  const md = readFile('CLAUDE.md');
  const line = md.split('\n').find((l) => /Team roster/.test(l) && /agents reais/.test(l));
  assert.ok(line, 'CLAUDE.md must have a "Team roster" line declaring "<N> agents reais"');
  const m = line.match(/(\d+)\s+agents reais/);
  assert.ok(m, 'CLAUDE.md "Team roster" line must state "<N> agents reais"');
  assert.equal(Number(m[1]), PHYSICAL,
    `CLAUDE.md Team roster "${m[1]} agents reais"; physical = ${PHYSICAL}`);
});

// commands/pipeline.md AGENT DISPATCH PROTOCOL — total-roster claims.
test(`commands/pipeline.md "All <N> agents in this plugin" === ${PHYSICAL}`, () => {
  const md = readFile('commands/pipeline.md');
  const m = md.match(/All (\d+) agents in this plugin/);
  assert.ok(m, 'commands/pipeline.md must state "All <N> agents in this plugin"');
  assert.equal(Number(m[1]), PHYSICAL,
    `commands/pipeline.md "All ${m[1]} agents in this plugin"; physical = ${PHYSICAL}`);
});

test(`commands/pipeline.md TOC "all <N> agents are via Agent tool" === ${PHYSICAL}`, () => {
  const md = readFile('commands/pipeline.md');
  const m = md.match(/all (\d+) agents are via Agent tool/);
  assert.ok(m, 'commands/pipeline.md TOC must state "all <N> agents are via Agent tool"');
  assert.equal(Number(m[1]), PHYSICAL,
    `commands/pipeline.md "all ${m[1]} agents are via Agent tool"; physical = ${PHYSICAL}`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
