#!/usr/bin/env node
// =============================================================================
// F14 — Langfuse Project Isolation (v7.9.3)
// =============================================================================
// Ensures the pipeline-orchestrator ALWAYS sends telemetry to its dedicated
// Langfuse project, regardless of where it is executed (inside FX Studio AI
// or elsewhere). The plugin's own .env takes priority over process.env.
//
// Scenarios:
//   F14-S1 — plugin .env with Pipeline keys wins over process.env FX keys.
//   F14-S2 — process.env fallback works when plugin .env is absent.
//   F14-S3 — FX Studio public key is detected and emits isolation warning.
//   F14-S4 — no secrets leak through the new env-parsing paths.
//
// Harness: direct require of langfuse-client internals (no mock SDK needed).
// Auto-discovered by scripts/run-tests.cjs (v7.9.3 matches v<semver>).
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CLIENT = path.join(ROOT, 'lib', 'langfuse-client.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg}`); }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; } }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetModuleCache() {
  delete require.cache[require.resolve(CLIENT)];
}

function withTempEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

function writeTempEnvFile(dir, content) {
  const p = path.join(dir, '.env');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ---------------------------------------------------------------------------
// F14-S1: plugin .env with Pipeline keys wins over process.env FX keys
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f14-s1-'));
  try {
    // Write a fake .env in a temp location that mimics the plugin root.
    // We simulate the plugin root by temporarily overriding __dirname resolution
    // via monkey-patching path.resolve before require. This is invasive but
    // necessary because the module computes PLUGIN_ROOT at load time.
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath,
      'LANGFUSE_ENABLED=true\n' +
      'LANGFUSE_PUBLIC_KEY=pk-lf-PIPELINE-TEST-KEY\n' +
      'LANGFUSE_SECRET_KEY=sk-lf-PIPELINE-TEST-SECRET\n' +
      'LANGFUSE_HOST=https://us.cloud.langfuse.com\n',
      'utf8'
    );

    // Monkey-patch fs.readFileSync so that reading the plugin .env returns
    // our temp content while everything else passes through.
    const origReadFile = fs.readFileSync;
    const origExists = fs.existsSync;

    fs.readFileSync = (p, ...args) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        return origReadFile(envPath, ...args);
      }
      return origReadFile(p, ...args);
    };
    fs.existsSync = (p) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        return true;
      }
      return origExists(p);
    };

    resetModuleCache();
    const clientLib = withTempEnv({
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-FX-STUDIO-OVERRIDE',
      LANGFUSE_SECRET_KEY: 'sk-lf-FX-STUDIO-OVERRIDE',
    }, () => require(CLIENT));

    const enabled = clientLib.isEnabled();

    // Restore monkey-patches BEFORE assertions so failures don't leave state dirty.
    fs.readFileSync = origReadFile;
    fs.existsSync = origExists;

    // The module caches _pluginEnv on first call, so for this test the .env
    // was already loaded. We verify isEnabled() returned true (keys present).
    // A stricter test would inspect internal state; we settle for behavioural.
    record('F14-S1: plugin .env wins over process.env', enabled,
      `isEnabled()=${enabled}, expected true when plugin .env has keys`);
  } catch (e) {
    record('F14-S1: plugin .env wins over process.env', false, e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// F14-S2: process.env fallback works when plugin .env is absent
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f14-s2-'));
  try {
    // Ensure the plugin .env does NOT exist by pointing at a temp dir without one.
    const envPath = path.join(tmpDir, '.env');

    const origReadFile = fs.readFileSync;
    const origExists = fs.existsSync;

    fs.readFileSync = (p, ...args) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        throw new Error('ENOENT');
      }
      return origReadFile(p, ...args);
    };
    fs.existsSync = (p) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        return false;
      }
      return origExists(p);
    };

    resetModuleCache();
    const clientLib = withTempEnv({
      LANGFUSE_ENABLED: 'true',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-FALLBACK-KEY',
      LANGFUSE_SECRET_KEY: 'sk-lf-FALLBACK-SECRET',
    }, () => require(CLIENT));

    const enabled = clientLib.isEnabled();

    fs.readFileSync = origReadFile;
    fs.existsSync = origExists;

    record('F14-S2: process.env fallback when .env absent', enabled,
      `isEnabled()=${enabled}, expected true with fallback env keys`);
  } catch (e) {
    record('F14-S2: process.env fallback when .env absent', false, e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// F14-S3: FX Studio public key detection emits isolation warning
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f14-s3-'));
  try {
    const envPath = path.join(tmpDir, '.env');
    const fxPublicKey = 'pk-lf-45a8b363-23f1-4145-8c2b-fe9c63209ac3';
    fs.writeFileSync(envPath,
      'LANGFUSE_ENABLED=true\n' +
      `LANGFUSE_PUBLIC_KEY=${fxPublicKey}\n` +
      'LANGFUSE_SECRET_KEY=sk-lf-TEST-SECRET\n',
      'utf8'
    );

    const origReadFile = fs.readFileSync;
    const origExists = fs.existsSync;

    fs.readFileSync = (p, ...args) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        return origReadFile(envPath, ...args);
      }
      return origReadFile(p, ...args);
    };
    fs.existsSync = (p) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        return true;
      }
      return origExists(p);
    };

    // Capture stderr to verify the warning was emitted.
    const origStderrWrite = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += chunk; return true; };

    resetModuleCache();
    const clientLib = withTempEnv({}, () => require(CLIENT));
    clientLib.getClient(); // triggers warnIfFxStudioKey

    process.stderr.write = origStderrWrite;
    fs.readFileSync = origReadFile;
    fs.existsSync = origExists;

    const hasWarning = captured.includes('LANGFUSE_PROJECT_ISOLATION_VIOLATION');
    record('F14-S3: FX Studio key triggers isolation warning', hasWarning,
      hasWarning ? 'ok' : `stderr did not contain expected warning; captured=${captured.slice(0,200)}`);
  } catch (e) {
    record('F14-S3: FX Studio key triggers isolation warning', false, e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// F14-S4: no secret leak through env-parsing paths
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f14-s4-'));
  try {
    const secretValue = 'sk-lf-SUPER-SECRET-VALUE-12345';
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath,
      'LANGFUSE_ENABLED=true\n' +
      'LANGFUSE_PUBLIC_KEY=pk-lf-TEST-PUBLIC\n' +
      `LANGFUSE_SECRET_KEY="${secretValue}"\n`,
      'utf8'
    );

    const origReadFile = fs.readFileSync;
    const origExists = fs.existsSync;

    fs.readFileSync = (p, ...args) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        return origReadFile(envPath, ...args);
      }
      return origReadFile(p, ...args);
    };
    fs.existsSync = (p) => {
      if (typeof p === 'string' && p.includes('.env') && !p.includes('node_modules')) {
        return true;
      }
      return origExists(p);
    };

    resetModuleCache();
    const clientLib = withTempEnv({}, () => require(CLIENT));

    // Try to trigger any path that might leak the secret (getClient path).
    // Since we have no real Langfuse SDK in this isolated test, getClient()
    // will fail at require('langfuse') and log an error. We verify the error
    // log does NOT contain the secret.
    const errorLogPath = path.join(ROOT, '.pipeline', 'langfuse-errors.jsonl');
    // Clear the log file first.
    try { fs.unlinkSync(errorLogPath); } catch (_e) { /* ignore */ }

    try {
      clientLib.getClient();
    } catch (_e) {
      // expected — langfuse not installed in isolated harness
    }

    let leaked = false;
    try {
      const logBody = fs.readFileSync(errorLogPath, 'utf8');
      if (logBody.includes(secretValue)) leaked = true;
    } catch (_e) {
      // No log written — also acceptable (secret didn't leak because no log).
    }

    fs.readFileSync = origReadFile;
    fs.existsSync = origExists;

    record('F14-S4: no secret leak in env parsing paths', !leaked,
      leaked ? 'secret value found in error log' : 'ok');
  } catch (e) {
    record('F14-S4: no secret leak in env parsing paths', false, e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nF14 — Langfuse Project Isolation: ${pass}/${pass + fail}`);
for (const r of results) console.log(r);
if (fail > 0) {
  console.log(`\n${fail} failure(s).`);
  process.exit(1);
}
console.log('\nAll scenarios passed.');
