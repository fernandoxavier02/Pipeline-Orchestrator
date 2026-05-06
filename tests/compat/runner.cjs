#!/usr/bin/env node
/**
 * tests/compat/runner.cjs — Compat Regression Suite runner (Slice 4 / Issue #11)
 *
 * Loads scenarios from tests/compat/v4-baseline/scenarios/<name>/, executes /pipeline
 * against each input.md, compares observable contract (5 fields) against expected.yaml,
 * reports PASS/DIVERGED/ERROR per scenario with strict exit codes.
 *
 * Usage:
 *   node tests/compat/runner.cjs --all
 *   node tests/compat/runner.cjs --scenario=bugfix-fixture
 *   node tests/compat/runner.cjs --all --verbose
 *   node tests/compat/runner.cjs --all --mock     (offline; no claude CLI)
 *   node tests/compat/runner.cjs --all --mock --allow-templates-skipped
 *                                                  (CI-only: treats all-SKIPPED + mock as exit 0
 *                                                   with explicit warning. Rejected if not paired
 *                                                   with --mock — real-mode all-skipped is a
 *                                                   genuine problem worth exit 1.)
 *
 * Exit codes:
 *   0 = all PASS
 *   1 = at least one DIVERGED or ERROR
 *   2 = config error (missing scenario, missing expected.yaml, etc.)
 *
 * Performance budget:
 *   Per scenario: < 60s (mock), < 90s (real)
 *   Total suite:  < 5 min (CI requirement)
 *
 * Real mode (Issue #11, v4.16.0):
 *   - Spawns `claude -p "<input.md>" --settings <tmp> --output-format stream-json
 *     --verbose --include-partial-messages --permission-mode bypassPermissions
 *     --allowedTools "Read Glob Grep Write Edit AskUserQuestion Task"`.
 *     (--verbose is required by claude when --output-format=stream-json with --print.)
 *   - Tmp settings.json wires PreToolUse → tests/compat/auto-answer-hook.cjs as command hook
 *     scoped by matcher: "AskUserQuestion".
 *   - Hook auto-answers AskUserQuestion via permissionDecision="allow" + updatedInput.answers
 *     (Claude Code v2.1.85+ contract — see auto-answer-hook.cjs header for schema).
 *   - Stream-json output is parsed line-by-line; observable contract is reconstructed from
 *     system/init (agent roster), tool_use blocks (Task spawns + gate-decisions writes), and
 *     final result.
 *   - 90s hard timeout via spawnSync timeout + SIGKILL.
 *   - Cleanup: tmp settings file removed; any .pipeline/docs/Pre-*-action/<session>/ created by
 *     the run is left for forensics (caller can rm -rf afterwards if desired).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────────

const SCENARIOS_DIR = path.join(__dirname, 'v4-baseline', 'scenarios');
const HOOK_PATH = path.join(__dirname, 'auto-answer-hook.cjs');
const PER_SCENARIO_BUDGET_MS = { mock: 60_000, real: 90_000 };
const TOTAL_BUDGET_MS = 5 * 60 * 1000; // 5min hard cap

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts = {
  all: args.includes('--all'),
  scenario: (args.find((a) => a.startsWith('--scenario=')) || '').split('=')[1] || null,
  verbose: args.includes('--verbose'),
  mock: args.includes('--mock'),
  allowTemplatesSkipped: args.includes('--allow-templates-skipped'),
};

if (!opts.all && !opts.scenario) {
  console.error('Usage: node runner.cjs (--all | --scenario=<name>) [--verbose] [--mock] [--allow-templates-skipped]');
  process.exit(2);
}

if (opts.allowTemplatesSkipped && !opts.mock) {
  console.error('--allow-templates-skipped requires --mock (real-mode all-skipped is a real failure)');
  process.exit(2);
}

// ─── Scenario discovery ────────────────────────────────────────────────────

function listScenarios() {
  if (!fs.existsSync(SCENARIOS_DIR)) {
    console.error(`ERROR: scenarios dir not found: ${SCENARIOS_DIR}`);
    process.exit(2);
  }
  return fs
    .readdirSync(SCENARIOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function selectScenarios() {
  const all = listScenarios();
  if (opts.scenario) {
    if (!all.includes(opts.scenario)) {
      console.error(`ERROR: scenario "${opts.scenario}" not found. Available: ${all.join(', ')}`);
      process.exit(2);
    }
    return [opts.scenario];
  }
  if (all.length === 0) {
    console.error('ERROR: no scenarios found in scenarios/');
    process.exit(2);
  }
  return all;
}

// ─── Minimal YAML parser (subset sufficient for expected.yaml shape) ──────

function parseYaml(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s*#.*$/, ''))
    .filter((l) => l.trim().length > 0);

  const root = {};
  const stack = [{ indent: -1, value: root, type: 'object' }];

  function coerce(v) {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    if (t === '') return null;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null' || t === '~') return null;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indent = raw.match(/^(\s*)/)[1].length;
    const line = raw.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const top = stack[stack.length - 1];

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim();
      if (top.type !== 'array') continue;

      if (item.startsWith('{') && item.endsWith('}')) {
        const obj = {};
        item
          .slice(1, -1)
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0 && p.includes(':'))
          .forEach((p) => {
            const colonIdx = p.indexOf(':');
            const k = p.slice(0, colonIdx).trim();
            const v = p.slice(colonIdx + 1).trim();
            if (k.length === 0) return;
            obj[k] = coerce(v);
          });
        top.value.push(obj);
      } else if (item.includes(':')) {
        const colonIdx = item.indexOf(':');
        const k = item.slice(0, colonIdx).trim();
        const v = item.slice(colonIdx + 1).trim();
        const obj = {};
        if (v.length > 0) {
          obj[k] = coerce(v);
        } else {
          obj[k] = {};
          stack.push({ indent: indent + 2, value: obj[k], type: 'object' });
        }
        top.value.push(obj);
        if (v.length === 0) stack.push({ indent, value: obj, type: 'object' });
      } else {
        top.value.push(coerce(item));
      }
      continue;
    }

    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();

    if (value.length === 0) {
      const next = lines[i + 1];
      if (next && next.trim().startsWith('- ')) {
        const arr = [];
        top.value[key] = arr;
        stack.push({ indent, value: arr, type: 'array' });
      } else {
        const child = {};
        top.value[key] = child;
        stack.push({ indent, value: child, type: 'object' });
      }
    } else {
      top.value[key] = coerce(value);
    }
  }

  return root;
}

// ─── Pipeline execution (mock or real) ─────────────────────────────────────

function executeMock(scenarioName, inputMd) {
  const mockPath = path.join(SCENARIOS_DIR, scenarioName, 'mock-output.json');
  if (!fs.existsSync(mockPath)) {
    throw new Error(
      `mock-output.json missing for scenario "${scenarioName}". Mock mode requires a captured fixture (see tests/compat/README.md "Modo mock vs real"). To capture: run scenario in real mode, save observable contract to mock-output.json, commit.`
    );
  }
  return JSON.parse(fs.readFileSync(mockPath, 'utf8'));
}

// ─── Real-mode helpers (Issue #11) ─────────────────────────────────────────

function writeTmpSettings(hookPath) {
  // Build a settings.json that wires PreToolUse → auto-answer-hook.cjs scoped by
  // matcher "AskUserQuestion". Per Claude Code hook docs (code.claude.com/docs/en/hooks),
  // the matcher is matched against tool_name; we use exact tool name here.
  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'AskUserQuestion',
          hooks: [
            {
              type: 'command',
              command: `node "${hookPath.replace(/\\/g, '\\\\')}"`,
            },
          ],
        },
      ],
    },
  };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-runner-'));
  const settingsPath = path.join(tmpDir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return { settingsPath, tmpDir };
}

function parseStreamJson(stdout) {
  // Stream-json output is one JSON object per line. We aggregate into a single observable
  // contract object matching the 5 fields in expected.yaml.
  const observable = {
    classification: { type: null, complexity: null, pipeline_variant: null },
    gates_triggered: [],
    agents_invoked: new Set(),
    artifacts_produced: new Set(),
    verdict: null,
  };

  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  for (const line of lines) {
    let evt;
    try {
      evt = JSON.parse(line);
    } catch (e) {
      continue; // tolerate non-JSON noise lines
    }

    // 1. Agents — system/init lists subagent_types loaded; tool_use Task blocks call them.
    if (evt.type === 'system' && evt.subtype === 'init') {
      if (Array.isArray(evt.agents)) evt.agents.forEach((a) => observable.agents_invoked.add(a));
    }
    if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
      for (const block of evt.message.content) {
        if (block.type === 'tool_use' && block.name === 'Task') {
          const sub = block.input && (block.input.subagent_type || block.input.agent_type);
          if (sub) observable.agents_invoked.add(sub);
        }
        // Artifact tracking: Write tool_use with file_path under PIPELINE_DOC_PATH.
        if (block.type === 'tool_use' && (block.name === 'Write' || block.name === 'Edit')) {
          const fp = block.input && block.input.file_path;
          if (fp && /[\\/]Pre-[^\\/]+-action[\\/]/.test(fp)) {
            observable.artifacts_produced.add(path.basename(fp));
          }
        }
      }
    }

    // 2. Final result — verdict marker and classification block.
    if (evt.type === 'result') {
      const txt = (evt.result && (evt.result.text || JSON.stringify(evt.result))) || '';
      const m = txt.match(/\bFINAL DECISION:\s*(GO|CONDITIONAL|NO-GO)\b/);
      if (m) observable.verdict = m[1];
      const cls = txt.match(/Classification:\s*([\w-]+)\s*\/\s*(SIMPLES|MEDIA|COMPLEXA)/i);
      if (cls) {
        observable.classification.type = cls[1].toLowerCase();
        observable.classification.complexity = cls[2].toUpperCase();
      }
      const variant = txt.match(/Pipeline:\s*([\w-]+(?:-light|-heavy|-only)?)/);
      if (variant) observable.classification.pipeline_variant = variant[1];
    }
  }

  return {
    classification: observable.classification,
    gates_triggered: observable.gates_triggered,
    agents_invoked: Array.from(observable.agents_invoked),
    artifacts_produced: Array.from(observable.artifacts_produced),
    verdict: observable.verdict,
  };
}

function recoverGatesFromArtifact(scenarioName) {
  // Post-run, scan .pipeline/docs/Pre-*-action/* (cwd) for the most recent session's
  // gate-decisions.jsonl. Best-effort — if absent, gates_triggered stays empty (will diverge
  // visibly against expected.yaml so the operator knows to investigate).
  const pipelineDocs = path.resolve(process.cwd(), '.pipeline', 'docs');
  if (!fs.existsSync(pipelineDocs)) return [];
  const subdirs = [];
  for (const lvl of fs.readdirSync(pipelineDocs)) {
    const lvlPath = path.join(pipelineDocs, lvl);
    if (!fs.statSync(lvlPath).isDirectory()) continue;
    if (!/^Pre-/.test(lvl)) continue;
    for (const session of fs.readdirSync(lvlPath)) {
      const sessionPath = path.join(lvlPath, session);
      if (!fs.statSync(sessionPath).isDirectory()) continue;
      const gatesFile = path.join(sessionPath, 'gate-decisions.jsonl');
      if (fs.existsSync(gatesFile)) {
        subdirs.push({ path: gatesFile, mtime: fs.statSync(gatesFile).mtimeMs });
      }
    }
  }
  if (subdirs.length === 0) return [];
  subdirs.sort((a, b) => b.mtime - a.mtime);
  const latest = subdirs[0].path;
  const lines = fs.readFileSync(latest, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const gates = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.gate && obj.hardness && obj.decision) {
        gates.push({ gate: obj.gate, hardness: obj.hardness, decision: obj.decision });
      }
    } catch (e) {
      // ignore malformed lines
    }
  }
  return gates;
}

function executeReal(scenarioName, inputMd) {
  // Issue #11: real-mode invocation of `claude -p` with PreToolUse auto-answer hook.
  const claudeBin = process.env.CLAUDE_BIN || 'claude';
  const probe = spawnSync(claudeBin, ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    throw new Error(
      `Real mode requires claude CLI on PATH (or CLAUDE_BIN env var). Probe failed: ${probe.error || probe.stderr || 'no claude binary'}. Use --mock for offline runs.`
    );
  }

  if (!fs.existsSync(HOOK_PATH)) {
    throw new Error(
      `auto-answer-hook.cjs missing at ${HOOK_PATH}. Real mode cannot satisfy AskUserQuestion gates without the hook.`
    );
  }

  const { settingsPath, tmpDir } = writeTmpSettings(HOOK_PATH);

  try {
    const claudeArgs = [
      '-p',
      inputMd,
      '--settings',
      settingsPath,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'bypassPermissions',
      '--allowedTools',
      'Read Glob Grep Write Edit AskUserQuestion Task',
    ];

    const result = spawnSync(claudeBin, claudeArgs, {
      encoding: 'utf8',
      timeout: PER_SCENARIO_BUDGET_MS.real,
      killSignal: 'SIGKILL',
      maxBuffer: 50 * 1024 * 1024, // 50MB — pipeline output can be large
    });

    if (result.error) {
      throw new Error(`claude spawn failed: ${result.error.message}`);
    }
    if (result.status === null) {
      throw new Error(`claude run timed out after ${PER_SCENARIO_BUDGET_MS.real / 1000}s (killed)`);
    }
    if (result.status !== 0) {
      const tail = (result.stderr || '').split('\n').slice(-5).join('\n');
      throw new Error(`claude exited ${result.status}. Stderr tail:\n${tail}`);
    }

    const parsed = parseStreamJson(result.stdout);
    // Recover gates from PIPELINE_DOC_PATH/gate-decisions.jsonl (stream-json text scan can't
    // reliably reconstruct gate hardness/decision tuples).
    const recoveredGates = recoverGatesFromArtifact(scenarioName);
    if (recoveredGates.length > 0 && parsed.gates_triggered.length === 0) {
      parsed.gates_triggered = recoveredGates;
    }

    return parsed;
  } finally {
    try {
      fs.unlinkSync(settingsPath);
      fs.rmdirSync(tmpDir);
    } catch (e) {
      // best-effort cleanup
    }
  }
}

// ─── Comparison: observable contract ───────────────────────────────────────

function canonicalize(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canonicalize).join(',') + ']';
  const keys = Object.keys(x).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(x[k])).join(',') + '}';
}

function setEqual(a, b) {
  const sa = new Set((a || []).map(canonicalize));
  const sb = new Set((b || []).map(canonicalize));
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

function compare(actual, expected) {
  const diffs = [];

  const c = expected.classification || {};
  const a = actual.classification || {};
  for (const k of ['type', 'complexity', 'pipeline_variant']) {
    if (c[k] !== a[k]) diffs.push(`classification.${k}: expected=${c[k]} actual=${a[k]}`);
  }

  const eg = (expected.gates_triggered || []).map((g) => ({
    gate: g.gate,
    hardness: g.hardness,
    decision: g.decision,
  }));
  const ag = (actual.gates_triggered || []).map((g) => ({
    gate: g.gate,
    hardness: g.hardness,
    decision: g.decision,
  }));
  if (!setEqual(eg, ag)) {
    const missing = eg.filter((g) => !ag.find((x) => x.gate === g.gate));
    const extra = ag.filter((g) => !eg.find((x) => x.gate === g.gate));
    if (missing.length) diffs.push(`gates_triggered missing: ${missing.map((g) => g.gate).join(', ')}`);
    if (extra.length) diffs.push(`gates_triggered extra: ${extra.map((g) => g.gate).join(', ')}`);
  }

  const ea = expected.agents_invoked || [];
  const aa = actual.agents_invoked || [];
  if (!setEqual(ea, aa)) {
    const missing = ea.filter((x) => !aa.includes(x));
    const extra = aa.filter((x) => !ea.includes(x));
    if (missing.length) diffs.push(`agents_invoked missing: ${missing.join(', ')}`);
    if (extra.length) diffs.push(`agents_invoked extra: ${extra.join(', ')}`);
  }

  const eart = (expected.artifacts_produced || []).map((p) => path.basename(p));
  const aart = (actual.artifacts_produced || []).map((p) => path.basename(p));
  if (!setEqual(eart, aart)) {
    const missing = eart.filter((x) => !aart.includes(x));
    const extra = aart.filter((x) => !eart.includes(x));
    if (missing.length) diffs.push(`artifacts_produced missing: ${missing.join(', ')}`);
    if (extra.length) diffs.push(`artifacts_produced extra: ${extra.join(', ')}`);
  }

  if (expected.verdict !== actual.verdict) {
    diffs.push(`verdict: expected=${expected.verdict} actual=${actual.verdict}`);
  }

  return diffs;
}

// ─── Main loop ─────────────────────────────────────────────────────────────

function runScenario(name) {
  const dir = path.join(SCENARIOS_DIR, name);
  const inputPath = path.join(dir, 'input.md');
  const expectedPath = path.join(dir, 'expected.yaml');
  if (!fs.existsSync(inputPath)) return { name, status: 'ERROR', diffs: [`input.md missing in ${dir}`], duration_ms: 0 };
  if (!fs.existsSync(expectedPath)) return { name, status: 'ERROR', diffs: [`expected.yaml missing in ${dir}`], duration_ms: 0 };

  const inputMd = fs.readFileSync(inputPath, 'utf8');
  let expected;
  try {
    expected = parseYaml(fs.readFileSync(expectedPath, 'utf8'));
  } catch (e) {
    return { name, status: 'ERROR', diffs: [`yaml parse failed: ${e.message}`], duration_ms: 0 };
  }

  if (
    expected.baseline_method &&
    typeof expected.baseline_method === 'string' &&
    /\btemplate\b/i.test(expected.baseline_method)
  ) {
    return {
      name,
      status: 'SKIPPED',
      diffs: [`expected.yaml is a TEMPLATE (baseline_method="${expected.baseline_method}"); capture real baseline first`],
      duration_ms: 0,
    };
  }

  const start = Date.now();
  let actual;
  try {
    actual = opts.mock ? executeMock(name, inputMd) : executeReal(name, inputMd);
  } catch (e) {
    return { name, status: 'ERROR', diffs: [`execution failed: ${e.message}`], duration_ms: Date.now() - start };
  }
  const duration = Date.now() - start;

  const budget = opts.mock ? PER_SCENARIO_BUDGET_MS.mock : PER_SCENARIO_BUDGET_MS.real;
  const overBudget = duration > budget;

  const diffs = compare(actual, expected);
  const status = diffs.length === 0 ? 'PASS' : 'DIVERGED';

  return { name, status, diffs, duration_ms: duration, over_budget: overBudget };
}

function main() {
  const scenarios = selectScenarios();
  console.log(`\n=== Compat Regression Suite ===`);
  console.log(`Mode: ${opts.mock ? 'mock' : 'real'} | Scenarios: ${scenarios.length}\n`);

  const totalStart = Date.now();
  const results = [];

  for (const name of scenarios) {
    process.stdout.write(`  ${name} ... `);
    const r = runScenario(name);
    results.push(r);
    const dur = `(${(r.duration_ms / 1000).toFixed(1)}s)`;
    const flag = r.over_budget ? ' OVER_BUDGET' : '';
    if (r.status === 'PASS') console.log(`PASS ${dur}${flag}`);
    else if (r.status === 'SKIPPED') console.log(`SKIPPED ${dur} - ${r.diffs[0]}`);
    else if (r.status === 'DIVERGED') {
      console.log(`DIVERGED ${dur}${flag}`);
      r.diffs.forEach((d) => console.log(`     ${d}`));
    } else {
      console.log(`ERROR ${dur}`);
      r.diffs.forEach((d) => console.log(`     ${d}`));
    }
  }

  const totalDuration = Date.now() - totalStart;

  const resultsFile = path.join(__dirname, 'results.json');
  fs.writeFileSync(
    resultsFile,
    JSON.stringify(
      {
        ran_at: new Date().toISOString(),
        mode: opts.mock ? 'mock' : 'real',
        total_duration_ms: totalDuration,
        results,
      },
      null,
      2
    )
  );

  console.log(`\n=== Summary ===`);
  const counts = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  console.log(`  PASS:     ${counts.PASS || 0}`);
  console.log(`  DIVERGED: ${counts.DIVERGED || 0}`);
  console.log(`  ERROR:    ${counts.ERROR || 0}`);
  console.log(`  SKIPPED:  ${counts.SKIPPED || 0}`);
  console.log(`  Total:    ${(totalDuration / 1000).toFixed(1)}s (budget ${TOTAL_BUDGET_MS / 1000}s)`);
  console.log(`  Results:  ${resultsFile}`);

  if (totalDuration > TOTAL_BUDGET_MS) console.log(`  TOTAL OVER BUDGET`);

  if (counts.ERROR) process.exit(2);
  if (counts.DIVERGED) process.exit(1);
  if ((counts.PASS || 0) === 0 && (counts.SKIPPED || 0) > 0) {
    if (opts.allowTemplatesSkipped && opts.mock) {
      console.log(`  ALL-SKIPPED + MOCK + --allow-templates-skipped - exit 0 with warning. Capture real baselines for green validation.`);
      process.exit(0);
    }
    console.log(`  NO REAL VALIDATION - only SKIPPED scenarios. Capture baselines before claiming green.`);
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main();
} else {
  module.exports = { parseStreamJson, writeTmpSettings, executeReal, recoverGatesFromArtifact };
}
