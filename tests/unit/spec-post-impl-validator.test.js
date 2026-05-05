#!/usr/bin/env node
/**
 * tests/unit/spec-post-impl-validator.test.js
 *
 * Unit tests for the spec-post-impl-validator agent (Phase 2 per-batch + Phase 3 final).
 *
 * The agent itself is a markdown spec (agents/executor/type-specific/spec-post-impl-validator.md).
 * This test file re-implements the deterministic logic the agent is contracted to follow:
 *
 *   - 6 weighted axes (Requirement Coverage, Test Coverage, Design Congruence,
 *     Task Completeness, Non-Invention, Contract Compliance) with weights
 *     25/20/15/15/15/10 — a 1:1 map to Pulsar's spec-post-impl-validator (lines 52-176).
 *   - Score formula: R*0.25 + T*0.20 + D*0.15 + Tk*0.15 + N*0.15 + C*0.10
 *   - Decision table: PASS / PASS_WITH_WARNINGS / FAIL with explicit boundaries at 90 and 75.
 *
 * The validatePostImpl() / decideFromAxes() / overallScore() functions below are the
 * executable specification. If the agent's prose drifts from this logic, this test breaks —
 * that is intentional (executable contract).
 *
 * Run: node tests/unit/spec-post-impl-validator.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ─── Decision tables (single source, no inline magic numbers) ────────────────────────

const WEIGHTS = Object.freeze({
  1: 0.25, // Requirement Coverage
  2: 0.20, // Test Coverage by AC
  3: 0.15, // Design Congruence
  4: 0.15, // Task Completeness
  5: 0.15, // Non-Invention
  6: 0.10, // Contract Compliance
});

const AXIS_NAMES = Object.freeze({
  1: 'requirement_coverage',
  2: 'test_coverage_by_ac',
  3: 'design_congruence',
  4: 'task_completeness',
  5: 'non_invention',
  6: 'contract_compliance',
});

const AXIS_IDS = Object.freeze([1, 2, 3, 4, 5, 6]);

const DECISION_TABLE = Object.freeze({
  PASS_MIN_SCORE: 90,
  PASS_MAX_BLOCKERS: 0,
  PASS_MAX_HIGHS: 0,

  WARNINGS_MIN_SCORE: 75,
  WARNINGS_MAX_BLOCKERS: 0,
  WARNINGS_MAX_HIGHS: 3,

  FAIL_GATE: 'SPEC_POST_IMPL_FAIL',
});

// Sanity: weights sum to 1.00 — locked at module load.
(() => {
  const total = AXIS_IDS.reduce((s, id) => s + WEIGHTS[id], 0);
  // Tolerate FP imprecision (0.25+0.20+0.15+0.15+0.15+0.10 → 1.0 exact in IEEE 754, but be safe)
  if (Math.abs(total - 1.0) > 1e-9) {
    throw new Error(`SSOT violation: weights must sum to 1.00, got ${total}`);
  }
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────────────

function clamp01to100(value) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

// Per-axis score formulas (1:1 with the agent prose) ----------------------------------

// Axis 1, 2, 3, 6: TRACED / Total * 100. PARTIAL counts as GAP (not credited).
function scoreCoverage(traced, total) {
  if (total === 0) return null; // SKIPPED — empty denominator
  return clamp01to100((traced / total) * 100);
}

// Axis 4 (Task Completeness): (TRACED + DRIFT*0.5) / Total * 100
function scoreTaskCompleteness(traced, drift, total) {
  if (total === 0) return null;
  return clamp01to100(((traced + drift * 0.5) / total) * 100);
}

// Axis 5 (Non-Invention): max(0, 1.0 - (suspicious * 0.10 + blockers * 0.25)) * 100.
// Never SKIPPED — empty inventions list scores 100.
function scoreNonInvention(suspicious, blockers) {
  const raw = 1.0 - (suspicious * 0.10 + blockers * 0.25);
  return clamp01to100(Math.max(0, raw) * 100);
}

// Status derivation (per-axis): PASS >= 80, WARN 60-79, FAIL < 60. SKIPPED returns its own.
function statusForAxis(score) {
  if (score === null) return 'SKIPPED';
  if (score >= 80) return 'PASS';
  if (score >= 60) return 'WARN';
  return 'FAIL';
}

// Overall weighted score with empty-denominator reweighting.
// axisScores = { 1: 92, 2: null, 3: 100, ... } (null = SKIPPED)
function overallScore(axisScores) {
  let activeWeightSum = 0;
  let weighted = 0;
  for (const id of AXIS_IDS) {
    const s = axisScores[id];
    if (s === null || s === undefined) continue;
    activeWeightSum += WEIGHTS[id];
    weighted += s * WEIGHTS[id];
  }
  if (activeWeightSum === 0) return 0;
  // Reweight so active weights sum to 1.
  return clamp01to100(weighted / activeWeightSum);
}

// Decision rule. severity = { blockers, highs, mediums, lows }.
function decideFromAxes(score, severity) {
  const b = severity.blockers || 0;
  const h = severity.highs || 0;
  if (
    score >= DECISION_TABLE.PASS_MIN_SCORE &&
    b <= DECISION_TABLE.PASS_MAX_BLOCKERS &&
    h <= DECISION_TABLE.PASS_MAX_HIGHS
  ) {
    return { decision: 'PASS' };
  }
  if (
    score >= DECISION_TABLE.WARNINGS_MIN_SCORE &&
    b <= DECISION_TABLE.WARNINGS_MAX_BLOCKERS &&
    h <= DECISION_TABLE.WARNINGS_MAX_HIGHS
  ) {
    return { decision: 'PASS_WITH_WARNINGS' };
  }
  return { decision: 'FAIL', gate: DECISION_TABLE.FAIL_GATE };
}

// ─── Spec extraction (lightweight, sufficient for unit-test integration) ─────────────

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractAcsWithIds(reqText) {
  if (!reqText) return [];
  const lines = reqText.split(/\r?\n/);
  const acs = [];
  let curReq = null;
  let inAcBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const reqMatch = ln.match(/^##\s+Requirement\s+(\d+)/i);
    if (reqMatch) {
      curReq = parseInt(reqMatch[1], 10);
      inAcBlock = false;
      continue;
    }
    if (/^####\s+Acceptance Criteria/i.test(ln)) {
      inAcBlock = true;
      continue;
    }
    if (inAcBlock && /^#{2,4}\s+/.test(ln)) {
      inAcBlock = false;
      continue;
    }
    if (inAcBlock && curReq != null) {
      // Allow arbitrary nesting depth (1., 1.2., 1.2.1., etc.) so sub-ACs are not silently dropped.
      const acMatch = ln.match(/^\s*(\d+(?:\.\d+)*)\.\s+(.+)$/);
      if (acMatch) {
        acs.push({ id: `${curReq}.${acMatch[1]}`, text: acMatch[2].trim(), line: i + 1 });
      }
    }
  }
  return acs;
}

function extractCheckedTasks(tasksText) {
  if (!tasksText) return [];
  const lines = tasksText.split(/\r?\n/);
  const tasks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+\[x\]\s+Task\s+(\d+(?:\.\d+)?)/i);
    if (m) {
      let body = lines[i] + '\n';
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{2,3}\s+/.test(lines[j])) break;
        body += lines[j] + '\n';
      }
      tasks.push({ id: m[1], body });
    }
  }
  return tasks;
}

function extractDesignComponents(designText) {
  // Component names are the ### headings under the ## Components section ONLY.
  // The ### subheadings under Data model / Contracts are NOT components — earlier
  // versions included them and produced false negatives (e.g. POST/GET endpoint
  // names and User/AuditEvent/Session entity names polluted the component list).
  // SSOT mirror: spec-content-reviewer-full.test.js findComponentNames() lines 83-106.
  if (!designText) return [];
  const lines = designText.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Components?\b/i.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return [];
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (/^##\s+/.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  const section = lines.slice(startIdx + 1, endIdx).join('\n');
  return [...section.matchAll(/^###\s+([A-Za-z][\w-]+)/gm)].map((m) => m[1]);
}

function extractContractEndpoints(designText) {
  if (!designText) return [];
  return [...designText.matchAll(/`(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s`]+)`/gi)].map((m) => ({
    method: m[1].toUpperCase(),
    pathStr: m[2],
  }));
}

// ─── Top-level orchestrator: validatePostImpl ────────────────────────────────────────
//
// Reads spec artifacts at specPath, scans modifiedFiles for evidence, computes the 6 axes,
// derives severities, and emits the agent's contracted YAML structure (as a JS object).

function validatePostImpl(specPath, modifiedFiles) {
  const reqText = safeRead(path.join(specPath, 'requirements.md'));
  const designText = safeRead(path.join(specPath, 'design.md'));
  const tasksText = safeRead(path.join(specPath, 'tasks.md'));

  const acs = extractAcsWithIds(reqText);
  const components = extractDesignComponents(designText);
  const endpoints = extractContractEndpoints(designText);
  const tasks = extractCheckedTasks(tasksText);

  // Read concatenated source of all modified files once for cheap grep.
  const modBlob = (modifiedFiles || [])
    .map((f) => {
      const txt = safeRead(f);
      return txt == null ? '' : `\n//===FILE:${f}===\n` + txt;
    })
    .join('\n');
  const testBlob = (modifiedFiles || [])
    .filter((f) => /\.test\.|_test\.|\.spec\./i.test(f))
    .map((f) => {
      const txt = safeRead(f);
      return txt == null ? '' : `\n//===FILE:${f}===\n` + txt;
    })
    .join('\n');

  // Axis 1: Requirement Coverage — each AC has code evidence.
  // Evidence regex requires an explicit AC/Req/Requirement prefix to avoid matching
  // unrelated occurrences of the AC id digits (version numbers like v1.1.0, paths
  // like slice-1.1, file names, etc). Bare `\b1\.1\b` is intentionally NOT accepted.
  const axis1Items = [];
  let axis1Traced = 0;
  for (const ac of acs) {
    const idEsc = ac.id.replace(/\./g, '\\.');
    const re = new RegExp(
      `\\bAC\\s*#?\\s*${idEsc}\\b|\\bReq\\s*${idEsc}\\b|\\bRequirement\\s*${idEsc}\\b`
    );
    const found = re.test(modBlob);
    axis1Items.push({ id: ac.id, evidence: found ? '[code-blob]' : null, class: found ? 'TRACED' : 'GAP' });
    if (found) axis1Traced++;
  }
  const axis1Score = scoreCoverage(axis1Traced, acs.length);

  // Axis 2: Test Coverage by AC — each AC referenced by a test file. Same prefix rule.
  const axis2Items = [];
  let axis2Traced = 0;
  for (const ac of acs) {
    const idEsc = ac.id.replace(/\./g, '\\.');
    const re = new RegExp(
      `\\bAC\\s*#?\\s*${idEsc}\\b|\\bReq\\s*${idEsc}\\b|\\bRequirement\\s*${idEsc}\\b`
    );
    const found = re.test(testBlob);
    axis2Items.push({ id: ac.id, evidence: found ? '[test-blob]' : null, class: found ? 'TRACED' : 'GAP' });
    if (found) axis2Traced++;
  }
  const axis2Score = scoreCoverage(axis2Traced, acs.length);

  // Axis 3: Design Congruence — each design component name appears in modified code.
  const axis3Items = [];
  let axis3Traced = 0;
  for (const c of components) {
    const re = new RegExp(`\\b${c}\\b`);
    const found = re.test(modBlob);
    axis3Items.push({ id: c, evidence: found ? '[code-blob]' : null, class: found ? 'TRACED' : 'GAP' });
    if (found) axis3Traced++;
  }
  const axis3Score = scoreCoverage(axis3Traced, components.length);

  // Axis 4: Task Completeness — each [x] task has evidence (we approximate via task id mention).
  const axis4Items = [];
  let axis4Traced = 0;
  let axis4Drift = 0;
  for (const tk of tasks) {
    const re = new RegExp(`\\bTask\\s+${tk.id.replace('.', '\\.')}\\b|\\b${tk.id.replace('.', '\\.')}\\b`);
    const found = re.test(modBlob);
    if (found) {
      axis4Traced++;
      axis4Items.push({ id: tk.id, evidence: '[code-blob]', class: 'TRACED' });
    } else {
      axis4Items.push({ id: tk.id, evidence: null, class: 'GAP' });
    }
  }
  const axis4Score = scoreTaskCompleteness(axis4Traced, axis4Drift, tasks.length);

  // Axis 5: Non-Invention — for the unit test we accept zero invention by default
  // (real agent walks added components and classifies). Test cases exercise the formula
  // directly via scoreNonInvention(); validatePostImpl returns 100 when no inventions
  // were declared via modifiedFiles heuristics. Callers may override via specPath/<inventions>.
  const inventionsFile = safeRead(path.join(specPath, '__inventions.json'));
  let suspicious = 0;
  let blockers = 0;
  let inventionItems = [];
  if (inventionsFile) {
    try {
      const parsed = JSON.parse(inventionsFile);
      for (const inv of parsed) {
        inventionItems.push({ name: inv.name, basis: inv.basis || null, class: inv.class });
        if (inv.class === 'INVENTION:SUSPICIOUS') suspicious++;
        else if (inv.class === 'INVENTION:BLOCKER') blockers++;
      }
    } catch {
      // ignore
    }
  }
  const axis5Score = scoreNonInvention(suspicious, blockers);

  // Axis 6: Contract Compliance — each endpoint method+path appears in modified code.
  const axis6Items = [];
  let axis6Traced = 0;
  for (const ep of endpoints) {
    const re = new RegExp(ep.pathStr.replace(/[/\-?.*+(){}|[\]\\]/g, '\\$&'));
    const found = re.test(modBlob);
    axis6Items.push({
      id: `${ep.method} ${ep.pathStr}`,
      evidence: found ? '[code-blob]' : null,
      class: found ? 'TRACED' : 'DRIFT',
    });
    if (found) axis6Traced++;
  }
  const axis6Score = scoreCoverage(axis6Traced, endpoints.length);

  // Assemble axes object
  const axisScores = {
    1: axis1Score,
    2: axis2Score,
    3: axis3Score,
    4: axis4Score,
    5: axis5Score,
    6: axis6Score,
  };

  const axes = {};
  for (const id of AXIS_IDS) {
    const s = axisScores[id];
    axes[String(id)] = {
      name: AXIS_NAMES[id],
      weight: WEIGHTS[id],
      score: s,
      status: statusForAxis(s),
      items:
        id === 1 ? axis1Items :
        id === 2 ? axis2Items :
        id === 3 ? axis3Items :
        id === 4 ? axis4Items :
        id === 5 ? inventionItems :
        axis6Items,
    };
  }

  // Severity assignment from items
  let severityBlockers = 0;
  let severityHighs = 0;
  let severityMediums = 0;
  let severityLows = 0;
  // Axis 1 GAP/PARTIAL → HIGH
  for (const it of axis1Items) if (it.class !== 'TRACED') severityHighs++;
  // Axis 2 GAP → HIGH
  for (const it of axis2Items) if (it.class === 'GAP') severityHighs++;
  // Axis 3 GAP → HIGH
  for (const it of axis3Items) if (it.class === 'GAP') severityHighs++;
  // Axis 4 GAP/DRIFT → MEDIUM
  for (const it of axis4Items) if (it.class !== 'TRACED') severityMediums++;
  // Axis 5 inventions → blockers/highs/lows
  for (const it of inventionItems) {
    if (it.class === 'INVENTION:BLOCKER') severityBlockers++;
    else if (it.class === 'INVENTION:SUSPICIOUS') severityHighs++;
    else if (it.class === 'INVENTION:TOLERABLE') severityLows++;
  }
  // Axis 6 DRIFT → HIGH
  for (const it of axis6Items) if (it.class === 'DRIFT') severityHighs++;

  const severity = {
    blockers: severityBlockers,
    highs: severityHighs,
    mediums: severityMediums,
    lows: severityLows,
  };

  const score = overallScore(axisScores);
  const dec = decideFromAxes(score, severity);

  const result = {
    spec_path: specPath,
    score,
    axes,
    findings_severity: severity,
    decision: dec.decision,
  };
  if (dec.gate) result.gate = dec.gate;
  return result;
}

// ─── Synthetic axis-driven validator (for boundary tests) ────────────────────────────
//
// Some tests need to engineer a precise overall score to probe boundaries. Use this
// helper to bypass the full-spec read path and inject axis scores + severity directly.

function decideFromSyntheticAxes(axisScores, severity) {
  const score = overallScore(axisScores);
  const dec = decideFromAxes(score, severity);
  return { score, ...dec };
}

// Export the validator and helpers for downstream tooling and tests.
module.exports = {
  validatePostImpl,
  decideFromAxes,
  decideFromSyntheticAxes,
  overallScore,
  scoreCoverage,
  scoreTaskCompleteness,
  scoreNonInvention,
  statusForAxis,
  WEIGHTS,
  AXIS_IDS,
  AXIS_NAMES,
  DECISION_TABLE,
  clamp01to100,
};

// ─── Test fixtures setup ─────────────────────────────────────────────────────────────

function makeTempSpec(name, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `spec-post-impl-${name}-`));
  for (const [fname, content] of Object.entries(files)) {
    if (content === null) continue;
    const fullPath = path.join(dir, fname);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  return dir;
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────────────

if (require.main === module) {

  test('Module shape: validatePostImpl + decision helpers exported with frozen SSOT constants', () => {
    assert.equal(typeof validatePostImpl, 'function');
    assert.equal(typeof decideFromAxes, 'function');
    assert.equal(typeof overallScore, 'function');
    // SSOT: weights frozen and sum to 1.00
    assert.ok(Object.isFrozen(WEIGHTS), 'WEIGHTS must be frozen');
    assert.ok(Object.isFrozen(AXIS_NAMES), 'AXIS_NAMES must be frozen');
    assert.ok(Object.isFrozen(DECISION_TABLE), 'DECISION_TABLE must be frozen');
    assert.deepEqual([...AXIS_IDS], [1, 2, 3, 4, 5, 6]);
    const total = AXIS_IDS.reduce((s, id) => s + WEIGHTS[id], 0);
    assert.ok(Math.abs(total - 1.0) < 1e-9, `weights must sum to 1.00, got ${total}`);
  });

  // Test 1: Positive path — all axes high → PASS, score >= 90.
  test('Case 1: all axes 100 → PASS with score 100', () => {
    const axes = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 };
    const result = decideFromSyntheticAxes(axes, { blockers: 0, highs: 0, mediums: 0, lows: 0 });
    assert.equal(result.score, 100);
    assert.equal(result.decision, 'PASS');
    assert.ok(!('gate' in result), 'PASS must not emit gate');
  });

  // Test 1b: Boundary exactly 90 → PASS (off-by-one anchor for `>= 90`).
  test('Case 1b: score exactly 90 → PASS (lower boundary of PASS tier)', () => {
    // All axes at 90 → weighted sum 90*1.00 = 90 exactly.
    const axes = { 1: 90, 2: 90, 3: 90, 4: 90, 5: 90, 6: 90 };
    const result = decideFromSyntheticAxes(axes, { blockers: 0, highs: 0, mediums: 0, lows: 0 });
    assert.equal(result.score, 90, `expected exact score 90, got ${result.score}`);
    assert.equal(result.decision, 'PASS', 'score=90 must be PASS (>= 90 inclusive)');
    assert.ok(!('gate' in result), 'PASS must not emit gate');
  });

  // Test 2: Boundary 89 → PASS_WITH_WARNINGS (just below 90 ceiling for PASS).
  test('Case 2: score 89 with 0 blockers, 0 highs → PASS_WITH_WARNINGS (boundary just below 90)', () => {
    // Engineer scores: pick axis values that yield exactly 89.
    // R*0.25 + T*0.20 + D*0.15 + Tk*0.15 + N*0.15 + C*0.10 = 89
    // Use 90 for axes 1-4, 6 (sum of weights 0.85) and 80 for axis 5 (weight 0.15):
    // 90*0.85 + 80*0.15 = 76.5 + 12 = 88.5 → rounds to 89.
    const axes = { 1: 90, 2: 90, 3: 90, 4: 90, 5: 80, 6: 90 };
    const result = decideFromSyntheticAxes(axes, { blockers: 0, highs: 0, mediums: 0, lows: 0 });
    // Confirm the engineered score lands in PASS_WITH_WARNINGS band: 75 <= score < 90.
    assert.ok(result.score >= 75 && result.score < 90, `expected 75 <= score < 90, got ${result.score}`);
    assert.equal(result.decision, 'PASS_WITH_WARNINGS');
    assert.ok(!('gate' in result), 'PASS_WITH_WARNINGS must not emit gate');
  });

  // Test 2b: Boundary exactly 75 → PASS_WITH_WARNINGS (off-by-one anchor for `>= 75`).
  test('Case 2b: score exactly 75 → PASS_WITH_WARNINGS (lower boundary of WARNINGS tier)', () => {
    // All axes at 75 → weighted sum 75*1.00 = 75 exactly.
    const axes = { 1: 75, 2: 75, 3: 75, 4: 75, 5: 75, 6: 75 };
    const result = decideFromSyntheticAxes(axes, { blockers: 0, highs: 0, mediums: 0, lows: 0 });
    assert.equal(result.score, 75, `expected exact score 75, got ${result.score}`);
    assert.equal(result.decision, 'PASS_WITH_WARNINGS', 'score=75 must be PASS_WITH_WARNINGS (>= 75 inclusive, < 90)');
    assert.ok(!('gate' in result), 'PASS_WITH_WARNINGS must not emit gate');
  });

  // Test 3: Boundary 74 → FAIL (just below 75 floor).
  test('Case 3: score < 75 → FAIL with SPEC_POST_IMPL_FAIL gate', () => {
    // 70 across the board → exact 70.
    const axes = { 1: 70, 2: 70, 3: 70, 4: 70, 5: 70, 6: 70 };
    const result = decideFromSyntheticAxes(axes, { blockers: 0, highs: 0, mediums: 0, lows: 0 });
    assert.equal(result.score, 70);
    assert.equal(result.decision, 'FAIL');
    assert.equal(result.gate, 'SPEC_POST_IMPL_FAIL');
  });

  // Test 4: Blocker triggers FAIL even when other axes are high.
  test('Case 4: 1 blocker → FAIL even when score >= 90', () => {
    const axes = { 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 };
    const result = decideFromSyntheticAxes(axes, { blockers: 1, highs: 0, mediums: 0, lows: 0 });
    assert.equal(result.score, 100, 'score is unaffected by severity counts');
    assert.equal(result.decision, 'FAIL', 'a single blocker forces FAIL regardless of score');
    assert.equal(result.gate, 'SPEC_POST_IMPL_FAIL');
  });

  // Test 5: 4+ highs trigger FAIL even with score >= 75.
  test('Case 5: 4 highs → FAIL even when score >= 75', () => {
    const axes = { 1: 90, 2: 90, 3: 90, 4: 90, 5: 90, 6: 90 };
    const result = decideFromSyntheticAxes(axes, { blockers: 0, highs: 4, mediums: 0, lows: 0 });
    assert.equal(result.score, 90, 'score is unaffected by severity counts');
    assert.equal(result.decision, 'FAIL', '4 highs forces FAIL regardless of score');
    assert.equal(result.gate, 'SPEC_POST_IMPL_FAIL');
    // Sanity check: 3 highs at the same score is PASS_WITH_WARNINGS, not FAIL.
    const result3 = decideFromSyntheticAxes(axes, { blockers: 0, highs: 3, mediums: 0, lows: 0 });
    assert.equal(result3.decision, 'PASS_WITH_WARNINGS', '3 highs should still be PASS_WITH_WARNINGS');
  });

  // Test 6: Formula correctness — known axis vector → manually-computed decimal.
  test('Case 6: formula yields 79 for axes [80,70,60,80,100,90] (manually verified)', () => {
    // 80*0.25 + 70*0.20 + 60*0.15 + 80*0.15 + 100*0.15 + 90*0.10
    // = 20 + 14 + 9 + 12 + 15 + 9 = 79
    const axes = { 1: 80, 2: 70, 3: 60, 4: 80, 5: 100, 6: 90 };
    const score = overallScore(axes);
    assert.equal(score, 79, `weighted sum must be exactly 79, got ${score}`);
    // And the all-100s case clamps to 100.
    const allHundred = overallScore({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 });
    assert.equal(allHundred, 100);
  });

  // Test 7: Non-invention math — verify two specific (suspicious, blocker) inputs.
  test('Case 7: non-invention formula — (0 susp, 2 blockers) → 50, (3 susp, 0 blockers) → 70', () => {
    // Formula: max(0, 1.0 - (suspicious * 0.10 + blockers * 0.25)) * 100
    // (0, 2): 1.0 - (0 + 0.50) = 0.50 → 50
    assert.equal(scoreNonInvention(0, 2), 50);
    // (3, 0): 1.0 - (0.30 + 0) = 0.70 → 70
    assert.equal(scoreNonInvention(3, 0), 70);
    // (10, 10): 1.0 - (1.0 + 2.5) = -2.5 → clamped to 0
    assert.equal(scoreNonInvention(10, 10), 0);
    // (0, 0): perfect → 100
    assert.equal(scoreNonInvention(0, 0), 100);
  });

  // Test 8: Empty AC list edge case — axes 1, 2 are SKIPPED, weight redistributes.
  test('Case 8: empty AC list → axes 1, 2 SKIPPED, remaining 4 axes carry full weight', () => {
    // Synthetic spec with no Acceptance Criteria heading → extractAcsWithIds returns [].
    const reqText = `# Requirements — empty
This spec has no AC heading.
## Requirement 1: nominal
**User Story:** As a tester.
`;
    const designText = `# Design
## Components
### Alpha
**Responsibility:** parse.
**Traces to:** Req 1.
## Contracts
### \`POST /endpoint\`
**Request body:** JSON.
`;
    const tasksText = `# Tasks
## Slice A
### [x] Task 1.1: implement Alpha
**Requirements:** Req 1
`;
    const dir = makeTempSpec('empty-acs', {
      'requirements.md': reqText,
      'design.md': designText,
      'tasks.md': tasksText,
    });
    const codeFile = path.join(dir, 'alpha.js');
    fs.writeFileSync(codeFile, "// Task 1.1\nfunction Alpha() { fetch('/endpoint'); }\n");
    try {
      const result = validatePostImpl(dir, [codeFile]);
      // Axes 1, 2 must be SKIPPED (score=null) due to empty-denominator (no ACs).
      assert.equal(result.axes['1'].score, null, 'axis 1 must be SKIPPED when no ACs');
      assert.equal(result.axes['1'].status, 'SKIPPED');
      assert.equal(result.axes['2'].score, null, 'axis 2 must be SKIPPED when no ACs');
      assert.equal(result.axes['2'].status, 'SKIPPED');
      // Remaining axes (3, 4, 5, 6) must have numeric scores — none should crash.
      for (const id of [3, 4, 5, 6]) {
        assert.equal(typeof result.axes[String(id)].score, 'number', `axis ${id} must be numeric`);
      }
      // Overall score must be a finite number (reweighted across active axes).
      assert.ok(Number.isFinite(result.score), 'overall score must be finite');
    } finally {
      cleanup(dir);
    }
  });

  // Bonus / regression: validatePostImpl on a fully-traced synthetic spec → PASS.
  test('Case 9: end-to-end validatePostImpl on traced synthetic spec → PASS', () => {
    const reqText = `# Requirements — traced
## Glossary
- Alpha: handler.
## Requirement 1: alpha
**User Story:** As a tester.
#### Acceptance Criteria
1. WHEN event-1 happens, THE Alpha SHALL return HTTP 200.
`;
    const designText = `# Design
## Components
### Alpha
**Responsibility:** handle event-1.
**Traces to:** Req 1.
## Contracts
### \`POST /endpoint\`
**Request body:** JSON.
**Response 200:** JSON.
**Errors:** 401, 429.
`;
    const tasksText = `# Tasks
## Slice A
### [x] Task 1.1: implement Alpha
**Requirements:** Req 1 (AC 1.1)
`;
    const dir = makeTempSpec('traced', {
      'requirements.md': reqText,
      'design.md': designText,
      'tasks.md': tasksText,
    });
    // Code file mentions AC 1.1, the Alpha component, Task 1.1, and the /endpoint path.
    const codeFile = path.join(dir, 'alpha.js');
    fs.writeFileSync(
      codeFile,
      "// Task 1.1 — Alpha implements AC 1.1\nfunction Alpha() { fetch('/endpoint'); return 200; }\n"
    );
    // Test file mentions AC 1.1.
    const testFile = path.join(dir, 'alpha.test.js');
    fs.writeFileSync(testFile, "// Tests AC 1.1\ntest('Alpha returns 200', () => {});\n");
    try {
      const result = validatePostImpl(dir, [codeFile, testFile]);
      assert.equal(result.decision, 'PASS', `expected PASS, got ${result.decision} (score=${result.score})`);
      assert.ok(result.score >= DECISION_TABLE.PASS_MIN_SCORE, `expected score >= 90, got ${result.score}`);
      assert.equal(result.findings_severity.blockers, 0);
      assert.equal(result.findings_severity.highs, 0);
    } finally {
      cleanup(dir);
    }
  });

} // end if (require.main === module)
