#!/usr/bin/env node
'use strict';

// =============================================================================
// human-gate-record.test.cjs — enforcement-audit Batch HUMAN-GATE
// (DoD #12 "human gates recorded from the real tool result").
//
// ROOT CAUSE (audit 2026-06-21, finding, HIGH, verified): no PreToolUse or
// PostToolUse handler on AskUserQuestion ever recorded the real user choice.
// tool_response was read by exactly one hook (langfuse, telemetry only), so the
// audit trail's record of a human decision was authored by controller PROSE —
// a controller could ask, ignore the answer, and stamp anything.
//
// FIX: an additive PostToolUse:AskUserQuestion observer appends a HUMAN_GATE
// entry to the run's gate-decisions.jsonl, derived from payload.tool_response +
// tool_use_id (the REAL tool result), via the canonical gate-decision-writer.
// A PostToolUse observer cannot block -> zero deadlock risk.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../human-gate-record.cjs');
let mod = null;
try { mod = require('../human-gate-record.cjs'); } catch { mod = null; }

let pass = 0, fail = 0;
function test(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'human-gate-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++;
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}
function seed(dir, obj) { fs.writeFileSync(path.join(dir, 'sentinel-state.json'), JSON.stringify(obj, null, 2)); }
function gateLines(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'gate-decisions.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}
function run(dir, payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, PIPELINE_DOC_PATH: dir },
  });
}

console.log('=== human-gate-record (PostToolUse:AskUserQuestion) — DoD #12 ===');

test('module exists and exports record + summarizeAnswer', () => {
  assert.ok(mod, 'human-gate-record.cjs must exist and load');
  assert.equal(typeof mod.record, 'function');
  assert.equal(typeof mod.summarizeAnswer, 'function');
});

test('pure — summarizeAnswer captures the real answer text', () => {
  assert.ok(mod, 'module must load');
  assert.match(mod.summarizeAnswer({ choice: 'Option A' }), /Option A/);
  assert.equal(mod.summarizeAnswer(null), 'no_answer');
  assert.match(mod.summarizeAnswer('Yes, proceed'), /Yes, proceed/);
});

test('records ONE HUMAN_GATE entry from the real tool_response, correlated by tool_use_id', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'proposal' });
  const r = run(dir, {
    tool_name: 'AskUserQuestion',
    tool_use_id: 'tu_abc123',
    tool_response: { choice: 'Option A — proceed' },
    cwd: dir,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = gateLines(dir);
  assert.equal(lines.length, 1, `expected exactly one gate-decision line, got ${lines.length}`);
  const e = lines[0];
  assert.equal(e.gate, 'HUMAN_GATE');
  assert.equal(e.decision, 'CONFIRMED');
  assert.equal(e.decided_by, 'user');
  assert.match(String(e.detail), /tu_abc123/, 'detail must carry the real tool_use_id');
  // DoD#12 headline: the REAL answer text (not just the id) must reach the record.
  // (Mutation guard — dropping the answer from the hook must fail this.)
  assert.match(String(e.detail), /Option A/, 'detail must carry the real answer text from tool_response');
});

test('answer text is DERIVED from tool_response, not constant (second answer)', (dir) => {
  seed(dir, { run_id: 'r2', pipeline_active: true, task_type: 'Bug Fix', current_phase: 'closeout' });
  run(dir, {
    tool_name: 'AskUserQuestion',
    tool_use_id: 'tu_def456',
    tool_response: { choice: 'No, cancel the run' },
    cwd: dir,
  });
  const e = gateLines(dir)[0];
  assert.ok(e, 'expected a recorded line');
  assert.match(String(e.detail), /No, cancel the run/, 'a different answer must produce a different recorded detail');
  // Even a rejection is recorded as CONFIRMED ("an answer was captured") — this is
  // the documented answer-independent contract; HUMAN_GATE must never be an
  // enforcement gate that branches on this value (see hook CONTRACT comment).
  assert.equal(e.decision, 'CONFIRMED');
});

test('non-AskUserQuestion tool records nothing', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: true, task_type: 'Bug Fix' });
  run(dir, { tool_name: 'Bash', tool_use_id: 'tu_x', tool_response: { ok: true }, cwd: dir });
  assert.equal(gateLines(dir).length, 0);
});

test('inactive run records nothing (no governed gate)', (dir) => {
  seed(dir, { run_id: 'r1', pipeline_active: false, task_type: 'Bug Fix' });
  run(dir, { tool_name: 'AskUserQuestion', tool_use_id: 'tu_y', tool_response: { choice: 'X' }, cwd: dir });
  assert.equal(gateLines(dir).length, 0);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
