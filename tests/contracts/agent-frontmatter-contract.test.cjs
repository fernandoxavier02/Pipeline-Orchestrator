#!/usr/bin/env node
'use strict';

// =============================================================================
// agent-frontmatter-contract.test.cjs — enforcement-audit Batch FRONTMATTER
// (DoD #9 "leaf agents cannot spawn descendants", #10 "parent-child validated",
//  #11 "subagents do not depend on AskUserQuestion / Plan Mode", spec Phase 2).
//
// The audit (2026-06-21) confirmed the agent CAPABILITY contract is currently
// healthy: names are unique (name — not filename — is the agent_type the hooks
// see), the Agent (spawn) tool is granted ONLY to the genuine orchestrators (the
// agents whose BODY instructs spawning sub-agents via the Agent tool), and
// no plugin agent declares the harness-IGNORED frontmatter keys permissionMode /
// hooks / mcpServers. This test LOCKS that contract so it cannot silently drift —
// e.g. a new leaf agent accidentally granted the Agent tool (a DoD#9 spawn hole),
// or a reviewer/implementer agent acquiring AskUserQuestion (a DoD#11 violation:
// a subagent cannot reliably drive a human gate; gates belong to the main agent,
// and the answer is recorded by .claude/hooks/human-gate-record.cjs).
//
// FIXED 2026-06-21 (run-002 ARCH-1, v8.10.0): T16's leaf-spawn lock over-reached —
// it stripped the Agent tool from review-orchestrator + final-adversarial-orchestrator
// (and the same latent break sat in adversarial-review-coordinator) while their
// BODIES still instruct direct Agent-tool spawns ("Use the Agent tool to spawn ALL
// applicable reviewers" / "TWO parallel Agent tool calls"). The confirmed harness
// contract (HARNESS-FACTS-CONFIRMED.md, official sub-agents docs) is explicit: "a
// subagent listing Agent may spawn nested ones" (depth is fixed; the Agent tool is
// only withdrawn at depth 5, and the Agent(type,...) allowlist parens are ignored
// in a subagent). These three are dispatched at depth ≤3, well inside the limit, so
// declaring Agent restores their documented spawn behavior. They are added to the
// allowlist below. The TOOL-SUFFICIENCY invariant test (added at the bottom) now
// asserts the inverse coupling too: no agent's body instructs the Agent tool while
// omitting it from tools:, and no agent declares Agent without a spawning body.
//
// These are ALLOWLISTS, not removals: changing them must be a deliberate, reviewed
// act (same governance posture as the version-sync / gate-count lockstep tests).
//
// CLOSED 2026-06-21 (T16 / REQ-LEAF-INHERIT-PIN, v8.10.0): the former residual —
// 37 agents omitting the `tools:` field and inheriting the main thread's tools
// (which can include Agent) — is now ENFORCED. Every non-controller agent declares
// an explicit `tools:` list WITHOUT Agent; the 3 N1 orchestrators on the allowlist
// keep Agent. The tightened assertion lives below ("every non-controller declares
// explicit tools without Agent"). The DoD#9 inheritance hole no longer exists.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../..');
const AGENTS = path.join(ROOT, 'agents');

// The ONLY agents allowed to declare the Agent (spawn-descendant) tool: the GENUINE
// orchestrators — every agent whose BODY instructs spawning sub-agents via the Agent
// tool (verified by the AGENT_SPAWN_BODY_RE scan in the tool-sufficiency test below).
// This is NOT a hard-coded "3 N1 controllers" set: it is the closed list of agents
// that actually spawn AND have NOT been migrated to the Achado #7 DISPATCH_REQUEST
// substitution (executor-controller spawns too, but emits DISPATCH_REQUEST blocks
// instead of calling Agent, so it stays OFF this list — see the tool-sufficiency
// exemptions). Every name here MUST have a spawning body; every spawning body that
// is not DISPATCH_REQUEST-migrated MUST be here. The two invariants are cross-checked
// by the TOOL-SUFFICIENCY test at the bottom.
const AGENT_TOOL_ALLOWLIST = new Set([
  // N1 controllers (parent context — call Agent directly).
  'brainstorm-controller',
  'pipeline-controller',
  'spec-controller',
  // N2/N3 review orchestrators whose body instructs DIRECT Agent-tool spawns and
  // were wrongly stripped by T16 (run-002 ARCH-1). Dispatched at depth ≤3 — inside
  // the harness depth-5 limit, so Agent works for them per HARNESS-FACTS-CONFIRMED.
  'review-orchestrator',
  'final-adversarial-orchestrator',
  'adversarial-review-coordinator',
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

// Return the text AFTER the frontmatter block (the agent's instruction body).
// Falls back to the whole file when there is no parseable frontmatter.
function bodyText(txt) {
  const lines = txt.split(/\r?\n/);
  if (lines[0].trim() !== '---') return txt;
  const end = lines.indexOf('---', 1);
  if (end < 0) return txt;
  return lines.slice(end + 1).join('\n');
}

const files = walk(AGENTS);
const agents = files.map((f) => {
  const raw = fs.readFileSync(f, 'utf8');
  const fl = frontLines(raw);
  return { file: path.relative(ROOT, f), lines: fl, body: bodyText(raw) };
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

test('DoD#9 — only allowlisted genuine orchestrators declare the Agent (spawn) tool', () => {
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

test('T16 / REQ-LEAF-INHERIT-PIN — every non-controller declares explicit tools without Agent (no inheritance)', () => {
  const violators = [];
  for (const a of agents) {
    const nm = field(a.lines, 'name');
    if (AGENT_TOOL_ALLOWLIST.has(nm)) continue; // the 3 orchestrators keep Agent + may inherit nothing
    const tools = toolList(a.lines);
    if (!tools) { violators.push(`${a.file} (name="${nm}") inherits — no explicit tools:`); continue; }
    if (tools.includes('Agent')) { violators.push(`${a.file} (name="${nm}") declares Agent`); continue; }
  }
  assert.equal(violators.length, 0,
    `${violators.length} non-controller agent(s) still inherit tools or declare Agent (DoD#9 hole reopened):\n  - ` +
    violators.join('\n  - '));
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
// TOOL-SUFFICIENCY (run-002 ARCH-1, scenario "no agent instructs a tool it lacks").
//
// ARCH-1's root cause: an agent BODY instructing "Use the Agent tool to spawn …"
// while its frontmatter `tools:` omits Agent — a latent runtime break (the harness
// withdraws the tool the body assumes). This invariant closes that class for the
// Agent tool in BOTH directions:
//   (a) every agent whose body instructs a DIRECT Agent-tool spawn (and has NOT
//       migrated to the Achado #7 DISPATCH_REQUEST substitution) MUST declare Agent;
//   (b) every agent that declares Agent MUST have a spawning body (no dead grant).
// The two directions are exactly the AGENT_TOOL_ALLOWLIST membership rule, so the
// allowlist stays HONEST: a name on it without a spawning body, or a spawning body
// off it, both fail here.
// =============================================================================

// A body "instructs a direct Agent-tool spawn" when it tells the agent to use the
// Agent tool / spawn a named sub-agent / make parallel Agent tool calls. Matched
// literally against the instruction prose (case-insensitive).
const AGENT_SPAWN_BODY_RE =
  /\bAgent\s*\(\s*\{?\s*subagent_type|\bAgent\s+tool\b|\bUse\s+the\s+Agent\s+tool\b|\bparallel\s+Agent\s+tool\s+calls\b|\bconcurrent\s+Agent\s+tool\s+calls\b/i;

// A body has "migrated to DISPATCH_REQUEST" when it actually emits a DISPATCH_REQUEST
// block (the Achado #7 substitution) AND is not also one of the N1 controllers that
// call Agent directly. We detect the substitution by the literal block fence. An
// agent that ONLY emits DISPATCH_REQUEST (no direct Agent call) does NOT need Agent
// in tools — it asks the parent to dispatch. The N1 controllers carry BOTH (they
// emit DISPATCH_REQUEST for some phases AND call Agent directly for others) and are
// pinned ON the allowlist explicitly, so they are exempt from the "migrated" demotion.
const N1_CONTROLLERS = new Set(['brainstorm-controller', 'pipeline-controller', 'spec-controller']);
const DISPATCH_BLOCK_RE = /===\s*DISPATCH_REQUEST\s+v1\s*===/;

function bodyInstructsAgentSpawn(agent) {
  return !!(agent.body && AGENT_SPAWN_BODY_RE.test(agent.body));
}
// "needs the Agent tool" = body instructs a direct Agent spawn AND has not migrated
// to the DISPATCH_REQUEST substitution (N1 controllers always "need" it).
function bodyNeedsAgentTool(agent) {
  if (!bodyInstructsAgentSpawn(agent)) return false;
  const nm = field(agent.lines, 'name');
  if (N1_CONTROLLERS.has(nm)) return true;
  // Non-controller: if it emits DISPATCH_REQUEST it has migrated → does NOT need Agent.
  return !DISPATCH_BLOCK_RE.test(agent.body);
}

test('ARCH-1 tool-sufficiency — every agent that needs the Agent tool declares it (no "instructs Agent but lacks Agent")', () => {
  const violators = [];
  for (const a of agents) {
    if (!bodyNeedsAgentTool(a)) continue;
    const tools = toolList(a.lines);
    const hasAgent = !!(tools && tools.includes('Agent'));
    if (!hasAgent) {
      const nm = field(a.lines, 'name');
      violators.push(`${a.file} (name="${nm}") — body instructs a direct Agent-tool spawn but tools: omits Agent`);
    }
  }
  assert.equal(violators.length, 0,
    `${violators.length} agent(s) instruct the Agent tool without declaring it (ARCH-1 class — latent runtime break):\n  - ` +
    violators.join('\n  - '));
});

test('ARCH-1 tool-sufficiency — the Agent allowlist is exactly the set of genuine spawners (no dead grant, no off-list spawner)', () => {
  // Direction (b): every NON-CONTROLLER allowlisted agent must actually have a
  // spawning body — an Agent grant with no spawn instruction is a dead capability
  // (a DoD#9 smell). The N1 controllers are EXEMPT from this direction: they hold
  // Agent as the structural parent-context capability and may emit DISPATCH_REQUEST
  // in their bodies (the executor-controller pattern) rather than naming the Agent
  // tool — their grant is by role, not by body. Direction (a) below remains the
  // load-bearing ARCH-1 invariant and applies to EVERY agent.
  for (const a of agents) {
    const nm = field(a.lines, 'name');
    if (!AGENT_TOOL_ALLOWLIST.has(nm)) continue;
    if (N1_CONTROLLERS.has(nm)) continue; // structural grant — not body-derived
    assert.ok(bodyInstructsAgentSpawn(a),
      `${a.file} (name="${nm}") is on AGENT_TOOL_ALLOWLIST but its body never instructs an Agent-tool spawn — remove the dead grant.`);
  }
  // Direction (a, allowlist form): every non-migrated spawner must be allowlisted.
  for (const a of agents) {
    if (!bodyNeedsAgentTool(a)) continue;
    const nm = field(a.lines, 'name');
    assert.ok(AGENT_TOOL_ALLOWLIST.has(nm),
      `${a.file} (name="${nm}") needs the Agent tool (spawning body, not DISPATCH_REQUEST-migrated) but is missing from AGENT_TOOL_ALLOWLIST.`);
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

// =============================================================================
// ADDED 2026-06-21 (run-002 ARCH-1) — MUTATION-VERIFY for the TOOL-SUFFICIENCY
// invariant. Same posture as S3-5/S3-6: prove the predicate actually FIRES on a
// violation, and (crucially) prove it does NOT over-fire on a legitimately
// DISPATCH_REQUEST-migrated body (the exact false-positive that would re-introduce
// ARCH-1 from the other side — forcing Agent onto an agent that doesn't call it).
// =============================================================================

test('S-ARCH1-A [mutation-verify] an orchestrator body that omits Agent from tools is caught', () => {
  // Sanity: no real agent currently needs Agent yet lacks it (post-fix the set is clean).
  for (const a of agents) {
    if (!bodyNeedsAgentTool(a)) continue;
    const tools = toolList(a.lines);
    assert.ok(tools && tools.includes('Agent'),
      `${a.file} unexpectedly needs Agent but lacks it (real-set should be clean post-fix)`);
  }
  // Mutation: a synthetic agent whose body says "Use the Agent tool to spawn …" but
  // whose tools: omits Agent and whose body has NO DISPATCH_REQUEST substitution.
  const mutant = {
    file: 'agents/quality/fake-orchestrator.md',
    lines: ['name: fake-orchestrator', 'tools: Read, Grep, Glob, Write'],
    body: 'Step 2: Use the Agent tool to spawn ALL applicable reviewers in parallel.',
  };
  assert.equal(bodyNeedsAgentTool(mutant), true,
    'the predicate FAILED to flag a spawning body — it must report "needs Agent"');
  const mtools = toolList(mutant.lines);
  assert.ok(!(mtools && mtools.includes('Agent')),
    'mutant fixture is mis-built: it should OMIT Agent so the lack is the thing under test');
});

test('S-ARCH1-B [mutation-verify] a DISPATCH_REQUEST-migrated body is EXEMPT (does not falsely require Agent)', () => {
  // A non-controller body that references the Agent tool BUT emits a DISPATCH_REQUEST
  // block has migrated (Achado #7) and must NOT be forced to declare Agent — this is
  // the executor-controller pattern. Over-firing here would re-break the contract.
  const migrated = {
    file: 'agents/executor/fake-migrated.md',
    lines: ['name: fake-migrated', 'tools: Read, Grep, Glob, Write, Bash'],
    body:
      'Replace every Agent(subagent_type: ...) call site with a DISPATCH_REQUEST.\n' +
      '=== DISPATCH_REQUEST v1 ===\n' +
      'dispatch_id: x\n' +
      '=== END DISPATCH_REQUEST ===',
  };
  assert.equal(bodyInstructsAgentSpawn(migrated), true,
    'fixture must mention the Agent tool so the migration exemption is actually exercised');
  assert.equal(bodyNeedsAgentTool(migrated), false,
    'a DISPATCH_REQUEST-migrated non-controller body must NOT be reported as needing Agent (would re-introduce ARCH-1 inverted)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
