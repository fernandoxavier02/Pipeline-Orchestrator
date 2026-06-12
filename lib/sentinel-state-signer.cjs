#!/usr/bin/env node
'use strict';

/**
 * sentinel-state-signer.cjs — HMAC integrity signature for sentinel-state.json
 *
 * Implements I4 (Fase I audit): mitigate H1-002 (sentinel-hook fail-open admitted).
 *
 * Threat model (audit B1-001 + H1-002):
 *   Any actor with write access to PIPELINE_DOC_PATH can neutralize the
 *   sentinel by writing a sentinel-state.json with pipeline_active:false.
 *
 * Mitigation strategy:
 *   1. On state write, compute HMAC-SHA256 over a RECURSIVE stable canonical
 *      form of the state body (the __signature field is excluded). Nested
 *      tampering changes the canonical form, so it changes the signature.
 *   2. On state read, recompute HMAC and compare in constant time.
 *   3. Key sources (priority): PIPELINE_HMAC_SECRET env → version-agnostic key
 *      file → legacy 5.3.0 key file (read-only fallback, preserves states
 *      signed before this release) → generated 32-byte key.
 *   4. Warn-first: unsigned states are allowed (migration) unless strict mode.
 *
 * v7.13.0 (R4) hardening:
 *   - Recursive `stableCanonicalize` replaces the shallow
 *     `JSON.stringify(rest, topKeys.sort())` that silently dropped nested keys
 *     (so nested tampering was undetectable).
 *   - `crypto.timingSafeEqual` is guarded by a length check + try/catch — a
 *     forged signature of the wrong length now returns valid:false instead of
 *     throwing (which would crash the hook into a fail-OPEN/erroring state).
 *   - HMAC key path is no longer hardcoded to plugin version 5.3.0; it is
 *     version-agnostic, with a read-only fallback to the legacy 5.3.0 key.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LEGACY_VERSION = '5.3.0'; // legacy key location (read-only fallback)
const KEY_FILE_NAME = '.hmac-key';
const SIGNATURE_FIELD = '__signature';
const SUPPORTED_ALGORITHM = 'sha256';

function pluginCacheDir() {
  return path.join(os.homedir(), '.claude', 'plugins', 'cache',
    'FX-studio-AI', 'pipeline-orchestrator');
}
function versionAgnosticKeyPath() { return path.join(pluginCacheDir(), KEY_FILE_NAME); }
function legacyKeyPath() { return path.join(pluginCacheDir(), LEGACY_VERSION, KEY_FILE_NAME); }

/**
 * Read the HMAC key WITHOUT generating one (read-only; safe for the hook, which
 * must never write files). Returns the key string or null if none is available.
 * Priority: env secret → version-agnostic file → legacy 5.3.0 file.
 */
function readHmacKey() {
  const envKey = (process.env.PIPELINE_HMAC_SECRET || '').trim();
  if (envKey) {
    // Same >=32 sanity floor the file path enforces — a too-short secret is an
    // operator misconfig; ignore it (fall through) rather than silently signing
    // with a weak key.
    if (envKey.length >= 32) return envKey;
    process.stderr.write('[SENTINEL-SIGNER WARN] PIPELINE_HMAC_SECRET shorter than 32 chars; ignoring\n');
  }
  for (const p of [versionAgnosticKeyPath(), legacyKeyPath()]) {
    try {
      if (fs.existsSync(p)) {
        const key = fs.readFileSync(p, 'utf8').trim();
        if (key && key.length >= 32) return key;
      }
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Locate or generate the plugin HMAC key (write-capable; for signing contexts).
 * Returns a hex/secret string.
 */
function getOrCreateHmacKey() {
  const existing = readHmacKey();
  if (existing) return existing;

  const keyPath = versionAgnosticKeyPath();
  try {
    const dir = path.dirname(keyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const newKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, newKey, { encoding: 'utf8', mode: 0o600 });
    return newKey;
  } catch (err) {
    // Last resort: ephemeral derivation (NOT secure, advisory only).
    process.stderr.write(
      `[SENTINEL-SIGNER WARN] cannot persist HMAC key (${err.message}); ` +
      'falling back to ephemeral derivation\n'
    );
    return crypto.createHash('sha256')
      .update(`${process.pid}-${Date.now()}-fallback`)
      .digest('hex');
  }
}

/**
 * Recursive, stable, deterministic canonicalization.
 *   - Object keys sorted recursively at EVERY depth.
 *   - Arrays preserved in order.
 *   - Primitives serialized via JSON.stringify.
 *   - undefined values are skipped in objects / become null in arrays
 *     (JSON.stringify parity); functions/symbols are likewise dropped.
 * Returns a string (or undefined for a top-level undefined input).
 */
function stableCanonicalize(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value);
    return s === undefined ? undefined : s; // functions/symbols → undefined
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => {
      const s = stableCanonicalize(v);
      return s === undefined ? 'null' : s;
    }).join(',') + ']';
  }
  const parts = [];
  for (const k of Object.keys(value).sort()) {
    const s = stableCanonicalize(value[k]);
    if (s === undefined) continue;
    parts.push(JSON.stringify(k) + ':' + s);
  }
  return '{' + parts.join(',') + '}';
}

/**
 * Compute HMAC-SHA256 over the recursive canonical body (excludes __signature).
 */
function computeSignature(stateObj, key) {
  const { [SIGNATURE_FIELD]: _ignored, ...rest } = stateObj;
  const canonical = stableCanonicalize(rest);
  return crypto.createHmac(SUPPORTED_ALGORITHM, key).update(canonical).digest('hex');
}

/**
 * Sign a state object — returns a new object with the `__signature` field.
 */
function signState(stateObj, key) {
  if (!stateObj || typeof stateObj !== 'object') {
    throw new TypeError('signState: stateObj must be an object');
  }
  const hmacKey = key || getOrCreateHmacKey();
  const signature = computeSignature(stateObj, hmacKey);
  return { ...stateObj, [SIGNATURE_FIELD]: { algorithm: SUPPORTED_ALGORITHM, value: signature, schema_version: 1 } };
}

/**
 * Verify a state object's signature. Returns { valid, reason, ... }.
 *
 * opts.strict   — default from PIPELINE_HMAC_STRICT==='true'. Strict rejects
 *                 unsigned states and fails closed when the key is unavailable.
 * opts.key      — explicit key. Pass `null` to indicate "no key available"
 *                 (the hook does this — read-only). When the `key` property is
 *                 absent, getOrCreateHmacKey() is used (signing contexts).
 */
function verifyState(stateObj, opts = {}) {
  if (!stateObj || typeof stateObj !== 'object') {
    return { valid: false, reason: 'state is not an object' };
  }
  const strict = opts.strict ?? (process.env.PIPELINE_HMAC_STRICT === 'true');
  const sig = stateObj[SIGNATURE_FIELD];

  if (!sig) {
    return {
      valid: !strict,
      reason: strict
        ? 'no signature present and strict mode enabled'
        : 'no signature present (UNSIGNED_STATE — allowed in migration period)',
      unsigned: true,
    };
  }
  if (typeof sig !== 'object' || sig.algorithm !== SUPPORTED_ALGORITHM || typeof sig.value !== 'string') {
    return { valid: false, reason: 'malformed signature field' };
  }

  const key = ('key' in opts) ? opts.key : getOrCreateHmacKey();
  if (!key) {
    // R4.7: cannot perform verification → fail closed in strict, advisory-allow
    // in migration mode.
    return { valid: !strict, reason: 'verification key unavailable', key_unavailable: true };
  }

  let expected;
  try { expected = computeSignature(stateObj, key); }
  catch (e) { return { valid: false, reason: `canonicalization failed: ${e.message}` }; }

  // Length-guarded constant-time compare. Buffer.from(x,'hex') silently
  // truncates on invalid/odd input, so a forged value yields a short buffer —
  // the length check rejects it WITHOUT calling timingSafeEqual (which throws
  // on unequal lengths and would crash the hook).
  let sigBuf, expBuf;
  try {
    sigBuf = Buffer.from(sig.value, 'hex');
    expBuf = Buffer.from(expected, 'hex');
  } catch {
    return { valid: false, reason: 'signature not valid hex' };
  }
  if (sigBuf.length === 0 || sigBuf.length !== expBuf.length) {
    return { valid: false, reason: 'signature length mismatch' };
  }
  let match = false;
  try { match = crypto.timingSafeEqual(sigBuf, expBuf); }
  catch { return { valid: false, reason: 'constant-time compare error' }; }
  if (!match) return { valid: false, reason: 'signature mismatch — possible tampering or stale key' };
  return { valid: true, reason: 'signature valid', algorithm: SUPPORTED_ALGORITHM };
}

/**
 * Read + verify a sentinel-state.json file. Returns { state, verification }.
 */
function readVerifiedState(filePath, opts = {}) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const state = JSON.parse(raw);
  const verification = verifyState(state, opts);
  return { state, verification };
}

/**
 * Sign + atomically write a sentinel-state.json file.
 */
function writeSignedState(filePath, state, opts = {}) {
  const signed = signState(state, opts.key);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(signed, null, 2));
  fs.renameSync(tmpPath, filePath);
  return signed;
}

module.exports = {
  getOrCreateHmacKey,
  readHmacKey,
  stableCanonicalize,
  computeSignature,
  signState,
  verifyState,
  readVerifiedState,
  writeSignedState,
  SIGNATURE_FIELD,
  SUPPORTED_ALGORITHM,
};
