#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-arm-gate.cjs — v8.7.0 — "firme e segura"
// =============================================================================
// CLOSES THE ROOT-CAUSE HOLE (audit 2026-06-18): when the user runs
// `/pipeline-orchestrator:pipeline`, the front-door UserPromptSubmit hook can
// only PRINT a reminder — it cannot deny. So the agent was free to treat the
// invocation as a Q&A, do the work inline (spawning generic investigators,
// editing files) and NEVER arm a run. Every downstream lock keys off a
// sentinel-state that, in that path, is never born → all fail open.
//
// THIS GATE is the missing teeth. PreToolUse over work tools: while a pipeline
// invocation is PENDING-ARM (a marker exists, written deterministically by the
// UserPromptSubmit wiring) AND no run is currently active, it DENIES substantive
// non-pipeline work. The ONLY ways forward are: (a) arm the run (write into
// .pipeline/), or (b) start the workflow (spawn a pipeline-orchestrator: agent).
// Investigation (Read/Grep/Glob) and control (AskUserQuestion/EnterPlanMode/
// Task*) stay open, so a diagnostic conversation is NEVER frozen.
//
// SAFE BY CONSTRUCTION (no deadlock): the marker auto-expires (PIPELINE_ARM_TTL_MS,
// default 30 min); absent/corrupt state fails OPEN; missing marker fails OPEN
// (normal non-pipeline usage is untouched). Default `deny`; escape
// PIPELINE_ARM_ENFORCEMENT=warn.
//
// State/discovery reused from edit-guard-hook.cjs (SSOT). Pure brain =
// decideArmGate(ctx); I/O = gatherContext(payload). Mirrors dispatch-pending-gate.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }

// SEC-1 (completes AUDIT-007/B5): lib/pipeline-arm.cjs SIGNS the arm-pending
// marker (same HMAC envelope as sentinel-state). readArmPending must VERIFY that
// signature on read — otherwise a hand-forged/tampered marker still arms the gate
// and a tampered `workflow` string flows into the deny reason. Optional require so
// a missing signer degrades to "no verification" (fallback, not a crash).
let signer = null;
try { signer = require('../../lib/sentinel-state-signer.cjs'); } catch { signer = null; }

// Substantive WORK tools — these mutate the repo or delegate real work. Blocked
// while pipeline is pending-arm and unstarted (unless pipeline-aligned).
const WORK_TOOLS = new Set([
  'Edit', 'Write', 'NotebookEdit', 'MultiEdit',
  'Bash', 'PowerShell',
]);

// Always-allowed: investigation (read-only) + control/resolution + progress.
// A diagnostic conversation must never be frozen by this gate.
const ALWAYS_ALLOW_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'ToolSearch',
  'AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'TaskStop',
  'TodoWrite', 'ScheduleWakeup',
]);

const PIPELINE_NS = 'pipeline-orchestrator:';

function isPipelineTarget(payload) {
  const ti = (payload && payload.tool_input) || {};
  const tool = payload && payload.tool_name;
  if (tool === 'Agent') {
    const t = typeof ti.subagent_type === 'string' ? ti.subagent_type : '';
    return t.startsWith(PIPELINE_NS);
  }
  if (tool === 'Skill') {
    const s = typeof ti.skill === 'string' ? ti.skill : '';
    return s.startsWith(PIPELINE_NS);
  }
  return false;
}

function isPipelineDocWrite(payload, dir) {
  const ti = (payload && payload.tool_input) || {};
  const fp = ti.file_path;
  if (typeof fp !== 'string' || !fp) return false;
  if (eg && typeof eg.isExemptPath === 'function') {
    try { if (eg.isExemptPath(fp, dir)) return true; } catch { /* fall through */ }
  }
  // Local fallback: any path inside a `.pipeline` segment is a run artifact.
  return /(^|[\\/])\.pipeline([\\/]|$)/.test(fp);
}

// ---- PURE BRAIN -------------------------------------------------------------
// ctx: { toolName, armPending(bool), runActive(bool), pipelineAligned(bool),
//        enforce('deny'|'warn'), workflow(string|undefined) }
function decideArmGate(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };

  // No outstanding /pipeline request → normal usage, never interfere.
  if (!ctx.armPending) return { decision: 'allow' };
  // A run is already armed/active → the demand is satisfied; the run's own
  // gates (sentinel, dispatch-pending, edit-guard) take over from here.
  if (ctx.runActive) return { decision: 'allow' };

  const tool = typeof ctx.toolName === 'string' ? ctx.toolName : '(unknown)';

  // Investigation + control are always free (no frozen diagnostics).
  if (ALWAYS_ALLOW_TOOLS.has(tool)) return { decision: 'allow' };
  // Starting the workflow (pipeline agent spawn) or arming it (.pipeline write).
  if (ctx.pipelineAligned) return { decision: 'allow' };

  // Substantive non-pipeline work while a pipeline is requested but not armed.
  // Only WORK_TOOLS reach a block; anything unlisted also blocks (fail-firm for
  // unknown mutating tools), except under the explicit warn escape.
  const enforce = String(ctx.enforce || 'deny').toLowerCase();
  if (enforce === 'warn') return { decision: 'allow', warn: true };
  return { decision: 'block', reason: buildArmReason(tool, ctx.workflow) };
}

// SEC-4: the `workflow` string comes from the on-disk (unsigned) marker, so it
// is attacker-controllable and gets interpolated into the deny reason — a
// prompt-injection vector. Strip CR/LF + control chars, keep a safe charset,
// cap length. Anything else collapses to empty (the reason just omits it).
function sanitizeWorkflow(workflow) {
  if (typeof workflow !== 'string') return '';
  const cleaned = workflow
    .replace(/[\r\n\t]/g, ' ')          // newlines/tabs → space
    .replace(/[^\x20-\x7E]/g, '')        // drop other control / non-printable
    .replace(/[^A-Za-z0-9 _.:\/-]/g, '') // safe charset only
    .trim()
    .slice(0, 80);                       // cap length
  return cleaned;
}

function buildArmReason(tool, workflow) {
  const safeWf = sanitizeWorkflow(workflow);
  const wf = safeWf ? ` (workflow detectado: ${safeWf})` : '';
  return (
    `PIPELINE_NOT_ARMED: você invocou /pipeline-orchestrator:pipeline${wf} mas NENHUM run foi armado. ` +
    `NÃO conduza o trabalho como conversa avulsa. Antes de qualquer trabalho real, ARME o run: ` +
    `crie {PIPELINE_DOC_PATH}/sentinel-state.json + <cwd>/.pipeline/active-run.json com pipeline_active:true, ` +
    `OU inicie o workflow despachando um agente pipeline-orchestrator: via Agent tool. ` +
    `A ferramenta '${tool}' fica bloqueada até o run existir. Investigação (Read/Grep/Glob) e perguntas seguem liberadas. ` +
    `Recovery automático: o marcador expira por timeout, nunca trava a sessão pra sempre.`
  );
}

// ---- I/O LAYER --------------------------------------------------------------
function armMarkerPath(dir) {
  return path.join(dir, '.pipeline', 'pipeline-arm-pending.json');
}

const ARM_TTL_DEFAULT_MS = 30 * 60 * 1000; // 30 min
const ARM_TTL_FLOOR_MS = 1000;             // sane floor

// SEC-3: a negative/zero/NaN PIPELINE_ARM_TTL_MS would make EVERY marker
// instantly "expired", silently disabling the gate. Only honour a finite value
// at or above a 1s floor; otherwise fall back to the 30-min default.
function resolveArmTtlMs() {
  const raw = Number(process.env.PIPELINE_ARM_TTL_MS);
  if (Number.isFinite(raw) && raw >= ARM_TTL_FLOOR_MS) return raw;
  return ARM_TTL_DEFAULT_MS;
}

// SEC-1 (completes AUDIT-007/B5): verify the marker's HMAC signature on READ.
// The marker is signed-by-shape by lib/pipeline-arm.cjs using the SAME signer as
// sentinel-state, so the SAME verifier applies (no second scheme — SSOT). Posture
// (mirrors the sentinel-hook / step-ledger-stamp SEC-1 stance):
//   - signed + INVALID (tampered, not unsigned, key present) → TAMPERED → reject
//     (treat the marker as absent → arm-gate stays fail-OPEN, never armed by a forgery);
//   - UNSIGNED legacy marker → tolerate by default; reject only under
//     PIPELINE_HMAC_STRICT === 'true' (strict mode);
//   - key unavailable / signer missing → tolerate (no key to verify → fallback).
// Returns true when the marker must be REJECTED, false when it is acceptable.
function markerIsTampered(marker) {
  if (!signer || typeof signer.verifyState !== 'function') return false; // no verifier → fallback-tolerate
  let v;
  try { v = signer.verifyState(marker, { key: signer.readHmacKey() }); }
  catch { return false; } // verifier error → fail-OPEN (do not brick the front door)
  if (!v || typeof v !== 'object') return false;
  if (v.unsigned) {
    // Legacy unsigned marker: tolerate by default; reject only in strict mode.
    return process.env.PIPELINE_HMAC_STRICT === 'true';
  }
  if (v.key_unavailable) return false; // no key on this host → cannot verify → tolerate
  // Signed marker with a real verdict: reject IFF the signature does not verify.
  return v.valid !== true;
}

// Returns { workflow } if a non-expired, non-tampered arm-pending marker exists,
// else null.
function readArmPending(dir) {
  try {
    const raw = fs.readFileSync(armMarkerPath(dir), 'utf8');
    const m = JSON.parse(raw);
    // SEC-1: verify integrity before trusting ANY field (incl. the workflow string
    // that flows into the deny reason). Tampered/forged → treat as no marker.
    if (markerIsTampered(m)) return null;
    const ts = Date.parse(m && m.requested_at);
    if (!Number.isFinite(ts)) return null;
    const ttl = resolveArmTtlMs();
    if (Date.now() - ts > ttl) return null; // expired → recovery, no deadlock
    return { workflow: typeof m.workflow === 'string' ? m.workflow : undefined };
  } catch { return null; }
}

function isRunActive(dir) {
  // ARCH-7: when the discovery module is unavailable we CANNOT tell whether a
  // run is active. The gate's contract is fail-OPEN, so we must NOT block an
  // armed+active run we simply can't see. Treat runActive as true → decideArmGate
  // short-circuits to allow (its own gates take over). Returning false here would
  // fail CLOSED, the exact inversion the contract forbids.
  //
  // AUDIT-003 (D3) NOTE — INTENTIONAL FRONT-DOOR EXCEPTION: unlike step-ledger /
  // gate-log / dispatch-pending (which now fail CLOSED on a CORRUPT sentinel for
  // governed actions), this arm-gate stays fail-OPEN on CORRUPT_SENTINEL by design.
  // It is the front door: a corrupt state here means runActive=false, so the gate
  // would otherwise DEMAND arming and block ALL non-pipeline work — bricking the
  // session before the user can even recover the run. Per ARCH-7 the contract is
  // fail-OPEN; the downstream governed gates carry the fail-closed teeth.
  if (!eg || typeof eg.findActiveSentinelState !== 'function') return true;
  let state;
  try { state = eg.findActiveSentinelState(dir); } catch { return true; }
  if (!state || state === eg.CORRUPT_SENTINEL) return false;
  return state.pipeline_active === true;
}

function gatherContext(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return null;
  const marker = readArmPending(dir);
  if (!marker) return { toolName: payload.tool_name, armPending: false };
  return {
    toolName: typeof payload.tool_name === 'string' ? payload.tool_name : '(unknown)',
    armPending: true,
    runActive: isRunActive(dir),
    pipelineAligned: isPipelineTarget(payload) || isPipelineDocWrite(payload, dir),
    enforce: process.env.PIPELINE_ARM_ENFORCEMENT,
    workflow: marker.workflow,
  };
}

function handlePreToolUse(payload) {
  const ctx = gatherContext(payload);
  if (!ctx) return { decision: 'allow' };
  return decideArmGate(ctx);
}

function toHookOutput(result) {
  if (result && result.decision === 'block') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.reason,
      },
    };
  }
  return null;
}

// CLI entry point (form-identical to dispatch-pending-gate.cjs).
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      const out = toHookOutput(handlePreToolUse(payload));
      if (out) process.stdout.write(JSON.stringify(out));
      process.exit(0);
    } catch (err) {
      // Parse/internal error → fail-OPEN (never freeze the harness on a bad
      // payload; edit-guard's write-lock remains the fail-closed net for code).
      process.stderr.write(`pipeline-arm-gate error: ${err.message}\n`);
      process.exit(0);
    }
  });
}

module.exports = {
  decideArmGate,
  buildArmReason,
  sanitizeWorkflow,
  resolveArmTtlMs,
  readArmPending,      // SEC-1: exported so F8 can exercise the verify-on-read path
  markerIsTampered,    // SEC-1
  gatherContext,
  handlePreToolUse,
  toHookOutput,
  isPipelineTarget,
  isPipelineDocWrite,
  WORK_TOOLS,
  ALWAYS_ALLOW_TOOLS,
};
