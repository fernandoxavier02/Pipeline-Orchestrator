#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  runOperationalPipeline,
  createFakeAgentAdapter,
} = require('../../../lib/codex-operational-runtime.cjs');

function makeTempWorkspace(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `pipeline-codex-${name}-`));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('Batch 1 RED: strict operational mode without adapter blocks with blocked-no-agent-runtime', async () => {
  const workspace = makeTempWorkspace('strict-no-adapter');

  const result = await runOperationalPipeline({
    task: 'Audit IFRS16 hardening',
    cwd: workspace,
    strictAgents: true,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'blocked-no-agent-runtime');
  assert.equal(result.dispatchMode, 'blocked-no-agent-runtime');
  assert.equal(result.harness, false, 'diagnostic harness must not be reported as operational execution');
  assert.ok(fs.existsSync(path.join(result.pipelineDocPath, 'NEXT_STEP')));
  assert.match(fs.readFileSync(path.join(result.pipelineDocPath, 'NEXT_STEP'), 'utf8'), /agent adapter/i);
});

test('Batch 1 RED: operational entrypoint spawns pipeline-controller and handles DISPATCH_REQUEST through adapter', async () => {
  const workspace = makeTempWorkspace('fake-adapter');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        '=== DISPATCH_REQUEST v1 ===',
        'dispatch_id: dispatch-phase-0a',
        'target_kind: agent',
        'target_name: task-orchestrator',
        'description: Classify task',
        'prompt: Classify this task',
        '=== END DISPATCH_REQUEST ===',
        'STATUS: AWAITING_DISPATCH_RESULTS',
      ].join('\n'),
    },
    {
      agent: 'task-orchestrator',
      result: [
        'CLASSIFICATION:',
        '  type: Audit',
        '  complexity: MEDIA',
        '  pipeline_variant: audit-light',
        'STATUS: COMPLETE',
      ].join('\n'),
    },
    {
      agent: 'pipeline-controller',
      result: [
        'PHASE_MILESTONE: 0',
        'PHASE_MILESTONE: 1',
        'PHASE_MILESTONE: 1.5',
        'PHASE_MILESTONE: 2',
        'PHASE_MILESTONE: 3',
        '=== GATE_REQUEST v1 ===',
        'id: gate-tdd',
        'gate_id: tdd-approval',
        'question: Approve TDD RED tests?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        'STATUS: AWAITING_GATE_RESPONSES',
      ].join('\n'),
    },
    {
      agent: 'pipeline-controller',
      result: 'PIPELINE COMPLETE\nSTATUS: PASS',
    },
  ]);

  const result = await runOperationalPipeline({
    task: 'Run MEDIA audit',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
    gateResponses: {
      'tdd-approval': 'approve',
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.dispatchMode, 'adapter-fake');
  assert.equal(result.harness, false, 'adapter-backed execution must not be marked as harness');
  assert.deepEqual(adapter.calls.map((call) => call.agent), [
    'pipeline-controller',
    'task-orchestrator',
    'pipeline-controller',
    'pipeline-controller',
  ]);
  assert.deepEqual(adapter.calls[1], {
    agent: 'task-orchestrator',
    description: 'Classify task',
    prompt: 'Classify this task',
  }, 'DISPATCH_REQUEST fields must drive the adapter call');

  const protocolEvents = readJsonl(path.join(result.pipelineDocPath, 'protocol-events.jsonl'));
  assert.ok(protocolEvents.some((event) => (
    event.event === 'DISPATCH_REQUEST_EMITTED'
    && event.protocol_event_id === 'dispatch-phase-0a'
    && event.target_name === 'task-orchestrator'
  )));
  assert.ok(protocolEvents.some((event) => (
    event.event === 'DISPATCH_RESULT_CAPTURED'
    && event.protocol_event_id === 'dispatch-phase-0a'
    && event.target_name === 'task-orchestrator'
  )));
  assert.ok(protocolEvents.some((event) => (
    event.event === 'GATE_REQUEST_EMITTED'
    && event.protocol_event_id === 'gate-tdd'
    && event.gate_id === 'tdd-approval'
  )));

  const gates = readJsonl(path.join(result.pipelineDocPath, 'gate-decisions.jsonl'));
  assert.ok(gates.some((entry) => entry.gate === 'TDD_APPROVAL' && entry.decision === 'APPROVED'));
});

test('Batch 1 RED: Brainstorm Step 1.7 cannot conclude without GATE_RESPONSES', async () => {
  const workspace = makeTempWorkspace('brainstorm-blocked');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        'STEP_1_7_ROUTING: dispatch brainstorm-controller',
        '=== DISPATCH_REQUEST v1 ===',
        'dispatch_id: dispatch-brainstorm',
        'target_kind: agent',
        'target_name: brainstorm-controller',
        'description: Prepare Step 1.7',
        'prompt: Run brainstorm preparation',
        '=== END DISPATCH_REQUEST ===',
        'STATUS: AWAITING_DISPATCH_RESULTS',
      ].join('\n'),
    },
    {
      agent: 'brainstorm-controller',
      result: [
        '=== GATE_REQUEST v1 ===',
        'id: brainstorm-choice',
        'gate_id: step-1-7-routing',
        'question: Approve brainstorm route?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        'STATUS: AWAITING_GATE_RESPONSES',
      ].join('\n'),
    },
  ]);

  const result = await runOperationalPipeline({
    task: 'MEDIA feature with brainstorm',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'missing-gate-responses');
  assert.equal(result.brainstorm.concluded, false);
  const gates = readJsonl(path.join(result.pipelineDocPath, 'gate-decisions.jsonl'));
  assert.ok(gates.some((entry) => entry.gate === 'STEP_1_7_ROUTING' && entry.decision === 'BLOCKED'));
});

test('Batch 1 RED: continue without state and review-only produce structured auditable blocks', async () => {
  const workspace = makeTempWorkspace('modes');

  const continueResult = await runOperationalPipeline({
    task: 'continue',
    cwd: workspace,
    mode: 'continue',
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([]),
  });

  assert.equal(continueResult.status, 'BLOCKED');
  assert.equal(continueResult.reason, 'missing-session-state');
  const continueSession = readJson(path.join(continueResult.pipelineDocPath, 'session.json'));
  assert.equal(continueSession.status, 'BLOCKED');
  assert.equal(continueSession.execution_identity.cwd, workspace);
  const continueGates = readJsonl(path.join(continueResult.pipelineDocPath, 'gate-decisions.jsonl'));
  assert.ok(continueGates.some((entry) => (
    entry.gate === 'CONTINUE_STATE'
    && entry.decision === 'BLOCKED'
    && entry.hardness === 'HARD'
    && entry.decided_by === 'runtime'
  )));
  assert.match(fs.readFileSync(path.join(continueResult.pipelineDocPath, 'NEXT_STEP'), 'utf8'), /previous session\.json|new pipeline/i);

  const reviewResult = await runOperationalPipeline({
    task: 'review-only',
    cwd: workspace,
    mode: 'review-only',
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([]),
  });

  assert.equal(reviewResult.status, 'BLOCKED');
  assert.equal(reviewResult.reason, 'review-only-requires-change-list');
  const report = fs.readFileSync(path.join(reviewResult.pipelineDocPath, 'review-only-report.md'), 'utf8');
  assert.match(report, /No changed file list was provided/i);
  const reviewSession = readJson(path.join(reviewResult.pipelineDocPath, 'session.json'));
  assert.equal(reviewSession.execution_identity.cwd, workspace);
  const reviewSentinel = readJson(path.join(reviewResult.pipelineDocPath, 'sentinel-state.json'));
  assert.equal(reviewSentinel.pipeline_active, false);
  const reviewGates = readJsonl(path.join(reviewResult.pipelineDocPath, 'gate-decisions.jsonl'));
  assert.ok(reviewGates.some((entry) => (
    entry.gate === 'AGENT_RUNTIME'
    && entry.decision === 'BLOCKED'
    && entry.detail === 'review-only-requires-change-list'
  )));
});

test('Batch 1 RED: persisted execution identity uses target workspace and records all phases', async () => {
  const workspace = makeTempWorkspace('identity-phases');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        'PHASE_MILESTONE: 0',
        'PHASE_MILESTONE: 1',
        'PHASE_MILESTONE: 1.5',
        'PHASE_MILESTONE: 2',
        'PHASE_MILESTONE: 3',
        'PIPELINE COMPLETE',
        'STATUS: PASS',
      ].join('\n'),
    },
  ]);

  const result = await runOperationalPipeline({
    task: 'Full operational run',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
  });

  const session = readJson(path.join(result.pipelineDocPath, 'session.json'));
  assert.equal(session.execution_identity.cwd, workspace);
  assert.deepEqual(session.phases_reached, ['0', '1', '1.5', '2', '3']);
  const sentinel = readJson(path.join(result.pipelineDocPath, 'sentinel-state.json'));
  assert.equal(sentinel.pipeline_active, false);
  assert.equal(sentinel.expected_next, 'complete');
  assert.ok(fs.existsSync(path.join(result.pipelineDocPath, 'protocol-events.jsonl')));
  assert.ok(fs.existsSync(path.join(result.pipelineDocPath, 'gate-decisions.jsonl')));
  assert.match(fs.readFileSync(path.join(result.pipelineDocPath, 'NEXT_STEP'), 'utf8'), /completed/i);
});

test('Adversarial RED: canonical dispatch_id and block scalar prompt drive adapter dispatch', async () => {
  const workspace = makeTempWorkspace('canonical-dispatch');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        '=== DISPATCH_REQUEST v1 ===',
        'dispatch_id: canonical-dispatch-1',
        'target_kind: agent',
        'target_name: task-orchestrator',
        'description: Classify with context',
        'prompt: |',
        '  Line one',
        '  Line two with: colon',
        '=== END DISPATCH_REQUEST ===',
        'STATUS: AWAITING_DISPATCH_RESULTS',
      ].join('\n'),
    },
    {
      agent: 'task-orchestrator',
      result: 'STATUS: COMPLETE',
    },
    {
      agent: 'pipeline-controller',
      result: 'PIPELINE COMPLETE\nSTATUS: PASS',
    },
  ]);

  const result = await runOperationalPipeline({
    task: 'Canonical dispatch',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
  });

  assert.equal(result.status, 'PASS');
  assert.equal(adapter.calls[1].prompt, 'Line one\nLine two with: colon');
  const protocolEvents = readJsonl(path.join(result.pipelineDocPath, 'protocol-events.jsonl'));
  assert.ok(protocolEvents.some((event) => (
    event.event === 'DISPATCH_REQUEST_EMITTED'
    && event.protocol_event_id === 'canonical-dispatch-1'
  )));
});

test('Adversarial RED: PLAN_MODE_REQUEST is handled through adapter and logged', async () => {
  const workspace = makeTempWorkspace('plan-mode');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        '=== PLAN_MODE_REQUEST v1 ===',
        'plan_id: phase-1-5-plan',
        'description: Build implementation plan',
        'prompt: |',
        '  Plan the MEDIA implementation',
        '=== END PLAN_MODE_REQUEST ===',
        'STATUS: AWAITING_PLAN_MODE_RESULTS',
      ].join('\n'),
    },
    {
      agent: 'plan-mode',
      result: 'PLAN_MODE_RESULT: approved plan',
    },
    {
      agent: 'pipeline-controller',
      result: 'PHASE_MILESTONE: 1.5\nPIPELINE COMPLETE\nSTATUS: PASS',
    },
  ]);

  const result = await runOperationalPipeline({
    task: 'MEDIA needs plan',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
  });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(adapter.calls.map((call) => call.agent), [
    'pipeline-controller',
    'plan-mode',
    'pipeline-controller',
  ]);
  const protocolEvents = readJsonl(path.join(result.pipelineDocPath, 'protocol-events.jsonl'));
  assert.ok(protocolEvents.some((event) => (
    event.event === 'PLAN_MODE_REQUEST_EMITTED'
    && event.protocol_event_id === 'phase-1-5-plan'
  )));
  assert.ok(protocolEvents.some((event) => event.event === 'PLAN_MODE_RESULT_CAPTURED'));
});

test('Adversarial RED: canonical PLAN_MODE_REQUEST research fields form plan prompt', async () => {
  const workspace = makeTempWorkspace('canonical-plan-mode');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        '=== PLAN_MODE_REQUEST v1 ===',
        'plan_id: canonical-plan',
        'research_scope: |',
        '  inspect controller and gates',
        'expected_deliverables: |',
        '  implementation plan',
        '=== END PLAN_MODE_REQUEST ===',
        'STATUS: AWAITING_PLAN_MODE_RESULTS',
      ].join('\n'),
    },
    { agent: 'plan-mode', result: 'PLAN_MODE_RESULT: canonical plan' },
    { agent: 'pipeline-controller', result: 'PIPELINE COMPLETE\nSTATUS: PASS' },
  ]);

  const result = await runOperationalPipeline({
    task: 'Canonical plan mode',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
  });

  assert.equal(result.status, 'PASS');
  assert.match(adapter.calls[1].prompt, /research_scope:/);
  assert.match(adapter.calls[1].prompt, /inspect controller and gates/);
  assert.match(adapter.calls[1].prompt, /expected_deliverables:/);
});

test('Adversarial RED: unknown controller output blocks instead of silently passing', async () => {
  const workspace = makeTempWorkspace('malformed-controller');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: 'unstructured partial output without terminal status',
    },
  ]);

  const result = await runOperationalPipeline({
    task: 'Malformed output',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'malformed-controller-output');
  const nextStep = fs.readFileSync(path.join(result.pipelineDocPath, 'NEXT_STEP'), 'utf8');
  assert.match(nextStep, /malformed controller output/i);
});

test('Adversarial RED: unmatched protocol opener blocks even when output claims PASS', async () => {
  const workspace = makeTempWorkspace('malformed-protocol-pass');
  const result = await runOperationalPipeline({
    task: 'Malformed protocol pass',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: '=== DISPATCH_REQUEST v1 ===\ndispatch_id: broken\nSTATUS: PASS',
      },
    ]),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'malformed-protocol-block');
});

test('Adversarial RED: typo-like protocol opener blocks even when output claims PASS', async () => {
  const workspace = makeTempWorkspace('typo-protocol-pass');
  const result = await runOperationalPipeline({
    task: 'Typo protocol pass',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: '=== GATE_REQUEST ===\ngate_id: phase-2-tdd-approval-1\nSTATUS: PASS',
      },
    ]),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'malformed-protocol-block');
});

test('Adversarial RED: DISPATCH_REQUEST without dispatch_id blocks', async () => {
  const workspace = makeTempWorkspace('missing-dispatch-id');
  const result = await runOperationalPipeline({
    task: 'Missing dispatch id',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: [
          '=== DISPATCH_REQUEST v1 ===',
          'id: legacy-only',
          'target_kind: agent',
          'target_name: task-orchestrator',
          'description: classify',
          'prompt: classify',
          '=== END DISPATCH_REQUEST ===',
          'STATUS: AWAITING_DISPATCH_RESULTS',
        ].join('\n'),
      },
    ]),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'malformed-protocol-block');
});

test('Adversarial RED: unknown hard gate blocks and proposal confirmation is protocol-only', async () => {
  const proposalWorkspace = makeTempWorkspace('proposal-gate');
  const proposalResult = await runOperationalPipeline({
    task: 'Proposal gate',
    cwd: proposalWorkspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: [
          '=== GATE_REQUEST v1 ===',
          'gate_id: phase-1-pipeline-proposal',
          'question: Confirm?',
          'options:',
          '  - label: Confirm',
          '    value: approve',
          '=== END GATE_REQUEST ===',
          'STATUS: AWAITING_GATE_RESPONSES',
        ].join('\n'),
      },
      { agent: 'pipeline-controller', result: 'PIPELINE COMPLETE\nSTATUS: PASS' },
    ]),
    gateResponses: { 'phase-1-pipeline-proposal': 'approve' },
  });
  const proposalGates = readJsonl(path.join(proposalResult.pipelineDocPath, 'gate-decisions.jsonl'));
  assert.equal(proposalResult.status, 'PASS');
  assert.equal(proposalGates.length, 0, 'phase-1-pipeline-proposal is protocol-only and must not dual-write a registry gate');
  const proposalEvents = readJsonl(path.join(proposalResult.pipelineDocPath, 'protocol-events.jsonl'));
  assert.ok(proposalEvents.some((entry) => entry.event === 'GATE_RESPONSE_CAPTURED' && entry.gate_id === 'phase-1-pipeline-proposal'));

  const unknownWorkspace = makeTempWorkspace('unknown-gate');
  const unknownResult = await runOperationalPipeline({
    task: 'Unknown hard gate',
    cwd: unknownWorkspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: [
          '=== GATE_REQUEST v1 ===',
          'gate_id: phase-2-dangerous-unknown',
          'question: Unknown hard gate?',
          'options:',
          '  - label: Approve',
          '    value: approve',
          '=== END GATE_REQUEST ===',
          'STATUS: AWAITING_GATE_RESPONSES',
        ].join('\n'),
      },
    ]),
    gateResponses: { 'phase-2-dangerous-unknown': 'approve' },
  });
  assert.equal(unknownResult.status, 'BLOCKED');
  assert.equal(unknownResult.reason, 'unknown-gate-request');
});

test('Adversarial RED: soft gates dual-write registry hardness as SOFT', async () => {
  const workspace = makeTempWorkspace('soft-gate-hardness');
  const result = await runOperationalPipeline({
    task: 'Soft gates',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: [
          '=== GATE_REQUEST v1 ===',
          'gate_id: phase-2-adversarial-batch-1',
          'question: Run adversarial?',
          'options:',
          '  - label: Approve',
          '    value: approve',
          '=== END GATE_REQUEST ===',
          '=== GATE_REQUEST v1 ===',
          'gate_id: phase-3-final-adversarial',
          'question: Run final?',
          'options:',
          '  - label: Approve',
          '    value: approve',
          '=== END GATE_REQUEST ===',
          '=== GATE_REQUEST v1 ===',
          'gate_id: phase-3-closeout',
          'question: Close?',
          'options:',
          '  - label: Approve',
          '    value: approve',
          '=== END GATE_REQUEST ===',
          'STATUS: AWAITING_GATE_RESPONSES',
        ].join('\n'),
      },
      { agent: 'pipeline-controller', result: 'PIPELINE COMPLETE\nSTATUS: PASS' },
    ]),
    gateResponses: {
      'phase-2-adversarial-batch-1': 'approve',
      'phase-3-final-adversarial': 'approve',
      'phase-3-closeout': 'approve',
    },
  });

  assert.equal(result.status, 'PASS');
  const gates = readJsonl(path.join(result.pipelineDocPath, 'gate-decisions.jsonl'));
  for (const gate of ['ADVERSARIAL_GATE', 'FINAL_ADVERSARIAL_GATE', 'CLOSEOUT_CONFIRM']) {
    const entry = gates.find((item) => item.gate === gate);
    assert.equal(entry?.hardness, 'SOFT');
  }
});

test('Adversarial RED: malformed GATE_REQUEST missing question or options blocks', async () => {
  const workspace = makeTempWorkspace('malformed-gate-body');
  const result = await runOperationalPipeline({
    task: 'Malformed gate body',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: [
          '=== GATE_REQUEST v1 ===',
          'gate_id: phase-2-tdd-approval-1',
          'question: Approve?',
          '=== END GATE_REQUEST ===',
          'STATUS: AWAITING_GATE_RESPONSES',
        ].join('\n'),
      },
    ]),
    gateResponses: { 'phase-2-tdd-approval-1': 'approve' },
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'malformed-protocol-block');
});

test('Adversarial RED: malformed nested dispatch protocol blocks the parent run', async () => {
  const workspace = makeTempWorkspace('malformed-nested-protocol');
  const result = await runOperationalPipeline({
    task: 'Malformed nested protocol',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: [
          '=== DISPATCH_REQUEST v1 ===',
          'dispatch_id: nested-malformed',
          'target_kind: agent',
          'target_name: task-orchestrator',
          'description: classify',
          'prompt: classify',
          '=== END DISPATCH_REQUEST ===',
          'STATUS: AWAITING_DISPATCH_RESULTS',
        ].join('\n'),
      },
      { agent: 'task-orchestrator', result: '=== GATE_REQUEST ===\ngate_id: phase-2-tdd-approval-1\nSTATUS: PASS' },
    ]),
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'malformed-protocol-block');
});

test('Adversarial RED: blank GATE_REQUEST question blocks as malformed', async () => {
  const workspace = makeTempWorkspace('blank-gate-question');
  const result = await runOperationalPipeline({
    task: 'Blank gate question',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: createFakeAgentAdapter([
      {
        agent: 'pipeline-controller',
        result: [
          '=== GATE_REQUEST v1 ===',
          'gate_id: phase-2-tdd-approval-1',
          'question:',
          'options:',
          '  - label: Approve',
          '    value: approve',
          '=== END GATE_REQUEST ===',
          'STATUS: AWAITING_GATE_RESPONSES',
        ].join('\n'),
      },
    ]),
    gateResponses: { 'phase-2-tdd-approval-1': 'approve' },
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'malformed-protocol-block');
});

test('Adversarial RED: review-only with changedFiles routes report-only and does not run full pipeline', async () => {
  const workspace = makeTempWorkspace('review-only-files');
  const adapter = createFakeAgentAdapter([
    { agent: 'review-orchestrator', result: 'REVIEW_ONLY_REPORT\nSTATUS: PASS' },
  ]);

  const result = await runOperationalPipeline({
    task: 'review-only',
    mode: 'review-only',
    cwd: workspace,
    strictAgents: true,
    changedFiles: ['backend/app.py', 'frontend/app.js'],
    agentAdapter: adapter,
  });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(adapter.calls.map((call) => call.agent), ['review-orchestrator']);
  assert.match(adapter.calls[0].prompt, /backend\/app\.py/);
  const session = readJson(path.join(result.pipelineDocPath, 'session.json'));
  assert.deepEqual(session.review_only.changed_files, ['backend/app.py', 'frontend/app.js']);
  assert.ok(fs.existsSync(path.join(result.pipelineDocPath, 'review-only-report.md')));
});

test('Adversarial RED: review-only with changedFiles but no adapter blocks instead of crashing', async () => {
  const workspace = makeTempWorkspace('review-only-no-adapter');

  const result = await runOperationalPipeline({
    task: 'review-only',
    mode: 'review-only',
    cwd: workspace,
    strictAgents: true,
    changedFiles: ['backend/app.py'],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'blocked-no-agent-runtime');
  assert.ok(fs.existsSync(path.join(result.pipelineDocPath, 'NEXT_STEP')));
});

test('Adversarial RED: continueStatePath is loaded and invalid state blocks', async () => {
  const workspace = makeTempWorkspace('continue-state');
  const previous = path.join(workspace, 'previous-session.json');
  fs.writeFileSync(previous, JSON.stringify({
    status: 'BLOCKED',
    phases_reached: ['0', '1'],
    pipeline_doc_path: '/tmp/previous-pipeline-doc',
  }));

  const validResult = await runOperationalPipeline({
    task: 'continue',
    mode: 'continue',
    cwd: workspace,
    strictAgents: true,
    continueStatePath: previous,
    agentAdapter: createFakeAgentAdapter([
      { agent: 'pipeline-controller', result: 'PHASE_MILESTONE: 2\nPHASE_MILESTONE: 3\nPIPELINE COMPLETE\nSTATUS: PASS' },
    ]),
  });
  const validSession = readJson(path.join(validResult.pipelineDocPath, 'session.json'));
  assert.deepEqual(validSession.resume.previous_phases_reached, ['0', '1']);
  assert.match(validResult.controllerInitialPrompt, /CONTINUE_STATE/);
  assert.match(validResult.controllerInitialPrompt, /previous_phases_reached/);
  assert.match(validResult.controllerInitialPrompt, /0/);

  const invalidResult = await runOperationalPipeline({
    task: 'continue',
    mode: 'continue',
    cwd: workspace,
    strictAgents: true,
    continueStatePath: path.join(workspace, 'missing.json'),
    agentAdapter: createFakeAgentAdapter([]),
  });
  assert.equal(invalidResult.status, 'BLOCKED');
  assert.equal(invalidResult.reason, 'invalid-session-state');
});

test('Batch 3 RED: named gate requests persist TDD, adversarial, final adversarial, and closeout decisions', async () => {
  const workspace = makeTempWorkspace('named-gates');
  const adapter = createFakeAgentAdapter([
    {
      agent: 'pipeline-controller',
      result: [
        'PHASE_MILESTONE: 1',
        '=== GATE_REQUEST v1 ===',
        'id: proposal-confirmation',
        'gate_id: phase-1-pipeline-proposal',
        'question: Confirm proposal?',
        'options:',
        '  - label: Confirm',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        '=== GATE_REQUEST v1 ===',
        'id: tdd-batch-1',
        'gate_id: phase-2-tdd-approval-1',
        'question: Approve RED tests?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        '=== GATE_REQUEST v1 ===',
        'id: adv-batch-1',
        'gate_id: phase-2-adversarial-batch-1',
        'question: Run adversarial review?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        '=== GATE_REQUEST v1 ===',
        'id: final-adv',
        'gate_id: phase-3-final-adversarial',
        'question: Run final adversarial review?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        '=== GATE_REQUEST v1 ===',
        'id: closeout',
        'gate_id: phase-3-closeout',
        'question: Confirm closeout?',
        'options:',
        '  - label: Approve',
        '    value: approve',
        '=== END GATE_REQUEST ===',
        'STATUS: AWAITING_GATE_RESPONSES',
      ].join('\n'),
    },
    {
      agent: 'pipeline-controller',
      result: 'PHASE_MILESTONE: 3\nPIPELINE COMPLETE\nSTATUS: PASS',
    },
  ]);

  const result = await runOperationalPipeline({
    task: 'Gate coverage run',
    cwd: workspace,
    strictAgents: true,
    agentAdapter: adapter,
    gateResponses: {
      'phase-1-pipeline-proposal': 'approve',
      'phase-2-tdd-approval-1': 'approve',
      'phase-2-adversarial-batch-1': 'approve',
      'phase-3-final-adversarial': 'approve',
      'phase-3-closeout': 'approve',
    },
  });

  assert.equal(result.status, 'PASS');
  const protocolEvents = readJsonl(path.join(result.pipelineDocPath, 'protocol-events.jsonl'));
  assert.ok(protocolEvents.some((entry) => entry.event === 'GATE_REQUEST_EMITTED' && entry.gate_id === 'phase-1-pipeline-proposal'));
  const gateNames = readJsonl(path.join(result.pipelineDocPath, 'gate-decisions.jsonl')).map((entry) => entry.gate);
  assert.ok(gateNames.includes('TDD_APPROVAL'));
  assert.ok(gateNames.includes('ADVERSARIAL_GATE'));
  assert.ok(gateNames.includes('FINAL_ADVERSARIAL_GATE'));
  assert.ok(gateNames.includes('CLOSEOUT_CONFIRM'));
});

test('Batch 5 RED: --no-plan is honored for MEDIA and blocked for COMPLEXA', async () => {
  const mediaWorkspace = makeTempWorkspace('no-plan-media');
  const mediaResult = await runOperationalPipeline({
    task: 'MEDIA task --no-plan',
    cwd: mediaWorkspace,
    strictAgents: true,
    complexity: 'MEDIA',
    noPlan: true,
    agentAdapter: createFakeAgentAdapter([
      { agent: 'pipeline-controller', result: 'PHASE_MILESTONE: 0\nPHASE_MILESTONE: 1\nPHASE_MILESTONE: 2\nPHASE_MILESTONE: 3\nPIPELINE COMPLETE\nSTATUS: PASS' },
    ]),
  });

  const mediaSession = readJson(path.join(mediaResult.pipelineDocPath, 'session.json'));
  assert.equal(mediaSession.plan_mode.skipped, true);
  assert.equal(mediaSession.plan_mode.override_attempted, true);
  assert.deepEqual(mediaSession.phases_reached, ['0', '1', '2', '3']);

  const complexWorkspace = makeTempWorkspace('no-plan-complex');
  const complexResult = await runOperationalPipeline({
    task: 'COMPLEXA task --no-plan',
    cwd: complexWorkspace,
    strictAgents: true,
    complexity: 'COMPLEXA',
    noPlan: true,
    agentAdapter: createFakeAgentAdapter([
      { agent: 'pipeline-controller', result: 'PHASE_MILESTONE: 0\nPHASE_MILESTONE: 1\nPHASE_MILESTONE: 1.5\nPHASE_MILESTONE: 2\nPHASE_MILESTONE: 3\nPIPELINE COMPLETE\nSTATUS: PASS' },
    ]),
  });

  const complexSession = readJson(path.join(complexResult.pipelineDocPath, 'session.json'));
  assert.equal(complexSession.plan_mode.skipped, false);
  assert.equal(complexSession.plan_mode.override_blocked, true);
  assert.deepEqual(complexSession.phases_reached, ['0', '1', '1.5', '2', '3']);
});
