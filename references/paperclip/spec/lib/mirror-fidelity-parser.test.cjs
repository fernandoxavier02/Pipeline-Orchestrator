'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseBlocks, parseComplexity } = require('./mirror-fidelity-parser.cjs');

const comments = [
  { body: '### ORCHESTRATOR_DECISION v1\n```yaml\ntask_type: Feature\ncomplexity: COMPLEXA\n```' },
  { body: '### TDD_GREEN v1\nissue: PIP-44' },
  { body: 'texto solto sem bloco' },
  { body: '### PA_DE_CAL v1\nverdict: GO' },
];

test('extrai nomes de bloco (### NOME vN), deduplicado', () => {
  assert.deepStrictEqual(parseBlocks(comments).sort(), ['ORCHESTRATOR_DECISION', 'PA_DE_CAL', 'TDD_GREEN']);
});

test('cabeçalho citado na prosa (não abre o comentário) NÃO conta como bloco emitido', () => {
  // Cabeçalho em início de linha, mas a primeira linha não-vazia é prosa.
  const cited = [{ body: 'Nota: deveria ter emitido o bloco abaixo mas não emitiu:\n### TDD_GREEN v1' }];
  assert.deepStrictEqual(parseBlocks(cited), []);
});

test('só o bloco que abre o comentário conta (cabeçalho posterior em linha própria é ignorado)', () => {
  const c = [{ body: '### TDD_GREEN v1\nissue: PIP-1\n### PA_DE_CAL v1' }];
  assert.deepStrictEqual(parseBlocks(c), ['TDD_GREEN']);
});

test('extrai complexidade do bloco ORCHESTRATOR_DECISION', () => {
  assert.strictEqual(parseComplexity(comments), 'COMPLEXA');
});

test('complexidade ausente → null', () => {
  assert.strictEqual(parseComplexity([{ body: 'nada aqui' }]), null);
});

test('ignora "complexity:" de comentário humano; só lê do bloco ORCHESTRATOR_DECISION', () => {
  const poisoned = [
    { body: 'Revisei. Acho complexity: SIMPLES.' },
    { body: '### ORCHESTRATOR_DECISION v1\ncomplexity: COMPLEXA' },
  ];
  assert.strictEqual(parseComplexity(poisoned), 'COMPLEXA');
});

test('sem bloco ORCHESTRATOR_DECISION → null mesmo que prosa cite complexity', () => {
  assert.strictEqual(parseComplexity([{ body: 'complexity: COMPLEXA citada em prosa' }]), null);
});

// ─── G3-D8-fix: REVIEW-ONLY é excluído da régua (G-RO2 opção 2) ───────────────

test('T-D8-parser-01 — execução review-only real: parseComplexity retorna null (sem ORCHESTRATOR_DECISION)', () => {
  // pipeline-controller.md:207-215: no review-only a Phase 0 é pulada, ORCHESTRATOR_DECISION
  // nunca é emitido. parseComplexity deve retornar null → execução fica indeterminate=true.
  // REVIEW_ONLY_SCORE foi removido (bloco inventado — nenhum agente real o emite).
  const comments = [
    { body: '### ADVERSARIAL_CONSOLIDATED v1\nfindings: [f1,f2]' },
    { body: '### ADVERSARIAL_FINAL_VERDICT v1\nverdict: GO' },
    { body: '### PA_DE_CAL v1\nresult: PASS' },
  ];
  assert.strictEqual(parseComplexity(comments), null, 'review-only sem ORCHESTRATOR_DECISION → null');
});

test('T-D8-parser-02 — ORCHESTRATOR_DECISION ainda detecta complexidade normalmente (regressão D8-fix)', () => {
  // Garante que a remoção do REVIEW_ONLY_SCORE não afetou a detecção normal de complexidade.
  const comments = [
    { body: '### ORCHESTRATOR_DECISION v1\ncomplexity: COMPLEXA' },
  ];
  assert.strictEqual(parseComplexity(comments), 'COMPLEXA');
});

test('T-D8-parser-03 — execução review-only real: blocos detectados são os que agentes reais emitem', () => {
  // Uma execução review-only real emite ADVERSARIAL_CONSOLIDATED, ADVERSARIAL_FINAL_VERDICT,
  // PA_DE_CAL — nunca REVIEW_ONLY_SCORE (bloco removido por ser inventado).
  const comments = [
    { body: '### ADVERSARIAL_CONSOLIDATED v1\nfindings: [...]' },
    { body: '### ADVERSARIAL_FINAL_VERDICT v1\nverdict: GO' },
  ];
  const blocks = parseBlocks(comments);
  assert.ok(!blocks.includes('REVIEW_ONLY_SCORE'), 'REVIEW_ONLY_SCORE não deve aparecer em dados reais');
  assert.ok(blocks.includes('ADVERSARIAL_CONSOLIDATED'), 'ADVERSARIAL_CONSOLIDATED deve estar nos blocos');
  assert.ok(blocks.includes('ADVERSARIAL_FINAL_VERDICT'), 'ADVERSARIAL_FINAL_VERDICT deve estar nos blocos');
});
