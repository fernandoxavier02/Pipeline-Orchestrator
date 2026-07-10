#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.23.0) — audit-fabrication-gate: REAL hook process (PreToolUse)
// =============================================================================
// Drives .claude/hooks/audit-fabrication-gate.cjs as a child process with a
// Write payload, exactly as the harness would. Asserts:
//   - forged writes (backdated / unfounded GO / fake user) → permissionDecision:deny
//   - healthy writes → no deny
//   - default posture is DENY; PIPELINE_AUDIT_FABRICATION_ENFORCEMENT=warn escapes
//   - a high-severity AUDIT event lands in protocol-events.jsonl on a block
//   - fail-open: non-run-dir path, non-target filename, unreadable incoming
//
// RED until the hook exists.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/audit-fabrication-gate.cjs');

const NOW = Date.now();
function isoAgo(ms) { return new Date(NOW - ms).toISOString(); }
function line(obj) { return JSON.stringify(obj); }

function mkRun() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-audit-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-07-10-guard');
  fs.mkdirSync(runDir, { recursive: true });
  return { tmp, runDir };
}
function writePayload(runDir, filename, content) {
  return { tool_name: 'Write', tool_input: { file_path: path.join(runDir, filename), content }, cwd: path.dirname(path.dirname(path.dirname(path.dirname(runDir)))) };
}
function runHook(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}),
  });
}
function denied(res) { return /"permissionDecision"\s*:\s*"deny"/.test(res.stdout || ''); }

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  let ctx;
  try { ctx = fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  if (ctx && ctx.tmp) { try { fs.rmSync(ctx.tmp, { recursive: true, force: true }); } catch {} }
}

console.log('=== F2 v8.23.0 — audit-fabrication-gate real process ===');

// C1 — backdated line appended to gate-decisions.jsonl → deny
test('C1 backdated gate-decisions entry (default deny) → deny + AUDIT event', () => {
  const { tmp, runDir } = mkRun();
  const existing = line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'system', timestamp: isoAgo(1000), detail: 'ok' }) + '\n';
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), existing);
  const forged = line({ gate: 'CLOSEOUT_CONFIRM', decision: 'CONFIRMED', decided_by: 'system', timestamp: isoAgo(4 * 3600000), detail: 'retro' });
  const res = runHook(writePayload(runDir, 'gate-decisions.jsonl', existing + forged + '\n'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(denied(res), 'expected deny on backdated entry');
  const pe = path.join(runDir, 'protocol-events.jsonl');
  assert.ok(fs.existsSync(pe), 'AUDIT event file must exist');
  const events = fs.readFileSync(pe, 'utf8');
  assert.match(events, /AUDIT_TRAIL_FABRICATION_BLOCKED/, 'high-severity AUDIT event must be logged');
  assert.match(events, /"severity"\s*:\s*"high"/);
  return { tmp };
});

// C2 — unfounded GO → deny
test('C2 sentinel final_decision:GO with no closure gate → deny', () => {
  const { tmp, runDir } = mkRun();
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED' }) + '\n');
  const state = JSON.stringify({ pipeline_active: true, final_decision: 'GO' }, null, 2);
  const res = runHook(writePayload(runDir, 'sentinel-state.json', state));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(denied(res), 'expected deny on GO without closure evidence');
  return { tmp };
});

// C2 healthy — GO after FINAL_ADVERSARIAL_GATE logged → allow
test('C2 healthy: GO after FINAL_ADVERSARIAL_GATE logged (before closeout) → no deny', () => {
  const { tmp, runDir } = mkRun();
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), line({ gate: 'FINAL_ADVERSARIAL_GATE', decision: 'SKIPPED' }) + '\n');
  const state = JSON.stringify({ pipeline_active: true, final_decision: 'GO' }, null, 2);
  const res = runHook(writePayload(runDir, 'sentinel-state.json', state));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!denied(res), 'healthy Pa-de-Cal GO must pass');
  return { tmp };
});

// C3 — fake decided_by:user (no protocol) → deny
test('C3 decided_by:user with no protocol-events → deny', () => {
  const { tmp, runDir } = mkRun();
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), '');
  const forged = line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'user', timestamp: isoAgo(1000), detail: 'user approved' });
  const res = runHook(writePayload(runDir, 'gate-decisions.jsonl', forged + '\n'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(denied(res), 'expected deny on uncorroborated user decision');
  return { tmp };
});

// C3 healthy — decided_by:user referencing a real protocol id → allow
test('C3 healthy: decided_by:user referencing a real protocol id → no deny', () => {
  const { tmp, runDir } = mkRun();
  fs.writeFileSync(path.join(runDir, 'protocol-events.jsonl'), line({ event: 'GATE_RESPONSES', id: 'toolu_real42', ts: isoAgo(1500) }) + '\n');
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), '');
  const legit = line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'user', timestamp: isoAgo(1000), detail: 'tool_use_id=toolu_real42 answer=Yes' });
  const res = runHook(writePayload(runDir, 'gate-decisions.jsonl', legit + '\n'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!denied(res), 'corroborated user decision must pass');
  return { tmp };
});

// Enforcement escape — warn
test('warn escape: forgery under PIPELINE_AUDIT_FABRICATION_ENFORCEMENT=warn → no deny (still audited)', () => {
  const { tmp, runDir } = mkRun();
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED' }) + '\n');
  const state = JSON.stringify({ pipeline_active: true, final_decision: 'GO' }, null, 2);
  const res = runHook(writePayload(runDir, 'sentinel-state.json', state), { PIPELINE_AUDIT_FABRICATION_ENFORCEMENT: 'warn' });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!denied(res), 'warn mode must not deny');
  return { tmp };
});

// Fail-open — non-run-dir path
test('fail-open: gate-decisions.jsonl OUTSIDE a run dir → no deny', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-nonrun-'));
  const dir = path.join(tmp, 'random', 'place');
  fs.mkdirSync(dir, { recursive: true });
  const forged = line({ gate: 'X', decision: 'CONFIRMED', decided_by: 'user', timestamp: isoAgo(9999999), detail: 'nope' });
  const res = runHook({ tool_name: 'Write', tool_input: { file_path: path.join(dir, 'gate-decisions.jsonl'), content: forged + '\n' }, cwd: tmp });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!denied(res), 'files outside a run dir are not our concern');
  return { tmp };
});

// Fail-open — unrelated filename
test('fail-open: unrelated filename in a run dir → no deny', () => {
  const { tmp, runDir } = mkRun();
  const res = runHook(writePayload(runDir, 'notes.md', 'final_decision GO completed:true decided_by user'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!denied(res));
  return { tmp };
});

// Healthy — fresh append passes
test('healthy: fresh-timestamp append to gate-decisions.jsonl → no deny', () => {
  const { tmp, runDir } = mkRun();
  const existing = line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'system', timestamp: isoAgo(2000), detail: 'ok' }) + '\n';
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), existing);
  const fresh = line({ gate: 'CHECKPOINT_FAIL', decision: 'NOT_TRIGGERED', decided_by: 'system', timestamp: isoAgo(100), detail: 'green' });
  const res = runHook(writePayload(runDir, 'gate-decisions.jsonl', existing + fresh + '\n'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!denied(res));
  return { tmp };
});

// --- adversarial-review hardening (round 1) ---------------------------------

function editPayload(runDir, filename, oldStr, newStr) {
  return { tool_name: 'Edit', tool_input: { file_path: path.join(runDir, filename), old_string: oldStr, new_string: newStr }, cwd: path.dirname(runDir) };
}

// Case-insensitive filename must not bypass the guard.
test('bypass-case: Gate-Decisions.JSONL with a backdated entry → deny', () => {
  const { tmp, runDir } = mkRun();
  const fresh = line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'system', timestamp: isoAgo(1000), detail: 'ok' });
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), fresh + '\n');
  const forged = line({ gate: 'CLOSEOUT_CONFIRM', decision: 'CONFIRMED', decided_by: 'system', timestamp: isoAgo(4 * 3600000), detail: 'retro' });
  const res = runHook(writePayload(runDir, 'Gate-Decisions.JSONL', fresh + '\n' + forged + '\n'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(denied(res), 'case-variant filename must still be guarded');
  return { tmp };
});

// Value-only Edit that flips final_decision to GO must be caught via the resulting file.
test('bypass-edit: Edit old="PENDING" new="GO" on sentinel-state → deny', () => {
  const { tmp, runDir } = mkRun();
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED' }) + '\n');
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({ pipeline_active: true, final_decision: 'PENDING' }, null, 2));
  const res = runHook(editPayload(runDir, 'sentinel-state.json', 'PENDING', 'GO'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(denied(res), 'value-only Edit promotion must be detected via the resulting file');
  return { tmp };
});

// Healthy Edit that appends a fresh gate-decisions line must pass (no false positive).
test('healthy-edit: Edit appending a fresh line to gate-decisions.jsonl → no deny', () => {
  const { tmp, runDir } = mkRun();
  const existing = line({ gate: 'ADVERSARIAL_GATE', decision: 'APPROVED', decided_by: 'system', timestamp: isoAgo(2000), detail: 'ok' });
  fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'), existing + '\n');
  const fresh = line({ gate: 'CHECKPOINT_FAIL', decision: 'NOT_TRIGGERED', decided_by: 'system', timestamp: isoAgo(50), detail: 'green' });
  const res = runHook(editPayload(runDir, 'gate-decisions.jsonl', existing + '\n', existing + '\n' + fresh + '\n'));
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!denied(res), 'a healthy fresh append via Edit must pass');
  return { tmp };
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
