#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-session-arm-hook.cjs — v8.12.0 (SessionStart) — spec 006 T3.1
// =============================================================================
// DEFENSE IN DEPTH (R3.1, q4): a SECOND, independent code path that ARMS a
// governed run WITHOUT any LLM write. The UserPromptSubmit writer
// (pipeline-arm-writer.cjs) already writes the signed arm-pending marker the
// instant a /pipeline command is submitted; this SessionStart sibling re-arms the
// SAME marker so a governed run is still covered if the prompt-submit hook was
// missed — e.g. the session starts already carrying a /pipeline-orchestrator:
// invocation (startup/resume source), so the very first prompt that would have
// armed the run never passes through UserPromptSubmit as a fresh submission.
//
// IT REUSES lib/pipeline-arm.cjs::writeArmPending — the SAME signed/atomic
// temp+rename marker scheme. There is deliberately NO second marker format: the
// arm-gate reads exactly one marker, and both writers produce exactly that one.
// writeArmPending no-ops (returns null) on a non-pipeline prompt, so an ordinary
// session is NEVER armed by this hook.
//
// SessionStart CANNOT deny — this hook only WRITES the deterministic state the
// PreToolUse arm-gate enforces. It NEVER blocks the session and fail-opens on any
// error (mirrors pipeline-arm-writer.cjs). Pure I/O glue; the classification +
// signing + atomic write all live in the reused SSOT.
// =============================================================================

let arm = null;
try { arm = require('../../lib/pipeline-arm.cjs'); } catch { arm = null; }

// SEC-4 parity (Batch 3 INPUT-1): the SessionStart banner interpolates
// marker.workflow — an on-disk (attacker-controllable) field — into a systemMessage.
// Reuse the SAME SSOT sanitizer the PreToolUse arm-gate already applies to this exact
// field (pipeline-arm-gate.cjs::sanitizeWorkflow), instead of inventing a second one,
// so the front door and the banner share one defense. Optional require: if the gate
// module is unavailable, degrade to a conservative inline strip (never crash the hook).
let gate = null;
try { gate = require('./pipeline-arm-gate.cjs'); } catch { gate = null; }
function sanitizeWorkflow(workflow) {
  if (gate && typeof gate.sanitizeWorkflow === 'function') {
    try { return gate.sanitizeWorkflow(workflow); } catch { /* fall through */ }
  }
  // Fallback only when the SSOT sanitizer is unreachable (keeps the same contract:
  // strip CR/LF + control chars, safe charset, cap length).
  if (typeof workflow !== 'string') return '';
  return workflow
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9 _.:\/-]/g, '')
    .trim()
    .slice(0, 80);
}

// SessionStart payloads vary by harness/source. The initial /pipeline invocation
// can arrive under any of these prompt-bearing fields; we classify whichever is
// present. A missing/empty value simply yields no marker (writeArmPending no-ops).
function extractPrompt(d) {
  if (!d || typeof d !== 'object') return '';
  for (const k of ['prompt', 'input', 'text', 'message', 'initial_prompt', 'query']) {
    if (typeof d[k] === 'string' && d[k]) return d[k];
  }
  return '';
}

function handleSessionStart(payload) {
  let prompt = '';
  let cwd = process.cwd();
  if (payload && typeof payload === 'object') {
    prompt = extractPrompt(payload);
    if (typeof payload.cwd === 'string' && payload.cwd) cwd = payload.cwd;
  }

  let marker = null;
  if (arm && typeof arm.writeArmPending === 'function') {
    // writeArmPending: classifies in code, signs (reusing the sentinel-state
    // signer), atomic temp+rename. Returns null for a non-pipeline prompt.
    try { marker = arm.writeArmPending(cwd, prompt); } catch { marker = null; }
  }

  if (marker) {
    // SEC-4 parity: sanitize the attacker-controllable workflow string before it
    // rides into the banner (same SSOT sanitizer as the PreToolUse deny reason).
    const safeWf = sanitizeWorkflow(marker.workflow);
    const wf = safeWf || '(desconhecido)';
    return {
      continue: true,
      systemMessage:
        `⛔ PIPELINE ARMADO (SessionStart, defesa em profundidade) — workflow=${wf}. ` +
        `Trabalho real (Edit/Write/Bash/subagente genérico) está BLOQUEADO até o run ser armado: ` +
        `crie {PIPELINE_DOC_PATH}/sentinel-state.json com pipeline_active:true, ` +
        `ou inicie o workflow despachando um agente pipeline-orchestrator:. ` +
        `Leitura (Read/Grep/Glob) e perguntas seguem liberadas.`,
    };
  }
  return { continue: true };
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { input += c; });
  process.stdin.on('end', () => {
    try {
      let payload = {};
      try { payload = JSON.parse(input || '{}'); } catch { payload = {}; }
      process.stdout.write(JSON.stringify(handleSessionStart(payload)));
    } catch {
      // Never halt the session start on an internal error (fail-open).
      process.stdout.write(JSON.stringify({ continue: true }));
    }
    process.exit(0);
  });
  process.stdin.on('error', () => { process.stdout.write(JSON.stringify({ continue: true })); process.exit(0); });
}

module.exports = { handleSessionStart, extractPrompt, sanitizeWorkflow };
