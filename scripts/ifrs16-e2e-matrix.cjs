#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  runOperationalPipeline,
  createFakeAgentAdapter,
} = require('../lib/codex-operational-runtime.cjs');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const IFRS_ROOT = '/root/projetos/IFRS 16';
const DATE = '20260518';
const BRANCH = `codex/e2e-pipeline-orchestrator-fix-${DATE}`;
const BASE_DIR = path.join(os.tmpdir(), `ifrs16-pipeline-e2e-${DATE}-${process.pid}`);
const EVIDENCE_DIR = path.join(PLUGIN_ROOT, 'docs', 'audits', '2026-05-18-codex-operational-e2e');

const MODALITIES = [
  'full',
  'diagnostic',
  'continue',
  'review-only',
  '--simples',
  '--media',
  '--complexa',
  '--plan',
  '--grill',
  '--hotfix',
  'audit',
  'audit-light',
  'audit-heavy',
  'audit-only',
  'bugfix',
  'bugfix-light',
  'bugfix-heavy',
  'feature',
  'feature-light',
  'feature-heavy',
  'spec',
  'spec-light',
  'spec-heavy',
  'spec-audit-only',
  'review',
];

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd || IFRS_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(' ')} failed\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  return result;
}

function safeName(name) {
  return name.replace(/^--/, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  if (!text) return [];
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function terminalAdapter(modality) {
  const isSimple = modality === '--simples' || modality.endsWith('-light');
  const phases = isSimple
    ? ['PHASE_MILESTONE: 0', 'PHASE_MILESTONE: 1', 'PHASE_MILESTONE: 2', 'PHASE_MILESTONE: 3']
    : ['PHASE_MILESTONE: 0', 'PHASE_MILESTONE: 1', 'PHASE_MILESTONE: 1.5', 'PHASE_MILESTONE: 2', 'PHASE_MILESTONE: 3'];
  return createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        ...phases,
        '=== DISPATCH_REQUEST v1 ===',
        `dispatch_id: dispatch-${safeName(modality)}-classification`,
        'target_kind: agent',
        'target_name: task-orchestrator',
        'description: Classify modality',
        'prompt: |',
        `  Classify ${modality}`,
        '=== END DISPATCH_REQUEST ===',
        '=== GATE_REQUEST v1 ===',
        'gate_id: phase-2-tdd-approval-1',
        'question: Approve TDD evidence?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        '=== GATE_REQUEST v1 ===',
        'gate_id: phase-2-adversarial-batch-1',
        'question: Run adversarial review?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        '=== GATE_REQUEST v1 ===',
        'gate_id: phase-3-closeout',
        'question: Confirm closeout?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        'STATUS: AWAITING_DISPATCH_RESULTS',
      ].join('\n'),
    },
    { agent: 'task-orchestrator', result: `CLASSIFICATION:\n  modality: ${modality}\nSTATUS: COMPLETE` },
    { agent: 'pipeline-controller', result: 'PIPELINE COMPLETE\nSTATUS: PASS' },
  ]);
}

function optionsFor(modality, worktree) {
  if (modality === 'continue') {
    return {
      task: 'continue',
      mode: 'continue',
      cwd: worktree,
      strictAgents: true,
      agentAdapter: createFakeAgentAdapter([]),
    };
  }
  if (modality === 'review-only') {
    return {
      task: 'review-only',
      mode: 'review-only',
      cwd: worktree,
      strictAgents: true,
      agentAdapter: createFakeAgentAdapter([]),
    };
  }
  const complexity = modality === '--simples' || modality.endsWith('-light')
    ? 'SIMPLES'
    : (modality === '--complexa' || modality.endsWith('-heavy') ? 'COMPLEXA' : 'MEDIA');
  const type = modality.startsWith('spec') ? 'Spec'
    : (modality.startsWith('audit') ? 'Audit'
      : (modality.startsWith('bugfix') ? 'Bug Fix'
        : (modality.startsWith('feature') ? 'Feature' : 'Pipeline')));
  return {
    task: `IFRS16 E2E ${modality}`,
    mode: modality,
    cwd: worktree,
    strictAgents: true,
    complexity,
    type,
    noPlan: modality === '--no-plan',
    agentAdapter: terminalAdapter(modality),
    gateResponses: {
      'phase-2-tdd-approval-1': 'approve',
      'phase-2-adversarial-batch-1': 'approve',
      'phase-3-closeout': 'approve',
    },
  };
}

function summarizeRun(modality, worktree, result, specExists) {
  const sessionPath = path.join(result.pipelineDocPath, 'session.json');
  const gatesPath = path.join(result.pipelineDocPath, 'gate-decisions.jsonl');
  const protocolPath = path.join(result.pipelineDocPath, 'protocol-events.jsonl');
  const nextStepPath = path.join(result.pipelineDocPath, 'NEXT_STEP');
  const session = fs.existsSync(sessionPath) ? readJson(sessionPath) : {};
  const gates = readJsonl(gatesPath);
  const protocol = readJsonl(protocolPath);
  const brainstormGate = gates.find((entry) => entry.gate === 'STEP_1_7_ROUTING');
  const missingSpecBlock = !specExists ? ['published audit spec missing: .kiro/specs/pipeline-meta-ifrs16-modalities-audit'] : [];
  return {
    modality,
    interpreted_mode: session.mode || modality,
    variant: session.plan_mode?.override_blocked ? 'complexa-plan-required' : (session.plan_mode?.skipped ? 'plan-skipped' : 'default'),
    dispatch_mode: result.dispatchMode,
    phases_reached: session.phases_reached || [],
    gates_persisted: gates.map((entry) => entry.gate),
    protocol_events_exists: fs.existsSync(protocolPath),
    protocol_event_count: protocol.length,
    gate_decisions_exists: fs.existsSync(gatesPath),
    next_step_exists: fs.existsSync(nextStepPath),
    brainstorm_step_1_7: brainstormGate ? brainstormGate.decision : 'not-applicable-for-fixture',
    final_status: missingSpecBlock.length ? 'BLOCKED' : result.status,
    runtime_status: result.status,
    blockers: missingSpecBlock,
    pipeline_doc_path_in_removed_worktree: result.pipelineDocPath.replace(worktree, '<worktree>'),
  };
}

async function main() {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  const baseStatus = runGit(['status', '--short', '--branch']).stdout;
  const head = runGit(['rev-parse', 'HEAD']).stdout.trim();
  const specExists = fs.existsSync(path.join(IFRS_ROOT, '.kiro', 'specs', 'pipeline-meta-ifrs16-modalities-audit'));
  const createdWorktrees = [];
  const matrix = [];
  let branchCreated = false;

  try {
    runGit(['branch', BRANCH, head], { allowFailure: true });
    branchCreated = true;

    for (const modality of MODALITIES) {
      const worktree = path.join(BASE_DIR, safeName(modality));
      runGit(['worktree', 'add', '--detach', worktree, BRANCH]);
      createdWorktrees.push(worktree);
      const options = optionsFor(modality, worktree);
      const result = await runOperationalPipeline(options);
      matrix.push(summarizeRun(modality, worktree, result, specExists));
    }
  } finally {
    for (const worktree of createdWorktrees.reverse()) {
      runGit(['worktree', 'remove', '--force', worktree], { allowFailure: true });
    }
    runGit(['branch', '-D', BRANCH], { allowFailure: true });
    fs.rmSync(BASE_DIR, { recursive: true, force: true });
  }

  const report = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ifrs_root: IFRS_ROOT,
    temp_branch: BRANCH,
    base_head: head,
    base_status_before: baseStatus,
    spec_exists: specExists,
    source_canonical: '/root/projetos/pipeline-orchestrator/repo',
    plugin_under_test: PLUGIN_ROOT,
    matrix,
  };

  const jsonPath = path.join(EVIDENCE_DIR, 'ifrs16-matrix.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    '# IFRS16 Codex Operational E2E Matrix',
    '',
    `- started_at: ${report.started_at}`,
    `- finished_at: ${report.finished_at}`,
    `- base_head: ${report.base_head}`,
    `- temp_branch_removed: ${BRANCH}`,
    `- published_spec_exists: ${specExists}`,
    '',
    '| modality | runtime | final | dispatch | phases | gates | brainstorm | blockers |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...matrix.map((row) => (
      `| ${row.modality} | ${row.runtime_status} | ${row.final_status} | ${row.dispatch_mode} | ${row.phases_reached.join(',')} | ${row.gates_persisted.join(',')} | ${row.brainstorm_step_1_7} | ${row.blockers.join('; ')} |`
    )),
    '',
    'Raw JSON: `ifrs16-matrix.json`',
    '',
  ];
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'ifrs16-matrix.md'), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({
    evidence_dir: EVIDENCE_DIR,
    json: jsonPath,
    total: matrix.length,
    pass: matrix.filter((row) => row.final_status === 'PASS').length,
    blocked: matrix.filter((row) => row.final_status === 'BLOCKED').length,
    spec_exists: specExists,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
