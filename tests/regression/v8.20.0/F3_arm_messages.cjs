#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 (v8.20.0) — arm-gate / arm-writer deny messages: ONE reachable next action.
// =============================================================================
// BUG (hook audit 2026-07-02, D3): the PIPELINE_NOT_ARMED deny (and the
// CORRUPT_STATE deny, and the arm-writer's UserPromptSubmit systemMessage) LEAD
// with a recipe the LLM cannot execute — "crie sentinel-state.json à mão" — which
// (a) produces an UNSIGNED state that deepens the block, (b) directly contradicts
// the sibling MARKER_TAMPERED branch ("NÃO escreva o estado de enforcement à
// mão"), and (c) ships literal unresolved placeholders ({PIPELINE_DOC_PATH},
// <cwd>) into model-facing text. Observed live 2026-07-02 in this repo's own
// audit session.
//
// FIX CONTRACT: each message names EXACTLY ONE unblocking action, the reliable
// one — dispatch the pipeline controller via the Agent tool (what
// skills/pipeline/SKILL.md itself does) — and carries no self-write recipe and
// no unresolved placeholders.
//
// EXPECTED RED: S1..S4 fail on the current strings. GREEN after the rewrite.
// =============================================================================

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const gate = require('../../../.claude/hooks/pipeline-arm-gate.cjs');
const WRITER = path.resolve(__dirname, '../../../.claude/hooks/pipeline-arm-writer.cjs');

const CONTROLLER = 'pipeline-orchestrator:core:pipeline-controller';
const PLACEHOLDER_RE = /\{PIPELINE_DOC_PATH\}|<cwd>/;
const MANUAL_RECIPE_RE = /crie\s+.*sentinel-state\.json|sentinel-state\.json\s+à\s+mão|à mão/i;

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F3 v8.20.0 — arm messages: one reachable action, no self-write recipe, no placeholders ===');

test('F3-S1 [NEW] buildArmReason leads with the controller dispatch and has no manual-write recipe', () => {
  const msg = gate.buildArmReason('Bash', 'FULL');
  assert.match(msg, /PIPELINE_NOT_ARMED/, 'the invariant id stays (corrective + telemetry key off it)');
  assert.ok(msg.includes(CONTROLLER),
    `the ONE next action must be the reliable one: Agent(subagent_type: "${CONTROLLER}") (RED today: manual recipe first)`);
  assert.doesNotMatch(msg, MANUAL_RECIPE_RE, 'no "create sentinel-state.json by hand" recipe (contradicts MARKER_TAMPERED)');
  assert.doesNotMatch(msg, PLACEHOLDER_RE, 'no literal unresolved placeholders in model-facing text');
});

test('F3-S2 [NEW] buildCorruptReason has no manual-signer recipe and no placeholders', () => {
  const msg = gate.buildCorruptReason('Bash', 'FULL');
  assert.match(msg, /CORRUPT_STATE/);
  assert.ok(msg.includes(CONTROLLER), 'recovery action = re-dispatch the pipeline controller');
  assert.doesNotMatch(msg, PLACEHOLDER_RE, 'no literal unresolved placeholders');
  assert.doesNotMatch(msg, /re-?crie[^.]*via o signer/i, 'the LLM cannot run the signer — do not prescribe it');
});

test('F3-S3 [NEW] messages still say what stays allowed (read/questions) + auto-recovery', () => {
  for (const msg of [gate.buildArmReason('Bash', 'FULL'), gate.buildCorruptReason('Edit', 'FULL')]) {
    assert.match(msg, /Read\/Grep\/Glob|Leitura|Investigação/i, 'names what remains allowed');
    assert.match(msg, /expira|timeout/i, 'names the automatic recovery (TTL)');
  }
});

test('F3-S4 [NEW] arm-writer systemMessage: one action, no manual recipe, no placeholders', () => {
  let root;
  try {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-armwriter-'));
    const r = spawnSync(process.execPath, [WRITER], {
      input: JSON.stringify({ prompt: '/pipeline-orchestrator:pipeline conserte o bug do login', cwd: root, session_id: 's1' }),
      encoding: 'utf8',
      env: { ...process.env, PIPELINE_HMAC_SECRET: 'f3-arm-writer-stable-secret-0123456789abcdef' },
    });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout || '{}');
    assert.ok(out.systemMessage, 'a genuine /pipeline invocation still arms + surfaces the systemMessage');
    assert.ok(out.systemMessage.includes(CONTROLLER),
      'the writer message names the SAME one next action as the gate (RED today: manual recipe)');
    assert.doesNotMatch(out.systemMessage, MANUAL_RECIPE_RE);
    assert.doesNotMatch(out.systemMessage, PLACEHOLDER_RE);
  } finally {
    if (root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* */ } }
  }
});

test('F3-S5 [GUARD] MARKER_TAMPERED posture is untouched: no self-write recipe there either', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../.claude/hooks/pipeline-arm-gate.cjs'), 'utf8');
  assert.match(src, /NÃO escreva o estado[\s\S]{0,40}à mão/i, 'the tamper branch keeps forbidding self-writes');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
