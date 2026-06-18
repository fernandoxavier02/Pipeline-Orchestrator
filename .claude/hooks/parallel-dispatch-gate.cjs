#!/usr/bin/env node
'use strict';

// =============================================================================
// parallel-dispatch-gate.cjs — structural parallel-dispatch gate (v8.5.0, P5)
// =============================================================================
// PreToolUse:Agent hook. When the parent ARMS a parallel group it writes a
// signed marker `parallel_dispatch_expected = { group_id, dispatch_ids[],
// armed_ts }` into the active run's sentinel-state.json BEFORE spawning the
// group in a single message. Each member spawn passes through this gate.
//
// WARN-FIRST BY DESIGN (deliberate, and DIFFERENT from the deny-default
// brainstorm / plan-mode / sealed-spec / handoff guards):
//   This gate is about PARALLELISM EFFICIENCY, not correctness or security. A
//   serial dispatch of an armed group still produces CORRECT results — it is
//   only slower. Denying it by default would risk blocking legitimate work for
//   a non-correctness concern, so the default is to OBSERVE (emit an AUDIT
//   event) and let it through. Operators who want hard enforcement opt in with
//   PIPELINE_PARALLEL_ENFORCEMENT=deny. The brainstorm/plan-mode/sealed-spec
//   guards are deny-default precisely because THOSE gates protect correctness
//   and contract discipline; this one does not.
//
// FAIL-OPEN ON EVERYTHING (B1 CRYPTO lesson applied):
//   - No sentinel / unreadable / unparseable        → allow (exit 0).
//   - Signature absent/invalid/forged                → state is NOT authoritative;
//     do not treat the marker as armed → allow (never deny on unsigned state).
//   - parallel_dispatch_expected absent/null         → no group armed → allow.
//   - dispatch_ids is NOT an array (malformed)       → emit PARALLEL_DISPATCH_MALFORMED,
//     allow (fail-open; never block on malformed config).
//   - armed_ts invalid / window math NaN             → fail-open → allow.
//
// I/O contract matches the existing hooks exactly: stdin JSON → (optional)
// permissionDecision JSON on stdout → exit 0. A deny appears ONLY under deny
// enforcement; warn-first is the default. Audit append reuses the canonical
// 'ts' key (see appendProtocolEvent).
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }

// 5-second concurrency window (design D7.3): members spawned within this window
// of armed_ts are treated as one concurrent unit; a member arriving after the
// window has elapsed is a SERIAL dispatch of the group.
const CONCURRENCY_WINDOW_MS = 5000;

// INPUT-1 (folded B5 minor): the namespace this pipeline's agents live under.
// Group-member leaf matching is only honored for spawns inside this namespace so
// a third-party agent that happens to share a leaf name (e.g. an unrelated
// "security-scanner") is NOT silently treated as in-group. Mirrors the namespace
// guard in dispatch-guard.cjs.
const PIPELINE_NAMESPACE_PREFIX = 'pipeline-orchestrator:';

// CRYPTO-1 (folded B5 minor): only treat armed_ts as a usable timestamp when it
// is a full ISO-8601 instant (YYYY-MM-DDThh:mm:ss…). Date.parse is lenient and
// would coerce partials/garbage ("2026", "tomorrow") into a wrong epoch, making
// the concurrency-window math meaningless. A non-conforming armed_ts → unusable →
// fail-open (we cannot prove a serial violation).
const ISO_8601_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// appendProtocolEvent — best-effort AUDIT append. Reuses the canonical 'ts' key
// (same idiom as dispatch-guard.cjs:appendProtocolEvent). NEVER throws — an
// audit-write failure must not hard-block the user.
function appendProtocolEvent(docPath, event) {
  try {
    const line = JSON.stringify({ ...event, ts: new Date().toISOString() }).replace(/[\r\n]+/g, ' ');
    fs.appendFileSync(path.join(docPath, 'protocol-events.jsonl'), line + '\n');
  } catch { /* never throw from audit */ }
}

// SEC: sanitize any state-derived string before it lands in an audit detail or a
// permissionDecisionReason. State is attacker-influenceable — cap length and keep
// ONLY printable ASCII (drop control chars / newlines / non-ASCII). Mirrors
// dispatch-guard.cjs:sanitizeForReason.
function sanitizeForReason(value, max) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.slice(0, max || 64).replace(/[^\x20-\x7E]/g, '');
}

// Resolve the active run's doc dir. The hook reads sentinel-state.json from
// PIPELINE_DOC_PATH (the SSOT discovery key the test exercises directly).
function resolveDocDir() {
  const env = (process.env.PIPELINE_DOC_PATH || '').trim();
  return env || null;
}

// Read + verify the sentinel-state. Returns the verified state object, or null
// on ANY failure (missing / unreadable / unparseable / unsigned / forged).
// Applies the B1 CRYPTO lesson: an unsigned or invalidly-signed marker is NOT
// authoritative and must be treated as "no group armed" (fail-open).
function readAuthoritativeState(docDir) {
  if (!docDir) return null;
  const statePath = path.join(docDir, 'sentinel-state.json');
  try {
    if (!fs.existsSync(statePath)) return null;
    if (!signer || typeof signer.readVerifiedState !== 'function' || typeof signer.readHmacKey !== 'function') {
      // Signer unavailable → cannot establish authority → fail-open.
      return null;
    }
    // Read-only context: resolve the HMAC key WITHOUT generating/writing one
    // (readHmacKey never writes). Passing the explicit key keeps verifyState from
    // calling the write-capable getOrCreateHmacKey() default. If no key is on
    // disk, key is null → verification cannot be performed → fail-open below.
    const key = signer.readHmacKey();
    const { state, verification } = signer.readVerifiedState(statePath, { key, strict: false });
    if (!state || typeof state !== 'object') return null;
    // Treat unsigned OR invalid as non-authoritative (never deny on unsigned).
    if (!verification || verification.valid !== true) return null;
    if (verification.unsigned === true) return null;
    if (verification.key_unavailable === true) return null;
    return state;
  } catch {
    return null;
  }
}

// Pure decision. Returns { decision: 'allow' | 'deny', reason?, event? }.
function decideParallelGate(payload) {
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (payload.tool_name && payload.tool_name !== 'Agent') return { decision: 'allow' };

  const docDir = resolveDocDir();
  if (!docDir) return { decision: 'allow' }; // no run context → nothing to enforce

  const state = readAuthoritativeState(docDir);
  if (!state) return { decision: 'allow' }; // missing/unreadable/unsigned/forged → fail-open

  const expected = state.parallel_dispatch_expected;
  // No group armed → allow (covers absent, null, non-object).
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    return { decision: 'allow' };
  }

  // Malformed config: dispatch_ids must be an array. Fail-open + AUDIT.
  const ids = expected.dispatch_ids;
  if (!Array.isArray(ids)) {
    appendProtocolEvent(docDir, {
      event: 'PARALLEL_DISPATCH_MALFORMED',
      agent: 'parent',
      phase: 'pre-dispatch',
      detail: `parallel_dispatch_expected.dispatch_ids is not an array (group_id: ${sanitizeForReason(expected.group_id, 64) || '(none)'}) — fail-open`,
      decided_by: 'parallel-dispatch-gate',
    });
    return { decision: 'allow' };
  }

  // Empty group → no members to enforce → allow.
  if (ids.length === 0) return { decision: 'allow' };

  const subagent = (payload.tool_input && typeof payload.tool_input.subagent_type === 'string')
    ? payload.tool_input.subagent_type
    : '';

  // Member of the armed group → this spawn satisfies the group → allow. Match on
  // exact id OR leaf name (the parent may arm with leaf names while the harness
  // spawns the fully-qualified subagent_type, or vice-versa).
  //
  // INPUT-1 (folded B5 minor): leaf-name matching is ONLY honored when the
  // spawned subagent_type is inside this pipeline's namespace. An exact id match
  // is always honored (the parent armed that literal id), but a bare leaf
  // collision from a third-party agent (e.g. an unrelated 'security-scanner')
  // must NOT be treated as in-group. Mirrors dispatch-guard's namespace guard.
  const leaf = subagent.split(':').pop();
  const subagentNamespaced = subagent.startsWith(PIPELINE_NAMESPACE_PREFIX);
  const isMember = ids.some((id) => {
    if (typeof id !== 'string' || !id) return false;
    if (id === subagent) return true; // exact id match — always honored
    if (!subagentNamespaced) return false; // leaf match requires our namespace
    const idLeaf = id.split(':').pop();
    return (leaf && (idLeaf === leaf || id === leaf || subagent === idLeaf));
  });
  if (isMember) return { decision: 'allow' };

  // Out-of-group spawn while a group is armed. Determine whether we are still in
  // the concurrency window (parallel ok-ish) or past it (serial dispatch).
  // CRYPTO-1: require a full ISO-8601 instant before trusting Date.parse — a
  // partial/garbage armed_ts must not be coerced into a bogus epoch.
  const armedTs = (typeof expected.armed_ts === 'string' && ISO_8601_PREFIX.test(expected.armed_ts))
    ? Date.parse(expected.armed_ts)
    : NaN;
  const age = Number.isFinite(armedTs) ? (Date.now() - armedTs) : NaN;
  // If the window math is unusable (invalid armed_ts), fail-open: we cannot prove
  // a serial violation, and this gate never blocks on missing/bad evidence.
  // Within the window an out-of-group spawn is still a VIOLATION of the armed
  // group's parallelism contract (a member that should have been in the group
  // was not), so we record it; past the window it is a clear serial dispatch.
  const groupId = sanitizeForReason(expected.group_id, 64) || '(none)';
  const inWindow = Number.isFinite(age) && age >= 0 && age <= CONCURRENCY_WINDOW_MS;
  const windowNote = !Number.isFinite(age)
    ? 'armed_ts unusable'
    : (inWindow ? 'within 5s window' : 'past 5s window (serial)');

  appendProtocolEvent(docDir, {
    event: 'PARALLEL_DISPATCH_VIOLATION',
    agent: 'parent',
    phase: 'pre-dispatch',
    detail: `out-of-group spawn '${sanitizeForReason(subagent, 80) || '(none)'}' while group '${groupId}' is armed (${windowNote})`,
    decided_by: 'parallel-dispatch-gate',
  });

  // WARN-FIRST: deny ONLY under explicit opt-in. Default and 'warn' allow.
  const enforce = String(process.env.PIPELINE_PARALLEL_ENFORCEMENT || 'warn').toLowerCase();
  if (enforce === 'deny') {
    return {
      decision: 'deny',
      reason:
        `[PARALLEL_DISPATCH] '${sanitizeForReason(subagent, 80) || '(unknown)'}' was dispatched outside the armed ` +
        `parallel group '${groupId}'. Spawn the whole group's members in a SINGLE message (arm ` +
        `parallel_dispatch_expected, then dispatch all dispatch_ids together) to honor the parallelism contract. ` +
        `This deny fired because PIPELINE_PARALLEL_ENFORCEMENT=deny (default is warn-first).`,
    };
  }
  return { decision: 'allow', warn: true };
}

function handlePreToolUse(payload) {
  return decideParallelGate(payload);
}

// CLI entry point — stdin JSON → permissionDecision (deny only) → exit 0.
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      const result = handlePreToolUse(payload);
      if (result.decision === 'deny') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: result.reason,
          },
        }));
      }
      process.exit(0);
    } catch (err) {
      // Parse/internal error → fail-OPEN. This efficiency gate must never crash
      // the harness; a malformed payload is not evidence of a serial violation.
      process.stderr.write(`parallel-dispatch-gate error: ${err.message}\n`);
      process.exit(0);
    }
  });
}

module.exports = {
  decideParallelGate,
  handlePreToolUse,
  CONCURRENCY_WINDOW_MS,
};
