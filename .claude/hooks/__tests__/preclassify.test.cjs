#!/usr/bin/env node
'use strict';

/**
 * preclassify.test.cjs — v8.29.0 decision-model fast path (DECISION_MODEL_ENABLED).
 * Uses a local HTTP mock of the System One contract; no network.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'force-pipeline-agents.cjs');
const LIB_PATH = path.join(__dirname, '..', '..', '..', 'lib', 'preclassify.cjs');
const pre = require(LIB_PATH);

let passed = 0;
let failed = 0;
const failures = [];
function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; }
  failed++;
  failures.push(`FAIL: ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}
function assertTrue(cond, label) { assertEqual(Boolean(cond), true, label); }

// ---------- mock System One server (separate process: spawnSync blocks this one) ----------
const { spawn } = require('child_process');
const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preclass-mock-'));
const modeFile = path.join(mockDir, 'mode');
const countFile = path.join(mockDir, 'count');
fs.writeFileSync(modeFile, 'normal'); fs.writeFileSync(countFile, '0');
const mockPath = path.join(__dirname, 'fixtures', 'systemone-mock.cjs');
const mockProc = spawn(process.execPath, [mockPath, modeFile, countFile], { stdio: ['ignore', 'pipe', 'inherit'] });
function setMode(m) { fs.writeFileSync(modeFile, m); }
function requestCount() { return Number(fs.readFileSync(countFile, 'utf8')); }
function waitPort() { return new Promise((resolve) => { mockProc.stdout.once('data', (d) => resolve(Number(String(d).trim()))); }); }

function runHook(payload, env) {
  const r = spawnSync(process.execPath, [HOOK_PATH], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8', env: Object.assign({}, process.env, env), timeout: 20000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tmpCwd() { return fs.mkdtempSync(path.join(os.tmpdir(), 'preclass-')); }

(async () => {
  const port = await waitPort();
  const base = `http://127.0.0.1:${port}`;
  const cfgDir = tmpCwd();
  const emptyGlobal = path.join(cfgDir, 'empty-config.json');
  fs.writeFileSync(emptyGlobal, '{}');
  const OFF = { DECISION_MODEL_ENABLED: '', DECISION_MODEL_CONFIG: emptyGlobal };
  const ON = { DECISION_MODEL_ENABLED: '1', DECISION_MODEL_BASE_URL: base, DECISION_MODEL_API_KEY: 'test', DECISION_MODEL_CONFIG: emptyGlobal, DECISION_MODEL_TIMEOUT_MS: '1500', DECISION_MODEL_DEADLINE_MS: '2500' };
  const PROMPTS = {
    trivial: 'oi',
    skill: '/pipeline-orchestrator:pipeline corrige o bug do login que retorna 500',
    worthy: 'corrige o bug do login que retorna 500 ao entrar com Google',
    other: 'qual a capital da França',
  };

  // (4) flag OFF: stdout byte-identical to baseline for the 4 branches, no file, no request
  const baselineBefore = requestCount();
  for (const [k, p] of Object.entries(PROMPTS)) {
    const cwd = tmpCwd();
    const a = runHook({ prompt: p, cwd, session_id: 'sess-off' }, OFF);
    const b = runHook({ prompt: p, cwd, session_id: 'sess-off' }, Object.assign({}, OFF, { DECISION_MODEL_BASE_URL: base }));
    assertEqual(a.status, 0, `flag off exit 0 (${k})`);
    assertEqual(a.stdout, b.stdout, `flag off stdout stable (${k})`);
    assertTrue(!a.stdout.includes('PRECLASSIFY_HINT'), `flag off: no hint (${k})`);
    assertEqual(fs.existsSync(pre.statePath(cwd, 'sess-off')), false, `flag off: no side-car (${k})`);
  }
  assertEqual(requestCount() - baselineBefore, 0, 'flag off: zero requests to the model');

  // (5) plain-text stdin preserved
  const plain = runHook('corrige o bug do login', OFF);
  assertEqual(plain.status, 0, 'plain stdin exit 0');
  assertTrue(plain.stdout.includes('"continue":true'), 'plain stdin continues');

  // (1) normal: eligible side-car + hint + read matches
  setMode('normal');
  {
    const cwd = tmpCwd();
    const r = runHook({ prompt: PROMPTS.worthy, cwd, session_id: 'sess-1' }, ON);
    assertEqual(r.status, 0, 'normal exit 0');
    assertTrue(r.stdout.includes('PRECLASSIFY_HINT: type=Bug Fix complexity=MEDIA'), 'normal: hint appended');
    const rec = JSON.parse(fs.readFileSync(pre.statePath(cwd, 'sess-1'), 'utf8'));
    assertEqual([rec.eligible, rec.type, rec.complexity, rec.pipeline_variant, rec.severity], [true, 'Bug Fix', 'MEDIA', 'bugfix-light', 'Medium'], 'normal: record fields');
    assertEqual(rec.prompt_sha256, pre.hashRequest(pre.normalizeRequest(PROMPTS.worthy)), 'normal: hash of normalized request');
    const rd = pre.read({ cwd, sessionId: 'sess-1', request: PROMPTS.worthy, env: ON });
    assertEqual(rd.match, true, 'read: match on same request');
    // (7) mismatch / stale
    assertEqual(pre.read({ cwd, sessionId: 'sess-1', request: 'outro pedido', env: ON }).match, false, 'read: hash mismatch → no match');
    assertEqual(pre.read({ cwd, sessionId: 'sess-1', request: PROMPTS.worthy, env: ON, now: Date.now() + 16 * 60 * 1000 }).match, false, 'read: stale → no match');
    assertEqual(pre.read({ cwd, sessionId: 'sess-1', request: PROMPTS.worthy, env: OFF }).match, false, 'read: flag off → no match');
    // CLI form
    const cli = spawnSync(process.execPath, [LIB_PATH, 'read', '--cwd', cwd, '--session', 'sess-1', '--request', PROMPTS.worthy], { encoding: 'utf8', env: Object.assign({}, process.env, ON) });
    assertEqual(JSON.parse(cli.stdout).match, true, 'read CLI: match');
  }
  // skill-prefixed prompt normalizes to the same hash as bare arguments
  assertEqual(pre.normalizeRequest(PROMPTS.skill), pre.normalizeRequest('corrige o bug do login que retorna 500'), 'normalize strips skill prefix');
  assertEqual(pre.normalizeRequest('/pipeline --heavy faz X --grill'), 'faz X', 'normalize strips flags');

  // (2) low confidence → not eligible, message identical to baseline
  setMode('low');
  {
    const cwd = tmpCwd();
    const on = runHook({ prompt: PROMPTS.worthy, cwd, session_id: 'sess-2' }, ON);
    const off = runHook({ prompt: PROMPTS.worthy, cwd, session_id: 'sess-2-off' }, OFF);
    assertEqual(on.stdout, off.stdout, 'low confidence: stdout equals baseline');
    const rec = JSON.parse(fs.readFileSync(pre.statePath(cwd, 'sess-2'), 'utf8'));
    assertEqual([rec.eligible, rec.reason], [false, 'confidence-below-threshold'], 'low confidence: side-car not eligible');
    assertEqual(pre.read({ cwd, sessionId: 'sess-2', request: PROMPTS.worthy, env: ON }).match, false, 'low confidence: read no match');
  }

  // (3) 529 → fallback within deadline, stdout equals baseline, reason recorded
  setMode('http529');
  {
    const cwd = tmpCwd();
    const t0 = Date.now();
    const on = runHook({ prompt: PROMPTS.worthy, cwd, session_id: 'sess-3' }, ON);
    const ms = Date.now() - t0;
    const off = runHook({ prompt: PROMPTS.worthy, cwd, session_id: 'sess-3-off' }, OFF);
    assertEqual(on.status, 0, '529: exit 0');
    assertEqual(on.stdout, off.stdout, '529: stdout equals baseline');
    assertTrue(ms < 8000, `529: finished within budget (${ms} ms)`);
    const rec = JSON.parse(fs.readFileSync(pre.statePath(cwd, 'sess-3'), 'utf8'));
    assertTrue(rec.eligible === false && /^error:/.test(rec.reason), '529: error reason recorded');
  }

  // (6) taxonomy mapping
  const m = (answers, req = 'x') => pre.mapDecision(answers, 0.7, req);
  const ans = (tt, cx, np = 0.95, c = 0.9) => ({ needs_pipeline: { p: np }, task_type: { choice: tt, confidence: c }, complexity: { choice: cx, confidence: c } });
  assertEqual([m(ans('hotfix', 'media')).type, m(ans('hotfix', 'media')).complexity, m(ans('hotfix', 'media')).severity, m(ans('hotfix', 'media')).pipeline_variant], ['Bug Fix', 'COMPLEXA', 'Critical', 'bugfix-heavy'], 'map: hotfix');
  assertEqual(m(ans('security', 'complexa')).eligible, false, 'map: security not fast-pathed');
  assertEqual(m(ans('refactor', 'media')).reason, 'type-not-fast-pathed:refactor', 'map: refactor not fast-pathed');
  assertEqual(m(ans('trivial', 'simples', 0.1)).eligible, false, 'map: trivial not fast-pathed');
  assertEqual(m(ans('feature', 'outro')).eligible, false, 'map: outro not fast-pathed');
  assertEqual(m(ans('feature', 'complexa'), 'implementar a spec selada X').reason, 'spec-mentioned', 'map: spec mention blocks fast path');
  assertEqual(m(ans('feature', 'simples')).pipeline_variant, 'feature-light', 'map: feature simples → light');
  assertEqual(m(ans('audit', 'complexa')).pipeline_variant, 'audit-heavy', 'map: audit complexa → heavy');
  assertEqual(m(ans('feature', 'media', 0.6)).reason, 'needs_pipeline-below-threshold', 'map: low needs_pipeline blocks');

  // questions file is loaded (not duplicated) and has the 3 expected keys
  const q = JSON.parse(fs.readFileSync(pre.QUESTIONS_PATH, 'utf8'));
  assertEqual(Object.keys(q.questions).sort(), ['complexity', 'needs_pipeline', 'task_type'], 'questions file keys');
  assertTrue(q.questions.needs_pipeline.inverse && q.questions.needs_pipeline.inverse.criteria, 'needs_pipeline has inverse');

  mockProc.kill();
  console.log(`preclassify.test.cjs — Passed: ${passed}, Failed: ${failed}`);
  if (failed) { console.log(failures.join('\n')); process.exit(1); }
})().catch((e) => { mockProc.kill(); console.error(e); process.exit(1); });
