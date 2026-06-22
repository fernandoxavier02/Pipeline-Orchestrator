#!/usr/bin/env node
'use strict';

// =============================================================================
// T16 (v8.10.0) — REQ-LEAF-INHERIT-PIN: 37 leaf agents pinned without the Agent
// tool. TDD RED phase. This is the TIGHTENED assertion that will land in
//   tests/contracts/agent-frontmatter-contract.test.cjs (L5.2)
// expressed here as a standalone regression so the RED is visible BEFORE the 37
// production frontmatter edits (L5.1). Covers user-APPROVED scenarios T16-S1..S4.
//
// CONTRACT (design L5.2 — AUTHORITATIVE over the loose S16-3 prose):
//   Every agent under agents/** is EITHER on the 3-controller AGENT_TOOL_ALLOWLIST
//   = { brainstorm-controller, pipeline-controller, spec-controller } (the EXISTING
//   shipped allowlist) OR declares an explicit `tools:` list WITHOUT `Agent`.
//   [Note: the plain-language scenario S16-3 names "task-orchestrator,
//    executor-controller, pipeline-controller" as the 3 controllers; the sealed
//    design.md L5.2 instead keeps the EXISTING 3-controller AGENT_TOOL_ALLOWLIST.
//    The sealed design is the SSOT, so this test encodes the design's allowlist —
//    flagged to the pipeline as a GATE_REQUEST (pre-tester-T16-allowlist). Under
//    the design, task-orchestrator + executor-controller get explicit tools
//    WITHOUT Agent at GREEN; they are NOT allowlisted.]
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// 37 non-controller agents currently declare NO `tools:` line and therefore INHERIT
// the main thread's tools (which can include Agent). So:
//   T16-S1 — FAILS: those 37 leaves have no explicit tools list (the inheritance
//            hole) → the tightened assertion reports them. This is the RED. The
//            mutation half (removing a tools line FAILS) is proven by the same
//            predicate over a synthetic mutant, which PASSES even at RED.
//   T16-S2 — the deny-bad mutation: adding Agent to a non-controller is CAUGHT.
//            Proven over a synthetic mutant; PASSES even at RED (it tests the
//            predicate, not the live set).
//   T16-S3 — allow-good: the 3 allowlisted controllers keep Agent and pass. This
//            PASSES today (they already declare Agent) and stays green.
//   T16-S4 — regression: name-uniqueness + EnterPlanMode/ExitPlanMode + Ask
//            UserQuestion allowlist assertions preserved — re-pinned here so the
//            tightening did not weaken them. PASSES today and must stay green.
// All reads are of real files (no missing module), so S1's failure is a real
// content assertion (leaves inherit), never an ImportError — a valid behavioral RED.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const AGENTS = path.join(ROOT, 'agents');

// The Agent-tool allowlist = the GENUINE orchestrators (every agent whose body
// instructs spawning sub-agents via the Agent tool, not migrated to DISPATCH_REQUEST).
//
// CORRECTED 2026-06-21 (run-002 ARCH-1): the original sealed design pinned ONLY the
// 3 N1 controllers, which WRONGLY stripped Agent from review-orchestrator,
// final-adversarial-orchestrator, and adversarial-review-coordinator — agents whose
// bodies still instruct DIRECT Agent-tool spawns ("Use the Agent tool to spawn ALL
// applicable reviewers" / "TWO parallel Agent tool calls"). The confirmed harness
// contract (HARNESS-FACTS-CONFIRMED.md) is explicit that a subagent listing Agent
// CAN spawn nested ones within the depth-5 limit; these three dispatch at depth ≤3.
// So the allowlist is the SET of genuine spawners, not a hard-coded "3 controllers".
// (SSOT cross-check: tests/contracts/agent-frontmatter-contract.test.cjs holds the
// same allowlist + the tool-sufficiency invariant that keeps body↔tools in lockstep.)
const AGENT_TOOL_ALLOWLIST = new Set([
  'brainstorm-controller',
  'pipeline-controller',
  'spec-controller',
  'review-orchestrator',
  'final-adversarial-orchestrator',
  'adversarial-review-coordinator',
]);

// Preserved verbatim from the shipped contract test (regression pin, T16-S4).
const ASK_USER_QUESTION_ALLOWLIST = new Set([
  'brainstorm-controller',
  'pipeline-controller',
  'spec-controller',
  'brainstorm-step-01-explore',
  'brainstorm-step-01b-alternatives',
  'brainstorm-step-01c-ideation',
]);

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
function frontLines(txt) {
  const lines = txt.split(/\r?\n/);
  if (lines[0].trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  return lines.slice(1, end);
}
function field(lines, key) {
  const re = new RegExp('^' + key + ':\\s*(.*)$');
  for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); }
  return null;
}
function toolList(lines) {
  const t = field(lines, 'tools');
  if (!t) return null; // no tools: field at all (inherits)
  return t.split(',').map((s) => s.trim()).filter(Boolean);
}

// THE TIGHTENED PREDICATE (L5.2). An agent VIOLATES the pin iff it is NOT
// allowlisted AND (has no explicit tools list OR its tools list includes Agent).
function violatesLeafInheritPin(agent) {
  const nm = field(agent.lines, 'name');
  if (AGENT_TOOL_ALLOWLIST.has(nm)) return false; // allowlisted controllers exempt
  const tools = toolList(agent.lines);
  if (!tools) return true;                 // inherits (no explicit list) → violation
  if (tools.includes('Agent')) return true; // non-controller declaring Agent → violation
  return false;
}

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== T16 v8.10.0 — leaf-inherit pin tightened (RED until the 37 leaves declare explicit tools without Agent) ===');

const agents = walk(AGENTS).map((f) => ({
  file: path.relative(ROOT, f),
  lines: frontLines(fs.readFileSync(f, 'utf8')),
}));

// ---- T16-S1 [main / enforced tightening] every non-controller has explicit tools without Agent
test('T16-S1 [main] every non-controller agent declares an explicit tools: list (no inheritance) without Agent', () => {
  const violators = [];
  for (const a of agents) {
    assert.ok(a.lines, `${a.file}: unparseable frontmatter`);
    if (violatesLeafInheritPin(a)) violators.push(`${a.file} (name="${field(a.lines, 'name')}")`);
  }
  assert.equal(violators.length, 0,
    `${violators.length} non-controller agent(s) still INHERIT tools (no explicit list) or declare Agent — ` +
    `the L5.2 tightening requires an explicit tools: without Agent on every non-allowlisted agent. The RED set:\n  - ` +
    violators.join('\n  - '));
});

// ---- T16-S1b [mutation] removing a leaf's tools line is caught ---------------
test('T16-S1b [mutation] removing the tools: line from a pinned leaf is detected (re-introduces inheritance)', () => {
  // A synthetic pinned leaf (explicit tools, no Agent) passes the pin...
  const pinned = { file: 'agents/quality/synthetic-leaf.md', lines: ['name: synthetic-leaf', 'tools: Read, Grep, Glob'] };
  assert.equal(violatesLeafInheritPin(pinned), false, 'a properly pinned leaf must pass the pin');
  // ...and removing its tools line (back to inheritance) flips it to a violation.
  const unpinned = { file: 'agents/quality/synthetic-leaf.md', lines: ['name: synthetic-leaf'] };
  assert.equal(violatesLeafInheritPin(unpinned), true,
    'the pin must CATCH a leaf whose tools: line was removed — otherwise the inheritance hole reopens silently');
});

// ---- T16-S2 [deny-bad / mutation] adding Agent to a non-controller is caught -
test('T16-S2 [mutation] adding Agent to a non-controller leaf is caught by the pin', () => {
  const mutant = {
    file: 'agents/executor/type-specific/fake-leaf.md',
    lines: ['name: fake-leaf', 'tools: Read, Write, Agent'],
  };
  assert.equal(violatesLeafInheritPin(mutant), true,
    'a non-controller declaring the Agent (spawn) tool must be CAUGHT — a DoD#9 spawn hole otherwise passes silently');
  // And an allowlisted controller declaring Agent is NOT a violation (allow-good).
  const ctrl = { file: 'agents/core/pipeline-controller.md', lines: ['name: pipeline-controller', 'tools: Read, Agent'] };
  assert.equal(violatesLeafInheritPin(ctrl), false, 'an allowlisted controller keeping Agent must NOT be flagged');
});

// ---- T16-S3 [allow-good] the 3 controllers keep Agent and pass --------------
test('T16-S3 [allow-good] the 3 allowlisted controllers still declare Agent and pass the pin without modification', () => {
  const wantAgent = ['brainstorm-controller', 'pipeline-controller', 'spec-controller'];
  for (const nm of wantAgent) {
    const a = agents.find((x) => field(x.lines, 'name') === nm);
    assert.ok(a, `controller ${nm} must exist under agents/`);
    const tools = toolList(a.lines);
    assert.ok(tools && tools.includes('Agent'),
      `${nm} must still declare the Agent tool (it legitimately spawns subagents)`);
    assert.equal(violatesLeafInheritPin(a), false, `${nm} must pass the pin (allowlisted)`);
  }
});

// ---- T16-S4 [regression] preserved assertions still hold --------------------
test('T16-S4 [regression] name-uniqueness + EnterPlanMode/ExitPlanMode + AskUserQuestion allowlist preserved', () => {
  // name-uniqueness (DoD#10).
  const seen = new Map();
  for (const a of agents) {
    const nm = field(a.lines, 'name');
    assert.ok(nm, `${a.file}: frontmatter missing name`);
    if (seen.has(nm)) assert.fail(`duplicate agent name "${nm}": ${seen.get(nm)} and ${a.file}`);
    seen.set(nm, a.file);
  }
  // No EnterPlanMode/ExitPlanMode in any tools list.
  for (const a of agents) {
    const tools = toolList(a.lines);
    if (tools) for (const t of tools) {
      assert.ok(t !== 'EnterPlanMode' && t !== 'ExitPlanMode',
        `${a.file} declares ${t} — subagents cannot use Plan Mode tools (preserved assertion)`);
    }
  }
  // AskUserQuestion confined to the preserved allowlist.
  for (const a of agents) {
    const tools = toolList(a.lines);
    if (tools && tools.includes('AskUserQuestion')) {
      const nm = field(a.lines, 'name');
      assert.ok(ASK_USER_QUESTION_ALLOWLIST.has(nm),
        `${a.file} (name="${nm}") declares AskUserQuestion outside the preserved allowlist`);
    }
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until the 37 leaves declare explicit tools without Agent):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
