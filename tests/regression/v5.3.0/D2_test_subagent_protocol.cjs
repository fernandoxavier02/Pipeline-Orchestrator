#!/usr/bin/env node
/**
 * D2 regression test — Achado #7 protocol compliance in information-gate and plan-architect.
 *
 * Audit evidence (2026-05-15):
 *   - B1-004: information-gate emitted prose A/B question instead of GATE_REQUEST v1
 *   - B5-001: plan-architect returned inline IMPLEMENTATION_PLAN instead of PLAN_MODE_REQUEST v1
 *
 * This test asserts that the agent .md specs contain the required protocol guidance.
 * It is text-pattern, not runtime — but if the spec doesn't TELL the subagent how to emit
 * the structured block, the LLM will fall back to its training (prose / inline) under
 * the stripped runtime.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

const TARGETS = [
  {
    name: 'information-gate',
    path: 'agents/core/information-gate.md',
    expected_block: 'GATE_REQUEST v1',
    expected_status: 'AWAITING_GATE_RESPONSES',
    forbidden_only_tool: null, // it CAN reference AskUserQuestion as a hint, but must have GATE_REQUEST fallback
  },
  {
    name: 'plan-architect',
    path: 'agents/quality/plan-architect.md',
    expected_block: 'PLAN_MODE_REQUEST v1',
    expected_status: 'AWAITING_PLAN_MODE_RESULTS',
    forbidden_only_tool: null,
  },
];

const REQUIRED_PATTERNS = (target) => [
  {
    label: `mentions ${target.expected_block}`,
    pattern: new RegExp(target.expected_block, 'i'),
  },
  {
    label: `mentions ${target.expected_status}`,
    pattern: new RegExp(target.expected_status, 'i'),
  },
  {
    label: 'cites Achado #7',
    pattern: /achado\s*#?\s*7/i,
  },
  {
    label: 'mentions runtime stripping or harness',
    pattern: /(strip|harness|runtime)/i,
  },
];

function check(target) {
  const filePath = path.join(ROOT, target.path);
  if (!fs.existsSync(filePath)) {
    return { name: target.name, status: 'FAIL', reason: `file not found: ${filePath}` };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const failures = [];
  for (const p of REQUIRED_PATTERNS(target)) {
    if (!p.pattern.test(content)) {
      failures.push(p.label);
    }
  }
  if (failures.length === 0) {
    return { name: target.name, status: 'PASS' };
  }
  return { name: target.name, status: 'FAIL', reason: `missing: ${failures.join(', ')}` };
}

let allPass = true;
console.log('=== D2 regression — Achado #7 protocol compliance ===');
for (const target of TARGETS) {
  const result = check(target);
  console.log(`  [${result.status}] ${result.name}${result.reason ? ' — ' + result.reason : ''}`);
  if (result.status === 'FAIL') allPass = false;
}
if (allPass) {
  console.log('ALL PASS');
  process.exit(0);
} else {
  console.log('FAILED — see above');
  process.exit(1);
}
