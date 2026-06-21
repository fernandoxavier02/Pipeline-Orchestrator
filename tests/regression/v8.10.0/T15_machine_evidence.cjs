#!/usr/bin/env node
'use strict';

// =============================================================================
// T15 (v8.10.0) — REQ-MACHINE-EVIDENCE: PostToolUse:Bash|PowerShell collector.
// TDD RED phase. Hook-as-process tests for the NOT-YET-EXISTING hook
//   .claude/hooks/machine-evidence-hook.cjs
// registered under PostToolUse matcher Bash|PowerShell. Covers user-APPROVED
// scenarios T15-S1..S8.
//
// CONTRACT under test (design L4.1):
//   discover run; ungoverned/absent ⇒ record nothing, exit 0. Defensive read
//   (HF:28): exit_code = tool_output.exit_code ?? exitCode ?? code; stdout/stderr;
//   command = tool_input.command. Normalize + truncate to a byte cap (truncated:
//   true when exceeded). evidence_id from tool_use_id. Git diff/status/show family
//   ⇒ parse stdout for changed_files + git_observed:true; else git_observed:false
//   (explicit false, NOT an empty "no changes"). Persist under the lock into a
//   run-dir evidence ledger keyed by evidence_id. NEVER blocks (exit 0 always).
//   step-ledger-stamp's batch-files.json read is UNTOUCHED (opportunistic, not a
//   replacement).
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// The hook file does NOT exist yet. Each test spawns it as a node child process
// with a PostToolUse JSON payload (tool_input.command + tool_output exit/stdout/
// stderr) and asserts the evidence-ledger side effects. Because the script is
// absent, `node <missing>.cjs` exits non-zero with empty stdout (ENOENT). A guard
// at the top of EACH ledger-reading test (assert hookExists) converts that into a
// clear "missing hook" assertion — a valid "missing hook" RED, NOT a test bug.
// T15-S7 (never-blocks) and T15-S8 (batch-files.json untouched) are the regression
// pins; S8 reads the SHIPPED step-ledger-stamp source and passes today, guarding
// against a future structural replacement.
//
// AC-5 / Q3 note: this is a telemetry collector — there is NO deny here, so the
// AC-3 triplet does not apply (the deny it ENABLES is DEFER'd). The allow-good /
// exempt half is T15-S6 (ungoverned records nothing) + T15-S7 (never blocks).
//
// Determinism + CRLF-safety: payloads serialized once; the git-stdout sample uses
// explicit \n; the oversize payload is generated deterministically.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 't15-machine-evidence-stable-secret-0123456789abcdef';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/machine-evidence-hook.cjs');
const STEP_LEDGER_STAMP = path.join(ROOT, '.claude/hooks/step-ledger-stamp.cjs');
const { writeSignedState } = require('../../../lib/sentinel-state-signer.cjs');

function hookExists() { return fs.existsSync(HOOK); }

function seedRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r002', pipeline_active: true, task_type: 'Bug Fix', pipeline_doc_path: docDir,
    state_version: 1,
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r002', updated_at: '2026-06-21T00:00:00.000Z' }, null, 2)
  );
  return { docDir, statePath };
}

function run(payload, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...(env || {}) },
  });
}

// A PostToolUse:Bash payload. tool_output carries the documented exit_code/stdout/stderr.
function bashPayload(root, opts) {
  const o = opts || {};
  return {
    hook_event_name: 'PostToolUse',
    tool_name: o.tool_name || 'Bash',
    tool_use_id: o.tool_use_id === undefined ? 'tu-evidence' : o.tool_use_id,
    tool_input: { command: o.command || 'echo hi' },
    tool_output: {
      exit_code: o.exit_code === undefined ? 0 : o.exit_code,
      stdout: o.stdout === undefined ? '' : o.stdout,
      stderr: o.stderr === undefined ? '' : o.stderr,
    },
    cwd: root,
  };
}

// Discover the evidence ledger the hook wrote: any file under docDir that is NOT a
// known pre-existing file and whose content references our evidence_id. Returns the
// parsed entry object for `evidenceId` (searching JSON and JSONL shapes), or null.
const KNOWN_DOCDIR_FILES = new Set([
  'sentinel-state.json', 'batch-files.json', 'gate-decisions.jsonl',
  'protocol-events.jsonl', 'step-ledger.json', 'step-ledger.jsonl', 'run-log.jsonl',
  'fidelity-report.json', 'checkpoint-verdict.json',
]);
function findEvidenceEntry(docDir, evidenceId) {
  let names;
  try { names = fs.readdirSync(docDir); } catch { return null; }
  for (const name of names) {
    if (KNOWN_DOCDIR_FILES.has(name)) continue;
    const p = path.join(docDir, name);
    let raw;
    try { raw = fs.readFileSync(p, 'utf8'); } catch { continue; }
    if (!raw.includes(evidenceId)) continue;
    // Try whole-file JSON (a ledger object keyed by evidence_id).
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        if (obj[evidenceId] && typeof obj[evidenceId] === 'object') return obj[evidenceId];
        // ledger may be { entries: { id: {...} } } or an array.
        if (obj.entries && obj.entries[evidenceId]) return obj.entries[evidenceId];
        if (Array.isArray(obj)) {
          const hit = obj.find((e) => e && (e.evidence_id === evidenceId));
          if (hit) return hit;
        }
        if (obj.evidence_id === evidenceId) return obj;
      }
    } catch { /* not whole-file JSON — try JSONL */ }
    // JSONL: one entry per line.
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t);
        if (e && (e.evidence_id === evidenceId || e.id === evidenceId)) return e;
      } catch { /* skip non-JSON line */ }
    }
  }
  return null;
}

// True if the ledger recorded ANYTHING at all under docDir (for the ungoverned
// "records nothing" assertion).
function anyLedgerWritten(docDir) {
  let names;
  try { names = fs.readdirSync(docDir); } catch { return false; }
  return names.some((n) => !KNOWN_DOCDIR_FILES.has(n) && n !== 'active-run.json');
}

let pass = 0, fail = 0;
const failed = [];
function liveTest(name, fn) {
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'machine-evidence-t15-'));
    fn(dir);
    console.log(`  [PASS] ${name}`); pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name);
  } finally {
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  }
}

console.log('=== T15 v8.10.0 — machine-evidence collector (RED until .claude/hooks/machine-evidence-hook.cjs ships) ===');

// ---- T15-S1 [main] exit code 0 recorded exactly ----------------------------
liveTest('T15-S1 [main] governed Bash exit 0 → ledger entry records exit_code === 0', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK} (expected RED — collector not built yet)`);
  const { docDir } = seedRun(root);
  const r = run(bashPayload(root, { tool_use_id: 'tu-ok', command: 'npm test', exit_code: 0, stdout: 'all good' }),
    { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const entry = findEvidenceEntry(docDir, 'tu-ok');
  assert.ok(entry, 'an evidence ledger entry keyed by the evidence_id must be written');
  assert.strictEqual(entry.exit_code, 0, 'exit_code must be recorded as exactly 0');
});

// ---- T15-S2 [main] non-zero exit code recorded exactly ----------------------
liveTest('T15-S2 [main] governed Bash exit 1 → ledger entry records the actual non-zero code (not a default/zero/null)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedRun(root);
  const r = run(bashPayload(root, { tool_use_id: 'tu-fail', command: 'npm test', exit_code: 1, stderr: 'boom' }),
    { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const entry = findEvidenceEntry(docDir, 'tu-fail');
  assert.ok(entry, 'an evidence ledger entry must be written for the failing command');
  assert.strictEqual(entry.exit_code, 1, 'exit_code must be the ACTUAL non-zero code — never defaulted to 0 or null');
});

// ---- T15-S3 [main] git command → changed_files + git_observed:true ----------
liveTest('T15-S3 [main] git diff command → stdout parsed for changed_files, git_observed:true', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedRun(root);
  const gitOut = 'lib/foo.cjs\nagents/core/bar.md\n.claude/hooks/baz.cjs\n';
  const r = run(bashPayload(root, {
    tool_use_id: 'tu-git', command: 'git diff --name-only HEAD~1', exit_code: 0, stdout: gitOut,
  }), { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const entry = findEvidenceEntry(docDir, 'tu-git');
  assert.ok(entry, 'an evidence ledger entry must be written for the git command');
  assert.strictEqual(entry.git_observed, true, 'a git diff/status/show command must set git_observed:true');
  assert.ok(Array.isArray(entry.changed_files), 'changed_files must be an array parsed from the git stdout');
  assert.ok(entry.changed_files.includes('lib/foo.cjs'),
    'changed_files must contain the paths parsed from the git stdout');
});

// ---- T15-S4 [main] non-git command → git_observed:false (explicit) ----------
liveTest('T15-S4 [main] non-git command → git_observed === false (explicit, NOT an empty "no changes")', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedRun(root);
  const r = run(bashPayload(root, { tool_use_id: 'tu-nongit', command: 'node scripts/run-tests.cjs', exit_code: 0 }),
    { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr);
  const entry = findEvidenceEntry(docDir, 'tu-nongit');
  assert.ok(entry, 'an evidence ledger entry must be written for a non-git command');
  assert.strictEqual(entry.git_observed, false,
    'a non-git command must set git_observed:false EXPLICITLY — so a consumer can tell "no git seen" from "git ran, zero changes"');
});

// ---- T15-S5 [edge] oversize output → truncated:true -------------------------
liveTest('T15-S5 [edge] stdout over the byte cap → stored truncated with truncated:true (no crash, no full payload)', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedRun(root);
  const huge = 'X'.repeat(512 * 1024); // 512 KB — well past any sane cap
  const r = run(bashPayload(root, { tool_use_id: 'tu-huge', command: 'cat big.log', exit_code: 0, stdout: huge }),
    { PIPELINE_DOC_PATH: docDir });
  assert.equal(r.status, 0, r.stderr || '(oversize output crashed the collector — must not)');
  const entry = findEvidenceEntry(docDir, 'tu-huge');
  assert.ok(entry, 'an evidence ledger entry must be written even for oversize output');
  assert.strictEqual(entry.truncated, true, 'oversize output must set truncated:true');
  const storedLen = typeof entry.stdout === 'string' ? entry.stdout.length : 0;
  assert.ok(storedLen < huge.length, 'the stored stdout must be truncated, not the full oversized payload');
});

// ---- T15-S6 [allow-good / exempt — ungoverned] records nothing --------------
liveTest('T15-S6 [exempt] ungoverned run (no state) → records nothing in any ledger, exits 0', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  // A docDir-like folder with NO sentinel-state and NO pointer = ungoverned.
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const r = run(bashPayload(root, { tool_use_id: 'tu-ungoverned', command: 'echo hi', exit_code: 0 }), {});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!anyLedgerWritten(docDir),
    'an ungoverned command must record NOTHING — no evidence ledger may appear under an ungoverned run');
});

// ---- T15-S7 [allow-good — never blocks] always exits 0 ----------------------
liveTest('T15-S7 [never-blocks] across every case (exit0/exit1/git/non-git/oversize/ungoverned) the hook exits 0', (root) => {
  assert.ok(hookExists(), `hook missing: ${HOOK}`);
  const { docDir } = seedRun(root);
  const cases = [
    bashPayload(root, { tool_use_id: 'b-0', exit_code: 0 }),
    bashPayload(root, { tool_use_id: 'b-1', exit_code: 1 }),
    bashPayload(root, { tool_use_id: 'b-git', command: 'git status', stdout: 'M lib/x.cjs' }),
    bashPayload(root, { tool_use_id: 'b-non', command: 'ls -la' }),
    bashPayload(root, { tool_use_id: 'b-huge', stdout: 'Y'.repeat(300 * 1024) }),
    bashPayload(root, { tool_use_id: 'b-ung' }),
  ];
  for (const c of cases) {
    const r = run(c, { PIPELINE_DOC_PATH: docDir });
    assert.equal(r.status, 0, `the collector must NEVER exit non-zero — it is telemetry, not a gate (case: ${c.tool_use_id})`);
    // And it must not emit a block decision either.
    let out = {};
    try { out = JSON.parse(r.stdout || '{}'); } catch { /* empty stdout is fine */ }
    const blocked = out.decision === 'block'
      || (out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision === 'deny');
    assert.ok(!blocked, `the collector must never emit a block/deny decision (case: ${c.tool_use_id})`);
  }
});

// ---- T15-S8 [regression] step-ledger-stamp batch-files.json read untouched --
// Source-level regression pin (passes today, must keep passing): the SHIPPED
// step-ledger-stamp.cjs still reads batch-files.json for sensitive-domain scanning
// and the machine-evidence collector writes a SEPARATE ledger. We assert the
// shipped read site is present and unchanged in shape — a structural replacement
// (deleting that read) would FAIL this pin.
liveTest('T15-S8 [regression] step-ledger-stamp still reads batch-files.json (collector is a separate ledger, not a replacement)', () => {
  const src = fs.readFileSync(STEP_LEDGER_STAMP, 'utf8');
  assert.ok(src.includes("'batch-files.json'") || src.includes('"batch-files.json"') || src.includes('batch-files.json'),
    'step-ledger-stamp.cjs must STILL read batch-files.json — the machine-evidence collector is opportunistic, ' +
    'NOT a replacement of the shipped batch-files SSOT read (step-ledger-stamp.cjs:154-159)');
  assert.ok(src.includes('recordDomainsTouched'),
    'the shipped sensitive-domain scan over batch-files.json must remain intact (not gutted by T15)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until .claude/hooks/machine-evidence-hook.cjs ships):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
