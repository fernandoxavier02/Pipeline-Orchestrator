#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-arm-gate.cjs — v8.12.0 — "firme e segura, fail-closed na janela governada"
// =============================================================================
// SPEC 006 (Batch 2 — highest risk): GOVERNED CORRUPT-STATE INVERSION. The
// front-door corrupt exception is now SCOPED — a corrupt/unreadable sentinel-state
// fails CLOSED for substantive work ONLY inside the governed window (armPending &&
// !runActive); an ordinary session with no pending run stays fail-OPEN and is
// never bricked (R2.1/R2.2). "Discovery truly unavailable" is kept DISTINCT from
// "see corruption" and remains fail-OPEN (ARCH-7). See discoverRunState /
// runStateContext / the scoped-posture comment block above gatherContext.
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
// SHIPPED POSTURE — FAIL-CLOSED BY DEFAULT (R1.2 / spec 006): the embedded
// default is `deny`. While a pipeline invocation is PENDING-ARM and unstarted,
// substantive non-pipeline work is DENIED unless the operator explicitly opts
// down to warn (PIPELINE_ARM_ENFORCEMENT=warn → allow-with-warning, R1.3). This
// mirrors v8.11.0's "ship ARMED + env escape" stance for the two strong Stop/
// SubagentStop gates: the deny is the DEFAULT a shipped install enforces, not a
// dev-only setting. There is no separate "shipped warn" override — the only way
// to warn is the documented env escape. decideArmGate :resolves enforce to 'deny'
// when PIPELINE_ARM_ENFORCEMENT is unset (see the `String(ctx.enforce || 'deny')`
// default below), and gatherContext passes the raw env through unchanged.
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

// R6.1 (spec 006 T3.3): a write inside the run's `pipeline-runs/<run>/` directory
// is a GOVERNED write (authoring the brainstorm/spec), at PARITY with `.pipeline/`.
// SSOT is eg.isExemptPath (edit-guard), which already contains BOTH `.pipeline/`
// and `pipeline-runs/` to the resolved project tree and matches both separators —
// PREFER it. The local fallback (when edit-guard is unavailable) must keep the
// SAME contract: containment to the resolved project tree (reuse the cwd-guard
// pattern from sentinel-hook :186-191) so an OUT-OF-TREE `pipeline-runs` cannot be
// used to escape, and F4 cross-platform matching of BOTH separators (\\ and /).
function isPipelineDocWrite(payload, dir) {
  const ti = (payload && payload.tool_input) || {};
  const fp = ti.file_path;
  if (typeof fp !== 'string' || !fp) return false;
  if (eg && typeof eg.isExemptPath === 'function') {
    try { if (eg.isExemptPath(fp, dir)) return true; } catch { /* fall through */ }
  }
  // Local fallback (edit-guard unavailable). Contain to the resolved project tree:
  // resolve the candidate against `dir` and require it to live under `dir/.pipeline`
  // or `dir/pipeline-runs`. This rejects an out-of-tree `pipeline-runs` (R-MED
  // containment) and the substring-only "pipeline-runs-helper.js" false match.
  if (typeof dir === 'string' && dir) {
    try {
      const norm = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
      const resolvedFile = norm(path.resolve(dir, fp));
      const base = path.resolve(dir);
      for (const seg of ['.pipeline', 'pipeline-runs']) {
        const root = norm(path.resolve(path.join(base, seg)));
        if (resolvedFile === root || resolvedFile.startsWith(root + path.sep)) return true;
      }
    } catch { /* fall through to the segment regex below */ }
    return false;
  }
  // No dir to contain against → conservative segment match on `.pipeline` only
  // (cannot prove project-tree containment for `pipeline-runs` without a root).
  return /(^|[\\/])\.pipeline([\\/]|$)/.test(fp);
}

// ---- PURE BRAIN -------------------------------------------------------------
// ctx: { toolName, armPending(bool), runActive(bool), corrupt(bool),
//        pipelineAligned(bool), enforce('deny'|'warn'), workflow(string|undefined) }
//
// UNIFORM GOVERNANCE BY CONSTRUCTION (R1.1, spec 006): there is deliberately NO
// per-command enumeration here (no list of pipeline/bugfix/feature/userstory/
// audit/ux/spec/refactor/hotfix/brainstorm/etc.). The gate keys ONLY off the
// EXISTENCE of the signed arm-pending marker (ctx.armPending, written by
// lib/pipeline-arm.cjs for ANY entry-point recognized by the classifier SSOT
// lib/pipeline-workflow-classifier.cjs::isPipelineInvocation). Adding a new
// entry-point to that classifier auto-governs it with ZERO edit to this gate.
// Do NOT add a command/branch that special-cases a specific workflow — that
// would break the uniform single-code-path contract.
//
// GOVERNED CORRUPT-STATE INVERSION (R2.1/R2.2, spec 006 §2.3 — highest risk):
// `ctx.corrupt` is the I/O-derived signal that the authoritatively-pointed
// sentinel-state exists on disk but is UNREADABLE (CORRUPT_SENTINEL). It is a
// PURE boolean here — no I/O leaks into this brain. The inversion is scoped
// STRICTLY to the governed window: a corrupt state only ever reaches a deny when
// `armPending` is true (because !armPending short-circuits to allow at the very
// top, BEFORE corrupt is ever consulted). Outside the governed window a corrupt
// state is therefore fail-OPEN by construction — an ordinary session is never
// bricked. (Locked by tests/regression/v8.12.0/T2.)
function decideArmGate(ctx) {
  if (!ctx || typeof ctx !== 'object') return { decision: 'allow' };

  // No outstanding /pipeline request → normal usage, never interfere. This
  // branch is what makes R2.2 hold: corrupt-state is NEVER consulted for an
  // ungoverned session, so it can never brick one. The inversion below is
  // reachable ONLY past this guard (armPending === true).
  if (!ctx.armPending) return { decision: 'allow' };
  // A run is already armed/active → the demand is satisfied; the run's own
  // gates (sentinel, dispatch-pending, edit-guard) take over from here.
  if (ctx.runActive) return { decision: 'allow' };

  const tool = typeof ctx.toolName === 'string' ? ctx.toolName : '(unknown)';

  // Investigation + control are always free (no frozen diagnostics) — this
  // holds EVEN under a corrupt state, so the operator can always Read/Grep/ask
  // to diagnose and recover. The corrupt fail-closed posture only ever bites
  // substantive WORK, never the read-only/control carve-out (R1.4).
  if (ALWAYS_ALLOW_TOOLS.has(tool)) return { decision: 'allow' };
  // Starting the workflow (pipeline agent spawn) or arming it (.pipeline write).
  if (ctx.pipelineAligned) return { decision: 'allow' };

  // Substantive non-pipeline work while a pipeline is requested but not armed.
  // Only WORK_TOOLS reach a block; anything unlisted also blocks (fail-firm for
  // unknown mutating tools), except under the explicit warn escape.
  //
  // SHIPPED DEFAULT = DENY (R1.2, spec 006). `enforce` resolves to 'deny' when
  // PIPELINE_ARM_ENFORCEMENT is unset — the `|| 'deny'` fallback IS the embedded
  // fail-closed posture, and it is the contract this gate ships with. The ONLY
  // downgrade is the documented operator escape PIPELINE_ARM_ENFORCEMENT=warn
  // (R1.3 → allow-with-warning). Do NOT introduce a second "shipped warn" path:
  // warn is opt-in via env only. (Locked by tests/regression/v8.12.0.)
  const enforce = String(ctx.enforce || 'deny').toLowerCase();
  if (enforce === 'warn') return { decision: 'allow', warn: true };

  // GOVERNED CORRUPT-STATE DENY (R2.1): the sentinel-state is corrupt AND we are
  // in the governed window. Fail CLOSED with a DISTINCT invariant so Batch 4 can
  // build a CORRUPT_STATE CorrectivePayload (R2.3) — but the structure is exposed
  // HERE with NO import of the not-yet-built corrective module (no hard dep). The
  // deny carries `invariant_id` + the structured fields a CorrectivePayload needs
  // so the orchestrating context can construct it; the gate stays decision-only.
  if (ctx.corrupt) {
    return {
      decision: 'block',
      invariant_id: 'CORRUPT_STATE',
      reason: buildCorruptReason(tool, ctx.workflow),
      corrective: buildCorrectiveDescriptor('CORRUPT_STATE', tool, ctx.workflow),
    };
  }

  return {
    decision: 'block',
    invariant_id: 'NOT_ARMED',
    reason: buildArmReason(tool, ctx.workflow),
    corrective: buildCorrectiveDescriptor('NOT_ARMED', tool, ctx.workflow),
  };
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
  const safeTool = sanitizeWorkflow(tool) || '(unknown)';
  const wf = safeWf ? ` (workflow detectado: ${safeWf})` : '';
  return (
    `PIPELINE_NOT_ARMED: você invocou /pipeline-orchestrator:pipeline${wf} mas NENHUM run foi armado. ` +
    `NÃO conduza o trabalho como conversa avulsa. Antes de qualquer trabalho real, ARME o run: ` +
    `crie {PIPELINE_DOC_PATH}/sentinel-state.json + <cwd>/.pipeline/active-run.json com pipeline_active:true, ` +
    `OU inicie o workflow despachando um agente pipeline-orchestrator: via Agent tool. ` +
    `A ferramenta '${safeTool}' fica bloqueada até o run existir. Investigação (Read/Grep/Glob) e perguntas seguem liberadas. ` +
    `Recovery automático: o marcador expira por timeout, nunca trava a sessão pra sempre.`
  );
}

// R2.1 deny reason for the GOVERNED corrupt-state case. The sentinel-state was
// authoritatively pointed-to but is unreadable/corrupt: re-create the signed
// state via the signer, then resume. Recovery edge (R2.3/R5): this deny feeds
// the corrective AND the marker TTL still expires, so it is never a dead end.
function buildCorruptReason(tool, workflow) {
  const safeWf = sanitizeWorkflow(workflow);
  const safeTool = sanitizeWorkflow(tool) || '(unknown)';
  const wf = safeWf ? ` (workflow detectado: ${safeWf})` : '';
  return (
    `CORRUPT_STATE: o run de pipeline${wf} está armado mas o sentinel-state apontado está ` +
    `corrompido/ilegível. Por segurança, trabalho substantivo fica BLOQUEADO dentro da janela governada ` +
    `(fail-closed apenas aqui — sessões comuns sem run NÃO são afetadas). Recupere: re-crie o ` +
    `{PIPELINE_DOC_PATH}/sentinel-state.json assinado via o signer, OU re-despache um agente ` +
    `pipeline-orchestrator: para refazer o run. A ferramenta '${safeTool}' fica bloqueada até o estado voltar a ser legível. ` +
    `Investigação (Read/Grep/Glob) e perguntas seguem liberadas. ` +
    `Recovery automático: o marcador expira por timeout e o corretivo é disparado — nunca trava pra sempre.`
  );
}

// T2.3 — expose the deny SHAPE so Batch 4 (lib/corrective-dispatch.cjs) can build
// a CorrectivePayload WITHOUT this gate importing the not-yet-built module. This
// is a plain descriptor object (decision-only; the gate performs NO dispatch and
// has NO hard dependency on the corrective module — its absence cannot break the
// gate). Fields mirror the CorrectivePayload contract (design §3): the
// orchestrating context that owns tool access turns this into the actual payload.
// String fields are sanitized here so nothing attacker-controlled rides downstream.
function buildCorrectiveDescriptor(invariantId, tool, workflow) {
  const safeWf = sanitizeWorkflow(workflow);
  const safeTool = sanitizeWorkflow(tool) || '(unknown)';
  if (invariantId === 'CORRUPT_STATE') {
    return {
      invariant_id: 'CORRUPT_STATE',
      what_failed: 'sentinel-state corrupt/unreadable inside the governed window',
      what_is_missing: 're-created signed sentinel-state.json',
      fix_instruction: 'recreate the signed run state via the signer (or re-dispatch a pipeline-orchestrator: agent)',
      resume_instruction: `resume the blocked ${safeTool} after the state is readable again`,
      workflow: safeWf || undefined,
      blocking: true, // R4: LAYER-A hard block stays in force while recovering
    };
  }
  return {
    invariant_id: 'NOT_ARMED',
    what_failed: 'pipeline invoked but no run armed',
    what_is_missing: 'a signed run-active state (or a dispatched pipeline-orchestrator: agent)',
    fix_instruction: 'arm the run: write the signed sentinel-state + active-run pointer, or dispatch a pipeline-orchestrator: agent',
    resume_instruction: `resume the blocked ${safeTool} after the run is armed`,
    workflow: safeWf || undefined,
    blocking: true, // R4: LAYER-A hard block stays in force while recovering
  };
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

// THREE-WAY run-state discovery (R2.1/R2.2, spec 006 §2.3). Returns one of:
//   'unavailable' — the discovery module itself is missing/threw. We CANNOT see
//                   the run state at all. Fail-OPEN: treat as active so the gate
//                   never bricks an armed+active run we simply cannot observe
//                   (ARCH-7 contract preserved).
//   'corrupt'     — the authoritatively-pointed sentinel-state exists on disk but
//                   is unreadable (CORRUPT_SENTINEL). This is the SCOPE-INVERTED
//                   case: the caller maps it to corrupt=true so decideArmGate
//                   fails CLOSED — but ONLY inside the governed window (armPending).
//   'active'      — a readable state with pipeline_active===true (run is live).
//   'inactive'    — a readable state that is not active (genuinely not-armed).
//
// The discrimination is intentionally NOT collapsed: 'unavailable' and 'corrupt'
// used to both fall into runActive=false/true respectively; they now diverge so
// "cannot see" (fail-open) is distinct from "see corruption" (fail-closed in the
// governed window). The pure brain consumes the two derived booleans only.
function discoverRunState(dir) {
  if (!eg || typeof eg.findActiveSentinelState !== 'function') return 'unavailable';
  let state;
  try { state = eg.findActiveSentinelState(dir); } catch { return 'unavailable'; }
  if (state === eg.CORRUPT_SENTINEL) return 'corrupt';
  if (!state) return 'inactive';
  return state.pipeline_active === true ? 'active' : 'inactive';
}

// SCOPED FAIL-CLOSED POSTURE (spec 006 §2.3 — rewrites the AUDIT-003/D3
// intentional-exception block). HISTORY: this front-door gate USED to stay
// fail-OPEN on CORRUPT_SENTINEL unconditionally — the old comment justified that
// as "a corrupt state would otherwise DEMAND arming and brick the session before
// recovery". Spec 006 INVERTS that exception, but ONLY inside the governed window:
//   - CORRUPT_SENTINEL && armPending  → corrupt=true → decideArmGate DENIES
//     (fail-CLOSED). Aligns the front door with step-ledger / gate-log /
//     dispatch-pending, which already fail closed on corrupt for governed actions.
//     The anti-brick guarantee is preserved by the recovery edges: the marker TTL
//     still expires (R5), the read-only/control carve-out stays open so the
//     operator can diagnose, and the deny feeds the corrective (R2.3).
//   - CORRUPT_SENTINEL && NOT armPending → fail-OPEN (R2.2). An ordinary session
//     with no pending run is NEVER bricked — corrupt is simply never consulted
//     there (decideArmGate short-circuits on !armPending before reading corrupt).
//   - discovery TRULY unavailable (module missing/threw) → still fail-OPEN
//     (runActive=true). "Cannot see" must NOT be conflated with "see corruption":
//     we never block a run we cannot even observe (ARCH-7 preserved).
//
// `runActive` is true ONLY for an observed-active run OR the unobservable case.
// `corrupt` is true ONLY for the corrupt case. These are mutually exclusive by
// construction (a corrupt state yields runActive=false, corrupt=true).
function runStateContext(dir) {
  const s = discoverRunState(dir);
  return {
    runActive: s === 'active' || s === 'unavailable',
    corrupt: s === 'corrupt',
  };
}

// Back-compat shim: isRunActive remains exported for callers/tests that only ask
// the boolean. It folds 'unavailable' and 'active' into true, everything else
// (incl. 'corrupt') into false. NOTE — this is NOT identical to the pre-spec-006
// boolean: spec 006 (R2.1) INTENTIONALLY changed the CORRUPT_SENTINEL mapping
// from true (the old "fail-open on corrupt" stance) to false, so a corrupt state
// now yields runActive=false here and the governed window can fail CLOSED via the
// NEW corrupt signal. Callers that only consume this boolean therefore see a
// corrupt state as not-active (was: active). This semantic change is deliberate
// and load-bearing — do not "restore" the old corrupt→true mapping.
function isRunActive(dir) {
  return runStateContext(dir).runActive;
}

function gatherContext(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return null;
  const marker = readArmPending(dir);
  // Carryover (Batch 2 review MINOR-2): mirror the typeof guard used at the armed
  // path below when assigning toolName, for consistency. Reviewer-confirmed
  // unreachable downstream (decideArmGate short-circuits on !armPending) with zero
  // security impact — applied only because Batch 3 already edits this file.
  if (!marker) {
    return { toolName: typeof payload.tool_name === 'string' ? payload.tool_name : '(unknown)', armPending: false };
  }
  const rs = runStateContext(dir);
  return {
    toolName: typeof payload.tool_name === 'string' ? payload.tool_name : '(unknown)',
    armPending: true,
    runActive: rs.runActive,
    corrupt: rs.corrupt,
    pipelineAligned: isPipelineTarget(payload) || isPipelineDocWrite(payload, dir),
    enforce: process.env.PIPELINE_ARM_ENFORCEMENT,
    workflow: marker.workflow,
  };
}

function handlePreToolUse(payload) {
  const ctx = gatherContext(payload);
  if (!ctx) return { decision: 'allow' };
  const result = decideArmGate(ctx);
  // H1 (final-review SEC-2 / ARCH RISK-1) — LAYER A→B bridge (design §2.6). A
  // governed PreToolUse DENY prevents the tool from running, so NO PostToolUse event
  // ever carries this verdict — the Batch-4 PostToolUse observer was dead-wired in
  // production. The gate therefore emits its decision on the channel it CONTROLS: on
  // a REAL governed deny it ADDITIVELY persists a signed corrective-trigger artifact
  // the consumer drains into an on-disk corrective_redispatch record (NFR5). This is
  // a PURE additive side-effect — the deny/allow DECISION (`result`) is returned
  // UNCHANGED, and the write is fully wrapped so it can NEVER throw or block the gate.
  if (result && result.decision === 'block' && result.invariant_id) {
    emitCorrectiveTrigger(payload, ctx, result);
  }
  return result;
}

// Additive side-effect ONLY. Optional require so a missing engine degrades to a
// no-op (the gate's enforcement must never depend on the corrective module). Fully
// guarded: any failure is swallowed — a corrective-trigger write must NEVER change
// the gate's decision, throw, or block the harness.
function emitCorrectiveTrigger(payload, ctx, result) {
  try {
    const cwd = payload && typeof payload.cwd === 'string' ? payload.cwd : null;
    if (!cwd) return;
    let engine = null;
    try { engine = require('../../lib/corrective-dispatch.cjs'); } catch { engine = null; }
    if (!engine || typeof engine.appendCorrectiveTrigger !== 'function') return;
    engine.appendCorrectiveTrigger(cwd, {
      run_id: '',
      observer: 'arm-gate',
      invariant_id: result.invariant_id,
      tool_name: ctx && ctx.toolName,
      corrective: result.corrective || {},
    });
  } catch { /* additive side-effect — never affects the decision */ }
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
  buildCorruptReason,         // spec 006 T2.1/T2.3: governed corrupt-state deny reason
  buildCorrectiveDescriptor,  // spec 006 T2.3: deny shape Batch 4 turns into a CorrectivePayload
  sanitizeWorkflow,
  resolveArmTtlMs,
  readArmPending,      // SEC-1: exported so F8 can exercise the verify-on-read path
  markerIsTampered,    // SEC-1
  discoverRunState,    // spec 006 T2.1: three-way run-state discovery
  runStateContext,     // spec 006 T2.1: derives {runActive, corrupt} from discovery
  gatherContext,
  handlePreToolUse,
  toHookOutput,
  isRunActive,         // spec 006 T2.1: back-compat boolean shim (folds corrupt→false)
  isPipelineTarget,
  isPipelineDocWrite,
  WORK_TOOLS,
  ALWAYS_ALLOW_TOOLS,
};
