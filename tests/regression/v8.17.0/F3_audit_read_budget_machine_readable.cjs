#!/usr/bin/env node
'use strict';

// =============================================================================
// F3 — v8.17.0 — AUDIT-005 — machine-readable audit-read-budget deny
// =============================================================================
// The deny payload of lib/audit-read-budget.cjs::decideAuditReadBudget MUST
// expose a `corrective` object whose `corrective_action` field uses a closed
// vocabulary (`dispatch_agent`) and whose `agent_type` field identifies the
// target subagent (`audit-intake` for the AUDIT_RAN_INLINE flow). The prose
// `reason` MUST also carry a `corrective_action=dispatch_agent
// agent_type=audit-intake` suffix so a parent that pattern-matches text-only
// can still recover.
//
// Scenario 4 (regression): the existing corrective descriptor fields
// (invariant_id, what_failed, blocking) MUST survive the additive change.
// =============================================================================

const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const budget = require(path.join(ROOT, 'lib', 'audit-read-budget.cjs'));

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | ${label}`); }
  else console.log(`OK   | ${label}`);
}

// Build a ctx that triggers the deny path.
function denyCtx() {
  return {
    toolName: 'Read',
    armPending: true,
    runActive: false,
    budgeted: true,
    pipelineAligned: false,
    agentDispatched: false,
    count: 12,
    budget: 12,
    enforce: 'deny',
    workflow: 'audit-heavy',
  };
}

// --- Case 1: decision is block ---------------------------------------------
{
  const r = budget.decideAuditReadBudget(denyCtx());
  check('Case1: decision === block', r && r.decision === 'block');
  check('Case1: invariant_id === AUDIT_RAN_INLINE', r && r.invariant_id === 'AUDIT_RAN_INLINE');
  check('Case1: corrective payload present', !!(r && r.corrective));
}

// --- Case 2: new machine-readable fields on corrective ---------------------
{
  const r = budget.decideAuditReadBudget(denyCtx());
  const c = r && r.corrective;
  check('Case2: corrective.corrective_action === "dispatch_agent"',
    c && c.corrective_action === 'dispatch_agent');
  check('Case2: corrective.agent_type === "audit-intake"',
    c && c.agent_type === 'audit-intake');
}

// --- Case 3: prose reason carries the key=value suffix --------------------
{
  const r = budget.decideAuditReadBudget(denyCtx());
  check('Case3: reason contains corrective_action=dispatch_agent suffix',
    typeof r.reason === 'string' && r.reason.includes('corrective_action=dispatch_agent'));
  check('Case3: reason contains agent_type=audit-intake suffix',
    typeof r.reason === 'string' && r.reason.includes('agent_type=audit-intake'));
}

// --- Case 4 (regression): existing corrective fields preserved -------------
{
  const r = budget.decideAuditReadBudget(denyCtx());
  const c = r && r.corrective;
  check('Case4: corrective.invariant_id === AUDIT_RAN_INLINE',
    c && c.invariant_id === 'AUDIT_RAN_INLINE');
  check('Case4: corrective.what_failed is a non-empty string',
    c && typeof c.what_failed === 'string' && c.what_failed.length > 0);
  check('Case4: corrective.blocking === true', c && c.blocking === true);
  check('Case4: corrective.fix_instruction is preserved',
    c && typeof c.fix_instruction === 'string' && c.fix_instruction.length > 0);
}

// --- Case 5: buildAuditCorrectiveDescriptor direct call also exposes fields -
{
  const c = budget.buildAuditCorrectiveDescriptor('Read', 'audit-heavy');
  check('Case5: direct descriptor exposes corrective_action',
    c && c.corrective_action === 'dispatch_agent');
  check('Case5: direct descriptor exposes agent_type',
    c && c.agent_type === 'audit-intake');
}

process.exit(failures > 0 ? 1 : 0);
