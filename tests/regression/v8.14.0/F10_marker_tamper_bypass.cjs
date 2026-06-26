#!/usr/bin/env node
'use strict';

// =============================================================================
// F10 — Batch 3 (adversarial SEC HIGH): pending-arm SELF-DISARM bypass closed
// =============================================================================
// ATDD acceptance = the audit's SEC HIGH: in the pending-arm window an agent could
// overwrite the arm marker with `{}`/garbage (a .pipeline write, which is exempt) to
// make readArmPending return "absent" → fail-OPEN → then do inline work / forge a GO.
// BDD:
//   GIVEN an arm marker overwritten with garbage (self-disarm attempt)
//   WHEN  the arm-gate reads it
//   THEN  it is DETECTED as tampering and the window stays GOVERNED (fail-CLOSED for
//         substantive work) — while a WELL-FORMED EXPIRED marker remains the legitimate
//         fail-OPEN recovery path (so operators can still clear a real deadlock).
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const armGate = require(path.join(root, '.claude', 'hooks', 'pipeline-arm-gate.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }

function withMarker(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'f10-'));
  fs.mkdirSync(path.join(dir, '.pipeline'), { recursive: true });
  if (content !== undefined) fs.writeFileSync(path.join(dir, '.pipeline', 'pipeline-arm-pending.json'), content);
  return dir;
}
const cleanup = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

// ---- readArmPending: classify the marker ------------------------------------
let d;
d = withMarker('{}'); // self-disarm via empty object (no requested_at)
check('marcador `{}` (auto-desarme) → tampered', armGate.readArmPending(d).tampered === true && armGate.readArmPending(d).armed === false); cleanup(d);

d = withMarker('this is not json at all'); // garbage
check('lixo nao-JSON → tampered', armGate.readArmPending(d).tampered === true); cleanup(d);

d = withMarker(JSON.stringify({ requested_at: 'not-a-date', workflow: 'x' })); // invalid timestamp
check('timestamp invalido → tampered', armGate.readArmPending(d).tampered === true); cleanup(d);

d = withMarker(JSON.stringify({ requested_at: '2020-01-01T00:00:00.000Z', workflow: 'FULL/Bug Fix' })); // well-formed EXPIRED
const exp = armGate.readArmPending(d);
check('marcador BEM-FORMADO EXPIRADO → recuperacao legitima (armed=false, tampered=false)', exp.armed === false && exp.tampered === false); cleanup(d);

d = withMarker(JSON.stringify({ requested_at: new Date().toISOString(), workflow: 'FULL/Bug Fix' })); // valid fresh
const ok = armGate.readArmPending(d);
check('marcador valido nao-expirado → armado', ok.armed === true && ok.tampered === false && ok.workflow === 'FULL/Bug Fix'); cleanup(d);

d = withMarker(undefined); // absent
const abs = armGate.readArmPending(d);
check('marcador AUSENTE → nao governado (armed=false, tampered=false)', abs.armed === false && abs.tampered === false); cleanup(d);

// ---- decideArmGate: tampered window fails CLOSED for work, open for carve-outs
const TAMP = { armPending: true, markerTampered: true, runActive: false, observedActive: false, corrupt: false, enforce: 'deny' };
check('adulterado + Edit (producao) → BLOCK MARKER_TAMPERED (bypass fechado)',
  (() => { const r = armGate.decideArmGate({ ...TAMP, toolName: 'Edit' }); return r.decision === 'block' && r.invariant_id === 'MARKER_TAMPERED'; })());
check('adulterado + Bash → BLOCK (trabalho substantivo travado)',
  armGate.decideArmGate({ ...TAMP, toolName: 'Bash' }).decision === 'block');
check('adulterado + Read → allow (carve-out de leitura preservado)',
  armGate.decideArmGate({ ...TAMP, toolName: 'Read' }).decision === 'allow');
check('adulterado + escrita .pipeline (pipelineAligned) → allow (recuperacao possivel)',
  armGate.decideArmGate({ ...TAMP, toolName: 'Write', pipelineAligned: true }).decision === 'allow');
check('escape operador: PIPELINE_ARM_ENFORCEMENT=warn → adulterado allow+warn',
  armGate.decideArmGate({ ...TAMP, toolName: 'Edit', enforce: 'warn' }).decision === 'allow');

// SEC-3 correction: the deny reason points to the SIGNED re-arm path and must NOT leak
// the self-write recipe (it was an attack manual: "crie active-run.json/pipeline_active:true").
const tReason = armGate.decideArmGate({ ...TAMP, toolName: 'Edit' }).reason || '';
check('reason aponta re-arme assinado', /re-invoque o comando do pipeline/i.test(tReason));
check('reason NAO vaza receita (sem active-run / pipeline_active / sentinel-state)',
  !/active-run|pipeline_active|sentinel-state/i.test(tReason));

// SEC-2 correction: a tampered marker is consulted BEFORE the runActive branch — an agent
// that forges a FAKE active run state cannot route around the tamper deny.
check('SEC-2: adulterado + run-ativo FORJADO + Edit → ainda BLOCK MARKER_TAMPERED',
  (() => { const r = armGate.decideArmGate({ ...TAMP, runActive: true, observedActive: true, toolName: 'Edit' }); return r.decision === 'block' && r.invariant_id === 'MARKER_TAMPERED'; })());

// SEC-1 correction: a tool write to the ARM MARKER itself is NOT pipelineAligned (so it
// can't be used to self-disarm), while a write to OTHER .pipeline files still is.
const dd = withMarker(undefined);
const markerFp = path.join(dd, '.pipeline', 'pipeline-arm-pending.json');
const otherFp = path.join(dd, '.pipeline', 'docs', 'run', 'sentinel-state.json');
check('SEC-1: escrita NO marcador NAO é isenta (nao auto-desarma)',
  armGate.isPipelineDocWrite({ tool_input: { file_path: markerFp } }, dd) === false);
check('SEC-1: escrita em OUTRO arquivo .pipeline continua isenta',
  armGate.isPipelineDocWrite({ tool_input: { file_path: otherFp } }, dd) === true);
cleanup(dd);

// SEC-4 correction: a FULL-subprocess test of the hook I/O path for a tampered marker
// with NO corrupt state, so MARKER_TAMPERED (not CORRUPT_STATE) is the surfacing invariant.
{
  const { spawnSync } = require('node:child_process');
  const hookPath = path.join(root, '.claude', 'hooks', 'pipeline-arm-gate.cjs');
  const d2 = withMarker('{"foo":"bar"}'); // present but no requested_at → tampered; NO sentinel-state seeded
  const payload = { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(d2, 'src', 'app.js') }, cwd: d2 };
  const r = spawnSync(process.execPath, [hookPath], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, PIPELINE_ARM_ENFORCEMENT: 'deny' } });
  check('SEC-4 [subprocess] adulterado SEM corrupt → hook emite MARKER_TAMPERED', r.status === 0 && /MARKER_TAMPERED/.test(String(r.stdout || '')));
  cleanup(d2);
}

console.log(failures === 0 ? '\n>>> F10 PASS' : `\n>>> F10 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
