#!/usr/bin/env node
'use strict';

/**
 * Cross-platform test runner for the pipeline-orchestrator plugin.
 *
 * Pure Node (Windows/Mac/Linux). Replaces the POSIX-only
 * `for t in .../*.cjs; do node "$t" || exit 1; done`.
 *
 * v7.13.0 (R9): category discovery + per-test timeout + category gate.
 *   - Default categories: regression, hooks, unit, packaging, watchdog.
 *     (`tests/unit` was previously ORPHAN — never run by default — which let
 *     drift accumulate silently. R9.1 acceptance: "A test placed in tests/unit
 *     is executed by default.")
 *   - Per-test timeout (R9.2): a hung test is killed (SIGTERM) and reported
 *     FAIL instead of freezing the suite. Configurable via
 *     PIPELINE_TEST_TIMEOUT_MS (default 180000, floor 1000).
 *   - Category gate (R9.4): "directory exists but empty" → SKIP (never fail,
 *     so a freshly-created packaging/ or watchdog/ folder cannot break npm
 *     test). "directory absent" → SKIP by default; only FAIL a required
 *     category under --strict-categories (used by the release/watchdog).
 *   - integration / snapshot are non-default (legacy drift); opt in with
 *     --integration / --snapshot. compat has its own runner
 *     (tests/compat/runner.cjs --all --mock) and is not auto-discovered here.
 *
 * Usage:
 *   node scripts/run-tests.cjs                  # default categories
 *   node scripts/run-tests.cjs --all            # every category incl. integration/snapshot
 *   node scripts/run-tests.cjs --regression     # one category
 *   node scripts/run-tests.cjs --unit --hooks   # several categories
 *   node scripts/run-tests.cjs --strict-categories  # absent required category = FAIL
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SEMVER_RE = /^v\d+\.\d+\.\d+$/;

const TIMEOUT_FLOOR_MS = 1000;
const DEFAULT_TIMEOUT_MS = (() => {
  const v = parseInt(process.env.PIPELINE_TEST_TIMEOUT_MS || '', 10);
  return Number.isFinite(v) && v >= TIMEOUT_FLOOR_MS ? v : 180000;
})();

/**
 * Discover tests/regression/v<semver>/*.cjs across all semver subdirs.
 * Non-semver siblings (helpers/, fixtures/, .gitkeep) are rejected.
 */
function discoverRegression(root) {
  const regRoot = path.join(root, 'tests', 'regression');
  if (!fs.existsSync(regRoot)) return { present: false, files: [] };
  const files = [];
  const versionDirs = fs.readdirSync(regRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SEMVER_RE.test(d.name))
    .map((d) => d.name)
    .sort();
  for (const vd of versionDirs) {
    const dir = path.join(regRoot, vd);
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.cjs')).sort()) {
      files.push(path.join(dir, f));
    }
  }
  return { present: true, files };
}

/**
 * Discover a flat directory's test files matching `regex`.
 * Returns { present, files } — `present:false` means the directory is absent;
 * `present:true` with empty `files` means it exists but holds no test (→ skip).
 */
function discoverFlat(root, relDir, regex) {
  const dir = path.join(root, relDir);
  if (!fs.existsSync(dir)) return { present: false, files: [] };
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return { present: false, files: [] }; }
  const files = entries.filter((f) => regex.test(f)).sort().map((f) => path.join(dir, f));
  return { present: true, files };
}

const CATEGORIES = {
  regression: { default: true,  required: true,  discover: (root) => discoverRegression(root) },
  hooks:      { default: true,  required: true,  discover: (root) => discoverFlat(root, path.join('.claude', 'hooks', '__tests__'), /\.test\.cjs$/) },
  unit:       { default: true,  required: true,  discover: (root) => discoverFlat(root, path.join('tests', 'unit'), /\.test\.(js|cjs)$/) },
  // tests/contracts holds cross-surface drift contracts (e.g. the SIMPLES-inclusive
  // Phase 1.5 trigger-string rule). It was previously ORPHAN — never run by the
  // standard gate — letting drift accumulate silently, same failure mode that put
  // tests/unit under the sweep. Empty dir = skip (never fail); per-test timeout applies.
  contracts:  { default: true,  required: false, discover: (root) => discoverFlat(root, path.join('tests', 'contracts'), /\.test\.cjs$/) },
  packaging:  { default: true,  required: false, discover: (root) => discoverFlat(root, path.join('tests', 'packaging'), /\.test\.cjs$/) },
  watchdog:   { default: true,  required: false, discover: (root) => discoverFlat(root, path.join('tests', 'watchdog'), /\.test\.cjs$/) },
  // v8.0.2: the Paperclip flow-mirror engine (the handoff-stall fix) lived
  // outside every swept category, so a regression there never turned `npm test`
  // red. Wire its 13 *.test.cjs into the default gate.
  paperclip:  { default: true,  required: false, discover: (root) => discoverFlat(root, path.join('references', 'paperclip', 'spec', 'lib'), /\.test\.cjs$/) },
  integration:{ default: false, required: false, discover: (root) => discoverFlat(root, path.join('tests', 'integration'), /\.test\.(js|cjs)$/) },
  snapshot:   { default: false, required: false, discover: (root) => discoverFlat(root, path.join('tests', 'snapshot'), /\.test\.js$/) },
};

/**
 * Run one suite file in a child process with a hard per-test timeout.
 * @returns {{ok:boolean, timedOut:boolean, status:number|null, signal:string|null, stdout:string, stderr:string}}
 */
function runSuite(suitePath, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs >= 1
    ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const result = spawnSync(process.execPath, [suitePath], {
    cwd: opts.cwd || ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGTERM',
  });
  // Timeout is reliably surfaced cross-platform as error.code ETIMEDOUT
  // (verified on Windows: status:null, signal:SIGTERM, error.code:ETIMEDOUT).
  // A signal-kill WITHOUT ETIMEDOUT (a crashing test, e.g. SIGSEGV) is a plain
  // FAIL, not a timeout — keep the label honest. Either way ok stays false.
  const timedOut = !!(result.error && result.error.code === 'ETIMEDOUT');
  const ok = !timedOut && result.status === 0;
  return {
    ok,
    timedOut,
    status: typeof result.status === 'number' ? result.status : null,
    signal: result.signal || null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function parseArgs(argv) {
  const known = Object.keys(CATEGORIES);
  const selected = [];
  let strictCategories = false;
  let explicit = false;
  for (const a of argv) {
    if (a === '--all') { selected.push(...known); explicit = true; }
    else if (a === '--strict-categories') { strictCategories = true; }
    else if (a.startsWith('--') && known.includes(a.slice(2))) { selected.push(a.slice(2)); explicit = true; }
  }
  if (!explicit) {
    selected.push(...known.filter((c) => CATEGORIES[c].default));
  }
  return { categories: [...new Set(selected)], strictCategories };
}

function main(argv = process.argv.slice(2), opts = {}) {
  const root = opts.root || ROOT;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const { categories, strictCategories } = parseArgs(argv);

  const suites = [];
  const skipped = [];
  const missingRequired = [];

  for (const cat of categories) {
    const def = CATEGORIES[cat];
    if (!def) continue;
    const { present, files } = def.discover(root);
    if (!present) {
      if (strictCategories && def.required) missingRequired.push(cat);
      else skipped.push(`${cat} (directory absent)`);
      continue;
    }
    if (files.length === 0) {
      // R9.4: a required category whose directory was wiped (all files deleted
      // or renamed off the discovery pattern) is "missing coverage" under strict
      // mode — fail, never green-wash. Optional categories still skip cleanly.
      if (strictCategories && def.required) missingRequired.push(`${cat} (present but empty)`);
      else skipped.push(`${cat} (directory empty)`);
      continue;
    }
    for (const f of files) {
      suites.push({ category: cat, path: f, label: path.relative(root, f).replace(/\\/g, '/') });
    }
  }

  if (missingRequired.length > 0) {
    console.error(`Missing required test categor${missingRequired.length === 1 ? 'y' : 'ies'}: ${missingRequired.join(', ')}`);
    return 1;
  }

  if (suites.length === 0) {
    console.error('No test files found in selected categories.');
    if (skipped.length) console.error(`Skipped: ${skipped.join(', ')}`);
    return 1;
  }

  console.log(`Running ${suites.length} test suite(s) across ${new Set(suites.map((s) => s.category)).size} categor(ies) [timeout ${timeoutMs}ms/test]\n`);

  let passed = 0, failed = 0;
  const failures = [];
  for (const suite of suites) {
    process.stdout.write(`  [...] ${suite.label}`);
    const res = runSuite(suite.path, { cwd: root, timeoutMs });
    if (res.ok) {
      process.stdout.write(`\r  [PASS] ${suite.label}\n`);
      passed++;
    } else {
      const tag = res.timedOut ? 'TIMEOUT' : 'FAIL';
      process.stdout.write(`\r  [${tag}] ${suite.label}\n`);
      failed++;
      failures.push({ ...suite, ...res, tag });
    }
  }

  // Loudly surface populated categories that exist but were NOT selected this
  // run (e.g. integration/snapshot on a default run) so a real, populated
  // category is never SILENTLY orphaned — show the opt-in flag to run it.
  const notRun = [];
  for (const cat of Object.keys(CATEGORIES)) {
    if (categories.includes(cat)) continue;
    const disc = CATEGORIES[cat].discover(root);
    if (disc.present && disc.files.length > 0) notRun.push(`${cat} (${disc.files.length} files; --${cat})`);
  }
  if (skipped.length) {
    console.log(`\nSkipped categories: ${skipped.join(', ')}`);
  }
  if (notRun.length) {
    console.log(`Not run (populated, opt-in): ${notRun.join(', ')}`);
  }
  console.log(`\nSummary: ${passed} passed / ${failed} failed / ${suites.length} total`);

  if (failed > 0) {
    console.log('\n--- Failure output ---');
    for (const f of failures) {
      console.log(`\n  [${f.tag}] ${f.label}`);
      if (f.timedOut) console.log(`    (killed after timeout)`);
      if (f.stdout) console.log(f.stdout.split('\n').map((l) => '    ' + l).join('\n'));
      if (f.stderr) console.log(f.stderr.split('\n').map((l) => '    ' + l).join('\n'));
    }
    return 1;
  }
  return 0;
}

module.exports = { CATEGORIES, discoverRegression, discoverFlat, runSuite, parseArgs, main, DEFAULT_TIMEOUT_MS };

if (require.main === module) {
  process.exit(main());
}
