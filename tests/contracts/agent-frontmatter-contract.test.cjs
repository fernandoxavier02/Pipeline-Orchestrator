#!/usr/bin/env node
'use strict';

// =============================================================================
// agent-frontmatter-contract.test.cjs — enforcement-audit Batch FRONTMATTER
// (DoD #9 "leaf agents cannot spawn descendants", #10 "parent-child validated",
//  #11 "subagents do not depend on AskUserQuestion / Plan Mode", spec Phase 2).
//
// The audit (2026-06-21) confirmed the agent CAPABILITY contract is currently
// healthy: names are unique (name — not filename — is the agent_type the hooks
// see), the Agent (spawn) tool is granted to exactly the 3 N1 orchestrators, and
// no plugin agent declares the harness-IGNORED frontmatter keys permissionMode /
// hooks / mcpServers. This test LOCKS that contract so it cannot silently drift —
// e.g. a new leaf agent accidentally granted the Agent tool (a DoD#9 spawn hole),
// or a reviewer/implementer agent acquiring AskUserQuestion (a DoD#11 violation:
// a subagent cannot reliably drive a human gate; gates belong to the main agent,
// and the answer is recorded by .claude/hooks/human-gate-record.cjs).
//
// These are ALLOWLISTS, not removals: changing them must be a deliberate, reviewed
// act (same governance posture as the version-sync / gate-count lockstep tests).
//
// RESIDUAL (documented, NOT enforced here — see the audit report): 37 agents omit
// the `tools:` field entirely and therefore inherit the main thread's tools,
// which can include Agent. Closing that DoD#9 hole fully needs either an explicit
// per-agent tools list (large prose churn) or a code-level parent-child gate in
// dispatch-guard fed by a controller-stamped allowed_children surface that does
// not exist yet. Tracked as a residual recommendation, not a silent debt.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../..');
const AGENTS = path.join(ROOT, 'agents');

// The ONLY agents allowed to declare the Agent (spawn-descendant) tool: the three
// N1 orchestrators that legitimately dispatch N2 subagents.
const AGENT_TOOL_ALLOWLIST = new Set([
  'brainstorm-controller',
  'pipeline-controller',
  'spec-controller',
]);

// The ONLY agents allowed to declare AskUserQuestion in frontmatter: the 3
// orchestrators (which drive the human gates) + the 3 brainstorm clarification
// steps. (Whether a subagent can actually invoke AskUserQuestion in the live
// runtime is a prove-on-runtime item; this test prevents the set from GROWING,
// it does not assert the existing 6 work — see the audit report's residuals.)
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

// Robust frontmatter: lines between the first `---` line and the next `---` line.
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

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== agent frontmatter capability contract (DoD #9/#10/#11) ===');

const files = walk(AGENTS);
const agents = files.map((f) => {
  const fl = frontLines(fs.readFileSync(f, 'utf8'));
  return { file: path.relative(ROOT, f), lines: fl };
});

test('every agent has parseable frontmatter with a name', () => {
  for (const a of agents) {
    assert.ok(a.lines, `${a.file}: missing/*unparseable frontmatter`);
    assert.ok(field(a.lines, 'name'), `${a.file}: frontmatter missing name:`);
  }
});

test('DoD#10 — every frontmatter name is unique (name = agent_type the hooks see)', () => {
  const seen = new Map();
  for (const a of agents) {
    const nm = field(a.lines, 'name');
    if (seen.has(nm)) assert.fail(`duplicate agent name "${nm}": ${seen.get(nm)} and ${a.file}`);
    seen.set(nm, a.file);
  }
});

test('DoD#9 — only the 3 orchestrators declare the Agent (spawn) tool', () => {
  for (const a of agents) {
    const tools = toolList(a.lines);
    if (tools && tools.includes('Agent')) {
      const nm = field(a.lines, 'name');
      assert.ok(
        AGENT_TOOL_ALLOWLIST.has(nm),
        `${a.file} (name="${nm}") declares the Agent tool but is not an allowlisted orchestrator. ` +
        `A leaf agent must not be granted spawn capability. Allowlist: ${[...AGENT_TOOL_ALLOWLIST].join(', ')}`
      );
    }
  }
});

test('DoD#11 — AskUserQuestion in frontmatter is confined to the known allowlist', () => {
  for (const a of agents) {
    const tools = toolList(a.lines);
    if (tools && tools.includes('AskUserQuestion')) {
      const nm = field(a.lines, 'name');
      assert.ok(
        ASK_USER_QUESTION_ALLOWLIST.has(nm),
        `${a.file} (name="${nm}") declares AskUserQuestion. A subagent must not own a human gate; ` +
        `route the question through the main agent. Allowlist: ${[...ASK_USER_QUESTION_ALLOWLIST].join(', ')}`
      );
    }
  }
});

test('Phase 2 — no plugin agent declares harness-IGNORED keys (permissionMode/hooks/mcpServers)', () => {
  for (const a of agents) {
    for (const key of ['permissionMode', 'hooks', 'mcpServers']) {
      const present = a.lines.some((l) => new RegExp('^' + key + ':').test(l));
      assert.ok(
        !present,
        `${a.file} declares "${key}" in frontmatter — Claude Code ignores it for plugin agents (false config).`
      );
    }
  }
});

test('Phase 2 — no agent declares EnterPlanMode/ExitPlanMode in frontmatter tools', () => {
  for (const a of agents) {
    const tools = toolList(a.lines);
    if (tools) {
      for (const t of tools) {
        assert.ok(
          t !== 'EnterPlanMode' && t !== 'ExitPlanMode',
          `${a.file} declares ${t} — subagents cannot use Plan Mode tools.`
        );
      }
    }
  }
});

// =============================================================================
// ADDED 2026-06-21 (T3 / REQ-LEAF-GRANT-LOCK, scenarios S3-5 + S3-6).
//
// The four lock tests above assert the contract against the CURRENT agent set.
// tasks.md T3 also requires a MUTATION-VERIFY pair: prove the lock actually
// CATCHES a violation, not just that the current set happens to be clean (a
// permanently-true assertion that never fires is worthless). These two tests
// reuse the exact predicate the live tests use (AGENT_TOOL_ALLOWLIST membership;
// EnterPlanMode/ExitPlanMode exclusion) against a synthetic, in-memory agent
// whose frontmatter violates it, and assert the predicate REJECTS it. No file is
// written under agents/ — the mutation is a fabricated `{ file, lines }` record,
// so the suite stays hermetic and leaves no residue.
// =============================================================================

// Re-derive the two predicates exactly as the live tests apply them, so a future
// edit to the lock logic is mirror-checked here (drift between the live assertion
// and the mutation-verify would itself be a finding).
function violatesAgentToolLock(agent) {
  const tools = toolList(agent.lines);
  if (!tools || !tools.includes('Agent')) return false;
  return !AGENT_TOOL_ALLOWLIST.has(field(agent.lines, 'name'));
}
function violatesPlanModeLock(agent) {
  const tools = toolList(agent.lines);
  if (!tools) return false;
  return tools.includes('EnterPlanMode') || tools.includes('ExitPlanMode');
}

test('S3-5 [mutation-verify] a leaf granted the Agent tool but NOT allowlisted is caught', () => {
  // Sanity: every REAL agent passes the lock (no live violation right now).
  for (const a of agents) {
    assert.equal(violatesAgentToolLock(a), false,
      `${a.file} unexpectedly violates the Agent-tool lock (real-set should be clean)`);
  }
  // Mutation: a synthetic leaf that grants Agent without being an orchestrator.
  const mutant = {
    file: 'agents/executor/type-specific/fake-leaf.md',
    lines: ['name: fake-leaf', 'description: synthetic mutant', 'tools: Read, Write, Agent'],
  };
  assert.equal(violatesAgentToolLock(mutant), true,
    'the lock FAILED to catch a leaf agent granted the Agent (spawn) tool — DoD#9 hole would pass silently');
});

test('S3-6 [mutation-verify] an agent declaring EnterPlanMode is caught', () => {
  // Sanity: no real agent declares a Plan Mode tool today.
  for (const a of agents) {
    assert.equal(violatesPlanModeLock(a), false,
      `${a.file} unexpectedly declares a Plan Mode tool (real-set should be clean)`);
  }
  // Mutation: a synthetic agent that declares EnterPlanMode in its tools list.
  const mutant = {
    file: 'agents/core/fake-controller.md',
    lines: ['name: fake-controller', 'tools: Read, Grep, EnterPlanMode'],
  };
  assert.equal(violatesPlanModeLock(mutant), true,
    'the lock FAILED to catch an agent declaring EnterPlanMode — GAP-06 declaration hole would pass silently');
  // And the ExitPlanMode twin is caught too.
  const mutant2 = {
    file: 'agents/core/fake-controller-2.md',
    lines: ['name: fake-controller-2', 'tools: Read, ExitPlanMode'],
  };
  assert.equal(violatesPlanModeLock(mutant2), true,
    'the lock FAILED to catch an agent declaring ExitPlanMode');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
