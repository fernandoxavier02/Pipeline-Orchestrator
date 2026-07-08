#!/usr/bin/env node
'use strict';

// =============================================================================
// F5 (v8.22.0) — step-ledger-gate: CARIMBO 'tdd' POR EVIDÊNCIA (T5)
// =============================================================================
// DEFECT (live run 2026-07-04, protocol-events linha 19): os testes RED
// congelados de uma sessão anterior satisfaziam o CONTEÚDO de TDD_APPROVAL
// (registrado em gate-decisions.jsonl), mas não carimbavam o passo 'tdd' no
// step_ledger — e o spawn do executor era negado por ordem ("step 'execute'
// requires 'tdd' stamped first"), forçando re-rodar uma fase já cumprida.
//
// FIX UNDER TEST: decide() do step-ledger-gate concede o passo por evidência —
// quando 'tdd' NÃO está no ledger mas gate-decisions.jsonl do run tem
// TDD_APPROVAL com decision APPROVED|CONFIRMED, a decisão roda com 'tdd'
// presente, o carimbo é persistido (recordStep, idempotente, assinado) e a
// origem fica rastreada em protocol-events.jsonl (STEP_STAMP_BY_EVIDENCE —
// evento AUDIT, NÃO é gate novo). Sem evidência: nega exatamente como antes.
//
// BDD scenarios:
//   V1 [repro]     ledger sem 'tdd' + TDD_APPROVAL APPROVED → spawn executor ALLOW
//                  + 'tdd' persistido no estado + rastro no protocol-events
//   V2 [sem prova] ledger sem 'tdd', sem TDD_APPROVAL → BLOCK (igual hoje)
//   V3 [rejeitado] TDD_APPROVAL decision=REJECTED → BLOCK (evidência não vale)
//   V4 [já tinha]  'tdd' já carimbado + evidência → ALLOW sem duplicar carimbo
//   V5 [ordem]     evidência presente mas passo anterior faltando (plan) → BLOCK
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'f5-tdd-stamp-by-evidence-stable-secret-01234567';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const gate = require(path.join(ROOT, '.claude/hooks/step-ledger-gate.cjs'));

const EXECUTOR = 'pipeline-orchestrator:executor:executor-controller';

function setupRun(opts) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f5-'));
  const runDir = path.join(tmp, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-07-04-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 1, run_id: '2026-07-04-run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '2',
    orchestrator_decision: { type: 'Feature', complexity: 'MEDIA' },
    step_ledger: opts.ledger,
  };
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
  if (opts.gateLines) {
    fs.writeFileSync(path.join(runDir, 'gate-decisions.jsonl'),
      opts.gateLines.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }
  return { tmp, runDir };
}

const tddApproval = (decision) => ({
  gate: 'TDD_APPROVAL', hardness: 'HARD', phase: '2b', decision,
  decided_by: 'quality-gate-router', timestamp: new Date().toISOString(),
  detail: '12 cenarios ATDD aprovados (testes RED congelados reusados)',
});

const spawnPayload = (tmp) => ({ tool_name: 'Agent', tool_input: { subagent_type: EXECUTOR, prompt: 'Batch 1' }, cwd: tmp });

const LEDGER_PRE_TDD = ['classify', 'info-gate', 'proposal', 'plan'];

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F5 v8.22.0 — carimbo tdd por evidência (T5) ===');

// V1 — the repro, now allowed + persisted + traced.
record('V1 [repro] TDD_APPROVAL APPROVED + tdd ausente → executor ALLOW, carimbo persistido, rastro gravado', () => {
  const { tmp, runDir } = setupRun({ ledger: LEDGER_PRE_TDD, gateLines: [tddApproval('APPROVED')] });
  const r = gate.decide(spawnPayload(tmp));
  assert.equal(r.decision, 'allow', `expected allow, got ${r.decision}${r.reason ? ' — ' + String(r.reason).slice(0, 120) : ''}`);
  const st = JSON.parse(fs.readFileSync(path.join(runDir, 'sentinel-state.json'), 'utf8'));
  assert.ok(Array.isArray(st.step_ledger) && st.step_ledger.includes('tdd'), "the granted 'tdd' stamp must be persisted");
  const ev = fs.readFileSync(path.join(runDir, 'protocol-events.jsonl'), 'utf8');
  assert.match(ev, /STEP_STAMP_BY_EVIDENCE/, 'origin trace must be appended to protocol-events');
  assert.match(ev, /TDD_APPROVAL/, 'trace must name the evidence source');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// V2 — no evidence: deny exactly like today.
record('V2 [sem prova] sem TDD_APPROVAL → executor BLOCK (comportamento atual)', () => {
  const { tmp } = setupRun({ ledger: LEDGER_PRE_TDD });
  const r = gate.decide(spawnPayload(tmp));
  assert.equal(r.decision, 'block', `expected block, got ${r.decision}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// V3 — a REJECTED approval is not evidence.
record('V3 [rejeitado] TDD_APPROVAL REJECTED → executor BLOCK', () => {
  const { tmp } = setupRun({ ledger: LEDGER_PRE_TDD, gateLines: [tddApproval('REJECTED')] });
  const r = gate.decide(spawnPayload(tmp));
  assert.equal(r.decision, 'block', `expected block, got ${r.decision}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// V4 — already stamped: allow, and the ledger keeps a SINGLE 'tdd'.
record('V4 [já tinha] tdd carimbado + evidência → ALLOW sem duplicar', () => {
  const { tmp, runDir } = setupRun({ ledger: [...LEDGER_PRE_TDD, 'tdd'], gateLines: [tddApproval('APPROVED')] });
  const r = gate.decide(spawnPayload(tmp));
  assert.equal(r.decision, 'allow', `expected allow, got ${r.decision}${r.reason ? ' — ' + String(r.reason).slice(0, 120) : ''}`);
  const st = JSON.parse(fs.readFileSync(path.join(runDir, 'sentinel-state.json'), 'utf8'));
  assert.equal(st.step_ledger.filter((s) => s === 'tdd').length, 1, "'tdd' must not be duplicated");
  fs.rmSync(tmp, { recursive: true, force: true });
});

// V5 — evidence only covers 'tdd'; an EARLIER missing step still blocks.
record('V5 [ordem] evidência de tdd mas passo plan faltando → executor BLOCK', () => {
  const { tmp } = setupRun({ ledger: ['classify', 'info-gate', 'proposal'], gateLines: [tddApproval('APPROVED')] });
  const r = gate.decide(spawnPayload(tmp));
  assert.equal(r.decision, 'block', `expected block (missing 'plan'), got ${r.decision}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
