#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 — v8.17.0 — META — PIPELINE_AUTONOMOUS_RECOVERY_MODE escape
// =============================================================================
// The user-authorized one-shot escape: when PIPELINE_AUTONOMOUS_RECOVERY_MODE
// is set to "true", the chain-tied gate enforcement in
// .claude/hooks/force-pipeline-agents.cjs is converted from DENY to WARN for
// the current invocation. This unblocks the autonomous recovery path where a
// single dispatched agent needs to make multiple writes in sequence to
// implement broad fixes — the env flag is opt-in, scoped, and auditable.
//
// Contract:
//   - getEnforcementMode() with the flag set + global mode 'deny' -> 'warn'
//   - getEnforcementMode() with the flag UNSET keeps the existing default
//   - the conversion is recorded in stderr at least once for audit visibility
// =============================================================================

const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | ${label}`); }
  else console.log(`OK   | ${label}`);
}

// Capture stderr writes during a callback. Returns a string of all writes.
function captureStderr(fn) {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    return true;
  };
  try { fn(); } finally { process.stderr.write = orig; }
  return chunks.join('');
}

// Always isolate the env between cases.
function withEnv(overrides, fn) {
  const snap = {};
  for (const k of Object.keys(overrides)) snap[k] = process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fn(); } finally {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const parser = require(path.join(ROOT, '.claude', 'hooks', 'skill-frontmatter-parser.cjs'));

// --- Case 1: no flag set, mode stays 'warn' or default ---------------------
withEnv({
  PIPELINE_AUTONOMOUS_RECOVERY_MODE: undefined,
  PIPELINE_ENFORCEMENT: 'deny',
}, () => {
  const mode = parser.getEnforcementMode();
  check('Case1: flag unset -> mode stays "deny"', mode === 'deny');
});

// --- Case 2: flag=true downgrades 'deny' to 'warn' -------------------------
withEnv({
  PIPELINE_AUTONOMOUS_RECOVERY_MODE: 'true',
  PIPELINE_ENFORCEMENT: 'deny',
}, () => {
  let mode;
  const captured = captureStderr(() => { mode = parser.getEnforcementMode(); });
  check('Case2: flag=true + deny -> mode === "warn"', mode === 'warn');
  check('Case2: stderr carries the AUTONOMOUS_RECOVERY_MODE audit token',
    captured.includes('PIPELINE_AUTONOMOUS_RECOVERY_MODE'));
});

// --- Case 3: flag=true does NOT escalate 'warn' mode -----------------------
withEnv({
  PIPELINE_AUTONOMOUS_RECOVERY_MODE: 'true',
  PIPELINE_ENFORCEMENT: 'warn',
}, () => {
  const mode = parser.getEnforcementMode();
  check('Case3: flag=true + warn -> mode === "warn" (no escalation)', mode === 'warn');
});

// --- Case 4: only the literal "true" activates -----------------------------
withEnv({
  PIPELINE_AUTONOMOUS_RECOVERY_MODE: 'TRUE',
  PIPELINE_ENFORCEMENT: 'deny',
}, () => {
  // Case-sensitive "true" only — explicit; "TRUE" must NOT activate (defense
  // against typos / shell quirks broadening the escape footprint).
  const mode = parser.getEnforcementMode();
  check('Case4: flag=TRUE (uppercase) -> mode stays "deny"', mode === 'deny');
});

// --- Case 5: bogus flag values do not activate -----------------------------
withEnv({
  PIPELINE_AUTONOMOUS_RECOVERY_MODE: '1',
  PIPELINE_ENFORCEMENT: 'deny',
}, () => {
  const mode = parser.getEnforcementMode();
  check('Case5: flag=1 -> mode stays "deny" (only "true" activates)', mode === 'deny');
});

process.exit(failures > 0 ? 1 : 0);
