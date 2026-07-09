#!/usr/bin/env node
'use strict';

// =============================================================================
// F6 (v8.23.0) — dispatch-guard.cjs: subagent-fallback clause (Batch 3)
// =============================================================================
// SOURCE: docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md §4 P1 / CR6.
// buildDenyReason (the "X is an Agent, not a skill" deny) told the reader to
// replace their Skill() call with Agent(subagent_type: ...) — but this hook is
// registered on matcher "Skill|Agent" (hooks.json), and a dispatched subagent
// (no Agent tool, Achado #7) CAN still call Skill(). This file covers ONLY
// that one deny site. CORRECTED (round-2 adversarial review, HIGH finding):
// an earlier version of this comment claimed EVERY other deny in the file
// fires exclusively on tool_name === 'Agent' — true for ENFORCEMENT/PLAN_MODE
// (handleAgentEnforcement/handlePlanModeDispatch, called only from the Agent
// branch of handleInput), but FALSE for BRAINSTORM/SPEC_CONTRACT
// (handleBrainstormDispatch/handleSealedSpecImplementation, called from BOTH
// the Agent AND the Skill branch) — a subagent reaches those two via Skill()
// same as it reaches buildDenyReason. Their fallback-clause coverage is
// tested separately in F6b_dispatch_guard_skill_path_fallback.test.cjs.
//
// dispatch-guard.cjs has no module.exports (unconditional stdin read at
// require time) — exercised via the real CLI subprocess, matching this
// repo's established "at least one spawnSync scenario" convention.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK_PATH = path.join(ROOT, '.claude/hooks/dispatch-guard.cjs');

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

function run(payload, env) {
  const res = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: '', ...env },
  });
  return res;
}

console.log('=== F6 v8.23.0 — dispatch-guard.cjs subagent-fallback clause ===');

record('S1 [Skill collides with agent leaf] deny includes the subagent-fallback clause', () => {
  const res = run({ tool_name: 'Skill', tool_input: { skill: 'plan-architect' } });
  const out = JSON.parse(res.stdout);
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /DISPATCH GUARD/);
  assert.match(reason, /subagente sem a ferramenta Agent/i, `must offer a subagent-reachable exit: ${reason}`);
  assert.match(reason, /DISPATCH_REQUEST/);
  assert.match(reason, /Agent\(\s*$|Agent\(/m, 'original ACTION REQUIRED instruction must still be there');
});

record('S2 [namespaced skill, no collision] not denied at all — nothing to check', () => {
  const res = run({ tool_name: 'Skill', tool_input: { skill: 'skill-advisor:advisor' } });
  assert.equal(res.stdout.trim(), '', 'a legitimate namespaced skill must not be denied');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
