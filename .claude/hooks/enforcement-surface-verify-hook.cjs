#!/usr/bin/env node
'use strict';

// =============================================================================
// enforcement-surface-verify-hook.cjs — v8.12.0 (SessionStart) — spec 006 Batch 6
// =============================================================================
// ASSURANCE: a THIRD SessionStart observer hook (sibling of
// pipeline-session-arm-hook.cjs and cleanup-orphan-sentinel-state-hook.cjs) that
// self-verifies, at load time, that the enforcement surface is actually present.
//
// Batches 1-5 shipped LAYER A (the arming hard block) and LAYER B (the
// in-execution corrective). Both only have teeth if the surface is loaded when a
// session starts. The motivating failure (R7.2): a mirror checkout where the
// plugin was not installed-active — the SessionStart banner never fired and the
// PreToolUse gates were absent, so every hole reopened at once, silently. This
// hook surfaces an auditable signal when that happens.
//
// THREE postures (the 6 approved scenarios):
//   - surface present                       -> SILENT pass (no event, continue).
//   - surface degraded + plugin present     -> WARN: emit exactly ONE
//     (non-strict, the default)                ENFORCEMENT_SURFACE_UNVERIFIED.
//   - surface degraded + plugin present     -> BLOCK verdict (the ONLY block path)
//     + strict                                 + record the event.
//   - plugin ABSENT (any strict)            -> warn-at-most, NEVER block — an
//                                              uninstalled checkout is legitimate.
//
// SessionStart CANNOT deny in this harness — both shipped SessionStart hooks
// confirm it (pipeline-session-arm-hook: "SessionStart CANNOT deny — this hook
// only WRITES the deterministic state the PreToolUse arm-gate enforces";
// cleanup-orphan only archives, never denies). So the S4 BLOCK is NOT a
// SessionStart deny: the pure brain RETURNS decision:'block' (the
// harness-independent SSOT the test binds to) AND the handler records SIGNED
// block state — exactly the lib/pipeline-arm.cjs -> pipeline-arm-gate.cjs
// precedent. The signed state is the deterministic artifact a PreToolUse
// consumer would enforce; the pure-brain verdict is what proves S4 without
// depending on the harness's SessionStart decision shape.
//
// SCOPE NOTE (ARCH-1): Batch 6 ships ONLY this SessionStart observer — it WRITES
// the signed enforcement-surface-block.json artifact. The PreToolUse CONSUMER that
// would READ that artifact and actually stop governed work is NOT shipped in
// Batch 6; it is a documented backlog follow-up (mirroring the
// lib/pipeline-arm.cjs -> pipeline-arm-gate.cjs producer/consumer split). Until
// that consumer ships, the S4 BLOCK is an auditable VERDICT + recorded artifact,
// not a live deny. See the backlog comment near recordBlockState.
//
// SSOT REUSE (no second copy of anything):
//   - appendProtocolEvent / sanitizeForReason: same idiom as
//     parallel-dispatch-gate.cjs (canonical 'ts' key, newline-stripped +
//     length-capped detail, never throws).
//   - signing: lib/sentinel-state-signer.cjs — the SAME HMAC envelope arm-pending
//     and sentinel-state use. No second signature scheme.
//   - strict env: PIPELINE_ENFORCEMENT_SURFACE_ENFORCEMENT, default = warn-only,
//     '=deny' enables the block path — mirrors PIPELINE_PARALLEL_ENFORCEMENT.
//
// SAFE BY CONSTRUCTION: NEVER throws, ALWAYS exits 0, NEVER denies on stdout. Any
// malformed payload / unreadable file / parse error degrades to a no-op continue.
// A failed self-check is "could not verify", NOT "surface broken" — it never
// fabricates a block from its own inability to read.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

// Optional require: the signer is reused to sign the recorded block state. If it
// is unavailable the hook still works (records unsigned state, tolerated) — the
// observer must never crash because a SSOT module is missing.
let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }

// AUDIT-004 (v8.17.0): dedicated enforcement-status probe. The pre-existing
// ENFORCEMENT_SURFACE_UNVERIFIED event covers broader surface degradation, but
// the specific case "canonical execution-gate hook missing" deserves its own
// HIGH-severity event so the e2e-evaluator can weight it deterministically
// (HYGIENE_EVENT_SEVERITY.ENFORCEMENT_INACTIVE === 1.0). Optional require —
// the observer stays safe even when the lib is unavailable.
let enforcementStatusLib = null;
try { enforcementStatusLib = require('../../lib/enforcement-status.cjs'); } catch { enforcementStatusLib = null; }

// ARCH-002 (v8.18.1): import cwd-sandbox from cleanup-orphan (the SSOT) instead
// of maintaining a local copy. Fail-closed: if the require fails, isCwdSandboxOk
// returns false (skip the write) — coherent with SEC posture.
let cwdSandboxLib = null;
try { cwdSandboxLib = require('./cleanup-orphan-sentinel-state-hook.cjs'); } catch { cwdSandboxLib = null; }

// EVENT name + strict env token — both pinned by the contract / locked test.
const EVENT_NAME = 'ENFORCEMENT_SURFACE_UNVERIFIED';
const STRICT_ENV = 'PIPELINE_ENFORCEMENT_SURFACE_ENFORCEMENT';
const DECIDED_BY = 'enforcement-surface-verify-hook';

// SEC (ESV-1): the test-injectable `surface`/`pluginPresent` payload fields are a
// BACKDOOR in production — a hostile SessionStart payload claiming surface:'healthy'
// could suppress a real degraded-surface WARN/BLOCK. They are honored ONLY when this
// explicit opt-in env discriminator is set (the locked test sets it). In production
// (env unset) the injected fields are IGNORED entirely and the real on-disk probes
// ALWAYS run. SessionStart payloads are attacker-controllable; the env is not.
const TEST_INJECT_ENV = 'PIPELINE_ENFORCEMENT_SURFACE_TEST_INJECT';
function isSurfaceInjectAllowed(env) {
  return String((env || process.env || {})[TEST_INJECT_ENV] || '') === '1';
}

// The pinned enforcement surface (read-only probe targets). File presence is
// checked relative to the resolved plugin root; lib modules are require-ability
// probed (a present-but-broken module is as bad as a missing one).
const GATE_HOOK_FILES = ['.claude/hooks/pipeline-arm-gate.cjs'];
const GATE_LIB_MODULES = [
  '../../lib/pipeline-arm.cjs',
  '../../lib/step-ledger.cjs',
  '../../lib/corrective-dispatch.cjs',
  '../../lib/sentinel-state-signer.cjs',
];

// ─── SSOT-idiom helpers (mirrored from parallel-dispatch-gate.cjs) ───────────

// SEC: sanitize any manifest/state-derived string before it lands in an event
// detail or a block reason. Keep ONLY printable ASCII (drop control chars /
// newlines / non-ASCII) and cap length. Mirrors
// parallel-dispatch-gate.cjs:sanitizeForReason.
function sanitizeForReason(value, max) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.slice(0, max || 64).replace(/[^\x20-\x7E]/g, '');
}

// appendProtocolEvent — best-effort AUDIT append to <docPath>/protocol-events.jsonl.
// Reuses the canonical 'ts' key (same idiom as parallel-dispatch-gate.cjs).
// NEVER throws — an audit-write failure must not become a new failure mode.
function appendProtocolEvent(docPath, event) {
  try {
    if (typeof docPath !== 'string' || !docPath) return;
    const line = JSON.stringify({ ...event, ts: new Date().toISOString() }).replace(/[\r\n]+/g, ' ');
    fs.appendFileSync(path.join(docPath, 'protocol-events.jsonl'), line + '\n');
  } catch { /* never throw from audit */ }
}

// ─── PURE DECISION BRAIN (unit-testable, NO I/O) ─────────────────────────────
//
// ctx = { bannerPresent, gatesLoadable, pluginPresent, strict }
// Returns { decision:'continue'|'block', warn:boolean, reason?, missing?[] }.
//
// DECISION TABLE (exact, pinned by the locked test):
//   present (banner && gates && plugin) -> { continue, warn:false }   SILENT
//   degraded + plugin ABSENT            -> { continue }               NEVER block
//   degraded + plugin present + !strict -> { continue, warn:true }    WARN
//   degraded + plugin present +  strict -> { block,    warn:true }    BLOCK (only)
//
// Safe no-op on a non-object ctx: a could-not-verify input is NEVER coerced into
// a block.
function decideSurfaceVerify(ctx) {
  // S5(b): a non-object ctx is "could not verify", never a block.
  if (!ctx || typeof ctx !== 'object') {
    return { decision: 'continue', warn: false };
  }

  const bannerPresent = ctx.bannerPresent === true;
  const gatesLoadable = ctx.gatesLoadable === true;
  // pluginPresent gates the whole block path: an uninstalled checkout is a valid
  // state, so an absent plugin is never escalated. Treat anything but an explicit
  // true as "present" ONLY when the surface is healthy; for the degraded branch
  // the absent case must be explicit-false to never block. We read it directly.
  const pluginPresent = ctx.pluginPresent === true;
  const strict = ctx.strict === true;

  // Which surface pieces are missing (named in missing[] / reason).
  const missing = [];
  if (!bannerPresent) missing.push('banner');
  if (!gatesLoadable) missing.push('gates');

  // S1: a present surface (banner + gates) is SILENT — even under strict.
  if (bannerPresent && gatesLoadable) {
    return { decision: 'continue', warn: false };
  }

  // Surface is degraded from here on.

  // S3: plugin ABSENT -> warn-at-most, NEVER block, even under strict. An
  // uninstalled environment never opted into enforcement (R7.2 false-block guard).
  if (!pluginPresent) {
    return {
      decision: 'continue',
      warn: false,
      missing,
      reason: sanitizeForReason(
        `enforcement surface degraded but plugin absent (uninstalled checkout) — not verified; missing: ${missing.join(', ') || 'unknown'}`,
        240,
      ),
    };
  }

  // Plugin present + degraded surface.
  const reason = sanitizeForReason(
    `enforcement surface UNVERIFIED — missing: ${missing.join(', ') || 'unknown'}`,
    240,
  );

  // S4: plugin present + degraded + STRICT -> the ONLY block path.
  if (strict) {
    return { decision: 'block', warn: true, missing, reason };
  }

  // S2: plugin present + degraded + non-strict -> WARN, never block (default).
  return { decision: 'continue', warn: true, missing, reason };
}

// ─── I/O SURFACE PROBES (separable so the test can inject ctx) ───────────────
//
// The plugin root is resolved from this hook's own module location: the hook
// lives at <root>/.claude/hooks/enforcement-surface-verify-hook.cjs, so the root
// is two directories up. This mirrors the cleanup hook's "resolve from own
// module location" posture.
function resolvePluginRoot() {
  try {
    return path.resolve(__dirname, '..', '..');
  } catch {
    return null;
  }
}

// plugin PRESENT = the hook's own plugin root resolves AND
// .claude-plugin/plugin.json is found there; ABSENT otherwise.
function probePluginPresent(pluginRoot) {
  try {
    if (typeof pluginRoot !== 'string' || !pluginRoot) return false;
    return fs.existsSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
  } catch {
    return false;
  }
}

// banner PRESENT = a SessionStart type:"prompt" entry whose text identifies the
// plugin exists in <pluginRoot>/hooks/hooks.json.
function probeBannerPresent(pluginRoot) {
  try {
    if (typeof pluginRoot !== 'string' || !pluginRoot) return false;
    const manifestPath = path.join(pluginRoot, 'hooks', 'hooks.json');
    if (!fs.existsSync(manifestPath)) return false;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const ss = (manifest && manifest.hooks && manifest.hooks.SessionStart) || [];
    if (!Array.isArray(ss)) return false;
    return ss.some((group) => Array.isArray(group && group.hooks)
      && group.hooks.some((h) => h && h.type === 'prompt'
        && typeof h.prompt === 'string'
        && /pipeline orchestrator/i.test(h.prompt)));
  } catch {
    return false;
  }
}

// gates LOADABLE = the pinned PreToolUse gate hook files exist on disk AND the
// core enforcement lib modules are require-able (require-ability, not just
// existence — a present-but-broken module is as bad as a missing one).
function probeGatesLoadable(pluginRoot) {
  try {
    if (typeof pluginRoot !== 'string' || !pluginRoot) return false;
    for (const rel of GATE_HOOK_FILES) {
      if (!fs.existsSync(path.join(pluginRoot, rel))) return false;
    }
    for (const mod of GATE_LIB_MODULES) {
      try {
        require.resolve(mod);
        require(mod);
      } catch {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Derive strict from the env var (mirrors PIPELINE_PARALLEL_ENFORCEMENT): default
// warn-only; only the explicit '=deny' token enables the block path.
function isStrictFromEnv(env) {
  const raw = String((env || process.env || {})[STRICT_ENV] || 'warn').toLowerCase();
  return raw === 'deny';
}

// Build the probe ctx.
//
// SEC (ESV-1): the test drives degraded/healthy/absent WITHOUT mutating the real
// repo via a test-injectable payload contract: an explicit `surface`
// ('healthy' | 'degraded') and/or `pluginPresent` on the payload. BECAUSE a
// SessionStart payload is attacker-controllable, those injected fields are
// honored ONLY when the explicit opt-in env discriminator
// PIPELINE_ENFORCEMENT_SURFACE_TEST_INJECT==='1' is set (which only the locked
// test sets). In ALL other cases — production / no test env — the injected fields
// are IGNORED ENTIRELY and the real on-disk probes ALWAYS run. A hostile payload
// claiming surface:'healthy' therefore CANNOT suppress a real degraded-surface
// WARN/BLOCK in production.
function buildSurfaceCtx(payload, strict) {
  const pluginRoot = resolvePluginRoot();

  // Hard gate: injected fields are read ONLY under the explicit test opt-in env.
  const injectAllowed = isSurfaceInjectAllowed(process.env);

  // Test-injectable signals (S2/S3/S4/S6 use these to simulate a degraded surface
  // without touching the real repo). Only honored when (a) the env opt-in is set
  // AND (b) the field is explicitly present.
  const hasSurfaceSignal = injectAllowed
    && payload && typeof payload === 'object'
    && typeof payload.surface === 'string';
  const hasPluginSignal = injectAllowed
    && payload && typeof payload === 'object'
    && typeof payload.pluginPresent === 'boolean';

  if (hasSurfaceSignal) {
    const degraded = payload.surface === 'degraded';
    return {
      bannerPresent: !degraded,
      gatesLoadable: !degraded,
      // When the surface is injected, plugin presence follows the explicit signal
      // if given, else falls back to the real plugin probe.
      pluginPresent: hasPluginSignal ? payload.pluginPresent : probePluginPresent(pluginRoot),
      strict,
    };
  }

  // Live path: real on-disk probes. In production (env unset) this is the ONLY
  // path — the injected fields above are never consulted.
  return {
    bannerPresent: probeBannerPresent(pluginRoot),
    gatesLoadable: probeGatesLoadable(pluginRoot),
    pluginPresent: hasPluginSignal ? payload.pluginPresent : probePluginPresent(pluginRoot),
    strict,
  };
}

// SEC (ESV-2): cwd write sandbox. The payload's cwd is attacker-controllable, and
// resolveDocDir feeds it to appendProtocolEvent / recordBlockState (which WRITE
// files). The deny-list + realpath sandbox check lives in the cleanup-orphan hook
// (the SSOT) and is imported via cwdSandboxLib above (ARCH-002, v8.18.1).
// Fail-closed: if the import is unavailable, isCwdSandboxOk returns false.
function isCwdSandboxOk(cwd) {
  if (!cwdSandboxLib || typeof cwdSandboxLib.isCwdSandboxOk !== 'function') return false;
  return cwdSandboxLib.isCwdSandboxOk(cwd);
}

// Resolve where the event / block state are written. The test reads
// protocol-events.jsonl from the PAYLOAD's cwd, so that is the SSOT doc dir.
// SEC (ESV-2): returns null (skip the write) when cwd is not sandbox-ok.
function resolveDocDir(payload) {
  if (payload && typeof payload === 'object' && typeof payload.cwd === 'string' && payload.cwd) {
    if (!isCwdSandboxOk(payload.cwd)) return null;
    return payload.cwd;
  }
  return null;
}

// Record SIGNED block state for the strict block path (the arm-gate precedent):
// the pure-brain verdict is the deterministic SSOT, and this signed artifact is
// what a PreToolUse consumer would enforce. Best-effort: never throws.
//
// BACKLOG (ARCH-1): the PreToolUse consumer that READS this
// enforcement-surface-block.json and turns the recorded verdict into a live deny
// is NOT shipped in Batch 6 — it is a future follow-up (the future
// `enforcement-surface-block-gate` consumer, mirroring how pipeline-arm-gate.cjs
// consumes the arm-pending marker written by lib/pipeline-arm.cjs). This function
// only PRODUCES the artifact; wiring the consumer is tracked as Batch 6+ backlog.
//
// SSOT for the unsigned-vs-tampered distinction (the future consumer MUST follow
// this, NOT a parallel `signed` field): lib/sentinel-state-signer.cjs::verifyState.
// It already disambiguates the two cases the consumer cares about —
//   - UNSIGNED-TOLERATED (no durable HMAC key was available when this artifact was
//     written): verifyState returns { unsigned: true } (valid unless
//     PIPELINE_HMAC_STRICT). This is the no-key path below, where the artifact is
//     written PLAIN — no `__signature`, per the codebase-wide convention that
//     "unsigned" is expressed by the ABSENCE of `__signature`.
//   - TAMPERED (a real `__signature` was present but stripped or altered by an
//     attacker): verifyState returns { valid: false }, DISTINCT from unsigned.
// So the consumer detects unsigned-tolerated via verifyState().unsigned === true,
// never via an additive `signed` field — that field would be a redundant parallel
// scheme diverging from the signer SSOT. Do NOT reintroduce it.
function recordBlockState(docDir, verdict) {
  try {
    if (typeof docDir !== 'string' || !docDir) return;
    const state = {
      enforcement_surface_block: {
        decision: 'block',
        reason: sanitizeForReason(verdict && verdict.reason, 240),
        missing: Array.isArray(verdict && verdict.missing)
          ? verdict.missing.map((m) => sanitizeForReason(m, 32))
          : [],
        recorded_by: DECIDED_BY,
        recorded_at: new Date().toISOString(),
      },
    };
    // SEC (ESV-3): when a durable HMAC key exists, sign via the SSOT signer so the
    // artifact carries a real `__signature`. When none exists, write the state
    // PLAIN UNSIGNED — no `__signature`, the codebase-wide convention for unsigned
    // state (NOT an additive `signed` marker). A future consumer distinguishes
    // tolerated-unsigned (no key) from tampered (signature stripped) via
    // lib/sentinel-state-signer.cjs::verifyState (unsigned:true vs valid:false), the
    // SSOT — see the BACKLOG note above. Never throw on signer absence — the
    // observer must not become a new failure mode.
    let toWrite = state;
    if (signer && typeof signer.signState === 'function') {
      try {
        const key = typeof signer.getOrCreateHmacKey === 'function' ? signer.getOrCreateHmacKey() : null;
        if (key) {
          toWrite = signer.signState(state, key);
        }
      } catch { toWrite = state; }
    }
    const p = path.join(docDir, 'enforcement-surface-block.json');
    const tmp = `${p}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2));
      fs.renameSync(tmp, p);
    } catch {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  } catch { /* never throw — observer must not become a failure mode */ }
}

// ─── I/O HANDLER ─────────────────────────────────────────────────────────────
//
// Reads the manifest + probes the surface, calls decideSurfaceVerify, and on
// warn===true records EXACTLY ONE ENFORCEMENT_SURFACE_UNVERIFIED line. On a
// block verdict it ALSO records signed block state. Returns a continue-shaped
// result (SessionStart never denies). Safe no-op on malformed input.

// ARCH-001 (v8.18.1): dedicated ENFORCEMENT_INACTIVE probe extracted from
// handleSessionStart for SRP. Independent of the broader surface check —
// fires ONE protocol-event line whenever the canonical execution-gate hook
// is missing from the active install. Safe no-op: never throws.
function probeEnforcementInactive(payload) {
  try {
    if (!enforcementStatusLib || typeof enforcementStatusLib.detectEnforcementStatus !== 'function') return;
    const pluginRoot = resolvePluginRoot();
    if (!pluginRoot) return;
    const hooksDir = path.join(pluginRoot, '.claude', 'hooks');
    const status = enforcementStatusLib.detectEnforcementStatus({
      hooksDir,
      expectedCanonicalHook: enforcementStatusLib.DEFAULT_CANONICAL_HOOK,
    });
    if (status && status.active === false) {
      const docDir = resolveDocDir(payload);
      appendProtocolEvent(docDir, {
        event: enforcementStatusLib.EVENT_NAME,
        agent: 'session',
        phase: 'session-start',
        decided_by: 'enforcement-status',
        decision: 'TRIGGERED',
        severity: enforcementStatusLib.SEVERITY_LABEL,
        detail: sanitizeForReason(
          status.reason || 'canonical execution-gate hook missing from install', 240),
        probed_path: sanitizeForReason(status.probed_path || '', 240),
      });
    }
  } catch { /* never throw from the observer */ }
}

function handleSessionStart(payload) {
  try {
    // S5: malformed/empty/missing payload -> safe no-op continue. No event.
    if (!payload || typeof payload !== 'object') {
      return { continue: true };
    }

    const strict = isStrictFromEnv(process.env);
    const ctx = buildSurfaceCtx(payload, strict);
    const verdict = decideSurfaceVerify(ctx);

    probeEnforcementInactive(payload);

    // could-not-verify / silent-on-health -> nothing recorded, continue.
    if (!verdict || verdict.warn !== true) {
      return { continue: true };
    }

    const docDir = resolveDocDir(payload);

    // Record EXACTLY ONE ENFORCEMENT_SURFACE_UNVERIFIED line (S2 + S4). AUDIT/WARN
    // class -> protocol-events.jsonl (NOT a gate-decisions.jsonl row).
    appendProtocolEvent(docDir, {
      event: EVENT_NAME,
      agent: 'session',
      phase: 'session-start',
      decided_by: DECIDED_BY,
      decision: verdict.decision === 'block' ? 'BLOCKED' : 'TRIGGERED',
      detail: sanitizeForReason(verdict.reason
        || `enforcement surface unverified (missing: ${(verdict.missing || []).join(', ') || 'unknown'})`, 240),
      missing: Array.isArray(verdict.missing)
        ? verdict.missing.map((m) => sanitizeForReason(m, 32))
        : [],
      strict,
    });

    // S4: the strict block path additionally records signed block state (the
    // arm-gate precedent). SessionStart still NEVER denies on stdout.
    if (verdict.decision === 'block') {
      recordBlockState(docDir, verdict);
    }

    // ALWAYS continue: SessionStart cannot deny.
    return { continue: true };
  } catch {
    // Hard catch-all: the observer must never throw / never block.
    return { continue: true };
  }
}

// ─── CLI entry point: read JSON payload from stdin -> continue -> exit 0 ──────
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { input += c; });
  process.stdin.on('end', () => {
    try {
      let payload = {};
      try { payload = JSON.parse(input || '{}'); } catch { payload = {}; }
      const result = handleSessionStart(payload);
      // Emit a continue-shaped result; NEVER a block decision on stdout.
      process.stdout.write(JSON.stringify(result || { continue: true }));
    } catch {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
    process.exit(0);
  });
  process.stdin.on('error', () => {
    process.stdout.write(JSON.stringify({ continue: true }));
    process.exit(0);
  });
}

module.exports = {
  decideSurfaceVerify,
  handleSessionStart,
  // surface-check helpers exported for unit testing / reuse
  resolvePluginRoot,
  probePluginPresent,
  probeBannerPresent,
  probeGatesLoadable,
  isStrictFromEnv,
  buildSurfaceCtx,
  sanitizeForReason,
  EVENT_NAME,
  STRICT_ENV,
};
