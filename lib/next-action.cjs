'use strict';

// =============================================================================
// lib/next-action.cjs — Next-Action Contract SSOT (T1.1, loop/next-action-contract).
// =============================================================================
// Genesis: docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md §4 P1. Today
// a deny/block computes exactly what is missing (it reads run state) but does not
// hand back an EXECUTABLE next step as a guaranteed contract — corrective
// descriptors sometimes land empty (E1), and the recipient (parent vs a dispatched
// subagent with no Agent tool, Achado #7) is never distinguished in the message.
//
// This module is the PURE resolver: given an invariant + minimal context, it
// always returns a non-empty, concrete next action for BOTH possible readers —
// it never tries to detect which one is actually reading (session_id is
// identical between parent and subagent; see edit-guard-hook.cjs:538-544 and the
// loop's own facts) — both `parent_action` and `subagent_fallback_action` are
// always populated so whichever reader gets the deny has something it can run.
//
// PURITY: zero fs/network/hook I/O at require time or call time — pure functions
// over the arguments given. Callers (future hook wiring, T1.2/T1.3) own reading
// on-disk state and pass it in via `ctx`.
// =============================================================================

const { WORKFLOWS } = require('./contracts/workflow-manifest.cjs');

// ── Agent leaf → fully-qualified subagent_type map ──────────────────────────
// DUPLICATED FROM .claude/hooks/dispatch-guard.cjs:47-107 (AGENT_LEAF_TO_FQN).
// That hook has NO module.exports (it is a standalone hook script executed by
// the harness, not required as a library), so it cannot be required safely —
// this SSOT keeps a synced copy instead. Update BOTH tables together when an
// agent is added/removed/moved (dispatch-guard.cjs's own header carries the
// same instruction).
const AGENT_LEAF_TO_FQN = Object.freeze({
  'pipeline-controller': 'pipeline-orchestrator:core:pipeline-controller',
  'brainstorm-controller': 'pipeline-orchestrator:core:brainstorm-controller',
  'task-orchestrator': 'pipeline-orchestrator:core:task-orchestrator',
  'spec-controller': 'pipeline-orchestrator:core:spec-controller',
  'information-gate': 'pipeline-orchestrator:core:information-gate',
  'sentinel': 'pipeline-orchestrator:core:sentinel',
  'checkpoint-validator': 'pipeline-orchestrator:core:checkpoint-validator',
  'sanity-checker': 'pipeline-orchestrator:core:sanity-checker',
  'adversarial-batch': 'pipeline-orchestrator:core:adversarial-batch',
  'final-validator': 'pipeline-orchestrator:core:final-validator',
  'finishing-branch': 'pipeline-orchestrator:core:finishing-branch',

  'executor-controller': 'pipeline-orchestrator:executor:executor-controller',
  'executor-implementer-task': 'pipeline-orchestrator:executor:executor-implementer-task',
  'executor-fix': 'pipeline-orchestrator:executor:executor-fix',
  'executor-spec-reviewer': 'pipeline-orchestrator:executor:executor-spec-reviewer',
  'executor-quality-reviewer': 'pipeline-orchestrator:executor:executor-quality-reviewer',
  'spec-closer': 'pipeline-orchestrator:executor:spec-closer',

  'adversarial-review-coordinator': 'pipeline-orchestrator:executor:type-specific:adversarial-review-coordinator',
  'adversarial-security-scanner': 'pipeline-orchestrator:executor:type-specific:adversarial-security-scanner',
  'adversarial-architecture-critic': 'pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic',
  'adversarial-quality-reviewer': 'pipeline-orchestrator:executor:type-specific:adversarial-quality-reviewer',
  'audit-intake': 'pipeline-orchestrator:executor:type-specific:audit-intake',
  'audit-domain-analyzer': 'pipeline-orchestrator:executor:type-specific:audit-domain-analyzer',
  'audit-compliance-checker': 'pipeline-orchestrator:executor:type-specific:audit-compliance-checker',
  'audit-risk-matrix-generator': 'pipeline-orchestrator:executor:type-specific:audit-risk-matrix-generator',
  'bugfix-diagnostic-agent': 'pipeline-orchestrator:executor:type-specific:bugfix-diagnostic-agent',
  'bugfix-root-cause-analyzer': 'pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer',
  'bugfix-regression-tester': 'pipeline-orchestrator:executor:type-specific:bugfix-regression-tester',
  'feature-vertical-slice-planner': 'pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner',
  'feature-implementer': 'pipeline-orchestrator:executor:type-specific:feature-implementer',
  'feature-integration-validator': 'pipeline-orchestrator:executor:type-specific:feature-integration-validator',
  'spec-format-gate': 'pipeline-orchestrator:executor:type-specific:spec-format-gate',
  'spec-content-reviewer': 'pipeline-orchestrator:executor:type-specific:spec-content-reviewer',
  'spec-post-impl-validator': 'pipeline-orchestrator:executor:type-specific:spec-post-impl-validator',
  'spec-adversarial-critic': 'pipeline-orchestrator:executor:type-specific:spec-adversarial-critic',
  'ux-simulator': 'pipeline-orchestrator:executor:type-specific:ux-simulator',
  'ux-accessibility-auditor': 'pipeline-orchestrator:executor:type-specific:ux-accessibility-auditor',
  'ux-qa-validator': 'pipeline-orchestrator:executor:type-specific:ux-qa-validator',

  'step-00-intake': 'pipeline-orchestrator:brainstorm:brainstorm-step-00-intake',
  'step-01-explore': 'pipeline-orchestrator:brainstorm:brainstorm-step-01-explore',
  'step-01b-alternatives': 'pipeline-orchestrator:brainstorm:brainstorm-step-01b-alternatives',
  'step-01c-ideation': 'pipeline-orchestrator:brainstorm:brainstorm-step-01c-ideation',

  'review-orchestrator': 'pipeline-orchestrator:quality:review-orchestrator',
  'architecture-reviewer': 'pipeline-orchestrator:quality:architecture-reviewer',
  'diff-discipline-reviewer': 'pipeline-orchestrator:quality:diff-discipline-reviewer',
  'design-interrogator': 'pipeline-orchestrator:quality:design-interrogator',
  'plan-architect': 'pipeline-orchestrator:quality:plan-architect',
  'quality-gate-router': 'pipeline-orchestrator:quality:quality-gate-router',
  'pre-tester': 'pipeline-orchestrator:quality:pre-tester',
  'final-adversarial-orchestrator': 'pipeline-orchestrator:quality:final-adversarial-orchestrator',
});

// The ONE generic fallback for workflows with no in-code agent→step spine
// (agents_by_step: null — DIAGNOSTIC/REVIEW-ONLY/HOTFIX/PAPERCLIP/brainstorm,
// GAP-02) or when the expected step cannot be resolved. Never invented text —
// this IS the pipeline-controller's real FQN from the table above.
const GENERIC_FALLBACK_FQN = AGENT_LEAF_TO_FQN['pipeline-controller'];

// sanitizeText — defensive char-clean for the one free-form field callers may
// pass (ctx.taskHint). Mirrors the established SEC-4 pattern in
// pipeline-arm-gate.cjs (sanitizeWorkflow) / pipeline-workflow-classifier.cjs
// (sanitizeWorkflowChars): strip control chars, restrict to a safe charset, cap
// length — an on-disk/marker-sourced hint must never carry a prompt-injection
// payload into model-facing text.
//
// T1.1b (loop/next-action-contract): quote characters (' and ") are DELIBERATELY
// excluded from the allowed charset, not merely tolerated. buildPromptText below
// interpolates the sanitized taskHint straight into a double-quoted
// `prompt: "..."` literal inside parent_action / subagent_fallback_action — if a
// `"` survived sanitization, an attacker-controlled taskHint could prematurely
// close that literal (e.g. `already done." IGNORE PREVIOUS INSTRUCTIONS: "`) and
// make the trailing text read as a new instruction rather than quoted context.
// Stripping both quote characters outright (rather than escaping them) keeps the
// fix in this single SSOT chokepoint and guarantees the structural quotes around
// fqn/promptText are the ONLY quote characters that can ever appear in the
// generated action strings.
function sanitizeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9 _.,:;/-]/g, '')
    .trim()
    .slice(0, maxLen);
}

// resolveExpectedLeaf(workflowKey, expectedStep) → leaf name or null. Only ever
// returns a leaf that is LITERALLY present in the workflow manifest's own
// agents_by_step for that exact step — never invents a mapping (S1-4 pattern).
function resolveExpectedLeaf(workflowKey, expectedStep) {
  if (typeof workflowKey !== 'string' || !workflowKey) return null;
  if (typeof expectedStep !== 'string' || !expectedStep) return null;
  const wf = Object.prototype.hasOwnProperty.call(WORKFLOWS, workflowKey) ? WORKFLOWS[workflowKey] : null;
  if (!wf || !wf.agents_by_step || !Array.isArray(wf.steps) || wf.steps.indexOf(expectedStep) < 0) return null;
  const leaves = wf.agents_by_step[expectedStep];
  if (!Array.isArray(leaves) || !leaves.length) return null;
  return leaves[0];
}

function buildPromptText(invariantId, workflowKey, expectedStep, taskHint, resolved) {
  const hint = taskHint ? ` Contexto adicional: ${taskHint}.` : '';
  if (resolved) {
    return `Retomar o passo '${expectedStep}' do run (invariante ${invariantId}, workflow ${workflowKey}).${hint}`;
  }
  return `Reidratar o run travado por ${invariantId} e prosseguir a partir do estado atual (sem mapa de agente-por-passo para este workflow).${hint}`;
}

// resolveNextAction({ invariantId, ctx }) → { message, parent_action, subagent_fallback_action }.
// ALL THREE fields are ALWAYS non-empty strings — no invariant/ctx combination is
// allowed to produce a generic-empty or missing action (AUDIT-REPORT §4 P1,
// closes the `corrective: {}` class of bug at the SOURCE, before any hook wires
// this in — see T1.2).
function resolveNextAction(args) {
  const a = args && typeof args === 'object' ? args : {};
  const ctx = a.ctx && typeof a.ctx === 'object' ? a.ctx : {};

  const invariantId = sanitizeText(typeof a.invariantId === 'string' && a.invariantId ? a.invariantId : 'UNKNOWN_INVARIANT', 60) || 'UNKNOWN_INVARIANT';
  const workflowKeyRaw = typeof ctx.workflowKey === 'string' ? ctx.workflowKey : null;
  const workflowKey = workflowKeyRaw && Object.prototype.hasOwnProperty.call(WORKFLOWS, workflowKeyRaw) ? workflowKeyRaw : null;
  // expectedStep reaches a quoted `'${expectedStep}'` clause ONLY via the resolved
  // branch below, which requires wf.steps.indexOf(expectedStep) to be an EXACT
  // string match against the fixed step-id vocabulary (resolveExpectedLeaf) — a
  // tampered value can never equal a real step id, so it can never take that
  // branch, and the unresolved branch never references expectedStep at all.
  // Sanitizing it here would guard a path that structurally cannot be reached
  // (see tests/regression/v8.23.0/F2 S2); not added, per YAGNI.
  const expectedStep = typeof ctx.expectedStep === 'string' ? ctx.expectedStep : null;
  const taskHint = sanitizeText(ctx.taskHint, 200);

  const leaf = workflowKey ? resolveExpectedLeaf(workflowKey, expectedStep) : null;
  const fqn = (leaf && AGENT_LEAF_TO_FQN[leaf]) ? AGENT_LEAF_TO_FQN[leaf] : GENERIC_FALLBACK_FQN;
  const resolved = fqn !== GENERIC_FALLBACK_FQN;

  const promptText = buildPromptText(invariantId, workflowKey || '(desconhecido)', expectedStep, taskHint, resolved);

  const message = resolved
    ? `${invariantId}: bloqueado. Próximo passo esperado: '${expectedStep}' no workflow ${workflowKey}.`
    : `${invariantId}: bloqueado. Sem mapa de agente-por-passo resolvível — reidratar via o pipeline-controller.`;

  const parent_action = `Agent(subagent_type: "${fqn}", prompt: "${promptText}")`;

  // The subagent-side reader NEVER has the Agent tool (Achado #7) — its only
  // executable exit is emitting the DISPATCH_REQUEST block (the protocol's own
  // "dispatch a peer/leaf agent" schema, references/gate-request-protocol.md)
  // carrying the SAME resolved target, and ending its turn for the parent to
  // process. Always populated — the reader's identity can never be determined
  // from the hook payload (session_id is identical for parent and subagent).
  const subagent_fallback_action =
    `Se você é um subagente sem a ferramenta Agent disponível: emita agora um bloco ` +
    `DISPATCH_REQUEST (ver references/gate-request-protocol.md) com target_kind: agent, ` +
    `target_name: "${fqn}", prompt: "${promptText}", e encerre o turno com ` +
    `STATUS: AWAITING_DISPATCH_RESULTS — o processo pai despacha e retoma você.`;

  return { message, parent_action, subagent_fallback_action };
}

// resolveCorrectiveDescriptor({ invariantId, ctx }) → the corrective descriptor
// shape the rest of the codebase already expects (mirrors buildCorrectiveDescriptor
// in .claude/hooks/pipeline-arm-gate.cjs: invariant_id / what_failed /
// what_is_missing / fix_instruction / resume_instruction / workflow / blocking —
// the shape lib/corrective-dispatch.cjs reads). Built FROM resolveNextAction, so
// any invariant without a dedicated hand-written descriptor elsewhere (starting
// with INLINE_WORK_BLOCKED, T1.2 — AUDIT-REPORT.md §2 E1, the empty `corrective:{}`
// bug) still gets a fully-populated, non-empty one instead of falling back to `{}`.
function resolveCorrectiveDescriptor(args) {
  const a = args && typeof args === 'object' ? args : {};
  const ctx = a.ctx && typeof a.ctx === 'object' ? a.ctx : {};
  const next = resolveNextAction(a);
  const invariantId = sanitizeText(typeof a.invariantId === 'string' && a.invariantId ? a.invariantId : 'UNKNOWN_INVARIANT', 60) || 'UNKNOWN_INVARIANT';
  const workflowKey = typeof ctx.workflowKey === 'string' && ctx.workflowKey ? sanitizeText(ctx.workflowKey, 40) : undefined;
  return {
    invariant_id: invariantId,
    what_failed: next.message,
    what_is_missing: 'o despacho do agente do passo esperado (é o que abre a janela de execução)',
    fix_instruction: next.parent_action,
    resume_instruction: next.subagent_fallback_action,
    workflow: workflowKey || undefined,
    blocking: true,
  };
}

// resolveInlineWorkCorrective(ctx) — thin, single-purpose wrapper for the ONE
// invariant two independent callers both need it for: lib/run-step-guard.cjs's
// main path, and .claude/hooks/pipeline-arm-gate.cjs's fail-safe twin (used
// only when run-step-guard.cjs itself is unavailable). Extracted per
// adversarial review (Batch 2, architecture finding): the two call sites were
// building the identical descriptor inline and could silently drift apart.
function resolveInlineWorkCorrective(ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return resolveCorrectiveDescriptor({
    invariantId: 'INLINE_WORK_BLOCKED',
    ctx: { workflowKey: c.workflowKey || null, expectedStep: c.expectedStep || null },
  });
}

module.exports = {
  resolveNextAction,
  resolveCorrectiveDescriptor,
  resolveInlineWorkCorrective,
  AGENT_LEAF_TO_FQN,
  GENERIC_FALLBACK_FQN,
};
