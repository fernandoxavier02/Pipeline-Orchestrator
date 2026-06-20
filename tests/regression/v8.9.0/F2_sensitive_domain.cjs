#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.9.0) — Wave 1 A4: sensitive-domain makes the adversarial review
// MANDATORY (no `warn` skip). The batch-review guard, when the run touched a
// sensitive domain and reviews lag, DENIES even in warn mode. Pure brain +
// recorder accumulation + live gate + real stamp-hook path.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const GUARD = require('../../../lib/batch-review-guard.cjs');
const REC = require('../../../scripts/record-step.cjs');
const GATE = path.resolve(__dirname, '../../../.claude/hooks/batch-review-gate.cjs');
const STAMP = path.resolve(__dirname, '../../../.claude/hooks/step-ledger-stamp.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  writeSignedState(path.join(docDir, 'sentinel-state.json'), Object.assign({
    run_id: 'r', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    batch_checkpoints_done: 1, batch_reviews_done: 0,
  }, extra || {}));
  fs.writeFileSync(path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r', updated_at: '2026-06-20T12:00:00.000Z' }, null, 2));
  return docDir;
}
function readState(docDir) { return JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')); }
function gate(root, docDir, env) {
  return spawnSync(process.execPath, [GATE], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root }),
    encoding: 'utf8', env: { ...process.env, PIPELINE_DOC_PATH: docDir, ...(env || {}) },
  });
}

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
function liveTest(name, fn) {
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sens-f2-')); fn(dir); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
  finally { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } }
}

console.log('=== F2 v8.9.0 — sensitive-domain mandatory review (A4) ===');

test('F2-1 — brain: sensitive + reviews lag + warn → BLOCK (no skip)', () => {
  const r = GUARD.decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 1, reviewsDone: 0, sensitive: true, domains: ['auth'], enforce: 'warn' });
  assert.equal(r.decision, 'block');
  assert.equal(r.sensitive, true);
  assert.match(r.reason, /SENS[IÍ]VEL/i);
  assert.match(r.reason, /auth/);
});
test('F2-2 — brain: NON-sensitive + warn → allow (escape preserved)', () => {
  const r = GUARD.decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 1, reviewsDone: 0, sensitive: false, enforce: 'warn' });
  assert.equal(r.decision, 'allow');
  assert.equal(r.warn, true);
});
test('F2-3 — brain: caught-up reviews allow regardless of sensitivity', () => {
  const r = GUARD.decideBatchReview({ agentLeaf: 'final-validator', checkpointsDone: 1, reviewsDone: 1, sensitive: true });
  assert.equal(r.decision, 'allow');
});

liveTest('F2-4 — recorder accumulates touched domains (union)', (root) => {
  const docDir = seedRun(root, {});
  REC.recordDomainsTouched(docDir, ['src/ui/x.tsx']);            // none
  assert.deepEqual(readState(docDir).domains_touched, []);
  REC.recordDomainsTouched(docDir, ['src/auth/login.ts']);       // auth
  REC.recordDomainsTouched(docDir, ['lib/crypto/sign.cjs']);     // + crypto
  assert.deepEqual(readState(docDir).domains_touched, ['auth', 'crypto']);
});

liveTest('F2-5 — LIVE: sensitive run + reviews lag + WARN env → deny (mandatory)', (root) => {
  const docDir = seedRun(root, { domains_touched: ['payment'] });
  const r = gate(root, docDir, { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'warn' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout || '{}');
  assert.equal(out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision, 'deny', r.stdout || '(sensitive batch skipped review under warn!)');
});

liveTest('F2-6 — LIVE: non-sensitive run + WARN env → allow (escape intact)', (root) => {
  const docDir = seedRun(root, {}); // no domains_touched
  const r = gate(root, docDir, { PIPELINE_BATCH_REVIEW_ENFORCEMENT: 'warn' });
  assert.equal((r.stdout || '').trim(), '');
});

liveTest('F2-7 — REAL stamp hook reads batch-files.json and records sensitive domains', (root) => {
  const docDir = seedRun(root, {});
  fs.writeFileSync(path.join(docDir, 'batch-files.json'), JSON.stringify(['api/auth/session.ts', 'README.md']));
  const r = spawnSync(process.execPath, [STAMP], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:checkpoint-validator' }, cwd: root }),
    encoding: 'utf8', env: { ...process.env, PIPELINE_DOC_PATH: docDir },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readState(docDir).domains_touched, ['auth']);
});

console.log(`\n=== F2 v8.9.0: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
