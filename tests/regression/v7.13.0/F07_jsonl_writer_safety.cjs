#!/usr/bin/env node
'use strict';

/**
 * F07 (v7.13.0 — R8): unified safe JSONL writer + exclusive lock.
 *
 * Proves:
 *   - lib/exclusive-lock.cjs: acquire/release, withLock, STALE-ORPHAN recovery
 *     (a dead holder's lock does not hang future writers), contention bound.
 *   - safeAppendJsonl is concurrency-safe: N child processes appending to one
 *     file produce N*M parseable JSON lines, none interleaved/truncated.
 *   - protocol-event writes sanitize: detail truncated to 200, control chars
 *     stripped, unknown keys dropped (kind:'protocol').
 *   - protocol-events.jsonl is NOT written via raw fs.appendFileSync in the
 *     Claude Code runtime path (codex-operational-runtime routes through the
 *     safe writer) — R8.5.
 *   - The "exclusive lock" comments in jsonl-sanitizer + gate-decision-writer
 *     are now TRUE (the writer actually locks).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const xlock = require(path.join(ROOT, 'lib/exclusive-lock.cjs'));
const sanitizer = require(path.join(ROOT, 'lib/jsonl-sanitizer.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}
function mktmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'f07-')); }
function busy(ms) {
  // Sleep without burning a core (so the polling loop does not steal CPU from
  // the concurrent worker processes it is waiting on).
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch { const t = Date.now() + ms; while (Date.now() < t) { /* spin */ } }
}

console.log('=== F07 v7.13.0 JSONL writer safety + exclusive lock (R8) ===');

// --- exclusive-lock ------------------------------------------------------
test('acquire creates the lock, release removes it (idempotent)', () => {
  const dir = mktmp();
  const lp = path.join(dir, 'x.lock');
  const release = xlock.acquire(lp);
  assert.ok(fs.existsSync(lp), 'lock file exists while held');
  release();
  assert.ok(!fs.existsSync(lp), 'lock file removed on release');
  release(); // idempotent, must not throw
});

test('withLock runs fn and always releases (even on throw)', () => {
  const dir = mktmp();
  const target = path.join(dir, 'f.jsonl');
  assert.equal(xlock.withLock(target, () => 7), 7);
  assert.ok(!fs.existsSync(target + '.lock'), 'released after success');
  assert.throws(() => xlock.withLock(target, () => { throw new Error('boom'); }));
  assert.ok(!fs.existsSync(target + '.lock'), 'released after throw');
});

test('STALE orphan lock is recovered without hanging (R8.4)', () => {
  const dir = mktmp();
  const lp = path.join(dir, 'orphan.lock');
  fs.writeFileSync(lp, 'dead-holder');
  const old = Date.now() / 1000 - 3600; // 1h old
  fs.utimesSync(lp, old, old);
  const started = Date.now();
  const release = xlock.acquire(lp, { staleMs: 5000 });
  assert.ok(Date.now() - started < 2000, 'must not hang on a stale orphan');
  release();
});

test('a FUTURE-mtime orphan lock is also reclaimed (clock-skew DoS guard)', () => {
  const dir = mktmp();
  const lp = path.join(dir, 'future.lock');
  fs.writeFileSync(lp, 'skewed-into-future');
  const future = Date.now() / 1000 + 3600; // 1h in the future
  fs.utimesSync(lp, future, future);
  const started = Date.now();
  const release = xlock.acquire(lp, { staleMs: 5000 });
  assert.ok(Date.now() - started < 2000, 'must reclaim a future-dated orphan, not hang forever');
  release();
});

test('a FRESH held lock blocks (bounded) — contention throws, no infinite wait', () => {
  const dir = mktmp();
  const lp = path.join(dir, 'busy.lock');
  fs.writeFileSync(lp, 'held'); // fresh (now), not stale
  const started = Date.now();
  assert.throws(
    () => xlock.acquire(lp, { staleMs: 60000, maxAttempts: 3, retryMs: 20 }),
    /could not acquire/,
    'a fresh contended lock must time out, not hang',
  );
  assert.ok(Date.now() - started < 2000, 'bounded retry');
});

// --- protocol sanitization ----------------------------------------------
test('safeAppendJsonl kind:protocol sanitizes detail + drops unknown keys', () => {
  const dir = mktmp();
  const f = path.join(dir, 'protocol-events.jsonl');
  const longDetail = 'x'.repeat(500) + '\nwith newline\tand tab';
  const r = sanitizer.safeAppendJsonl(f, {
    event: 'PLAN_MODE_BYPASS', phase: '2', detail: longDetail,
    NOT_ALLOWED: 'should be dropped',
  }, { kind: 'protocol' });
  assert.ok(r.ok, 'write ok');
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8').trim());
  assert.ok(parsed.detail.length <= 200, 'detail truncated to <=200');
  assert.ok(!/[\n\t\r]/.test(parsed.detail), 'control chars stripped');
  assert.equal(parsed.NOT_ALLOWED, undefined, 'unknown key dropped');
  assert.ok(r.unknownKeysDropped.includes('NOT_ALLOWED'));
});

// --- concurrency (R8.1) --------------------------------------------------
test('N concurrent workers → N*M parseable lines, none interleaved', () => {
  const dir = mktmp();
  const file = path.join(dir, 'concurrent.jsonl');
  const doneDir = path.join(dir, 'done');
  fs.mkdirSync(doneDir);
  const N = 6, M = 25;
  const sanitizerPath = path.join(ROOT, 'lib/jsonl-sanitizer.cjs');
  const worker = `
    const { safeAppendJsonl } = require(${JSON.stringify(sanitizerPath)});
    const [file, id, m, doneDir] = process.argv.slice(1);
    for (let i = 0; i < Number(m); i++) {
      safeAppendJsonl(file, { gate:'SSOT_CONFLICT', hardness:'MANDATORY', phase:'0', decision:'PASS', decided_by:'w'+id, timestamp:new Date().toISOString(), detail:'line '+id+'-'+i, confidence_impact:0 });
    }
    require('fs').writeFileSync(require('path').join(doneDir, id), 'ok');
  `;
  for (let w = 0; w < N; w++) {
    spawn(process.execPath, ['-e', worker, file, String(w), String(M), doneDir], { stdio: 'ignore' });
  }
  // Generous deadline: under heavy whole-suite load the spawned workers can be
  // scheduled slowly; 90s is well above the real work (~150 microsecond appends)
  // and stays under the runner's 180s per-test timeout.
  const deadline = Date.now() + 90000;
  while (fs.readdirSync(doneDir).length < N && Date.now() < deadline) busy(25);
  assert.equal(fs.readdirSync(doneDir).length, N, 'all workers finished');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, N * M, `expected ${N * M} lines, got ${lines.length}`);
  for (const l of lines) { JSON.parse(l); } // every line parseable (no interleave/truncation)
});

// --- R8.5: no raw append for protocol-events in the runtime path ---------
test('protocol-events route through the safe writer, not raw append (R8.5)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/codex-operational-runtime.cjs'), 'utf8');
  // appendJsonl is the ONLY protocol-events writer; it must delegate to the safe
  // writer and NOT call raw fs.appendFileSync.
  const body = src.match(/function appendJsonl\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(body, 'appendJsonl function must exist');
  assert.ok(/safeAppendJsonl/.test(body[1]), 'appendJsonl must delegate to safeAppendJsonl');
  assert.ok(!/appendFileSync/.test(body[1]), 'appendJsonl must NOT use raw fs.appendFileSync');
  // No OTHER raw fs.appendFileSync targets protocol-events.jsonl anywhere.
  assert.ok(!/fs\.appendFileSync\([^)]*protocol-events/.test(src), 'no raw append to protocol-events.jsonl');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
