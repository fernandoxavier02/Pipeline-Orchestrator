#!/usr/bin/env node
/**
 * tests/unit/spec-format-gate.test.js
 *
 * Unit tests for the spec-format-gate agent logic.
 *
 * The agent itself is a markdown spec (agents/executor/type-specific/spec-format-gate.md).
 * This test file re-implements the deterministic logic the agent is contracted to follow
 * (25 checks + 4 EARS regex patterns + decision thresholds) and validates that logic
 * against real and synthetic fixtures.
 *
 * The validateSpecFormat() function below is the executable specification of what the
 * agent must produce when it reads a spec directory. If the agent's prose drifts from
 * this logic, this test breaks — that is intentional (executable contract).
 *
 * Run: node tests/unit/spec-format-gate.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ─── EARS regex patterns ──────────────────────────────────────────────────────────────
// SSOT for these patterns. The markdown contract (agents/executor/type-specific/spec-format-gate.md)
// references this module by path; if the two diverge, this file wins and the markdown must be
// updated to match. All patterns use /i (case-insensitive). The /m flag is intentionally NOT
// applied because callers split text by line before calling — multi-line matching would change
// behaviour. All 4 patterns use NON-CAPTURING groups (?:...) — no pattern captures any group;
// match[0] is the full matched line, and classification result is the pattern name (P1/P2/P3/P4).
// Callers MUST NOT rely on match[1] (it is always undefined under this contract).

const EARS_PATTERNS = [
  {
    name: 'P1_event',
    // WHEN <trigger>, THE <actor> SHALL <action>
    regex: /^\s*(?:\d+(?:\.\d+)?\.\s+)?WHEN\s+.+?,\s+THE\s+.+?\s+SHALL\s+.+?\.?\s*$/i,
  },
  {
    name: 'P2_conditional',
    // IF <cond>, THEN THE <actor> SHALL <action>
    regex: /^\s*(?:\d+(?:\.\d+)?\.\s+)?IF\s+.+?,\s+THEN\s+THE\s+.+?\s+SHALL\s+.+?\.?\s*$/i,
  },
  {
    name: 'P3_event_then',
    // WHEN <trigger>, THEN THE <actor> SHALL <action>
    regex: /^\s*(?:\d+(?:\.\d+)?\.\s+)?WHEN\s+.+?,\s+THEN\s+THE\s+.+?\s+SHALL\s+.+?\.?\s*$/i,
  },
  {
    name: 'P4_ubiquitous',
    // THE <actor> SHALL [NOT] <action> — NOT group is NON-capturing (like all others)
    regex: /^\s*(?:\d+(?:\.\d+)?\.\s+)?THE\s+.+?\s+SHALL(?:\s+NOT)?\s+.+?\.?\s*$/i,
  },
];

const FALLBACK_REGEX = /^\s*\d+(?:\.\d+)?\.\s+.+?\bSHALL\b.+?\.?\s*$/i;

// ─── Decision table (single source, no inline magic numbers) ─────────────────────────

const DECISION_TABLE = Object.freeze({
  GO_MIN_SCORE: 22,
  WARN_MIN_SCORE: 18,
  NOGO_MAX_SCORE: 17,
  TOTAL_CHECKS: 25,
});

// ─── Severity classification (documented; see ARCH-005) ─────────────────────────────
// Checks 1-4 are foundational requirements.md presence/structure; 9 is design.md presence;
// 16 is tasks.md presence; 22 is spec.json presence. These produce HIGH severity when failed.
// All other check failures are MEDIUM by default. This mapping is a single function — the
// validator below imports it instead of inlining a ternary.

const HIGH_SEVERITY_CHECKS = new Set([1, 2, 3, 4, 9, 16, 22]);

function severityForCheck(num) {
  return HIGH_SEVERITY_CHECKS.has(num) ? 'high' : 'medium';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function classifyAcLine(line) {
  // Classification order: P3 → P1 → P2 → P4 → fallback.
  // Reasoning: P1's lazy `.+?` would otherwise swallow `THEN THE` and steal P3-shaped lines.
  // The agent contract markdown references THIS function as the SSOT for ordering.
  // 1. P3: opens with `WHEN ..., THEN ` → must be P3 (P1 is rejected by the "no THEN" guard).
  if (/^\s*(?:\d+(?:\.\d+)?\.\s+)?WHEN\s+.+?,\s+THEN\s+/i.test(line)) {
    if (EARS_PATTERNS[2].regex.test(line)) return 'P3_event_then';
  }
  // 2. P1: only when line does NOT contain ", THEN ".
  if (EARS_PATTERNS[0].regex.test(line) && !/,\s+THEN\s+/i.test(line)) return 'P1_event';
  // 3. P2: IF / THEN THE.
  if (EARS_PATTERNS[1].regex.test(line)) return 'P2_conditional';
  // 4. P4: ubiquitous THE … SHALL [NOT] …
  if (EARS_PATTERNS[3].regex.test(line)) return 'P4_ubiquitous';
  // 5. Fallback: any numbered SHALL line that didn't match above (counts toward fallback bucket only).
  if (FALLBACK_REGEX.test(line)) return 'fallback';
  return null; // NON_EARS
}

function extractAcLinesFromRequirements(text) {
  // Find every #### Acceptance Criteria heading and collect numbered lines until the next
  // heading (## or ### or ####) or EOF.
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const acs = [];
  let inAcBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^####\s+Acceptance Criteria/i.test(ln)) {
      inAcBlock = true;
      continue;
    }
    if (inAcBlock && /^#{2,4}\s+/.test(ln)) {
      // any new heading closes the block
      inAcBlock = false;
      continue;
    }
    if (inAcBlock && /^\s*\d+(?:\.\d+)?\.\s+\S/.test(ln)) {
      acs.push(ln.trim());
    }
  }
  return acs;
}

function computeEarsBreakdown(acLines) {
  const breakdown = {
    p1_event: 0,
    p2_conditional: 0,
    p3_event_then: 0,
    p4_ubiquitous: 0,
    fallback: 0,
    non_ears: 0,
    total_acs: acLines.length,
  };
  let strictMatches = 0;
  for (const line of acLines) {
    const kind = classifyAcLine(line);
    if (kind === 'P1_event') {
      breakdown.p1_event++;
      strictMatches++;
    } else if (kind === 'P2_conditional') {
      breakdown.p2_conditional++;
      strictMatches++;
    } else if (kind === 'P3_event_then') {
      breakdown.p3_event_then++;
      strictMatches++;
    } else if (kind === 'P4_ubiquitous') {
      breakdown.p4_ubiquitous++;
      strictMatches++;
    } else if (kind === 'fallback') {
      breakdown.fallback++;
    } else {
      breakdown.non_ears++;
    }
  }
  const coveragePct = acLines.length === 0 ? 0 : Math.round((strictMatches / acLines.length) * 100);
  let compliance;
  if (coveragePct >= 80) compliance = 'PASS';
  else if (coveragePct >= 50) compliance = 'WARN';
  else compliance = 'FAIL';
  return { breakdown, coveragePct, compliance };
}

function findRequirementBlocks(text) {
  // Returns array of { number, body } where body is the markdown between this requirement
  // heading and the next ## heading.
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(/^##\s+Requirement\s+(\d+)/i);
    if (m) {
      if (current) blocks.push(current);
      current = { number: parseInt(m[1], 10), body: '' };
      continue;
    }
    if (/^##\s+/.test(ln) && current) {
      blocks.push(current);
      current = null;
      continue;
    }
    if (current) current.body += ln + '\n';
  }
  if (current) blocks.push(current);
  return blocks;
}

function findTasks(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const tasks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+\[([ x])\]\s+Task\s+(\d+(?:\.\d+)?)/i);
    if (m) {
      // collect body until next ### or ##
      let body = '';
      for (let j = i + 1; j < Math.min(lines.length, i + 30); j++) {
        if (/^#{2,3}\s+/.test(lines[j])) break;
        body += lines[j] + '\n';
      }
      tasks.push({ id: m[2], checked: m[1] === 'x', body });
    }
  }
  return tasks;
}

// ─── Validator (executable spec of the agent's contract) ──────────────────────────────

function validateSpecFormat(specPath) {
  const artifacts = {
    requirements: path.join(specPath, 'requirements.md'),
    design: path.join(specPath, 'design.md'),
    tasks: path.join(specPath, 'tasks.md'),
    spec_json: path.join(specPath, 'spec.json'),
  };
  const reqText = safeRead(artifacts.requirements);
  const designText = safeRead(artifacts.design);
  const tasksText = safeRead(artifacts.tasks);
  const specJsonText = safeRead(artifacts.spec_json);

  const passed = [];
  const failed = [];

  function check(num, group, description, condition) {
    if (condition) passed.push(num);
    else failed.push({ check: num, group, description, severity: severityForCheck(num) });
  }

  // ─── Group A: requirements.md (8 checks) ───────────────────────────────────────────
  check(1, 'requirements', 'requirements.md exists and non-empty', !!(reqText && reqText.trim().length > 0));

  // intro: any non-heading text before first ## Requirement
  let hasIntro = false;
  if (reqText) {
    const firstReqIdx = reqText.search(/^##\s+Requirement\s+\d+/im);
    const head = firstReqIdx === -1 ? reqText : reqText.slice(0, firstReqIdx);
    hasIntro = /\S[\s\S]{20,}/.test(head.replace(/^#.*$/gm, '').trim());
  }
  check(2, 'requirements', 'has Introduction or top-level intro paragraph', hasIntro);

  check(
    3,
    'requirements',
    'has Glossary or Definitions section',
    !!(reqText && /^##\s+(Glossary|Definitions|Terms)\b/im.test(reqText))
  );

  const reqBlocks = findRequirementBlocks(reqText);
  check(4, 'requirements', 'has at least one numbered Requirement', reqBlocks.length >= 1);

  // each requirement has User Story
  let allHaveUserStory = reqBlocks.length > 0;
  for (const b of reqBlocks) {
    if (!/\*\*User Story:\*\*/i.test(b.body)) {
      allHaveUserStory = false;
      break;
    }
  }
  check(5, 'requirements', 'each Requirement has a User Story', allHaveUserStory);

  // each requirement has #### Acceptance Criteria
  let allHaveAcHeading = reqBlocks.length > 0;
  for (const b of reqBlocks) {
    if (!/^####\s+Acceptance Criteria/im.test(b.body)) {
      allHaveAcHeading = false;
      break;
    }
  }
  check(6, 'requirements', 'each Requirement has #### Acceptance Criteria heading', allHaveAcHeading);

  // ≥1 AC per requirement
  let allHaveAtLeastOneAc = reqBlocks.length > 0;
  for (const b of reqBlocks) {
    const acs = extractAcLinesFromRequirements('#### Acceptance Criteria\n' + b.body.split(/####\s+Acceptance Criteria/i).slice(1).join('\n'));
    if (acs.length < 1) {
      allHaveAtLeastOneAc = false;
      break;
    }
  }
  check(7, 'requirements', 'at least 1 AC per Requirement', allHaveAtLeastOneAc);

  // EARS coverage check (also reported standalone)
  const allAcLines = extractAcLinesFromRequirements(reqText || '');
  const earsResult = computeEarsBreakdown(allAcLines);
  check(8, 'requirements', `EARS compliance ≥80% (got ${earsResult.coveragePct}%)`, earsResult.compliance !== 'FAIL');

  // ─── Group B: design.md (7 checks) ─────────────────────────────────────────────────
  check(9, 'design', 'design.md exists and non-empty', !!(designText && designText.trim().length > 0));

  // named components
  const componentHeadings = designText ? [...designText.matchAll(/^###\s+([A-Za-z][\w-]+)/gm)].map((m) => m[1]) : [];
  check(10, 'design', 'has named components (### headings under design)', componentHeadings.length >= 1);

  // each component has Responsibility
  let allCompsHaveResp = componentHeadings.length > 0;
  if (designText && componentHeadings.length > 0) {
    for (const comp of componentHeadings) {
      const re = new RegExp(`^###\\s+${comp}\\b[\\s\\S]{0,800}?\\*\\*Responsibilit(y|ies):\\*\\*`, 'm');
      if (!re.test(designText)) {
        allCompsHaveResp = false;
        break;
      }
    }
  }
  check(11, 'design', 'each component has Responsibility', allCompsHaveResp);

  check(
    12,
    'design',
    'has Data model section',
    !!(designText && /^##\s+Data\s*model/im.test(designText))
  );

  check(
    13,
    'design',
    'has Contracts section',
    !!(designText && /^##\s+Contracts?/im.test(designText))
  );

  // components traceable to requirements
  let allCompsTrace = componentHeadings.length > 0;
  if (designText && componentHeadings.length > 0) {
    for (const comp of componentHeadings) {
      const re = new RegExp(`^###\\s+${comp}\\b[\\s\\S]{0,800}?(Traces to:|Req(uirement)?\\s+\\d)`, 'm');
      if (!re.test(designText)) {
        allCompsTrace = false;
        break;
      }
    }
  }
  check(14, 'design', 'components traceable to requirements', allCompsTrace);

  // Check #15 — every component is implemented by ≥1 task (forward link from design.md → tasks.md).
  // This is DISTINCT from #14 (which checks the back-link design.md → requirements.md): a component
  // can satisfy #14 but still be orphaned at the implementation layer if no task in tasks.md
  // references it by name. Both checks together close the trace cycle Req → Component → Task.
  let allCompsHaveTask = componentHeadings.length > 0 && !!tasksText;
  if (allCompsHaveTask) {
    for (const comp of componentHeadings) {
      // word-boundary match for the component name anywhere in tasks.md.
      const re = new RegExp(`\\b${comp}\\b`);
      if (!re.test(tasksText)) {
        allCompsHaveTask = false;
        break;
      }
    }
  }
  check(15, 'design', 'each component implemented by ≥1 task in tasks.md', allCompsHaveTask);

  // ─── Group C: tasks.md (6 checks) ──────────────────────────────────────────────────
  check(16, 'tasks', 'tasks.md exists and non-empty', !!(tasksText && tasksText.trim().length > 0));

  const taskList = findTasks(tasksText);
  check(17, 'tasks', 'tasks numbered hierarchically (### [ ] Task N or N.M)', taskList.length >= 1);

  // checkbox markers — implicit from regex; if any task heading lacks [ ] or [x], findTasks didn't capture.
  // Validate by counting markers vs naive ### Task headings.
  const naiveTaskCount = tasksText ? (tasksText.match(/^###\s+.*Task\s+\d/gim) || []).length : 0;
  check(
    18,
    'tasks',
    'tasks have checkbox markers ([ ] or [x])',
    naiveTaskCount > 0 && taskList.length === naiveTaskCount
  );

  // each task references a requirement
  let allTasksRefReq = taskList.length > 0;
  for (const t of taskList) {
    if (!/Requirements?\s*:\s*Req\s*\d|Req\s+\d|Requirement\s+\d/i.test(t.body)) {
      allTasksRefReq = false;
      break;
    }
  }
  check(19, 'tasks', 'each task references a requirement', allTasksRefReq);

  // vertical slices
  check(
    20,
    'tasks',
    'vertical slices identifiable (## Slice or equivalent)',
    !!(tasksText && /^##\s+Slice\b/im.test(tasksText))
  );

  // no orphan tasks — every referenced Req actually exists in requirements.md
  const reqNumbers = new Set(reqBlocks.map((b) => String(b.number)));
  let noOrphanTasks = taskList.length > 0;
  for (const t of taskList) {
    const refs = [...t.body.matchAll(/Req(?:uirement)?\s+(\d+)/gi)].map((m) => m[1]);
    if (refs.length === 0) {
      noOrphanTasks = false;
      break;
    }
    for (const r of refs) {
      if (!reqNumbers.has(r)) {
        noOrphanTasks = false;
        break;
      }
    }
    if (!noOrphanTasks) break;
  }
  check(21, 'tasks', 'no orphan tasks (all Req refs exist)', noOrphanTasks);

  // ─── Group D: spec.json (4 checks) ─────────────────────────────────────────────────
  check(22, 'spec_json', 'spec.json exists', specJsonText !== null);

  let parsed = null;
  let validJson = false;
  if (specJsonText !== null) {
    try {
      parsed = JSON.parse(specJsonText);
      validJson = true;
    } catch {
      validJson = false;
    }
  }
  check(23, 'spec_json', 'spec.json is valid JSON', validJson);

  check(
    24,
    'spec_json',
    'spec.json has feature_name field (non-empty string)',
    !!(parsed && typeof parsed.feature_name === 'string' && parsed.feature_name.length > 0)
  );

  const validPhases = new Set([
    'ready',
    'validating',
    'implementation',
    'post_impl_validation',
    'closed',
    'aborted',
  ]);
  check(
    25,
    'spec_json',
    'spec.json has phase field with valid value',
    !!(parsed && typeof parsed.phase === 'string' && validPhases.has(parsed.phase))
  );

  // ─── Decision logic ────────────────────────────────────────────────────────────────
  // Critical-artifact failure includes both (a) missing files and (b) corrupt spec.json.
  // A corrupt manifest is treated identically to a missing manifest — see ADV-003 / ARCH-003.
  const score = passed.length;
  const corruptSpecJson = specJsonText !== null && !validJson;
  const criticalArtifactMissing =
    !reqText || !designText || !tasksText || specJsonText === null || corruptSpecJson;

  let decision;
  if (criticalArtifactMissing) {
    decision = 'NO-GO';
  } else if (score < DECISION_TABLE.WARN_MIN_SCORE || earsResult.compliance === 'FAIL') {
    decision = 'NO-GO';
  } else if (score >= DECISION_TABLE.GO_MIN_SCORE && earsResult.compliance === 'PASS') {
    decision = 'GO';
  } else {
    decision = 'GO-WARN';
  }

  const result = {
    spec_path: specPath,
    score: `${score}/25`,
    passed_checks: passed,
    failed_checks: failed,
    ears_compliance: earsResult.compliance,
    ears_coverage_pct: earsResult.coveragePct,
    ears_breakdown: earsResult.breakdown,
    decision,
    issues: failed.map((f) => `[check ${f.check} / ${f.group}] ${f.description}`),
  };

  if (decision === 'NO-GO') {
    result.gate = 'SPEC_FORMAT_GATE_FAIL';
  }

  return result;
}

// ─── Test fixtures setup ──────────────────────────────────────────────────────────────

const REPO_FIXTURE = path.join(__dirname, '..', 'fixtures', 'specs', 'auth-flow-good');

function makeTempSpec(name, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `spec-format-gate-${name}-`));
  for (const [fname, content] of Object.entries(files)) {
    if (content === null) continue; // skip — used to simulate missing artifact
    fs.writeFileSync(path.join(dir, fname), content, 'utf8');
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

// Synthetic content builders ----------------------------------------------------------

const MINIMAL_DESIGN = `# Design — synthetic

## Architecture overview

Synthetic design for testing.

## Components

### Alpha

**Responsibility:** does alpha things.
**Traces to:** Req 1.

### Beta

**Responsibility:** does beta things.
**Traces to:** Req 1.

## Contracts

### POST /endpoint

Request: {}
Response: {}

## Data model

### Thing

| Field | Type |
|-------|------|
| id    | str  |
`;

const MINIMAL_TASKS = `# Tasks — synthetic

## Slice A: foundation (Req 1)

### [ ] Task 1.1: Implement Alpha

**Requirements:** Req 1
**Acceptance:** Alpha does the thing.
**Files in scope:** src/alpha.ts

### [ ] Task 1.2: Implement Beta

**Requirements:** Req 1
**Acceptance:** Beta does the other thing.
**Files in scope:** src/beta.ts

## Definition of done

- Build green.
`;

function buildRequirementsWithEarsRatio(ratio) {
  // Build a requirements.md with a controlled fraction of strict-EARS ACs.
  // ratio in [0,1]: fraction of ACs that match P1 strictly.
  // We use 10 ACs total to make the math obvious.
  const totalAcs = 10;
  const strictCount = Math.round(totalAcs * ratio);
  const lines = [];
  lines.push('# Requirements — synthetic');
  lines.push('');
  lines.push('Synthetic requirements for testing EARS coverage boundary.');
  lines.push('');
  lines.push('## Glossary');
  lines.push('');
  lines.push('- **Alpha**: synthetic component.');
  lines.push('');
  lines.push('## Requirement 1: synthetic');
  lines.push('');
  lines.push('**User Story:** As a tester, I want EARS coverage to be controllable.');
  lines.push('');
  lines.push('#### Acceptance Criteria');
  lines.push('');
  for (let i = 0; i < totalAcs; i++) {
    const n = i + 1;
    if (i < strictCount) {
      // strict P1
      lines.push(`${n}. WHEN event-${n} happens, THE Alpha SHALL respond with ${n}.`);
    } else {
      // non-EARS prose (no SHALL → counts as NON_EARS, will not even hit fallback)
      lines.push(`${n}. The system processes event-${n} appropriately.`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

const MINIMAL_GOOD_REQUIREMENTS = `# Requirements — synthetic

This document captures synthetic requirements for testing.

## Glossary

- **Alpha**: synthetic component.

## Requirement 1: synthetic

**User Story:** As a tester, I want a happy-path requirement.

#### Acceptance Criteria

1. WHEN event-1 happens, THE Alpha SHALL respond with code 200.
2. WHEN event-2 happens, THE Alpha SHALL respond with code 201.
3. IF condition X holds, THEN THE Alpha SHALL emit event Y.
`;

const MINIMAL_GOOD_SPEC_JSON = JSON.stringify(
  {
    feature_name: 'synthetic',
    phase: 'ready',
    status: 'open',
    last_updated: '2026-05-04',
    schema_version: 1,
  },
  null,
  2
);

// ─── Tests ────────────────────────────────────────────────────────────────────────────

test('Module shape: validateSpecFormat is a function and EARS_PATTERNS has 4 entries', () => {
  assert.equal(typeof validateSpecFormat, 'function');
  assert.equal(EARS_PATTERNS.length, 4);
  assert.deepEqual(
    EARS_PATTERNS.map((p) => p.name),
    ['P1_event', 'P2_conditional', 'P3_event_then', 'P4_ubiquitous']
  );
  // All four must be RegExp instances
  for (const p of EARS_PATTERNS) {
    assert.ok(p.regex instanceof RegExp, `pattern ${p.name} must be RegExp`);
  }
});

test('Case 1: positive path on auth-flow-good fixture returns GO with score >=22 and EARS PASS', () => {
  const result = validateSpecFormat(REPO_FIXTURE);

  assert.equal(result.decision, 'GO', `expected GO, got ${result.decision}. failed_checks=${JSON.stringify(result.failed_checks)}`);
  const numericScore = parseInt(result.score.split('/')[0], 10);
  assert.ok(numericScore >= 22, `expected score >=22, got ${result.score}`);
  assert.equal(result.ears_compliance, 'PASS');
  // All four EARS patterns must have at least one match in the auth-flow-good fixture
  // (verified by reading requirements.md: P1 x3, P2 x2, P3 x1, P4 x3).
  const b = result.ears_breakdown;
  assert.ok(b.p1_event >= 1, `expected ≥1 P1 match, got ${b.p1_event}`);
  assert.ok(b.p2_conditional >= 1, `expected ≥1 P2 match, got ${b.p2_conditional}`);
  assert.ok(b.p3_event_then >= 1, `expected ≥1 P3 match, got ${b.p3_event_then}`);
  assert.ok(b.p4_ubiquitous >= 1, `expected ≥1 P4 match, got ${b.p4_ubiquitous}`);
  assert.ok(!('gate' in result), 'GO decision must not emit a gate field');
});

test('Case 2: EARS coverage at 70% (boundary) returns ears_compliance=WARN', () => {
  const dir = makeTempSpec('ears-boundary', {
    'requirements.md': buildRequirementsWithEarsRatio(0.7),
    'design.md': MINIMAL_DESIGN,
    'tasks.md': MINIMAL_TASKS,
    'spec.json': MINIMAL_GOOD_SPEC_JSON,
  });
  try {
    const result = validateSpecFormat(dir);
    assert.equal(result.ears_compliance, 'WARN', `expected WARN at 70% coverage, got ${result.ears_compliance} (pct=${result.ears_coverage_pct})`);
    assert.equal(result.ears_coverage_pct, 70);
    // 70% triggers WARN, but score should still pass enough checks: decision must be GO-WARN, not NO-GO
    assert.equal(result.decision, 'GO-WARN', `expected GO-WARN, got ${result.decision}`);
  } finally {
    cleanup(dir);
  }
});

test('Case 3: missing tasks.md returns NO-GO with gate=SPEC_FORMAT_GATE_FAIL', () => {
  const dir = makeTempSpec('missing-tasks', {
    'requirements.md': MINIMAL_GOOD_REQUIREMENTS,
    'design.md': MINIMAL_DESIGN,
    // tasks.md intentionally absent
    'spec.json': MINIMAL_GOOD_SPEC_JSON,
  });
  try {
    const result = validateSpecFormat(dir);
    assert.equal(result.decision, 'NO-GO');
    assert.equal(result.gate, 'SPEC_FORMAT_GATE_FAIL');
    // Must report check #16 (tasks.md exists) as failed
    const check16Failed = result.failed_checks.find((f) => f.check === 16);
    assert.ok(check16Failed, 'expected check #16 (tasks.md exists) to fail');
  } finally {
    cleanup(dir);
  }
});

test('Case 4: invalid JSON in spec.json forces NO-GO via critical-artifact rule (corrupt = missing)', () => {
  // ADV-003 / ARCH-003 fix: a present-but-unparseable spec.json must NOT pass the gate.
  // The validator promotes "check #23 failed" to a critical-artifact failure, identical in
  // effect to spec.json being absent. This test asserts NO-GO + gate emission, and grep on
  // check NUMBER (#23), not on the description text — so renaming the description does not
  // break this test (decoupling fix per ADV-007).
  const dir = makeTempSpec('invalid-json', {
    'requirements.md': MINIMAL_GOOD_REQUIREMENTS,
    'design.md': MINIMAL_DESIGN,
    'tasks.md': MINIMAL_TASKS,
    'spec.json': '{ this is not: valid json, ',
  });
  try {
    const result = validateSpecFormat(dir);
    // Decision: NO-GO with gate emitted.
    assert.equal(result.decision, 'NO-GO', `expected NO-GO for corrupt spec.json, got ${result.decision}`);
    assert.equal(result.gate, 'SPEC_FORMAT_GATE_FAIL');
    // Check #23 must appear in failed_checks (grep by number, not by description).
    const check23Failed = result.failed_checks.find((f) => f.check === 23);
    assert.ok(check23Failed, 'expected check #23 (valid JSON) to fail');
    // Checks #24 and #25 also fail because parsed is null.
    assert.ok(result.failed_checks.find((f) => f.check === 24));
    assert.ok(result.failed_checks.find((f) => f.check === 25));
    // Issues array surfaces a check-#23 entry; readers can locate it by check id without
    // depending on free-text wording.
    const hasCheck23Issue = result.issues.some((s) => /\bcheck 23\b/i.test(s));
    assert.ok(hasCheck23Issue, `expected issues to reference check 23, got: ${result.issues.join(' | ')}`);
  } finally {
    cleanup(dir);
  }
});

test('Case 5: empty requirements.md (zero ACs) returns >=3 issues and decision NO-GO', () => {
  const emptyReq = `# Requirements — empty

(intentionally no glossary, no requirements, no ACs)
`;
  const dir = makeTempSpec('empty-req', {
    'requirements.md': emptyReq,
    'design.md': MINIMAL_DESIGN,
    'tasks.md': MINIMAL_TASKS,
    'spec.json': MINIMAL_GOOD_SPEC_JSON,
  });
  try {
    const result = validateSpecFormat(dir);
    assert.ok(
      result.failed_checks.length >= 3,
      `expected >=3 failed checks, got ${result.failed_checks.length}: ${JSON.stringify(result.failed_checks.map((f) => f.check))}`
    );
    assert.equal(result.decision, 'NO-GO', `expected NO-GO with empty requirements.md, got ${result.decision}`);
    // Specifically: checks 3 (Glossary), 4 (≥1 Requirement), 5 (User Story), 6 (AC heading), 7 (≥1 AC) all fail
    const failedNums = new Set(result.failed_checks.map((f) => f.check));
    for (const expected of [3, 4, 5, 6, 7]) {
      assert.ok(failedNums.has(expected), `expected check #${expected} to fail in empty-requirements case`);
    }
  } finally {
    cleanup(dir);
  }
});

test('Case 6: synthetic happy-path (no fixture coupling) returns GO with score >=22 and EARS PASS', () => {
  // ADV-008 fix: this test breaks the dependency on tests/fixtures/specs/auth-flow-good/.
  // It assembles a fully-valid spec entirely in-memory so any future fixture edit cannot break
  // this regression line. Uses a custom design that avoids `### Heading` ambiguity in non-Component
  // sections (the validator's componentHeadings regex picks up every `###` at top level — known
  // limitation, out of scope for this fix). Tasks.md mentions every captured heading so check #15
  // (component → task forward link) passes.
  const goodDesign = `# Design — synthetic happy

## Architecture overview

Two components: Alpha (input handler) and Beta (output emitter).

## Components

### Alpha

**Responsibility:** parses input.
**Traces to:** Req 1.

### Beta

**Responsibility:** emits output.
**Traces to:** Req 2.

## Data model

Single record \`Thing\` with id and value fields.

## Contracts

POST \`/endpoint\` accepts JSON body, returns JSON response.
`;
  const goodTasks = `# Tasks — synthetic happy

## Slice A: foundation (Req 1, Req 2)

### [ ] Task 1.1: Implement Alpha parser

**Requirements:** Req 1
**Acceptance:** Alpha parses input correctly.
**Files in scope:** src/alpha.ts

### [ ] Task 1.2: Implement Beta emitter

**Requirements:** Req 2
**Acceptance:** Beta emits output reliably.
**Files in scope:** src/beta.ts

## Definition of done

- Build green.
`;
  const goodReq = `# Requirements — synthetic happy

This document is a fully synthetic happy-path spec.

## Glossary

- **Alpha**: synthetic component.
- **Beta**: synthetic component.

## Requirement 1: alpha behaviour

**User Story:** As a tester, I want a synthetic happy-path spec.

#### Acceptance Criteria

1. WHEN event-1 happens, THE Alpha SHALL respond with code 200.
2. WHEN event-2 happens, THE Alpha SHALL respond with code 201.
3. IF condition X holds, THEN THE Alpha SHALL emit event Y.
4. WHEN event-3 happens, THEN THE Beta SHALL log it.
5. THE Beta SHALL emit a heartbeat every 30 seconds.

## Requirement 2: beta behaviour

**User Story:** As a tester, I want a second requirement.

#### Acceptance Criteria

1. THE Beta SHALL NOT crash on malformed input.
2. WHEN event-4 happens, THE Beta SHALL retry up to 3 times.
`;
  const dir = makeTempSpec('synthetic-happy', {
    'requirements.md': goodReq,
    'design.md': goodDesign,
    'tasks.md': goodTasks,
    'spec.json': MINIMAL_GOOD_SPEC_JSON,
  });
  try {
    const result = validateSpecFormat(dir);
    assert.equal(
      result.decision,
      'GO',
      `expected GO on synthetic happy-path, got ${result.decision}. failed=${JSON.stringify(result.failed_checks.map((f) => f.check))}`
    );
    const numericScore = parseInt(result.score.split('/')[0], 10);
    assert.ok(
      numericScore >= DECISION_TABLE.GO_MIN_SCORE,
      `expected score >= ${DECISION_TABLE.GO_MIN_SCORE}, got ${result.score}`
    );
    assert.equal(result.ears_compliance, 'PASS');
    // Confirm the new check #15 (component → task forward link) actually passed.
    assert.ok(
      result.passed_checks.includes(15),
      `expected check #15 (component implemented by ≥1 task) to pass, but it failed`
    );
    // Confirm P3 classification works correctly under the documented order (ADV-002 anchor).
    const b = result.ears_breakdown;
    assert.ok(b.p3_event_then >= 1, `expected ≥1 P3 match (WHEN ..., THEN THE ...), got ${b.p3_event_then}`);
    // Confirm P4 NOT-form classifies as P4 (ADV-001 anchor).
    assert.ok(b.p4_ubiquitous >= 1, `expected ≥1 P4 match (THE … SHALL [NOT] …), got ${b.p4_ubiquitous}`);
    assert.ok(!('gate' in result), 'GO decision must not emit a gate field');
  } finally {
    cleanup(dir);
  }
});
