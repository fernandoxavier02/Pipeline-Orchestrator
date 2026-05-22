#!/usr/bin/env node
// =============================================================================
// F5 — Tracing scope policy (REQ-E-1 .. REQ-E-5, REQ-INV-3, REQ-INV-4)
// =============================================================================
// Spec: .kiro/specs/tracing-concurrent-execution-id/
// Covers the PIPELINE_TRACING_SCOPE contract published in the langfuse hook.
//
// Five sub-scenarios:
//   S1 — env-var absent           → agent-only (REQ-E-2, default = v7.4.0 parity)
//   S2 — explicit agent-only       → same as S1
//   S3 — agent-plus-skill          → Agent and Skill pass, Read/Bash blocked (REQ-E-3)
//   S4 — full                       → every tool passes (REQ-E-4)
//   S5 — unknown value (bogus)     → safe-default = agent-only + AUDIT (REQ-E-5)
//
// The hook exposes shouldTrace(toolName, scope) for unit-level testing of the
// matrix; the AUDIT TRACING_SCOPE_UNKNOWN is observed on stderr.
// =============================================================================

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'langfuse-hook.cjs');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg || ''}`); }
}

function probeMatrix(scope, tools) {
  // Child process loads the hook module and reports shouldTrace results for
  // every tool name in `tools` against `scope`. stderr captures AUDIT events.
  const script = `
'use strict';
const { shouldTrace } = require(${JSON.stringify(HOOK)});
const scope = process.env.PROBE_SCOPE || null;
const tools = JSON.parse(process.env.PROBE_TOOLS || '[]');
const out = {};
for (const t of tools) out[t] = shouldTrace(t, scope);
process.stdout.write(JSON.stringify(out) + '\\n');
`;
  return spawnSync(process.execPath, ['-e', script], {
    cwd: ROOT,
    env: {
      ...process.env,
      PROBE_SCOPE: scope === null ? '' : scope,
      PROBE_TOOLS: JSON.stringify(tools),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10000,
  });
}

const ALL_TOOLS = ['Agent', 'Skill', 'Read', 'Write', 'Edit', 'Bash', 'Grep', 'AskUserQuestion'];

function getMatrix(r) {
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout.trim()); } catch (_e) { return null; }
}

// ---------------------------------------------------------------------------
(function s1Default() {
  const r = probeMatrix(null, ALL_TOOLS);
  const m = getMatrix(r);
  if (!m) {
    record('S1 default scope probe runs', false, `status=${r.status} stderr=${r.stderr}`);
    return;
  }
  record('S1 default scope: Agent passes', m.Agent === true);
  const onlyAgent = ALL_TOOLS.filter(t => t !== 'Agent').every(t => m[t] === false);
  record('S1 default scope: all non-Agent tools rejected (v7.4.0 parity)',
    onlyAgent, `matrix=${JSON.stringify(m)}`);
})();

// ---------------------------------------------------------------------------
(function s2ExplicitAgentOnly() {
  const r = probeMatrix('agent-only', ALL_TOOLS);
  const m = getMatrix(r);
  if (!m) {
    record('S2 explicit agent-only probe runs', false, `stderr=${r.stderr}`);
    return;
  }
  record('S2 explicit agent-only matches default',
    m.Agent === true
    && ALL_TOOLS.filter(t => t !== 'Agent').every(t => m[t] === false),
    `matrix=${JSON.stringify(m)}`);
})();

// ---------------------------------------------------------------------------
(function s3AgentPlusSkill() {
  const r = probeMatrix('agent-plus-skill', ALL_TOOLS);
  const m = getMatrix(r);
  if (!m) {
    record('S3 agent-plus-skill probe runs', false, `stderr=${r.stderr}`);
    return;
  }
  record('S3 Agent passes', m.Agent === true);
  record('S3 Skill passes', m.Skill === true);
  const others = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'AskUserQuestion'];
  record('S3 other tools rejected',
    others.every(t => m[t] === false),
    `matrix=${JSON.stringify(m)}`);
})();

// ---------------------------------------------------------------------------
(function s4Full() {
  const r = probeMatrix('full', ALL_TOOLS);
  const m = getMatrix(r);
  if (!m) {
    record('S4 full scope probe runs', false, `stderr=${r.stderr}`);
    return;
  }
  record('S4 full scope: every tool passes',
    ALL_TOOLS.every(t => m[t] === true),
    `matrix=${JSON.stringify(m)}`);
})();

// ---------------------------------------------------------------------------
(function s5Unknown() {
  const r = probeMatrix('bogus-value', ALL_TOOLS);
  const m = getMatrix(r);
  if (!m) {
    record('S5 unknown scope probe runs', false, `stderr=${r.stderr}`);
    return;
  }
  // Safe-default: behaves as agent-only.
  record('S5 unknown scope falls back to agent-only (Agent passes)',
    m.Agent === true);
  const safeDefault = ALL_TOOLS.filter(t => t !== 'Agent').every(t => m[t] === false);
  record('S5 unknown scope blocks all non-Agent tools',
    safeDefault, `matrix=${JSON.stringify(m)}`);
  const auditOk = (r.stderr || '').includes('TRACING_SCOPE_UNKNOWN');
  record('S5 unknown scope emits AUDIT TRACING_SCOPE_UNKNOWN',
    auditOk, `stderr=${r.stderr}`);
})();

console.log(results.join('\n'));
console.log(`\nF5 summary: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
