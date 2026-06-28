#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 — v8.17.0 — AUDIT-001 — stop-hook write-verify after appendRunLog
// =============================================================================
// After appendRunLog writes a summary line to <repoRoot>/.pipeline/run-log.jsonl,
// the stop-hook must read the file back, take the LAST non-empty line, parse it,
// and compare run_id against the one it just wrote. On mismatch, a warning is
// emitted on stderr (soft-fail; the hook never throws).
//
// Contract:
//   - Match: silent (warn message MAY be empty for the verify path)
//   - Mismatch: a warn-line on stderr is emitted via the hook's existing `warn`
//     channel, containing at least the literal token `run-log verify mismatch`.
//   - Missing file (race): soft pass, no throw.
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const stopHook = require(path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs'));

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | ${label}`); }
  else console.log(`OK   | ${label}`);
}

// Capture stderr writes during a callback. Returns a string of all writes.
function captureStderr(fn) {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    return true;
  };
  try { fn(); } finally { process.stderr.write = orig; }
  return chunks.join('');
}

// The verify helper is exported from stop-hook for direct testing. It takes the
// repoRoot and the just-written run_id, and warns if the tail does not match.
function ensureVerifyExported() {
  return typeof stopHook.verifyRunLogAppend === 'function';
}

check('Exports: verifyRunLogAppend is a function', ensureVerifyExported());

// --- Case 1: tail matches the just-written run_id -> no warn ----------------
{
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-v8170-'));
  const logDir = path.join(repoRoot, '.pipeline');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'run-log.jsonl');
  const writtenRunId = 'happy-run-001';
  fs.writeFileSync(logPath, JSON.stringify({ run_id: writtenRunId, final_decision: 'GO' }) + '\n');
  const captured = captureStderr(() => stopHook.verifyRunLogAppend(repoRoot, writtenRunId));
  check('Case1: match -> no `run-log verify mismatch` on stderr', !captured.includes('run-log verify mismatch'));
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 2: tail has a DIFFERENT run_id -> warn fires ----------------------
{
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-v8170-'));
  const logDir = path.join(repoRoot, '.pipeline');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'run-log.jsonl');
  // We wrote 'expected-run-002' but a concurrent writer slipped in a different
  // run after — the tail line carries 'someone-else-003'.
  fs.writeFileSync(logPath, [
    JSON.stringify({ run_id: 'expected-run-002', final_decision: 'GO' }),
    JSON.stringify({ run_id: 'someone-else-003', final_decision: 'GO' }),
  ].join('\n') + '\n');
  const captured = captureStderr(() => stopHook.verifyRunLogAppend(repoRoot, 'expected-run-002'));
  check('Case2: mismatch -> stderr contains `run-log verify mismatch`',
    captured.includes('run-log verify mismatch'));
  check('Case2: warn includes the expected run_id token',
    captured.includes('expected-run-002'));
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 3: missing run-log file -> soft-pass, no throw, no warn ----------
{
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-v8170-'));
  // no .pipeline/run-log.jsonl at all
  let threw = false;
  const captured = captureStderr(() => {
    try { stopHook.verifyRunLogAppend(repoRoot, 'never-existed-run'); }
    catch (e) { threw = true; }
  });
  check('Case3: missing file -> does not throw', !threw);
  check('Case3: missing file -> no `run-log verify mismatch` on stderr (soft-pass)',
    !captured.includes('run-log verify mismatch'));
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// --- Case 4: tail is malformed JSON -> soft-pass, no throw, no false-mismatch -
{
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-v8170-'));
  const logDir = path.join(repoRoot, '.pipeline');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, 'run-log.jsonl'),
    JSON.stringify({ run_id: 'good-row-004' }) + '\n' + 'not-valid-json{{{\n');
  let threw = false;
  const captured = captureStderr(() => {
    try { stopHook.verifyRunLogAppend(repoRoot, 'good-row-004'); }
    catch (e) { threw = true; }
  });
  check('Case4: malformed tail -> does not throw', !threw);
  // Decision (per the v8.17.0 contract): malformed tail is an unparseable read,
  // NOT a forensic mismatch — soft-pass without firing the mismatch warn so a
  // truncated/concurrent-write race never spam-logs.
  check('Case4: malformed tail -> no `run-log verify mismatch` on stderr',
    !captured.includes('run-log verify mismatch'));
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

process.exit(failures > 0 ? 1 : 0);
