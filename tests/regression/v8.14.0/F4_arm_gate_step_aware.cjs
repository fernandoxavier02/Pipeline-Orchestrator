#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 — Lote 3 wiring: pipeline-arm-gate consults run-step-guard on an ACTIVE run
// =============================================================================
// The OLD `runActive → allow` blanket is replaced by the dispatcher-not-worker
// rule, but ONLY for a GENUINELY observed-active run (observedActive). Unobservable
// runs and the legacy non-observed ctx stay fail-open (ARCH-7). Escape via
// PIPELINE_CHAIN_ENFORCEMENT=warn|off.
// =============================================================================

const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const { decideArmGate } = require(path.join(root, '.claude', 'hooks', 'pipeline-arm-gate.cjs'));

let failures = 0;
function check(label, cond) { if (!cond) failures++; console.log(`${cond ? 'OK  ' : 'FAIL'} | ${label}`); }

const ACTIVE = { armPending: true, runActive: true, observedActive: true, corrupt: false };
delete process.env.PIPELINE_CHAIN_ENFORCEMENT; // default = deny

// Inline production mutation on an observed-active run, no window → BLOCK + rehydration.
const b = decideArmGate({ ...ACTIVE, toolName: 'Edit', execWindowOpen: false, expectedStep: 'execute' });
check('Edit inline em run ativo, sem janela → block', b.decision === 'block');
check('block = INLINE_WORK_BLOCKED', b.invariant_id === 'INLINE_WORK_BLOCKED');
check('REIDRATACAO presente no reason', typeof b.reason === 'string' && /REIDRATA/i.test(b.reason));

// Inside an open exec-window → ALLOW (sanctioned executor work).
check('Edit dentro de janela → allow', decideArmGate({ ...ACTIVE, toolName: 'Edit', execWindowOpen: true }).decision === 'allow');
// Read / pipeline-aligned always pass mid-run.
check('Read em run ativo → allow', decideArmGate({ ...ACTIVE, toolName: 'Read', execWindowOpen: false }).decision === 'allow');
check('pipelineAligned (.pipeline write) → allow', decideArmGate({ ...ACTIVE, toolName: 'Write', pipelineAligned: true, execWindowOpen: false }).decision === 'allow');

// ARCH-7: unobservable run (runActive via fail-open, observedActive=false) → ALLOW.
check('run NAO-observavel + Edit → allow (ARCH-7 fail-open)', decideArmGate({ armPending: true, runActive: true, observedActive: false, toolName: 'Edit', execWindowOpen: false }).decision === 'allow');
// Legacy ctx without observedActive → allow (no double-gating contract preserved).
check('ctx legado sem observedActive → allow', decideArmGate({ armPending: true, runActive: true, toolName: 'Edit' }).decision === 'allow');

// Armed-but-NOT-active (the original NOT_ARMED path) is unchanged.
const na = decideArmGate({ armPending: true, runActive: false, observedActive: false, corrupt: false, toolName: 'Edit', enforce: 'deny' });
check('armado-nao-ativo + Edit → block NOT_ARMED (inalterado)', na.decision === 'block' && na.invariant_id === 'NOT_ARMED');

// Escapes.
process.env.PIPELINE_CHAIN_ENFORCEMENT = 'warn';
const w = decideArmGate({ ...ACTIVE, toolName: 'Edit', execWindowOpen: false });
check('CHAIN=warn → allow + warn', w.decision === 'allow' && w.warn === true);
process.env.PIPELINE_CHAIN_ENFORCEMENT = 'off';
check('CHAIN=off → allow', decideArmGate({ ...ACTIVE, toolName: 'Edit', execWindowOpen: false }).decision === 'allow');
delete process.env.PIPELINE_CHAIN_ENFORCEMENT;

console.log(failures === 0 ? '\n>>> F4 PASS' : `\n>>> F4 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
