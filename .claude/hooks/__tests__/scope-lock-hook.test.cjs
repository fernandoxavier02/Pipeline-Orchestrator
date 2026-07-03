#!/usr/bin/env node
'use strict';

/**
 * scope-lock-hook.test.cjs — unit tests for the PreToolUse:Write|Edit
 * scope-lock-hook (runtime enforcement of CHANGE_CONTRACT.forbidden_files /
 * allowed_files / allowed_new_files).
 *
 * Added 2026-05-19 per SEC-5 consensus finding from the v6.3.0 final
 * adversarial review.
 *
 * Behavior under test:
 *   - No active contract → permissive (backward compat)
 *   - bootstrap.active === true → permissive (matches design)
 *   - forbidden_files match → deny
 *   - allowlist configured + match → allow
 *   - allowlist configured + no match → deny
 *   - empty allowlist (both arrays empty) → permissive (legacy compat)
 *   - non-Write/Edit tool → permissive (out of scope)
 */

const assert = require('node:assert/strict');
const path = require('node:path');

const hook = require(path.join(__dirname, '..', 'scope-lock-hook.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== scope-lock-hook.test.cjs — runtime enforcement ===');

test('no contract → permissive (legacy / no-active-session)', () => {
  const result = hook.checkScope('Write', { file_path: 'src/foo.ts' }, null);
  assert.equal(result.allow, true);
});

test('bootstrap.active=true → permissive (intentional one-time exemption)', () => {
  const contract = {
    bootstrap: { active: true },
    forbidden_files: ['.env'],
    allowed_files: [],
    allowed_new_files: [],
  };
  const result = hook.checkScope('Write', { file_path: '.env' }, contract);
  assert.equal(result.allow, true);
  assert.ok(/bootstrap/i.test(result.reason || ''));
});

test('forbidden_files match → deny', () => {
  const contract = {
    forbidden_files: ['package.json', '.env'],
    allowed_files: ['src/foo.ts'],
    allowed_new_files: [],
  };
  const result = hook.checkScope('Write', { file_path: 'package.json' }, contract);
  assert.equal(result.allow, false);
  assert.ok(/SCOPE LOCK violation/.test(result.reason));
  assert.ok(/package\.json/.test(result.reason));
});

test('forbidden_files glob pattern .github/workflows/* matches CI files', () => {
  const contract = {
    forbidden_files: ['.github/workflows/*'],
    allowed_files: ['src/foo.ts'],
    allowed_new_files: [],
  };
  const result = hook.checkScope('Edit', { file_path: '.github/workflows/ci.yml' }, contract);
  assert.equal(result.allow, false);
});

test('forbidden takes precedence over allowed on overlap', () => {
  const contract = {
    forbidden_files: ['src/secret.ts'],
    allowed_files: ['src/secret.ts', 'src/other.ts'],
    allowed_new_files: [],
  };
  const result = hook.checkScope('Write', { file_path: 'src/secret.ts' }, contract);
  assert.equal(result.allow, false);
});

test('allowlist match → allow', () => {
  const contract = {
    forbidden_files: ['.env'],
    allowed_files: ['src/foo.ts'],
    allowed_new_files: [],
  };
  const result = hook.checkScope('Edit', { file_path: 'src/foo.ts' }, contract);
  assert.equal(result.allow, true);
});

test('allowlist configured + no match → deny', () => {
  const contract = {
    forbidden_files: [],
    allowed_files: ['src/foo.ts'],
    allowed_new_files: ['src/bar.ts'],
  };
  const result = hook.checkScope('Write', { file_path: 'src/baz.ts' }, contract);
  assert.equal(result.allow, false);
  assert.ok(/not in CHANGE_CONTRACT\.allowed_files/.test(result.reason));
});

test('empty allowlists → permissive (legacy compat)', () => {
  const contract = {
    forbidden_files: [],
    allowed_files: [],
    allowed_new_files: [],
  };
  const result = hook.checkScope('Write', { file_path: 'anything.ts' }, contract);
  assert.equal(result.allow, true);
});

test('matchesPattern: exact filename match', () => {
  assert.equal(hook.matchesPattern('package.json', 'package.json'), true);
  assert.equal(hook.matchesPattern('foo/package.json', 'package.json'), true);
  assert.equal(hook.matchesPattern('package.lock', 'package.json'), false);
});

test('matchesPattern: trailing /* matches one-level wildcard', () => {
  assert.equal(hook.matchesPattern('.github/workflows/ci.yml', '.github/workflows/*'), true);
  assert.equal(hook.matchesPattern('.github/workflows/sub/deep.yml', '.github/workflows/*'), false);
});

test('matchesPattern: case-insensitive on Windows-style mixed case', () => {
  assert.equal(hook.matchesPattern('Agents/Foo.md', 'agents/foo.md'), true);
  assert.equal(hook.matchesPattern('AGENTS/foo.MD', 'agents/foo.md'), true);
});

test('matchesPattern: backslashes normalised to forward slashes', () => {
  assert.equal(hook.matchesPattern('agents\\quality\\foo.md', 'agents/quality/foo.md'), true);
});

test('matchesPattern: /** matches deep paths (attempt-2 hardening)', () => {
  assert.equal(hook.matchesPattern('agents/quality/foo.md', 'agents/**'), true);
  assert.equal(hook.matchesPattern('agents/executor/sub/bar.md', 'agents/**'), true);
  assert.equal(hook.matchesPattern('agents', 'agents/**'), true);
});

test('matchesPattern: /** rejects sibling-prefix paths (QUAL-1 fix)', () => {
  // Without the trailing-slash assertion, `agents/**` would match `agents-extra/foo`.
  assert.equal(hook.matchesPattern('agents-extra/foo.md', 'agents/**'), false);
  assert.equal(hook.matchesPattern('agentsfoo', 'agents/**'), false);
});

test('matchesPattern: cross-OS slash split (SEC-B fix)', () => {
  // Pattern authored on Windows must work on Linux runner regardless of path.sep.
  assert.equal(hook.matchesPattern('agents/quality/foo.md', 'agents\\quality\\foo.md'), true);
});

test('matchesPattern: rejects oversize patterns (SEC-A ReDoS guard)', () => {
  // A pattern of >200 chars should be rejected outright (never reach regex compile).
  const longPattern = 'a*'.repeat(150); // 300+ chars with many stars
  assert.equal(hook.matchesPattern('something', longPattern), false);
});

test('matchesPattern: regex fallback does NOT cross directory boundary (RISK-3 fix)', () => {
  // `config/*.json` must match `config/a.json` but NOT `config/sub/a.json`.
  assert.equal(hook.matchesPattern('config/a.json', 'config/*.json'), true);
  assert.equal(hook.matchesPattern('config/sub/a.json', 'config/*.json'), false);
});

test('checkScope: no target_path resolvable → permissive (defensive)', () => {
  const contract = { forbidden_files: ['.env'], allowed_files: ['x.ts'], allowed_new_files: [] };
  const result = hook.checkScope('Write', {}, contract);
  assert.equal(result.allow, true);
});

test('source file has no fs.writeFileSync / fs.unlinkSync (IRON LAW)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const HOOK_PATH = path.join(__dirname, '..', 'scope-lock-hook.cjs');
  const source = fs.readFileSync(HOOK_PATH, 'utf8');
  assert.ok(!/fs\.writeFileSync\s*\(/.test(source),
    'scope-lock-hook.cjs must never call fs.writeFileSync');
  assert.ok(!/fs\.unlinkSync\s*\(/.test(source),
    'scope-lock-hook.cjs must never call fs.unlinkSync');
  assert.ok(!/fs\.rmSync\s*\(/.test(source),
    'scope-lock-hook.cjs must never call fs.rmSync');
});

test('main() smoke test — hook does not crash on a Write call with no contract', () => {
  // Attempt-3 regression guard. The hook must not throw ReferenceError or
  // any other exception when invoked as a child process — the harness fails
  // open on hook crash, which is the exact bypass we are guarding against.
  // This test would have caught the getPipelineDir/getPipelineDocPath rename
  // regression (attempt-2 introduced; attempt-3 detected via 3-way consensus).
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const HOOK_PATH = path.join(__dirname, '..', 'scope-lock-hook.cjs');

  const input = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: 'some/file.ts', content: 'x' },
  });

  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: '/nonexistent-test-dir' },
  });

  assert.equal(result.status, 0,
    `main() must exit 0, got status=${result.status}. stderr: ${result.stderr}`);
  assert.equal(result.stderr || '', '',
    `main() must not write to stderr (no ReferenceError, no thrown exceptions). stderr: ${result.stderr}`);

  let decision;
  try { decision = JSON.parse(result.stdout); }
  catch (e) { assert.fail(`main() stdout must be valid JSON, got: ${result.stdout}`); }
  // v8.20.0: canonical hookSpecificOutput envelope (F2 v8.20.0 pins the contract).
  assert.equal(decision.hookSpecificOutput && decision.hookSpecificOutput.permissionDecision, 'allow',
    'with no active contract (no sessions dir), main() must emit an allow in hookSpecificOutput');
});

test('main() smoke test — handles non-Write tool (passes through)', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const HOOK_PATH = path.join(__dirname, '..', 'scope-lock-hook.cjs');

  const input = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'x.ts' } });
  const result = spawnSync(process.execPath, [HOOK_PATH], { input, encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stderr || '', '');
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.hookSpecificOutput && decision.hookSpecificOutput.permissionDecision, 'allow');
});

test('main() smoke test — handles empty stdin gracefully', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const HOOK_PATH = path.join(__dirname, '..', 'scope-lock-hook.cjs');

  const result = spawnSync(process.execPath, [HOOK_PATH], { input: '', encoding: 'utf8' });

  assert.equal(result.status, 0);
  // Empty stdin → allow (defensive: don't block when input cannot be parsed)
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.hookSpecificOutput && decision.hookSpecificOutput.permissionDecision, 'allow');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
