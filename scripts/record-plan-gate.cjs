#!/usr/bin/env node
'use strict';

// scripts/record-plan-gate.cjs (Batch A — wire the deterministic Plan-Mode gate)
//
// Records the Plan-Mode gate state into a run's HMAC-signed sentinel-state.json by reading the
// current state, merging phase_1_5_plan, and re-signing (writeSignedState overwrites, so we
// read-merge-resign to preserve the rest of the state and the signature integrity).
//
// Usage (called by the controller via Bash, and by the sentinel-hook auto-arm path):
//   node record-plan-gate.cjs <pipelineDocPath> arm <type> [complexity]  → arm gate (required + reset)
//   node record-plan-gate.cjs <pipelineDocPath> approve                  → mark plan approved
//   node record-plan-gate.cjs <pipelineDocPath> reject                   → mark plan rejected
//
// Coverage (Batch C): the gate is REQUIRED for all code-writing workflows (Bug Fix, Feature,
// User Story, Spec) across ALL complexities (SIMPLES included — proportional). Read-only
// workflows (Audit, UX Simulation, Review) do not write production code → required=false.

const fs = require('node:fs');
const path = require('node:path');
const { writeSignedState } = require(path.join(__dirname, '..', 'lib', 'sentinel-state-signer.cjs'));

const READ_ONLY_TYPES = new Set(['Audit', 'UX Simulation', 'UX', 'Review']);

function planRequiredFor(type) {
  if (typeof type !== 'string' || !type.trim()) return true; // unknown → require (fail-safe)
  return !READ_ONLY_TYPES.has(type.trim());
}

function readState(statePath) {
  let raw;
  try { raw = fs.readFileSync(statePath, 'utf8'); }
  catch (_) { return {}; } // missing file → fresh state (acceptable for arm)
  try {
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (_) {
    // present but corrupt → refuse to clobber (would destroy run_id / orchestrator_decision / etc.)
    throw new Error('refusing to overwrite corrupt sentinel-state.json (JSON parse failed)');
  }
}

function recordPlanGate(pipelineDocPath, op, { type } = {}) {
  if (typeof pipelineDocPath !== 'string' || !pipelineDocPath) throw new Error('pipelineDocPath required');
  const statePath = path.join(pipelineDocPath, 'sentinel-state.json');
  const state = readState(statePath);
  const prev = (state.phase_1_5_plan && typeof state.phase_1_5_plan === 'object') ? state.phase_1_5_plan : {};
  let plan;
  if (op === 'arm') {
    plan = { required: planRequiredFor(type), executed: false, approved: false, decision: null, approved_at: null };
  } else if (op === 'approve') {
    // SEC/CORR fix: a gate can only be approved if it was armed first (prevents approve-without-arm
    // silently disarming the gate, and blunts forging an approval on a blank/unarmed state).
    if (typeof prev.required !== 'boolean') throw new Error('cannot approve: plan gate was never armed (run "arm" first)');
    plan = { required: prev.required, executed: true, approved: true, decision: 'APPROVED', approved_at: new Date().toISOString() };
  } else if (op === 'reject') {
    if (typeof prev.required !== 'boolean') throw new Error('cannot reject: plan gate was never armed (run "arm" first)');
    plan = { required: prev.required, executed: true, approved: false, decision: 'REJECTED', approved_at: null };
  } else {
    throw new Error(`unknown op: ${op}`);
  }
  const merged = { ...state, phase_1_5_plan: plan, schema_version: 2, updated_at: new Date().toISOString() };
  writeSignedState(statePath, merged);
  return plan;
}

module.exports = { recordPlanGate, planRequiredFor, READ_ONLY_TYPES };

if (require.main === module) {
  const [docPath, op, type] = process.argv.slice(2);
  if (!docPath || !op) {
    process.stderr.write('usage: record-plan-gate.cjs <pipelineDocPath> <arm|approve|reject> [type] [complexity]\n');
    process.exit(2);
  }
  try {
    const plan = recordPlanGate(docPath, op, { type });
    process.stdout.write(JSON.stringify({ ok: true, phase_1_5_plan: plan }) + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write('record-plan-gate error: ' + err.message + '\n');
    process.exit(1);
  }
}
