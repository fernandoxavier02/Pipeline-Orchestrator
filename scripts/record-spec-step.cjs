#!/usr/bin/env node
'use strict';

// scripts/record-spec-step.cjs (Batch B2 — per-step spec-authoring progress stamping)
//
// Records a single spec-authoring step's status into a run's HMAC-signed sentinel-state.json by
// reading the current state, merging spec_authoring_progress[step]=status, and re-signing
// (writeSignedState overwrites, so we read-merge-resign to preserve the rest of the state and the
// signature integrity — the same pattern as scripts/record-plan-gate.cjs).
//
// Usage (called by the spec-controller via Bash, per-step, before advancing):
//   node record-spec-step.cjs <pipelineDocPath> <step> <status>
//
//   step   ∈ CLOSED vocabulary { intake, explore, alternatives, ideation, interrogator,
//            requirements, design, research, tasks, review-round, converged }
//   status ∈ { done, auto-skipped }
//
// On success prints {ok:true,...} and exits 0. On too-few-args prints a usage hint to stderr and
// exits 2. On a validation/IO error returns/prints { ok:false, error } (CLI exit 1).
//
// Back-compat: a run with no spec_authoring_progress field is a non-spec run and is unaffected
// (the subobject is created fresh only when this script stamps a step). The HMAC signer covers the
// whole object, so the new field is signed automatically — no signer change.

const fs = require('node:fs');
const path = require('node:path');
const { writeSignedState } = require(path.join(__dirname, '..', 'lib', 'sentinel-state-signer.cjs'));

// Closed vocabulary of step names. Superset of the 9 lifecycle steps from D1/the plan, plus the
// two Step-8 review-loop concepts (review-round, converged) the spec-controller stamps. Unknown
// names are rejected — this is the anti-invention guard for the authoring-progress aggregate.
const STEP_NAMES = new Set([
  'intake',
  'explore',
  'alternatives',
  'ideation',
  'interrogator',
  'requirements',
  'design',
  'research',
  'tasks',
  'review-round',
  'converged',
]);

// Closed vocabulary of status values. "pending" is the implicit default for an absent sub-key
// (per D1) and is NOT a writable status here — a step is only ever stamped done or auto-skipped.
const STATUS_VALUES = new Set(['done', 'auto-skipped']);

// INPUT-2 cap: error messages echo caller-supplied values; cap the leaked
// fragment so a hostile/huge argument cannot bloat logs or the stderr line.
function capped(x) { return String(x).slice(0, 64); }

// INPUT-1 path-traversal guard. The threat (adversarial review): a relative or
// '..'-containing pipelineDocPath lets a caller resolve statePath OUTSIDE its
// own run dir and clobber ANOTHER run's signed sentinel-state.json.
//
// Defense: resolve the path, then reject if either
//   (a) the original pipelineDocPath carries a '..' segment (the traversal
//       vector named in the finding — a relative parent-escape), OR
//   (b) the resolved statePath is not contained directly under the resolved
//       pipelineDocPath (catches '..' smuggled past normalization / a docPath
//       that itself resolves to escape its base).
// An allowed run root (pipeline-runs/ or .pipeline/ under cwd) is recognized
// and always permitted; otherwise an absolute, traversal-free path is also
// accepted (the F2 contract seeds runs under the OS temp dir, which is a
// legitimate caller location and must stay green). We reject the EXPLOITABLE
// case — '..'-based escape — not every path outside the two canonical roots.
function resolveSafeStatePath(pipelineDocPath) {
  const segments = String(pipelineDocPath).split(/[\\/]+/);
  if (segments.includes('..')) {
    return { ok: false, error: 'pipelineDocPath outside allowed run root' };
  }
  const resolvedDoc = path.resolve(pipelineDocPath);
  const statePath = path.resolve(resolvedDoc, 'sentinel-state.json');
  // statePath must be exactly <resolvedDoc>/sentinel-state.json — anything else
  // means a '..' (or absolute) segment escaped the intended directory.
  if (path.dirname(statePath) !== resolvedDoc) {
    return { ok: false, error: 'pipelineDocPath outside allowed run root' };
  }
  return { ok: true, statePath, resolvedDoc };
}

function readState(statePath) {
  let raw;
  try { raw = fs.readFileSync(statePath, 'utf8'); }
  catch (_) { return {}; } // missing file → fresh state
  try {
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (_) {
    // present but corrupt → refuse to clobber (would destroy run_id / orchestrator_decision / etc.).
    // Explicit error rather than silent fail-open (B1 lesson).
    throw new Error('refusing to overwrite corrupt sentinel-state.json (JSON parse failed)');
  }
}

function recordSpecStep(pipelineDocPath, step, status) {
  if (typeof pipelineDocPath !== 'string' || !pipelineDocPath) {
    return { ok: false, error: 'pipelineDocPath required' };
  }
  if (typeof step !== 'string' || !STEP_NAMES.has(step)) {
    return { ok: false, error: `unknown step: ${capped(step)}` };
  }
  if (typeof status !== 'string' || !STATUS_VALUES.has(status)) {
    return { ok: false, error: `invalid status: ${capped(status)}` };
  }

  // INPUT-1: validate the path BEFORE any read/write so a traversal attempt can
  // never touch another run's sentinel.
  const safe = resolveSafeStatePath(pipelineDocPath);
  if (!safe.ok) return { ok: false, error: safe.error };
  const statePath = safe.statePath;

  let state;
  try { state = readState(statePath); }
  catch (err) { return { ok: false, error: err.message }; }

  // DATA-1: distinguish an INITIALIZED run (has a manifest.yaml) that is missing
  // its sentinel-state.json — that is a corruption we must NOT paper over by
  // writing a gutted state with only spec_authoring_progress (dropping run_id /
  // pipeline_active / orchestrator_decision). A brand-new/fresh run dir (no
  // manifest, no prior sentinel — what F2 S1 exercises) keeps current behavior.
  if (Object.keys(state).length === 0 && !fs.existsSync(statePath)) {
    const manifestPath = path.join(safe.resolvedDoc, 'manifest.yaml');
    if (fs.existsSync(manifestPath)) {
      return { ok: false, error: 'sentinel-state.json missing from an initialized run dir' };
    }
  }

  const prev = (state.spec_authoring_progress && typeof state.spec_authoring_progress === 'object')
    ? state.spec_authoring_progress
    : {};
  const progress = { ...prev, [step]: status }; // last write wins → idempotent re-stamp

  const merged = {
    ...state,
    spec_authoring_progress: progress,
    schema_version: 2,
    updated_at: new Date().toISOString(),
  };
  try { writeSignedState(statePath, merged); }
  catch (err) { return { ok: false, error: `failed to write signed state: ${err.message}` }; }

  return { ok: true, step, status, spec_authoring_progress: progress };
}

module.exports = { recordSpecStep, STEP_NAMES, STATUS_VALUES };

if (require.main === module) {
  const [docPath, step, status] = process.argv.slice(2);
  if (!docPath || !step || !status) {
    process.stderr.write('usage: record-spec-step.cjs <pipelineDocPath> <step> <status>\n');
    process.exit(2);
  }
  const res = recordSpecStep(docPath, step, status);
  if (res.ok) {
    process.stdout.write(JSON.stringify(res) + '\n');
    process.exit(0);
  }
  process.stderr.write('record-spec-step error: ' + res.error + '\n');
  process.exit(1);
}
