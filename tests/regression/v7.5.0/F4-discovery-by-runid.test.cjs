#!/usr/bin/env node
// =============================================================================
// F4 — State discovery by PIPELINE_RUN_ID (REQ-C-1, REQ-C-2, REQ-C-3)
// =============================================================================
// Spec: .kiro/specs/tracing-concurrent-execution-id/
// Covers:
//   REQ-C-1: discovery selects active state file by runId, not by mtime
//   REQ-C-2: when two state files coexist and PIPELINE_RUN_ID matches one,
//            discovery returns the match (NOT the mtime-newest)
//   REQ-C-3: when no candidate matches (or env-var absent), discovery falls
//            back to mtime-newest AND emits an AUDIT event
//
// Mechanism: build a temp .pipeline/docs/Pre-Medium-action/<run>/ tree with
// two state files, point PIPELINE_RUN_ID at one of them, then exercise BOTH
// sentinel-hook.discoverStatePath() and stop-hook.findActiveRunFolder() in
// a child process whose cwd is the temp tree.
// =============================================================================

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SENTINEL_HOOK = path.join(ROOT, '.claude', 'hooks', 'sentinel-hook.cjs');
const STOP_HOOK = path.join(ROOT, '.claude', 'hooks', 'stop-hook.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg || ''}`); }
}

function makeTempCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-f4-'));
}

function rimraf(p) {
  try {
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const child of fs.readdirSync(p)) rimraf(path.join(p, child));
      fs.rmdirSync(p);
    } else {
      fs.unlinkSync(p);
    }
  } catch (_e) { /* best-effort */ }
}

// Build a faux .pipeline/docs tree with two runs. runA is newer (mtime); runB
// is older. Returns { runADir, runBDir, runAId, runBId, statePathA, statePathB }.
function buildTwoStateTree(cwd) {
  const docs = path.join(cwd, '.pipeline', 'docs', 'Pre-Medium-action');
  fs.mkdirSync(docs, { recursive: true });

  const runAId = '001-aaaaaaaaaaaaaa-feature-a';
  const runBId = '002-bbbbbbbbbbbbbb-feature-b';
  const runADir = path.join(docs, '2026-05-22-feature-a');
  const runBDir = path.join(docs, '2026-05-22-feature-b');
  fs.mkdirSync(runADir, { recursive: true });
  fs.mkdirSync(runBDir, { recursive: true });

  const statePathA = path.join(runADir, 'sentinel-state.json');
  const statePathB = path.join(runBDir, 'sentinel-state.json');

  // Write older run B first
  fs.writeFileSync(statePathB, JSON.stringify({
    pipeline_active: true,
    current_phase: 'init',
    expected_next: 'pipeline-controller',
    run_id: runBId,
    updated_at: '2026-05-22T00:00:00Z',
  }));
  // Force older mtime on B.
  const oldTime = new Date('2026-05-20T00:00:00Z');
  fs.utimesSync(statePathB, oldTime, oldTime);

  // Write newer run A
  fs.writeFileSync(statePathA, JSON.stringify({
    pipeline_active: true,
    current_phase: 'init',
    expected_next: 'pipeline-controller',
    run_id: runAId,
    updated_at: '2026-05-22T01:00:00Z',
  }));
  const newTime = new Date('2026-05-22T01:00:00Z');
  fs.utimesSync(statePathA, newTime, newTime);

  return { runAId, runBId, runADir, runBDir, statePathA, statePathB };
}

function runSentinelDiscovery(cwd, env) {
  const script = `
'use strict';
const { discoverStatePath } = require(${JSON.stringify(SENTINEL_HOOK)});
process.stdout.write(JSON.stringify({ picked: discoverStatePath() || null }) + '\\n');
`;
  return spawnSync(process.execPath, ['-e', script], {
    cwd,
    env: { ...process.env, PIPELINE_DOC_PATH: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10000,
  });
}

function runStopDiscovery(cwd, env) {
  const script = `
'use strict';
const { findActiveRunFolder } = require(${JSON.stringify(STOP_HOOK)});
process.stdout.write(JSON.stringify({ picked: findActiveRunFolder(process.cwd()) || null }) + '\\n');
`;
  return spawnSync(process.execPath, ['-e', script], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// Sentinel hook scenarios
// ---------------------------------------------------------------------------
(function sentinelHookSuite() {
  const cwd = makeTempCwd();
  try {
    const tree = buildTwoStateTree(cwd);

    // S1: PIPELINE_RUN_ID points to OLDER runB → match wins over mtime.
    const r1 = runSentinelDiscovery(cwd, { PIPELINE_RUN_ID: tree.runBId });
    if (r1.status !== 0) {
      record('sentinel S1 child exits ok', false, `status=${r1.status} stderr=${r1.stderr}`);
    } else {
      const j = JSON.parse(r1.stdout.trim());
      record('sentinel S1 picks runId-match (older B) over mtime-newest (A)',
        j.picked === tree.statePathB,
        `picked=${j.picked} expected=${tree.statePathB}`);
    }

    // S2: PIPELINE_RUN_ID points to newer runA — also matches (sanity).
    const r2 = runSentinelDiscovery(cwd, { PIPELINE_RUN_ID: tree.runAId });
    if (r2.status === 0) {
      const j = JSON.parse(r2.stdout.trim());
      record('sentinel S2 picks runId-match (A)',
        j.picked === tree.statePathA,
        `picked=${j.picked}`);
    } else {
      record('sentinel S2 child exits ok', false, `status=${r2.status} stderr=${r2.stderr}`);
    }

    // S3: PIPELINE_RUN_ID absent → mtime fallback (newest = A) + AUDIT.
    const r3 = runSentinelDiscovery(cwd, { PIPELINE_RUN_ID: '' });
    if (r3.status === 0) {
      const j = JSON.parse(r3.stdout.trim());
      record('sentinel S3 falls back to mtime-newest (A) when env absent',
        j.picked === tree.statePathA,
        `picked=${j.picked}`);
      const auditOk = (r3.stderr || '').includes('DISCOVERY_MTIME_FALLBACK')
        || (r3.stderr || '').includes('DISCOVERY_RUN_ID_NO_MATCH');
      record('sentinel S3 emits AUDIT on mtime fallback',
        auditOk, `stderr=${r3.stderr}`);
    } else {
      record('sentinel S3 child exits ok', false, `status=${r3.status} stderr=${r3.stderr}`);
    }

    // S4: PIPELINE_RUN_ID set but does not match any candidate → AUDIT + fallback.
    const r4 = runSentinelDiscovery(cwd, { PIPELINE_RUN_ID: '999-ghost-id-zzz' });
    if (r4.status === 0) {
      const j = JSON.parse(r4.stdout.trim());
      record('sentinel S4 ghost runId falls back to mtime',
        j.picked === tree.statePathA,
        `picked=${j.picked}`);
      const auditOk = (r4.stderr || '').includes('DISCOVERY_RUN_ID_NO_MATCH');
      record('sentinel S4 emits DISCOVERY_RUN_ID_NO_MATCH',
        auditOk, `stderr=${r4.stderr}`);
    }
  } finally {
    rimraf(cwd);
  }
})();

// ---------------------------------------------------------------------------
// Stop hook scenarios — analogous, returns the *run folder*, not the state file.
// ---------------------------------------------------------------------------
(function stopHookSuite() {
  const cwd = makeTempCwd();
  try {
    const tree = buildTwoStateTree(cwd);

    // S1: PIPELINE_RUN_ID matches older runB → wins over mtime.
    const r1 = runStopDiscovery(cwd, { PIPELINE_RUN_ID: tree.runBId });
    if (r1.status === 0) {
      const j = JSON.parse(r1.stdout.trim());
      record('stop S1 picks runId-match folder (B) over mtime-newest (A)',
        j.picked === tree.runBDir,
        `picked=${j.picked} expected=${tree.runBDir}`);
    } else {
      record('stop S1 child exits ok', false, `status=${r1.status} stderr=${r1.stderr}`);
    }

    // S2: env absent → mtime fallback.
    const r2 = runStopDiscovery(cwd, { PIPELINE_RUN_ID: '' });
    if (r2.status === 0) {
      const j = JSON.parse(r2.stdout.trim());
      record('stop S2 falls back to mtime-newest folder when env absent',
        j.picked === tree.runADir,
        `picked=${j.picked}`);
    }
  } finally {
    rimraf(cwd);
  }
})();

console.log(results.join('\n'));
console.log(`\nF4 summary: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
