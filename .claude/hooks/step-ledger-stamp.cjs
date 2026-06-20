#!/usr/bin/env node
'use strict';

// =============================================================================
// step-ledger-stamp.cjs — v8.7.0 (PostToolUse:Agent)
// =============================================================================
// Deterministic stamping: when a GOVERNED agent finishes, record its step into
// the run's signed state.step_ledger — WITHOUT the LLM having to remember. This
// is the partner of step-ledger-gate.cjs (PreToolUse): the gate enforces order,
// this stamp records completion, so the next phase's agent is unlocked only
// after the current one actually ran. NEVER blocks (PostToolUse can't anyway)
// and never throws — telemetry-grade fail-silent.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let ledger = null;
try { ledger = require('../../lib/step-ledger.cjs'); } catch { ledger = null; }
let recorder = null;
try { recorder = require('../../scripts/record-step.cjs'); } catch { recorder = null; }
let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }

function resolveDocFromEnv(cwd) {
  const env = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (!env) return null;
  return path.isAbsolute(env) ? env : path.resolve(cwd || process.cwd(), env);
}

function readStateAt(docDir) {
  let state;
  try { state = JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')); }
  catch { return null; }
  // SEC-1: never TRUST (and never let record-step RE-SIGN) a state whose
  // signature is PRESENT but INVALID — an attacker could pre-write a forged
  // signed state and have us launder it. Mirror edit-guard-hook's posture:
  // a present-but-invalid signature is fail-silent; unsigned/key-unavailable
  // stays tolerated (migration). Verify-failure (signer absent / throw) is
  // tolerated so the stamp degrades to the prior behaviour, never harder.
  if (signer && typeof signer.verifyState === 'function') {
    let v;
    try { v = signer.verifyState(state, { key: signer.readHmacKey() }); }
    catch { v = { valid: true }; }
    if (v && v.valid === false && v.unsigned !== true && v.key_unavailable !== true) return null;
  }
  return state;
}

function stamp(payload) {
  if (!ledger || !recorder || typeof recorder.recordStep !== 'function') return;
  if (!payload || payload.tool_name !== 'Agent') return;
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  // Resolve the run dir + state: PIPELINE_DOC_PATH wins; else discover via state.
  let docDir = resolveDocFromEnv(cwd);
  let state = docDir ? readStateAt(docDir) : null;
  if (!state && eg && typeof eg.findActiveSentinelState === 'function') {
    try {
      const s = eg.findActiveSentinelState(cwd);
      if (s && s !== eg.CORRUPT_SENTINEL) {
        state = s;
        if (typeof s.pipeline_doc_path === 'string' && s.pipeline_doc_path) {
          docDir = path.isAbsolute(s.pipeline_doc_path) ? s.pipeline_doc_path : path.resolve(cwd, s.pipeline_doc_path);
        }
      }
    } catch { /* fail-silent */ }
  }
  if (!state || state.pipeline_active !== true || !docDir) return;

  // .trim() keeps this parser IDENTICAL to the gate's (batch-review-gate.cjs) so a
  // trailing-space subagent_type can't desync which leaf the stamp vs the gate sees.
  const leaf = String((payload.tool_input || {}).subagent_type || '').split(':').pop().trim();

  // executor-fix completion → increment the fix-loop counter (deterministic cap).
  if (leaf === 'executor-fix') {
    if (typeof recorder.recordFixAttempt === 'function') {
      try { recorder.recordFixAttempt(docDir); } catch { /* fail-silent */ }
    }
    return;
  }

  // Per-batch adversarial-review counters (deterministic batch-review gate).
  // Additive side-effects — these agents may ALSO be governed steps below, so we
  // bump the counter and fall through to normal step stamping. Two independent
  // `if`s (not else-if): the comment promises fall-through, and decoupling them
  // removes a latent hazard if GOVERNED ever overlaps a future agent name.
  if (leaf === 'checkpoint-validator' && typeof recorder.recordBatchCheckpoint === 'function') {
    try { recorder.recordBatchCheckpoint(docDir); } catch { /* fail-silent */ }
  }
  if (leaf === 'review-orchestrator' && typeof recorder.recordBatchReview === 'function') {
    try { recorder.recordBatchReview(docDir); } catch { /* fail-silent */ }
  }

  // Checkpoint/sanity verdict (audit A1 + A2 + A3). The checkpoint-validator /
  // sanity-checker writes its build/test result to {docDir}/checkpoint-verdict.json
  // ({ verdict: 'pass'|'fail' }); we record it into signed state (last verdict +
  // consecutive-failure counter) so the checkpoint-verdict gate can deny advancing
  // while RED or after N consecutive fails. Fail-silent if the file is absent.
  if ((leaf === 'checkpoint-validator' || leaf === 'sanity-checker') && typeof recorder.recordCheckpointVerdict === 'function') {
    try {
      const raw = fs.readFileSync(path.join(docDir, 'checkpoint-verdict.json'), 'utf8');
      recorder.recordCheckpointVerdict(docDir, JSON.parse(raw));
    } catch { /* no verdict file / unreadable → fail-silent (verdict stays unknown) */ }
  }

  // Sensitive-domain detection (audit A4). The checkpoint writes the batch's
  // changed-file list to {docDir}/batch-files.json; the scanner records which
  // sensitive domains were touched so the batch-review gate can make the review
  // mandatory. Fail-silent if absent.
  if (leaf === 'checkpoint-validator' && typeof recorder.recordDomainsTouched === 'function') {
    try {
      const raw = fs.readFileSync(path.join(docDir, 'batch-files.json'), 'utf8');
      const files = JSON.parse(raw);
      recorder.recordDomainsTouched(docDir, Array.isArray(files) ? files : (files && files.files));
    } catch { /* no batch-files list → fail-silent */ }
  }

  const wf = state.workflow_key || (state.task_type === 'Spec' ? 'Spec' : 'FULL');
  const step = ledger.stepForAgent(wf, leaf);
  if (!step) return; // ungoverned agent → nothing to stamp

  try { recorder.recordStep(docDir, step); } catch { /* fail-silent */ }
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try { stamp(JSON.parse(s)); } catch { /* ignore */ }
    process.exit(0);
  });
}

module.exports = { stamp };
