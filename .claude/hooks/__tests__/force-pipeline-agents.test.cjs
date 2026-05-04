#!/usr/bin/env node
'use strict';

/**
 * force-pipeline-agents.test.cjs — covers v4.8.0 gates_at enforcement on UserPromptSubmit.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'force-pipeline-agents.cjs');

let passed = 0;
let failed = 0;
const failures = [];

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; }
  failed++;
  failures.push(`FAIL: ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

function assertContains(haystack, needle, label) {
  if (typeof haystack === 'string' && haystack.includes(needle)) { passed++; return; }
  failed++;
  failures.push(`FAIL: ${label}\n    expected to contain: ${needle}\n    got: ${JSON.stringify(haystack)}`);
}

function assertNotContains(haystack, needle, label) {
  if (typeof haystack !== 'string' || !haystack.includes(needle)) { passed++; return; }
  failed++;
  failures.push(`FAIL: ${label}\n    expected NOT to contain: ${needle}\n    got: ${JSON.stringify(haystack)}`);
}

function makeStateWithGate(state, skillFixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'force-test-'));
  state.pipeline_doc_path = dir;
  fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(state));
  const fakeRepoRoot = path.join(dir, 'fake-repo');
  if (skillFixture && state.current_skill) {
    const skillDir = path.join(fakeRepoRoot, 'skills', state.current_skill);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, 'fixtures', 'skills', skillFixture, 'SKILL.md'),
      path.join(skillDir, 'SKILL.md')
    );
  }
  return { dir, fakeRepoRoot };
}

function runHook(promptText, env = {}) {
  return spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify({ prompt: promptText }),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

// 1. No skill state → no enforcement
function testNoSkillNoEnforcement() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'force-test-'));
  fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify({ schema_version: 1, pipeline_active: true }));
  const r = runHook('oi', { PIPELINE_DOC_PATH: dir });
  assertEqual(r.status, 0, '[1] no skill: exit 0');
  assertNotContains(r.stderr, '[ENFORCEMENT', '[1] no skill: no enforcement stderr');
}

// 2. Step not in gates_at → no warn
function testGateNotInListNoWarn() {
  const { dir, fakeRepoRoot } = makeStateWithGate(
    { schema_version: 1, pipeline_active: true, current_skill: 'feature-light-good', current_step: 2 },
    'feature-light-good'
  );
  const r = runHook('continue', {
    PIPELINE_DOC_PATH: dir, PIPELINE_REPO_ROOT: fakeRepoRoot, PIPELINE_ENFORCEMENT: 'warn'
  });
  assertEqual(r.status, 0, '[2] step not at gate: exit 0');
  assertNotContains(r.stderr, '[ENFORCEMENT', '[2] step not at gate: no warn');
}

// 3. Step in gates_at + no log evidence → WARN
function testGateAtStepNoEvidenceWarns() {
  const { dir, fakeRepoRoot } = makeStateWithGate(
    { schema_version: 1, pipeline_active: true, current_skill: 'feature-light-good', current_step: 3 },
    'feature-light-good'
  );
  const r = runHook('continue', {
    PIPELINE_DOC_PATH: dir, PIPELINE_REPO_ROOT: fakeRepoRoot, PIPELINE_ENFORCEMENT: 'warn'
  });
  assertEqual(r.status, 0, '[3] gate without evidence warn: exit 0');
  assertContains(r.stderr, '[ENFORCEMENT_WARN]', '[3] stderr has ENFORCEMENT_WARN');
  const logPath = path.join(dir, 'gate-decisions.jsonl');
  assertEqual(fs.existsSync(logPath), true, '[3] gate-decisions.jsonl created');
  if (fs.existsSync(logPath)) {
    assertContains(fs.readFileSync(logPath, 'utf8'), 'ENFORCEMENT_WARN', '[3] log has ENFORCEMENT_WARN');
  }
}

// 4. Step in gates_at + log has gate evidence → no warn
function testGateAtStepWithEvidence() {
  const { dir, fakeRepoRoot } = makeStateWithGate(
    { schema_version: 1, pipeline_active: true, current_skill: 'feature-light-good', current_step: 3 },
    'feature-light-good'
  );
  // Pre-populate log with evidence
  fs.writeFileSync(path.join(dir, 'gate-decisions.jsonl'),
    JSON.stringify({ gate: 'ASKUSER', step: 3, decision: 'APPROVED' }) + '\n');
  const r = runHook('continue', {
    PIPELINE_DOC_PATH: dir, PIPELINE_REPO_ROOT: fakeRepoRoot, PIPELINE_ENFORCEMENT: 'warn'
  });
  assertEqual(r.status, 0, '[4] gate with evidence: exit 0');
  assertNotContains(r.stderr, '[ENFORCEMENT_WARN]', '[4] no warn when evidence present');
}

// 5. Step in gates_at + DENY mode + no evidence → systemMessage flagged
function testGateAtStepDeny() {
  const { dir, fakeRepoRoot } = makeStateWithGate(
    { schema_version: 1, pipeline_active: true, current_skill: 'feature-light-good', current_step: 3 },
    'feature-light-good'
  );
  const r = runHook('oi', {
    PIPELINE_DOC_PATH: dir, PIPELINE_REPO_ROOT: fakeRepoRoot, PIPELINE_ENFORCEMENT: 'deny'
  });
  assertEqual(r.status, 0, '[5] deny mode: exit 0');
  assertContains(r.stderr, '[ENFORCEMENT_DENY]', '[5] stderr has ENFORCEMENT_DENY');
  // systemMessage with [ENFORCEMENT_DENY] should appear in stdout JSON
  assertContains(r.stdout, '[ENFORCEMENT_DENY]', '[5] stdout systemMessage has DENY tag');
}

testNoSkillNoEnforcement();
testGateNotInListNoWarn();
testGateAtStepNoEvidenceWarns();
testGateAtStepWithEvidence();
testGateAtStepDeny();

console.log(`force-pipeline-agents.test.cjs — Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
