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

function runHook(stdinPayload, env = {}) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: typeof stdinPayload === 'string' ? stdinPayload : JSON.stringify(stdinPayload),
    encoding: 'utf8',
    env: { ...process.env, ...env, PIPELINE_DOC_PATH: env.PIPELINE_DOC_PATH ?? '' }
  });
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
    tool_input: { subagent_type: 'code-review:code-reviewer' }
  });
  assertEqual(r.exitCode, 0, '[4] external agent returns exit 0');
  assertEqual(r.stdout.trim(), '', '[4] external agent emits no stdout');
}

// 5. Sentinel itself → allow (anti-loop)
{
  const r = runHook({
    tool_name: 'Agent',
    tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel' }
  });
  assertEqual(r.exitCode, 0, '[5] sentinel self-spawn returns exit 0');
  assertEqual(r.stdout.trim(), '', '[5] sentinel self-spawn emits no stdout');
}

// 6. Bootstrap whitelist: task-orchestrator allowed even without state file
{
  const isolated = tempDir();
  process.chdir(isolated);
  const r = runHook(
    { tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:task-orchestrator' } },
    { PIPELINE_DOC_PATH: '' }
  );
  assertEqual(r.exitCode, 0, '[6] task-orchestrator bootstrap returns exit 0');
  assertEqual(r.stdout.trim(), '', '[6] task-orchestrator bootstrap emits no stdout');
}

// 7. Non-bootstrap pipeline-orchestrator agent without state → deny
{
  const isolated = tempDir();
  process.chdir(isolated);
  const r = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
    },
    { PIPELINE_DOC_PATH: '' }
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 2, '[11] circuit breaker returns exit 2 (hard block)');
  assertContains(r.stderr, 'SENTINEL CIRCUIT_BREAKER', '[11] circuit breaker emits stderr marker');
}

// 12. Unsupported schema_version → silent allow (don't interfere)
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(r.exitCode, 0, '[12] unknown schema_version returns exit 0');
  assertEqual(r.stdout.trim(), '', '[12] unknown schema_version emits no stdout');
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer' }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(rQuality.exitCode, 0, '[14a] adversarial-quality-reviewer match returns exit 0');
  assertEqual(rQuality.stdout.trim(), '', '[14a] adversarial-quality-reviewer match emits no stdout');

  // 14b: sibling security-scanner does NOT match → deny with divergence
  const rSec = runHook(
    {
      tool_name: 'Agent',
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner' }
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
      tool_input: { subagent_type: 'pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic' }
    },
    { PIPELINE_DOC_PATH: docPath }
  );
  assertEqual(rArch.exitCode, 0, '[14c] sibling architecture-critic returns exit 0 (deny via stdout)');
  assertContains(rArch.stdout, '"permissionDecision":"deny"', '[14c] sibling architecture-critic is DENIED when expected is quality-reviewer');
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
