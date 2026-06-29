#!/usr/bin/env node
'use strict';

// =============================================================================
// subagent-stop-commit-hook.cjs — v8.10.0 (SubagentStop) — T13 (REQ-SUBAGENTSTOP-COMMIT)
// =============================================================================
// The commit point for a governed subagent. On SubagentStop it confirms the agent
// closed on a REAL, parseable PIPELINE_AGENT_RESULT_V1 block (the producers are the 9
// FULL governed agents from T11 + the spec-controller terminal leaf, v8.19.0) instead
// of trusting presence/absence. DEFAULT-ON (since v8.11.0 B4; escape
// PIPELINE_SUBAGENTSTOP_ENFORCEMENT=warn): the gate is ARMED by default so a shipped
// install enforces it; the warn escape reverts it to observe-only.
//
// Decision (design L3b.1):
//   discover run → if governed-corrupt: block(armed)/allow(warn) →
//   if state absent / not active: allow → map agent_type→step via the workflow
//   manifest; not-in-spine ⇒ allow → resultRequired(step)===false ⇒ allow (no message
//   inspection) → cap 3 per (run_id, agent_type): at/over the cap write
//   terminal_state='hard_failed' + ALLOW (honest terminal, never a 4th block) →
//   parseResultBlock(last_assistant_message): ok:true ⇒ flag the matching dispatch
//   committed + ALLOW; ok:false ⇒ block(armed: +reason +additionalContext, bump the
//   correction counter) / allow+breadcrumb(warn).
//
// Persistence uses the SHIPPED exclusive-lock + verifyState-fail-closed re-read →
// verify → bump → temp → atomic-rename sequence (parity with dispatch-record-hook).
// NEVER throws into the harness — any unexpected error fails OPEN (allow).
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let lock = null;
try { lock = require('../../lib/exclusive-lock.cjs'); } catch { lock = null; }
let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }
let manifest = null;
try { manifest = require('../../lib/contracts/workflow-manifest.cjs'); } catch { manifest = null; }
let resultContract = null;
try { resultContract = require('../../lib/contracts/pipeline-agent-result.cjs'); } catch { resultContract = null; }
let writer = null;
try { writer = require('../../lib/gate-decision-writer.cjs'); } catch { writer = null; }

const CORRECTION_CAP = 3;

// Emit-and-hoist INTERMEDIATE-stop detector. A sub-orchestrator made a governed leaf
// (e.g. spec-controller, v8.19.0) drives ~13 steps by EMIT-AND-HOIST: at each intermediate
// step it ends its turn with a bare `STATUS: AWAITING_<…>` line and STOPS, so the parent
// runs the dispatch/gate/plan-mode and re-dispatches it (references/gate-request-protocol.md,
// agents/core/spec-controller.md). Such a stop is a legitimate non-terminal handshake — NOT a
// missing result — so the result-block requirement must NOT police it. The three tokens are
// the canonical hoist markers (a CLOSED set per the protocol). Anchored to a line start so a
// stray mention in prose does not match. Only a GENUINE TERMINAL stop (no AWAITING_* marker)
// remains governed below — preserving the original bug fix (a terminal prose/no-block close
// is still caught).
const HOIST_STATUS_RE = /^[ \t]*STATUS:[ \t]*(?:AWAITING_DISPATCH_RESULTS|AWAITING_GATE_RESPONSES|AWAITING_PLAN_MODE_RESULTS)\b/m;
function isEmitAndHoistStop(lastMsg) {
  return typeof lastMsg === 'string' && HOIST_STATUS_RE.test(lastMsg);
}

// Find the step that owns an agent_type, or null when the agent is NOT in the spine.
// The inversion is the manifest SSOT (promoted in v8.18.2 — this commit gate and the
// error-signal observer both consume it, no duplicated inversion). Manifest absent, OR a
// pre-8.18.2 manifest lacking the stepForAgentType export → null (ungoverned). The
// absent-manifest end-state matches the old local fallback; the NEW dependency is on the
// EXPORT, so it assumes hook↔lib version lockstep (both ship from the same install — the
// dogfood cache-vs-source skew is the one scenario where this could silently un-govern).
function stepForAgentType(workflowKey, agentType) {
  return (manifest && typeof manifest.stepForAgentType === 'function')
    ? manifest.stepForAgentType(workflowKey, agentType)
    : null;
}

// resolveWorkflowKey(state) → the workflow key the commit point governs the run under.
// REQ-B3 (anti-regression): a spec authoring run must NOT be resolved off the seal-time
// `type:'Spec'` flag (only stamped at seal). Prefer an explicit `workflow` field, then
// the DURING-AUTHORING signal `spec_authoring_progress` (written by
// scripts/record-spec-step.cjs into the SIGNED sentinel from intake onward, so it is
// present well before seal). Falls back to 'FULL'.
// NOTE: keep in lockstep with the identical resolver in stop-gate-hook.cjs (D-2).
function resolveWorkflowKey(state) {
  if (state && typeof state.workflow === 'string' && state.workflow) return state.workflow;
  const prog = state && state.spec_authoring_progress;
  if (prog && typeof prog === 'object' && Object.keys(prog).length > 0) return 'Spec';
  return 'FULL';
}

// hasSealEvidence(state) → true IFF the run is authentically SEALED (the signed
// sentinel's final_decision is SEALED). A stop with seal evidence is TERMINAL by
// definition, so the emit-and-hoist bypass below must NOT treat it as an intermediate
// handshake (closes the LOW over-match residual: a sealed terminal whose body happens
// to carry a line-start `STATUS: AWAITING_*` would otherwise dodge the result-block
// requirement). v8.19.0 FORGERY GUARD: the UNSIGNED manifest.yaml `status: sealed` is
// NO LONGER an independent seal-authority source — delegates to the workflow-manifest
// SSOT sealEvidence(state), shared verbatim with stop-gate-hook.cjs (no more duplicated
// IO copy to drift). Tolerant of unsigned state (the final_decision read is unchanged).
function hasSealEvidence(state) {
  return !!(manifest && typeof manifest.sealEvidence === 'function' && manifest.sealEvidence(state));
}

function resolveDocDir(pipelineDir) {
  try {
    if (eg && typeof eg.discoverStatePath === 'function') {
      const { statePath } = eg.discoverStatePath(pipelineDir);
      if (statePath) return path.dirname(statePath);
    }
  } catch { /* fall through */ }
  return null;
}

// Best-effort AUDIT breadcrumb through the canonical SSOT writer (same path the
// dispatch-record hook uses). Never throws into the decision path.
function appendBreadcrumb(docDir, gate, detail, state) {
  if (!docDir) return;
  if (!writer || typeof writer.appendGateDecision !== 'function' || typeof writer.buildCtx !== 'function') return;
  try {
    const s = state && typeof state === 'object' ? state : {};
    const complexity = typeof s.complexity === 'string' ? s.complexity
      : (s.orchestrator_decision && typeof s.orchestrator_decision.complexity === 'string'
          ? s.orchestrator_decision.complexity : null);
    const phase = (typeof s.current_phase === 'string' && s.current_phase) ? s.current_phase
      : (typeof s.phase === 'string' && s.phase ? s.phase : 'unknown');
    let ctx;
    try { ctx = writer.buildCtx(docDir, { type: typeof s.task_type === 'string' ? s.task_type : null, complexity }); }
    catch { return; }
    writer.appendGateDecision(path.join(docDir, 'gate-decisions.jsonl'), {
      gate,
      hardness: 'AUDIT',
      phase,
      decision: 'TRIGGERED',
      decided_by: 'subagent-stop-commit-hook',
      timestamp: new Date().toISOString(),
      detail: String(detail || ''),
      confidence_impact: 0,
    }, ctx);
  } catch { /* breadcrumb is best-effort */ }
}

// Mutate the freshest signed state under the exclusive lock with the re-read →
// verify → bump → temp → atomic-rename sequence. `mutate(state)` edits in place and
// returns true to commit (a write) or false to abort. Best-effort: never crashes.
function withSignedState(statePath, mutate) {
  if (!signer || typeof signer.writeSignedState !== 'function') return;
  const doWrite = () => {
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); }
    catch { return; }
    if (!state || typeof state !== 'object') return;
    // FAIL CLOSED on a verification throw — never write over state we cannot confirm.
    try {
      if (typeof signer.verifyState === 'function') {
        const v = signer.verifyState(state, { key: signer.readHmacKey() });
        if (!v.valid && !v.unsigned && !v.key_unavailable) return;
      }
    } catch { return; }
    let commit = false;
    try { commit = mutate(state) === true; } catch { return; }
    if (!commit) return;
    const cur = Number.isFinite(state.state_version) ? state.state_version : 0;
    state.state_version = cur + 1;
    signer.writeSignedState(statePath, state, { key: signer.readHmacKey() });
  };
  try {
    if (lock && typeof lock.withLock === 'function') lock.withLock(statePath, doWrite);
    else doWrite();
  } catch { /* persistence best-effort */ }
}

// Pure-ish decision (with best-effort state side effects). Returns
// { decision: 'allow'|'block', reason?, additionalContext? }.
function decide(payload) {
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  const pipelineDir = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const agentType = typeof payload.agent_type === 'string' ? payload.agent_type : '';
  const lastMsg = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';

  // DEFAULT-ON (B4 — v8.11.0): the SubagentStop commit gate is ARMED by default so a
  // shipped install actually enforces it (the prior arming lived in the dev-only
  // settings.json, which is not packaged). Escape:
  //   PIPELINE_SUBAGENTSTOP_ENFORCEMENT = warn|off|0|false|no|allow|disabled|observe
  // reverts to observe-only. Safe to default-on: a live --plugin-dir probe (run 002)
  // proved the harness HONORS a SubagentStop decision:block; the 9 governed agents —
  // task-orchestrator, information-gate, plan-architect, quality-gate-router,
  // pre-tester, executor-controller, review-orchestrator, sanity-checker,
  // final-validator — emit PIPELINE_AGENT_RESULT_V1 (locked by B4 readiness test); and
  // the 3-correction cap → hard_failed terminal guarantees no infinite block (NOT a
  // deadlock — an honest terminal). Re-confirmed live in B6.
  const armed = !/^(warn|off|0|false|no|allow|disabled|observe)$/i.test(String(process.env.PIPELINE_SUBAGENTSTOP_ENFORCEMENT || '').trim());

  // Discover active run state (authoritative pointer precedence).
  let state = null;
  try { state = eg && eg.findActiveSentinelState(pipelineDir); } catch { state = null; }

  const docDir = resolveDocDir(pipelineDir);

  // Governed action on CORRUPT signed state → manifest denyException posture.
  if (eg && state === eg.CORRUPT_SENTINEL) {
    const posture = manifest && typeof manifest.denyException === 'function'
      ? manifest.denyException('state_corrupt_governed') : 'deny';
    if (armed && posture === 'deny') {
      return {
        decision: 'block',
        reason:
          'SUBAGENTSTOP_STATE_CORRUPT: o sentinel-state assinado do run ativo não passa na verificação de ' +
          'integridade, então confirmar o encerramento de um subagente governado sobre estado corrompido é ' +
          'BLOQUEADO. Recrie/re-assine o estado pelo controller antes de encerrar.',
        additionalContext: 'Recreate and re-sign the run sentinel-state via the controller, then let the subagent finish again.',
      };
    }
    appendBreadcrumb(docDir, 'SUBAGENTSTOP_CORRUPT_WARN', `agent_type=${agentType} corrupt-state warn-allow`, null);
    return { decision: 'allow' };
  }

  // Absent / unreadable-non-authoritative state → ungoverned → allow.
  if (!state || typeof state !== 'object') return { decision: 'allow' };

  // Read seal evidence ONCE here (authoritative sentinel final_decision) so the hoist
  // decision below stays a pure boolean consumer.
  const sealEvidence = hasSealEvidence(state);

  // Map agent_type → step (HOISTED above the inactive check for HIGH-1). REQ-B3:
  // resolve the workflow key off a during-authoring signal, never the seal-time type.
  const workflowKey = resolveWorkflowKey(state);
  const step = stepForAgentType(workflowKey, agentType);
  // resultRequired for the step. An env override of 'false' models a step the
  // manifest reports as not-required (T13-S4) — allow without inspecting the message.
  const overrideFalse = (process.env.PIPELINE_SUBAGENTSTOP_RESULT_REQUIRED_OVERRIDE || '').toLowerCase() === 'false';
  const resultRequired = !overrideFalse
    && manifest && typeof manifest.resultRequired === 'function'
    && manifest.resultRequired(workflowKey, step);

  // Present-but-not-active → allow, EXCEPT for a governed result-required leaf
  // (HIGH-1): sealSpecRun sets pipeline_active:false DURING Step 9, BEFORE the
  // spec-controller emits its terminal block, so the controller's SubagentStop fires
  // on an inactive run. The plain "inactive → allow" early-return would bypass the
  // result-block check exactly for the governed spec leaf — defeating REQ-B2. Narrow
  // it so an inactive run is allowed only when the finishing agent is NOT a governed
  // result-required leaf. Block-on-missing here is RECOVERABLE (the controller
  // re-emits; sealSpecRun is idempotent) and bounded by the same 3-correction cap →
  // hard_failed, so no deadlock (NFR-4). FULL leaves are unaffected: a FULL run is
  // still active at its leaves' stops.
  if (state.pipeline_active !== true && !(step && resultRequired)) {
    return { decision: 'allow' };
  }

  // Not in the spine ⇒ ungoverned for the commit point ⇒ allow.
  if (!step) return { decision: 'allow' };
  if (!resultRequired) return { decision: 'allow' };

  // Emit-and-hoist INTERMEDIATE stop on a governed sub-orchestrator leaf → ALLOW, and do
  // NOT bump the correction counter. The spec-controller (and any future emit-and-hoist
  // sub-orchestrator made a governed leaf) ends ~13 intermediate turns with a bare
  // `STATUS: AWAITING_*` handshake before the parent re-dispatches it; only its genuine
  // TERMINAL stop (Step 9 seal) carries the result block. Policing the hoists would bump
  // subagent_corrections per intermediate stop → at the 3-cap convert to hard_failed → KILL
  // the run mid-authoring. The result-block requirement below therefore applies ONLY to a
  // terminal stop (no AWAITING_* marker), preserving REQ-B2 / HIGH-1 for the seal close.
  //
  // RESIDUAL (LOW): HOIST_STATUS_RE is /m-anchored, so a GENUINE TERMINAL stop whose
  // body carries a stray line-start `STATUS: AWAITING_*` (echoed/quoted prose) would
  // over-match as a hoist and dodge the result-block requirement — reopening the
  // prose-at-the-seal bug. A run with ON-DISK SEAL EVIDENCE is terminal by definition,
  // so the hoist bypass fires ONLY when the run is NOT yet sealed; a sealed terminal
  // falls through to the governed result-block check (valid block → allow; prose/stray
  // line + no block → block).
  if (isEmitAndHoistStop(lastMsg) && !sealEvidence) {
    appendBreadcrumb(docDir, 'SUBAGENTSTOP_HOIST', `agent_type=${agentType} emit-and-hoist intermediate stop → allow (not counted)`, state);
    return { decision: 'allow' };
  }

  const runId = typeof state.run_id === 'string' ? state.run_id : 'unknown';
  const correctionKey = `${runId}::${agentType}`;
  const corrections = (state.subagent_corrections && typeof state.subagent_corrections === 'object')
    ? state.subagent_corrections : {};
  const priorCount = Number.isFinite(corrections[correctionKey]) ? corrections[correctionKey] : 0;

  // Parse the agent's real final output.
  const parsed = resultContract && typeof resultContract.parseResultBlock === 'function'
    ? resultContract.parseResultBlock(lastMsg)
    : { ok: false, error: 'parser unavailable' };

  const statePath = docDir ? path.join(docDir, 'sentinel-state.json') : null;

  // Valid block → flag the matching dispatch committed (best-effort) + ALLOW.
  //
  // BL-1 (run-002) — CORRELATION HONESTY: a SubagentStop payload carries the
  // finishing subagent's own `agent_id` but NOT the dispatch's tool_use_id (the
  // dispatch records ARE keyed by tool_use_id; see dispatch-record-hook.cjs). So we
  // cannot prove WHICH same-type dispatch this stop belongs to. The manifest allows
  // multiple pending dispatches of one agent_type (e.g. tdd = [quality-gate-router,
  // pre-tester]; a re-dispatched executor-controller). The old loop flagged EVERY
  // same-type record committed — so the first agent to finish falsely marked a
  // still-running sibling's dispatch committed (an honesty violation, not just a
  // collision). FIX: only consume a dispatch record when correlation is
  // UNAMBIGUOUS — exactly ONE un-committed pending dispatch matches this agent_type.
  // With 0 or 2+ matches we NEVER mark another dispatch the finishing agent may not
  // own; we record a best-effort observation keyed by agent_id instead.
  const agentId = typeof payload.agent_id === 'string' && payload.agent_id ? payload.agent_id : null;
  if (parsed && parsed.ok === true) {
    if (statePath) {
      withSignedState(statePath, (s) => {
        const pd = s.pending_dispatches && typeof s.pending_dispatches === 'object' ? s.pending_dispatches : null;
        // Find UN-COMMITTED pending records whose agent_type matches the stopper.
        const matches = [];
        if (pd) {
          for (const k of Object.keys(pd)) {
            const rec = pd[k];
            if (rec && typeof rec === 'object'
              && (rec.agent_type === agentType || rec.subagent_type === agentType)
              && rec.status !== 'committed' && rec.committed !== true) {
              matches.push(k);
            }
          }
        }
        if (matches.length === 1) {
          // Unambiguous → safe to consume exactly this dispatch's record.
          const rec = pd[matches[0]];
          rec.status = 'committed';
          rec.committed = true;
          if (agentId) rec.committed_by_agent_id = agentId;
        } else {
          // Ambiguous (2+ same-type pending) or none seeded → do NOT consume any
          // other dispatch's record. Record a best-effort observation keyed by the
          // finishing agent's own id, never touching a dispatch it may not own.
          if (!s.subagent_commit_observations || typeof s.subagent_commit_observations !== 'object') {
            s.subagent_commit_observations = {};
          }
          const obsKey = agentId || `unknown::${agentType}`;
          s.subagent_commit_observations[obsKey] = {
            agent_type: agentType,
            agent_id: agentId,
            committed: true,
            ambiguous: matches.length > 1,
            pending_same_type: matches.length,
            observed_at: new Date().toISOString(),
          };
        }
        // Always leave a top-level breadcrumb so "committed" is observable even when
        // no pending record was seeded for this agent_type. This is NOT a per-dispatch
        // claim — it only states that SOME agent of this type committed.
        s.last_committed_agent_type = agentType;
        return true;
      });
    }
    return { decision: 'allow' };
  }

  // Invalid / missing result block. First honor the 3-correction cap: at/over it,
  // convert to an honest terminal (hard_failed) and ALLOW — never a 4th block.
  if (priorCount >= CORRECTION_CAP) {
    if (statePath) {
      withSignedState(statePath, (s) => {
        s.terminal_state = 'hard_failed';
        return true;
      });
    }
    appendBreadcrumb(docDir, 'SUBAGENTSTOP_HARD_FAILED', `agent_type=${agentType} cap ${CORRECTION_CAP} reached → hard_failed`, state);
    return { decision: 'allow' };
  }

  // Under the cap. Armed → BLOCK with a reason + additionalContext and bump the
  // correction counter. Warn (default) → ALLOW + audit breadcrumb (default-OFF safe).
  if (!armed) {
    appendBreadcrumb(docDir, 'SUBAGENTSTOP_WARN', `agent_type=${agentType} would-block (warn default) — ${parsed && parsed.error ? parsed.error : 'no valid result block'}`, state);
    return { decision: 'allow' };
  }

  if (statePath) {
    withSignedState(statePath, (s) => {
      if (!s.subagent_corrections || typeof s.subagent_corrections !== 'object') s.subagent_corrections = {};
      const c = Number.isFinite(s.subagent_corrections[correctionKey]) ? s.subagent_corrections[correctionKey] : 0;
      s.subagent_corrections[correctionKey] = c + 1;
      return true;
    });
  }

  return {
    decision: 'block',
    reason:
      `SUBAGENTSTOP_RESULT_MISSING: o subagente "${agentType}" encerrou sem um bloco ` +
      `PIPELINE_AGENT_RESULT_V1 válido (${parsed && parsed.error ? parsed.error : 'no valid result block'}). ` +
      're-emita o bloco de resultado (status completed|awaiting_user_gate|failed) como a ÚLTIMA mensagem.',
    additionalContext:
      'Re-emit a single fenced === PIPELINE_AGENT_RESULT_V1 === block as your final message, using only the ' +
      'known governance keys (status/summary/next_agent/findings/evidence/reason/detail/metrics/blocking) and a ' +
      'closed status value (completed | awaiting_user_gate | failed).',
  };
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(String(s).trim() || '{}');
      const out = decide(payload);
      if (out && out.decision === 'block') {
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: out.reason,
          hookSpecificOutput: {
            hookEventName: 'SubagentStop',
            additionalContext: out.additionalContext || '',
          },
        }));
      } else {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'SubagentStop' },
        }));
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('subagent-stop-commit-hook error: ' + (e && e.message ? e.message : e) + '\n');
      process.exit(0); // fail-open on any error (anti-deadlock)
    }
  });
}

module.exports = { decide, stepForAgentType, CORRECTION_CAP };
