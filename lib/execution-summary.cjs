#!/usr/bin/env node
'use strict';

/**
 * execution-summary.cjs — builds a 4-axis Portuguese summary of a pipeline run
 * for use by the final-validator's score-collection step.
 *
 * Each axis condenses the trace into ONE short sentence in plain Portuguese
 * (no file paths, no hashes, no jargon). The summaries are interpolated into
 * AskUserQuestion prompts so the user grades the run informed by what
 * actually happened, not in the dark.
 *
 * Contract:
 *   summarize(pipelineDocPath) -> { plan, execution, review, result }
 *
 *   - pipelineDocPath: absolute or relative path to the run's doc folder
 *     (the same {PIPELINE_DOC_PATH} that agents save under).
 *   - Returns four strings. Each string is 1-2 short sentences, leigo-friendly.
 *   - On any I/O failure: returns a neutral placeholder per axis, never throws.
 *
 * Sources read (best-effort, missing files are tolerated):
 *   - gate-decisions.jsonl : counts gates, decisions, hardness
 *   - sentinel-state.json  : current phase, classification, complexity
 *   - protocol-events.jsonl: handshake count, dispatch count (optional)
 */

const fs = require('node:fs');
const path = require('node:path');

const NEUTRAL = {
  plan: 'Sem dados de triagem registrados nesta execucao.',
  execution: 'Sem dados de execucao registrados.',
  review: 'Sem dados da revisao adversarial registrados.',
  result: 'Sem dados de resultado final registrados.',
};

// SEC-3 (v7.6.0): cap to defend against unbounded gate-decisions.jsonl growth
// — readFileSync is synchronous on the main thread, so a 100MB file would stall
// the pipeline. 10 MB accommodates ~50k gate entries at 200 chars each.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function readJsonlSafe(absPath) {
  try {
    const st = fs.statSync(absPath);
    if (st.size > MAX_FILE_BYTES) return [];
    const raw = fs.readFileSync(absPath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try { return JSON.parse(line); } catch (_e) { return null; }
      })
      .filter((obj) => obj !== null);
  } catch (_e) {
    return [];
  }
}

function readJsonSafe(absPath) {
  try {
    const st = fs.statSync(absPath);
    if (st.size > MAX_FILE_BYTES) return null;
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function complexityLabel(c) {
  if (!c) return 'sem classificacao';
  const map = { SIMPLES: 'simples', MEDIA: 'media', COMPLEXA: 'complexa' };
  return map[c] || String(c).toLowerCase();
}

function typeLabel(t) {
  if (!t) return 'tarefa';
  const map = {
    'Bug Fix': 'correcao de bug',
    'Feature': 'implementacao',
    'User Story': 'implementacao',
    'Audit': 'auditoria',
    'Spec': 'especificacao',
  };
  return map[t] || String(t).toLowerCase();
}

function buildPlanSummary(gates, state) {
  // Triagem phase = Phase 0 events
  const phaseZero = gates.filter((g) => String(g.phase || '').startsWith('0'));
  const classification = state && state.classification;
  const tLabel = typeLabel(classification && classification.type);
  const cLabel = complexityLabel(classification && classification.complexity);

  const clarificationGates = phaseZero.filter((g) =>
    /CLARIFICATION|EXPLORE|ALTERNATIVES|INFORMATION_GATE/i.test(g.gate || '')
  );
  const blockedInTriage = phaseZero.filter((g) => g.decision === 'BLOCKED');

  let parts = [`Classificada como ${tLabel} ${cLabel}.`];
  if (clarificationGates.length > 0) {
    parts.push(`${clarificationGates.length} verificacao(oes) de clareza durante o planejamento.`);
  }
  if (blockedInTriage.length > 0) {
    parts.push(`${blockedInTriage.length} bloqueio(s) precisaram ser resolvidos antes de seguir.`);
  }
  if (parts.length === 1) {
    parts.push('Planejamento seguiu direto, sem perguntas extras.');
  }
  return parts.join(' ');
}

function buildExecutionSummary(gates, state) {
  // Execution = Phase 2 + batches
  const phaseTwo = gates.filter((g) => String(g.phase || '').match(/^2/));
  const checkpoints = phaseTwo.filter((g) =>
    /CHECKPOINT|BATCH|EXECUTOR/i.test(g.gate || '')
  );
  const stops = phaseTwo.filter((g) =>
    g.decision === 'BLOCKED' || g.decision === 'REJECTED'
  );
  const tdd = phaseTwo.filter((g) => /TDD|QUALITY_GATE|PRE_TESTER/i.test(g.gate || ''));

  const parts = [];
  if (checkpoints.length > 0) {
    parts.push(`${checkpoints.length} lote(s) de execucao concluido(s).`);
  } else {
    parts.push('Nenhum lote de execucao registrado (pode ser tarefa sem codigo novo).');
  }
  if (tdd.length > 0) {
    parts.push(`Testes-primeiro aplicados em ${tdd.length} momento(s).`);
  }
  if (stops.length > 0) {
    parts.push(`${stops.length} parada(s) por bloqueio durante a execucao.`);
  }
  return parts.join(' ');
}

function buildReviewSummary(gates) {
  const reviewGates = gates.filter((g) =>
    /ADVERSARIAL|ARCHITECTURE_REVIEW|DIFF_DISCIPLINE|REVIEW_ORCHESTRATOR|FINAL_ADVERSARIAL/i.test(g.gate || '')
  );

  if (reviewGates.length === 0) {
    return 'Nao houve revisao adversarial (tarefa pode ter sido somente relatorio).';
  }

  const blocked = reviewGates.filter((g) => g.decision === 'BLOCKED' || g.decision === 'REJECTED');
  const parts = [`Revisao adversarial rodou ${reviewGates.length} vez(es).`];
  if (blocked.length > 0) {
    parts.push(`${blocked.length} achado(s) precisaram de correcao antes do encerramento.`);
  } else {
    parts.push('Sem achados bloqueantes pendentes.');
  }
  return parts.join(' ');
}

function buildResultSummary(gates, state) {
  // Result = Phase 3 + final-validator decision
  const phaseThree = gates.filter((g) => String(g.phase || '').match(/^3/));
  const sanity = phaseThree.filter((g) => /SANITY|FIDELITY|BUILD|TEST/i.test(g.gate || ''));
  const finalDecision = state && state.final_decision;

  const totalMandatory = gates.filter((g) => g.hardness === 'MANDATORY').length;
  const mandatorySkipped = gates.filter((g) => g.hardness === 'MANDATORY' && g.decision === 'SKIPPED').length;

  const parts = [];
  if (finalDecision) {
    const dMap = { GO: 'aprovado', CONDITIONAL: 'condicional', 'NO-GO': 'reprovado' };
    parts.push(`Veredito tecnico: ${dMap[finalDecision] || finalDecision}.`);
  } else {
    parts.push('Veredito tecnico ainda nao registrado neste sumario.');
  }
  if (totalMandatory > 0) {
    parts.push(`${totalMandatory} verificacao(oes) obrigatoria(s)${mandatorySkipped > 0 ? ` (${mandatorySkipped} pulada(s))` : ''}.`);
  }
  if (sanity.length > 0) {
    parts.push(`${sanity.length} checagem(ns) de sanidade (build, teste).`);
  }
  return parts.join(' ');
}

function summarize(pipelineDocPath) {
  if (!pipelineDocPath || typeof pipelineDocPath !== 'string') {
    return { ...NEUTRAL };
  }

  const gatesPath = path.join(pipelineDocPath, 'gate-decisions.jsonl');
  const statePath = path.join(pipelineDocPath, 'sentinel-state.json');

  const gates = readJsonlSafe(gatesPath);
  const state = readJsonSafe(statePath);

  if (gates.length === 0 && !state) {
    return { ...NEUTRAL };
  }

  return {
    plan: buildPlanSummary(gates, state),
    execution: buildExecutionSummary(gates, state),
    review: buildReviewSummary(gates),
    result: buildResultSummary(gates, state),
  };
}

module.exports = {
  summarize,
};
