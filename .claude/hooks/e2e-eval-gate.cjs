#!/usr/bin/env node
'use strict';

// =============================================================================
// e2e-eval-gate.cjs — Stop event — the self-improvement loop trigger
// =============================================================================
// Runs on every pipeline close. On a COMPLETED governed run it scores the run's
// execution step-by-step (deterministic, AI-free) and writes e2e-eval.{json,md}
// + a line to .pipeline/eval-log.jsonl — ALWAYS, cost ~0. If the run was clean
// (0 glitches) it allows the Stop. If it found glitches, it BLOCKS the Stop with
// an additionalContext instructing the PARENT to run /pipeline-orchestrator:self-eval
// (the LLM proposal + human-gated fix loop) — the hook itself cannot call the LLM.
//
// The LLM half (and its own Stop/SubagentStop) cannot recurse: a signed
// `e2e_eval_completed` marker in sentinel-state short-circuits this hook, and a
// continuity cap forces completion if the user ignores the prompt. SessionEnd /
// StopFailure never act (recovery paths stay intact). Soft-fail: any internal
// error allows teardown.
//
// Iron Law: this is a hook, not a registry gate. It writes only .pipeline/ artifacts
// + AUDIT-class state markers. Created 2026-06-26 (plan: reactive-purring-yao).
//
// Escape: PIPELINE_E2E_EVAL_ENFORCEMENT=warn|off → still scores + logs (the
// valuable dataset) but never blocks (no forced LLM loop).
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
let evaluator = null;
try { evaluator = require('../../lib/e2e-evaluator.cjs'); } catch { evaluator = null; }
let C = null;
try { C = require('../../lib/contracts/e2e-eval.cjs'); } catch { C = null; }

const GO_DECISIONS = new Set(['GO', 'CONFIRMED', 'APPROVED']);
function isGoValue(v) { return typeof v === 'string' && GO_DECISIONS.has(v.trim().toUpperCase()); }

// Enforcement ON by default (user choice: evaluate every close). Escape to
// observe-only (score + log, never block) via the env flag.
function isEnforced() {
  return !/^(warn|off|0|false|no|allow|disabled|observe)$/i
    .test(String(process.env.PIPELINE_E2E_EVAL_ENFORCEMENT || '').trim());
}

function isTerminalState(value) {
  if (manifest && typeof manifest.isTerminal === 'function') return manifest.isTerminal(value);
  return ['completed', 'hard_failed', 'aborted_by_user', 'cancelled'].includes(value);
}
function isComplete(state) {
  if (!state || typeof state !== 'object') return false;
  return isTerminalState(state.terminal_state) || isTerminalState(state.status);
}

// A REAL success-completion signal (parity with stop-gate-hook): lets this hook
// act on the SAME Stop that completes the run, without depending on hook ordering
// (stop-gate-hook's writeCompleted may not have landed yet when we read).
const GATE_TAIL_MAX_BYTES = 256 * 1024;
const GATE_TAIL_MAX_LINES = 50;
function hasSuccessSignal(state, docDir) {
  if (state && isGoValue(state.final_decision)) return true;
  if (!docDir) return false;
  const gdPath = path.join(docDir, 'gate-decisions.jsonl');
  let raw;
  try {
    const st = fs.statSync(gdPath);
    const start = st.size > GATE_TAIL_MAX_BYTES ? st.size - GATE_TAIL_MAX_BYTES : 0;
    const fd = fs.openSync(gdPath, 'r');
    try {
      const len = st.size - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      raw = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return false; }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim()).slice(-GATE_TAIL_MAX_LINES);
  for (let i = lines.length - 1; i >= 0; i--) {
    let ev; try { ev = JSON.parse(lines[i]); } catch { continue; }
    if (ev && (ev.gate === 'CLOSEOUT_CONFIRM' || ev.gate === 'PA_DE_CAL')) return isGoValue(ev.decision);
  }
  return false;
}

// The run is "done" (eligible for eval) when it is terminal OR carries a real
// success signal. An incomplete run with no success signal is left to stop-gate-hook.
function isRunDone(state, docDir) {
  return isComplete(state) || hasSuccessSignal(state, docDir);
}

function resolveStatePath(pipelineDir) {
  try {
    if (eg && typeof eg.discoverStatePath === 'function') {
      const { statePath } = eg.discoverStatePath(pipelineDir);
      return statePath;
    }
  } catch { /* */ }
  return null;
}

// repoRoot = the ancestor holding .pipeline. Derived from the run's doc path so
// the evaluator + eval-log resolve to the right root regardless of cwd quirks.
function repoRootFromDoc(docPath, fallback) {
  if (typeof docPath === 'string') {
    const needle = `${path.sep}.pipeline${path.sep}`;
    const idx = docPath.indexOf(needle);
    if (idx > 0) return docPath.slice(0, idx);
  }
  return fallback;
}

// Persist a state mutation under the lock: re-read → verify → mutate → re-sign →
// atomic-rename (mirror of stop-gate-hook.persist). mutate returns true to commit.
function persist(statePath, mutate) {
  if (!signer || typeof signer.writeSignedState !== 'function') return;
  const doWrite = () => {
    let state;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return; }
    if (!state || typeof state !== 'object') return;
    try {
      if (typeof signer.verifyState === 'function') {
        const v = signer.verifyState(state, { key: signer.readHmacKey() });
        if (!v.valid && !v.unsigned && !v.key_unavailable) return; // do not write over corrupt
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
  } catch { /* best-effort */ }
}

function setCompleted(statePath, value) {
  if (!C) return;
  persist(statePath, (st) => { st[C.MARKERS.COMPLETED] = value; return true; });
}

function blockReason(score, glitchCount) {
  return (
    'E2E_SELF_EVAL_REQUIRED: o run terminou com ' + glitchCount + ' falha(s) de execução ' +
    '(nota ' + (score === null ? 'n/a' : score + '/100') + '). Antes de encerrar, rode a ' +
    'auto-avaliação para revisar as falhas e decidir os consertos — nada é alterado sem a sua ' +
    'autorização. Investigação e perguntas seguem liberadas.'
  );
}
function blockContext(docPath, score, glitchCount) {
  return (
    'Next action: run /pipeline-orchestrator:self-eval to review this run\'s ' + glitchCount +
    ' execution glitch(es) (e2e_score ' + (score === null ? 'n/a' : score) + '). The deterministic ' +
    'findings are in ' + path.join(docPath, 'e2e-eval.json') + '. For each glitch the command will ' +
    'PROPOSE a fix; nothing is applied without your approval (approve → fix, reject → record). ' +
    'When the loop finishes it marks the run e2e_eval_completed and this Stop will pass.'
  );
}

function decide(payload) {
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (!evaluator || !C) return { decision: 'allow' }; // dependencies missing → never block teardown

  const event = payload.hook_event_name;
  // Recovery paths never evaluate (parity with stop-gate-hook).
  if (event === 'SessionEnd' || event === 'StopFailure') return { decision: 'allow' };

  const pipelineDir = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  let state = null;
  try { state = eg && eg.findActiveSentinelState(pipelineDir); } catch { state = null; }
  if (!state) return { decision: 'allow' };                       // ungoverned/absent
  if (eg && state === eg.CORRUPT_SENTINEL) return { decision: 'allow' }; // never block on corrupt

  // Anti-recursion: the eval already ran to completion for this run.
  if (state[C.MARKERS.COMPLETED]) return { decision: 'allow' };

  const statePath = resolveStatePath(pipelineDir);
  const docPath = statePath ? path.dirname(statePath) : null;
  if (!docPath) return { decision: 'allow' };                     // cannot locate run → never deadlock

  // Only act once the run is genuinely done.
  if (!isRunDone(state, docPath)) return { decision: 'allow' };   // incomplete → stop-gate-hook owns it

  const repoRoot = repoRootFromDoc(docPath, pipelineDir);

  // Score ONCE (idempotent): if e2e-eval.json already exists this is a re-entry
  // (user ignored a prior prompt) — reuse it, do NOT re-append to eval-log.
  let glitchCount = 0;
  let score = null;
  const evalJsonPath = path.join(docPath, 'e2e-eval.json');
  if (fs.existsSync(evalJsonPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(evalJsonPath, 'utf8'));
      glitchCount = Number.isFinite(prev.glitch_count) ? prev.glitch_count : 0;
      score = (typeof prev.e2e_score === 'number') ? prev.e2e_score : null;
    } catch { return { decision: 'allow' }; }
  } else {
    let ev;
    try { ev = evaluator.evaluateRun({ pipelineDocPath: docPath, repoRoot, state }); }
    catch { return { decision: 'allow' }; }
    if (!ev || !ev.ok) return { decision: 'allow' };
    glitchCount = ev.glitch_count || 0;
    score = (typeof ev.e2e_score === 'number') ? ev.e2e_score : null;
  }

  // Clean run → mark complete + allow (cost was just the deterministic score).
  if (glitchCount === 0) {
    if (statePath) setCompleted(statePath, true);
    return { decision: 'allow' };
  }

  // Glitches found. Observe-only mode: log was already written; never block.
  if (!isEnforced()) {
    if (statePath) setCompleted(statePath, 'observe');
    return { decision: 'allow' };
  }

  // Continuity cap: never deadlock if the user keeps stopping without running /self-eval.
  const prior = Number.isFinite(state[C.MARKERS.CONTINUITY]) ? state[C.MARKERS.CONTINUITY] : 0;
  const thisAttempt = prior + 1;
  if (thisAttempt >= C.CONTINUITY_CAP) {
    if (statePath) setCompleted(statePath, 'forced');
    return { decision: 'allow' };
  }

  // Block + force the parent into the human-gated /self-eval loop. Set the pending
  // marker AND pipeline_active:false (so edit-guard's plan-gate goes inert for the
  // fix turn — see plan: writeCompleted does not zero pipeline_active).
  if (!statePath) return { decision: 'allow' }; // cannot persist counter → don't deadlock
  persist(statePath, (st) => {
    st[C.MARKERS.PENDING] = true;
    st[C.MARKERS.CONTINUITY] = thisAttempt;
    st.pipeline_active = false;
    return true;
  });
  return {
    decision: 'block',
    reason: blockReason(score, glitchCount),
    additionalContext: blockContext(docPath, score, glitchCount),
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
          hookSpecificOutput: { hookEventName: 'Stop', additionalContext: out.additionalContext || '' },
        }));
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('e2e-eval-gate error: ' + (e && e.message ? e.message : e) + '\n');
      process.exit(0); // fail-open: never block teardown on an internal error
    }
  });
}

module.exports = { decide, isComplete, isRunDone, hasSuccessSignal, repoRootFromDoc };
