#!/usr/bin/env node
'use strict';

// =============================================================================
// step-ledger.cjs — v8.7.0 — the general ordered-step enforcement core
// =============================================================================
// ONE engine for every "do these in order" obligation that used to be prose:
// pipeline phases, spec-lifecycle phases, and brainstorm steps. Each step stamps
// its id into the signed sentinel-state; a PreToolUse gate calls decideStep()
// before letting a tool advance to a step whose prerequisites are not all
// stamped. Pure + deterministic; the I/O gate that reads the state and maps a
// tool/agent to a step is a thin wrapper layered on top (next increment).
//
// Generalizes the v8.5.0 spec-seal / record-spec-step pattern from one workflow
// to all of them via STEP_MANIFESTS. NEVER throws; warn mode is the escape.
//
// SCOPE NOTE (AUDIT-002, D4): skill-dispatched variants (refactor-light /
// refactor-heavy, and the other *-light/-heavy skills) run their internal steps
// as SKILL steps, NOT as individually-governed Agent spawns. Their step-order is
// therefore governed by the SKILL.md `sequence_lock` + sentinel checkpoints —
// and, for refactor specifically, by the write-time `REFACTOR_SCOPE_LOCK` hook in
// .claude/hooks/scope-lock-hook.cjs — NOT by this ledger. This ledger only orders
// the top-level pipeline/spec/brainstorm Agent spawns (see AGENT_STEP_MAP).
// =============================================================================

// Required ordered step sequences per workflow. The wiring maps an Agent spawn
// (subagent_type) / phase transition to a step id; this manifest decides order.
const STEP_MANIFESTS = {
  // Pipeline FULL run (commands/pipeline.md phase flow).
  FULL: ['classify', 'info-gate', 'proposal', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final'],
  // Spec authoring lifecycle (spec-controller).
  Spec: ['classify', 'clarify', 'requirements', 'validate-gap', 'design', 'validate-design', 'tasks', 'review', 'seal'],
  // Brainstorm preparation pipeline (brainstorm-controller).
  brainstorm: ['intake', 'explore', 'alternatives', 'spec-init', 'requirements', 'design', 'tasks', 'handoff'],
};

function buildStepReason(attempted, missing) {
  return (
    `STEP_LEDGER_VIOLATION: o passo '${attempted}' exige que estes passos anteriores estejam ` +
    `carimbados no estado assinado antes de rodar: [${missing.join(', ')}]. ` +
    `Rode-os na ordem (cada fase/agente carimba o seu passo) — não pule. ` +
    `Investigação (Read/Grep/Glob) e perguntas seguem liberadas.`
  );
}

// PURE decision. ctx: { requiredSteps:[], stampedSteps:[], attemptedStep, enforce }
function decideStep(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const req = Array.isArray(ctx.requiredSteps) ? ctx.requiredSteps : [];
  const attempted = ctx.attemptedStep;
  if (typeof attempted !== 'string' || !attempted) return { decision: 'allow' };

  const idx = req.indexOf(attempted);
  if (idx < 0) return { decision: 'allow' }; // step not governed by this ledger

  const stamped = new Set(Array.isArray(ctx.stampedSteps) ? ctx.stampedSteps : []);
  const missing = req.slice(0, idx).filter((s) => !stamped.has(s));
  if (missing.length === 0) return { decision: 'allow' };

  if (String(ctx.enforce || 'deny').toLowerCase() === 'warn') {
    return { decision: 'allow', warn: true, missing };
  }
  return { decision: 'block', missing, reason: buildStepReason(attempted, missing) };
}

// Convenience: resolve the required sequence for a workflow key (FULL/Spec/…).
function requiredStepsFor(workflowKey) {
  return STEP_MANIFESTS[workflowKey] ? STEP_MANIFESTS[workflowKey].slice() : [];
}

// Maps a spawned agent leaf (last ':' segment of subagent_type) to its step id,
// per workflow. Agents not listed are UNGOVERNED — their spawn is always allowed
// (sentinel, executor sub-agents, etc. are not phase markers).
const AGENT_STEP_MAP = {
  FULL: {
    'task-orchestrator': 'classify',
    'information-gate': 'info-gate',
    'plan-architect': 'plan',
    'quality-gate-router': 'tdd',
    'pre-tester': 'tdd',
    'executor-controller': 'execute',
    'review-orchestrator': 'adversarial',
    'sanity-checker': 'sanity',
    'final-validator': 'final',
  },
};

function stepForAgent(workflowKey, agentLeaf) {
  const m = AGENT_STEP_MAP[workflowKey] || {};
  return (agentLeaf && m[agentLeaf]) || null;
}

// The ordered subsequence of a workflow's steps that are AGENT-marked. The
// spawn gate enforces order only among these — non-agent steps (e.g. the
// 'proposal' user gate, which no agent stamps) are NOT ordering prerequisites
// here, or they would block the next agent forever (they are enforced by other
// gates: TDD_APPROVAL, the proposal AskUserQuestion, etc.).
function agentStepsFor(workflowKey) {
  const agentSteps = new Set(Object.values(AGENT_STEP_MAP[workflowKey] || {}));
  return requiredStepsFor(workflowKey).filter((s) => agentSteps.has(s));
}

// Decides whether an Agent spawn may proceed given the stamped ledger.
// ctx: { workflowKey, agentType, stampedSteps, enforce }
function decideAgentSpawn(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const leaf = String(ctx.agentType || '').split(':').pop();
  const step = stepForAgent(ctx.workflowKey, leaf);
  if (!step) return { decision: 'allow' }; // ungoverned agent
  return decideStep({
    requiredSteps: agentStepsFor(ctx.workflowKey),
    stampedSteps: ctx.stampedSteps,
    attemptedStep: step,
    enforce: ctx.enforce,
  });
}

module.exports = {
  decideStep, requiredStepsFor, buildStepReason, STEP_MANIFESTS,
  AGENT_STEP_MAP, stepForAgent, agentStepsFor, decideAgentSpawn,
};
