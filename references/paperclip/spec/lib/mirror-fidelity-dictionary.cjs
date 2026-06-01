'use strict';
// Dicionário de tradução bloco→portão (v0). Fonte: blocos observados nas 54 execuções
// reais (A5 §4) + conjuntos de portões esperados da spec (A4-validation §2, gates.md).

// Blocos que os cargos JÁ emitem → portão canônico equivalente.
const BLOCK_TO_GATE = {
  ORCHESTRATOR_DECISION: 'COMPLEXITY_GATE',
  TDD_GREEN: 'TDD_APPROVAL',
  ADVERSARIAL_CONSOLIDATED: 'ADVERSARIAL_GATE',
  PA_DE_CAL: 'FINAL_ADVERSARIAL_GATE',
  SLICE_CLOSEOUT: 'CLOSEOUT_CONFIRM',
  HANDOFF_STATUS: 'CLOSEOUT_CONFIRM',
  DISPATCH_REQUEST: 'DISPATCH',
};

// Conjuntos mandatórios por complexidade (A4-validation §2 + canônico).
const SIMPLES = ['INFO_GATE_BLOCKED', 'TDD_APPROVAL', 'CHECKPOINT_FAIL', 'COMPLEXITY_GATE', 'CLOSEOUT_CONFIRM'];
const MEDIA = SIMPLES.concat(['PLAN_REJECTED', 'MICRO_GATE_GAP', 'ADVERSARIAL_GATE', 'ADVERSARIAL_BLOCK', 'STOP_RULE']);
const COMPLEXA = MEDIA.concat([
  'STATE_FILE_INIT_FAIL', 'FINAL_ADVERSARIAL_GATE', 'FINAL_ADVERSARIAL_REWORK',
  'FIX_LOOP_EXHAUSTED', 'ADVERSARIAL_GATE_MANDATORY', 'SSOT_CONFLICT',
]);
const EXPECTED_GATES = { SIMPLES, MEDIA, COMPLEXA };

function gateForBlock(name) {
  return Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, name) ? BLOCK_TO_GATE[name] : null;
}
function expectedGates(complexity) {
  return EXPECTED_GATES[complexity] ? EXPECTED_GATES[complexity].slice() : [];
}

module.exports = { BLOCK_TO_GATE, EXPECTED_GATES, gateForBlock, expectedGates };
