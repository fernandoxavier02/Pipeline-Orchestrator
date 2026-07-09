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

// T1.2 (AUDIT-REPORT.md §2 E1): the block decision below now carries a
// `corrective` descriptor built from the Next-Action Contract SSOT — closes the
// class of bug where a corrective-trigger for this invariant landed empty (`{}`)
// because nothing ever built one. Optional require: this brain stays USABLE
// (still blocks/allows correctly) even if lib/next-action.cjs is ever missing —
// only the corrective enrichment is lost, never the core decision.
let nextAction = null;
try { nextAction = require('./next-action.cjs'); } catch { nextAction = null; }

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
    `Investigação (Read/Grep/Glob) e perguntas seguem liberadas.` +
    subagentFallbackSuffix()
  );
}

// Batch 5 (adversarial review of F8_deny_sweep_liveness.cjs, HIGH finding):
// buildRehydrationReason is the LIVE text a blocked caller actually reads
// (result.reason -> pipeline-arm-gate.cjs's ctx.runActive forward ->
// toHookOutput's permissionDecisionReason) — the SEPARATE `corrective`
// field this file already populates (T1.2/Batch 2) never reaches that live
// stdout path (it's drained async, on disk, by lib/corrective-dispatch.cjs).
// This function said "Despache o agente ... (Agent com subagent_type ...)"
// as the ONLY resolution — exactly the CR6 gap Batches 1-4 closed elsewhere,
// missed here because this file lives outside .claude/hooks/ (F8's scan
// scope). Reuses the SAME optional nextAction require this file already has.
function subagentFallbackSuffix() {
  try {
    if (nextAction && typeof nextAction.buildSubagentFallbackClause === 'function') {
      return ' ' + nextAction.buildSubagentFallbackClause();
    }
  } catch (e) {
    // Fail-OPEN (the deny itself must still fire) but make the drop OBSERVABLE
    // (round-2 security review, LOW finding): without this stderr line a
    // failure here silently re-introduces the exact CR6 deadlock this clause
    // exists to close, with no telemetry trail. The stderr write is itself
    // wrapped (round-3 security review, N2): a synchronous throw from a broken
    // stderr would otherwise escape this catch (a catch does NOT catch its own
    // throw) and convert the fail-closed deny into a silent allow.
    try {
      process.stderr.write('[run-step-guard] subagent-fallback clause dropped: ' + ((e && e.message) || 'unknown') + '\n');
    } catch { /* stderr failure must never break the deny */ }
  }
  return '';
}

// PURE decision. ctx: {
//   toolName, mutating?(bool, derived if absent), execWindowOpen(bool),
//   expectedStep(string|null), workflowKey(string|null, T1.2), sessionId(string),
//   enforce('deny'|'warn')
// }
// Returns { decision:'allow' } | { decision:'allow', warn:true } |
//         { decision:'block', invariant_id, reason, expected_step, corrective? }.
//         corrective is best-effort (undefined if next-action.cjs is missing or
//         throws) — the block decision itself never depends on it.
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
  // Adversarial review (Batch 2, security): this file's own header promises
  // "PURE + deterministic; never throws" — every caller up the chain to the CLI
  // entry point relies on that being literally true, because the ONE outer
  // catch-all treats any exception as an internal error and fails OPEN (allows
  // the tool). An unguarded call here would let a future bug in next-action.cjs
  // silently defeat the dispatcher-not-worker block itself. Same try/catch
  // posture as its twin call site in pipeline-arm-gate.cjs's fail-safe branch —
  // the decision below is ALWAYS returned; only the corrective enrichment can
  // be lost.
  let corrective;
  try {
    corrective = nextAction && typeof nextAction.resolveInlineWorkCorrective === 'function'
      ? nextAction.resolveInlineWorkCorrective({ workflowKey: ctx.workflowKey || null, expectedStep: ctx.expectedStep || null })
      : undefined;
  } catch { corrective = undefined; }
  return {
    decision: 'block',
    invariant_id: 'INLINE_WORK_BLOCKED',
    expected_step: ctx.expectedStep || null,
    reason: buildRehydrationReason(tool, ctx.expectedStep),
    corrective,
  };
}

module.exports = { decideGovernedAction, isMutatingTool, buildRehydrationReason, MUTATING_TOOLS };
