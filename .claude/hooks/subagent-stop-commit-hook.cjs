#!/usr/bin/env node
'use strict';

// =============================================================================
// subagent-stop-commit-hook.cjs — v8.10.0 (SubagentStop) — T13 (REQ-SUBAGENTSTOP-COMMIT)
// =============================================================================
// The commit point for a governed subagent. On SubagentStop it confirms the agent
// closed on a REAL, parseable PIPELINE_AGENT_RESULT_V1 block (the producer is the 9
// governed agents from T11) instead of trusting presence/absence. DEFAULT-OFF: the
// gate is inert unless PIPELINE_SUBAGENTSTOP_ENFORCEMENT=deny arms it (default 'warn').
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

// Invert the manifest's step→agents map for a workflow to find the step that owns an
// agent_type. Returns the step name or null when the agent is NOT in the spine.
function stepForAgentType(workflowKey, agentType) {
  if (!manifest || !manifest.WORKFLOWS) return null;
  const wf = manifest.WORKFLOWS[workflowKey];
  if (!wf || !wf.agents_by_step) return null;
  for (const step of Object.keys(wf.agents_by_step)) {
    const leaves = wf.agents_by_step[step];
    if (Array.isArray(leaves) && leaves.indexOf(agentType) >= 0) return step;
  }
  return null;
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

  const armed = (process.env.PIPELINE_SUBAGENTSTOP_ENFORCEMENT || 'warn').toLowerCase() === 'deny';

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
  // Present-but-not-active → allow.
  if (state.pipeline_active !== true) return { decision: 'allow' };

  // Map agent_type → step. Not in the spine ⇒ ungoverned for the commit point ⇒ allow.
  const workflowKey = typeof state.workflow === 'string' ? state.workflow : 'FULL';
  const step = stepForAgentType(workflowKey, agentType);
  if (!step) return { decision: 'allow' };

  // resultRequired for the step. An env override of 'false' models a step the
  // manifest reports as not-required (T13-S4) — allow without inspecting the message.
  const overrideFalse = (process.env.PIPELINE_SUBAGENTSTOP_RESULT_REQUIRED_OVERRIDE || '').toLowerCase() === 'false';
  const resultRequired = !overrideFalse
    && manifest && typeof manifest.resultRequired === 'function'
    && manifest.resultRequired(workflowKey, step);
  if (!resultRequired) return { decision: 'allow' };

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
