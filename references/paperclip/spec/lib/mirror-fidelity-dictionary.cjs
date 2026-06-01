'use strict';
// Dicionário de tradução bloco→portão (v0). Fonte: blocos observados nas 54 execuções
// reais (A5 §4) + conjuntos de portões esperados da spec (A4-validation §2, gates.md).

// Blocos que os cargos JÁ emitem → portão canônico equivalente.
//
// POR DESIGN, vários portões esperados NÃO têm bloco-fonte aqui (INFO_GATE_BLOCKED,
// CHECKPOINT_FAIL, PLAN_REJECTED, MICRO_GATE_GAP e os de aprovação): os agentes ainda
// não emitem esses blocos. Essa ausência é exatamente o gap de fidelidade que o medidor
// revela — o teto da nota com o dicionário atual é < 1.0 de propósito, refletindo a
// realidade observada, não uma meta atingível hoje.
//
// SLICE_CLOSEOUT e HANDOFF_STATUS mapeiam AMBOS para CLOSEOUT_CONFIRM por design: ambos
// sinalizam fechamento. O medidor afere PRESENÇA do portão, não a qualidade do conteúdo.
//
// DISPATCH_REQUEST foi removido: é informacional (handoff), não um portão medido — não
// está em nenhum conjunto esperado, então mapeá-lo seria um mapeamento morto e enganoso.
const BLOCK_TO_GATE = {
  ORCHESTRATOR_DECISION: 'COMPLEXITY_GATE',
  TDD_GREEN: 'TDD_APPROVAL',
  ADVERSARIAL_CONSOLIDATED: 'ADVERSARIAL_GATE',
  PA_DE_CAL: 'FINAL_ADVERSARIAL_GATE',
  SLICE_CLOSEOUT: 'CLOSEOUT_CONFIRM',
  HANDOFF_STATUS: 'CLOSEOUT_CONFIRM',
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
