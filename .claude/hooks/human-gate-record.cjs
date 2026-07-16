#!/usr/bin/env node
'use strict';

// =============================================================================
// human-gate-record.cjs — v8.9.x (PostToolUse:AskUserQuestion)
// =============================================================================
// DoD #12 — "human gates are recorded from the real tool result". When the main
// agent asks the user a governed question, this observer records the user's REAL
// answer (derived from payload.tool_response, correlated by tool_use_id) into the
// run's gate-decisions.jsonl via the canonical gate-decision-writer. Before this,
// the only record of a human decision was controller PROSE — the model could ask,
// ignore the answer, and stamp anything.
//
// Scope/contract:
//  - PostToolUse observer: it CANNOT block and never throws (telemetry-grade
//    fail-silent), so it adds zero deadlock risk. It does not validate or rewrite
//    the question (that would need a Pre-side active-gate state machine the
//    architecture does not yet have); it only makes the answer auditable.
//  - Honest ceiling: this records that a real tool_response was captured for a
//    specific tool_use_id. It cannot prove the human's intent matched the
//    controller's subsequent action — that floor needs the full Phase-10 gate
//    machine. It does kill the "answer never recorded / silently invented" hole.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let writer = null;
try { writer = require('../../lib/gate-decision-writer.cjs'); } catch { writer = null; }
let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }
let peSigner = null;
try { peSigner = require('../../lib/protocol-event-signer.cjs'); } catch { peSigner = null; }

function resolveDocFromEnv(cwd) {
  const env = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (!env) return null;
  return path.isAbsolute(env) ? env : path.resolve(cwd || process.cwd(), env);
}

function readStateAt(docDir) {
  let state;
  try { state = JSON.parse(fs.readFileSync(path.join(docDir, 'sentinel-state.json'), 'utf8')); }
  catch { return null; }
  // Mirror step-ledger-stamp's posture: a present-but-INVALID signature is
  // rejected (no laundering of forged state); unsigned / key-unavailable is
  // tolerated (migration). A telemetry observer never hardens past read.
  if (signer && typeof signer.verifyState === 'function') {
    let v;
    try { v = signer.verifyState(state, { key: signer.readHmacKey() }); }
    catch { v = { valid: true }; }
    if (v && v.valid === false && v.unsigned !== true && v.key_unavailable !== true) return null;
  }
  return state;
}

// Extract a short, human-readable summary of the user's real answer. The exact
// AskUserQuestion tool_response shape is runtime-specific, so we stringify
// whatever is present and let the writer's 200-char detail cap truncate. The
// guarantee is "derived from the real tool_response", not perfect parsing.
function summarizeAnswer(toolResponse) {
  if (toolResponse == null) return 'no_answer';
  try {
    if (typeof toolResponse === 'string') return toolResponse;
    return JSON.stringify(toolResponse);
  } catch { return 'unserializable_answer'; }
}

// v8.27.0+ (Fatia S8b / Requirement 9 rota-b — STRICT_INTERACTIVE_PATH). The
// interactive producer signs the corroborating user-gate protocol-event AT THE
// SOURCE, so a decided_by:user decision is corroborated even under
// PIPELINE_HMAC_STRICT (closes the H2 boundary the Emenda 2 disposed). WHY it
// matters: C3 (lib/audit-forgery-guard.cjs) matches the decision's tool_use_id
// against ids inside a SIGNED user-gate event; without a signed event, strict
// would false-positive every legitimate human approval.
//
// KEY POSTURE: read the durable key READ-ONLY (readHmacKey) — an observer must
// never CREATE a key file as a side effect (getOrCreateHmacKey would). No durable
// key → emit UNSIGNED (two-tier, migration-tolerated), never a fabricated one.
// The event's `event` kind matches USER_GATE_EVENT_RE and carries the SAME
// tool_use_id already written in the decision detail, so the two lines correlate.
// fail-silent: an observer must never disrupt the turn.
function emitSignedUserGateEvent(docDir, toolUseId, phase) {
  if (!peSigner || typeof peSigner.signUserGateEvent !== 'function') return;
  try {
    const ev = {
      event: 'HUMAN_GATE_RESPONSE',
      tool_use_id: toolUseId,
      phase,
      timestamp: new Date().toISOString(),
      source: 'human-gate-record',
    };
    const key = (signer && typeof signer.readHmacKey === 'function') ? signer.readHmacKey() : null;
    // key present → sign; key absent → UNSIGNED (do NOT let signState create a key).
    const toWrite = key ? peSigner.signUserGateEvent(ev, { key }) : ev;
    fs.appendFileSync(path.join(docDir, 'protocol-events.jsonl'), JSON.stringify(toWrite) + '\n');
  } catch { /* fail-silent: the decision is already recorded regardless */ }
}

function record(payload) {
  if (!writer || typeof writer.appendGateDecision !== 'function' || typeof writer.buildCtx !== 'function') return;
  if (!payload || payload.tool_name !== 'AskUserQuestion') return;
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

  const toolUseId = typeof payload.tool_use_id === 'string' && payload.tool_use_id ? payload.tool_use_id : 'unknown';
  const answer = summarizeAnswer(payload.tool_response);
  const phase = (typeof state.current_phase === 'string' && state.current_phase) ? state.current_phase
    : (typeof state.phase === 'string' && state.phase ? state.phase : 'unknown');
  const complexity = typeof state.complexity === 'string' ? state.complexity
    : (state.orchestrator_decision && typeof state.orchestrator_decision.complexity === 'string'
        ? state.orchestrator_decision.complexity : null);

  let ctx;
  try { ctx = writer.buildCtx(docDir, { type: typeof state.task_type === 'string' ? state.task_type : null, complexity }); }
  catch { return; }

  const filePath = path.join(docDir, 'gate-decisions.jsonl');
  try {
    // CONTRACT — decision is ANSWER-INDEPENDENT here: 'CONFIRMED' means "a real
    // user answer was captured for this gate", NOT "the user approved". We do not
    // parse approve/reject from the free-text answer (the AskUserQuestion
    // tool_response shape is runtime-specific and not yet confirmed live). The
    // real choice is preserved verbatim in `detail`. THEREFORE: HUMAN_GATE must
    // NEVER be added to any REQUIRED_GATES / enforcement set that branches on the
    // decision value — a downstream gate would read every answer (including a
    // rejection) as CONFIRMED. This is an AUDIT-class observation only. (Deriving
    // APPROVED/REJECTED is deferred to when the runtime answer shape is confirmed.)
    writer.appendGateDecision(filePath, {
      gate: 'HUMAN_GATE',
      hardness: 'AUDIT',          // observation; a PostToolUse hook cannot block
      phase,
      decision: 'CONFIRMED',      // = "a real answer was captured" (answer-independent; see CONTRACT above)
      decided_by: 'user',
      timestamp: new Date().toISOString(),
      detail: `tool_use_id=${toolUseId} answer=${answer}`,
      confidence_impact: 0,
    }, ctx);
    // Fatia S8b: emit the SIGNED corroborating user-gate event at the source, so
    // this decided_by:user is corroborated under strict (see fn docstring).
    emitSignedUserGateEvent(docDir, toolUseId, phase);
  } catch { /* fail-silent: an observer must never disrupt the turn */ }
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try { record(JSON.parse(s)); } catch { /* ignore */ }
    process.exit(0);
  });
}

module.exports = { record, summarizeAnswer };
