// =============================================================================
// F2 — Session isolation: arm-pending marker deve filtrar por session_id (v8.18.0)
// =============================================================================
// Bug: writeArmPending não grava session_id no marker. readArmPending não filtra
// por sessão. Terminal B no MESMO projeto vê o marker do Terminal A e fica bloqueado.
// Fix: incluir session_id na escrita e filtrar na leitura.
// =============================================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const arm = require('../../../lib/pipeline-arm.cjs');
const armPending = require('../../../lib/arm-pending.cjs');

const PIPELINE_PROMPT = '/pipeline-orchestrator:pipeline fix the login bug';
const SESSION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FIXED_ISO = new Date().toISOString();

function mkTmp(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `f2-${prefix}-`));
  fs.mkdirSync(path.join(tmp, '.pipeline'), { recursive: true });
  return tmp;
}

// ===== Escrita: session_id deve estar no marker =====

test('F2-W1: writeArmPending inclui session_id no marker quando fornecido', () => {
  const tmp = mkTmp('w1');
  const marker = arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO, SESSION_A);
  assert.ok(marker, 'marker deve ser retornado');
  assert.strictEqual(marker.session_id, SESSION_A, 'session_id deve estar no marker');
  fs.rmSync(tmp, { recursive: true });
});

test('F2-W2: writeArmPending funciona sem session_id (backward compat)', () => {
  const tmp = mkTmp('w2');
  const marker = arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO);
  assert.ok(marker, 'marker deve ser retornado');
  // session_id ausente ou undefined — ambos aceitáveis
  fs.rmSync(tmp, { recursive: true });
});

// ===== Leitura: readArmPending deve filtrar por session_id =====

test('F2-R1: readArmPending com session_id=MESMA retorna armed:true', () => {
  const tmp = mkTmp('r1');
  arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO, SESSION_A);
  const result = armPending.readArmPending(tmp, SESSION_A);
  assert.strictEqual(result.armed, true, 'mesma sessão → armed');
  fs.rmSync(tmp, { recursive: true });
});

test('F2-R2: readArmPending com session_id=DIFERENTE retorna armed:false', () => {
  const tmp = mkTmp('r2');
  arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO, SESSION_A);
  const result = armPending.readArmPending(tmp, SESSION_B);
  assert.strictEqual(result.armed, false, 'sessão diferente → not armed');
  assert.strictEqual(result.tampered, false, 'não é tampering, é filtro de sessão');
  fs.rmSync(tmp, { recursive: true });
});

test('F2-R3: readArmPending sem session_id (legado) ignora filtro — armed:true', () => {
  const tmp = mkTmp('r3');
  arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO, SESSION_A);
  const result = armPending.readArmPending(tmp);
  assert.strictEqual(result.armed, true, 'sem filtro → armed (backward compat)');
  fs.rmSync(tmp, { recursive: true });
});

test('F2-R4: readArmPending com marker legado (sem session_id) ignora filtro — armed:true', () => {
  const tmp = mkTmp('r4');
  // Escreve marker SEM session_id (simula marker antigo)
  arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO);
  const result = armPending.readArmPending(tmp, SESSION_B);
  // Marker legado sem session_id → qualquer sessão vê como armed (backward compat)
  assert.strictEqual(result.armed, true, 'marker legado → armed para qualquer sessão');
  fs.rmSync(tmp, { recursive: true });
});

// ===== readArmPendingMarker (narrowed shape) =====

test('F2-M1: readArmPendingMarker com sessão=MESMA retorna marker', () => {
  const tmp = mkTmp('m1');
  arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO, SESSION_A);
  const result = armPending.readArmPendingMarker(tmp, SESSION_A);
  assert.ok(result, 'mesma sessão → marker retornado');
  assert.ok(result.requested_at, 'deve ter requested_at');
  fs.rmSync(tmp, { recursive: true });
});

test('F2-M2: readArmPendingMarker com sessão=DIFERENTE retorna null', () => {
  const tmp = mkTmp('m2');
  arm.writeArmPending(tmp, PIPELINE_PROMPT, FIXED_ISO, SESSION_A);
  const result = armPending.readArmPendingMarker(tmp, SESSION_B);
  assert.strictEqual(result, null, 'sessão diferente → null');
  fs.rmSync(tmp, { recursive: true });
});
