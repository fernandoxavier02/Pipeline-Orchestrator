#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.20.0) — scope-lock-hook must emit the CANONICAL PreToolUse envelope.
// =============================================================================
// BUG (hook audit 2026-07-02, D2): scope-lock-hook is the ONLY deny-capable
// PreToolUse hook that writes a FLAT top-level { permissionDecision, reason }
// object to stdout. Every sibling (edit-guard-hook.cjs:765, batch-review-gate,
// sentinel-hook, …) emits hookSpecificOutput.{ hookEventName: 'PreToolUse',
// permissionDecision, permissionDecisionReason }. The flat shape is not part of
// the current Claude Code hook contract, so either the deny is silently IGNORED
// (a refactor write lands outside its contract) or it binds without the reason
// ever reaching the model ("blocked without knowing why").
//
// FIX CONTRACT: every emit path (deny AND allow) uses the canonical envelope.
//
// EXPECTED RED: S1/S2 fail (flat shape today). GREEN after the migration.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f2-scope-lock-envelope-stable-secret-0123456789';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');
const HOOK = path.resolve(__dirname, '../../../.claude/hooks/scope-lock-hook.cjs');

// Seed a refactor run WITHOUT REFACTOR_SCOPE_LOCK logged → a production write is
// denied (B3, v8.8.0) — the deny emit path under test. Mirrors v8.8.0/F5 seeding.
function seedRefactorRun(root) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'r', pipeline_active: true, task_type: 'Refactor',
    pipeline_variant: 'refactor-light', pipeline_doc_path: docDir,
  });
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: new Date().toISOString() }, null, 2));
  fs.writeFileSync(path.join(docDir, 'gate-decisions.jsonl'), '');
  const sessionsDir = path.join(root, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const now = Date.now();
  fs.writeFileSync(path.join(sessionsDir, 'sess.lock'), JSON.stringify({
    session_id: 'sess', status: 'active',
    created_at: now, expires_at: now + 60 * 60 * 1000, last_seen_at: now,
    pipeline_variant: 'refactor-light',
  }));
  return docDir;
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) },
  });
}
function out(r) { try { return JSON.parse(r.stdout || '{}'); } catch { return {}; } }

let pass = 0, fail = 0; const failed = [];
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-envelope-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } } }
}

console.log('=== F2 v8.20.0 — scope-lock-hook canonical hookSpecificOutput envelope ===');

liveTest('F2-S1 [NEW] a scope deny is emitted inside hookSpecificOutput (binding + model-visible)', (root) => {
  const docDir = seedRefactorRun(root);
  const r = run({
    tool_name: 'Write',
    tool_input: { file_path: path.join(root, 'src', 'x.js'), content: 'x' },
    cwd: root,
  }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const o = out(r);
  const hso = o.hookSpecificOutput;
  assert.ok(hso && typeof hso === 'object',
    'the deny must live in hookSpecificOutput (RED today: flat top-level shape the harness ignores)');
  assert.equal(hso.hookEventName, 'PreToolUse');
  assert.equal(hso.permissionDecision, 'deny');
  assert.ok(typeof hso.permissionDecisionReason === 'string' && hso.permissionDecisionReason.length > 0,
    'the reason must ride in permissionDecisionReason so it reaches the model');
  assert.equal(o.permissionDecision, undefined, 'no legacy flat permissionDecision key remains');
});

liveTest('F2-S2 [NEW] an allow emit carries no legacy flat permissionDecision key', (root) => {
  const docDir = seedRefactorRun(root);
  // .pipeline/ writes are always exempt → allow path.
  const r = run({
    tool_name: 'Write',
    tool_input: { file_path: path.join(root, '.pipeline', 'docs', 'run', 'notes.md'), content: 'x' },
    cwd: root,
  }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const o = out(r);
  assert.equal(o.permissionDecision, undefined,
    'allow paths must not emit the legacy flat shape either (empty output or canonical envelope)');
  if (o.hookSpecificOutput) {
    assert.equal(o.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(o.hookSpecificOutput.permissionDecision, 'allow');
  }
});

liveTest('F2-S3 [GUARD] the deny semantics themselves are unchanged (refactor prod write w/o scope lock)', (root) => {
  const docDir = seedRefactorRun(root);
  const r = run({
    tool_name: 'Write',
    tool_input: { file_path: path.join(root, 'src', 'x.js'), content: 'x' },
    cwd: root,
  }, { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const o = out(r);
  const decision = (o.hookSpecificOutput && o.hookSpecificOutput.permissionDecision) || o.permissionDecision;
  assert.equal(decision, 'deny', 'the first refactor production write without REFACTOR_SCOPE_LOCK is still denied');
  const reason = (o.hookSpecificOutput && o.hookSpecificOutput.permissionDecisionReason) || o.reason || '';
  assert.match(reason, /REFACTOR_SCOPE_LOCK/, 'the deny still names the missing gate');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
