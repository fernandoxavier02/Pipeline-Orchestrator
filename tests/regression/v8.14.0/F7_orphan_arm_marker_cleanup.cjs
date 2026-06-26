#!/usr/bin/env node
'use strict';

// =============================================================================
// F7 — Lote 4 / Point 7b: orphan arm-marker self-clear on SessionStart
// =============================================================================
// A fresh session must not inherit a prior session's EXPIRED arm-pending marker.
// Conservative: ONLY expired (or undated/unreadable) markers are removed; a fresh
// marker is left alone (it may belong to a command issued this session).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hook = require(path.join(__dirname, '..', '..', '..', '.claude', 'hooks', 'cleanup-orphan-sentinel-state-hook.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }

function seedMarker(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f7-'));
  const p = path.join(dir, '.pipeline', 'pipeline-arm-pending.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (content !== undefined) fs.writeFileSync(p, content);
  return { dir, p };
}
const NOW = Date.parse('2026-06-26T12:00:00.000Z');

// Expired marker → removed.
{
  const { dir, p } = seedMarker(JSON.stringify({ requested_at: '2020-01-01T00:00:00.000Z', workflow: 'FULL' }));
  const r = hook.cleanupExpiredArmMarker(dir, { now: NOW });
  check('marcador EXPIRADO → removed', r === 'removed');
  check('marcador expirado foi de fato apagado', !fs.existsSync(p));
  fs.rmSync(dir, { recursive: true, force: true });
}
// Fresh marker → live (NOT removed).
{
  const { dir, p } = seedMarker(JSON.stringify({ requested_at: '2026-06-26T11:59:00.000Z', workflow: 'FULL' }));
  const r = hook.cleanupExpiredArmMarker(dir, { now: NOW });
  check('marcador FRESCO → live (preservado)', r === 'live');
  check('marcador fresco continua no lugar', fs.existsSync(p));
  fs.rmSync(dir, { recursive: true, force: true });
}
// Undated / unreadable marker → removed (defensive).
{
  const { dir, p } = seedMarker('{ this is not valid json');
  const r = hook.cleanupExpiredArmMarker(dir, { now: NOW });
  check('marcador ILEGIVEL → removed (defensivo)', r === 'removed' && !fs.existsSync(p));
  fs.rmSync(dir, { recursive: true, force: true });
}
// Absent marker → absent (no-op).
{
  const { dir } = seedMarker(undefined);
  check('marcador AUSENTE → absent (no-op)', hook.cleanupExpiredArmMarker(dir, { now: NOW }) === 'absent');
  fs.rmSync(dir, { recursive: true, force: true });
}
// Custom TTL honored.
{
  const { dir } = seedMarker(JSON.stringify({ requested_at: '2026-06-26T11:50:00.000Z' })); // 10 min old
  check('TTL custom 5min → marcador de 10min expira (removed)', hook.cleanupExpiredArmMarker(dir, { now: NOW, ttlMs: 5 * 60 * 1000 }) === 'removed');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n>>> F7 PASS' : `\n>>> F7 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
