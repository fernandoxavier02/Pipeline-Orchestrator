#!/usr/bin/env node
/**
 * D2 + D2-extension regression — Achado #7 protocol compliance across all
 * subagents that mention AskUserQuestion/EnterPlanMode/Agent.
 *
 * Audit evidence (2026-05-15):
 *   - B1-004: information-gate emitted prose A/B question
 *   - B5-001: plan-architect returned inline IMPLEMENTATION_PLAN
 *   - Panel F3-3: 13+ sibling subagents share same root cause
 *
 * Strategy:
 *   1. Text-pattern check that each target file mentions GATE_REQUEST v1
 *      AND AWAITING_GATE_RESPONSES AND Achado #7 AND strip/harness/runtime
 *   2. Schema-shape check that worked examples use multi_select (snake_case)
 *      NOT multiSelect (camelCase), and use `recommended: true` field
 *      NOT a "(Recomendado)" suffix in label (F3-1 schema drift)
 *   3. Placeholder leak check — no literal {curly_placeholder} inside YAML
 *      value positions (F3-4)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

const TARGETS = [
  // D2 original (already fixed in commit aef7943 + 5c46851)
  { name: 'information-gate',           path: 'agents/core/information-gate.md',                            kind: 'gate' },
  { name: 'plan-architect',             path: 'agents/quality/plan-architect.md',                           kind: 'plan' },
  // D2-extension (14 siblings, this commit)
  { name: 'design-interrogator',        path: 'agents/quality/design-interrogator.md',                      kind: 'gate' },
  { name: 'pre-tester',                 path: 'agents/quality/pre-tester.md',                               kind: 'gate' },
  { name: 'executor-fix',               path: 'agents/executor/executor-fix.md',                            kind: 'gate' },
  { name: 'executor-implementer-task',  path: 'agents/executor/executor-implementer-task.md',               kind: 'gate' },
  { name: 'spec-closer',                path: 'agents/executor/spec-closer.md',                             kind: 'gate' },
  { name: 'feature-implementer',        path: 'agents/executor/type-specific/feature-implementer.md',       kind: 'gate' },
  { name: 'bugfix-diagnostic-agent',    path: 'agents/executor/type-specific/bugfix-diagnostic-agent.md',   kind: 'gate' },
  { name: 'bugfix-root-cause-analyzer', path: 'agents/executor/type-specific/bugfix-root-cause-analyzer.md',kind: 'gate' },
  { name: 'bugfix-regression-tester',   path: 'agents/executor/type-specific/bugfix-regression-tester.md',  kind: 'gate' },
  { name: 'ux-simulator',               path: 'agents/executor/type-specific/ux-simulator.md',              kind: 'gate' },
  { name: 'ux-accessibility-auditor',   path: 'agents/executor/type-specific/ux-accessibility-auditor.md',  kind: 'gate' },
  { name: 'ux-qa-validator',            path: 'agents/executor/type-specific/ux-qa-validator.md',           kind: 'gate' },
  { name: 'architecture-reviewer',      path: 'agents/quality/architecture-reviewer.md',                    kind: 'gate' },
  { name: 'sanity-checker',             path: 'agents/core/sanity-checker.md',                              kind: 'gate' },
];

const REQUIRED_PATTERNS_COMMON = [
  { label: 'mentions ACHADO #7 RUNTIME PROTOCOL section header', pattern: /ACHADO\s*#?7\s+RUNTIME\s+PROTOCOL/i },
  { label: 'mentions runtime stripping or harness',              pattern: /(strip|harness|runtime)/i },
];

const REQUIRED_PATTERNS_BY_KIND = {
  gate: [
    { label: 'mentions GATE_REQUEST v1 block',          pattern: /GATE_REQUEST\s+v1/i },
    { label: 'mentions AWAITING_GATE_RESPONSES status', pattern: /AWAITING_GATE_RESPONSES/i },
  ],
  plan: [
    { label: 'mentions PLAN_MODE_REQUEST v1 block',         pattern: /PLAN_MODE_REQUEST\s+v1/i },
    { label: 'mentions AWAITING_PLAN_MODE_RESULTS status',  pattern: /AWAITING_PLAN_MODE_RESULTS/i },
    { label: 'mentions expected_deliverables field',        pattern: /expected_deliverables/i },
  ],
};

const SCHEMA_RULES = [
  // F3-1 drift — must use snake_case multi_select where multi-select is referenced anywhere
  { label: 'no multiSelect (camelCase) anywhere',
    must_match: null,
    must_not_match: /multiSelect\s*:/ },
  // F3-1 drift — worked example must use recommended:true field (for gate kind)
  // (we apply this only to gate kind below)
];

const PLACEHOLDER_LEAK_RULES = [
  // F3-4 — no literal {n} or {run_id} or {paths from ...} inside YAML value positions in the WORKED EXAMPLE
  // Heuristic: count {curly} in the lines between "=== GATE_REQUEST v1 ===" and "=== END GATE_REQUEST ==="
  // For each block, fail if any line in value position contains {literal_placeholder}
  { label: 'worked example has no literal {placeholder} in value positions' },
];

function checkPlaceholderLeak(content, sentinelStart, sentinelEnd) {
  const startIdx = content.indexOf(sentinelStart);
  const endIdx   = content.indexOf(sentinelEnd, startIdx + 1);
  if (startIdx === -1 || endIdx === -1) return { ok: true, reason: 'block not present' };
  const block = content.slice(startIdx, endIdx);
  // Allow {placeholders} in prose lines that start with #, but flag in value positions ": {..."
  const lines = block.split('\n');
  const offenders = [];
  for (const ln of lines) {
    const cleaned = ln.replace(/#.*$/, '').trim();
    // value-position placeholder: e.g. `field: "{like_this}"` or `field: {like_this}`
    if (/:\s*['"]?\{[a-z_][a-z0-9_\s-]*\}['"]?\s*$/i.test(cleaned)) {
      offenders.push(cleaned);
    }
  }
  if (offenders.length === 0) return { ok: true };
  return { ok: false, reason: `value-pos placeholders: ${offenders.slice(0, 3).join(' | ')}` };
}

function check(target) {
  const filePath = path.join(ROOT, target.path);
  if (!fs.existsSync(filePath)) {
    return { name: target.name, status: 'FAIL', failures: [`file not found: ${filePath}`] };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const failures = [];

  // Required patterns — common
  for (const p of REQUIRED_PATTERNS_COMMON) {
    if (!p.pattern.test(content)) failures.push(`missing pattern: ${p.label}`);
  }
  // Required patterns — by kind
  const byKind = REQUIRED_PATTERNS_BY_KIND[target.kind] || [];
  for (const p of byKind) {
    if (!p.pattern.test(content)) failures.push(`missing pattern (${target.kind}): ${p.label}`);
  }

  // Schema rules
  for (const rule of SCHEMA_RULES) {
    if (rule.must_match && !rule.must_match.test(content)) {
      failures.push(`schema rule failed: ${rule.label} (must_match)`);
    }
    if (rule.must_not_match && rule.must_not_match.test(content)) {
      failures.push(`schema rule failed: ${rule.label} (must_not_match — drift detected)`);
    }
  }
  // Gate-kind specific: recommended:true in worked example
  if (target.kind === 'gate' && !/recommended:\s*true/i.test(content)) {
    failures.push(`schema rule failed: gate worked example must use recommended: true field`);
  }

  // Placeholder leak in worked example block
  const leak = checkPlaceholderLeak(content, '=== GATE_REQUEST v1 ===', '=== END GATE_REQUEST ===');
  if (!leak.ok) failures.push(`placeholder leak in GATE_REQUEST example: ${leak.reason}`);

  if (failures.length === 0) return { name: target.name, status: 'PASS' };
  return { name: target.name, status: 'FAIL', failures };
}

let allPass = true;
const counts = { pass: 0, fail: 0 };
console.log('=== D2 + D2-extension regression — Achado #7 protocol compliance (' + TARGETS.length + ' subagents) ===');
for (const target of TARGETS) {
  const result = check(target);
  if (result.status === 'PASS') {
    console.log(`  [PASS] ${result.name}`);
    counts.pass++;
  } else {
    console.log(`  [FAIL] ${result.name}`);
    for (const f of result.failures) console.log(`         - ${f}`);
    counts.fail++;
    allPass = false;
  }
}
console.log(`\nSummary: ${counts.pass} pass / ${counts.fail} fail / ${TARGETS.length} total`);
if (allPass) {
  console.log('ALL PASS');
  process.exit(0);
} else {
  console.log('FAILED');
  process.exit(1);
}
