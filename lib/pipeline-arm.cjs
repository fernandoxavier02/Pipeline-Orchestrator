#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-arm.cjs — v8.7.0
// =============================================================================
// The deterministic BRIDGE between "/pipeline was invoked" and "the arm gate has
// something to enforce". Called by the UserPromptSubmit wiring: when the prompt
// is a pipeline entry-point, it classifies the workflow (in code) and writes a
// signed-by-shape marker. pipeline-arm-gate.cjs reads this marker to deny
// substantive work until a run is armed (pipeline_active:true). When the run
// arms, the marker is cleared (or it auto-expires — the gate enforces the TTL).
//
// Pure-ish: a `nowIso` parameter makes timestamping injectable for deterministic
// tests. Atomic write (temp + rename). NEVER throws on a non-pipeline prompt.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let classifier = null;
try { classifier = require('./pipeline-workflow-classifier.cjs'); } catch { classifier = null; }

// AUDIT-007 (B5): the arm-pending marker is the unsigned input the arm-gate trusts
// to decide PIPELINE_NOT_ARMED. Sign it with the SAME HMAC envelope as sentinel-state
// (SSOT — no second signature scheme) so a hand-forged marker can be rejected. If the
// signer is unavailable, fall back to the unsigned marker (migration-tolerant).
let signer = null;
try { signer = require('./sentinel-state-signer.cjs'); } catch { signer = null; }

function markerPath(cwd) {
  return path.join(cwd, '.pipeline', 'pipeline-arm-pending.json');
}

// Writes the arm-pending marker IFF rawPrompt is a pipeline entry-point.
// Returns the marker object, or null when the prompt is not a /pipeline command
// (or the classifier is unavailable / cwd is invalid).
function writeArmPending(cwd, rawPrompt, nowIso) {
  if (typeof cwd !== 'string' || !cwd) return null;
  if (!classifier || typeof classifier.isPipelineInvocation !== 'function') return null;
  if (!classifier.isPipelineInvocation(rawPrompt)) return null;

  const wf = classifier.classifyWorkflow(rawPrompt);
  const marker = {
    requested_at: nowIso || new Date().toISOString(),
    workflow: wf.mode + (wf.type ? ('/' + wf.type) : ''),
    mode: wf.mode,
    type: wf.type,
    variant: wf.variant,
    complexity: wf.complexity,
    source: wf.source,
    prompt_excerpt: String(rawPrompt == null ? '' : rawPrompt)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 200),
  };

  // Sign the marker (AUDIT-007). When no HMAC key is available, signState is skipped
  // and the unsigned marker is written — tolerated by readArmPending unless strict.
  let toWrite = marker;
  if (signer && typeof signer.signState === 'function') {
    try {
      const key = typeof signer.getOrCreateHmacKey === 'function' ? signer.getOrCreateHmacKey() : null;
      if (key) toWrite = signer.signState(marker, key);
    } catch { toWrite = marker; }
  }

  const p = markerPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2));
    fs.renameSync(tmp, p);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
  return marker;
}

// Removes the marker. Idempotent: returns false if there was nothing to clear.
function clearArmPending(cwd) {
  try { fs.unlinkSync(markerPath(cwd)); return true; } catch { return false; }
}

module.exports = { writeArmPending, clearArmPending, markerPath };
