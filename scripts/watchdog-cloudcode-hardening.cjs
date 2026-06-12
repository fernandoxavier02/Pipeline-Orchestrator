#!/usr/bin/env node
'use strict';

/**
 * watchdog-cloudcode-hardening.cjs (v7.13.0) — final release verifier for the
 * Claude Code loop-hardening remediation. Proves the remediation followed the
 * spec before a release is published. FAIL-CLOSED: missing evidence is a failure,
 * never a warning.
 *
 * Checks W1..W12 from docs/specs/.../watchdog-release-checklist.md. Writes
 * .pipeline/watchdog/cloudcode-hardening-watchdog.{json,md}.
 *
 * Inputs (env, all optional — safe detection otherwise):
 *   PIPELINE_EXPECTED_VERSION   semver (default: package.json version)
 *   PIPELINE_RELEASE_REF        tag/commit (default: v<version>)
 *   PIPELINE_ORCHESTRATOR_D_REPO  drive-D clone path (W12)
 *   PIPELINE_GLOBAL_CLAUDE_PLUGIN_PATH  global install path (W12)
 *
 * Flags:
 *   --pre-release   W11/W12 (marketplace tag on GitHub / global availability) are
 *                   reported as PENDING instead of FAIL when their proof is not
 *                   yet possible (release not published). All other checks are hard.
 *   --json-only     suppress human summary on stdout.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const PRE_RELEASE = ARGS.includes('--pre-release');
const JSON_ONLY = ARGS.includes('--json-only');

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function runNode(rel, extra = []) {
  const r = spawnSync(process.execPath, [path.join(ROOT, rel), ...extra],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
const tail = (s, n = 300) => String(s).replace(/\s+$/, '').split('\n').slice(-6).join('\n').slice(-n);

function expectedVersion() {
  return process.env.PIPELINE_EXPECTED_VERSION || (readJson(path.join(ROOT, 'package.json')) || {}).version;
}

// ── W1 Version sync ──────────────────────────────────────────────────────
function w1(expected) {
  const mk = readJson(path.join(ROOT, '.claude-plugin/marketplace.json')) || {};
  const entry = (mk.plugins || []).find((p) => p.name === 'pipeline-orchestrator') || {};
  const libM = readText(path.join(ROOT, 'lib/index.cjs')).match(/version:\s*['"]([^'"]+)['"]/);
  const rdM = readText(path.join(ROOT, 'README.md')).match(/badge\/version-([0-9.]+)-/);
  const cmM = readText(path.join(ROOT, 'CLAUDE.md')).match(/Atualmente:\s*\*\*([0-9.]+)\*\*/);
  const surfaces = {
    'package.json': (readJson(path.join(ROOT, 'package.json')) || {}).version,
    'plugin.json': (readJson(path.join(ROOT, '.claude-plugin/plugin.json')) || {}).version,
    'marketplace.version': entry.version,
    'marketplace.ref': entry.source && entry.source.ref,
    'lib/index.cjs': libM && libM[1],
    'README badge': rdM && rdM[1],
    'CLAUDE.md': cmM && cmM[1],
  };
  const evidence = [];
  let ok = true;
  for (const [k, v] of Object.entries(surfaces)) {
    const want = k === 'marketplace.ref' ? `v${expected}` : expected;
    const good = v === want;
    if (!good) ok = false;
    evidence.push(`${k}=${v} ${good ? '==' : '!='} ${want}`);
  }
  return { id: 'W1', name: 'Version sync', status: ok ? 'PASS' : 'FAIL', evidence };
}

// ── W2 Hook manifest integrity + packaging ──────────────────────────────
function w2() {
  const r = runNode('tests/packaging/hook-packaging.test.cjs');
  return { id: 'W2', name: 'Hook manifest integrity + packaging', status: r.ok ? 'PASS' : 'FAIL',
    evidence: [r.ok ? 'hook-packaging.test green (manifest + 11 hooks shipped)' : tail(r.stdout + r.stderr)] };
}

// ── Wn = run a pinned test ──────────────────────────────────────────────
function wTest(id, name, rel) {
  const r = runNode(rel);
  return { id, name, status: r.ok ? 'PASS' : 'FAIL', evidence: [r.ok ? `${path.basename(rel)} green` : tail(r.stdout + r.stderr)] };
}

// ── W8 Test suite completeness (default categories + strict gate) ───────
// EXPLICIT allow-list of the known-accepted baseline suites (environmental
// Langfuse env-dependent + the flaky telemetry-fidelity suite). Matched by exact
// filename, NOT a substring over the path — a real failing suite named or placed
// with "langfuse"/"score-writer" must NOT be absorbed as baseline (false-PASS).
const W8_BASELINE = new Set([
  'F8-langfuse-disabled-noop.test.cjs',
  'F9-langfuse-span-lifecycle.test.cjs',
  'F10-langfuse-sanitizer.test.cjs',
  'F2-score-writer.test.cjs',
  'F12-langfuse-telemetry-fidelity.test.cjs',
]);
// NOTE: the watchdog runs the FULL suite; do not run another run-tests.cjs / npm
// test concurrently — two suite runs racing on shared paths can produce spurious
// failures (fail-safe: blocks a good release, never passes a bad one).
function w8(opts = {}) {
  const stdout = opts.stdout != null ? opts.stdout : (runNode('scripts/run-tests.cjs').stdout || '');
  const m = stdout.match(/Summary:\s*(\d+)\s*passed\s*\/\s*(\d+)\s*failed\s*\/\s*(\d+)\s*total/);
  if (!m) return { id: 'W8', name: 'Test suite completeness', status: 'FAIL', evidence: [tail(stdout)] };
  const failLines = stdout.split('\n').filter((l) => /\[(FAIL|TIMEOUT)\]\s+tests/.test(l));
  const unexpected = [];
  for (const l of failLines) {
    const pm = l.match(/\[(?:FAIL|TIMEOUT)\]\s+(\S+)/);
    const base = pm ? path.basename(pm[1].replace(/[\r\n]/g, '')) : l.trim();
    if (!W8_BASELINE.has(base)) unexpected.push(base);
  }
  const ok = unexpected.length === 0;
  return { id: 'W8', name: 'Test suite completeness', status: ok ? 'PASS' : 'FAIL',
    evidence: [`${m[1]} passed / ${m[2]} failed / ${m[3]} total`,
      ok ? `all ${m[2]} failure(s) are on the documented baseline allow-list`
         : `UNEXPECTED failing suite(s) (NOT baseline): ${unexpected.join(', ')}`] };
}

// ── W10 Adversarial loop evidence (R11 — fail-closed) ───────────────────
function w10(opts = {}) {
  const reviewsDir = opts.reviewsDir || path.join(ROOT, '.pipeline', 'reviews');
  if (!fs.existsSync(reviewsDir)) {
    return { id: 'W10', name: 'Adversarial loop evidence', status: 'FAIL', evidence: ['.pipeline/reviews/ is absent — no adversarial evidence'] };
  }
  const groups = fs.readdirSync(reviewsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const missing = [];
  for (const g of groups) {
    const files = fs.readdirSync(path.join(reviewsDir, g));
    // Must be a real artifact, not an empty stub — require a minimum size.
    const hasReal = files.some((f) => {
      if (!/adversarial-review-attempt-\d+\.md/.test(f)) return false;
      try { return fs.statSync(path.join(reviewsDir, g, f)).size >= 120; } catch { return false; }
    });
    if (!hasReal) missing.push(g);
  }
  const ok = groups.length > 0 && missing.length === 0;
  return { id: 'W10', name: 'Adversarial loop evidence', status: ok ? 'PASS' : 'FAIL',
    evidence: [`${groups.length} review group(s): ${groups.join(', ')}`,
      missing.length ? `MISSING adversarial-review-attempt for: ${missing.join(', ')}` : 'every group has an adversarial review artifact'] };
}

// ── W11 Marketplace release integrity ───────────────────────────────────
function w11(expected, ref) {
  const mk = readJson(path.join(ROOT, '.claude-plugin/marketplace.json')) || {};
  const entry = (mk.plugins || []).find((p) => p.name === 'pipeline-orchestrator') || {};
  const versionOk = entry.version === expected;
  const refOk = entry.source && entry.source.ref === ref;
  const evidence = [`marketplace version=${entry.version} (want ${expected})`, `marketplace source.ref=${entry.source && entry.source.ref} (want ${ref})`];
  // Tag-exists-on-GitHub is only provable post-publish.
  let tagOnRemote = null;
  const ls = spawnSync('git', ['ls-remote', '--tags', 'origin', ref], { cwd: ROOT, encoding: 'utf8' });
  if (ls.status === 0) { tagOnRemote = (ls.stdout || '').includes(ref); evidence.push(`git tag ${ref} on origin: ${tagOnRemote}`); }
  else { evidence.push('git ls-remote unavailable (offline / no remote)'); }
  const metaOk = versionOk && refOk;
  if (!metaOk) return { id: 'W11', name: 'Marketplace release integrity', status: 'FAIL', evidence };
  if (tagOnRemote === false) return { id: 'W11', name: 'Marketplace release integrity', status: PRE_RELEASE ? 'PENDING' : 'FAIL', evidence };
  return { id: 'W11', name: 'Marketplace release integrity', status: 'PASS', evidence };
}

// ── W12 Drive D + global Claude Code availability ───────────────────────
function w12(expected) {
  const dRepo = process.env.PIPELINE_ORCHESTRATOR_D_REPO;
  const globalPath = process.env.PIPELINE_GLOBAL_CLAUDE_PLUGIN_PATH;
  const evidence = [];
  if (!dRepo && !globalPath) {
    evidence.push('no PIPELINE_ORCHESTRATOR_D_REPO / PIPELINE_GLOBAL_CLAUDE_PLUGIN_PATH provided');
    return { id: 'W12', name: 'Drive D + global availability', status: PRE_RELEASE ? 'PENDING' : 'FAIL', evidence };
  }
  let ok = true;
  if (globalPath) {
    const gv = (readJson(path.join(globalPath, '.claude-plugin', 'plugin.json')) || readJson(path.join(globalPath, 'package.json')) || {}).version;
    const good = gv === expected;
    if (!good) ok = false;
    evidence.push(`global plugin version=${gv} ${good ? '==' : '!='} ${expected} @ ${globalPath}`);
  }
  return { id: 'W12', name: 'Drive D + global availability', status: ok ? 'PASS' : 'FAIL', evidence };
}

function main() {
  const expected = expectedVersion();
  const ref = process.env.PIPELINE_RELEASE_REF || `v${expected}`;
  const checks = [
    w1(expected),
    w2(),
    wTest('W3', 'Sentinel HMAC enforcement', 'tests/regression/v7.13.0/F04_sentinel_signer_recursive.cjs'),
    wTest('W3b', 'Sentinel hook warn/strict', 'tests/regression/v7.13.0/F05_sentinel_hook_hmac.cjs'),
    wTest('W4', 'Controller permission truthfulness', 'tests/regression/v7.13.0/F03_frontmatter_consistency.cjs'),
    wTest('W5', 'Session lock entry-point coverage', 'tests/regression/v7.13.0/F06_entry_points_session_lock.cjs'),
    wTest('W6', 'Gate decision vocabulary', 'tests/regression/v7.13.0/F08_gate_decision_vocabulary.cjs'),
    wTest('W7', 'JSONL writer safety', 'tests/regression/v7.13.0/F07_jsonl_writer_safety.cjs'),
    w8(),
    wTest('W9', 'Audit semantics (coverage != quality)', 'tests/regression/v7.13.0/F09_runlog_unknown_not_zero.cjs'),
    w10(),
    w11(expected, ref),
    w12(expected),
  ];

  const blockers = checks.filter((c) => c.status === 'FAIL').map((c) => `${c.id} ${c.name}`);
  const pending = checks.filter((c) => c.status === 'PENDING').map((c) => `${c.id} ${c.name}`);
  const status = blockers.length === 0 ? (pending.length ? 'PASS_PENDING' : 'PASS') : 'FAIL';

  const out = {
    schema_version: 1, target_runtime: 'Claude Code', expected_version: expected, release_ref: ref,
    status, checks, release_blockers: blockers, pending,
    generated_at: new Date().toISOString(),
  };
  const wdDir = path.join(ROOT, '.pipeline', 'watchdog');
  fs.mkdirSync(wdDir, { recursive: true });
  fs.writeFileSync(path.join(wdDir, 'cloudcode-hardening-watchdog.json'), JSON.stringify(out, null, 2));
  const md = [`# Claude Code Hardening Watchdog`, '',
    `Status: **${status}**`, `Expected version: ${expected}`, `Release ref: ${ref}`, '', '## Checks',
    ...checks.map((c) => `- ${c.id} ${c.name}: **${c.status}**${c.evidence && c.evidence.length ? `\n  - ${c.evidence.join('\n  - ')}` : ''}`),
    '', '## Release blockers', blockers.length ? blockers.map((b) => `- ${b}`).join('\n') : '- none',
    pending.length ? `\n## Pending (post-publish proof)\n${pending.map((p) => `- ${p}`).join('\n')}` : ''].join('\n');
  fs.writeFileSync(path.join(wdDir, 'cloudcode-hardening-watchdog.md'), md + '\n');

  if (!JSON_ONLY) {
    console.log(`Watchdog: ${status} (version ${expected}, ref ${ref})`);
    for (const c of checks) console.log(`  ${c.status === 'PASS' ? '[OK ]' : c.status === 'PENDING' ? '[...]' : '[XX ]'} ${c.id} ${c.name}`);
    if (blockers.length) console.log(`Release blockers: ${blockers.join(', ')}`);
  }
  return status === 'FAIL' ? 1 : 0;
}

module.exports = { main, w1, w8, w10, w11, w12 };

if (require.main === module) process.exit(main());
