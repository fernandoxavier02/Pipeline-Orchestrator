#!/usr/bin/env node
'use strict';

// =============================================================================
// run-step-guard.cjs — v8.14.0 (chain-tied enforcement, Lote 3) — PURE BRAIN
// =============================================================================
// THE HEART of "fases não se desconectam". Today the front-door arm-gate does
// `runActive → allow` — once a run is active it steps aside and lets the agent do
// ANYTHING inline, so the phase-sequencing gates (which only fire on Agent spawns)
// never see the skipped work. This brain replaces that blanket allow with the
// DISPATCHER-NOT-WORKER rule:
//
//   During an active governed run, a tool that MUTATES PRODUCTION
//   (Edit/Write/MultiEdit/NotebookEdit/Bash/PowerShell) is allowed ONLY inside an
//   open exec-window — the sanctioned window a dispatched executor works in. Inline
//   production mutation with no open window is the skip path → DENY.
//
// Read-only tools, control/resolution tools, `.pipeline/` writes and pipeline-agent
// dispatches are NOT mutating-without-window — the caller (pipeline-arm-gate) clears
// them via its existing carve-outs BEFORE consulting this brain, so they never reach
// here. PURE + deterministic; never throws. The I/O (is a window open? what is the
// expected step?) is resolved by the hook and passed in.
//
// REHYDRATION-ON-BLOCK (user requirement, 2026-06-26): a workflow-failure block is
// NEVER a dead wall — every deny returns a `reason` that re-orients the agent: which
// step is expected now, and the exact way to get back on the rails.
// =============================================================================

const MUTATING_TOOLS = new Set([
  'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell',
]);

function isMutatingTool(toolName) {
  return MUTATING_TOOLS.has(toolName);
}

// Builds the rehydration guidance returned on every block (never a bare deny).
// FINAL-REVIEW SEC-3: the deny message must NOT teach the exec-window WRITE PATH. The
// exec-window is opened as a side effect of the controller dispatching the executor — it is an
// INTERNAL coordination artifact, never hand-written by a leaf agent. Advertising the path let a
// steered agent self-arm a fake window (write `.pipeline/sessions/<sid>.exec-window`, an exempt
// `.pipeline/` write) and bypass the dispatcher-not-worker rule. The guidance now points ONLY to
// the legitimate exit: dispatch the expected step's agent.
function buildRehydrationReason(toolName, expectedStep) {
  const step = expectedStep ? `'${expectedStep}'` : 'o próximo passo da sequência';
  return (
    `INLINE_WORK_BLOCKED: durante um run governado o agente é DESPACHANTE, não trabalhador. ` +
    `A ferramenta '${toolName}' muta produção FORA de uma janela de execução, que é o caminho de pular fase. ` +
    `REIDRATAÇÃO — como corrigir o run: o passo esperado agora é ${step}. ` +
    `Despache o agente desse passo (Agent com subagent_type 'pipeline-orchestrator:…'); o despacho do ` +
    `executor é o que ABRE a janela de execução e carimba a corrente — a janela não se abre à mão. ` +
    `Investigação (Read/Grep/Glob) e perguntas seguem liberadas.`
  );
}

// PURE decision. ctx: {
//   toolName, mutating?(bool, derived if absent), execWindowOpen(bool),
//   expectedStep(string|null), sessionId(string), enforce('deny'|'warn')
// }
// Returns { decision:'allow' } | { decision:'allow', warn:true } |
//         { decision:'block', invariant_id, reason, expected_step }.
function decideGovernedAction(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };
  const tool = ctx.toolName;
  const mutating = typeof ctx.mutating === 'boolean' ? ctx.mutating : isMutatingTool(tool);

  // Non-mutating tools are not governed by the dispatcher-not-worker rule. (The
  // caller already cleared reads/control/.pipeline/pipeline-dispatch upstream; this
  // is defense-in-depth so a stray non-mutating tool is never blocked here.)
  if (!mutating) return { decision: 'allow' };

  // Work happening inside a sanctioned exec-window is the LEGITIMATE path — a
  // dispatched executor mutating production for the current step.
  if (ctx.execWindowOpen) return { decision: 'allow' };

  // Mutating + no open window during an active governed run = inline work = skip path.
  if (String(ctx.enforce || 'deny').toLowerCase() === 'warn') {
    return { decision: 'allow', warn: true, invariant_id: 'INLINE_WORK_BLOCKED' };
  }
  return {
    decision: 'block',
    invariant_id: 'INLINE_WORK_BLOCKED',
    expected_step: ctx.expectedStep || null,
    reason: buildRehydrationReason(tool, ctx.expectedStep),
  };
}

module.exports = { decideGovernedAction, isMutatingTool, buildRehydrationReason, MUTATING_TOOLS };
