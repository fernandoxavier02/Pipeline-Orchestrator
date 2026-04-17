#!/usr/bin/env node
'use strict';

/**
 * sentinel-hook.test.cjs — regression tests for sentinel-hook.cjs contract.
 *
 * Usage:
 *   node sentinel-hook.test.cjs
 *   PIPELINE_DOC_PATH=/tmp/stub node sentinel-hook.test.cjs
 *
 * Exit 0 when all tests pass, exit 1 with diagnostics when any test fails.
 * No external deps — runs with vanilla Node.
 *
 * Codifies the public contract of the hook so that refactors cannot silently
 * regress the behavior that PIPELINE_CONTROLLER depends on.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'sentinel-hook.cjs');

// ── Canonical Subagent Type Paths ───────────────────────────────────────────
//
// The hook routes agents whose subagent_type starts with "pipeline-orchestrator:".
// These constants exist so tests update ONE place when the agent tree is reorganized.
// They encode full 4-segment paths (not just the routing prefix), so a prefix change
// is still a broad refactor — the constants reduce scatter, not coupling depth.
const AGENTS = Object.freeze({
  TASK_ORCHESTRATOR: 'pipeline-orchestrator:core:task-orchestrator',
  SENTINEL: 'pipeline-orchestrator:core:sentinel',
  SECURITY_SCANNER: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner',
  ARCHITECTURE_CRITIC: 'pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic',
  QUALITY_REVIEWER: 'pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer',
  EXTERNAL_CODE_REVIEWER: 'code-review:code-reviewer'  // explicitly NOT pipeline-orchestrator
});

// ── Test Harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    passed++;
    return;
  }
  failed++;
  failures.push(`FAIL: ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

function assertContains(haystack, needle, label) {
  if (typeof haystack === 'string' && haystack.includes(needle)) {
    passed++;
    return;
  }
  failed++;
  failures.push(`FAIL: ${label}\n    expected to contain: ${JSON.stringify(needle)}\n    actual:              ${JSON.stringify(haystack)}`);
}

function runHook(stdinPayload, env = {}, opts = {}) {
  // opts.cwd: directory to use as child's working dir (replaces the previous
  // pattern of `process.chdir(tempDir)`, which was a global side effect that
  // leaked across tests). When set, auto-discovery starts from opts.cwd.
  const spawnOpts = {
    input: typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload),
    encoding: 'utf8',
    env: { ...process.env, ...env, PIPELINE_DOC_PATH: env.PIPELINE_DOC_PATH ?? '' }
  };
  if (opts.cwd) spawnOpts.cwd = opts.cwd;
  const result = spawnSync('node', [HOOK_PATH], spawnOpts);
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-hook-test-'));
  return dir;
}

function writeState(dir, stateObj) {
  fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(stateObj, null, 2));
}

// ── Tests ───────────────────────────────────────────────────────────────────

// 1. Empty stdin → allow (silent pass)
{
  const r = runHook('');
  assertEqual(r.exitCode, 0, '[1] empty stdin returns exit 0');
  assertEqual(r.stdout.trim(), '', '[1] empty stdin emits no stdout');
}

// 2. Unparseable stdin → allow (fail-open)
{
  const r = runHook('not-json-at-all');
  assertEqual(r.exitCode, 0, '[2] unparseable stdin returns exit 0');
  assertEqual(r.stdout.trim(), '', '[2] unparseable stdin emits no stdout');
}

// 3. Non-Agent tool → allow (hook only cares about Agent)
//    Actually the hook does not inspect tool_name — it inspects tool_input.subagent_type.
//    If subagent_type is absent, the hook should allow.
{
  const r = runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  assertEqual(r.exitCode, 0, '[3] non-Agent tool returns exit 0');
  assertEqual(r.stdout.trim(), '', '[3] non-Agent tool emits no stdout');
}

// 4. Non-pipeline-orchestrator agent → allow (scope boundary)
{
  const r = runHook({
    tool_name: 'Agent',
    tool_input: { subagent_type: AGENTS.EXTERNAL_CODE_REVIEWER }
  });
  assertEqual(r.exitCode, 0, '[4] external agent returns exit 0');
  assertEqual(r.stdout.trim(), '', '[4] external agent emits no stdout');
}

// 5. Sentinel itself → allow (anti-loop)
{
  const r = runHook({
    tool_name: 'Agent',
    tool_input: { subagent_type: AGENTS.SENTINEL }
  });
  assertEqual(r.exitCode, 0, '[5] sentinel self-spawn returns exit 0');
  assertEqual(r.stdout.trim(), '', '[5] sentinel self-spawn emits no stdout');
}

// 6. Bootstrap whitelist: task-orchestrator allowed even without state file
{
  const isolated = tempDir();
  const r = runHook(
    { tool_name: 'Agent', tool_input: { subagent_type: AGENTS.TASK_ORCHESTRATOR } },
    { PIPELINE_DOC_PATH: '' },
    { cwd: isolated }  // isolates auto-discovery without mutating parent cwd
  );
  assertEqual(r.exitCode, 0, '[6] task-orchestrator bootstrap returns exit 0');
  assertEqual(r.stdout.trim(), '', '[6] task-orchestrator bootstrap emits no stdout');
}

// 7. Non-bootstrap pipeline-orchestrator agent without state → deny
{
  const isolated = tempDir();
  const r = runHook(
    { tool_name: 'Agent', tool_input: { subagent_type: AGENTS.SECURITY_SCANNER } },
    { PIPELINE_DOC_PATH: '' },
    { cwd: isolated }
  );
  assertEqual(r.exitCode, 0, '[7] missing state file exits 0 (deny via stdout, not hard block)');
  assertContains(r.stdout, '"permissionDecision":"deny"', '[7] missing state file returns deny decision');
  assertContains(r.stdout, 'No sentinel-state.json found', '[7] deny reason cites missing state file');
}

// 8. State file present + expected_next matches → allow
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: 1,
    pipeline_active: true,
    expected_next: 'adversarial-security-scanner',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[8] expected_next match returns exit 0');
  assertEqual(r.stdout.trim(), '', '[8] expected_next match emits no stdout (silent allow)');
}

// 9. State file present + expected_next mismatch → deny (divergence)
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: 1,
    pipeline_active: true,
    expected_next: 'task-orchestrator',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[9] divergence exits 0 (deny via stdout)');
  assertContains(r.stdout, 'SENTINEL DIVERGENCE DETECTED', '[9] divergence emits SENTINEL DIVERGENCE');
  assertContains(r.stdout, '"permissionDecision":"deny"', '[9] divergence returns deny decision');
}

// 10. State file present + pipeline_active false → silent allow
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: 1,
    pipeline_active: false,
    expected_next: 'task-orchestrator',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[10] pipeline_active=false returns exit 0');
  assertEqual(r.stdout.trim(), '', '[10] pipeline_active=false emits no stdout (silent allow)');
}

// 11. Circuit breaker: 3+ consecutive corrections → exit 2 hard block
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: 1,
    pipeline_active: true,
    expected_next: 'adversarial-security-scanner',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 3
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 2, '[11] circuit breaker returns exit 2 (hard block)');
  assertContains(r.stderr, 'SENTINEL CIRCUIT_BREAKER', '[11] circuit breaker emits stderr marker');
}

// 12. Unsupported schema_version → allow (backwards compat) but WARN on stderr
//     v3.4.0 hardening (SEC-3): silent allow on unknown schema_version was a safety-
//     defeating default. The hook now emits a stderr warning so operators can detect
//     version mismatches or state-file corruption without breaking existing pipelines.
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: 99,
    pipeline_active: true,
    expected_next: 'adversarial-security-scanner',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[12] unknown schema_version still returns exit 0 (backwards compat)');
  assertEqual(r.stdout.trim(), '', '[12] unknown schema_version emits no stdout (decision is silent allow)');
  assertContains(r.stderr, 'SENTINEL WARN', '[12] unknown schema_version emits SENTINEL WARN to stderr');
  assertContains(r.stderr, 'schema_version=99', '[12] stderr warning cites actual offending version');
}

// 12b. schema_version as JSON string "1" — must be normalized to 1, no WARN
//      SEC-B3-01 fix (v3.4.0): string/number mismatch was a bypass path — the
//      pre-v3.4 strict-equality check `=== 1` silently allowed string versions.
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: "1",  // string, not number
    pipeline_active: true,
    expected_next: 'adversarial-security-scanner',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[12b] string schema_version "1" returns exit 0');
  assertEqual(r.stderr, '', '[12b] string schema_version "1" emits NO stderr WARN (normalized to 1)');
}

// 12c. schema_version as JSON string "99" — unknown, still emits WARN after normalization
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: "99",
    pipeline_active: true,
    expected_next: 'adversarial-security-scanner',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[12c] string schema_version "99" returns exit 0');
  assertContains(r.stderr, 'SENTINEL WARN', '[12c] string schema_version "99" still emits WARN');
  assertContains(r.stderr, '"99"', '[12c] WARN cites original string value in quotes');
}

// 13. Stale state (> 300s old) but expected_next matches → allow with stale warning
{
  const docPath = tempDir();
  const oldTimestamp = new Date(Date.now() - 400_000).toISOString(); // 400s ago
  writeState(docPath, {
    schema_version: 1,
    pipeline_active: true,
    expected_next: 'adversarial-security-scanner',
    last_updated: oldTimestamp,
    consecutive_corrections: 0
  });
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[13] stale state with match exits 0');
  assertContains(r.stdout, 'SENTINEL WARNING', '[13] stale state emits warning in stdout');
  assertContains(r.stdout, '"permissionDecision":"allow"', '[13] stale state still allows');
}

// 14. New agent adversarial-quality-reviewer is distinguished from its siblings
//     v3.3.0 regression guard: when expected_next is the quality reviewer, the two
//     sibling scanners (security-scanner, architecture-critic) must be DENIED, and
//     the quality reviewer itself must be ALLOWED. If any test here flips to "allow
//     all three", the hook has regressed into match-all routing.
{
  const docPath = tempDir();
  writeState(docPath, {
    schema_version: 1,
    pipeline_active: true,
    expected_next: 'adversarial-quality-reviewer',
    last_updated: new Date().toISOString(),
    consecutive_corrections: 0
  });

  // 14a: quality-reviewer itself matches → silent allow
  const rQuality = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.QUALITY_REVIEWER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(rQuality.exitCode, 0, '[14a] adversarial-quality-reviewer match returns exit 0');
  assertEqual(rQuality.stdout.trim(), '', '[14a] adversarial-quality-reviewer match emits no stdout');

  // 14b: sibling security-scanner does NOT match → deny with divergence
  const rSec = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.SECURITY_SCANNER }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(rSec.exitCode, 0, '[14b] sibling security-scanner returns exit 0 (deny via stdout)');
  assertContains(rSec.stdout, '"permissionDecision":"deny"', '[14b] sibling security-scanner is DENIED when expected is quality-reviewer');
  assertContains(rSec.stdout, 'SENTINEL DIVERGENCE', '[14b] deny reason cites divergence');

  // 14c: sibling architecture-critic does NOT match → deny with divergence
  const rArch = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: AGENTS.ARCHITECTURE_CRITIC }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(rArch.exitCode, 0, '[14c] sibling architecture-critic returns exit 0 (deny via stdout)');
  assertContains(rArch.stdout, '"permissionDecision":"deny"', '[14c] sibling architecture-critic is DENIED when expected is quality-reviewer');
}

// 15. Near-miss stdin inputs (SEC-1, v3.4.0 threat-model hardening).
//     These payloads are structurally plausible but lack a pipeline-orchestrator
//     subagent_type. They must all result in silent exit 0 — the hook should NOT
//     crash, and should NOT misinterpret them as pipeline spawns.
//     If any assertion flips in a future refactor, investigate before merging.
{
  // 15a: empty object
  const r1 = runHook({});
  assertEqual(r1.exitCode, 0, '[15a] empty-object stdin returns exit 0');
  assertEqual(r1.stdout.trim(), '', '[15a] empty-object stdin emits no stdout');

  // 15b: tool_name present but null
  const r2 = runHook({ tool_name: null });
  assertEqual(r2.exitCode, 0, '[15b] tool_name=null returns exit 0');
  assertEqual(r2.stdout.trim(), '', '[15b] tool_name=null emits no stdout');

  // 15c: Agent tool with empty tool_input
  const r3 = runHook({ tool_name: 'Agent', tool_input: {} });
  assertEqual(r3.exitCode, 0, '[15c] Agent with empty tool_input returns exit 0');
  assertEqual(r3.stdout.trim(), '', '[15c] Agent with empty tool_input emits no stdout');

  // 15d: Agent with non-string subagent_type (type confusion)
  const r4 = runHook({ tool_name: 'Agent', tool_input: { subagent_type: 123 } });
  assertEqual(r4.exitCode, 0, '[15d] numeric subagent_type returns exit 0 (no crash)');
  assertEqual(r4.stdout.trim(), '', '[15d] numeric subagent_type emits no stdout (silent allow)');

  // 15e: Agent with subagent_type as array (type confusion)
  const r5 = runHook({ tool_name: 'Agent', tool_input: { subagent_type: ['pipeline-orchestrator:core:task-orchestrator'] } });
  assertEqual(r5.exitCode, 0, '[15e] array subagent_type returns exit 0 (no crash)');
  assertEqual(r5.stdout.trim(), '', '[15e] array subagent_type emits no stdout (silent allow)');

  // 15f: Agent with subagent_type as string "1" (string that could be coerced) — still treated as unknown
  const r6 = runHook({ tool_name: 'Agent', tool_input: { subagent_type: AGENTS.TASK_ORCHESTRATOR } });
  // This is actually a valid bootstrap spawn without state file — should be allowed
  assertEqual(r6.exitCode, 0, '[15f] real pipeline-orchestrator agent still works after type-guard refactor');
}

// ── Report ──────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\nsentinel-hook.test.cjs — ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
process.exit(0);
