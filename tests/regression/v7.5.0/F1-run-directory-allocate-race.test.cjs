#!/usr/bin/env node
// =============================================================================
// F1 — RunDirectory.allocate race resistance (REQ-A-1 .. REQ-A-4)
// =============================================================================
// Spec: .kiro/specs/tracing-concurrent-execution-id/
// Covers: REQ-A-2 (concurrent allocations produce distinct ids), REQ-A-3 (retry
// loop), REQ-A-4 (no idempotent mkdir on primary create), REQ-INV-2
// (PIPELINE_RUN_ID propagation to process.env).
//
// Forks N child processes that each call RunDirectory.allocate on the SAME
// rootDir + prompt and prints a JSON summary line. Parent then asserts
// distinctness + env propagation + static no-recursive-true on primary mkdir.
// =============================================================================

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const RUN_DIR_MODULE = path.join(ROOT, 'lib', 'run-directory.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg || ''}`); }
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-f1-'));
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

function buildChildScript() {
  return `
'use strict';
const { RunDirectory } = require(${JSON.stringify(RUN_DIR_MODULE)});
const rootDir = process.argv[1];
const prompt = process.argv[2];
const rd = RunDirectory.allocate(rootDir, prompt);
process.stdout.write(JSON.stringify({
  runId: rd.runId,
  absPath: rd.absPath,
  pipelineRunId: process.env.PIPELINE_RUN_ID || null,
}) + '\\n');
`;
}

function spawnAllocator(rootDir, prompt) {
  return spawnSync(process.execPath, ['-e', buildChildScript(), '--', rootDir, prompt], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 15000,
  });
}

function spawnAllocatorAsync(rootDir, prompt) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ['-e', buildChildScript(), '--', rootDir, prompt], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', d => { stdout += d.toString(); });
    c.stderr.on('data', d => { stderr += d.toString(); });
    c.on('close', code => resolve({ status: code, stdout, stderr }));
    c.on('error', err => resolve({ status: -1, stdout, stderr: stderr + String(err) }));
  });
}

// ---------------------------------------------------------------------------
// Scenario 1: serial baseline
// ---------------------------------------------------------------------------
function scenario1Serial() {
  const root = makeTempRoot();
  try {
    const a = spawnAllocator(root, 'serial allocation baseline');
    const b = spawnAllocator(root, 'serial allocation baseline');
    if (a.status !== 0 || b.status !== 0) {
      record('S1 serial baseline exit codes', false,
        `a.status=${a.status} b.status=${b.status} a.stderr=${a.stderr || ''} b.stderr=${b.stderr || ''}`);
      return;
    }
    const sa = JSON.parse(a.stdout.trim());
    const sb = JSON.parse(b.stdout.trim());
    record('S1 serial distinct runIds', sa.runId !== sb.runId,
      `runIds collided: ${sa.runId}`);
    record('S1 both manifests exist',
      fs.existsSync(path.join(sa.absPath, 'manifest.yaml')) &&
      fs.existsSync(path.join(sb.absPath, 'manifest.yaml')),
      `manifests missing`);
    record('S1 PIPELINE_RUN_ID propagated == runId (a)',
      sa.pipelineRunId === sa.runId,
      `env.PIPELINE_RUN_ID=${sa.pipelineRunId} runId=${sa.runId}`);
    record('S1 PIPELINE_RUN_ID propagated == runId (b)',
      sb.pipelineRunId === sb.runId,
      `env.PIPELINE_RUN_ID=${sb.pipelineRunId} runId=${sb.runId}`);
  } finally {
    rimraf(root);
  }
}

// ---------------------------------------------------------------------------
// Scenario 2: concurrent race — 4 parallel children, same rootDir + prompt.
// ---------------------------------------------------------------------------
async function scenario2Race() {
  const root = makeTempRoot();
  const N = 4;
  try {
    const tasks = [];
    for (let i = 0; i < N; i++) {
      tasks.push(spawnAllocatorAsync(root, 'race allocation prompt'));
    }
    const settled = await Promise.all(tasks);

    const badExits = settled.filter(s => s.status !== 0);
    if (badExits.length > 0) {
      record('S2 race exit codes all 0', false,
        `non-zero: ${JSON.stringify(settled.map(s => ({ status: s.status, stderr: s.stderr })))}`);
      return;
    }

    let summaries;
    try {
      summaries = settled.map(s => JSON.parse(s.stdout.trim()));
    } catch (e) {
      record('S2 race child stdout parseable', false,
        `parse error: ${e.message}; raw=${JSON.stringify(settled.map(s => s.stdout))}`);
      return;
    }

    const runIds = new Set(summaries.map(s => s.runId));
    record('S2 race produced N distinct runIds',
      runIds.size === N,
      `${runIds.size}/${N} unique — ${JSON.stringify([...runIds])}`);

    const absPaths = new Set(summaries.map(s => s.absPath));
    record('S2 race produced N distinct directories',
      absPaths.size === N,
      `${absPaths.size}/${N} unique`);

    const allManifestsExist = summaries.every(s =>
      fs.existsSync(path.join(s.absPath, 'manifest.yaml')));
    record('S2 race every dir carries manifest.yaml',
      allManifestsExist, `at least one manifest missing`);

    const allEnvMatch = summaries.every(s => s.pipelineRunId === s.runId);
    record('S2 race every child env.PIPELINE_RUN_ID == its runId',
      allEnvMatch,
      `env propagation mismatch in ${JSON.stringify(summaries)}`);

    const allContained = summaries.every(s => s.absPath.startsWith(root));
    record('S2 race all paths contained in root', allContained,
      `containment violation`);

    // REQ-A-2 also: every manifest.yaml carries its own run_id (no cross-write).
    // RunManifest.toYaml quotes string values (`run_id: "..."`).
    const manifestsCarryOwnId = summaries.every(s => {
      const body = fs.readFileSync(path.join(s.absPath, 'manifest.yaml'), 'utf8');
      return body.includes(`run_id: "${s.runId}"`);
    });
    record('S2 race each manifest references its own run_id',
      manifestsCarryOwnId,
      `at least one manifest references the wrong run_id`);
  } finally {
    rimraf(root);
  }
}

// ---------------------------------------------------------------------------
// Scenario 3: REQ-A-4 — primary mkdir must NOT be {recursive: true}.
// Static check on the module body inside `static allocate`.
// ---------------------------------------------------------------------------
function scenario3PrimaryExclusive() {
  const src = fs.readFileSync(RUN_DIR_MODULE, 'utf8');
  const allocStart = src.indexOf('static allocate');
  if (allocStart === -1) {
    record('S3 primary allocate uses exclusive create', false,
      'static allocate not found in module');
    return;
  }
  // Body = from "static allocate" to the next module.exports or class close.
  const body = src.slice(allocStart);
  const hasExclusive = /mkdirSync\s*\([^,)]+,\s*\{\s*recursive:\s*false\s*\}\s*\)/.test(body)
    || /openSync\s*\([^,]+,\s*['"]wx['"]/.test(body);
  record('S3 primary allocate uses exclusive create',
    hasExclusive,
    'no exclusive mkdir(recursive:false)/openSync(wx) found in RunDirectory.allocate body');
}

(async function main() {
  scenario1Serial();
  await scenario2Race();
  scenario3PrimaryExclusive();
  console.log(results.join('\n'));
  console.log(`\nF1 summary: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
