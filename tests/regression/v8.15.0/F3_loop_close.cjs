#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 — loop closes: block → /self-eval completes → next Stop allows
// =============================================================================
// Proves the marker (set by scripts/e2e-eval-complete.cjs at the end of the
// approval loop) is what lets a glitchy run close — because e2e-eval.json records
// the immutable PAST, the hook would otherwise re-block forever.
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const GATE = require(path.join(root, '.claude', 'hooks', 'e2e-eval-gate.cjs'));
const COMPLETER = require(path.join(root, 'scripts', 'e2e-eval-complete.cjs'));
const signer = require(path.join(root, 'lib', 'sentinel-state-signer.cjs'));
const { mandatorySetFor } = require(path.join(root, 'lib', 'fidelity-reporter.cjs'));
const { MARKERS } = require(path.join(root, 'lib', 'contracts', 'e2e-eval.cjs'));

let failures = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) { failures++; console.log(`FAIL | exp=${JSON.stringify(exp)} got=${JSON.stringify(got)} | ${label}`); }
  else console.log(`OK   | ${label}`);
}
function checkTrue(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | expected truthy | ${label}`); }
  else console.log(`OK   | ${label}`);
}

delete process.env.PIPELINE_DOC_PATH;
delete process.env.PIPELINE_RUN_ID;
delete process.env.PIPELINE_E2E_EVAL_ENFORCEMENT;
delete process.env.PIPELINE_HMAC_STRICT;

const MEDIA_GATES = mandatorySetFor('MEDIA', 'Bug Fix', null);

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-close-'));
const docPath = path.join(repoRoot, '.pipeline', 'docs', 'Pre-bugfix-action', 'demo', '001-run');
fs.mkdirSync(docPath, { recursive: true });
fs.writeFileSync(path.join(repoRoot, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: docPath, run_id: '001-run' }));
fs.writeFileSync(path.join(docPath, 'sentinel-state.json'),
  JSON.stringify({ run_id: '001-run', task_type: 'Bug Fix', complexity: 'MEDIA', terminal_state: 'completed', step_ledger: ['classify'] }, null, 2));
fs.writeFileSync(path.join(docPath, 'gate-decisions.jsonl'),
  MEDIA_GATES.slice(0, 2).map((g) => JSON.stringify({ gate: g, hardness: 'MANDATORY', decision: 'TRIGGERED', timestamp_utc: '2026-06-26T00:00:00Z' })).join('\n') + '\n');

// 1. First Stop → block (glitches present).
const out1 = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
check('1st Stop → block', out1.decision, 'block');

// 2. /self-eval finishes → completer stamps the signed marker.
const ok = COMPLETER.persistCompleted(path.join(docPath, 'sentinel-state.json'), true);
checkTrue('completer persisted', ok);
const st = JSON.parse(fs.readFileSync(path.join(docPath, 'sentinel-state.json'), 'utf8'));
check('marker set', st[MARKERS.COMPLETED], true);
// marker write is properly signed (tamper-evident)
const v = signer.verifyState(st, { key: signer.readHmacKey() });
checkTrue('state signature valid after marker write', v.valid);

// 3. Next Stop → allow (loop closed despite immutable glitch json).
const out2 = GATE.decide({ hook_event_name: 'Stop', cwd: repoRoot });
check('2nd Stop → allow (closed)', out2.decision, 'allow');

fs.rmSync(repoRoot, { recursive: true, force: true });
console.log(failures === 0 ? '\n>>> F3 PASS' : `\n>>> F3 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
