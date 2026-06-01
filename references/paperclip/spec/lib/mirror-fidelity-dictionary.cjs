'use strict';
// Dicionário de tradução bloco→portão (v1). Fonte: INVENTÁRIO REAL de blocos das 54
// execuções (30 tipos distintos observados) + conjuntos de portões esperados da spec
// (A4-validation §2, gates.md).

// Blocos que os cargos JÁ emitem → portão canônico equivalente.
//
// Estes são mapeamentos-INFERÊNCIA v1 (bloco→portão): cada um é a leitura defensável de
// qual portão canônico o bloco representa, com base no inventário real — NÃO um contrato
// fixo. Sujeitos a refino conforme observamos mais execuções.
//
// POR DESIGN, vários portões esperados NÃO têm bloco-fonte aqui — não há NENHUM bloco que
// os agentes emitam para sinalizá-los: INFO_GATE_BLOCKED, PLAN_REJECTED, MICRO_GATE_GAP,
// STOP_RULE, STATE_FILE_INIT_FAIL, FINAL_ADVERSARIAL_REWORK, FIX_LOOP_EXHAUSTED,
// ADVERSARIAL_GATE_MANDATORY, SSOT_CONFLICT. Essa ausência é exatamente o gap de fidelidade
// que o medidor revela — o teto da nota com o dicionário atual é < 1.0 de propósito,
// refletindo a realidade observada, não uma meta atingível hoje.
//
// Vários blocos colapsam no MESMO portão por design (o medidor afere PRESENÇA do portão,
// não a qualidade nem a contagem do conteúdo): SLICE_CLOSEOUT/HANDOFF_STATUS/SPEC_CLOSER →
// CLOSEOUT_CONFIRM; SECURITY/QUALITY/ARCHITECTURE/SECURITY_RERUN_FINDINGS +
// ADVERSARIAL_CONSOLIDATED(_CORRECTION) → ADVERSARIAL_GATE; EXECUTOR_FIX_DONE/FIX_COMPLETE/
// FIX_APPLIED → ADVERSARIAL_BLOCK (fix só ocorre após findings que bloquearam).
//
// Blocos INFORMACIONAIS observados no inventário que NÃO são portões medidos e por isso
// ficam de fora (mapeá-los seria morto e enganoso, como o antigo DISPATCH_REQUEST):
// DISPATCH_REQUEST, DELEGATED_FOLLOWUP, RECOVERY_COMPLETE, RECOVERY_DISPOSITION,
// RECOVERY_RESUME_ACK, DISPATCH_CORRECTION, ROOT_CAUSE_RESULT, HANDOFF_FOR_REVIEW,
// IMPLEMENTER_RERUN_HANDOFF, CANONICAL_FALLBACK_APPLIED — são handoffs/diagnóstico/
// recuperação, não sinais de portão canônico.
const BLOCK_TO_GATE = {
  // → INFO_GATE_BLOCKED
  // CLARIFICATION_DONE é o bloco que o nó "clarificar" da fábrica de árvore de tasks emite
  // ao concluir o ciclo de info-gate (Req 5.1/5.2). Este mapeamento FECHA a lacuna histórica:
  // INFO_GATE_BLOCKED estava em EXPECTED_GATES.SIMPLES mas não tinha bloco-fonte, limitando
  // o teto de uma execução SIMPLES perfeita a 4/5 = 0.80. Agora o teto é 1.0.
  CLARIFICATION_DONE: 'INFO_GATE_BLOCKED',
  // → COMPLEXITY_GATE
  ORCHESTRATOR_DECISION: 'COMPLEXITY_GATE',
  TRIAGE_RESULT: 'COMPLEXITY_GATE',
  // → TDD_APPROVAL
  TDD_GREEN: 'TDD_APPROVAL',
  TDD_RED: 'TDD_APPROVAL',
  // → CHECKPOINT_FAIL (resultado de teste/regressão = portão de build/test)
  REGRESSION_RESULT: 'CHECKPOINT_FAIL',
  REGRESSION_CLOSEOUT: 'CHECKPOINT_FAIL',
  // D7 (Gap G2 — ABERTO): SANITY_CHECK NÃO entra no dicionário.
  // Razão: _fidelidade.md §5 (linha 118, gerada 2026-06-01) lista explicitamente SANITY_CHECK
  // como "sem mapeamento atual (ver Gap G2)". O teto calculado em _fidelidade.md §2 (linha 65)
  // assume "dicionário atual (21 mapeamentos)" com SANITY_CHECK FORA. A discrepância detectada
  // no achado adversarial D7 (G3-Régua) era exatamente essa: o código tinha 22 entradas
  // enquanto a SSOT declarava 21. Corrigido alinhando código à SSOT.
  //
  // Motivo técnico adicional: o agente real (sanity-checker.md:78) emite "SANITY_CHECK:" como
  // bloco YAML, NÃO como cabeçalho "### SANITY_CHECK v1". O parser (mirror-fidelity-parser.cjs)
  // só reconhece cabeçalhos — o mapeamento seria inerte em dados reais mesmo se existisse.
  // Gap G2 permanece ABERTO por decisão do usuário (_tronco.md §5, _modos.md §1.5 G-HF2).
  // → ADVERSARIAL_GATE
  ADVERSARIAL_CONSOLIDATED: 'ADVERSARIAL_GATE',
  ADVERSARIAL_CONSOLIDATED_CORRECTION: 'ADVERSARIAL_GATE',
  SECURITY_FINDINGS: 'ADVERSARIAL_GATE',
  QUALITY_FINDINGS: 'ADVERSARIAL_GATE',
  ARCHITECTURE_FINDINGS: 'ADVERSARIAL_GATE',
  SECURITY_RERUN_FINDINGS: 'ADVERSARIAL_GATE',
  // → ADVERSARIAL_BLOCK (fix só ocorre após findings que bloquearam)
  EXECUTOR_FIX_DONE: 'ADVERSARIAL_BLOCK',
  FIX_COMPLETE: 'ADVERSARIAL_BLOCK',
  FIX_APPLIED: 'ADVERSARIAL_BLOCK',
  // → FINAL_ADVERSARIAL_GATE
  PA_DE_CAL: 'FINAL_ADVERSARIAL_GATE',
  ADVERSARIAL_FINAL_VERDICT: 'FINAL_ADVERSARIAL_GATE',
  // → CLOSEOUT_CONFIRM
  SLICE_CLOSEOUT: 'CLOSEOUT_CONFIRM',
  HANDOFF_STATUS: 'CLOSEOUT_CONFIRM',
  SPEC_CLOSER: 'CLOSEOUT_CONFIRM',
};

// Conjuntos mandatórios por complexidade (A4-validation §2 + canônico).
const SIMPLES = ['INFO_GATE_BLOCKED', 'TDD_APPROVAL', 'CHECKPOINT_FAIL', 'COMPLEXITY_GATE', 'CLOSEOUT_CONFIRM'];
const MEDIA = SIMPLES.concat(['PLAN_REJECTED', 'MICRO_GATE_GAP', 'ADVERSARIAL_GATE', 'ADVERSARIAL_BLOCK', 'STOP_RULE']);
const COMPLEXA = MEDIA.concat([
  'STATE_FILE_INIT_FAIL', 'FINAL_ADVERSARIAL_GATE', 'FINAL_ADVERSARIAL_REWORK',
  'FIX_LOOP_EXHAUSTED', 'ADVERSARIAL_GATE_MANDATORY', 'SSOT_CONFLICT',
]);
// REVIEW-ONLY: excluído da régua por design (G-RO2, _modos.md §2.6).
// O pipeline-controller.md:207-215 define que no modo review-only as Phases 0-2 são puladas,
// portanto ORCHESTRATOR_DECISION nunca é emitido. A spec deixou como decisão aberta:
// "criar bloco sintético" OU "aceitar que REVIEW-ONLY é score = N/A". A decisão adotada
// é a opção 2: execuções review-only resultam em complexidade null → indeterminate=true
// (tratamento idêntico ao de qualquer execução órfã). Isso é honesto: a régua não mede
// o que não tem como medir sem bloco real de um agente.
// NÃO há entrada REVIEW_ONLY em EXPECTED_GATES — expectedGates('REVIEW_ONLY') retorna [].
const EXPECTED_GATES = { SIMPLES, MEDIA, COMPLEXA };

function gateForBlock(name) {
  return Object.prototype.hasOwnProperty.call(BLOCK_TO_GATE, name) ? BLOCK_TO_GATE[name] : null;
}
function expectedGates(complexity) {
  return EXPECTED_GATES[complexity] ? EXPECTED_GATES[complexity].slice() : [];
}

module.exports = { BLOCK_TO_GATE, EXPECTED_GATES, gateForBlock, expectedGates };
