#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.8.0) — B3: scope-lock hook for refactor variants (AUDIT-002 + D2b + D4).
//
// TDD RED phase. The user-APPROVED B3 scenarios as labeled sub-checks.
//
// ----------------------------------------------------------------------------
// EXPECTED RED SPLIT — read before running.
// ----------------------------------------------------------------------------
// Today .claude/hooks/scope-lock-hook.cjs ONLY enforces a CHANGE_CONTRACT
// allow/forbid list read from the session lock; it has NO notion of "the active
// run is a refactor variant and REFACTOR_SCOPE_LOCK has not been logged yet, so
// the FIRST production write must be denied". B3 adds that: when the active run's
// variant is refactor-light/refactor-heavy and gate-decisions.jsonl does NOT yet
// contain REFACTOR_SCOPE_LOCK, a production write (outside .pipeline/) is denied.
//
//   NEW-BEHAVIOR (must FAIL now, on an assertion — valid RED):
//     B3-MAIN   refactor variant + REFACTOR_SCOPE_LOCK NOT logged + prod write → deny + /REFACTOR_SCOPE_LOCK/
//
//   INVARIANT-GUARD (PASS now, must STAY passing — by design):
//     B3-REG-1  refactor variant + REFACTOR_SCOPE_LOCK IS logged → allow
//     B3-REG-2  non-refactor variant (bugfix-light) → allow
//     B3-EDGE-1 .pipeline/ write → allow (always exempt)
//
//   NEW-BEHAVIOR (B3-EDGE-2 docs claim) — gate response pretester-Q1 = "Qualify
//   the runtime claim" (resolved 2026-06-19). The refactor SKILL.md files describe
//   the scope-lock firing ("fires before the first file is touched") but do NOT yet
//   CREDIT the new code hook. The D2b doc fix must add, near that scope-lock prose,
//   a phrase crediting the scope-lock-hook / write-time code enforcement (e.g.
//   "scope-lock-hook denies the first production write until REFACTOR_SCOPE_LOCK is
//   recorded", "code-level", "v8.8.0"). This is currently ABSENT in BOTH files →
//   the assertion fails RED (on a regex no-match, not a load error).
//     B3-EDGE-2 each refactor SKILL.md credits the scope-lock HOOK near the
//               scope-lock description → /scope-lock-hook|denies the first…write|
//               code-level|v8\.8\.0/  (PRESENT expected → currently ABSENT → RED)
//   NOTE: it deliberately does NOT target the shared "Violations are blocked
//   deterministically" sequence-lock boilerplate (that line is verbatim across
//   bugfix/audit and refers to the sequence lock, per the gate response).
//
// Each non-deferred check is tagged [NEW] or [GUARD].
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');
const HOOK = path.resolve(__dirname, '../../../.claude/hooks/scope-lock-hook.cjs');

// Seed a SIGNED active run carrying the variant, plus an active session lock and
// a gate-decisions.jsonl. We provide BOTH the sentinel-state/active-run pointer
// AND a session lock so that whichever discovery path the B3 implementation
// chooses to learn the variant, the data is present and consistent.
function seedRun(root, variant, loggedGates) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), {
    run_id: 'r',
    pipeline_active: true,
    task_type: variant && variant.startsWith('refactor') ? 'Refactor' : 'Bug Fix',
    pipeline_variant: variant,
    pipeline_doc_path: docDir,
  });
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-19T12:00:00.000Z' }, null, 2)
  );
  const trail = (loggedGates || []).map((g) => JSON.stringify({ gate: g, hardness: 'HARD' })).join('\n');
  fs.writeFileSync(path.join(docDir, 'gate-decisions.jsonl'), trail ? trail + '\n' : '');

  // Active session lock (the surface the existing scope-lock hook already reads).
  const sessionsDir = path.join(root, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const now = Date.now();
  fs.writeFileSync(path.join(sessionsDir, 'sess.lock'), JSON.stringify({
    session_id: 'sess', status: 'active',
    created_at: now, expires_at: now + 60 * 60 * 1000, last_seen_at: now,
    pipeline_variant: variant,
  }));
  return docDir;
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

// The scope-lock hook emits a FLAT { permissionDecision, reason } object (NOT the
// hookSpecificOutput envelope the Agent gates use). Parse defensively for both.
function decisionOf(r) {
  let out = {};
  try { out = JSON.parse(r.stdout || '{}'); } catch { return undefined; }
  if (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision) return out.hookSpecificOutput.permissionDecision;
  return out.permissionDecision;
}
function reasonOf(r) {
  let out = {};
  try { out = JSON.parse(r.stdout || '{}'); } catch { return ''; }
  if (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecisionReason) return out.hookSpecificOutput.permissionDecisionReason;
  return out.reason || '';
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scopelock-f5-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F5 v8.8.0 — B3 refactor scope-lock hook (RED: NEW fail, GUARD pass) ===');

// ---- B3-MAIN [NEW] refactor variant + gate NOT logged + prod write → deny ----
liveTest('B3-MAIN [NEW] refactor-light + REFACTOR_SCOPE_LOCK NOT logged + Edit production .cjs → deny + /REFACTOR_SCOPE_LOCK/', (root) => {
  const docDir = seedRun(root, 'refactor-light', []); // no REFACTOR_SCOPE_LOCK in the trail
  const prodFile = path.join(root, 'src', 'thing.cjs'); // outside .pipeline/
  const r = run(
    { tool_name: 'Edit', tool_input: { file_path: prodFile }, cwd: root },
    { PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    decisionOf(r), 'deny',
    r.stdout || '(allow — scope-lock has no refactor-variant first-write block; expected deny)'
  );
  assert.match(reasonOf(r), /REFACTOR_SCOPE_LOCK/, 'deny reason must name REFACTOR_SCOPE_LOCK');
});

// Also assert refactor-HEAVY behaves identically (both variants are governed).
liveTest('B3-MAIN [NEW] refactor-heavy + REFACTOR_SCOPE_LOCK NOT logged + Edit production .cjs → deny', (root) => {
  const docDir = seedRun(root, 'refactor-heavy', []);
  const r = run(
    { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'lib', 'mod.cjs') }, cwd: root },
    { PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(decisionOf(r), 'deny', r.stdout || '(refactor-heavy first write was not blocked)');
});

// ---- B3-REG-1 [GUARD/post-impl] refactor variant + gate IS logged → allow ----
// NOTE: this is GREEN-after-impl. Pre-impl the hook ignores the variant entirely
// and allows; post-impl it must still allow once the gate is logged. Either way
// the expected decision here is allow, so it is a stable guard.
liveTest('B3-REG-1 [GUARD] refactor-light + REFACTOR_SCOPE_LOCK IS logged + Edit production → allow (scope declared)', (root) => {
  const docDir = seedRun(root, 'refactor-light', ['REFACTOR_SCOPE_LOCK']);
  const r = run(
    { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src', 'thing.cjs') }, cwd: root },
    { PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny', r.stdout || '(write blocked even though REFACTOR_SCOPE_LOCK was logged)');
});

// ---- B3-REG-2 [GUARD] non-refactor variant → always allow -------------------
liveTest('B3-REG-2 [GUARD] bugfix-light (non-refactor) + no REFACTOR_SCOPE_LOCK + Edit production → allow', (root) => {
  const docDir = seedRun(root, 'bugfix-light', []);
  const r = run(
    { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src', 'thing.cjs') }, cwd: root },
    { PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny', r.stdout || '(non-refactor variant was blocked by the refactor scope-lock!)');
});

// ---- B3-EDGE-1 [GUARD] .pipeline/ writes are always exempt ------------------
liveTest('B3-EDGE-1 [GUARD] refactor-light + no gate logged + Edit inside .pipeline/ → allow (always exempt)', (root) => {
  const docDir = seedRun(root, 'refactor-light', []);
  const pipelineFile = path.join(root, '.pipeline', 'sentinel-state.json'); // inside .pipeline/
  const r = run(
    { tool_name: 'Edit', tool_input: { file_path: pipelineFile }, cwd: root },
    { PIPELINE_DOC_PATH: docDir }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny', r.stdout || '(.pipeline/ write was blocked — must be exempt)');
});

// ---- B3-EDGE-2 [NEW] docs credit the scope-lock HOOK (D2b) — gate-resolved ----
// pretester-Q1 = "Qualify the runtime claim": each refactor SKILL.md, where it
// describes the scope-lock firing, must CREDIT the new code hook (scope-lock-hook
// denies the first production write until REFACTOR_SCOPE_LOCK is recorded /
// code-level / v8.8.0). Currently ABSENT in both → RED on a regex no-match.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const HOOK_CREDIT_RE = /scope-lock-hook|denies the first[^.]*write|code-level|v8\.8\.0/i;
for (const variant of ['refactor-light', 'refactor-heavy']) {
  test(`B3-EDGE-2 [NEW] skills/${variant}/SKILL.md credits the scope-lock HOOK near the scope-lock description (D2b)`, () => {
    const skillPath = path.join(REPO_ROOT, 'skills', variant, 'SKILL.md');
    // The file MUST exist and load cleanly — a missing file here is a WRONG RED,
    // so assert presence first with an explicit message (not an ENOENT throw).
    assert.ok(fs.existsSync(skillPath), `expected ${variant}/SKILL.md to exist at ${skillPath}`);
    const body = fs.readFileSync(skillPath, 'utf8');
    // Sanity: the scope-lock IS described here (so we are matching the right file
    // and the regex is targeting real prose, not a typo'd path).
    assert.match(body, /REFACTOR_SCOPE_LOCK/, `${variant}/SKILL.md should describe REFACTOR_SCOPE_LOCK`);
    // The actual D2b assertion: the prose must credit the new write-time code hook.
    // ABSENT today (the D2b doc fix hasn't landed) → RED on this regex no-match.
    assert.match(
      body,
      HOOK_CREDIT_RE,
      `${variant}/SKILL.md must credit the scope-lock HOOK (e.g. "scope-lock-hook denies the first production write until REFACTOR_SCOPE_LOCK is recorded", "code-level", or "v8.8.0") near the scope-lock description — currently ABSENT (D2b doc fix not yet applied)`
    );
  });
}

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED for [NEW]; [GUARD] should NOT appear here):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
