#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 — /pipeline-orchestrator:self-eval must NOT arm a governed run
// =============================================================================
// The self-eval command runs the human-gated fix loop AFTER a run is terminal.
// If it armed a NEW run, the arm-gate/plan-gate/step-ledger-gate would block its
// own read/ask/edit work. It must be a meta-command (like help/setup-paperclip).
// This pins it so a future edit to GOVERNED_INVOCATION cannot accidentally arm it.
// =============================================================================

const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const { isPipelineInvocation, classifyWorkflow } = require(path.join(root, 'lib', 'pipeline-workflow-classifier.cjs'));

let failures = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) { failures++; console.log(`FAIL | exp=${JSON.stringify(exp)} got=${JSON.stringify(got)} | ${label}`); }
  else console.log(`OK   | ${label}`);
}

check('self-eval not a pipeline invocation', isPipelineInvocation('/pipeline-orchestrator:self-eval'), false);
check('self-eval with a preamble still not armed', isPipelineInvocation('please run /pipeline-orchestrator:self-eval now'), false);
check('self-eval with run arg not armed', isPipelineInvocation('/pipeline-orchestrator:self-eval 001-run'), false);

// Sanity: a real governed command IS detected (proves the test is meaningful).
check('control: /pipeline IS armed', isPipelineInvocation('/pipeline fix the bug'), true);
check('control: namespaced bugfix IS armed', isPipelineInvocation('/pipeline-orchestrator:bugfix login broken'), true);

// classifyWorkflow on self-eval text must not yield a governed type from the command token.
const cw = classifyWorkflow('/pipeline-orchestrator:self-eval');
check('self-eval text → no type from command', cw.type, null);

console.log(failures === 0 ? '\n>>> F4 PASS' : `\n>>> F4 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
