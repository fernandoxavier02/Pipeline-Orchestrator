#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 — Lote 2 (chain-tied enforcement): chain integrity over the step ledger
// =============================================================================
// expectedNextStep  — the first manifest agent-step not yet stamped.
// verifyChainOrder  — stamped steps form an in-order prefix (skipping a phase
//                     breaks the chain → invalid, names the broken step).
// isChainComplete   — true only when every manifest agent-step is stamped in order
//                     (consumed by the closure gate: no Stop on an incomplete chain).
// =============================================================================

const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const L = require(path.join(root, 'lib', 'step-ledger.cjs'));

let failures = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} | exp=${JSON.stringify(exp)} got=${JSON.stringify(got)} | ${label}`);
}
const st = (steps) => ({ step_ledger: steps });

// FULL agent-step order: classify, info-gate, plan, tdd, execute, adversarial, sanity, final
check('expectedNext: vazio → classify', L.expectedNextStep(st([]), 'FULL'), 'classify');
check('expectedNext: [classify] → info-gate', L.expectedNextStep(st(['classify']), 'FULL'), 'info-gate');
check('expectedNext: ate plan → tdd', L.expectedNextStep(st(['classify', 'info-gate', 'plan']), 'FULL'), 'tdd');

check('ordem OK: prefixo em ordem', L.verifyChainOrder(st(['classify', 'info-gate', 'plan']), 'FULL'), { valid: true, brokenAt: null });
check('ordem QUEBRADA: pulou info-gate', L.verifyChainOrder(st(['classify', 'plan']), 'FULL'), { valid: false, brokenAt: 'info-gate' });
check('ordem QUEBRADA: pulou direto pro final', L.verifyChainOrder(st(['classify', 'final']), 'FULL'), { valid: false, brokenAt: 'info-gate' });

const FULL_SEQ = ['classify', 'info-gate', 'plan', 'tdd', 'execute', 'adversarial', 'sanity', 'final'];
check('completa: sequencia inteira', L.isChainComplete(st(FULL_SEQ), 'FULL'), true);
check('NAO completa: falta final', L.isChainComplete(st(FULL_SEQ.slice(0, -1)), 'FULL'), false);
check('NAO completa: vazio', L.isChainComplete(st([]), 'FULL'), false);
check('expectedNext: completa → null', L.expectedNextStep(st(FULL_SEQ), 'FULL'), null);

// Ungoverned steps in the ledger (e.g. the human-gate 'proposal') are ignored.
check('ungoverned ignorado: proposal nao quebra', L.verifyChainOrder(st(['classify', 'proposal', 'info-gate']), 'FULL'), { valid: true, brokenAt: null });

// Unknown workflow → ungoverned: nothing expected, never complete.
check('workflow desconhecido: expectedNext null', L.expectedNextStep(st(['x']), 'NOPE'), null);
check('workflow desconhecido: nunca completa', L.isChainComplete(st(['x']), 'NOPE'), false);

console.log(failures === 0 ? '\n>>> F2 PASS' : `\n>>> F2 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
