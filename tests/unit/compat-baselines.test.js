#!/usr/bin/env node
/**
 * tests/unit/compat-baselines.test.js
 *
 * Wave 3 (v4.10.0) — validates that all 5 compat fixtures graduated from TEMPLATE to REAL
 * baselines. Each fixture now has:
 *   - expected.yaml with baseline_method starting with "REAL" (no longer "TEMPLATE")
 *   - mock-output.json with the 5 observable fields matching expected.yaml
 *
 * Together these tests guarantee that:
 *   1. No fixture silently regresses to TEMPLATE state (which would trigger SKIPPED in runner)
 *   2. mock-output.json stays in sync with expected.yaml (so --mock runs continue to PASS)
 *   3. runner --all --mock returns exit 0 naturally without --allow-templates-skipped fallback
 *
 * If a future PR intentionally changes the observable contract for a fixture, both expected.yaml
 * AND mock-output.json must be updated together (or these tests fail).
 *
 * Run: node --test tests/unit/compat-baselines.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCENARIOS_DIR = path.resolve(__dirname, '..', 'compat', 'v4-baseline', 'scenarios');
const RUNNER = path.resolve(__dirname, '..', 'compat', 'runner.cjs');
const FIXTURES = ['audit-fixture', 'bugfix-fixture', 'feature-fixture', 'hotfix-fixture', 'ux-fixture'];

// Reuse the runner's own minimal YAML parser by spawning a small helper; simpler: re-implement
// the subset we need (key:value, list items, basic coercion). Kept narrow on purpose.
function parseSimpleYaml(text) {
  const result = {};
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s*#.*$/, ''))
    .filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_][\w]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    result[m[1]] = v;
  }
  return result;
}

test('all 5 fixtures have baseline_method starting with REAL (not TEMPLATE)', () => {
  for (const fx of FIXTURES) {
    const yamlPath = path.join(SCENARIOS_DIR, fx, 'expected.yaml');
    assert.ok(fs.existsSync(yamlPath), `expected.yaml missing for ${fx}`);
    const top = parseSimpleYaml(fs.readFileSync(yamlPath, 'utf8'));
    assert.ok(top.baseline_method, `baseline_method missing in ${fx}/expected.yaml`);
    assert.ok(
      /^REAL\b/.test(top.baseline_method),
      `${fx}/expected.yaml baseline_method should start with "REAL", got: ${top.baseline_method.slice(0, 80)}`
    );
    assert.ok(
      !/\btemplate\b/i.test(top.baseline_method),
      `${fx}/expected.yaml baseline_method must NOT contain "template" word: ${top.baseline_method.slice(0, 80)}`
    );
  }
});

test('all 5 fixtures have mock-output.json with the 5 observable fields', () => {
  const requiredFields = ['classification', 'gates_triggered', 'agents_invoked', 'artifacts_produced', 'verdict'];
  for (const fx of FIXTURES) {
    const mockPath = path.join(SCENARIOS_DIR, fx, 'mock-output.json');
    assert.ok(fs.existsSync(mockPath), `mock-output.json missing for ${fx}`);
    const mock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
    for (const field of requiredFields) {
      assert.ok(field in mock, `${fx}/mock-output.json missing field: ${field}`);
    }
    assert.ok(
      mock.classification && typeof mock.classification === 'object',
      `${fx}/mock-output.json.classification should be an object`
    );
    for (const k of ['type', 'complexity', 'pipeline_variant']) {
      assert.ok(
        typeof mock.classification[k] === 'string' && mock.classification[k].length > 0,
        `${fx}/mock-output.json.classification.${k} missing or empty`
      );
    }
    assert.ok(Array.isArray(mock.gates_triggered) && mock.gates_triggered.length > 0, `${fx} gates_triggered empty`);
    assert.ok(Array.isArray(mock.agents_invoked) && mock.agents_invoked.length > 0, `${fx} agents_invoked empty`);
    assert.ok(Array.isArray(mock.artifacts_produced) && mock.artifacts_produced.length > 0, `${fx} artifacts_produced empty`);
    assert.ok(['GO', 'CONDITIONAL', 'NO-GO'].includes(mock.verdict), `${fx} verdict must be GO|CONDITIONAL|NO-GO, got ${mock.verdict}`);
  }
});

test('runner --all --mock exits 0 naturally (no --allow-templates-skipped flag needed)', () => {
  const result = spawnSync(process.execPath, [RUNNER, '--all', '--mock'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(
    result.status,
    0,
    `runner --all --mock should exit 0 with REAL baselines.\nstatus=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.match(result.stdout, /PASS:\s+5/, `expected "PASS: 5" in stdout, got:\n${result.stdout}`);
  assert.match(result.stdout, /SKIPPED:\s+0/, `expected "SKIPPED: 0" in stdout, got:\n${result.stdout}`);
});

test('each fixture passes individually via runner --scenario=<name> --mock', () => {
  for (const fx of FIXTURES) {
    const result = spawnSync(process.execPath, [RUNNER, `--scenario=${fx}`, '--mock'], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(
      result.status,
      0,
      `runner --scenario=${fx} --mock should exit 0.\nstatus=${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.match(result.stdout, new RegExp(`${fx} \\.\\.\\. PASS`), `expected PASS for ${fx}, got:\n${result.stdout}`);
  }
});

test('hotfix-fixture preserves HOTFIX-specific contract markers', () => {
  const mockPath = path.join(SCENARIOS_DIR, 'hotfix-fixture', 'mock-output.json');
  const mock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));

  assert.equal(mock.classification.mode, 'hotfix', 'hotfix mock must declare classification.mode=hotfix');
  assert.equal(mock.classification.severity, 'Critical', 'hotfix mock must declare classification.severity=Critical');

  const artifactBasenames = mock.artifacts_produced.map((p) => path.basename(p));
  assert.ok(artifactBasenames.includes('HOTFIX_LOG.md'), 'hotfix mock artifacts must include HOTFIX_LOG.md');

  const finalAdvGate = mock.gates_triggered.find((g) => g.gate === 'FINAL_ADVERSARIAL_GATE');
  assert.ok(finalAdvGate, 'hotfix mock must declare FINAL_ADVERSARIAL_GATE in gates_triggered');
  assert.equal(
    finalAdvGate.decision,
    'SKIPPED',
    'FINAL_ADVERSARIAL_GATE.decision must be SKIPPED in HOTFIX (typically declined under emergency time pressure)'
  );

  // adversarial-architecture-critic and adversarial-quality-reviewer must NOT be in agents_invoked
  // (HOTFIX uses 2 checklists only: auth + injection via adversarial-security-scanner).
  assert.ok(
    !mock.agents_invoked.includes('adversarial-architecture-critic'),
    'hotfix mock must NOT include adversarial-architecture-critic (out of 2-checklist scope)'
  );
  assert.ok(
    !mock.agents_invoked.includes('adversarial-quality-reviewer'),
    'hotfix mock must NOT include adversarial-quality-reviewer (out of 2-checklist scope)'
  );
  assert.ok(
    mock.agents_invoked.includes('adversarial-security-scanner'),
    'hotfix mock must include adversarial-security-scanner (security focus)'
  );
});

test('ux-fixture and audit-fixture omit TDD agents (report-only pipelines)', () => {
  for (const fx of ['ux-fixture', 'audit-fixture']) {
    const mockPath = path.join(SCENARIOS_DIR, fx, 'mock-output.json');
    const mock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
    assert.ok(
      !mock.agents_invoked.includes('quality-gate-router'),
      `${fx} (report-only) must NOT invoke quality-gate-router`
    );
    assert.ok(
      !mock.agents_invoked.includes('pre-tester'),
      `${fx} (report-only) must NOT invoke pre-tester`
    );
    const tddGate = mock.gates_triggered.find((g) => g.gate === 'TDD_APPROVAL');
    assert.equal(tddGate, undefined, `${fx} (report-only) must NOT have TDD_APPROVAL in gates_triggered`);
  }
});
