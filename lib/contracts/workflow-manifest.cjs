'use strict';

// =============================================================================
// lib/contracts/workflow-manifest.cjs — T1 (REQ-MANIFEST), v8.9.0.
// =============================================================================
// The single executable SSOT that DESCRIBES the installed STAMP→GATE realization
// of the pipeline workflows: per-workflow ordered spine, the agent→step map, the
// per-step result/evidence obligations, terminal states, and the anti-deadlock
// deny-exception table. It REPLACES nothing at runtime — it is a pure, standalone,
// fully-unit-tested contract module wired to NO consumer (contract-first, Q2).
// Consumers migrate to it incrementally in later wiring tasks.
//
// ANTI-INVENTION (H1 / NFR-NO-INVENTED-CONFIG):
//   The FULL spine + agent→step map are DERIVED from lib/step-ledger.cjs:28-35
//   (STEP_MANIFESTS.FULL) and :74-86 (AGENT_STEP_MAP.FULL) — the only workflow for
//   which an agent→step map exists in code. Every other declared mode (DIAGNOSTIC,
//   REVIEW-ONLY, HOTFIX, PAPERCLIP, Spec, brainstorm) carries `agents_by_step: null`
//   exactly, with the blocker named inline (GAP-02 / E.3). Nothing is invented:
//   the spine for non-FULL modes does not exist in code, so the manifest enumerates
//   the modes without fabricating a spine.
//
// ANTI-DEADLOCK (H2 / NFR-NO-DEADLOCK):
//   The single deny-exception table is the SSOT for every new deny gate's
//   anti-deadlock posture. Governed actions on corrupt signed state DENY (parity
//   with shipped v8.8.0 B2); ungoverned / absent / unsigned-migration /
//   non-governed-corrupt paths are NEVER hard-blocked.
//
// PURITY: zero fs/env/io side-effects at require time (S1-11). Pure functions only.
// =============================================================================

// ---- FULL spine, DERIVED from step-ledger.cjs (not invented) ----------------
// step-ledger.cjs:30  STEP_MANIFESTS.FULL
const FULL_STEPS = Object.freeze([
  'classify', 'info-gate', 'proposal', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final',
]);

// step-ledger.cjs:75-85  AGENT_STEP_MAP.FULL — leaf → step. Kept as step → leaves
// here (the manifest's consumers ask "which agents may mark the next step"), but
// derived from exactly the same pairs. Nothing outside this map is ever returned.
const FULL_AGENTS_BY_STEP = Object.freeze({
  classify: Object.freeze(['task-orchestrator']),
  'info-gate': Object.freeze(['information-gate']),
  // 'proposal' is a user-gate step that NO agent stamps (step-ledger comment :93-100).
  plan: Object.freeze(['plan-architect']),
  tdd: Object.freeze(['quality-gate-router', 'pre-tester']),
  execute: Object.freeze(['executor-controller']),
  adversarial: Object.freeze(['review-orchestrator']),
  sanity: Object.freeze(['sanity-checker']),
  final: Object.freeze(['final-validator']),
});

// Per-step obligations for FULL. result_required: the step must produce a valid
// PIPELINE_AGENT_RESULT_V1 block (consumed later by REQ-RESULT-ENFORCE, DEFER).
// evidence_required: the step must carry machine evidence (consumed later by the
// DEFER'd evidenceRequired() wiring + machine-evidence collectors, GAP-08). These
// are DECLARED here and wired to nothing this iteration (Q2).
const FULL_STEP_OBLIGATIONS = Object.freeze({
  classify:    Object.freeze({ result_required: true,  evidence_required: false }),
  'info-gate': Object.freeze({ result_required: true,  evidence_required: false }),
  proposal:    Object.freeze({ result_required: false, evidence_required: false }),
  plan:        Object.freeze({ result_required: true,  evidence_required: false }),
  tdd:         Object.freeze({ result_required: true,  evidence_required: true  }),
  execute:     Object.freeze({ result_required: true,  evidence_required: true  }),
  adversarial: Object.freeze({ result_required: true,  evidence_required: true  }),
  sanity:      Object.freeze({ result_required: true,  evidence_required: true  }),
  final:       Object.freeze({ result_required: true,  evidence_required: false }),
});

// Honest terminal states (parity with the Stop gate, T5 / REQ-STOP-GATE).
const TERMINAL_STATES = Object.freeze([
  'completed', 'hard_failed', 'aborted_by_user', 'cancelled',
]);
const TERMINAL_SET = new Set(TERMINAL_STATES);

// Anti-deadlock deny-exception table (H2). The KEY is the condition under which a
// new deny gate is being asked to decide; the VALUE is the manifest-declared
// posture. Only a GOVERNED action on CORRUPT signed state hard-denies.
const DENY_EXCEPTIONS = Object.freeze({
  // governed run + corrupt signed state → DENY (v8.8.0 B2 parity, H2).
  state_corrupt_governed: 'deny',
  // every anti-deadlock path → allow (ungoverned / absent / migration-unsigned /
  // a non-governed action even on corrupt state).
  ungoverned: 'allow',
  state_absent: 'allow',
  state_unsigned: 'allow',
  state_corrupt_ungoverned: 'allow',
});

// ---- Frozen WORKFLOWS SSOT --------------------------------------------------
// FULL carries the derived spine; every non-FULL mode carries agents_by_step:null
// with the blocker named (GAP-02). The whole structure is deeply frozen.
const WORKFLOWS = Object.freeze({
  FULL: Object.freeze({
    steps: FULL_STEPS,
    agents_by_step: FULL_AGENTS_BY_STEP,
    step_obligations: FULL_STEP_OBLIGATIONS,
    terminal_states: TERMINAL_STATES,
  }),
  // Non-FULL modes: present-but-null spine (no agent→step map exists in code —
  // step-ledger.cjs:74-86 is FULL-keyed only). Blocker named per E.3.
  DIAGNOSTIC: Object.freeze({
    // blocker: no agent→step map in code (step-ledger.cjs:74-91 is FULL-only).
    steps: null, agents_by_step: null, step_obligations: null, terminal_states: TERMINAL_STATES,
  }),
  'REVIEW-ONLY': Object.freeze({
    // blocker: same — derive from controller in a later wiring task.
    steps: null, agents_by_step: null, step_obligations: null, terminal_states: TERMINAL_STATES,
  }),
  HOTFIX: Object.freeze({
    // blocker: same — no in-code spine.
    steps: null, agents_by_step: null, step_obligations: null, terminal_states: TERMINAL_STATES,
  }),
  PAPERCLIP: Object.freeze({
    // blocker: Paperclip runs its own lifecycle; no in-code spine here.
    steps: null, agents_by_step: null, step_obligations: null, terminal_states: TERMINAL_STATES,
  }),
  Spec: Object.freeze({
    // blocker: spec lifecycle has steps (step-ledger.cjs:32) but no agent→step map (H1).
    steps: null, agents_by_step: null, step_obligations: null, terminal_states: TERMINAL_STATES,
  }),
  brainstorm: Object.freeze({
    // blocker: brainstorm controller table is prose, not a code map (H1).
    steps: null, agents_by_step: null, step_obligations: null, terminal_states: TERMINAL_STATES,
  }),
});

// ---- Pure helpers -----------------------------------------------------------

function workflow(workflowKey) {
  return Object.prototype.hasOwnProperty.call(WORKFLOWS, workflowKey) ? WORKFLOWS[workflowKey] : null;
}

// nextAllowedAgents(workflowKey, currentStep) → leaves that may mark the NEXT step.
// Derived ONLY from the workflow's agents_by_step; a null spine returns []. Never
// invents an agent (S1-4).
function nextAllowedAgents(workflowKey, currentStep) {
  const wf = workflow(workflowKey);
  if (!wf || !Array.isArray(wf.steps) || !wf.agents_by_step) return [];
  const idx = wf.steps.indexOf(currentStep);
  if (idx < 0 || idx + 1 >= wf.steps.length) return [];
  // Walk forward to the next step that actually has agents (skips user-gate steps
  // like 'proposal' that no agent stamps).
  for (let i = idx + 1; i < wf.steps.length; i += 1) {
    const leaves = wf.agents_by_step[wf.steps[i]];
    if (Array.isArray(leaves) && leaves.length) return leaves.slice();
  }
  return [];
}

// isTransitionAllowed(workflowKey, fromStep, toStep) → boolean.
// A null spine allows EVERY transition (anti-deadlock — an absent spine must never
// block, S1-3). For a present spine, only a strict forward move along the ordered
// steps is allowed (a backward jump is denied, S1-2).
function isTransitionAllowed(workflowKey, fromStep, toStep) {
  const wf = workflow(workflowKey);
  if (!wf) return true;                         // unknown workflow → do not block
  if (!Array.isArray(wf.steps)) return true;    // null spine → ungoverned → allow
  const fi = wf.steps.indexOf(fromStep);
  const ti = wf.steps.indexOf(toStep);
  if (fi < 0 || ti < 0) return true;            // a step outside this spine is ungoverned
  return ti > fi;                               // strictly forward only
}

// resultRequired(workflowKey, step) → boolean. Absent obligation → false.
function resultRequired(workflowKey, step) {
  const wf = workflow(workflowKey);
  if (!wf || !wf.step_obligations) return false;
  const o = wf.step_obligations[step];
  return !!(o && o.result_required);
}

// evidenceRequired(workflowKey, step) → boolean. Absent obligation → false.
// (Wired to nothing this iteration — GAP-08 consumer is DEFER'd.)
function evidenceRequired(workflowKey, step) {
  const wf = workflow(workflowKey);
  if (!wf || !wf.step_obligations) return false;
  const o = wf.step_obligations[step];
  return !!(o && o.evidence_required);
}

// buildEvidenceRequired(workflowKey) → { step: bool, ... }. Keys are ONLY real
// steps of the workflow (S1-6); a null spine returns {}.
function buildEvidenceRequired(workflowKey) {
  const wf = workflow(workflowKey);
  if (!wf || !Array.isArray(wf.steps) || !wf.step_obligations) return {};
  const out = {};
  for (const step of wf.steps) {
    const o = wf.step_obligations[step];
    out[step] = !!(o && o.evidence_required);
  }
  return out;
}

// isTerminal(state) → boolean over the honest terminal vocabulary.
function isTerminal(state) {
  return TERMINAL_SET.has(state);
}

// denyException(condition) → 'deny' | 'allow'. The SSOT anti-deadlock posture.
// An unknown condition defaults to 'allow' (anti-deadlock: never invent a new
// hard-deny path; only the explicitly-listed governed-corrupt path denies).
function denyException(condition) {
  if (Object.prototype.hasOwnProperty.call(DENY_EXCEPTIONS, condition)) {
    return DENY_EXCEPTIONS[condition];
  }
  return 'allow';
}

module.exports = {
  WORKFLOWS,
  TERMINAL_STATES,
  DENY_EXCEPTIONS,
  nextAllowedAgents,
  isTransitionAllowed,
  resultRequired,
  evidenceRequired,
  buildEvidenceRequired,
  isTerminal,
  denyException,
};
