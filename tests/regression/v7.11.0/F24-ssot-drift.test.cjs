#!/usr/bin/env node
// =============================================================================
// F24 — SSOT drift guards (v7.11.0, AUDIT-008 / AUDIT-012 / AUDIT-013 / AUDIT-015a / AUDIT-018)
// =============================================================================
// Pins the B1 remediation of the 2026-06-11 enforcement audit:
//   S1  inline gate list in commands/pipeline.md == registry row count in gates.md
//   S2  inline gate list in agents/core/pipeline-controller.md == same count
//   S3  the two inline lists agree with each other name-by-name
//   S4  no stale "22-gate"/"22 total" claims remain in the two controller docs
//   S5  Feature routing row uses feature-light/feature-heavy (complexity-matrix)
//   S6  references/pipelines/feature-light.md + feature-heavy.md exist (canonical)
//   S7  audit-heavy/light.md no longer claim controller Skill-dispatch (inline note)
//   S8  F20 MANDATORY_AGENTS covers all 10 controller-table agents
//   S9  Visible Progress Protocol present in pipeline.md AND pipeline-controller.md
// =============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, reason: e.message }); }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function inlineGateNames(content, file) {
  const line = content.split(/\r?\n/).find((l) => l.includes('Gate names that must exist'));
  assert.ok(line, `"Gate names that must exist" line not found in ${file}`);
  const names = (line.match(/`([A-Z][A-Z0-9_]+)`/g) || []).map((s) => s.slice(1, -1));
  return [...new Set(names)];
}
function registryGateNames(content) {
  // registry rows: "| GATE_NAME | **HARDNESS** | ..." across the 4 registry tables
  const names = new Set();
  for (const l of content.split(/\r?\n/)) {
    const m = l.match(/^\|\s*([A-Z][A-Z0-9_]+)\s*\|/);
    if (m) names.add(m[1]);
  }
  return [...names];
}

const pipelineMd = read('commands/pipeline.md');
const controllerMd = read('agents/core/pipeline-controller.md');
const gatesMd = read('references/gates.md');

const regNames = registryGateNames(gatesMd);
const pipeNames = inlineGateNames(pipelineMd, 'commands/pipeline.md');
const ctrlNames = inlineGateNames(controllerMd, 'agents/core/pipeline-controller.md');

test('F24-S1: pipeline.md inline gate list matches gates.md registry count', () => {
  assert.equal(pipeNames.length, regNames.length,
    `pipeline.md inline=${pipeNames.length} vs registry=${regNames.length}`);
});

test('F24-S2: pipeline-controller.md inline gate list matches gates.md registry count', () => {
  assert.equal(ctrlNames.length, regNames.length,
    `controller inline=${ctrlNames.length} vs registry=${regNames.length}`);
});

test('F24-S3: the two inline lists agree name-by-name with the registry', () => {
  const reg = new Set(regNames);
  for (const n of pipeNames) assert.ok(reg.has(n), `pipeline.md lists ${n} not in registry`);
  for (const n of ctrlNames) assert.ok(reg.has(n), `controller lists ${n} not in registry`);
  for (const n of regNames) {
    assert.ok(pipeNames.includes(n), `registry gate ${n} missing from pipeline.md inline list`);
    assert.ok(ctrlNames.includes(n), `registry gate ${n} missing from controller inline list`);
  }
});

test('F24-S4: no stale "22-gate"/"22 total"/"22 inline" claims remain', () => {
  for (const [file, content] of [['commands/pipeline.md', pipelineMd], ['agents/core/pipeline-controller.md', controllerMd]]) {
    assert.ok(!/22-gate|22 total|22 inline/.test(content), `stale 22-gate claim still present in ${file}`);
  }
});

test('F24-S5: Feature routing row uses feature-light/feature-heavy', () => {
  const matrix = read('references/complexity-matrix.md');
  assert.ok(/\*\*Feature\*\*\s*\|\s*DIRETO\s*\|\s*feature-light\s*\|\s*feature-heavy/.test(matrix),
    'complexity-matrix Feature row must route to feature-light | feature-heavy');
  assert.ok(!/\|\s*implement-light\s*\|\s*implement-heavy\s*\|/.test(matrix),
    'stale implement-* routing row still present in complexity-matrix');
});

test('F24-S6: canonical feature-*.md pipeline references exist', () => {
  for (const lvl of ['light', 'heavy']) {
    const p = path.join(ROOT, 'references', 'pipelines', `feature-${lvl}.md`);
    assert.ok(fs.existsSync(p), `references/pipelines/feature-${lvl}.md missing`);
    const t = fs.readFileSync(p, 'utf8');
    assert.ok(!/^> \*\*DEPRECATED/m.test(t), `feature-${lvl}.md must not carry a DEPRECATED banner`);
  }
});

test('F24-S7: audit pipeline refs state INLINE routing (no controller Skill-dispatch claim)', () => {
  for (const lvl of ['heavy', 'light']) {
    const t = read(`references/pipelines/audit-${lvl}.md`);
    assert.ok(/Phase 2 runs INLINE/i.test(t), `audit-${lvl}.md missing inline-routing note`);
    assert.ok(!/it dispatches the skill via `Skill\(pipeline-orchestrator:audit-/.test(t),
      `audit-${lvl}.md still claims controller Skill dispatch`);
  }
});

test('F24-S8: machine-readable roster covers all 10 PLAN_MODE_MANDATORY agents (AUDIT-002)', () => {
  // AUDIT-002 (v7.11.0): the roster moved to a JSON SSOT that F20 + the
  // dispatch-guard hook both read. Verify the SSOT itself, not F20's prose.
  const roster = JSON.parse(read('references/plan-mode-mandatory-agents.json'));
  const leaves = roster.agents.map((a) => a.leaf);
  const expected = ['plan-architect', 'bugfix-diagnostic-agent', 'bugfix-root-cause-analyzer',
    'audit-intake', 'audit-domain-analyzer', 'design-interrogator', 'feature-vertical-slice-planner',
    'step-01-explore', 'executor-implementer-task', 'feature-implementer'];
  for (const e of expected) assert.ok(leaves.includes(e), `roster missing mandatory agent ${e}`);
  assert.equal(leaves.length, 10, `roster must list exactly 10 agents, found ${leaves.length}`);
  // F20 must read from the JSON (not a hardcoded array) so it stays in lockstep.
  const f20 = read('tests/regression/v7.10.0/F20-plan-mode-mandatory-agents.test.cjs');
  assert.ok(/plan-mode-mandatory-agents\.json/.test(f20), 'F20 must load the roster from the JSON SSOT');
});

test('F24-S9: Visible Progress Protocol (AUDIT-018) pinned in both controller docs', () => {
  for (const [file, content] of [['commands/pipeline.md', pipelineMd], ['agents/core/pipeline-controller.md', controllerMd]]) {
    assert.ok(/Visible Progress Protocol \(MANDATORY/.test(content), `${file} missing Visible Progress Protocol section`);
    assert.ok(/TaskCreate/.test(content) && /TaskUpdate/.test(content), `${file} must name TaskCreate/TaskUpdate`);
  }
});

// ── summary ──────────────────────────────────────────────────────────────────
const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok).length;
console.log('=== F24 SSOT drift guards (v7.11.0 B1) ===');
for (const r of results) console.log(`  ${r.ok ? '[PASS]' : '[FAIL]'} ${r.name}${r.ok ? '' : ': ' + r.reason}`);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${results.length} total`);
process.exit(fail > 0 ? 1 : 0);
