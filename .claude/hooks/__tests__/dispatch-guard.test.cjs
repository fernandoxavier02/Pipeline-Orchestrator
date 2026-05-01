#!/usr/bin/env node
'use strict';

/**
 * dispatch-guard.test.cjs — BDD scenarios for the PreToolUse:Skill guard.
 *
 * v3.6.0: LLM controllers running `/pipeline` occasionally invoke Skill(task-orchestrator)
 * instead of Agent(subagent_type: "pipeline-orchestrator:core:task-orchestrator").
 * The guard intercepts Skill invocations whose name matches a known pipeline-orchestrator
 * agent leaf, denies the call, and returns a corrective message naming the right tool
 * and subagent_type.
 *
 * Behavior-Driven Development format: each scenario reads as prose.
 * Usage:
 *   node dispatch-guard.test.cjs
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'dispatch-guard.cjs');

// ── BDD harness ─────────────────────────────────────────────────────────────

let scenariosRun = 0;
let scenariosPassed = 0;
const failures = [];
let currentScenario = null;
let currentStep = null;

function scenario(title, fn) {
  currentScenario = title;
  scenariosRun++;
  try {
    fn();
    scenariosPassed++;
  } catch (err) {
    failures.push({ scenario: title, step: currentStep, error: err.message });
  } finally {
    currentScenario = null;
    currentStep = null;
  }
}

function given(description, fn) { currentStep = `Given ${description}`; return fn(); }
function when(description, fn) { currentStep = `When ${description}`; return fn(); }
function then(description, fn) { currentStep = `Then ${description}`; return fn(); }
function and(description, fn) { currentStep = `And ${description}`; return fn(); }

function expectEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'expected equality'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function expectContains(haystack, needle, msg) {
  if (typeof haystack !== 'string' || !haystack.includes(needle)) {
    throw new Error(`${msg || 'expected to contain'}: needle ${JSON.stringify(needle)}, haystack ${JSON.stringify(haystack)}`);
  }
}

function runHook(toolInput) {
  const payload = { tool_name: 'Skill', tool_input: toolInput };
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: 'utf8'
  });
  return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

// ── Scenarios ───────────────────────────────────────────────────────────────

// Feature: The dispatch-guard hook must deflect Skill invocations of pipeline-orchestrator
// agents, preserving zero-context invariants and preventing silent no-op runs.

scenario('A Skill call named after the task-orchestrator agent is deflected with corrective guidance', () => {
  given('the hook is wired as PreToolUse:Skill', () => {});
  const result = when('the LLM controller invokes Skill(skill: "task-orchestrator")', () =>
    runHook({ skill: 'task-orchestrator', args: '' })
  );
  then('the hook MUST deny the Skill call', () =>
    expectContains(result.stdout, '"permissionDecision":"deny"')
  );
  and('the deny reason MUST name the correct Agent tool', () =>
    expectContains(result.stdout, 'Agent')
  );
  and('the deny reason MUST include the fully-qualified subagent_type', () =>
    expectContains(result.stdout, 'pipeline-orchestrator:core:task-orchestrator')
  );
  and('the exit code MUST be 0 (non-blocking hook, deny via stdout)', () =>
    expectEqual(result.exitCode, 0)
  );
});

scenario('All four leaf-name classes of pipeline-orchestrator agents are recognized', () => {
  given('the 37 agents live under four folders', () => {});
  const cases = [
    { leaf: 'information-gate', fqn: 'pipeline-orchestrator:core:information-gate' },
    { leaf: 'executor-controller', fqn: 'pipeline-orchestrator:executor:executor-controller' },
    { leaf: 'adversarial-security-scanner', fqn: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' },
    { leaf: 'final-adversarial-orchestrator', fqn: 'pipeline-orchestrator:quality:final-adversarial-orchestrator' }
  ];
  for (const c of cases) {
    when(`the LLM invokes Skill("${c.leaf}")`, () => {
      const r = runHook({ skill: c.leaf });
      then(`the hook denies it and suggests ${c.fqn}`, () => {
        expectContains(r.stdout, '"permissionDecision":"deny"');
        expectContains(r.stdout, c.fqn);
      });
    });
  }
});

scenario('Legitimate third-party skill invocations pass silently', () => {
  given('a skill named "user-custom-skill" that is NOT a pipeline-orchestrator agent', () => {});
  const result = when('the controller invokes Skill(skill: "user-custom-skill")', () =>
    runHook({ skill: 'user-custom-skill' })
  );
  then('the hook MUST allow the call with no stdout', () => {
    expectEqual(result.exitCode, 0);
    expectEqual(result.stdout.trim(), '');
  });
});

scenario('Legitimate plugin-namespaced skills pass silently', () => {
  given('a colon-qualified skill name such as "skill-advisor:advisor"', () => {});
  const result = when('the controller invokes it', () =>
    runHook({ skill: 'skill-advisor:advisor' })
  );
  then('the guard MUST NOT interfere', () => {
    expectEqual(result.exitCode, 0);
    expectEqual(result.stdout.trim(), '');
  });
});

scenario('Empty or malformed tool_input does not crash the guard', () => {
  given('the tool_input payload is missing "skill"', () => {});
  const r1 = when('the hook runs on {}', () => runHook({}));
  then('it exits 0 without stdout', () => {
    expectEqual(r1.exitCode, 0);
    expectEqual(r1.stdout.trim(), '');
  });

  given('the skill value is a number (type-confusion)', () => {});
  const r2 = when('the hook runs with numeric skill', () => runHook({ skill: 123 }));
  then('it exits 0 without stdout', () => {
    expectEqual(r2.exitCode, 0);
    expectEqual(r2.stdout.trim(), '');
  });
});

scenario('Non-Skill tools are ignored entirely', () => {
  given('an Agent tool invocation payload', () => {});
  const result = when('the hook is asked to evaluate it', () => {
    const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' } };
    const r = spawnSync('node', [HOOK_PATH], { input: JSON.stringify(payload), encoding: 'utf8' });
    return { exitCode: r.status, stdout: r.stdout || '' };
  });
  then('the hook ignores non-Skill tool calls', () => {
    expectEqual(result.exitCode, 0);
    expectEqual(result.stdout.trim(), '');
  });
});

scenario('The corrective message is actionable by a novice LLM', () => {
  given('the guard denies a Skill(task-orchestrator) call', () => {});
  const result = when('the reason is parsed', () =>
    runHook({ skill: 'task-orchestrator' })
  );
  then('the message explains what happened and what to do', () => {
    expectContains(result.stdout, 'not a skill');
    expectContains(result.stdout, 'subagent_type');
  });
  and('the message does NOT contain generic boilerplate that would confuse the reader', () => {
    // Negative assertion: should be specific, not wave-at-docs
    const stdout = result.stdout.toLowerCase();
    if (stdout.includes('see documentation') && !stdout.includes('agent')) {
      throw new Error('corrective message handwaves at docs without naming Agent');
    }
  });
});

scenario('AGENT_LEAF_TO_FQN table matches the agents/ filesystem (integrity check)', () => {
  given('the 37 agent spec files under agents/', () => {});
  const agentsDir = path.join(__dirname, '..', '..', '..', 'agents');
  const fsWalk = (dir, out) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) fsWalk(full, out);
      else if (name.endsWith('.md')) out.push(name.replace(/\.md$/, ''));
    }
    return out;
  };
  const actualLeaves = fsWalk(agentsDir, []).sort();

  when('dispatch-guard.cjs is loaded and its table is enumerated', () => {});
  // Load the hook module to extract the table — the hook does not export it, so we parse it.
  const hookSrc = fs.readFileSync(path.join(__dirname, '..', 'dispatch-guard.cjs'), 'utf8');
  const tableKeys = [];
  const re = /'([a-z][a-z0-9-]*)'\s*:\s*'pipeline-orchestrator:/g;
  let m;
  while ((m = re.exec(hookSrc)) !== null) tableKeys.push(m[1]);
  tableKeys.sort();

  then('every .md leaf name must have a table entry', () => {
    for (const leaf of actualLeaves) {
      if (!tableKeys.includes(leaf)) {
        throw new Error(`agents/${leaf}.md exists but is missing from AGENT_LEAF_TO_FQN — dispatch-guard would not deflect Skill("${leaf}")`);
      }
    }
  });
  and('every table entry must correspond to an actual .md file', () => {
    for (const key of tableKeys) {
      if (!actualLeaves.includes(key)) {
        throw new Error(`AGENT_LEAF_TO_FQN has "${key}" but agents/${key}.md does not exist — stale table entry`);
      }
    }
  });
  and('the counts must match exactly', () => {
    expectEqual(tableKeys.length, actualLeaves.length, 'table size vs filesystem');
  });
});

scenario('Oversized skill names are dropped silently (DoS prevention)', () => {
  given('a pathologically long skill name (length > 128)', () => {});
  const longName = 'a'.repeat(5000);
  const result = when('the controller invokes Skill with that name', () =>
    runHook({ skill: longName })
  );
  then('the hook exits silently without echoing the payload', () => {
    expectEqual(result.exitCode, 0);
    expectEqual(result.stdout.trim(), '');
  });
});

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\ndispatch-guard.test.cjs — ${scenariosPassed}/${scenariosRun} scenarios passed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  FAIL: ${f.scenario}`);
    console.log(`    at: ${f.step}`);
    console.log(`    reason: ${f.error}`);
  }
  process.exit(1);
}
process.exit(0);
