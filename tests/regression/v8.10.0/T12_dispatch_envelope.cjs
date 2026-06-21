#!/usr/bin/env node
'use strict';

// =============================================================================
// T12 (v8.10.0) — REQ-DISPATCH-ENVELOPE: prepend-once updatedInput.
// TDD RED phase. EXTENDS .claude/hooks/dispatch-record-hook.cjs so that, on the
// SHIPPED governed allow path, the hook emits hookSpecificOutput.updatedInput =
// a copy of tool_input with ONLY `prompt` rewritten to carry a fresh single-line
// [PIPELINE run=…] envelope (run_id, dispatch_id, phase, step, evidence summary)
// prepended at the top; any pre-existing leading [PIPELINE run=…] line is stripped
// first (prepend-once). Covers user-APPROVED scenarios T12-S1..S4.
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The SHIPPED hook DELIBERATELY emits NO updatedInput (dispatch-record-hook.cjs
// :192-194, :213-221 — "the envelope-injection half is DEFER'd"). So:
//   T12-S1 — FAILS: there is no updatedInput in the allow output today.
//   T12-S2 — FAILS: prepend-once cannot hold when no envelope is emitted at all.
//   T12-S3 — PASSES today (already no updatedInput) and must keep passing AFTER the
//            extension for the exempt cases (absent tool_input / non-string prompt
//            / ungoverned / absent state) — the guard that the envelope is scoped.
//   T12-S4 — PASSES today (record write + deny paths shipped) and must keep passing
//            AFTER — the regression pin that adding the envelope disturbed neither.
// The hook EXISTS and is spawned as a child process, so the S1/S2 failures are
// real behavioral assertions (no updatedInput where one is now required), never an
// ImportError — a valid behavioral RED.
//
// Q3 / AC-3 pairing for this task:
//   deny-bad   : T12-S2 (prepend-once — exactly one header, never two stacked).
//   allow-good : T12-S3 (exempt/absent → NO updatedInput, decision unchanged).
//   regression : T12-S4 (shipped record-write + corrupt-governed deny unchanged).
//
// Determinism + CRLF-safety: payloads serialized once; the prepend-once input
// (S2) feeds a prompt whose first line is a prior envelope with a trailing \n.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't12-dispatch-envelope-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/dispatch-record-hook.cjs');
const { writeSignedState, verifyState, readHmacKey } = require('../../../lib/sentinel-state-signer.cjs');

function hookExists() { return fs.existsSync(HOOK); }

function seedSignedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    state_version: 1, pending_dispatches: {}, current_phase: '2-execute',
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const v = verifyState(written, { key: readHmacKey() });
  return { docDir, statePath, signingActive: !(v.unsigned || v.key_unavailable) };
}

function tamper(statePath) {
  const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  written.run_id = 'TAMPERED';
  fs.writeFileSync(statePath, JSON.stringify(written));
}

function readState(statePath) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

function parseOut(r) {
  try { return JSON.parse(r.stdout || '{}'); } catch { return {}; }
}
function decisionOf(r) {
  const out = parseOut(r);
  return out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision;
}
// updatedInput may live top-level or under hookSpecificOutput; accept either.
function updatedInputOf(r) {
  const out = parseOut(r);
  if (out.updatedInput) return out.updatedInput;
  if (out.hookSpecificOutput && out.hookSpecificOutput.updatedInput) return out.hookSpecificOutput.updatedInput;
  return undefined;
}

const ENVELOPE_RE = /^\[PIPELINE run=/m;
// Count how many envelope header lines appear (prepend-once must yield exactly 1).
function countEnvelopeLines(prompt) {
  return String(prompt).split(/\r?\n/).filter((l) => /^\[PIPELINE run=/.test(l)).length;
}

function agentPayload(root, toolUseId, toolInput) {
  const p = { tool_name: 'Agent', cwd: root };
  if (toolInput !== undefined) p.tool_input = toolInput;
  if (toolUseId !== undefined) p.tool_use_id = toolUseId;
  return p;
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-envelope-t12-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== T12 v8.10.0 — dispatch envelope updatedInput prepend-once (RED until dispatch-record-hook.cjs emits updatedInput) ===');

// ---- T12-S1 [main] envelope rewrites ONLY prompt; all else byte-identical ----
liveTest('T12-S1 [main] governed allow → updatedInput rewrites prompt with one envelope, every other field byte-identical', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedSignedRun(root);
  const ti = {
    subagent_type: 'pipeline-orchestrator:executor:executor-implementer-task',
    description: 'implement T-x',
    prompt: 'Do the thing.\nSecond line preserved.',
    extra_flag: true,
  };
  const r = run(agentPayload(root, 'tu-s1', ti), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(decisionOf(r), 'deny', 'a valid governed dispatch must still be allowed');
  const ui = updatedInputOf(r);
  assert.ok(ui, 'governed allow path must emit updatedInput carrying the envelope (REQ-DISPATCH-ENVELOPE, the RED)');
  // Only `prompt` changes.
  assert.equal(ui.subagent_type, ti.subagent_type, 'subagent_type must be byte-identical in updatedInput');
  assert.equal(ui.description, ti.description, 'description must be byte-identical in updatedInput');
  assert.equal(ui.extra_flag, ti.extra_flag, 'unrelated fields must be carried through untouched');
  assert.notEqual(ui.prompt, ti.prompt, 'prompt must be rewritten (the envelope is prepended)');
  assert.match(ui.prompt, ENVELOPE_RE, 'rewritten prompt must start with a [PIPELINE run=…] envelope line');
  assert.equal(countEnvelopeLines(ui.prompt), 1, 'exactly one envelope header on a first dispatch');
  assert.ok(ui.prompt.includes('Do the thing.'), 'the original prompt body must be preserved below the envelope');
});

// ---- T12-S2 [deny-bad / prepend-once] already-enveloped prompt → ONE header --
liveTest('T12-S2 [prepend-once] a prompt already starting with [PIPELINE run=…] → old line stripped, exactly ONE new header', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedSignedRun(root);
  const stalePrompt =
    '[PIPELINE run=OLD dispatch=OLD phase=1-classify step=classify evidence=stale]\n' +
    'Original task body line.\nAnother line.';
  const ti = { subagent_type: 'x', prompt: stalePrompt };
  const r = run(agentPayload(root, 'tu-s2', ti), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const ui = updatedInputOf(r);
  assert.ok(ui, 'governed allow path must emit updatedInput');
  assert.equal(countEnvelopeLines(ui.prompt), 1,
    'prepend-once: a re-dispatch must strip the stale envelope and leave EXACTLY one header, never two stacked');
  assert.ok(!ui.prompt.includes('run=OLD'), 'the stale envelope line must be stripped, not retained above the new one');
  assert.ok(ui.prompt.includes('Original task body line.'), 'the real task body must survive the re-enveloping');
});

// ---- T12-S3 [allow-good / exempt] no envelope on the exempt cases -----------
liveTest('T12-S3 [exempt] tool_input absent / prompt not a string / ungoverned / absent state → NO updatedInput, decision unchanged', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedSignedRun(root);

  // (a) tool_input absent → no updatedInput.
  let r = run(agentPayload(root, 'tu-a', /* tool_input absent */ undefined), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(updatedInputOf(r), undefined, 'absent tool_input must NOT produce updatedInput');

  // (b) prompt not a string → no updatedInput.
  r = run(agentPayload(root, 'tu-b', { subagent_type: 'x', prompt: { not: 'a string' } }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(updatedInputOf(r), undefined, 'a non-string prompt must NOT produce updatedInput');

  // (c) ungoverned: no PIPELINE_DOC_PATH and no state → allow, no updatedInput, no flip.
  const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-envelope-t12-ung-'));
  try {
    fs.mkdirSync(path.join(otherRoot, '.pipeline'), { recursive: true });
    r = run(agentPayload(otherRoot, 'tu-c', { subagent_type: 'x', prompt: 'hi' }), {});
    assert.equal(r.status, 0, r.stderr);
    assert.equal(updatedInputOf(r), undefined, 'an ungoverned/absent-state dispatch must NOT produce updatedInput');
    assert.notEqual(decisionOf(r), 'deny', 'the exempt path must not change the allow decision');
  } finally {
    try { fs.rmSync(otherRoot, { recursive: true, force: true }); } catch {}
  }
});

// ---- T12-S4 [regression] record-write + corrupt-governed deny UNCHANGED ------
liveTest('T12-S4 [regression] shipped record write still happens AND governed-corrupt still DENIES after the envelope addition', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);

  // (a) record-write side effect preserved on the valid governed path.
  const ok = seedSignedRun(root);
  const r1 = run(agentPayload(root, 'tu-rec', { subagent_type: 'x', prompt: 'go' }), { PIPELINE_DOC_PATH: ok.docDir });
  assert.equal(r1.status, 0, r1.stderr);
  const pd = (readState(ok.statePath) || {}).pending_dispatches || {};
  assert.ok(Object.prototype.hasOwnProperty.call(pd, 'tu-rec'),
    'the SHIPPED dispatch record write must still persist after adding the envelope');

  // (b) corrupt-governed deny preserved (and a deny must NOT carry updatedInput).
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-envelope-t12-corrupt-'));
  try {
    const seeded = seedSignedRun(bad);
    assert.ok(seeded.signingActive,
      'signing must be active (stable secret seeded) so the governed-corrupt→deny regression is actually exercised');
    tamper(seeded.statePath);
    const r2 = run(agentPayload(bad, 'tu-corrupt', { subagent_type: 'x', prompt: 'go' }), { PIPELINE_DOC_PATH: seeded.docDir });
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(decisionOf(r2), 'deny',
      'governed action on corrupt signed state must still DENY (the shipped H2 path) after the envelope addition');
    assert.equal(updatedInputOf(r2), undefined, 'a deny output must never carry updatedInput');
  } finally {
    try { fs.rmSync(bad, { recursive: true, force: true }); } catch {}
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until dispatch-record-hook.cjs emits the prepend-once envelope):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
