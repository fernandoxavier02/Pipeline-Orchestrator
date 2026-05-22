#!/usr/bin/env node
// =============================================================================
// F3 — Langfuse span carrier keyed by PIPELINE_RUN_ID (REQ-B-1..REQ-B-4)
// =============================================================================
// Mirror of F2 for the span carrier. Asserts getSpanPath(runId, ppidFallback)
// honors runId, distinguishes two concurrent processes sharing PPID, and
// emits AUDIT CARRIER_PPID_FALLBACK kind=span when runId absent.
// =============================================================================

'use strict';

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
  const script = `
'use strict';
const { getSpanPath } = require(${JSON.stringify(CARRIER)});
const runId = process.env.PIPELINE_RUN_ID || null;
const ppid  = parseInt(process.env.PROBE_PPID_FALLBACK || '', 10) || null;
const p = getSpanPath(runId, ppid);
process.stdout.write(JSON.stringify({ spanPath: p, runId, ppid }) + '\\n');
`;
  return spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10000,
  });
}

(function s1RunIdDistinct() {
  const ppid = 99101;
  const a = runProbe({ PIPELINE_RUN_ID: '001-aaaaaaaaaaaaaa-slug', PROBE_PPID_FALLBACK: String(ppid) });
  const b = runProbe({ PIPELINE_RUN_ID: '002-bbbbbbbbbbbbbb-slug', PROBE_PPID_FALLBACK: String(ppid) });
  if (a.status !== 0 || b.status !== 0) {
    record('S1 probes succeed', false,
      `a.status=${a.status} b.status=${b.status} a.stderr=${a.stderr || ''} b.stderr=${b.stderr || ''}`);
    return;
  }
  const ja = JSON.parse(a.stdout.trim());
  const jb = JSON.parse(b.stdout.trim());
  record('S1 span paths distinct under same ppid',
    ja.spanPath !== jb.spanPath,
    `both=${ja.spanPath}`);
  record('S1 span path A includes runId A',
    ja.spanPath.includes('001-aaaaaaaaaaaaaa-slug'), ja.spanPath);
  record('S1 span path B includes runId B',
    jb.spanPath.includes('002-bbbbbbbbbbbbbb-slug'), jb.spanPath);
})();

(function s2PpidFallback() {
  const ppid = 99102;
  const r = runProbe({ PIPELINE_RUN_ID: '', PROBE_PPID_FALLBACK: String(ppid) });
  if (r.status !== 0) {
    record('S2 probe succeeds', false, `status=${r.status} stderr=${r.stderr}`);
    return;
  }
  const j = JSON.parse(r.stdout.trim());
  record('S2 span path falls back to PPID',
    j.spanPath.includes(`${ppid}`), j.spanPath);
  record('S2 fallback emits AUDIT CARRIER_PPID_FALLBACK',
    (r.stderr || '').includes('CARRIER_PPID_FALLBACK'), `stderr=${r.stderr}`);

  const lines = (r.stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
  const auditLines = lines.filter(l => l.startsWith('{') && l.includes('CARRIER_PPID_FALLBACK'));
  let auditOk = false;
  for (const line of auditLines) {
    try {
      const obj = JSON.parse(line);
      if (obj.audit_event === 'CARRIER_PPID_FALLBACK'
          && obj.kind === 'span'
          && (obj.ppid === ppid || obj.ppidFallback === ppid || obj.ppid === String(ppid))) {
        auditOk = true; break;
      }
    } catch (_e) { /* ignore */ }
  }
  record('S2 AUDIT payload includes kind=span and ppid',
    auditOk, `stderr=${r.stderr}`);
})();

console.log(results.join('\n'));
console.log(`\nF3 summary: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
