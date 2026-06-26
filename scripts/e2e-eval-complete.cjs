#!/usr/bin/env node
'use strict';

// =============================================================================
// scripts/e2e-eval-complete.cjs — close the self-improvement loop for a run.
// =============================================================================
// commands/self-eval.md calls this at the END of the approval loop to stamp the
// signed `e2e_eval_completed` marker into the run's sentinel-state. WHY it is
// needed: e2e-eval.json records the PAST run's glitches, which are immutable — so
// even after the user has addressed every glitch (fixes land for FUTURE runs),
// the Stop hook would keep seeing glitch_count>0 and re-block. The marker is the
// only honest "this run's backlog is addressed; let it close" signal.
//
// Usage:
//   node scripts/e2e-eval-complete.cjs            # discover run via active-run.json under cwd
//   node scripts/e2e-eval-complete.cjs <docPath>  # explicit run doc dir
//   PIPELINE_DOC_PATH=... node scripts/e2e-eval-complete.cjs
//
// Mirrors the hook's persist() (re-read → verify → mutate → re-sign → atomic-rename
// under the exclusive lock). Soft-fail: prints a one-line status, exits 0 on a
// best-effort no-op so it never wedges the loop.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

const signer = require('../lib/sentinel-state-signer.cjs');
const { withLock } = require('../lib/exclusive-lock.cjs');
const { MARKERS } = require('../lib/contracts/e2e-eval.cjs');

function resolveDocPath() {
  const arg = process.argv[2];
  if (arg && typeof arg === 'string' && arg.trim()) return path.resolve(arg.trim());
  const env = process.env.PIPELINE_DOC_PATH;
  if (env && typeof env === 'string' && env.trim()) return path.resolve(env.trim());
  // active-run.json pointer under cwd.
  try {
    const ptr = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.pipeline', 'active-run.json'), 'utf8'));
    if (ptr && typeof ptr.pipeline_doc_path === 'string') return path.resolve(ptr.pipeline_doc_path);
  } catch { /* no pointer */ }
  return null;
}

function persistCompleted(statePath, value) {
  const doWrite = () => {
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return false; }
    if (!state || typeof state !== 'object') return false;
    try {
      const v = signer.verifyState(state, { key: signer.readHmacKey() });
      if (!v.valid && !v.unsigned && !v.key_unavailable) return false; // do not write over corrupt
    } catch { return false; }
    state[MARKERS.COMPLETED] = value;
    const cur = Number.isFinite(state.state_version) ? state.state_version : 0;
    state.state_version = cur + 1;
    signer.writeSignedState(statePath, state, { key: signer.readHmacKey() });
    return true;
  };
  try { return withLock(statePath, doWrite); } catch { return false; }
}

function main() {
  const value = (process.argv[3] || 'true');
  const markerValue = value === 'true' ? true : String(value);
  const docPath = resolveDocPath();
  if (!docPath) { console.log('e2e-eval-complete: no run located (no docPath/active-run.json) — no-op'); return 0; }
  const statePath = path.join(docPath, 'sentinel-state.json');
  if (!fs.existsSync(statePath)) { console.log(`e2e-eval-complete: no sentinel-state at ${statePath} — no-op`); return 0; }
  const ok = persistCompleted(statePath, markerValue);
  console.log(ok ? `e2e-eval-complete: marked ${MARKERS.COMPLETED}=${markerValue}` : 'e2e-eval-complete: could not persist marker (best-effort no-op)');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { resolveDocPath, persistCompleted };
