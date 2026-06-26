#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 — Lote 1 (chain-tied enforcement): arm coverage + plan-file exemption
// =============================================================================
// GARANTIA A: the arm fires for EVERY governed flow command, anywhere in the
//             prompt (voice preamble must not disable arming).
// GARANTIA B: no plugin command in the prompt → no arm; meta/read-only commands
//             (help/paperclip-overview/setup-paperclip/measure-*) never arm.
// PONTO 7a:   isPlanFile exempts the harness plan file under a NON-STANDARD config
//             dir (e.g. `.claude-conta2`) — the live dogfood deadlock that blocked
//             Plan Mode's own plan file. Exercised via the GENERIC FALLBACK (env
//             CLAUDE_CONFIG_DIR cleared) so it proves the hook works even when the
//             harness does not pass the config-dir env to the hook subprocess.
// =============================================================================

const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..', '..', '..');
const classifier = require(path.join(root, 'lib', 'pipeline-workflow-classifier.cjs'));

// Force the generic fallback for isPlanFile: clear the env candidate so the test
// proves the path-segment fallback (the real-world hook condition).
delete process.env.CLAUDE_CONFIG_DIR;
const eg = require(path.join(root, '.claude', 'hooks', 'edit-guard-hook.cjs'));

let failures = 0;
function check(label, got, exp) {
  const ok = got === exp;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} | exp=${exp} got=${got} | ${label}`);
}

// ---- GARANTIA A: governed commands ARM (anywhere, all variants) -------------
const ARM = [
  ['/pipeline-orchestrator:pipeline conserta login', 'pipeline'],
  ['/pipeline-orchestrator:bugfix-heavy x', 'bugfix variante'],
  ['/pipeline-orchestrator:feature-light x', 'feature variante'],
  ['/pipeline-orchestrator:audit modulo', 'audit'],
  ['/pipeline-orchestrator:user-story x', 'user-story'],
  ['/pipeline-orchestrator:ux-sim x', 'ux-sim'],
  ['/pipeline-orchestrator:refactor x', 'refactor'],
  ['/pipeline-orchestrator:spec-heavy x', 'spec variante'],
  ['/pipeline-orchestrator:review branch', 'review'],
  ['/pipeline-orchestrator:brainstorm ideia', 'brainstorm'],
  ['/pipeline-orchestrator:paperclip-bugfix x', 'paperclip fluxo'],
  ['por favor roda /pipeline-orchestrator:pipeline conserta', 'PREAMBULO de voz'],
];
for (const [p, label] of ARM) check('ARMA: ' + label, classifier.isPipelineInvocation(p), true);

// ---- GARANTIA B: no command / meta commands DO NOT arm ----------------------
const NO_ARM = [
  ['/pipeline-orchestrator:help', 'META help'],
  ['/pipeline-orchestrator:paperclip-overview', 'META overview'],
  ['/pipeline-orchestrator:setup-paperclip', 'META setup'],
  ['/pipeline-orchestrator:measure-paperclip-fidelity', 'META measure'],
  ['conserta o login pra mim', 'SEM comando (Garantia B)'],
  ['fala sobre pipeline de dados', 'palavra "pipeline" solta'],
];
for (const [p, label] of NO_ARM) check('NAO ARMA: ' + label, classifier.isPipelineInvocation(p), false);

// ---- PONTO 7a: plan-file exemption covers a NON-STANDARD config dir ----------
// Build under os.tmpdir() so it matches neither homedir/.claude/plans nor the
// (now-cleared) CLAUDE_CONFIG_DIR candidate — only the generic fallback can pass.
const base = os.tmpdir();
const PLAN = [
  [path.join(base, '.claude-conta2', 'plans', 'p.md'), true, 'config dir CUSTOM (.claude-conta2) — o que travou'],
  [path.join(base, '.claude', 'plans', 'p.md'), true, 'config dir padrao'],
  [path.join(base, '.claude-foo', 'plans', 'sub', 'p.md'), true, 'config dir custom aninhado'],
  [path.join(base, 'src', 'index.js'), false, 'codigo de producao (NAO isenta)'],
  [path.join(base, '.claude-conta2', 'settings.json'), false, 'config mas NAO plans'],
];
assert.strictEqual(typeof eg.isPlanFile, 'function', 'edit-guard deve exportar isPlanFile');
for (const [p, exp, label] of PLAN) check('PLAN: ' + label, eg.isPlanFile(p), exp);

console.log(failures === 0 ? '\n>>> F1 PASS' : `\n>>> F1 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
