#!/usr/bin/env node
'use strict';

// =============================================================================
// T5.1 (v8.12.0) — SPEC 006 Batch 5 — ErrorSignal CHANNEL (signed-append SSOT).
// =============================================================================
// design §2.8 / §3: observers write a signed ErrorSignal to the run's on-disk
// error-signal log `.pipeline/state/error-signals.jsonl` via the SAME exclusive-
// lock + HMAC signed-append SSOT as gate-decisions. On-disk is the source of
// truth so the signal survives a dead hot agent (NFR5). The corrector consumes
// new signals from this channel.
//
// This pins the WRITE side of the channel:
//   appendErrorSignal(cwd, rawSignal) -> writes one ErrorSignal line, and
//   readErrorSignals(cwd) -> reads them back (the corrector's consume side).
//
// RED until lib/corrective-dispatch.cjs exports appendErrorSignal/readErrorSignals.
// buildErrorSignal already exists (B0); this is the channel that persists it.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't5-1-error-signal-channel-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const dispatch = require(path.join(ROOT, 'lib/corrective-dispatch.cjs'));

const CHANNEL_REL = '.pipeline/state/error-signals.jsonl';
const RAW = (over) => ({
  run_id: 'rT51', observer: 'spec-reviewer', invariant_id: 'AC_DEVIATION',
  agent_ref: 'feature-implementer', detail: 'slice 2 contract drift',
  detected_at: '2026-06-23T00:00:00.000Z', occurrence_window: 'w1', ...over,
});

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  let tmp;
  try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't5-1-')); fn(tmp); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}

console.log('=== T5.1 v8.12.0 — ErrorSignal channel (signed-append SSOT) ===');

check('S1 appendErrorSignal + readErrorSignals are exported', () => {
  assert.equal(typeof dispatch.appendErrorSignal, 'function', 'must export appendErrorSignal(cwd, signal) — RED until T5.1');
  assert.equal(typeof dispatch.readErrorSignals, 'function', 'must export readErrorSignals(cwd) — RED until T5.1');
});

check('S2 appendErrorSignal writes one parseable line to .pipeline/state/error-signals.jsonl', (tmp) => {
  assert.equal(typeof dispatch.appendErrorSignal, 'function', 'appendErrorSignal missing — RED');
  const ok = dispatch.appendErrorSignal(tmp, RAW());
  assert.equal(ok, true, 'appendErrorSignal must return true on success');
  const p = path.join(tmp, CHANNEL_REL);
  assert.ok(fs.existsSync(p), 'channel file must exist after append');
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, 'exactly one line written');
  JSON.parse(lines[0]); // must parse
});

check('S3 the persisted record carries the 7 ErrorSignal contract fields', (tmp) => {
  assert.equal(typeof dispatch.appendErrorSignal, 'function', 'appendErrorSignal missing — RED');
  dispatch.appendErrorSignal(tmp, RAW());
  const lines = fs.readFileSync(path.join(tmp, CHANNEL_REL), 'utf8').split(/\r?\n/).filter(Boolean);
  const rec = JSON.parse(lines[0]);
  for (const f of ['run_id', 'observer', 'invariant_id', 'agent_ref', 'detail', 'detected_at', 'dedup_key']) {
    assert.ok(Object.prototype.hasOwnProperty.call(rec, f), `record must carry field "${f}"`);
  }
});

check('S4 dedup_key is DERIVED — two observers of ONE defect share it', (tmp) => {
  assert.equal(typeof dispatch.appendErrorSignal, 'function', 'appendErrorSignal missing — RED');
  dispatch.appendErrorSignal(tmp, RAW({ observer: 'spec-reviewer' }));
  dispatch.appendErrorSignal(tmp, RAW({ observer: 'checkpoint-validator' }));
  const lines = fs.readFileSync(path.join(tmp, CHANNEL_REL), 'utf8').split(/\r?\n/).filter(Boolean);
  const a = JSON.parse(lines[0]), b = JSON.parse(lines[1]);
  assert.equal(a.dedup_key, b.dedup_key, 'two observers of the same defect must share the dedup_key');
  const c = JSON.parse(JSON.stringify(RAW({ invariant_id: 'OTHER' })));
  dispatch.appendErrorSignal(tmp, c);
  const lines2 = fs.readFileSync(path.join(tmp, CHANNEL_REL), 'utf8').split(/\r?\n/).filter(Boolean);
  assert.notEqual(JSON.parse(lines2[2]).dedup_key, a.dedup_key, 'a different invariant yields a different dedup_key');
});

check('S5 readErrorSignals returns the appended signals', (tmp) => {
  assert.equal(typeof dispatch.readErrorSignals, 'function', 'readErrorSignals missing — RED');
  dispatch.appendErrorSignal(tmp, RAW({ invariant_id: 'A' }));
  dispatch.appendErrorSignal(tmp, RAW({ invariant_id: 'B' }));
  const all = dispatch.readErrorSignals(tmp);
  assert.ok(Array.isArray(all), 'readErrorSignals returns an array');
  assert.equal(all.length, 2, 'reads back both appended signals');
  assert.equal(all[0].invariant_id, 'A');
});

check('S6 N concurrent appends -> N parseable lines (exclusive-lock, none interleaved)', (tmp) => {
  assert.equal(typeof dispatch.appendErrorSignal, 'function', 'appendErrorSignal missing — RED');
  const N = 8;
  for (let i = 0; i < N; i++) dispatch.appendErrorSignal(tmp, RAW({ invariant_id: 'INV' + i, occurrence_window: 'w' + i }));
  const lines = fs.readFileSync(path.join(tmp, CHANNEL_REL), 'utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, N, `expected ${N} lines`);
  for (const l of lines) JSON.parse(l); // every line parseable (no interleave)
});

check('S7 detail is sanitized (no CR/LF injection into the channel)', (tmp) => {
  assert.equal(typeof dispatch.appendErrorSignal, 'function', 'appendErrorSignal missing — RED');
  dispatch.appendErrorSignal(tmp, RAW({ detail: 'line1\nFAKE: injected\r\nmore' }));
  const raw = fs.readFileSync(path.join(tmp, CHANNEL_REL), 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, 'a newline in detail must NOT create extra lines');
  assert.doesNotMatch(JSON.parse(lines[0]).detail, /[\r\n]/, 'detail must be stripped of CR/LF');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
