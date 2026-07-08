#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 (v8.22.0) — dispatch-pending-gate: EXEC-WINDOW CONTROL-PLANE EXEMPTION (T2)
// =============================================================================
// DEFECT (live run 2026-07-04-e2e-ruler-recalibration-s2): with a live pending
// block, the ONLY designed way out is arming an exec-window — but the arming
// script (scripts/exec-window/open.cjs) is itself a Bash command, denied by the
// very gate it unblocks (egg-and-chicken). T1 (F1) removes the common case via
// the already-dispatched exemption; this exemption covers the remaining window
// (pending live, spawn not yet recorded, operator/controller arming the window).
//
// FIX UNDER TEST: dispatch-pending-gate.cjs exports isExecWindowControlCommand
// and decideInlineGate ALLOWS a Bash/PowerShell command that is EXACTLY a node
// invocation of a script path ending in scripts/exec-window/open.cjs|close.cjs.
// ANCHORED match: optional VAR=val env prefixes, then node, then the script as
// the FIRST argument. Composition (&&, ;, |, subshell, backticks, newline) or
// the path embedded as an argument of another program NEVER earns the exemption.
//
// BDD scenarios:
//   C1  [repro]     live pending + node <abs>/scripts/exec-window/open.cjs …   → ALLOW
//   C2  [close]     same for close.cjs                                          → ALLOW
//   C3  [quoted]    quoted Windows path with backslashes                        → ALLOW
//   C4  [env]       VAR=1 prefix before node                                    → ALLOW
//   C5  [compose &&] node …/open.cjs && <anything>                              → BLOCK
//   C6  [compose ;]  echo x; node …/open.cjs                                    → BLOCK
//   C7  [subshell]  node $(echo pwn)/scripts/exec-window/open.cjs               → BLOCK
//   C8  [wrong exe] python scripts/exec-window/open.cjs                         → BLOCK
//   C9  [lookalike] node scripts/exec-window-evil/open.cjs                      → BLOCK
//   C10 [embedded]  node evil.js scripts/exec-window/open.cjs                   → BLOCK
//   C11 [baseline]  live pending + ordinary Bash work                           → BLOCK
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f2-execwindow-control-plane-stable-secret-0123456789';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const gate = require(path.join(ROOT, '.claude/hooks/dispatch-pending-gate.cjs'));

function iso(ageMs) { return new Date(Date.now() - ageMs).toISOString(); }

function setupLive() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-live-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-07-04-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 1, run_id: '2026-07-04-run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '2',
    pending_blocks: [{ block_type: 'DISPATCH_REQUEST', dispatch_id: 'phase-2-executor-controller', emitted_at: iso(60_000) }],
  };
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  return tmp;
}

const payload = (tmp, command, tool = 'Bash') => ({ tool_name: tool, tool_input: { command }, cwd: tmp });

let pass = 0, fail = 0; const failed = [];
function check(name, command, expected, tool) {
  let tmp;
  try {
    tmp = setupLive();
    const r = gate.decideInlineGate(payload(tmp, command, tool));
    assert.equal(r.decision, expected,
      `expected '${expected}', got '${r.decision}'${r.reason ? ' — ' + String(r.reason).slice(0, 100) : ''}`);
    console.log(`  [PASS] ${name}`);
    pass++;
  } catch (e) {
    console.log(`  [FAIL] ${name}\n         ${e.message}`);
    fail++; failed.push(name);
  }
  if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

console.log('=== F2 v8.22.0 — exec-window control-plane exemption (T2) ===');

const OPEN_POSIX = '/home/user/.claude/plugins/cache/FX-Studio-AI/pipeline-orchestrator/8.20.0/scripts/exec-window/open.cjs';
const OPEN_WIN = 'C:\\Users\\win\\.claude\\plugins\\cache\\FX-Studio-AI\\pipeline-orchestrator\\8.20.0\\scripts\\exec-window\\open.cjs';

check('C1 [repro] node <abs>/scripts/exec-window/open.cjs com pending vivo → ALLOW',
  `node ${OPEN_POSIX} 72d3d016 pipeline-orchestrator:executor:executor-controller batch-1 20`, 'allow');

check('C2 [close] node …/scripts/exec-window/close.cjs → ALLOW',
  `node ${OPEN_POSIX.replace('open.cjs', 'close.cjs')} 72d3d016`, 'allow');

check('C3 [quoted] caminho Windows entre aspas com contrabarras → ALLOW',
  `node "${OPEN_WIN}" 72d3d016 pipeline-orchestrator:executor:executor-controller batch-1 20`, 'allow');

check('C4 [env] prefixo VAR=val antes do node → ALLOW',
  `PIPELINE_HANDSHAKE_TIMEOUT_MS=60000 node ${OPEN_POSIX} 72d3d016 executor batch 20`, 'allow');

check('C5 [composto &&] open.cjs seguido de && → BLOCK (isenção não vaza)',
  `node ${OPEN_POSIX} 72d3d016 executor batch 20 && rm -rf /tmp/x`, 'block');

check('C6 [composto ;] comando antes, open.cjs depois → BLOCK',
  `echo pwn; node ${OPEN_POSIX} 72d3d016 executor batch 20`, 'block');

check('C7 [subshell] $(…) no caminho → BLOCK',
  `node $(echo /home/user)/scripts/exec-window/open.cjs 72d3d016 executor batch 20`, 'block');

check('C8 [exe errado] python rodando o script → BLOCK',
  `python scripts/exec-window/open.cjs 72d3d016 executor batch 20`, 'block');

check('C9 [lookalike] pasta exec-window-evil → BLOCK',
  'node scripts/exec-window-evil/open.cjs 72d3d016 executor batch 20', 'block');

check('C10 [embutido] open.cjs como ARGUMENTO de outro script → BLOCK',
  'node evil.js scripts/exec-window/open.cjs', 'block');

check('C11 [baseline] trabalho Bash comum com pending vivo segue BLOCK',
  'node scripts/run-tests.cjs', 'block');

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
