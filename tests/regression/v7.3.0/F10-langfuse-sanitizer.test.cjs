#!/usr/bin/env node
// =============================================================================
// F10 — Langfuse Sanitizer (AC3 + AC5)
// =============================================================================
// Validates the 3-layer sanitizer in lib/langfuse-sanitizer.cjs:
//   Layer 1 — truncate strings > 2000 chars to 1997 chars + "..."
//   Layer 2 — replace absolute paths under pluginRoot with relative paths,
//             forward slashes
//   Layer 3 — replace secret patterns (sk_live_*, sk_test_*, ghp_*, npm_*,
//             LANGFUSE_SECRET_KEY=*) AND dynamic env-scan for *_SECRET, *_TOKEN,
//             *_KEY, *_PASSWORD (value length > 8)
//
// Plus integration checks:
//   - Corpus of 5 synthetic secret payloads → 100% redaction in mock SDK
//   - .pipeline/langfuse-errors.jsonl never contains raw secret values
//   - error_type field always ∈ allowed enum
//   - 100KB stress input completes < 50ms (catastrophic-backtrack guard)
//
// RED-phase status: ALL subcases MUST fail at first run because
// lib/langfuse-sanitizer.cjs DOES NOT EXIST (Batch 2 not run).
//
// Scenarios covered: 2.1, 2.2, 2.4, 4.3, 4.5
// =============================================================================

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SANITIZER_PATH = path.join(ROOT, 'lib', 'langfuse-sanitizer.cjs');
const ERRORS_LOG = path.join(ROOT, '.pipeline', 'langfuse-errors.jsonl');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) {
    pass++;
    results.push(`  [PASS] ${scenario}`);
  } else {
    fail++;
    results.push(`  [FAIL] ${scenario}: ${msg}`);
  }
}

function loadSanitizer() {
  if (!fs.existsSync(SANITIZER_PATH)) return null;
  delete require.cache[require.resolve(SANITIZER_PATH)];
  try {
    return require(SANITIZER_PATH);
  } catch (e) {
    return { __loadErr: e };
  }
}

console.log('=== F10 Langfuse Sanitizer (AC3 + AC5) ===');

// ---------------------------------------------------------------------------
// F10-S1 (scenario 2.2): truncate input > 2000 chars → 1997 chars + "..."
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null) {
    why = `${SANITIZER_PATH} does not exist (Batch 2 not implemented)`;
  } else if (mod.__loadErr) {
    why = `module load failed: ${mod.__loadErr.message}`;
  } else {
    const fn = mod.sanitizeSpanPayload;
    if (typeof fn !== 'function') {
      why = `export sanitizeSpanPayload is not a function (got ${typeof fn})`;
    } else {
      const input = 'a'.repeat(2500);
      const out = fn(input, ROOT);
      ok = out.length === 2000 && out.endsWith('...') && out.slice(0, 1997) === 'a'.repeat(1997);
      why = `len=${out.length} ends-with-dots=${out.endsWith('...')} first-1997-match=${out.slice(0, 1997) === 'a'.repeat(1997)}`;
    }
  }
  record('F10-S1: scenario 2.2 — truncate input > 2000 chars to exactly 2000 (1997 chars + "...") (FR-7 Layer 1)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S2 (FR-7 Layer 2): absolute path containing pluginRoot replaced with
// relative path using forward slashes (Windows backslash variant included)
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeSpanPayload;
    const winPath = ROOT.replace(/\//g, '\\') + '\\agents\\core\\sentinel.md';
    const posixPath = ROOT.replace(/\\/g, '/') + '/agents/core/sentinel.md';
    const inputWin = `error in ${winPath}:42`;
    const inputPosix = `error in ${posixPath}:42`;
    const outWin = fn(inputWin, ROOT);
    const outPosix = fn(inputPosix, ROOT);
    // Plugin root should be stripped; result should contain "agents/core/sentinel.md"
    const winOk = outWin.includes('agents/core/sentinel.md') && !outWin.includes(ROOT.replace(/\//g, '\\'));
    const posixOk = outPosix.includes('agents/core/sentinel.md') && !outPosix.includes(ROOT);
    ok = winOk && posixOk;
    why = `win-redacted=${winOk} posix-redacted=${posixOk} out-win="${outWin.slice(0, 100)}" out-posix="${outPosix.slice(0, 100)}"`;
  }
  record('F10-S2: scenario 4.3 path-redaction — absolute paths (Windows + POSIX) under pluginRoot replaced with relative forward-slash paths (FR-7 Layer 2)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S3 (scenario 2.1): each of 5 secret regex patterns replaced with
// [REDACTED]; rest of text preserved; input not mutated
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeSpanPayload;
    const cases = [
      { input: 'token: sk_live_abc123XYZ end', secret: 'sk_live_abc123XYZ' },
      { input: 'test: sk_test_xyz999 OK', secret: 'sk_test_xyz999' },
      { input: 'gh: ghp_AAAAaaaa1234 stop', secret: 'ghp_AAAAaaaa1234' },
      { input: 'npm: npm_TokenAbcDefGhi456 end', secret: 'npm_TokenAbcDefGhi456' },
      { input: 'env: LANGFUSE_SECRET_KEY=sk-lf-realvalue123 end', secret: 'LANGFUSE_SECRET_KEY=sk-lf-realvalue123' },
    ];
    const failures = [];
    for (const c of cases) {
      const original = c.input;
      const out = fn(c.input, ROOT);
      const redacted = out.includes('[REDACTED]') && !out.includes(c.secret);
      const notMutated = c.input === original;
      if (!redacted || !notMutated) failures.push({ secret: c.secret, redacted, notMutated, out: out.slice(0, 80) });
    }
    ok = failures.length === 0;
    why = `failures=${failures.length} details=${JSON.stringify(failures).slice(0, 200)}`;
  }
  record('F10-S3: scenario 2.1 — 5 secret patterns (sk_live, sk_test, ghp, npm, LANGFUSE_SECRET_KEY=) replaced with [REDACTED]; input not mutated (FR-7 Layer 3 / AC3)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S4 (FR-7 Layer 3 env scan): dynamic env-scan replaces values whose key
// matches /(SECRET|TOKEN|KEY|PASSWORD)/i AND value length > 8;
// short values (<=8 chars) NOT redacted
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeSpanPayload;
    process.env.F10_FAKE_SECRET_TOKEN = 'abc12345xyz_long_secret';
    process.env.F10_SHORT_KEY = 'short';   // 5 chars — should NOT be redacted
    try {
      const out1 = fn('value here: abc12345xyz_long_secret in log', ROOT);
      const out2 = fn('short: short in log', ROOT);
      const longRedacted = out1.includes('[REDACTED]') && !out1.includes('abc12345xyz_long_secret');
      const shortNotRedacted = out2.includes('short'); // not replaced
      ok = longRedacted && shortNotRedacted;
      why = `long-redacted=${longRedacted} short-not-redacted=${shortNotRedacted} out1="${out1.slice(0, 100)}" out2="${out2.slice(0, 100)}"`;
    } finally {
      delete process.env.F10_FAKE_SECRET_TOKEN;
      delete process.env.F10_SHORT_KEY;
    }
  }
  record('F10-S4: scenario 4.3 env-scan — dynamic env values > 8 chars redacted; short values (<=8) not touched (FR-7 Layer 3)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S5 (FR-7 Layer 3 metacharacters): env value with regex metacharacters
// (e.g., $^.*+?()[]{}|) is literal-replaced, not regex-interpreted
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeSpanPayload;
    const tricky = 'foo$^.*+?()[]{}|\\bar1234567890';
    process.env.F10_TRICKY_PASSWORD = tricky;
    try {
      const out = fn(`leak: ${tricky} end`, ROOT);
      const noLeak = !out.includes(tricky);
      const hasRedacted = out.includes('[REDACTED]');
      ok = noLeak && hasRedacted;
      why = `no-leak=${noLeak} has-redacted=${hasRedacted} out="${out.slice(0, 100)}"`;
    } finally {
      delete process.env.F10_TRICKY_PASSWORD;
    }
  }
  record('F10-S5: scenario 4.3 metacharacters — env value with regex metacharacters literal-replaced, not regex-interpreted (FR-7)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S6 (scenario 2.4): null/undefined input returns empty string, no throw
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeSpanPayload;
    let nullThrew = null;
    let undefThrew = null;
    let nullOut, undefOut;
    try { nullOut = fn(null, ROOT); } catch (e) { nullThrew = e; }
    try { undefOut = fn(undefined, ROOT); } catch (e) { undefThrew = e; }
    ok = !nullThrew && !undefThrew && nullOut === '' && undefOut === '';
    why = `null-threw=${Boolean(nullThrew)} undef-threw=${Boolean(undefThrew)} null-out="${nullOut}" undef-out="${undefOut}"`;
  }
  record('F10-S6: scenario 2.4 — null/undefined input returns empty string, no throw (FR-7)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S7 (scenario 4.3 corpus): 5 synthetic secret payloads → 100% redaction
// in their sanitized output (full corpus sweep)
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeSpanPayload;
    process.env.F10_CUSTOM_PASSWORD = 'mySecretPasswordValue999';
    try {
      const corpus = [
        { name: 'NPM_TOKEN',           secret: 'npm_aBcDeF1234567890XyZ',                    payload: 'install with token=npm_aBcDeF1234567890XyZ' },
        { name: 'LANGFUSE_SECRET_KEY', secret: 'sk-lf-realxyz1234567890ABCDEFG',             payload: 'init key=LANGFUSE_SECRET_KEY=sk-lf-realxyz1234567890ABCDEFG' },
        { name: 'sk_live_*',           secret: 'sk_live_payment_aBcDeF12345',                payload: 'stripe key sk_live_payment_aBcDeF12345 ok' },
        { name: 'ghp_*',               secret: 'ghp_GithubTokenAAA1234567',                  payload: 'gh-auth ghp_GithubTokenAAA1234567 end' },
        { name: 'CUSTOM_PASSWORD env', secret: 'mySecretPasswordValue999',                   payload: 'login user=admin pass=mySecretPasswordValue999 ok' },
      ];
      const leaks = [];
      for (const c of corpus) {
        const out = fn(c.payload, ROOT);
        if (out.includes(c.secret)) {
          leaks.push({ name: c.name, out: out.slice(0, 100) });
        }
      }
      ok = leaks.length === 0;
      why = `leaks=${leaks.length}/${corpus.length} details=${JSON.stringify(leaks).slice(0, 200)}`;
    } finally {
      delete process.env.F10_CUSTOM_PASSWORD;
    }
  }
  record('F10-S7: scenario 4.3 — corpus of 5 secret payloads → 100% redacted (zero original values in sanitized output) (AC3 / NFR-3)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S8 (scenario 4.5): .pipeline/langfuse-errors.jsonl scan after a full
// run — zero lines contain any original secret value; error_type ∈ allowed
// enum
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(ERRORS_LOG)) {
    why = `${ERRORS_LOG} does not exist — no Langfuse hook has executed yet (Batch 3 incomplete)`;
  } else {
    const body = fs.readFileSync(ERRORS_LOG, 'utf8');
    const lines = body.split('\n').filter(Boolean);
    const knownSecrets = [
      'sk-lf-realxyz1234567890ABCDEFG',
      'npm_aBcDeF1234567890XyZ',
      'sk_live_payment_aBcDeF12345',
      'ghp_GithubTokenAAA1234567',
      'mySecretPasswordValue999',
    ];
    const leakingLines = lines.filter(l => knownSecrets.some(s => l.includes(s)));
    const allowedTypes = new Set(['sdk_throw', 'missing_credentials', 'tmp_file_corrupt', 'flush_timeout', 'invalid_sample_rate', 'network_error', 'unknown']);
    let badTypes = 0;
    let truncationViolations = 0;
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (!allowedTypes.has(e.error_type)) badTypes++;
        if (typeof e.message_truncated === 'string' && e.message_truncated.length > 200) truncationViolations++;
      } catch (err) { /* skip unparseable */ }
    }
    ok = leakingLines.length === 0 && badTypes === 0 && truncationViolations === 0;
    why = `total-lines=${lines.length} leaking-lines=${leakingLines.length} bad-error-types=${badTypes} truncation-violations=${truncationViolations}`;
  }
  record('F10-S8: scenario 4.5 — .pipeline/langfuse-errors.jsonl has zero raw secret values, error_type ∈ allowed enum, message_truncated <= 200 chars (AC5 / FR-6)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S9 (design §11 stress): 100KB input with embedded secret completes in
// < 50ms (catastrophic-backtrack guard on regex)
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeSpanPayload;
    // Build 100KB input with embedded secret
    const block = 'a'.repeat(1000);
    const input = (block + ' ').repeat(100) + 'npm_LeakedToken12345ABC' + ' ' + (block + ' ').repeat(0);
    // Truncation is layer 1, so the result will be 2000 chars. We just measure
    // wall-clock time.
    const start = process.hrtime.bigint();
    const out = fn(input, ROOT);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    // Either the secret is in the first 2000 chars (then redacted) or
    // truncated out — both acceptable. We only assert performance.
    ok = elapsedMs < 50;
    why = `elapsed-ms=${elapsedMs.toFixed(2)} (budget 50ms) out-len=${out.length}`;
  }
  record('F10-S9: scenario 4.3 stress — 100KB input completes in < 50ms (regex catastrophic-backtrack guard) (design §11)', ok, why);
}

// ---------------------------------------------------------------------------
// F10-S10 (Batch 2 fix-loop I15): sanitizeAny coverage for primitives,
// nested objects with secrets, circular refs, and undefined/null preservation
// ---------------------------------------------------------------------------
{
  const mod = loadSanitizer();
  let ok = false;
  let why = '';
  if (mod === null || mod.__loadErr) {
    why = mod === null ? `${SANITIZER_PATH} missing` : mod.__loadErr.message;
  } else {
    const fn = mod.sanitizeAny;
    if (typeof fn !== 'function') {
      why = `export sanitizeAny is not a function (got ${typeof fn})`;
    } else {
      // 1. number / boolean preserved as-is (no string coercion)
      const numOut = fn(42, ROOT);
      const boolOut = fn(true, ROOT);
      const numOk = numOut === 42;
      const boolOk = boolOut === true;

      // 2. null / undefined preserved (NOT coerced to "")
      const nullOut = fn(null, ROOT);
      const undefOut = fn(undefined, ROOT);
      const nullOk = nullOut === null;
      const undefOk = undefOut === undefined;

      // 3. Nested object with secret: secret redacted in leaf string
      const nested = {
        meta: { token: 'sk_live_NestedSecret1234567' },
        list: ['ok', 'ghp_NestedGithubToken9999'],
      };
      const nestedOut = fn(nested, ROOT);
      const nestedSecretGone =
        !JSON.stringify(nestedOut).includes('sk_live_NestedSecret1234567') &&
        !JSON.stringify(nestedOut).includes('ghp_NestedGithubToken9999') &&
        JSON.stringify(nestedOut).includes('[REDACTED]');

      // 4. Circular reference: must not infinite-loop, returns <max-depth>
      // sentinel at depth > 32
      const circular = { a: 1 };
      circular.self = circular;
      let circularThrew = null;
      let circularOut;
      try {
        circularOut = fn(circular, ROOT);
      } catch (e) {
        circularThrew = e;
      }
      // The deep recursion should terminate via the depth guard producing
      // '<max-depth>' somewhere in the cloned structure.
      const circularSafe =
        !circularThrew &&
        JSON.stringify(circularOut).includes('<max-depth>');

      ok = numOk && boolOk && nullOk && undefOk && nestedSecretGone && circularSafe;
      why = `num=${numOk} bool=${boolOk} null=${nullOk} undef=${undefOk} nested-redacted=${nestedSecretGone} circular-safe=${circularSafe}`;
    }
  }
  record('F10-S10: sanitizeAny — primitives preserved, null/undefined preserved, nested secrets redacted, circular refs terminate via depth guard (Batch 2 fix-loop I15)', ok, why);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
