'use strict';
// ============================================================
// classify-bridge.test.cjs — G5 Classificador TDD test suite
// Cobertura: 32 testes (T01–T32) conforme spec de domínio.
// Ordem: RED first (escreva antes de implementar), luego GREEN.
// ============================================================
const { test } = require('node:test');
const assert = require('node:assert');
const { classify, VALID_TYPES, VALID_COMPLEXITIES } = require('./classify-bridge.cjs');

// ─── CONSTANTES ESPERADAS ────────────────────────────────────
const EXPECTED_TYPES = ['Bug Fix', 'Feature', 'User Story', 'Audit', 'UX Simulation', 'Spec'];
const EXPECTED_COMPLEXITIES = ['SIMPLES', 'MEDIA', 'COMPLEXA'];

// ─── T01: Smoke test — contrato de shape ─────────────────────
test('T01 — smoke: classify retorna objeto com as 4 chaves', () => {
  const r = classify('fix login', {});
  assert.ok(typeof r === 'object' && r !== null, 'deve ser objeto');
  assert.ok('type' in r, 'deve ter type');
  assert.ok('complexity' in r, 'deve ter complexity');
  assert.ok('source' in r, 'deve ter source');
  assert.ok('notes' in r, 'deve ter notes');
  assert.ok(Array.isArray(r.notes), 'notes deve ser array');
});

// ─── T02: Override total ─────────────────────────────────────
test('T02 — override total: type+complexity ambos do override', () => {
  const r = classify('any text', { type: 'Bug Fix', complexity: 'COMPLEXA' });
  assert.strictEqual(r.type, 'Bug Fix');
  assert.strictEqual(r.complexity, 'COMPLEXA');
  assert.strictEqual(r.source, 'override');
});

// ─── T03: Todos os 6 tipos válidos aceitos no override total ─
test('T03 — override total: todos os 6 tipos aceitos', () => {
  for (const t of EXPECTED_TYPES) {
    const r = classify('qualquer texto', { type: t, complexity: 'SIMPLES' });
    assert.strictEqual(r.type, t, `tipo ${t} deve ser aceito`);
    assert.strictEqual(r.source, 'override');
  }
});

// ─── T04: Todas as 3 complexidades válidas aceitas no override total
test('T04 — override total: todas as 3 complexidades aceitas', () => {
  for (const c of EXPECTED_COMPLEXITIES) {
    const r = classify('qualquer texto', { type: 'Feature', complexity: c });
    assert.strictEqual(r.complexity, c, `complexity ${c} deve ser aceita`);
    assert.strictEqual(r.source, 'override');
  }
});

// ─── T05: Override parcial de tipo ───────────────────────────
test('T05 — override parcial tipo: type do override, complexity da heurística', () => {
  const r = classify('review the module', { type: 'Feature' });
  assert.strictEqual(r.type, 'Feature');
  assert.ok(EXPECTED_COMPLEXITIES.includes(r.complexity), 'complexity deve ser válida');
  assert.strictEqual(r.source, 'heuristic');
});

// ─── T06: Override parcial de complexidade ───────────────────
test('T06 — override parcial complexity: complexity do override, type da heurística', () => {
  const r = classify('fix login', { complexity: 'MEDIA' });
  assert.strictEqual(r.complexity, 'MEDIA');
  assert.ok(EXPECTED_TYPES.includes(r.type), 'type deve ser válido');
  assert.strictEqual(r.source, 'heuristic');
});

// ─── T07: Sem override (omitido = igual a {}) ────────────────
test('T07 — sem override: classify(desc) === classify(desc, {})', () => {
  const withEmpty = classify('fix login', {});
  const withOmit  = classify('fix login');
  assert.strictEqual(withOmit.type, withEmpty.type);
  assert.strictEqual(withOmit.complexity, withEmpty.complexity);
  assert.strictEqual(withOmit.source, withEmpty.source);
});

// ─── T08: Erro — tipo inválido no override ───────────────────
test('T08 — erro: tipo inválido lança erro com o valor e lista os 6 tipos', () => {
  assert.throws(
    () => classify('desc', { type: 'Tarefa' }),
    (err) => {
      assert.ok(err.message.includes('Tarefa'), 'mensagem deve conter o valor inválido');
      for (const t of EXPECTED_TYPES) {
        assert.ok(err.message.includes(t), `mensagem deve listar tipo válido: ${t}`);
      }
      return true;
    },
  );
});

// ─── T09: Erro — complexidade inválida no override ───────────
test('T09 — erro: complexidade inválida lança erro com o valor e lista as 3 complexidades', () => {
  assert.throws(
    () => classify('desc', { type: 'Feature', complexity: 'BAIXA' }),
    (err) => {
      assert.ok(err.message.includes('BAIXA'), 'mensagem deve conter o valor inválido');
      for (const c of EXPECTED_COMPLEXITIES) {
        assert.ok(err.message.includes(c), `mensagem deve listar complexidade válida: ${c}`);
      }
      return true;
    },
  );
});

// ─── T10: Erro — descrição vazia ─────────────────────────────
test('T10 — erro: descrição vazia lança erro', () => {
  assert.throws(() => classify('', {}), /empty|vazia|description/i);
});

// ─── T11: Erro — descrição null ──────────────────────────────
test('T11 — erro: descrição null lança erro', () => {
  assert.throws(() => classify(null), /empty|vazia|description/i);
});

// ─── T12: Erro — descrição undefined ─────────────────────────
test('T12 — erro: descrição undefined lança erro', () => {
  assert.throws(() => classify(undefined), /empty|vazia|description/i);
});

// ─── T13: Heurística de tipo — Bug Fix (fix/bug) ─────────────
test('T13 — heurística: "fix the login bug" → Bug Fix', () => {
  assert.strictEqual(classify('fix the login bug', {}).type, 'Bug Fix');
});

// ─── T14: Heurística de tipo — Bug Fix (broken) ──────────────
test('T14 — heurística: "broken authentication" → Bug Fix', () => {
  assert.strictEqual(classify('broken authentication system', {}).type, 'Bug Fix');
});

// ─── T15: Heurística de tipo — Feature ───────────────────────
test('T15 — heurística: "add a CSV export button" → Feature', () => {
  assert.strictEqual(classify('add a CSV export button', {}).type, 'Feature');
});

// ─── T16: Heurística de tipo — User Story ────────────────────
test('T16 — heurística: "as a user I want to see my orders" → User Story', () => {
  assert.strictEqual(classify('as a user I want to see my orders', {}).type, 'User Story');
});

// ─── T17: Heurística de tipo — Audit ─────────────────────────
test('T17 — heurística: "audit the payment module" → Audit', () => {
  assert.strictEqual(classify('audit the payment module', {}).type, 'Audit');
});

// ─── T18: Heurística de tipo — UX Simulation ─────────────────
test('T18 — heurística: "simulate user journey on checkout" → UX Simulation', () => {
  assert.strictEqual(classify('simulate user journey on checkout', {}).type, 'UX Simulation');
});

// ─── T19: Heurística de tipo — Spec ──────────────────────────
test('T19 — heurística: "valida spec do módulo" → Spec (sem sinal de maior prioridade)', () => {
  assert.strictEqual(classify('valida spec do módulo', {}).type, 'Spec');
});

// ─── T20: Tiebreaker — Error vence Spec ──────────────────────
test('T20 — tiebreaker: "fix the spec document" → Bug Fix (Error > Spec)', () => {
  assert.strictEqual(classify('fix the spec document', {}).type, 'Bug Fix');
});

// ─── T21: Fallback para Feature ──────────────────────────────
test('T21 — fallback: sem sinal reconhecido → Feature + notes com "fallback"', () => {
  const r = classify('xyz123 completamente sem sinal reconhecido', {});
  assert.strictEqual(r.type, 'Feature', 'fallback deve ser Feature');
  const notesText = r.notes.join(' ').toLowerCase();
  assert.ok(notesText.includes('fallback'), 'notes deve mencionar fallback');
});

// ─── T22: Elevação COMPLEXA por 'urgent' ─────────────────────
test('T22 — elevação: "urgent production login issue" → COMPLEXA', () => {
  assert.strictEqual(classify('urgent production login issue', {}).complexity, 'COMPLEXA');
});

// ─── T23: Elevação COMPLEXA por 'production' ─────────────────
test('T23 — elevação: "production incident: payments not processing" → COMPLEXA', () => {
  assert.strictEqual(classify('production incident: payments not processing', {}).complexity, 'COMPLEXA');
});

// ─── T24: Elevação mínimo MEDIA por 'authentication' ─────────
test('T24 — elevação mínimo MEDIA: "add authentication token refresh" → MEDIA ou COMPLEXA', () => {
  const c = classify('add authentication token refresh', {}).complexity;
  assert.ok(c === 'MEDIA' || c === 'COMPLEXA', `complexity deve ser >= MEDIA, obtido: ${c}`);
});

// ─── T25: Elevação mínimo MEDIA por 'security' ───────────────
test('T25 — elevação mínimo MEDIA: "update security headers" → não SIMPLES', () => {
  const c = classify('update security headers', {}).complexity;
  assert.notStrictEqual(c, 'SIMPLES', 'security eleva para pelo menos MEDIA');
});

// ─── T26: Elevação mínimo MEDIA por 'data model' ─────────────
test('T26 — elevação mínimo MEDIA: "change the data model for users" → não SIMPLES', () => {
  const c = classify('change the data model for users', {}).complexity;
  assert.notStrictEqual(c, 'SIMPLES', 'data model eleva para pelo menos MEDIA');
});

// ─── T27: SIMPLES por ausência de sinais de elevação ─────────
test('T27 — SIMPLES: "fix the typo in the 404 error message" → SIMPLES', () => {
  assert.strictEqual(classify('fix the typo in the 404 error message', {}).complexity, 'SIMPLES');
});

// ─── T28: COMPLEXA por sinais de escopo grande ───────────────
test('T28 — COMPLEXA por escopo: "implement feature touching 6 files across multiple domains" → COMPLEXA', () => {
  assert.strictEqual(
    classify('implement feature touching 6 files across multiple domains', {}).complexity,
    'COMPLEXA',
  );
});

// ─── T29: Erro — tipo inválido mesmo com complexity válida ────
test('T29 — erro: tipo inválido "Hotfix" + complexity válida lança erro antes da heurística', () => {
  assert.throws(
    () => classify('desc', { type: 'Hotfix', complexity: 'SIMPLES' }),
    /Hotfix/,
  );
});

// ─── T30: Saída sempre tem as 4 chaves em múltiplos inputs ───
test('T30 — saída estruturada: sempre tem { type, complexity, source, notes } com notes como Array', () => {
  const cases = [
    ['fix login bug', {}],
    ['add new feature', { type: 'Feature' }],
    ['audit module', { complexity: 'MEDIA' }],
    ['any text', { type: 'Spec', complexity: 'SIMPLES' }],
    ['user journey test', undefined],
  ];
  for (const [desc, override] of cases) {
    const r = override !== undefined ? classify(desc, override) : classify(desc);
    assert.ok('type' in r, `deve ter type (${desc})`);
    assert.ok('complexity' in r, `deve ter complexity (${desc})`);
    assert.ok('source' in r, `deve ter source (${desc})`);
    assert.ok('notes' in r, `deve ter notes (${desc})`);
    assert.ok(Array.isArray(r.notes), `notes deve ser array (${desc})`);
    assert.ok(EXPECTED_TYPES.includes(r.type), `type deve ser válido (${desc})`);
    assert.ok(EXPECTED_COMPLEXITIES.includes(r.complexity), `complexity deve ser válida (${desc})`);
    assert.ok(r.source === 'override' || r.source === 'heuristic', `source deve ser override ou heuristic (${desc})`);
  }
});

// ─── T31: Pureza — resultados idênticos em chamadas repetidas ─
test('T31 — pureza: classify chamado 2x com mesmos inputs → resultado idêntico', () => {
  const r1 = classify('add CSV export', {});
  const r2 = classify('add CSV export', {});
  assert.strictEqual(r1.type, r2.type);
  assert.strictEqual(r1.complexity, r2.complexity);
  assert.strictEqual(r1.source, r2.source);
  assert.deepStrictEqual(r1.notes, r2.notes);
});

// ─── T32: Integração — type retornado é compatível com tree-template normalize ─
test('T32 — integração: type retornado por classify() é compatível com normalização do tree-template', () => {
  // Mapeamento: type canônico → chave do TEMPLATES usada pelo templateFor()
  const normalize = (type) => {
    switch (type) {
      case 'Bug Fix': return 'bugfix';
      case 'Feature': return 'feature';
      case 'User Story': return 'user-story';
      case 'UX Simulation': return 'ux';
      case 'Audit': return 'audit';
      case 'Spec': return 'spec';
      default: throw new Error(`tipo desconhecido: ${type}`);
    }
  };
  const { TEMPLATES } = require('./tree-template.cjs');
  const descs = [
    'fix login bug',
    'add new feature',
    'as a user I want to see orders',
    'audit the payment system',
    'simulate user journey on checkout',
    'implementa spec do módulo de pagamento',
  ];
  for (const desc of descs) {
    const r = classify(desc, {});
    // normalize nunca deve lançar (type é sempre um dos 6 válidos)
    let key;
    assert.doesNotThrow(() => { key = normalize(r.type); }, `normalize(${r.type}) não deve lançar`);
    // O TEMPLATES deve ter a chave normalizada
    assert.ok(key in TEMPLATES, `TEMPLATES deve ter a chave '${key}' (tipo '${r.type}')`);
  }
});

// ─── EXPORTS das constantes públicas ─────────────────────────
test('VALID_TYPES exportado corretamente (6 valores)', () => {
  assert.deepStrictEqual([...VALID_TYPES].sort(), [...EXPECTED_TYPES].sort());
});

test('VALID_COMPLEXITIES exportado corretamente (3 valores)', () => {
  assert.deepStrictEqual([...VALID_COMPLEXITIES].sort(), [...EXPECTED_COMPLEXITIES].sort());
});

// ─── BDD Scenarios extra (elevação MEDIA por auth + notes) ───
test('BDD — elevação auth: "add Google auth" com override { type: "Bug Fix" } → complexity MEDIA+ + notes auth', () => {
  const r = classify('add Google auth', { type: 'Bug Fix' });
  assert.strictEqual(r.type, 'Bug Fix');
  const c = r.complexity;
  assert.ok(c === 'MEDIA' || c === 'COMPLEXA', `deve ser >= MEDIA, obtido: ${c}`);
  const notesText = r.notes.join(' ').toLowerCase();
  assert.ok(notesText.includes('auth') || notesText.includes('elev'), 'notes deve mencionar auth/elevação');
});

test('BDD — elevação urgent: "urgent production incident users cannot login" → notas mencionam production/urgent', () => {
  const r = classify('urgent production incident users cannot login', {});
  assert.strictEqual(r.complexity, 'COMPLEXA');
  const notesText = r.notes.join(' ').toLowerCase();
  assert.ok(
    notesText.includes('production') || notesText.includes('urgent') || notesText.includes('elev'),
    'notes deve mencionar a regra de elevação',
  );
});
