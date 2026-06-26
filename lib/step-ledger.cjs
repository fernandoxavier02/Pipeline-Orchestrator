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
  // Batch 1 (audit ARCH-2): brainstorm's AGENT-dispatched prefix IS ledger-orderable.
  // Its LATER steps (spec-init/requirements/design/tasks/handoff) are SKILL-dispatched
  // and governed by SKILL.md sequence_lock — NOT this ledger — so they are deliberately
  // absent here. Closure completeness for brainstorm is therefore NOT ledger-governed
  // (see WORKFLOW_REGISTRY.brainstorm.ledgerGovernsClosure=false).
  brainstorm: {
    'brainstorm-step-00-intake': 'intake',
    'brainstorm-step-01-explore': 'explore',
    'brainstorm-step-01b-alternatives': 'alternatives',
  },
  // Spec phases are SKILL-dispatched + seal-governed → no agent steps by design.
  Spec: {},
};

// =============================================================================
// WORKFLOW REGISTRY (Batch 1 — audit ARCH-2 / ARCH-3 / ARCH-7) — single SSOT
// =============================================================================
// ONE place that knows, per workflow: how to derive its key from state, and whether
// the AGENT ledger governs its CLOSURE completeness. Replaces the
// `workflow_key || (task_type==='Spec'?'Spec':'FULL')` heuristic that was DUPLICATED
// across four hooks (ARCH-7), silently mis-mapped brainstorm → FULL (ARCH-3), and the
// false assumption that the agent ledger governs EVERY workflow's completeness
// (ARCH-2 — Spec/brainstorm interleave skill-dispatched steps governed by the seal /
// sequence_lock, NOT this ledger).
const WORKFLOW_REGISTRY = {
  FULL: { task_types: ['Bug Fix', 'Feature', 'User Story', 'Audit', 'UX Simulation', 'Refactor'], ledgerGovernsClosure: true },
  Spec: { task_types: ['Spec'], ledgerGovernsClosure: false },
  brainstorm: { task_types: [], ledgerGovernsClosure: false },
};

// SSOT derivation of the workflow key from a sentinel-state. An explicit, KNOWN
// workflow_key wins; else map by task_type via the registry; else FULL. Critically it
// NEVER collapses a recognized brainstorm/Spec run to FULL (ARCH-3): an explicit
// workflow_key='brainstorm' is honored, and task_type='Spec' maps to Spec.
function resolveWorkflowKey(state) {
  const wk = state && state.workflow_key;
  if (typeof wk === 'string' && wk && Object.prototype.hasOwnProperty.call(STEP_MANIFESTS, wk)) return wk;
  const tt = state && state.task_type;
  if (typeof tt === 'string' && tt) {
    for (const key of Object.keys(WORKFLOW_REGISTRY)) {
      if (WORKFLOW_REGISTRY[key].task_types.includes(tt)) return key;
    }
  }
  return 'FULL';
}

// Does the AGENT step-ledger govern this workflow's CLOSURE completeness? FALSE for
// skill/seal-governed workflows (Spec, brainstorm) — for those, the chain-complete
// close MUST NOT apply (it would DEADLOCK them, exactly as the audit predicted), and
// completeness is the seal/GO signal's responsibility, not the agent ledger's.
function ledgerGovernsClosure(workflowKey) {
  const def = WORKFLOW_REGISTRY[workflowKey];
  return !!(def && def.ledgerGovernsClosure);
}

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

// =============================================================================
// CHAIN INTEGRITY (Lote 2 — chain-tied enforcement)
// =============================================================================
// The state's step_ledger is ALREADY HMAC-signed (sentinel-state-signer), so it
// cannot be forged without the key — a separate per-link hash would add no
// security over that signature. What the chain logic adds is ORDER INTEGRITY +
// COMPLETENESS over the manifest, computed on the existing array:
//   - the stamped agent-steps must form an in-order prefix of the workflow's
//     agent-step sequence (no gap before the furthest-stamped step = no skip);
//   - the run is COMPLETE only when every manifest agent-step is stamped in order.
// These are consumed by the universal step-aware guard (Lote 3 — "are you at the
// expected step?") and the closure gate (Lote 4 — complete chain required before
// Stop). PURE; never throws; no state-shape change.

function _stampedSet(state) {
  const arr = state && Array.isArray(state.step_ledger) ? state.step_ledger : [];
  return new Set(arr);
}

// The first agent-step in manifest order that is NOT yet stamped — the step the
// run is legitimately allowed to be working on next. null when the chain is
// complete. ('' workflowKey / unknown → null: ungoverned, nothing expected.)
function expectedNextStep(state, workflowKey) {
  const seq = agentStepsFor(workflowKey);
  const set = _stampedSet(state);
  for (const s of seq) if (!set.has(s)) return s;
  return null;
}

// Order integrity: every manifest agent-step BEFORE the furthest-stamped one must
// itself be stamped (you cannot legitimately be at step N with an earlier step
// missing). Returns { valid, brokenAt }. An empty manifest / empty ledger is valid
// (nothing to violate). Stamped steps not in the manifest are ungoverned → ignored.
function verifyChainOrder(state, workflowKey) {
  const seq = agentStepsFor(workflowKey);
  const set = _stampedSet(state);
  let furthest = -1;
  for (let i = 0; i < seq.length; i++) if (set.has(seq[i])) furthest = i;
  for (let i = 0; i <= furthest; i++) {
    if (!set.has(seq[i])) return { valid: false, brokenAt: seq[i] };
  }
  return { valid: true, brokenAt: null };
}

// COMPLETE = order intact AND every manifest agent-step stamped (expectedNext===null).
// A workflow with no agent-steps is never "complete" (there is nothing to anchor on).
function isChainComplete(state, workflowKey) {
  if (agentStepsFor(workflowKey).length === 0) return false;
  return verifyChainOrder(state, workflowKey).valid && expectedNextStep(state, workflowKey) === null;
}

// AUTO-RECOVERY (Lote 4 — user choice "fechado com auto-recuperação"). When a
// governed run's chain is broken/incomplete, recovery RE-ANCHORS to the last valid
// link: the expected step becomes the FIRST UNSTAMPED manifest step — never a step
// forward of what was actually stamped. Recovery = re-anchor on what is TRUE, never
// fabricate progress, never "wipe and continue" (that would be a new backdoor). When
// there is NO valid anchor (unknown workflow / no manifest), recovery does NOT apply
// → the run stays frozen for the operator escape. PURE; the caller does the re-stamp.
function buildChainRecovery(state, workflowKey) {
  if (agentStepsFor(workflowKey).length === 0) {
    return {
      anchorable: false, complete: false, broken: false, reanchorTo: null,
      reason: 'CHAIN_NO_ANCHOR: fluxo sem manifesto conhecido — sem elo válido pra ancorar. ' +
        'Recuperação automática não se aplica; resolva manualmente ou use o escape de ambiente.',
    };
  }
  if (isChainComplete(state, workflowKey)) {
    return { anchorable: true, complete: true, broken: false, reanchorTo: null,
      reason: 'CHAIN_COMPLETE: corrente íntegra e completa — nada a recuperar.' };
  }
  const order = verifyChainOrder(state, workflowKey);
  const reanchorTo = expectedNextStep(state, workflowKey); // first UNSTAMPED step — never forward
  return {
    anchorable: true, complete: false, broken: !order.valid, brokenAt: order.brokenAt, reanchorTo,
    reason:
      `CHAIN_REANCHOR: re-ancorando no último elo válido — o passo esperado volta a ser '${reanchorTo}'` +
      (order.valid ? '' : ` (ordem quebrada em '${order.brokenAt}')`) +
      `. Recuperar = re-ancorar no que é verdadeiro, nunca inventar progresso pra frente. ` +
      `Retome despachando o agente de '${reanchorTo}'.`,
  };
}

module.exports = {
  decideStep, requiredStepsFor, buildStepReason, STEP_MANIFESTS,
  AGENT_STEP_MAP, stepForAgent, agentStepsFor, decideAgentSpawn,
  expectedNextStep, verifyChainOrder, isChainComplete, buildChainRecovery,
  WORKFLOW_REGISTRY, resolveWorkflowKey, ledgerGovernsClosure,
};
