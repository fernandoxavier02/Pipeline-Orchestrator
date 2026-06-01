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

// ─── G3-D8: parseComplexity detecta REVIEW_ONLY_SCORE ─────────────────────────

test('T-D8-parser-01 — comentário abrindo com REVIEW_ONLY_SCORE retorna REVIEW_ONLY', () => {
  // RO-N0 emite REVIEW_ONLY_SCORE v1; parseComplexity deve retornar 'REVIEW_ONLY'
  // sem precisar de ORCHESTRATOR_DECISION no corpo do bloco.
  const comments = [{ body: '### REVIEW_ONLY_SCORE v1\nescopo: diff HEAD~1' }];
  assert.strictEqual(parseComplexity(comments), 'REVIEW_ONLY');
});

test('T-D8-parser-02 — REVIEW_ONLY_SCORE tem precedência sobre ORCHESTRATOR_DECISION (ordem de varredura)', () => {
  // Se ambos aparecem (cenário hipotético), REVIEW_ONLY_SCORE é o primeiro a ser varrido
  // → retorna 'REVIEW_ONLY' se vier antes na lista de comentários.
  const commentsROFirst = [
    { body: '### REVIEW_ONLY_SCORE v1\nescopo: diff' },
    { body: '### ORCHESTRATOR_DECISION v1\ncomplexity: COMPLEXA' },
  ];
  assert.strictEqual(parseComplexity(commentsROFirst), 'REVIEW_ONLY');
});

test('T-D8-parser-03 — comentário real de review-only: blocos detectados incluem REVIEW_ONLY_SCORE', () => {
  // Verifica que parseBlocks também detecta REVIEW_ONLY_SCORE na lista de blocos.
  const comments = [
    { body: '### REVIEW_ONLY_SCORE v1\nescopo: diff HEAD~1' },
    { body: '### ADVERSARIAL_CONSOLIDATED v1\nfindings: [...]' },
    { body: '### ADVERSARIAL_FINAL_VERDICT v1\nverdict: GO' },
  ];
  const blocks = parseBlocks(comments);
  assert.ok(blocks.includes('REVIEW_ONLY_SCORE'), 'REVIEW_ONLY_SCORE deve estar nos blocos');
  assert.ok(blocks.includes('ADVERSARIAL_CONSOLIDATED'), 'ADVERSARIAL_CONSOLIDATED deve estar nos blocos');
  assert.ok(blocks.includes('ADVERSARIAL_FINAL_VERDICT'), 'ADVERSARIAL_FINAL_VERDICT deve estar nos blocos');
});
