#!/usr/bin/env node
'use strict';

// =============================================================================
// lib/enforcement-status.cjs — v8.17.0 — AUDIT-004 — ENFORCEMENT_INACTIVE
// =============================================================================
// CRITICAL (deployment): the v8.16.0 audit run discovered that a plugin install
// where the canonical execution-gate hook (.claude/hooks/pipeline-arm-gate.cjs)
// is MISSING runs end-to-end with a positive final decision but NO actual
// enforcement — every governed action passed because no gate was on the wire.
// The teardown reported success and nobody noticed.
//
// This module is the cheap, deterministic probe that surfaces that condition.
// It is invoked by the SessionStart observer (enforcement-surface-verify-hook)
// and writes a dedicated `ENFORCEMENT_INACTIVE` event with HIGH severity to
// protocol-events.jsonl. The e2e-evaluator's HYGIENE_EVENT_SEVERITY weights
// that event at 1.0 so a run with enforcement inactive cannot reach a clean
// ProcessHygiene score, no matter how green the rest of the trace looks.
//
// SOFT-fail contract: ANY error degrades to `{ active: false, event: ... }` —
// we ALWAYS prefer to surface the doubt over silently swallowing the probe.
// The function NEVER throws.
//
// Pure (no env reads, no global state). Caller passes hooksDir +
// expectedCanonicalHook so unit tests can drive it without touching the real
// repo. Default expectation is `pipeline-arm-gate.cjs`.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CANONICAL_HOOK = 'pipeline-arm-gate.cjs';
const EVENT_NAME = 'ENFORCEMENT_INACTIVE';
const SEVERITY_LABEL = 'HIGH';

/**
 * Detect whether the canonical execution-gate hook is loaded in the install.
 *
 * @param {object} [opts]
 * @param {string} [opts.hooksDir] — absolute path to the install's hooks dir,
 *   typically `<plugin_root>/.claude/hooks`.
 * @param {string} [opts.expectedCanonicalHook] — file name (no path) of the
 *   canonical execution-gate hook. Defaults to `pipeline-arm-gate.cjs`.
 * @returns {{active:boolean, event?:string, severity?:string, reason?:string,
 *   probed_path?:string}}
 *   - active=true  -> canonical hook found on disk; event/severity omitted.
 *   - active=false -> hook missing OR hooksDir absent OR bad input; carries
 *     event='ENFORCEMENT_INACTIVE' + severity='HIGH' + a short reason so the
 *     downstream consumer (the SessionStart hook) can emit it verbatim.
 */
function detectEnforcementStatus(opts) {
  try {
    const hooksDir = opts && typeof opts.hooksDir === 'string' ? opts.hooksDir : '';
    const expected = (opts && typeof opts.expectedCanonicalHook === 'string' && opts.expectedCanonicalHook.trim())
      ? opts.expectedCanonicalHook.trim()
      : DEFAULT_CANONICAL_HOOK;

    if (!hooksDir) {
      return inactive('hooksDir not provided', '');
    }
    if (!fs.existsSync(hooksDir)) {
      return inactive(`hooksDir missing: ${path.basename(hooksDir)}`, hooksDir);
    }
    const probed = path.join(hooksDir, expected);
    if (!fs.existsSync(probed)) {
      return inactive(`canonical hook missing: ${expected}`, probed);
    }
    // Hook file present. We deliberately do NOT require/exec it here — a
    // present-but-broken hook still puts the matcher on the wire (the harness
    // will surface the load error), and require-ability is already covered by
    // the enforcement-surface-verify-hook's separate probe.
    return { active: true, probed_path: probed };
  } catch (e) {
    return inactive(`probe error: ${e && e.message ? e.message : 'unknown'}`, '');
  }
}

function inactive(reason, probedPath) {
  return {
    active: false,
    event: EVENT_NAME,
    severity: SEVERITY_LABEL,
    reason,
    probed_path: probedPath || '',
  };
}

module.exports = {
  detectEnforcementStatus,
  DEFAULT_CANONICAL_HOOK,
  EVENT_NAME,
  SEVERITY_LABEL,
};
