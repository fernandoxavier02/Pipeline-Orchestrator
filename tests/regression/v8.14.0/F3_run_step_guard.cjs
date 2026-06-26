#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 — Lote 3 (chain-tied enforcement): run-step-guard pure brain
// =============================================================================
// Dispatcher-not-worker: during an active governed run, a production mutation is
// allowed ONLY inside an open exec-window; inline mutation with no window is the
// skip path → DENY, and the deny ALWAYS carries a rehydration prompt.
// =============================================================================

const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const G = require(path.join(root, 'lib', 'run-step-guard.cjs'));

let failures = 0;
function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`);
}

// Mutating tool, NO window → BLOCK with rehydration.
const d1 = G.decideGovernedAction({ toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute', sessionId: 'sess1', enforce: 'deny' });
check('Edit inline sem janela → block', d1.decision === 'block');
check('block tem invariant INLINE_WORK_BLOCKED', d1.invariant_id === 'INLINE_WORK_BLOCKED');
check('block carrega o passo esperado', d1.expected_step === 'execute');
check('REIDRATACAO: reason cita o passo esperado', /execute/.test(d1.reason));
check('REIDRATACAO: reason diz como corrigir (despache o agente do passo)', /despache/i.test(d1.reason) && /janela de execu/i.test(d1.reason));
// FINAL-REVIEW SEC-3 regression guard: the deny message must NOT teach the exec-window WRITE PATH
// (a steered agent could self-arm a fake window via that exempt `.pipeline/` write).
check('SEC-3: reason NAO ensina o caminho do arquivo .exec-window', !/\.exec-window/.test(d1.reason) && !/Write em \.pipeline/i.test(d1.reason));
check('REIDRATACAO: nunca parede seca (reason nao-vazio)', typeof d1.reason === 'string' && d1.reason.length > 40);

// Mutating tool, window OPEN → ALLOW (sanctioned executor work).
check('Bash dentro de janela → allow', G.decideGovernedAction({ toolName: 'Bash', execWindowOpen: true, enforce: 'deny' }).decision === 'allow');
check('Write dentro de janela → allow', G.decideGovernedAction({ toolName: 'Write', execWindowOpen: true, enforce: 'deny' }).decision === 'allow');

// Non-mutating tool → ALLOW even without a window (defense-in-depth).
check('Read sem janela → allow', G.decideGovernedAction({ toolName: 'Read', execWindowOpen: false, enforce: 'deny' }).decision === 'allow');
check('isMutatingTool(Edit) true', G.isMutatingTool('Edit') === true);
check('isMutatingTool(Read) false', G.isMutatingTool('Read') === false);

// warn escape → allow-with-warn (rollout), still flags the invariant.
const dw = G.decideGovernedAction({ toolName: 'Edit', execWindowOpen: false, enforce: 'warn' });
check('warn escape → allow + warn flag', dw.decision === 'allow' && dw.warn === true);

// Malformed ctx → allow (never throws, never bricks).
check('ctx nulo → allow', G.decideGovernedAction(null).decision === 'allow');

console.log(failures === 0 ? '\n>>> F3 PASS' : `\n>>> F3 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
