#!/usr/bin/env node
/**
 * D9 regression — orphan sentinel-state cleanup contract present in sentinel.md
 *
 * Audit evidence: B1-001 CRITICAL (2026-05-15) — 9-day-old wave8-spec sentinel-state
 * blocked v5.3.0 audit run because pipeline_active: true + no TTL/auto-cleanup.
 *
 * This test asserts that sentinel.md declares the ORPHAN_CLEANUP mode contract.
 * Behavioral validation requires hook implementation (D9-extension).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const TARGET = path.join(ROOT, 'agents/core/sentinel.md');

const PATTERNS = [
  { label: 'declares ORPHAN_CLEANUP mode', pattern: /ORPHAN[\s_]CLEANUP/i },
  { label: 'mentions 24h TTL threshold',  pattern: /24h|24\s*hours?/i },
  { label: 'mentions pipeline_active orphan criterion', pattern: /pipeline_active/i },
  { label: 'mentions last_updated TTL check', pattern: /last_updated/i },
  { label: 'cites audit B1-001',          pattern: /B1[\s-]?001/i },
  { label: 'documents archive action',    pattern: /archive/i },
  { label: 'mentions lock file pattern (D9-extension)', pattern: /lock\s*file/i },
];

if (!fs.existsSync(TARGET)) {
  console.error('FAIL: sentinel.md not found');
  process.exit(1);
}
const content = fs.readFileSync(TARGET, 'utf8');
let failures = [];
for (const p of PATTERNS) {
  if (!p.pattern.test(content)) failures.push(p.label);
}
console.log('=== D9 regression — orphan cleanup contract in sentinel.md ===');
if (failures.length === 0) {
  console.log('  [PASS] sentinel.md declares ORPHAN_CLEANUP mode + TTL + audit reference');
  process.exit(0);
}
console.log('  [FAIL] missing:');
for (const f of failures) console.log(`         - ${f}`);
process.exit(1);
