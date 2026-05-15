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
 *   Sentinel-hook docstring SEC-2 explicitly admits this trust assumption.
 *
 * Mitigation strategy:
 *   1. On state write, compute HMAC-SHA256 over the canonical state body
 *      using a session-derived key. Store the signature in `state.signature`.
 *   2. On state read, recompute HMAC and compare. Reject unsigned/invalid.
 *   3. Key derivation: HMAC(plugin_secret, pipeline_id + claude_session_id).
 *   4. Backwards compat: states without `signature` field accepted but logged
 *      as UNSIGNED_STATE warning (allow migration period).
 *
 * Key sources (priority order):
 *   1. `PIPELINE_HMAC_SECRET` env var (test/CI override)
 *   2. `~/.claude/plugins/cache/FX-studio-AI/pipeline-orchestrator/<ver>/.hmac-key`
 *      (auto-generated on first install with 32 random bytes)
 *   3. Fallback: derived from plugin install path (less secure, logged as WARN)
 *
 * NOTE: This is a prototype. Production deployment should pair with:
 *   - File ACLs on the plugin cache dir (chmod 600 for .hmac-key)
 *   - Audit log of UNSIGNED_STATE warnings
 *   - Migration window before flipping `allow_unsigned` to false
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLUGIN_VERSION = '5.3.0';
const KEY_FILE_NAME = '.hmac-key';
const SIGNATURE_FIELD = '__signature';
const SUPPORTED_ALGORITHM = 'sha256';

/**
 * Locate or generate the plugin HMAC key.
 * Returns 32-byte hex string.
 */
function getOrCreateHmacKey() {
  const envKey = (process.env.PIPELINE_HMAC_SECRET || '').trim();
  if (envKey) return envKey;

  const home = os.homedir();
  const keyDir = path.join(home, '.claude', 'plugins', 'cache',
    'FX-studio-AI', 'pipeline-orchestrator', PLUGIN_VERSION);
  const keyPath = path.join(keyDir, KEY_FILE_NAME);

  try {
    if (fs.existsSync(keyPath)) {
      const key = fs.readFileSync(keyPath, 'utf8').trim();
      if (key && key.length >= 32) return key;
    }
  } catch { /* fall through to generation */ }

  // Generate fresh key
  try {
    if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir, { recursive: true });
    const newKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, newKey, { encoding: 'utf8', mode: 0o600 });
    return newKey;
  } catch (err) {
    // Last resort: derive from process info (NOT secure, advisory only)
    process.stderr.write(
      `[SENTINEL-SIGNER WARN] cannot persist HMAC key (${err.message}); ` +
      'falling back to ephemeral derivation\n'
    );
    return crypto.createHash('sha256')
      .update(`${process.pid}-${Date.now()}-${PLUGIN_VERSION}`)
      .digest('hex');
  }
}

/**
 * Compute HMAC-SHA256 over a stable canonical representation of state.
 * The signature field itself is excluded from the canonical form.
 */
function computeSignature(stateObj, key) {
  const { [SIGNATURE_FIELD]: _ignored, ...rest } = stateObj;
  // Canonical: keys sorted, no spaces, stable separators
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return crypto.createHmac(SUPPORTED_ALGORITHM, key).update(canonical).digest('hex');
}

/**
 * Sign a state object — mutates by adding `__signature` field.
 * Returns the signed state.
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
 * Verify a state object's signature.
 * Returns { valid, reason, allow_unsigned }.
 *
 * Strict mode (PIPELINE_HMAC_STRICT=true): unsigned states are rejected.
 * Default mode: unsigned states logged but allowed (migration period).
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

  const key = opts.key || getOrCreateHmacKey();
  const expected = computeSignature(stateObj, key);
  if (!crypto.timingSafeEqual(Buffer.from(sig.value, 'hex'), Buffer.from(expected, 'hex'))) {
    return { valid: false, reason: 'signature mismatch — possible tampering or stale key' };
  }
  return { valid: true, reason: 'signature valid', algorithm: SUPPORTED_ALGORITHM };
}

/**
 * Read + verify a sentinel-state.json file.
 * Returns { state, verification }.
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
  computeSignature,
  signState,
  verifyState,
  readVerifiedState,
  writeSignedState,
  SIGNATURE_FIELD,
  SUPPORTED_ALGORITHM,
};
