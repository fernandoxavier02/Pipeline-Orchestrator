#!/usr/bin/env node
'use strict';

// =============================================================================
// step-ledger-stamp.cjs — v8.16.0 (PostToolUse:Agent)
// =============================================================================
// Deterministic stamping: when a GOVERNED agent finishes, record its step into
// the run's signed state.step_ledger — WITHOUT the LLM having to remember. This
// is the partner of step-ledger-gate.cjs (PreToolUse): the gate enforces order,
// this stamp records completion, so the next phase's agent is unlocked only
// after the current one actually ran. NEVER blocks (PostToolUse can't anyway)
// and never throws — telemetry-grade fail-silent.
//
// v8.16.0 fix (Glitch B from 2026-06-28 audit): when the FIRST governed step is
// stamped for a run that was direct-entered (i.e. /pipeline armed it without a
// preceding /brainstorm), auto-emit a single STEP_1_7_ROUTING(no-prep-override)
// entry into gate-decisions.jsonl. This closes the BRAINSTORM_EVIDENCE_MISSING
// hygiene violation deterministically — the same pattern the audit-budget gate
// uses (one ledger write, idempotent, scoped to MEDIA/COMPLEXA/Spec).
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
// v8.16.0 (Glitch B): the STEP_1_7_ROUTING writer SSOT. Optional require — when
// the lib is unavailable the auto-emit silently degrades (legacy behavior).
let step17 = null;
try { step17 = require('../../lib/step-1-7-routing.cjs'); } catch { step17 = null; }
// v8.22.0 (T3): cross-process lock for the pending_blocks clear (same lock the
// record-step writer uses). Optional — without it the clear degrades to unlocked.
let xlock = null;
try { xlock = require('../../lib/exclusive-lock.cjs'); } catch { xlock = null; }

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

// DoD #6 — "no step is stamped merely because Agent returned". A governed step
// is only stamped when the agent returned a USABLE result. We cannot prove
// semantic success from a hook (the floor is "the agent could lie"), but we CAN
// reject the cases that obviously did no work: an absent result, an error/
// interrupt shape, an empty text result, or a background launch that has not
// finished. Conservative on purpose (the exact error shape Claude Code emits is
// runtime-specific): only clear negatives decline; any present, non-error,
// non-async object/non-empty string is accepted, so a normal completion is not
// wrongly dropped.
//
// RECOVERY (honest invariant — NOT "can never deadlock"): declining to stamp is
// deliberately strict — preferring a false-negative (block the NEXT phase) over a
// false-positive (let a no-op satisfy a step) is the correct bias for "agents
// must not skip". Concretely: step-ledger-gate fails open only on an ENTIRELY
// absent ledger; once any step is stamped, a missing prerequisite is a DENY under
// the default deny mode. So a mis-classified real completion BLOCKS the next
// governed spawn until the operator recovers — by re-dispatching the same agent
// (which re-produces a usable result) or by setting PIPELINE_STAMP_REQUIRE_RESULT=off.
// An empty/whitespace STRING is treated as no-result BY DESIGN (a governed agent
// that produced no text did no visible work); object envelopes such as
// {status:'completed', content:[...]} are usable. Do NOT widen NEGATIVE_STATUS
// without live evidence of real Agent tool_response shapes.
function hasUsableResult(toolResponse) {
  if (toolResponse == null) return false;
  if (typeof toolResponse === 'string') return toolResponse.trim().length > 0;
  if (typeof toolResponse !== 'object') return false;
  if (toolResponse.is_error === true) return false;
  if (toolResponse.error) return false;
  if (toolResponse.interrupted === true) return false;
  if (toolResponse.async_launched === true) return false; // background Agent not yet complete
  const NEGATIVE_STATUS = new Set(['error', 'failed', 'cancelled', 'canceled', 'interrupted', 'async_launched', 'running', 'in_progress', 'pending']);
  if (typeof toolResponse.status === 'string' && NEGATIVE_STATUS.has(toolResponse.status.toLowerCase())) return false;
  return true;
}

// Strict by default; PIPELINE_STAMP_REQUIRE_RESULT=off|0|false|no restores the
// pre-audit legacy behaviour (stamp purely on Agent return) for rollback safety.
function stampRequiresResult() {
  return !/^(off|0|false|no)$/i.test(String(process.env.PIPELINE_STAMP_REQUIRE_RESULT || '').trim());
}

// Consume-once (DoD#8): after a step-unlocking verdict file is SUCCESSFULLY recorded
// into signed state, move it aside so a LATER stamp (e.g. a new batch whose agent did
// NOT re-emit it) cannot re-read a STALE verdict and unlock a step it never produced.
// Each of these verdict files has a single consumer (this stamp), so renaming is safe;
// the content is kept (…consumed-<mtime>) for audit, never deleted. Best-effort: a
// rename failure degrades to the prior re-readable behaviour, never worse.
function consumeRename(filePath) {
  try {
    // Pick a FREE destination so two consumptions never collide (overwriting an
    // earlier .consumed audit copy). First `<file>.consumed`, then `-1`, `-2`, …
    let dest = `${filePath}.consumed`;
    for (let n = 1; fs.existsSync(dest); n++) dest = `${filePath}.consumed-${n}`;
    fs.renameSync(filePath, dest);
  } catch { /* best-effort: a rename failure degrades to re-readable, never worse */ }
}

// v8.22.0 (T3, loop hook-unblock): deterministic pending_blocks hygiene. The controller
// prose said "clear the pending entry when processing each RESULT" — honor-only, and the
// omission fired a false 482-minute PROTOCOL_HANDSHAKE_TIMEOUT on the 2026-07-04 run.
// This makes it code: when the RETURNING agent is the target of a DISPATCH_REQUEST
// pending block (same leaf-containment match the gates use — eg.dispatchTargetMatches)
// and returned a USABLE result, remove that entry from the signed state. Other targets'
// entries and non-DISPATCH_REQUEST blocks stay. Same read-verify-refuse-launder posture
// as scripts/record-step.cjs (a present-but-INVALID signature is never rewritten).
// Fail-silent throughout — PostToolUse cannot block, and hygiene must never break stamping.
function clearSatisfiedPending(docDir, subagentType) {
  if (!signer || typeof signer.writeSignedState !== 'function') return;
  if (!eg || typeof eg.dispatchTargetMatches !== 'function') return;
  if (typeof docDir !== 'string' || !docDir) return;
  if (typeof subagentType !== 'string' || !subagentType) return;
  const statePath = path.join(docDir, 'sentinel-state.json');
  const update = () => {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return; }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.pending_blocks)) return;
    if (typeof signer.verifyState === 'function') {
      let v;
      try { v = signer.verifyState(obj, { key: signer.readHmacKey() }); }
      catch { v = { valid: true }; }
      if (v && v.valid === false && v.unsigned !== true && v.key_unavailable !== true) return; // never launder
    }
    const kept = obj.pending_blocks.filter((b) => !(
      b && typeof b === 'object' && b.block_type === 'DISPATCH_REQUEST'
      && typeof b.dispatch_id === 'string' && eg.dispatchTargetMatches(b.dispatch_id, subagentType)
    ));
    if (kept.length === obj.pending_blocks.length) return; // nothing to clear → no write
    const merged = { ...obj, pending_blocks: kept, updated_at: new Date().toISOString() };
    try { signer.writeSignedState(statePath, merged); } catch { /* fail-silent */ }
  };
  try {
    if (xlock && typeof xlock.withLock === 'function') xlock.withLock(statePath, update);
    else update();
  } catch { /* fail-silent */ }
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

  // v8.22.0 (T3): pending hygiene BEFORE any early return — even an executor-fix
  // return clears its satisfied DISPATCH_REQUEST. Result-gated with the same bias
  // as the stamp itself: an errored/no-op return leaves the handshake pending.
  if (!stampRequiresResult() || hasUsableResult(payload.tool_response)) {
    const fullAgent = String((payload.tool_input || {}).subagent_type || '').trim();
    try { clearSatisfiedPending(docDir, fullAgent); } catch { /* fail-silent */ }
  }

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
    const vf = path.join(docDir, 'checkpoint-verdict.json');
    let raw = null;
    try { raw = fs.readFileSync(vf, 'utf8'); } catch { /* absent → fail-silent (verdict stays unknown) */ }
    if (raw != null) {
      let res = null;
      try { res = recorder.recordCheckpointVerdict(docDir, JSON.parse(raw)); } catch { /* unreadable JSON → fail-silent */ }
      if (res && res.ok) consumeRename(vf); // consume-once: only after a successful record
    }
  }

  // Sensitive-domain detection (audit A4). The checkpoint writes the batch's
  // changed-file list to {docDir}/batch-files.json; the scanner records which
  // sensitive domains were touched so the batch-review gate can make the review
  // mandatory. Fail-silent if absent. NOTE: deliberately NOT consume-once'd —
  // domains_touched is an accumulating, safe-biased UNION (re-reading can only ADD
  // domains, which makes MORE reviews mandatory, never fewer). Consume-once is only
  // for step-UNLOCKING verdicts where a stale re-read would wrongly advance.
  if (leaf === 'checkpoint-validator' && typeof recorder.recordDomainsTouched === 'function') {
    try {
      const raw = fs.readFileSync(path.join(docDir, 'batch-files.json'), 'utf8');
      const files = JSON.parse(raw);
      recorder.recordDomainsTouched(docDir, Array.isArray(files) ? files : (files && files.files));
    } catch { /* no batch-files list → fail-silent */ }
  }

  // Phase verdicts (audit A5-A9). Each producing agent drops a small verdict file;
  // the stamp records it into signed state (validated by the recorder's allowlist)
  // so the phase-verdict gate can deny a downstream spawn. Fail-silent if absent.
  const VERDICT_FILES = {
    'task-orchestrator': { file: 'ssot-verdict.json', field: 'ssot_status' },
    'information-gate': { file: 'info-gate-verdict.json', field: 'info_gate' },
    'plan-architect': { file: 'plan-verdict.json', field: 'plan_status' },
    'final-adversarial-orchestrator': { file: 'final-review-verdict.json', field: 'final_review_verdict' },
    'final-validator': { file: 'final-decision.json', field: 'final_decision' },
  };
  if (VERDICT_FILES[leaf] && typeof recorder.recordPhaseVerdict === 'function') {
    const { file, field } = VERDICT_FILES[leaf];
    const vf = path.join(docDir, file);
    let raw = null;
    try { raw = fs.readFileSync(vf, 'utf8'); } catch { /* absent → fail-silent */ }
    if (raw != null) {
      let res = null;
      try {
        const obj = JSON.parse(raw);
        const value = (obj && (obj[field] != null ? obj[field] : obj.verdict));
        res = recorder.recordPhaseVerdict(docDir, field, value);
      } catch { /* unreadable JSON → fail-silent */ }
      if (res && res.ok) consumeRename(vf); // consume-once after a successful record
    }
  }

  // Batch 1 (audit ARCH-7): single SSOT workflow-key resolution (was a duplicated
  // inline heuristic that mis-mapped brainstorm → FULL).
  const wf = (typeof ledger.resolveWorkflowKey === 'function')
    ? ledger.resolveWorkflowKey(state)
    : (state.workflow_key || (state.task_type === 'Spec' ? 'Spec' : 'FULL'));
  const step = ledger.stepForAgent(wf, leaf);
  if (!step) return; // ungoverned agent → nothing to stamp

  // DoD #6: do not mark the governed step complete unless the agent actually
  // returned a usable result. A no-op / errored / still-launching agent that
  // merely returned must NOT satisfy the ordering prerequisite for the next
  // phase. (The verdict-bearing branches above are already result-gated by the
  // existence of their producer verdict file; this guards the generic stamp.)
  if (stampRequiresResult() && !hasUsableResult(payload.tool_response)) return;

  try { recorder.recordStep(docDir, step); } catch { /* fail-silent */ }

  // v8.16.0 (Glitch B fix): when this is the FIRST governed step stamped on a
  // direct-entry run (no preceding /brainstorm), auto-emit STEP_1_7_ROUTING with
  // branch=no-prep-override so the final-validator hygiene check stops raising
  // BRAINSTORM_EVIDENCE_MISSING. Idempotent + scoped to qualifying runs only.
  try { maybeAutoEmitStep17(docDir, state, leaf); } catch { /* fail-silent */ }
}

// v8.16.0: idempotent auto-emit of STEP_1_7_ROUTING(no-prep-override) for the
// direct-entry path. Scoped to MEDIA/COMPLEXA/Spec (matches the dispatch-guard
// handleBrainstormDispatch in-scope rule and the final-validator Step 1b qualifier).
// SIMPLES + non-Spec runs are exempt.
function maybeAutoEmitStep17(docDir, state, leaf) {
  if (!step17 || typeof step17.appendStep17Routing !== 'function') return;
  if (!docDir || !state) return;
  // Scope: same qualifier as the dispatch-guard / final-validator hygiene check.
  const od = (state.orchestrator_decision && typeof state.orchestrator_decision === 'object')
    ? state.orchestrator_decision : {};
  const complexity = String(od.complexity || state.complexity || '').trim().toUpperCase();
  const type = String(od.type || state.task_type || '').trim();
  const inScope = complexity === 'MEDIA' || complexity === 'COMPLEXA' || type.toUpperCase() === 'SPEC';
  if (!inScope) return;
  // Idempotency #1: the run's signed sentinel already carries a step_1_7 block
  // (a real /brainstorm flow recorded it). Nothing to do.
  if (state.step_1_7 && typeof state.step_1_7 === 'object') return;
  // Idempotency #2: gate-decisions.jsonl already has a STEP_1_7_ROUTING entry.
  // A single textual scan (no JSON parse) is enough — the writer's `gate` field
  // is the unique discriminator. Bounded read so a huge log can never DOS this.
  const gdPath = path.join(docDir, 'gate-decisions.jsonl');
  try {
    if (fs.existsSync(gdPath)) {
      const raw = fs.readFileSync(gdPath, 'utf8');
      if (raw.includes('"gate":"STEP_1_7_ROUTING"') || raw.includes('"gate": "STEP_1_7_ROUTING"')) return;
    }
  } catch { /* unreadable → fall through and write; idempotency #1 still holds */ }
  // Emit ONCE. The SSOT writer validates the branch against BRANCH_VALUES and
  // sanitizes the detail; no further validation is needed here.
  try {
    step17.appendStep17Routing(gdPath, {
      branch: 'no-prep-override',
      prep_run_id: null,
      phase: '1.7',
      decided_by: 'step-ledger-stamp',
    }, {
      run_id: typeof state.run_id === 'string' ? state.run_id : undefined,
      type,
      complexity,
    });
  } catch { /* fail-silent — writer threw for an unknown reason; never break stamping */ }
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try { stamp(JSON.parse(s)); } catch { /* ignore */ }
    process.exit(0);
  });
}

module.exports = { stamp, hasUsableResult, stampRequiresResult, maybeAutoEmitStep17, clearSatisfiedPending };
