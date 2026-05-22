#!/usr/bin/env node
// =============================================================================
// F2 — Langfuse trace carrier keyed by PIPELINE_RUN_ID (REQ-B-1..REQ-B-4)
// =============================================================================
// Spec: .kiro/specs/tracing-concurrent-execution-id/
// Covers REQ-B-1 (trace carrier keyed by runId), REQ-B-2 (two processes with
// the same PPID write to two distinct trace carriers when PIPELINE_RUN_ID
// differs), REQ-B-3 (env-var preferred when present), REQ-B-4 (fallback to
// PPID emits AUDIT CARRIER_PPID_FALLBACK).
//
// All file paths land in os.tmpdir() so test cleanup is straightforward.
// =============================================================================

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CARRIER = path.join(ROOT, 'lib', 'langfuse-carrier.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg || ''}`); }
}

function runProbe(env) {
  // Spawn a child that imports the carrier and asks for the trace path the
  // module would use, returning JSON on stdout. AUDIT events surface on stderr.
  const script = `
'use strict';
const { getTracePath } = require(${JSON.stringify(CARRIER)});
const runId = process.env.PIPELINE_RUN_ID || null;
const ppid  = parseInt(process.env.PROBE_PPID_FALLBACK || '', 10) || null;
const p = getTracePath(runId, ppid);
process.stdout.write(JSON.stringify({ tracePath: p, runId, ppid }) + '\\n');
`;
  return spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// S1 — two processes with the SAME ppid + DIFFERENT runIds produce distinct
// carrier paths (REQ-B-2 + REQ-B-3).
// ---------------------------------------------------------------------------
(function s1RunIdDistinct() {
  const ppid = 99001;
  const a = runProbe({ PIPELINE_RUN_ID: '001-aaaaaaaaaaaaaa-slug', PROBE_PPID_FALLBACK: String(ppid) });
  const b = runProbe({ PIPELINE_RUN_ID: '002-bbbbbbbbbbbbbb-slug', PROBE_PPID_FALLBACK: String(ppid) });
  if (a.status !== 0 || b.status !== 0) {
    record('S1 probes succeed', false,
      `a.status=${a.status} b.status=${b.status} a.stderr=${a.stderr || ''} b.stderr=${b.stderr || ''}`);
    return;
  }
  const ja = JSON.parse(a.stdout.trim());
  const jb = JSON.parse(b.stdout.trim());
  record('S1 trace paths distinct under same ppid',
    ja.tracePath !== jb.tracePath,
    `both=${ja.tracePath}`);
  record('S1 trace path A includes runId A',
    ja.tracePath.includes('001-aaaaaaaaaaaaaa-slug'),
    ja.tracePath);
  record('S1 trace path B includes runId B',
    jb.tracePath.includes('002-bbbbbbbbbbbbbb-slug'),
    jb.tracePath);
  record('S1 no AUDIT CARRIER_PPID_FALLBACK on A (runId present)',
    !(a.stderr || '').includes('CARRIER_PPID_FALLBACK'),
    `stderr=${a.stderr}`);
  record('S1 no AUDIT CARRIER_PPID_FALLBACK on B (runId present)',
    !(b.stderr || '').includes('CARRIER_PPID_FALLBACK'),
    `stderr=${b.stderr}`);
})();

// ---------------------------------------------------------------------------
// S2 — without PIPELINE_RUN_ID, fallback to PPID with AUDIT (REQ-B-4).
// ---------------------------------------------------------------------------
(function s2PpidFallback() {
  const ppid = 99002;
  const r = runProbe({ PIPELINE_RUN_ID: '', PROBE_PPID_FALLBACK: String(ppid) });
  if (r.status !== 0) {
    record('S2 probe succeeds', false, `status=${r.status} stderr=${r.stderr}`);
    return;
  }
  const j = JSON.parse(r.stdout.trim());
  record('S2 trace path falls back to PPID',
    j.tracePath.includes(`${ppid}`),
    j.tracePath);
  record('S2 fallback emits AUDIT CARRIER_PPID_FALLBACK',
    (r.stderr || '').includes('CARRIER_PPID_FALLBACK'),
    `stderr=${r.stderr}`);
  // The AUDIT payload should be JSON and include kind=trace + ppid value.
  const lines = (r.stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
  const auditLines = lines.filter(l => l.startsWith('{') && l.includes('CARRIER_PPID_FALLBACK'));
  let auditOk = false;
  for (const line of auditLines) {
    try {
      const obj = JSON.parse(line);
      if (obj.audit_event === 'CARRIER_PPID_FALLBACK'
          && obj.kind === 'trace'
          && (obj.ppid === ppid || obj.ppidFallback === ppid || obj.ppid === String(ppid))) {
        auditOk = true; break;
      }
    } catch (_e) { /* ignore */ }
  }
  record('S2 AUDIT payload includes kind=trace and ppid',
    auditOk, `stderr=${r.stderr}`);
})();

// ---------------------------------------------------------------------------
// S3 — runId precedence: env-var wins over PPID fallback (REQ-B-3 sticky).
// ---------------------------------------------------------------------------
(function s3RunIdPrecedence() {
  const ppid = 99003;
  const r = runProbe({ PIPELINE_RUN_ID: '003-ccccccccccccccc-slug', PROBE_PPID_FALLBACK: String(ppid) });
  if (r.status !== 0) {
    record('S3 probe succeeds', false, `status=${r.status} stderr=${r.stderr}`);
    return;
  }
  const j = JSON.parse(r.stdout.trim());
  record('S3 runId wins over ppid in path',
    j.tracePath.includes('003-ccccccccccccccc-slug') && !j.tracePath.includes(`-${ppid}.`),
    j.tracePath);
})();

console.log(results.join('\n'));
console.log(`\nF2 summary: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
