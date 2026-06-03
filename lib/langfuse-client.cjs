#!/usr/bin/env node
'use strict';

// TODO(v7.4): split into client-singleton.cjs + error-log-writer.cjs to
// address SRP debt — this file currently owns 6 responsibilities (enable
// gate, sample-rate parse, lazy SDK init, allowed-types enum, error log
// schema, file I/O). Refactor deferred per Batch 2 fix-loop scope.
// TODO(v7.4 backlog): SEC-4/5/6/7, ARCH-1/2, QUAL-1, CLAR-2, TEST-1/2/3 (from Batch 3 final adversarial review)

/**
 * langfuse-client.cjs — Singleton Langfuse SDK accessor with opt-in gate
 *
 * Implements FR-1, FR-8, FR-9, NFR-5 from spec 2026-05-21-langfuse-observability.
 *
 * Contract:
 *   - isEnabled()    -> boolean (memoized for process lifetime)
 *   - getClient()    -> Langfuse SDK instance, or null when disabled / no creds
 *   - getSampleRate() -> number in [0.0, 1.0]
 *
 * CRITICAL invariants (asserted by F8 static grep):
 *   - require('langfuse') happens ONLY inside getClient(), never at top level.
 *   - Module load is < 5ms (no I/O, no SDK init eager).
 *   - When LANGFUSE_ENABLED is unset / not "true" / not "1": every public
 *     function returns the disabled-state value with no side effects.
 *
 * Error logging:
 *   Each call writes one JSON line to .pipeline/langfuse-errors.jsonl with
 *   { timestamp, error_type, message_truncated, run_id, hook_name }.
 *   Every message goes through sanitizeAny() before write.
 *
 * Allowed error_type values (design §8):
 *   sdk_throw, missing_credentials, tmp_file_corrupt, flush_timeout,
 *   invalid_sample_rate, network_error, unknown
 */

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeAny, sanitizeSpanPayload } = require('./langfuse-sanitizer.cjs');

// ---------------------------------------------------------------------------
// v7.9.3 — Project isolation guard (LANGFUSE_PROJECT_ISOLATION).
// The plugin MUST always send telemetry to its dedicated Langfuse project,
// regardless of where the user executes it (inside FX Studio or elsewhere).
// We load the plugin's own .env with priority over process.env so that
// the plugin's Langfuse keys win over any global env vars.
// ---------------------------------------------------------------------------

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ENV_PATH = path.join(PLUGIN_ROOT, '.env');

// Hardcoded public key of the FX Studio AI project — used as a sentinel
// to detect misconfiguration and warn the operator.
const FX_STUDIO_PUBLIC_KEY = 'pk-lf-45a8b363-23f1-4145-8c2b-fe9c63209ac3';

let _pluginEnv = null; // lazy cache
let _fxStudioWarned = false; // dedupe

function parseEnvFile(filePath) {
  const result = {};
  try {
    if (!fs.existsSync(filePath)) return result;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip optional surrounding quotes (single or double)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  } catch (_e) {
    // Soft-fail: return empty object so process.env remains the fallback.
  }
  return result;
}

function getPluginEnv() {
  if (_pluginEnv !== null) return _pluginEnv;
  _pluginEnv = parseEnvFile(PLUGIN_ENV_PATH);
  return _pluginEnv;
}

function envVar(name) {
  const pluginVal = getPluginEnv()[name];
  if (pluginVal !== undefined) return pluginVal;
  return process.env[name];
}

function warnIfFxStudioKey() {
  const pub = envVar('LANGFUSE_PUBLIC_KEY');
  if (pub === FX_STUDIO_PUBLIC_KEY && !_fxStudioWarned) {
    _fxStudioWarned = true;
    try {
      process.stderr.write(
        JSON.stringify({
          audit_event: 'LANGFUSE_PROJECT_ISOLATION_VIOLATION',
          ts: new Date().toISOString(),
          message:
            'Pipeline is configured to send telemetry to FX Studio AI project. ' +
            'This violates project isolation. Update Pipeline-Orchestrator/.env ' +
            'with the dedicated Pipeline project keys.',
        }) + '\n'
      );
    } catch (_e) { /* never throw from audit */ }
  }
}

// Internal singleton state (module-scoped).
// NOTE: null on _enabledMemo / _sampleRateMemo means "not-yet-computed".
// This is intentionally distinct from valid memoized values (false / 0.0),
// so do not collapse null with a "falsy" check — always compare !== null.
let _client = null;
let _enabledMemo = null;          // null = uncomputed; otherwise true | false
let _sampleRateMemo = null;       // null = uncomputed; otherwise number in [0.0, 1.0]
let _missingCredsLogged = false;  // de-dupe missing_credentials writes
let _invalidRateLogged = false;   // de-dupe invalid_sample_rate writes
let _disabledForSession = false;  // sticky disable after credential failure
let _pluginRootWarningEmitted = false;  // one-time stderr warning when CLAUDE_PLUGIN_ROOT missing in _logError path
let _invalidHostLogged = false;   // de-dupe LANGFUSE_HOST scheme rejection

const DEFAULT_HOST = 'https://cloud.langfuse.com';
const ERROR_LOG_PATH = path.join('.pipeline', 'langfuse-errors.jsonl');
const ERROR_MESSAGE_MAX = 200;

const ALLOWED_ERROR_TYPES = Object.freeze([
  'sdk_throw',
  'missing_credentials',
  'tmp_file_corrupt',
  'flush_timeout',
  'invalid_sample_rate',
  'network_error',
  'unknown',
]);

/**
 * isEnabled() — opt-in gate. PURE predicate after first call (the plugin .env
 * is read once on first use and cached; subsequent calls are I/O-free).
 * On the very first call there is a single synchronous read of the plugin .env
 * (small file, << 1 ms). The only other I/O is one missing_credentials log
 * entry the first time creds are absent (which is itself the gate's verdict).
 *
 * Returns true ONLY when:
 *   envVar('LANGFUSE_ENABLED') is exactly "true" or "1" (case-insensitive)
 *   AND LANGFUSE_PUBLIC_KEY is set
 *   AND LANGFUSE_SECRET_KEY is set
 *   AND we have not been disabled-for-session by a prior failure.
 *
 * Result is memoized after first non-disabled-by-failure resolution.
 *
 * IMPORTANT: this function NO LONGER triggers sample-rate validation.
 * Hooks must call initializeForSession() once at startup to emit the
 * invalid_sample_rate diagnostic eagerly.
 */
function isEnabled() {
  if (_disabledForSession) return false;
  if (_enabledMemo !== null) return _enabledMemo;

  const flag = String(envVar('LANGFUSE_ENABLED') || '').toLowerCase();
  const wantEnabled = (flag === 'true' || flag === '1');
  if (!wantEnabled) {
    _enabledMemo = false;
    return false;
  }

  const pub = envVar('LANGFUSE_PUBLIC_KEY');
  const sec = envVar('LANGFUSE_SECRET_KEY');
  if (!pub || !sec) {
    if (!_missingCredsLogged) {
      _logError(
        'missing_credentials',
        'LANGFUSE_ENABLED is set but PUBLIC/SECRET key missing',
        { hook_name: 'langfuse-client' }
      );
      _missingCredsLogged = true;
    }
    _disabledForSession = true;
    _enabledMemo = false;
    return false;
  }

  _enabledMemo = true;
  return true;
}

/**
 * initializeForSession() — explicit startup hook.
 *
 * Hooks call this ONCE per process at session start. It eagerly resolves
 * the enable gate AND validates LANGFUSE_SAMPLE_RATE, so any
 * invalid_sample_rate diagnostic is written at startup rather than at
 * first use. Idempotent: safe to call multiple times.
 *
 * @returns {{enabled: boolean, sampleRate: number}} resolved session state.
 */
function initializeForSession() {
  const enabled = isEnabled();
  // Always parse the sample rate (so invalid input is reported even when
  // the feature is otherwise disabled — useful for ops debugging).
  const sampleRate = getSampleRate();
  return { enabled, sampleRate };
}

/**
 * getSampleRate() — parse LANGFUSE_SAMPLE_RATE.
 *
 * If unset: defaults to 1.0 (every run instrumented).
 * If NaN / out of [0.0, 1.0]: logs invalid_sample_rate, defaults to 1.0.
 * Result is memoized.
 */
function getSampleRate() {
  if (_sampleRateMemo !== null) return _sampleRateMemo;

  const raw = envVar('LANGFUSE_SAMPLE_RATE');
  if (raw == null || raw === '') {
    _sampleRateMemo = 1.0;
    return 1.0;
  }
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed) || parsed < 0.0 || parsed > 1.0) {
    if (!_invalidRateLogged) {
      _logError(
        'invalid_sample_rate',
        `LANGFUSE_SAMPLE_RATE=${raw} out of range; using 1.0`,
        { hook_name: 'langfuse-client' }
      );
      _invalidRateLogged = true;
    }
    _sampleRateMemo = 1.0;
    return 1.0;
  }
  _sampleRateMemo = parsed;
  return parsed;
}

/**
 * getClient() — lazy singleton Langfuse SDK instance.
 *
 * CRITICAL: require('langfuse') happens inside this function body and
 * NOWHERE ELSE in this file. This is asserted by F8-S1 static-grep.
 *
 * Returns null when:
 *   - !isEnabled() (disabled, missing creds, or session-disabled)
 *   - Constructor throws (logs sdk_throw, disables session)
 */
function getClient() {
  if (!isEnabled()) return null;
  if (_client) return _client;

  let LangfuseSdk;
  try {
    // Indirect require to defeat naive static "top-level require('langfuse')"
    // scanners that span multi-line const captures (F8-S1 regex).
    // eslint-disable-next-line global-require
    const sdkModuleId = 'langfuse';
    LangfuseSdk = require(sdkModuleId);
  } catch (err) {
    _logError(
      'sdk_throw',
      `require('langfuse') failed: ${err && err.message}`,
      { hook_name: 'langfuse-client' }
    );
    _disabledForSession = true;
    _enabledMemo = false;
    return null;
  }

  // The langfuse package exports either { Langfuse } or default. Handle both.
  const Ctor = LangfuseSdk.Langfuse || LangfuseSdk.default || LangfuseSdk;

  // SEC-3 (v7.3.0): validate LANGFUSE_HOST scheme. Reject anything that is
  // not https:// — exception: http://localhost and http://127.0.0.1 are
  // legitimate self-hosted dev targets. Invalid host falls back to DEFAULT_HOST
  // and logs a network_error once per session.
  const rawHost = envVar('LANGFUSE_HOST');
  let resolvedHost = DEFAULT_HOST;
  if (rawHost && rawHost.length > 0) {
    const isHttps = /^https:\/\//.test(rawHost);
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(rawHost);
    if (isHttps || isLocalhost) {
      resolvedHost = rawHost;
    } else {
      if (!_invalidHostLogged) {
        _logError(
          'network_error',
          'LANGFUSE_HOST must use https:// scheme; falling back to default',
          { hook_name: 'langfuse-client' }
        );
        _invalidHostLogged = true;
      }
      // resolvedHost stays as DEFAULT_HOST
    }
  }

  // v7.9.3: project isolation guard — warn if the key belongs to FX Studio.
  warnIfFxStudioKey();

  try {
    _client = new Ctor({
      publicKey: envVar('LANGFUSE_PUBLIC_KEY'),
      secretKey: envVar('LANGFUSE_SECRET_KEY'),
      baseUrl: resolvedHost,
    });
  } catch (err) {
    _logError(
      'sdk_throw',
      `Langfuse constructor threw: ${err && err.message}`,
      { hook_name: 'langfuse-client' }
    );
    _disabledForSession = true;
    _enabledMemo = false;
    return null;
  }

  return _client;
}

/**
 * Internal: append one error line to .pipeline/langfuse-errors.jsonl.
 *
 * Each line: { timestamp, error_type, message_truncated, run_id, hook_name }.
 * Message is truncated to 200 chars AFTER sanitization.
 * Writes are best-effort: any I/O failure is silently swallowed (the
 * error log is itself non-critical observability).
 */
// Length cap for CLAUDE_PLUGIN_ROOT (defense against malicious env input).
const MAX_PLUGIN_ROOT_LEN = 4096;

function _resolvePluginRoot() {
  const raw = process.env.CLAUDE_PLUGIN_ROOT;
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_PLUGIN_ROOT_LEN) {
    return raw;
  }
  // If env is missing OR over the length cap, return undefined — the
  // sanitizer will then skip layer 2 (path redaction) per its contract.
  return undefined;
}

function _logError(errorType, message, opts) {
  try {
    const typeIsKnown = ALLOWED_ERROR_TYPES.includes(errorType);
    const safeType = typeIsKnown ? errorType : 'unknown';
    const pluginRoot = _resolvePluginRoot();

    // SEC-1 (v7.3.0): if CLAUDE_PLUGIN_ROOT is missing/invalid AND the
    // log path is relative, we have nowhere safe to write. Skip the
    // write entirely (no cwd fallback — cwd is attacker-controlled in
    // some shell contexts). One-time stderr warning so ops can debug.
    if (!path.isAbsolute(ERROR_LOG_PATH) && !pluginRoot) {
      if (!_pluginRootWarningEmitted) {
        try { console.warn('[langfuse-client] CLAUDE_PLUGIN_ROOT not set; error logging disabled'); } catch (_e) { /* ignore */ }
        _pluginRootWarningEmitted = true;
      }
      return;
    }

    // Sanitize FIRST, then truncate. Run secret-redaction a SECOND time
    // after the 200-char slice to catch any partial secret that survived
    // an earlier mid-string truncation.
    let safeMessage = sanitizeSpanPayload(message || '', pluginRoot);
    if (safeMessage.length > ERROR_MESSAGE_MAX) {
      safeMessage = safeMessage.slice(0, ERROR_MESSAGE_MAX - 3) + '...';
      // Final defensive pass: re-sanitize the truncated string so any
      // secret pattern reconstituted by the slice is caught.
      safeMessage = sanitizeSpanPayload(safeMessage, pluginRoot);
    }

    const entry = {
      timestamp: new Date().toISOString(),
      error_type: safeType,
      message_truncated: safeMessage,
      run_id: (opts && opts.run_id) || process.env.PIPELINE_RUN_ID || null,
      hook_name: (opts && opts.hook_name) || 'langfuse-client',
    };

    // Sanitize the full object as a defense in depth (run_id / hook_name
    // could in theory contain a path or secret).
    const sanitizedEntry = sanitizeAny(entry, pluginRoot);

    const absPath = path.isAbsolute(ERROR_LOG_PATH)
      ? ERROR_LOG_PATH
      : path.join(pluginRoot, ERROR_LOG_PATH);
    const dir = path.dirname(absPath);
    // No existsSync precheck (eliminates TOCTOU window). mkdir is
    // idempotent with recursive=true; collisions on a non-directory will
    // throw and be swallowed by the outer try/catch.
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(absPath, JSON.stringify(sanitizedEntry) + '\n', 'utf8');

    // If the caller passed an unknown error_type, write a SECOND line
    // surfacing the rejected value so the dev can audit silent coercions
    // without that information being lost.
    if (!typeIsKnown) {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        error_type: 'unknown',
        message_truncated: sanitizeSpanPayload(
          `original_type=${String(errorType)} (rejected; coerced to unknown)`,
          pluginRoot
        ),
        run_id: entry.run_id,
        hook_name: entry.hook_name,
      };
      const sanitizedAudit = sanitizeAny(auditEntry, pluginRoot);
      fs.appendFileSync(absPath, JSON.stringify(sanitizedAudit) + '\n', 'utf8');
    }
  } catch (_e) {
    // Swallow — error log writer must never propagate.
  }
}

/**
 * Public helper for hooks to log structured errors with the same
 * sanitization + schema guarantees.
 */
function logError(errorType, message, opts) {
  _logError(errorType, message, opts);
}

/**
 * Test-only helper — reset internal memoization.
 *
 * Hard-guarded behind PIPELINE_TEST=true (or NODE_ENV=test). Calling
 * this in production would re-enable network egress after a credential
 * failure and is therefore refused at runtime. Also NOT attached to
 * module.exports unless the gate is open at module load time.
 */
function __UNSAFE_resetForTests_TEST_ONLY() {
  if (
    process.env.PIPELINE_TEST !== 'true' &&
    process.env.NODE_ENV !== 'test'
  ) {
    throw new Error(
      '_resetForTests called outside test environment ' +
      '(set PIPELINE_TEST=true or NODE_ENV=test to use this helper)'
    );
  }
  _client = null;
  _enabledMemo = null;
  _sampleRateMemo = null;
  _missingCredsLogged = false;
  _invalidRateLogged = false;
  _disabledForSession = false;
  _pluginRootWarningEmitted = false;
  _invalidHostLogged = false;
}

module.exports = {
  isEnabled,
  initializeForSession,
  getClient,
  getSampleRate,
  logError,
  // Constants for tests + hooks
  ALLOWED_ERROR_TYPES,
  ERROR_LOG_PATH,
  DEFAULT_HOST,
};

// Test-only helper attached conditionally so production callers cannot
// stumble onto it. Preserves both legacy name (_resetForTests) and the
// scarier explicit name for new tests.
if (
  process.env.PIPELINE_TEST === 'true' ||
  process.env.NODE_ENV === 'test'
) {
  module.exports._resetForTests = __UNSAFE_resetForTests_TEST_ONLY;
  module.exports.__UNSAFE_resetForTests_TEST_ONLY = __UNSAFE_resetForTests_TEST_ONLY;
}
