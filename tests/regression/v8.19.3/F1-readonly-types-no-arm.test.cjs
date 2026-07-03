#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 — read-only run TYPES (Audit, UX Simulation) must NOT arm the pipeline
// =============================================================================
// Root cause of the recurring interview-coach deadlock (2026-06-30 / 07-01): a
// natural-language "faça revisão adversarial / auditoria / análise" is classified
// FULL/Audit (mode FULL, type Audit). writeArmPending's skip only looked at the
// MODE (REVIEW-ONLY/DIAGNOSTIC), so it armed a phantom run on read-only work — the
// run never opened an exec window, hit INLINE_WORK_BLOCKED, aborted, and left an
// orphan marker that blocked all later work with PIPELINE_NOT_ARMED (a live brick).
//
// Fix: writeArmPending must ALSO skip arming for the read-only TYPES. This proves
// it; the CONTROL proves a mutating Bug Fix still arms (skip not over-broadened).
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const arm = require(path.join(root, 'lib', 'pipeline-arm.cjs'));
const classifier = require(path.join(root, 'lib', 'pipeline-workflow-classifier.cjs'));

let failures = 0;
function check(label, got, exp) {
  const ok = got === exp;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} | exp=${exp} got=${got} | ${label}`);
}

// Arm into a throwaway project dir; report the return value AND whether a marker
// file actually landed on disk (the two things that matter for the deadlock).
function armIn(prompt) {
  const td = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-ro-'));
  let marker = undefined;
  try { marker = arm.writeArmPending(td, prompt); } catch (_) { marker = undefined; }
  const fileExists = fs.existsSync(arm.markerPath(td));
  try { fs.rmSync(td, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
  return { marker, fileExists };
}

const REVIEW = '/pipeline-orchestrator:pipeline faça revisão adversarial do que foi implementado';
const UXSIM  = '/pipeline-orchestrator:pipeline avalie a usabilidade das telas de login';
const BUGFIX = '/pipeline-orchestrator:pipeline corrija o login quebrado';

// ---- document the cause: how each request is classified ---------------------
const wfR = classifier.classifyWorkflow(REVIEW);
check('review classifies mode=FULL', wfR.mode, 'FULL');
check('review classifies type=Audit', wfR.type, 'Audit');
const wfU = classifier.classifyWorkflow(UXSIM);
check('ux classifies type=UX Simulation', wfU.type, 'UX Simulation');

// ---- 1. review (Audit) must NOT arm ----------------------------------------
const r = armIn(REVIEW);
check('review writeArmPending returns null', r.marker, null);
check('review writes NO marker file', r.fileExists, false);

// ---- 2. UX simulation must NOT arm -----------------------------------------
const u = armIn(UXSIM);
check('ux-sim writeArmPending returns null', u.marker, null);
check('ux-sim writes NO marker file', u.fileExists, false);

// ---- 3. CONTROL: a mutating Bug Fix STILL arms -----------------------------
const b = armIn(BUGFIX);
check('bugfix arms (marker returned)', !!b.marker, true);
check('bugfix writes the marker file', b.fileExists, true);
check('bugfix marker type = Bug Fix', b.marker && b.marker.type, 'Bug Fix');

console.log(failures === 0 ? '\n>>> F1 PASS' : `\n>>> F1 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
