#!/usr/bin/env node
'use strict';

// =============================================================================
// pipeline-arm-writer.cjs — v8.7.0 (UserPromptSubmit)
// =============================================================================
// Deterministically ARMS the pipeline the instant a /pipeline command is
// submitted: classifies the workflow in code and writes the arm-pending marker.
// pipeline-arm-gate.cjs (PreToolUse) then denies substantive work until the run
// is armed. UserPromptSubmit CANNOT deny — its sole job here is to WRITE the
// marker (the deterministic state the gate enforces) and surface the detected
// workflow to the operator. NEVER blocks the prompt; fail-open on any error.
// =============================================================================

let arm = null;
try { arm = require('../../lib/pipeline-arm.cjs'); } catch { arm = null; }

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try {
    let prompt = '';
    let cwd = process.cwd();
    try {
      const d = JSON.parse(input || '{}');
      prompt = d.prompt || d.input || d.text || d.message || '';
      if (typeof d.cwd === 'string' && d.cwd) cwd = d.cwd;
    } catch { prompt = (input || '').trim(); }

    let marker = null;
    if (arm && typeof arm.writeArmPending === 'function') {
      // v8.18.0: session isolation
      let sid;
      try { const d2 = JSON.parse(input || '{}'); sid = typeof d2.session_id === 'string' ? d2.session_id : undefined; } catch { sid = undefined; }
      try { marker = arm.writeArmPending(cwd, prompt, undefined, sid); } catch { marker = null; }
    }

    if (marker) {
      process.stdout.write(JSON.stringify({
        continue: true,
        // v8.20.0 (F3): ONE next action — the same reliable one the arm-gate deny
        // names. No self-write recipe (the LLM has no signer), no placeholders.
        systemMessage:
          `⛔ PIPELINE ARMADO (determinístico) — workflow=${marker.workflow}. ` +
          `Trabalho real (Edit/Write/Bash/subagente genérico) fica BLOQUEADO até o run iniciar. ` +
          `PRÓXIMA AÇÃO (única): Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", prompt: <a tarefa do usuário>). ` +
          `Leitura (Read/Grep/Glob) e perguntas seguem liberadas.`,
      }));
    } else {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  } catch {
    process.stdout.write(JSON.stringify({ continue: true }));
  }
});

module.exports = {};
