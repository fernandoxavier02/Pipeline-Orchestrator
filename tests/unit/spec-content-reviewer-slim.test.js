#!/usr/bin/env node
/**
 * tests/unit/spec-content-reviewer-slim.test.js
 *
 * Unit tests for the spec-content-reviewer agent — SLIM mode (Phase 1.5, light variant).
 *
 * The agent itself is a markdown spec (agents/executor/type-specific/spec-content-reviewer.md).
 * This test file re-implements the deterministic logic the agent is contracted to follow
 * for the 6 critical axes (slim subset) and validates that logic against real and synthetic
 * fixtures.
 *
 * Slim subset (6 axes — block implementation if missing):
 *   #1 req↔tasks congruence
 *   #2 AC testability
 *   #3 req↔design congruence
 *   #4 ambiguities
 *   #5 risks identified
 *   #6 contract completeness
 *
 * The reviewContentSlim() function below is the executable specification of what the agent
 * must produce when it reads a spec directory in slim mode. If the agent's prose drifts from
 * this logic, this test breaks — that is intentional (executable contract).
 *
 * Run: node tests/unit/spec-content-reviewer-slim.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ─── Decision tables (single source, no inline magic numbers) ────────────────────────

const SLIM_DECISION_TABLE = Object.freeze({
  GO_MIN_SCORE: 85,
  WARN_MIN_SCORE: 70,
  MAX_NOGO_AXES: 0, // any axis NO-GO forces overall NO-GO in slim mode
});

const AXIS_STATUS_THRESHOLDS = Object.freeze({
  GO: 80, // score >= 80 → GO
  WARN: 60, // 60..79 → WARN
  // <60 → NO-GO
});

// Slim axis IDs — strict subset of the 12-axis SSOT in the agent's markdown.
const SLIM_AXIS_IDS = Object.freeze([1, 2, 3, 4, 5, 6]);

const AXIS_NAMES = Object.freeze({
  1: 'req_tasks_congruence',
  2: 'ac_testability',
  3: 'req_design_congruence',
  4: 'ambiguities',
  5: 'risks_identified',
  6: 'contract_completeness',
});

// ─── Vague verb list (axis #2 + #4) ──────────────────────────────────────────────────
// Vague verbs in normative text are evidence of untestable / ambiguous ACs.
// Used by axis #2 (testability) and #4 (ambiguities). Single list, no duplication.
const VAGUE_VERBS = Object.freeze([
  'handle properly',
  'manage',
  'process appropriately',
  'deal with',
  'support',
  'work with',
  'ensure',
  'make sure',
  'as appropriate',
  'as needed',
  'somehow',
  'etc',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────────────

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function findRequirementBlocks(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(/^##\s+Requirement\s+(\d+)/i);
    if (m) {
      if (current) blocks.push(current);
      current = { number: parseInt(m[1], 10), body: '', startLine: i + 1 };
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

function extractAcsWithIds(reqText) {
  // Returns array of { id: "<reqNum>.<acNum>", text: "...", line: <abs line in file> }
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
        acs.push({
          id: `${curReq}.${acMatch[1]}`,
          text: acMatch[2].trim(),
          line: i + 1,
        });
      }
    }
  }
  return acs;
}

function extractTaskBodies(tasksText) {
  if (!tasksText) return [];
  const lines = tasksText.split(/\r?\n/);
  const tasks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+\[([ x])\]\s+Task\s+(\d+(?:\.\d+)?)/i);
    if (m) {
      let body = lines[i] + '\n';
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{2,3}\s+/.test(lines[j])) break;
        body += lines[j] + '\n';
      }
      tasks.push({ id: m[2], body });
    }
  }
  return tasks;
}

function findComponentNames(designText) {
  if (!designText) return [];
  return [...designText.matchAll(/^###\s+([A-Za-z][\w-]+)/gm)].map((m) => m[1]);
}

function clamp01to100(value) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function statusForScore(score) {
  if (score >= AXIS_STATUS_THRESHOLDS.GO) return 'GO';
  if (score >= AXIS_STATUS_THRESHOLDS.WARN) return 'WARN';
  return 'NO-GO';
}

// ─── Per-axis evaluators (each returns { score, issues }) ────────────────────────────

// Axis #1: req↔tasks congruence — every AC referenced by ≥1 task.
function evalAxis1(reqText, tasksText) {
  const acs = extractAcsWithIds(reqText);
  const issues = [];
  if (acs.length === 0) {
    return { score: 0, issues: ['no ACs found in requirements.md'] };
  }
  const tasksBlob = (tasksText || '').toString();
  // Normalize: strip whitespace inside refs so "AC 1.1", "AC#1.1", "1.1" all match the AC id.
  let referenced = 0;
  for (const ac of acs) {
    // Look for the AC id as a token in tasks: "1.1", "AC 1.1", "Req 1 (AC 1)", "AC#1.1"
    const reqNum = ac.id.split('.')[0];
    const acNum = ac.id.split('.')[1];
    // Patterns we accept as "this AC is referenced":
    //   AC <reqNum>.<acNum>
    //   AC#<reqNum>.<acNum>
    //   AC <acNum>  (within a Req <reqNum> task block — we approximate by global presence + Req ref)
    //   "(AC <acNum>" or "(AC <reqNum>.<acNum>"
    const patterns = [
      new RegExp(`\\bAC\\s*#?\\s*${reqNum}\\.${acNum}\\b`),
      new RegExp(`\\bAC\\s+${acNum}\\b.{0,200}\\bReq(?:uirement)?\\s+${reqNum}\\b`, 's'),
      new RegExp(`\\bReq(?:uirement)?\\s+${reqNum}\\b.{0,300}\\bAC\\s+${acNum}\\b`, 's'),
    ];
    if (patterns.some((re) => re.test(tasksBlob))) {
      referenced++;
    } else {
      issues.push(`AC ${ac.id} not referenced by any task (line ${ac.line})`);
    }
  }
  const score = clamp01to100((referenced / acs.length) * 100);
  return { score, issues };
}

// Axis #2: AC testability — each AC has an observable success criterion.
// Heuristic: AC text must contain at least one of (a) HTTP code, (b) explicit value/output,
// (c) measurable threshold, (d) "return", "emit", "produce", "respond" verbs. Vague verbs
// from VAGUE_VERBS reduce score.
function evalAxis2(reqText) {
  const acs = extractAcsWithIds(reqText);
  if (acs.length === 0) return { score: 0, issues: ['no ACs to evaluate'] };
  const issues = [];
  let testableCount = 0;
  const observableSignal =
    /\b(HTTP\s+\d{3}|return|returns?|emit|emits?|produce|produces?|respond|responds?|reject|rejects?|append|appends?|sign|signs?|expire|expires?|mark|marks?)\b/i;
  const measurable = /\d/; // any numeric threshold/code
  for (const ac of acs) {
    const t = ac.text.toLowerCase();
    const hasObservable = observableSignal.test(ac.text);
    const hasMeasurable = measurable.test(ac.text);
    const hasVague = VAGUE_VERBS.some((v) => t.includes(v));
    const isTestable = (hasObservable || hasMeasurable) && !hasVague;
    if (isTestable) {
      testableCount++;
    } else {
      const reasons = [];
      if (!hasObservable && !hasMeasurable) reasons.push('no observable verb or numeric criterion');
      if (hasVague) {
        const matched = VAGUE_VERBS.find((v) => t.includes(v));
        reasons.push(`vague verb "${matched}"`);
      }
      issues.push(`AC ${ac.id} not testable: ${reasons.join('; ')} (line ${ac.line})`);
    }
  }
  const score = clamp01to100((testableCount / acs.length) * 100);
  return { score, issues };
}

// Axis #3: req↔design congruence — each AC maps to ≥1 named component or contract endpoint.
function evalAxis3(reqText, designText) {
  const acs = extractAcsWithIds(reqText);
  if (acs.length === 0) return { score: 0, issues: ['no ACs to evaluate'] };
  if (!designText) return { score: 0, issues: ['design.md absent'] };
  const components = findComponentNames(designText);
  const issues = [];
  let mappedCount = 0;
  // Cheap mapping heuristic: AC text mentions a component name OR an HTTP method/path that
  // appears in design.md contracts section.
  const contractEndpoints = [...designText.matchAll(/`(GET|POST|PUT|DELETE|PATCH)\s+\/[^\s`]+`/gi)].map((m) => m[0]);
  for (const ac of acs) {
    const referencesComponent = components.some((c) => new RegExp(`\\b${c}\\b`).test(ac.text));
    const referencesEndpoint = contractEndpoints.some((e) => {
      // strip backticks for match
      const bare = e.replace(/`/g, '');
      const path = bare.split(/\s+/)[1];
      return path && ac.text.includes(path);
    });
    if (referencesComponent || referencesEndpoint) {
      mappedCount++;
    } else {
      issues.push(`AC ${ac.id} does not reference any design component or contract endpoint (line ${ac.line})`);
    }
  }
  const score = clamp01to100((mappedCount / acs.length) * 100);
  return { score, issues };
}

// Axis #4: ambiguities — count vague verbs / undefined jargon in normative text.
function evalAxis4(reqText) {
  if (!reqText) return { score: 0, issues: ['requirements.md absent'] };
  const acs = extractAcsWithIds(reqText);
  const issues = [];
  let vagueHits = 0;
  for (const ac of acs) {
    const t = ac.text.toLowerCase();
    for (const v of VAGUE_VERBS) {
      if (t.includes(v)) {
        vagueHits++;
        issues.push(`vague verb "${v}" in AC ${ac.id} (line ${ac.line})`);
      }
    }
  }
  if (acs.length === 0) {
    return { score: 0, issues: ['no ACs to evaluate ambiguities against'] };
  }
  // score = 100 - (vagueHits / acs.length) * 100, clamped
  const score = clamp01to100(100 - (vagueHits / acs.length) * 100);
  return { score, issues };
}

// Axis #5: risks identified — at least one risks section exists and is non-empty.
function evalAxis5(reqText, designText) {
  const issues = [];
  const blob = (reqText || '') + '\n\n' + (designText || '');
  // Look for headings: ## Risks, ## Risk, ## Mitigations, ## Threats, ## Threat model.
  // Walk lines manually to avoid the JS `\Z` anti-pattern (would match literal Z mid-text).
  const lines = blob.split(/\r?\n/);
  let riskHeadingIdx = -1;
  const RISK_HEADING_RE = /^#{2,3}\s+(Risks?|Mitigations?|Threats?|Threat\s+model)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (RISK_HEADING_RE.test(lines[i])) {
      riskHeadingIdx = i;
      break;
    }
  }
  if (riskHeadingIdx === -1) {
    issues.push('no Risks/Mitigations/Threats section found in requirements.md or design.md');
    return { score: 0, issues };
  }
  // Body = until next heading of same-or-higher level, or EOF.
  let endIdx = lines.length;
  for (let j = riskHeadingIdx + 1; j < lines.length; j++) {
    if (/^#{1,3}\s+/.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  const sectionBody = lines.slice(riskHeadingIdx + 1, endIdx).filter((l) => l.trim().length > 0);
  if (sectionBody.length < 2) {
    issues.push('Risks section present but empty (no listed risks)');
    return { score: 30, issues };
  }
  return { score: 100, issues: [] };
}

// Helper: extract a top-level (## heading) section body by name. Returns the slice from
// just after the heading line to just before the next ## heading (or end of file). Avoids
// the JavaScript `\Z` pitfall — `\Z` is NOT supported in JS regex; the literal `Z` would
// match accidentally inside body text (e.g., the `Z` in `Authorization`). We split by lines
// and walk explicitly instead.
function extractH2Section(text, headingRegex) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (/^##\s+/.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join('\n');
}

// Axis #6: contract completeness — APIs in design.md contracts section have request, response,
// AND error codes. Score = (endpoints_with_all_three / total_endpoints) * 100.
function evalAxis6(designText) {
  if (!designText) return { score: 0, issues: ['design.md absent'] };
  // Find Contracts section (no `\Z` anti-pattern; JS doesn't support it).
  const contracts = extractH2Section(designText, /^##\s+Contracts?\b/i);
  if (contracts === null) return { score: 0, issues: ['no Contracts section in design.md'] };
  // Find endpoint headers (### `METHOD /path` or ### METHOD /path)
  const endpointMatches = [...contracts.matchAll(/^###\s+`?(GET|POST|PUT|DELETE|PATCH)\s+\/[^\s`\n]+`?/gim)];
  const issues = [];
  if (endpointMatches.length === 0) {
    return { score: 0, issues: ['no endpoint headings in Contracts section'] };
  }
  // Split contracts by endpoint heading
  const endpointBodies = [];
  for (let i = 0; i < endpointMatches.length; i++) {
    const start = endpointMatches[i].index + endpointMatches[i][0].length;
    const end = i + 1 < endpointMatches.length ? endpointMatches[i + 1].index : contracts.length;
    endpointBodies.push({ header: endpointMatches[i][0], body: contracts.slice(start, end) });
  }
  let complete = 0;
  for (const ep of endpointBodies) {
    const hasReq = /\brequest(\s+(body|header))?\b/i.test(ep.body);
    const hasRes = /\bresponse(\s+\d{3})?\b/i.test(ep.body);
    const hasErrors = /\berrors?\b|\b\d{3}\b/i.test(ep.body) && /\b(40\d|50\d|4\d\d|5\d\d)\b/.test(ep.body);
    if (hasReq && hasRes && hasErrors) {
      complete++;
    } else {
      const missing = [];
      if (!hasReq) missing.push('request');
      if (!hasRes) missing.push('response');
      if (!hasErrors) missing.push('error codes');
      issues.push(`endpoint ${ep.header.trim()} missing: ${missing.join(', ')}`);
    }
  }
  const score = clamp01to100((complete / endpointBodies.length) * 100);
  return { score, issues };
}

// ─── Slim validator (executable spec of the agent in slim mode) ──────────────────────

function reviewContentSlim(specPath) {
  const reqText = safeRead(path.join(specPath, 'requirements.md'));
  const designText = safeRead(path.join(specPath, 'design.md'));
  const tasksText = safeRead(path.join(specPath, 'tasks.md'));

  const evaluators = {
    1: () => evalAxis1(reqText, tasksText),
    2: () => evalAxis2(reqText),
    3: () => evalAxis3(reqText, designText),
    4: () => evalAxis4(reqText),
    5: () => evalAxis5(reqText, designText),
    6: () => evalAxis6(designText),
  };

  const axes = {};
  let scoreSum = 0;
  let nogoCount = 0;
  for (const id of SLIM_AXIS_IDS) {
    const { score, issues } = evaluators[id]();
    const status = statusForScore(score);
    axes[String(id)] = {
      name: AXIS_NAMES[id],
      score,
      status,
      issues,
    };
    scoreSum += score;
    if (status === 'NO-GO') nogoCount++;
  }
  const overall = clamp01to100(scoreSum / SLIM_AXIS_IDS.length);

  let decision;
  if (overall < SLIM_DECISION_TABLE.WARN_MIN_SCORE || nogoCount > SLIM_DECISION_TABLE.MAX_NOGO_AXES) {
    decision = 'NO-GO';
  } else if (overall >= SLIM_DECISION_TABLE.GO_MIN_SCORE) {
    decision = 'GO';
  } else {
    decision = 'WARN';
  }

  const result = {
    spec_path: specPath,
    mode: 'slim',
    score: overall,
    axes,
    decision,
  };
  if (decision === 'NO-GO') result.gate = 'SPEC_CONTENT_REVIEW_NOGO';
  return result;
}

// Export the per-axis evaluators so the full-mode test can reuse them for the consistency check.
module.exports = {
  reviewContentSlim,
  evalAxis1,
  evalAxis2,
  evalAxis3,
  evalAxis4,
  evalAxis5,
  evalAxis6,
  SLIM_DECISION_TABLE,
  SLIM_AXIS_IDS,
  AXIS_NAMES,
  AXIS_STATUS_THRESHOLDS,
  VAGUE_VERBS,
  statusForScore,
  clamp01to100,
};

// ─── Test fixtures setup ─────────────────────────────────────────────────────────────

const REPO_FIXTURE = path.join(__dirname, '..', 'fixtures', 'specs', 'auth-flow-good');

function makeTempSpec(name, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `spec-content-slim-${name}-`));
  for (const [fname, content] of Object.entries(files)) {
    if (content === null) continue;
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

const RICH_DESIGN_WITH_RISKS = `# Design — synthetic

## Architecture overview

Three components.

## Components

### Alpha

**Responsibility:** parses input.
**Traces to:** Req 1.

### Beta

**Responsibility:** emits output.
**Traces to:** Req 2.

## Data model

### Thing

| Field | Type |
|-------|------|
| id    | str  |
| value | int  |

## Contracts

### \`POST /endpoint\`

**Request body:** JSON with email, password.
**Response 200:** JSON with token.
**Errors:** 401 invalid_credentials, 429 rate_limited, 400 bad_request.

## Risks

- Risk: token leakage via logs. Mitigation: redact JWT in logger.
- Risk: rate-limit bypass via IP rotation. Mitigation: include device fingerprint.
`;

const RICH_TASKS = `# Tasks — synthetic

## Slice A: foundation (Req 1, Req 2)

### [ ] Task 1.1: Implement Alpha — handles AC 1.1

**Requirements:** Req 1 (AC 1.1)
**Acceptance:** Alpha returns code 200 on event-1.
**Files in scope:** src/alpha.ts

### [ ] Task 1.2: Implement Beta — handles AC 2.1

**Requirements:** Req 2 (AC 2.1)
**Acceptance:** Beta emits payload on event-2.
**Files in scope:** src/beta.ts

## Definition of done

- Build green.
`;

const RICH_REQ_GOOD = `# Requirements — synthetic happy

This document is a fully synthetic happy-path spec for slim review.

## Glossary

- **Alpha**: input handler.
- **Beta**: output emitter.

## Requirement 1: alpha behaviour

**User Story:** As a tester, I want testable ACs.

#### Acceptance Criteria

1. WHEN event-1 happens, THE Alpha SHALL return HTTP 200 with body \`{"ok": true}\`.

## Requirement 2: beta behaviour

**User Story:** As a tester, I want testable ACs.

#### Acceptance Criteria

1. WHEN event-2 happens, THE Beta SHALL emit a record at \`POST /endpoint\` containing field "value".
`;

// ─── Tests ───────────────────────────────────────────────────────────────────────────
//
// Only register tests when this file is invoked directly (`node spec-content-reviewer-slim.test.js`).
// When `require()`d by spec-content-reviewer-full.test.js (which reuses the per-axis evaluators
// for the mode SSOT consistency check), do NOT register tests — that would double-run the slim
// suite as a side effect of the require. This keeps the executable contract decoupled from
// loading semantics: the require gives access to evaluators only.

if (require.main === module) {

test('Module shape: reviewContentSlim is a function and exports per-axis evaluators', () => {
  assert.equal(typeof reviewContentSlim, 'function');
  for (const id of SLIM_AXIS_IDS) {
    assert.equal(typeof module.exports[`evalAxis${id}`], 'function', `evalAxis${id} must be exported`);
  }
  assert.deepEqual([...SLIM_AXIS_IDS], [1, 2, 3, 4, 5, 6]);
});

test('Case 1: positive path on auth-flow-good fixture returns GO with score >=85', () => {
  const result = reviewContentSlim(REPO_FIXTURE);
  assert.equal(
    result.decision,
    'GO',
    `expected GO, got ${result.decision}. axes=${JSON.stringify(
      Object.fromEntries(Object.entries(result.axes).map(([k, v]) => [k, { score: v.score, status: v.status }]))
    )}`
  );
  assert.ok(result.score >= SLIM_DECISION_TABLE.GO_MIN_SCORE, `expected score >= 85, got ${result.score}`);
  assert.equal(Object.keys(result.axes).length, 6, 'slim mode must evaluate exactly 6 axes');
  // All axes present and named
  for (const id of [1, 2, 3, 4, 5, 6]) {
    assert.ok(result.axes[String(id)], `axis #${id} missing from result`);
    assert.equal(result.axes[String(id)].name, AXIS_NAMES[id]);
  }
  assert.ok(!('gate' in result), 'GO decision must not emit a gate field');
});

test('Case 2: tasks.md where every task references same AC produces low req↔tasks score and WARN/NO-GO overall', () => {
  // 3 ACs in requirements but only AC 1.1 referenced by tasks → axis #1 score = 33%
  const reqText = `# Requirements — many ACs one task

This is a synthetic spec where most ACs are orphaned by tasks.

## Glossary
- **Alpha**: handler.

## Requirement 1: synthetic

**User Story:** As a tester.

#### Acceptance Criteria

1. WHEN event-1 happens, THE Alpha SHALL return HTTP 200 at \`POST /endpoint\`.
2. WHEN event-2 happens, THE Alpha SHALL return HTTP 201 at \`POST /endpoint\`.
3. WHEN event-3 happens, THE Alpha SHALL return HTTP 202 at \`POST /endpoint\`.
`;
  const tasksText = `# Tasks

## Slice A

### [ ] Task 1.1: only handles AC 1.1

**Requirements:** Req 1 (AC 1.1)
**Acceptance:** Alpha returns 200.
**Files in scope:** src/alpha.ts

### [ ] Task 1.2: also AC 1.1

**Requirements:** Req 1 (AC 1.1)
**Acceptance:** retest 200.
**Files in scope:** src/alpha-2.ts

## Definition of done
- green
`;
  const dir = makeTempSpec('one-ac', {
    'requirements.md': reqText,
    'design.md': RICH_DESIGN_WITH_RISKS,
    'tasks.md': tasksText,
  });
  try {
    const result = reviewContentSlim(dir);
    // Axis #1 must be NO-GO (score = 33, only 1 of 3 ACs referenced)
    assert.ok(
      result.axes['1'].score < AXIS_STATUS_THRESHOLDS.WARN,
      `expected axis #1 score < 60, got ${result.axes['1'].score}`
    );
    assert.equal(result.axes['1'].status, 'NO-GO');
    // Slim has MAX_NOGO_AXES=0 → any NO-GO forces overall NO-GO.
    assert.equal(
      result.decision,
      'NO-GO',
      `slim has zero-tolerance for NO-GO axes; expected NO-GO, got ${result.decision}`
    );
    assert.equal(result.gate, 'SPEC_CONTENT_REVIEW_NOGO');
    // Issues must cite the orphaned ACs
    assert.ok(
      result.axes['1'].issues.some((i) => /1\.2/.test(i)),
      `expected issue mentioning AC 1.2, got: ${result.axes['1'].issues.join(' | ')}`
    );
  } finally {
    cleanup(dir);
  }
});

test('Case 3: synthetic spec with vague verbs in ACs forces ambiguities axis NO-GO and overall NO-GO', () => {
  const reqText = `# Requirements — vague

This document deliberately uses vague verbs.

## Glossary
- **Alpha**: handler.

## Requirement 1: vague

**User Story:** As a tester.

#### Acceptance Criteria

1. THE Alpha SHALL handle properly the input event.
2. THE Alpha SHALL manage the output state.
3. THE Alpha SHALL ensure correctness of all derived values.
`;
  const dir = makeTempSpec('vague-acs', {
    'requirements.md': reqText,
    'design.md': RICH_DESIGN_WITH_RISKS,
    'tasks.md': RICH_TASKS,
  });
  try {
    const result = reviewContentSlim(dir);
    // Axis #4 (ambiguities) must be NO-GO — every AC has a vague verb.
    assert.equal(
      result.axes['4'].status,
      'NO-GO',
      `expected axis #4 NO-GO, got status=${result.axes['4'].status} score=${result.axes['4'].score}`
    );
    assert.ok(result.axes['4'].issues.length >= 3, `expected ≥3 ambiguity issues, got ${result.axes['4'].issues.length}`);
    assert.equal(result.decision, 'NO-GO', `vague verbs must force NO-GO, got ${result.decision}`);
    assert.equal(result.gate, 'SPEC_CONTENT_REVIEW_NOGO');
  } finally {
    cleanup(dir);
  }
});

test('Case 4: synthetic spec missing risks section forces axis #5 NO-GO', () => {
  const designNoRisks = RICH_DESIGN_WITH_RISKS.replace(/## Risks[\s\S]*$/m, '').trim() + '\n';
  // Sanity: stripping worked
  assert.ok(!/##\s+Risks/i.test(designNoRisks), 'fixture builder failed to strip Risks section');
  const dir = makeTempSpec('no-risks', {
    'requirements.md': RICH_REQ_GOOD,
    'design.md': designNoRisks,
    'tasks.md': RICH_TASKS,
  });
  try {
    const result = reviewContentSlim(dir);
    assert.equal(result.axes['5'].status, 'NO-GO', `expected axis #5 NO-GO, got ${result.axes['5'].status}`);
    assert.equal(result.axes['5'].score, 0);
    assert.equal(result.decision, 'NO-GO');
    assert.equal(result.gate, 'SPEC_CONTENT_REVIEW_NOGO');
  } finally {
    cleanup(dir);
  }
});

test('Case 5: design with API endpoints missing error codes reduces axis #6 score', () => {
  const designNoErrors = `# Design

## Components

### Alpha

**Responsibility:** parses input.
**Traces to:** Req 1.

## Contracts

### \`POST /endpoint\`

**Request body:** JSON.
**Response 200:** JSON.

## Risks

- Risk: a single risk.
- Risk: another risk.
`;
  const dir = makeTempSpec('no-errors', {
    'requirements.md': RICH_REQ_GOOD,
    'design.md': designNoErrors,
    'tasks.md': RICH_TASKS,
  });
  try {
    const result = reviewContentSlim(dir);
    // Endpoint has request + response but no error codes → axis #6 score = 0/1 = 0
    assert.ok(
      result.axes['6'].score < AXIS_STATUS_THRESHOLDS.GO,
      `expected axis #6 score < 80, got ${result.axes['6'].score}`
    );
    assert.ok(
      result.axes['6'].issues.some((i) => /error codes/i.test(i)),
      `expected error-codes issue, got: ${result.axes['6'].issues.join(' | ')}`
    );
  } finally {
    cleanup(dir);
  }
});

test('Case 6: precondition simulation — slim is a strict subset (axes 1-6 only)', () => {
  // Defensive test: confirm slim mode never evaluates axes 7-12 (mode discipline).
  const result = reviewContentSlim(REPO_FIXTURE);
  for (const forbidden of [7, 8, 9, 10, 11, 12]) {
    assert.ok(
      !(String(forbidden) in result.axes),
      `axis #${forbidden} must NOT appear in slim-mode result (mode discipline)`
    );
  }
  assert.equal(result.mode, 'slim');
});

} // end if (require.main === module) — see comment above the test block
