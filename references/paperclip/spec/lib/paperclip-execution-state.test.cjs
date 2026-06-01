'use strict';
// Testes da lib de executionState da Fase A (T-A2-02).
// Runner nativo: `node --test` (zero dependências externas, conforme DL-006).
// Substrato: comentários estruturados (pivô aprovado pós-spike T-A2-01).

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const {
  createExecutionState,
  computeGateHash,
  orderChain,
  verifyChain,
  isClockSkewAcceptable,
  GENESIS,
  COMMENT_PREFIX,
} = require('./paperclip-execution-state.cjs');

// ---- Transport fake em memória (mimetiza o Paperclip) ----
// IMPORTANTE: getComments devolve NEWEST-FIRST, como o Paperclip real.
function fakeTransport() {
  const store = new Map(); // issueId -> [{body, createdAt}]
  let seq = 0;
  return {
    store,
    async getComments(issueId) {
      const arr = store.get(issueId) || [];
      // newest-first
      return [...arr].sort((a, b) => b.createdAt - a.createdAt).map((c) => ({ body: c.body }));
    },
    async postComment(issueId, body) {
      if (!store.has(issueId)) store.set(issueId, []);
      store.get(issueId).push({ body, createdAt: ++seq });
      return { id: 'c' + seq };
    },
  };
}

const FIXED_NOW = Date.parse('2026-05-24T12:00:00Z');
function makeES(transport) {
  return createExecutionState({
    companyId: 'test-co',
    transport,
    now: () => FIXED_NOW,
    clockSkewToleranceSeconds: 60,
  });
}

function gd(extra = {}) {
  return {
    gate_name: 'INFO_GATE_BLOCKED',
    hardness: 'HARD',
    decision: 'APPROVED',
    evidence: 'teste',
    decided_by: 'board',
    timestamp: new Date(FIXED_NOW).toISOString(),
    ...extra,
  };
}

// ---- Helpers puros ----

test('computeGateHash é determinístico e independe da ordem das chaves', () => {
  const a = computeGateHash(gd(), GENESIS);
  const b = computeGateHash(gd(), GENESIS);
  assert.strictEqual(a, b, 'mesma entrada → mesmo hash');
  assert.match(a, /^sha256:[0-9a-f]{64}$/, 'formato sha256:hex');
  // bate com cálculo manual de referência (DL-006)
  const core = { decided_by: 'board', decision: 'APPROVED', evidence: 'teste', gate_name: 'INFO_GATE_BLOCKED', hardness: 'HARD', timestamp: new Date(FIXED_NOW).toISOString() };
  const manual = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(core) + GENESIS).digest('hex');
  assert.strictEqual(a, manual, 'igual ao cálculo de referência');
});

test('computeGateHash muda quando o predecessor muda (encadeamento real)', () => {
  const h1 = computeGateHash(gd(), GENESIS);
  const h2 = computeGateHash(gd(), h1);
  assert.notStrictEqual(h1, h2, 'predecessor diferente → hash diferente');
});

test('isClockSkewAcceptable rejeita futuro além da tolerância e aceita dentro', () => {
  const t90 = new Date(FIXED_NOW + 90_000).toISOString();
  const t30 = new Date(FIXED_NOW + 30_000).toISOString();
  const past = new Date(FIXED_NOW - 10_000).toISOString();
  assert.strictEqual(isClockSkewAcceptable(t90, FIXED_NOW, 60), false, '+90s rejeita');
  assert.strictEqual(isClockSkewAcceptable(t30, FIXED_NOW, 60), true, '+30s aceita');
  assert.strictEqual(isClockSkewAcceptable(past, FIXED_NOW, 60), true, 'passado aceita');
});

// ---- initState ----

test('initState cria o registro inicial e é idempotente', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  await es.initState('ISS-1', 'bugfix-light');
  const after1 = (t.store.get('ISS-1') || []).length;
  assert.strictEqual(after1, 1, 'criou 1 comentário de init');
  await es.initState('ISS-1', 'bugfix-light');
  const after2 = (t.store.get('ISS-1') || []).length;
  assert.strictEqual(after2, 1, 'segunda chamada NÃO duplica');
  const state = await es.readState('ISS-1');
  assert.strictEqual(state.pipeline.variant, 'bugfix-light');
  assert.strictEqual(state.schema_version, 'fase-a-v1.0');
});

// ---- writeGateDecision ----

test('writeGateDecision grava e readState devolve igual (round-trip)', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  await es.initState('ISS-2', 'bugfix-light');
  const written = await es.writeGateDecision('ISS-2', gd());
  const state = await es.readState('ISS-2');
  assert.strictEqual(state.pipeline.gate_decisions.length, 1);
  const back = state.pipeline.gate_decisions[0];
  assert.strictEqual(back.gate_name, 'INFO_GATE_BLOCKED');
  assert.strictEqual(back.evidence, 'teste');
  assert.strictEqual(back.hash, written.hash, 'hash preservado no round-trip');
  assert.strictEqual(back.previous_hash, GENESIS, 'primeira entry aponta pra GENESIS');
});

test('writeGateDecision encadeia: segunda entry aponta pra primeira', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  await es.initState('ISS-3', 'bugfix-light');
  const e1 = await es.writeGateDecision('ISS-3', gd({ gate_name: 'INFO_GATE_BLOCKED' }));
  const e2 = await es.writeGateDecision('ISS-3', gd({ gate_name: 'SSOT_CONFLICT' }));
  assert.strictEqual(e2.previous_hash, e1.hash, 'e2.previous_hash == e1.hash');
  const state = await es.readState('ISS-3');
  assert.deepStrictEqual(
    state.pipeline.gate_decisions.map((e) => e.gate_name),
    ['INFO_GATE_BLOCKED', 'SSOT_CONFLICT'],
    'ordem correta apesar do transport newest-first',
  );
});

test('writeGateDecision REJEITA carimbo de tempo do futuro (clock-skew)', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  await es.initState('ISS-4', 'bugfix-light');
  const future = gd({ timestamp: new Date(FIXED_NOW + 90_000).toISOString() });
  await assert.rejects(() => es.writeGateDecision('ISS-4', future), /clock.?skew|futuro|skew/i);
  // nada foi gravado além do init
  assert.strictEqual((t.store.get('ISS-4') || []).length, 1);
});

test('writeGateDecision REJEITA campo obrigatório faltando', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  await es.initState('ISS-5', 'bugfix-light');
  const bad = gd();
  delete bad.gate_name;
  await assert.rejects(() => es.writeGateDecision('ISS-5', bad), /gate_name|obrigat/i);
});

// ---- readState ----

test('readState em issue sem estado devolve vazio sem quebrar', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  const state = await es.readState('VAZIA');
  assert.strictEqual(state.exists, false);
  assert.deepStrictEqual(state.pipeline.gate_decisions, []);
  assert.strictEqual(state.pipeline.hash_chain_head, null);
});

// ---- verifyHashChain ----

test('verifyHashChain confirma corrente íntegra', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  await es.initState('ISS-6', 'bugfix-light');
  await es.writeGateDecision('ISS-6', gd({ gate_name: 'INFO_GATE_BLOCKED' }));
  await es.writeGateDecision('ISS-6', gd({ gate_name: 'SSOT_CONFLICT' }));
  const res = await es.verifyHashChain('ISS-6');
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.length, 2);
});

test('verifyHashChain detecta adulteração (hash trocado)', async () => {
  const t = fakeTransport();
  const es = makeES(t);
  await es.initState('ISS-7', 'bugfix-light');
  await es.writeGateDecision('ISS-7', gd());
  // adultera o comentário gravado: muda a evidence sem recalcular o hash
  const arr = t.store.get('ISS-7');
  const idx = arr.findIndex((c) => c.body.startsWith(COMMENT_PREFIX));
  const entry = JSON.parse(arr[idx].body.slice(COMMENT_PREFIX.length));
  entry.evidence = 'ADULTERADO';
  arr[idx].body = COMMENT_PREFIX + JSON.stringify(entry);
  const res = await es.verifyHashChain('ISS-7');
  assert.strictEqual(res.valid, false, 'adulteração detectada');
});

test('verifyHashChain detecta elo partido (previous_hash órfão)', () => {
  // helper puro: corrente com elo quebrado
  const e1 = { gate_name: 'A', hardness: 'HARD', decision: 'APPROVED', evidence: 'x', decided_by: 'board', timestamp: new Date(FIXED_NOW).toISOString(), previous_hash: GENESIS };
  e1.hash = computeGateHash(e1, GENESIS);
  const e2 = { gate_name: 'B', hardness: 'HARD', decision: 'APPROVED', evidence: 'y', decided_by: 'board', timestamp: new Date(FIXED_NOW).toISOString(), previous_hash: 'sha256:naoexiste' };
  e2.hash = computeGateHash(e2, 'sha256:naoexiste');
  const res = verifyChain([e1, e2]);
  assert.strictEqual(res.valid, false, 'elo partido detectado');
});

test('orderChain reordena entradas embaralhadas seguindo previous_hash', () => {
  const e1 = { gate_name: 'A', hardness: 'HARD', decision: 'APPROVED', evidence: 'x', decided_by: 'board', timestamp: new Date(FIXED_NOW).toISOString(), previous_hash: GENESIS };
  e1.hash = computeGateHash(e1, GENESIS);
  const e2 = { gate_name: 'B', hardness: 'HARD', decision: 'APPROVED', evidence: 'y', decided_by: 'board', timestamp: new Date(FIXED_NOW).toISOString(), previous_hash: e1.hash };
  e2.hash = computeGateHash(e2, e1.hash);
  const ordered = orderChain([e2, e1]); // embaralhado
  assert.deepStrictEqual(ordered.map((e) => e.gate_name), ['A', 'B']);
});
