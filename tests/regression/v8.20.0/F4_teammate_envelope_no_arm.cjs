#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 (v8.20.0) — teammate/agent message envelopes must NEVER arm a phantom run.
// =============================================================================
// LIVE BUG (2026-07-02, this repo's own audit session): a background subagent's
// report quoted the literal string "/pipeline-orchestrator:pipeline continue" in
// its prose. The report was delivered to the main session as a prompt turn
// wrapped in <agent-message from="hook-auditor"> / <teammate-message …>
// envelopes. lib/pipeline-arm.cjs::userPromptSegment cuts the prompt at the
// FIRST harness-injected envelope OPENING tag (positional model, v8.18.1), but
// HARNESS_OPEN_TAG does not list the teammate/agent message envelopes — so the
// quoted command leaked into the classifier, armed workflow=CONTINUE
// (source flag:continue), and the arm-gate bricked Bash/PowerShell/Agent for the
// whole session until the 30-min TTL.
//
// FIX CONTRACT: add teammate-message + agent-message to HARNESS_OPEN_TAG. Same
// positional model, same safe trade-off (a missed arm is recoverable; a phantom
// arm deadlocks).
//
// EXPECTED RED: S1/S2 fail (marker written). GREEN after the regex extension.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f4-teammate-envelope-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const arm = require('../../../lib/pipeline-arm.cjs');

// The real prompt shape observed live (harness preamble BEFORE the tag, quoted
// command inside the envelope body).
const TEAMMATE_PROMPT =
  'Another Claude session sent a message:\n' +
  '<teammate-message teammate_id="hook-auditor" color="green">\n' +
  '{"type":"idle_notification","from":"hook-auditor"}\n' +
  '</teammate-message>\n' +
  'Recommendation 5: a uniform recovery action such as `/pipeline-orchestrator:pipeline continue` ' +
  'that no sibling gate bars in that state.';

const AGENT_MSG_PROMPT =
  'Another Claude session sent a message:\n' +
  '<agent-message from="hook-auditor">\n' +
  '# Audit (2/2)\n' +
  'D5 — fire-and-continue; the remedy is `/pipeline-orchestrator:pipeline continue`.\n' +
  '</agent-message>';

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f4-noarm-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } } }
}
function markerAt(root) { return path.join(root, '.pipeline', 'pipeline-arm-pending.json'); }

console.log('=== F4 v8.20.0 — teammate/agent message envelopes never arm a phantom run ===');

test('F4-S1 [NEW] a <teammate-message> turn quoting the command does NOT arm (live repro)', (root) => {
  const m = arm.writeArmPending(root, TEAMMATE_PROMPT, undefined, 'sess-1');
  assert.equal(m, null, 'RED today: arms workflow=CONTINUE off the quoted command');
  assert.equal(fs.existsSync(markerAt(root)), false, 'no phantom marker on disk');
});

test('F4-S2 [NEW] an <agent-message> turn quoting the command does NOT arm (live repro)', (root) => {
  const m = arm.writeArmPending(root, AGENT_MSG_PROMPT, undefined, 'sess-1');
  assert.equal(m, null);
  assert.equal(fs.existsSync(markerAt(root)), false);
});

test('F4-S3 [NEW] userPromptSegment cuts at the teammate/agent envelope opening tag', () => {
  assert.equal(arm.userPromptSegment('before <teammate-message x="1">body</teammate-message>'), 'before ');
  assert.equal(arm.userPromptSegment('before <agent-message from="a">body</agent-message>'), 'before ');
});

test('F4-S4 [GUARD] a genuine user /pipeline invocation still arms', (root) => {
  const m = arm.writeArmPending(root, '/pipeline-orchestrator:pipeline conserte o bug do login', undefined, 'sess-1');
  assert.ok(m, 'a real invocation must keep arming');
  assert.equal(fs.existsSync(markerAt(root)), true);
});

test('F4-S5 [GUARD] user command BEFORE an envelope still arms (positional model preserved)', (root) => {
  const m = arm.writeArmPending(root,
    '/pipeline continue\n<teammate-message teammate_id="x">tail</teammate-message>', undefined, 'sess-1');
  assert.ok(m, 'text the user typed before the first envelope tag is still classified');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
