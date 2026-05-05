#!/usr/bin/env node
/**
 * tests/unit/spec-content-reviewer-full.test.js
 *
 * Unit tests for the spec-content-reviewer agent — FULL mode (Phase 1.5, heavy + audit-only).
 *
 * The agent itself is a markdown spec (agents/executor/type-specific/spec-content-reviewer.md).
 * This test file re-implements the deterministic logic the agent is contracted to follow
 * for all 12 axes and validates that logic against real and synthetic fixtures.
 *
 * Mode SSOT: full mode is a strict superset of slim. Axes #1-#6 share the SAME evaluator
 * functions as slim (we import them from spec-content-reviewer-slim.test.js — single source
 * of truth, no duplication). Axes #7-#12 are added on top.
 *
 * Slim subset (#1-#6) — see spec-content-reviewer-slim.test.js.
 * Full additions (#7-#12 — heavy and audit-only only):
 *   #7  design↔tasks congruence (every component implemented by ≥1 task)
 *   #8  data models present (named entity with ≥2 typed fields)
 *   #9  vertical slices (## Slice headings in tasks.md)
 *   #10 dependencies declared (libraries / services / env vars)
 *   #11 DI/CI invariants (constraint section, MUST NOT, SHALL NOT)
 *   #12 operational sections (perf, security, monitoring)
 *
 * Run: node tests/unit/spec-content-reviewer-full.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ─── Import shared evaluators from the slim test module (mode SSOT) ──────────────────
// Axes #1-#6 are evaluated by the SAME functions in both modes — full mode reuses them.
// This is the mode discipline guarantee: there is no duplicate axis #1 logic anywhere.

const slim = require('./spec-content-reviewer-slim.test.js');
const {
  evalAxis1,
  evalAxis2,
  evalAxis3,
  evalAxis4,
  evalAxis5,
  evalAxis6,
  AXIS_NAMES: SLIM_AXIS_NAMES,
  AXIS_STATUS_THRESHOLDS,
  statusForScore,
  clamp01to100,
} = slim;

// ─── Decision table — full mode (single source) ──────────────────────────────────────

const FULL_DECISION_TABLE = Object.freeze({
  GO_MIN_SCORE: 80,
  WARN_MIN_SCORE: 65,
  MAX_NOGO_AXES: 1, // one axis NO-GO tolerable in WARN; 2+ forces NO-GO
});

const FULL_AXIS_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const FULL_AXIS_NAMES = Object.freeze({
  ...SLIM_AXIS_NAMES,
  7: 'design_tasks_congruence',
  8: 'data_models',
  9: 'vertical_slices',
  10: 'dependencies',
  11: 'di_ci_invariants',
  12: 'operational_sections',
});

// ─── Helpers ─────────────────────────────────────────────────────────────────────────

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function findComponentNames(designText) {
  // Component names are the ### headings under the ## Components section ONLY.
  // The ### subheadings under Data model / Contracts are NOT components — earlier versions
  // included them and produced false negatives in axis #7 (component-task forward link).
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

// ─── Per-axis evaluators for #7-#12 ──────────────────────────────────────────────────

// Axis #7: design↔tasks congruence — every component implemented by ≥1 task in tasks.md.
// (Distinct from check #15 in spec-format-gate, which is binary; here we score continuously.)
function evalAxis7(designText, tasksText) {
  const components = findComponentNames(designText);
  if (components.length === 0) return { score: 0, issues: ['no components defined in design.md'] };
  if (!tasksText) return { score: 0, issues: ['tasks.md absent'] };
  const issues = [];
  let implemented = 0;
  for (const c of components) {
    if (new RegExp(`\\b${c}\\b`).test(tasksText)) {
      implemented++;
    } else {
      issues.push(`component "${c}" not referenced by any task`);
    }
  }
  const score = clamp01to100((implemented / components.length) * 100);
  return { score, issues };
}

// Axis #8: data models — at least one named data entity with ≥2 fields and explicit types.
// Heuristic: find a "Data model" or "Data models" section, count named entities (### blocks)
// that contain a markdown table with ≥2 typed rows OR an interface/type/struct declaration.
function evalAxis8(designText) {
  if (!designText) return { score: 0, issues: ['design.md absent'] };
  const lines = designText.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Data\s*models?\b/i.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return { score: 0, issues: ['no Data model section in design.md'] };
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (/^##\s+/.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  const section = lines.slice(startIdx + 1, endIdx).join('\n');
  // Count ### entity blocks
  const entityHeadings = [...section.matchAll(/^###\s+`?([A-Za-z][\w-]+)`?/gm)];
  if (entityHeadings.length === 0) return { score: 0, issues: ['Data model section has no named entities'] };
  // For each entity, check that the body has either a markdown table with type column
  // (header row contains "Type") or an interface/type/struct declaration with ≥2 fields.
  const issues = [];
  let validEntities = 0;
  for (let i = 0; i < entityHeadings.length; i++) {
    const start = entityHeadings[i].index + entityHeadings[i][0].length;
    const end = i + 1 < entityHeadings.length ? entityHeadings[i + 1].index : section.length;
    const body = section.slice(start, end);
    const name = entityHeadings[i][1];
    // markdown table with Type column
    const hasTypedTable =
      /^\|[^\n]*\bType\b[^\n]*\|/im.test(body) && (body.match(/^\|[^\n]+\|[^\n]+\|/gim) || []).length >= 3; // header + separator + ≥2 rows
    // interface / type / struct declaration with ≥2 fields
    const hasTypedDecl = /(interface|type|struct)\s+\w+\s*\{[\s\S]*?\}/i.test(body);
    if (hasTypedTable || hasTypedDecl) {
      validEntities++;
    } else {
      issues.push(`entity "${name}" has no typed field listing (table with Type column or typed declaration)`);
    }
  }
  const score = clamp01to100((validEntities / entityHeadings.length) * 100);
  return { score, issues };
}

// Axis #9: vertical slices — tasks.md organized as ## Slice headings.
function evalAxis9(tasksText) {
  if (!tasksText) return { score: 0, issues: ['tasks.md absent'] };
  const sliceHeadings = [...tasksText.matchAll(/^##\s+Slice\b/gim)];
  if (sliceHeadings.length === 0) {
    return { score: 0, issues: ['no ## Slice headings in tasks.md (tasks not organized as vertical slices)'] };
  }
  // Count tasks under each slice. Score is high when slices contain ≥1 task each.
  const lines = tasksText.split(/\r?\n/);
  let currentSliceTaskCount = 0;
  let inSlice = false;
  let slicesWithTasks = 0;
  let totalSlices = 0;
  for (const ln of lines) {
    if (/^##\s+Slice\b/i.test(ln)) {
      if (inSlice && currentSliceTaskCount > 0) slicesWithTasks++;
      if (inSlice) totalSlices++;
      inSlice = true;
      currentSliceTaskCount = 0;
    } else if (/^##\s+/.test(ln) && inSlice) {
      // closed by a non-Slice ## heading
      if (currentSliceTaskCount > 0) slicesWithTasks++;
      totalSlices++;
      inSlice = false;
      currentSliceTaskCount = 0;
    } else if (inSlice && /^###\s+\[[ x]\]\s+Task\s+\d/i.test(ln)) {
      currentSliceTaskCount++;
    }
  }
  if (inSlice) {
    totalSlices++;
    if (currentSliceTaskCount > 0) slicesWithTasks++;
  }
  if (totalSlices === 0) return { score: 0, issues: ['no slices found'] };
  const score = clamp01to100((slicesWithTasks / totalSlices) * 100);
  const issues = slicesWithTasks < totalSlices ? [`${totalSlices - slicesWithTasks} slice(s) contain zero tasks`] : [];
  return { score, issues };
}

// Axis #10: dependencies — explicit listing of external libraries / services / env vars.
function evalAxis10(designText, reqText) {
  const blob = (designText || '') + '\n\n' + (reqText || '');
  if (blob.trim().length === 0) return { score: 0, issues: ['both design.md and requirements.md absent'] };
  // Look for headings or labelled lines: "Dependencies", "External services", "Environment variables", "Libraries"
  const hasDepsSection =
    /^##\s+(Dependencies|External\s+services?|Environment\s+variables?|Libraries|Third[-\s]party)\b/im.test(blob);
  // Or inline mentions of env vars in code-format (e.g., `JWT_SECRET`)
  const envVarMentions = (blob.match(/\b[A-Z][A-Z0-9_]{3,}\s+(?:environment|env)\s+variable\b/gi) || []).length +
    (blob.match(/\b(?:env|environment)\s+variable\b/gi) || []).length;
  const issues = [];
  let score = 0;
  if (hasDepsSection) {
    score = 100;
  } else if (envVarMentions >= 1) {
    score = 70;
    issues.push('no Dependencies/External services/Environment variables section; only inline env-var mentions');
  } else {
    score = 0;
    issues.push('no Dependencies / External services / Environment variables section, no env-var mentions');
  }
  return { score, issues };
}

// Axis #11: DI/CI invariants — explicit invariant section OR ≥2 "MUST NOT"/"SHALL NOT" statements.
function evalAxis11(designText, reqText) {
  const blob = (designText || '') + '\n\n' + (reqText || '');
  if (blob.trim().length === 0) return { score: 0, issues: ['both design.md and requirements.md absent'] };
  const hasInvariantHeading = /^##\s+(Invariants?|Constraints?|Postconditions?|Preconditions?)\b/im.test(blob);
  const mustNotMatches = (blob.match(/\b(MUST\s+NOT|SHALL\s+NOT|MUST\s+NEVER|SHALL\s+NEVER)\b/gi) || []).length;
  const issues = [];
  let score = 0;
  if (hasInvariantHeading) {
    score = 100;
  } else if (mustNotMatches >= 2) {
    score = 80;
  } else if (mustNotMatches === 1) {
    score = 40;
    issues.push('only 1 MUST NOT / SHALL NOT statement; expected ≥2 or a dedicated Invariants section');
  } else {
    score = 0;
    issues.push('no Invariants/Constraints section and no MUST NOT / SHALL NOT statements');
  }
  return { score, issues };
}

// Axis #12: operational sections — perf, security, OR monitoring sections present and non-trivial.
function evalAxis12(designText, reqText) {
  const blob = (designText || '') + '\n\n' + (reqText || '');
  if (blob.trim().length === 0) return { score: 0, issues: ['both design.md and requirements.md absent'] };
  const lines = blob.split(/\r?\n/);
  const OPS_HEADING_RE = /^##\s+(Performance|Security|Monitoring|Observability|Operations|Operational\b)/i;
  let foundSections = [];
  let i = 0;
  while (i < lines.length) {
    if (OPS_HEADING_RE.test(lines[i])) {
      // count non-empty body lines until next ## heading
      let body = 0;
      let j = i + 1;
      while (j < lines.length && !/^##\s+/.test(lines[j])) {
        if (lines[j].trim().length > 0 && !/^#{1,6}\s+/.test(lines[j])) body++;
        j++;
      }
      foundSections.push({ heading: lines[i].trim(), body });
      i = j;
    } else {
      i++;
    }
  }
  const issues = [];
  if (foundSections.length === 0) {
    issues.push('no Performance / Security / Monitoring / Operational section in spec');
    return { score: 0, issues };
  }
  // At least one section must have ≥2 body lines (non-trivial).
  const nonTrivial = foundSections.filter((s) => s.body >= 2);
  if (nonTrivial.length === 0) {
    issues.push(`found ${foundSections.length} operational section(s) but all have <2 body lines (trivial)`);
    return { score: 30, issues };
  }
  // Score = (nonTrivial / foundSections) * 100, but never below 60 if at least one nonTrivial exists.
  const score = clamp01to100(Math.max(60, (nonTrivial.length / foundSections.length) * 100));
  return { score, issues };
}

// ─── Full validator (executable spec of the agent in full mode) ──────────────────────

function reviewContentFull(specPath) {
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
    7: () => evalAxis7(designText, tasksText),
    8: () => evalAxis8(designText),
    9: () => evalAxis9(tasksText),
    10: () => evalAxis10(designText, reqText),
    11: () => evalAxis11(designText, reqText),
    12: () => evalAxis12(designText, reqText),
  };

  const axes = {};
  let scoreSum = 0;
  let nogoCount = 0;
  for (const id of FULL_AXIS_IDS) {
    const { score, issues } = evaluators[id]();
    const status = statusForScore(score);
    axes[String(id)] = {
      name: FULL_AXIS_NAMES[id],
      score,
      status,
      issues,
    };
    scoreSum += score;
    if (status === 'NO-GO') nogoCount++;
  }
  const overall = clamp01to100(scoreSum / FULL_AXIS_IDS.length);

  let decision;
  if (overall < FULL_DECISION_TABLE.WARN_MIN_SCORE || nogoCount > FULL_DECISION_TABLE.MAX_NOGO_AXES) {
    decision = 'NO-GO';
  } else if (overall >= FULL_DECISION_TABLE.GO_MIN_SCORE && nogoCount === 0) {
    decision = 'GO';
  } else {
    decision = 'WARN';
  }

  const result = {
    spec_path: specPath,
    mode: 'full',
    score: overall,
    axes,
    decision,
  };
  if (decision === 'NO-GO') result.gate = 'SPEC_CONTENT_REVIEW_NOGO';
  return result;
}

module.exports = {
  reviewContentFull,
  FULL_DECISION_TABLE,
  FULL_AXIS_IDS,
  FULL_AXIS_NAMES,
};

// ─── Test fixtures setup ─────────────────────────────────────────────────────────────

const REPO_FIXTURE = path.join(__dirname, '..', 'fixtures', 'specs', 'auth-flow-good');

function makeTempSpec(name, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `spec-content-full-${name}-`));
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

const FULL_RICH_REQ = `# Requirements — synthetic full

This document is a fully synthetic spec exercising all 12 full-mode axes.

## Glossary

- **Alpha**: input handler.
- **Beta**: output emitter.

## Requirement 1: alpha behaviour

**User Story:** As a tester, I want testable ACs.

#### Acceptance Criteria

1. WHEN event-1 happens, THE Alpha SHALL return HTTP 200 with body \`{"ok": true}\` at \`POST /endpoint\`.

## Requirement 2: beta behaviour

**User Story:** As a tester, I want a second requirement.

#### Acceptance Criteria

1. WHEN event-2 happens, THE Beta SHALL emit a record to \`POST /endpoint\` with field "value".
`;

const FULL_RICH_DESIGN = `# Design — synthetic full

## Architecture overview

Two components.

## Components

### Alpha

**Responsibility:** parses input.
**Traces to:** Req 1.

### Beta

**Responsibility:** emits output.
**Traces to:** Req 2.

## Data model

### Thing

| Field | Type | Notes |
|-------|------|-------|
| id    | string | primary key |
| value | int    | non-null    |

### Record

| Field | Type | Notes |
|-------|------|-------|
| ts    | int  | unix    |
| body  | string | utf8  |

## Contracts

### \`POST /endpoint\`

**Request body:** JSON with email and value.
**Response 200:** JSON with token.
**Errors:** 401 invalid_credentials, 429 rate_limited, 400 bad_request.

## Risks

- Risk: token leak. Mitigation: redact in logs.
- Risk: rate limit bypass. Mitigation: per-email counters.

## Dependencies

- Library: \`bcrypt\` for password hashing.
- Service: Redis (rate-limit store).
- Environment variable: \`JWT_SECRET\` for HS256 signing key.

## Invariants

- The AuditLogger MUST NOT serialize raw passwords.
- The JwtSigner SHALL NOT accept tokens older than 1 hour.
- The SessionStore MUST NOT exceed 100k active sessions.

## Performance

- p99 latency for \`POST /endpoint\` must be under 200ms.
- Throughput: at least 1000 requests per second sustained.

## Security

- All inbound JSON validated against schema before processing.
- TLS 1.2+ required for all external endpoints.

## Monitoring

- Metric: \`auth_login_total{outcome}\` per minute.
- Alert: error_rate > 1% triggers on-call page.
`;

const FULL_RICH_TASKS = `# Tasks — synthetic full

## Slice A: foundation (Req 1)

### [ ] Task 1.1: Implement Alpha — handles AC 1.1

**Requirements:** Req 1 (AC 1.1)
**Acceptance:** Alpha returns 200 on event-1.
**Files in scope:** src/alpha.ts

## Slice B: output (Req 2)

### [ ] Task 2.1: Implement Beta — handles AC 2.1

**Requirements:** Req 2 (AC 2.1)
**Acceptance:** Beta emits record on event-2.
**Files in scope:** src/beta.ts

## Definition of done

- Build green.
`;

// Strip a top-level ## section by name from a markdown document. Avoids the JS `\Z`
// pitfall (literal Z would match accidentally inside body text). Walks lines explicitly.
function stripH2Section(text, headingNameRegex) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (/^##\s+/.test(lines[i]) && headingNameRegex.test(lines[i])) {
      // skip to next ## heading (or EOF)
      i++;
      while (i < lines.length && !/^##\s+/.test(lines[i])) i++;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join('\n');
}

// ─── Tests ───────────────────────────────────────────────────────────────────────────

test('Module shape: reviewContentFull is a function and FULL_AXIS_IDS has 12 entries', () => {
  assert.equal(typeof reviewContentFull, 'function');
  assert.equal(FULL_AXIS_IDS.length, 12);
  assert.deepEqual([...FULL_AXIS_IDS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // Full axis names must include the 6 slim names plus 6 new ones
  assert.equal(FULL_AXIS_NAMES[1], SLIM_AXIS_NAMES[1]);
  assert.equal(FULL_AXIS_NAMES[7], 'design_tasks_congruence');
  assert.equal(FULL_AXIS_NAMES[12], 'operational_sections');
});

test('Case 1: positive path on auth-flow-good fixture returns GO or WARN (full has tougher bar)', () => {
  const result = reviewContentFull(REPO_FIXTURE);
  // Document expected score for this fixture: it is a happy-path fixture but was originally
  // built for slim mode. It has Risks (added in batch 2), but may lack some heavy-mode-only
  // sections (Dependencies, Invariants, Operational). We assert the decision is at least WARN
  // (not NO-GO), and we record the actual score so future drift is visible in failure output.
  assert.notEqual(
    result.decision,
    'NO-GO',
    `auth-flow-good must not score NO-GO in full mode. score=${result.score}, axes=${JSON.stringify(
      Object.fromEntries(Object.entries(result.axes).map(([k, v]) => [k, { score: v.score, status: v.status }]))
    )}`
  );
  assert.ok(['GO', 'WARN'].includes(result.decision));
  assert.equal(Object.keys(result.axes).length, 12);
  // All 12 axes present and named
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    assert.ok(result.axes[String(id)], `axis #${id} missing`);
    assert.equal(result.axes[String(id)].name, FULL_AXIS_NAMES[id]);
  }
});

test('Case 2: slim subset consistency — axes 1-6 scores in full == axes 1-6 scores in slim (mode SSOT)', () => {
  // CRITICAL SSOT TEST: in full mode, axes #1-#6 MUST be evaluated by the exact same functions
  // as slim mode, so for any given input the per-axis score for #1-#6 must be byte-identical.
  // This guarantees there is no drift between modes (mode SSOT).
  const fullResult = reviewContentFull(REPO_FIXTURE);
  const slimResult = slim.reviewContentSlim(REPO_FIXTURE);
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const k = String(id);
    assert.equal(
      fullResult.axes[k].score,
      slimResult.axes[k].score,
      `axis #${id} score differs between modes: full=${fullResult.axes[k].score} slim=${slimResult.axes[k].score} — mode SSOT violated`
    );
    assert.equal(fullResult.axes[k].name, slimResult.axes[k].name, `axis #${id} name differs between modes`);
    assert.equal(
      fullResult.axes[k].status,
      slimResult.axes[k].status,
      `axis #${id} status differs between modes`
    );
    assert.deepEqual(
      fullResult.axes[k].issues,
      slimResult.axes[k].issues,
      `axis #${id} issues differ between modes`
    );
  }
});

test('Case 3: synthetic spec missing data model section forces axis #8 NO-GO', () => {
  // Build a spec rich on every axis except data models — the design has NO ## Data model heading.
  // Use the explicit line-walker (stripH2Section) rather than a regex with `\Z` (which is not
  // supported in JavaScript regex and would match a literal `Z` accidentally).
  const designNoDataModel = stripH2Section(FULL_RICH_DESIGN, /\bData\s*model/i);
  // Sanity: stripping worked
  assert.ok(!/##\s+Data\s*model/i.test(designNoDataModel), 'fixture builder failed to strip Data model section');
  const dir = makeTempSpec('no-data-model', {
    'requirements.md': FULL_RICH_REQ,
    'design.md': designNoDataModel,
    'tasks.md': FULL_RICH_TASKS,
  });
  try {
    const result = reviewContentFull(dir);
    assert.equal(
      result.axes['8'].status,
      'NO-GO',
      `expected axis #8 NO-GO, got status=${result.axes['8'].status} score=${result.axes['8'].score}`
    );
    assert.equal(result.axes['8'].score, 0);
    assert.ok(
      result.axes['8'].issues.some((i) => /no Data model section/i.test(i)),
      `expected 'no Data model section' issue, got: ${result.axes['8'].issues.join(' | ')}`
    );
  } finally {
    cleanup(dir);
  }
});

test('Case 4: synthetic spec with no DI/CI invariants returns axis #11 score=0', () => {
  // Build a design with no Invariants section AND no MUST NOT / SHALL NOT statements anywhere.
  // We have to scrub both files.
  let designNoInvariants = stripH2Section(FULL_RICH_DESIGN, /\bInvariants?\b/i);
  designNoInvariants = designNoInvariants
    .replace(/MUST\s+NOT/gi, 'avoids')
    .replace(/SHALL\s+NOT/gi, 'avoids')
    .replace(/MUST\s+NEVER/gi, 'avoids')
    .replace(/SHALL\s+NEVER/gi, 'avoids');
  const reqNoInvariants = FULL_RICH_REQ
    .replace(/MUST\s+NOT/gi, 'avoids')
    .replace(/SHALL\s+NOT/gi, 'avoids');
  // Sanity
  assert.ok(!/##\s+Invariants/i.test(designNoInvariants), 'fixture builder failed to strip Invariants heading');
  assert.ok(!/MUST\s+NOT|SHALL\s+NOT/i.test(designNoInvariants + reqNoInvariants), 'fixture builder failed to strip MUST/SHALL NOT');
  const dir = makeTempSpec('no-invariants', {
    'requirements.md': reqNoInvariants,
    'design.md': designNoInvariants,
    'tasks.md': FULL_RICH_TASKS,
  });
  try {
    const result = reviewContentFull(dir);
    assert.equal(result.axes['11'].score, 0, `expected axis #11 score=0, got ${result.axes['11'].score}`);
    assert.equal(result.axes['11'].status, 'NO-GO');
    assert.ok(
      result.axes['11'].issues.some((i) => /Invariants/i.test(i)),
      `expected Invariants issue, got: ${result.axes['11'].issues.join(' | ')}`
    );
  } finally {
    cleanup(dir);
  }
});

test('Case 5: synthetic spec missing perf/security/monitoring forces axis #12 NO-GO', () => {
  // Build a design with no operational sections at all.
  let designNoOps = FULL_RICH_DESIGN;
  designNoOps = stripH2Section(designNoOps, /\bPerformance\b/i);
  designNoOps = stripH2Section(designNoOps, /\bSecurity\b/i);
  designNoOps = stripH2Section(designNoOps, /\bMonitoring\b/i);
  // Sanity
  assert.ok(
    !/##\s+(Performance|Security|Monitoring|Observability|Operations)\b/i.test(designNoOps),
    'fixture builder failed to strip operational sections'
  );
  const dir = makeTempSpec('no-ops', {
    'requirements.md': FULL_RICH_REQ,
    'design.md': designNoOps,
    'tasks.md': FULL_RICH_TASKS,
  });
  try {
    const result = reviewContentFull(dir);
    assert.equal(
      result.axes['12'].status,
      'NO-GO',
      `expected axis #12 NO-GO, got status=${result.axes['12'].status} score=${result.axes['12'].score}`
    );
    assert.equal(result.axes['12'].score, 0);
  } finally {
    cleanup(dir);
  }
});

test('Case 6: synthetic spec rich on all 12 axes returns GO with score >=80', () => {
  const dir = makeTempSpec('all-rich', {
    'requirements.md': FULL_RICH_REQ,
    'design.md': FULL_RICH_DESIGN,
    'tasks.md': FULL_RICH_TASKS,
  });
  try {
    const result = reviewContentFull(dir);
    assert.equal(
      result.decision,
      'GO',
      `expected GO on all-rich synthetic, got ${result.decision}. score=${result.score}, axes=${JSON.stringify(
        Object.fromEntries(Object.entries(result.axes).map(([k, v]) => [k, { score: v.score, status: v.status }]))
      )}`
    );
    assert.ok(result.score >= FULL_DECISION_TABLE.GO_MIN_SCORE, `expected score >= 80, got ${result.score}`);
    assert.ok(!('gate' in result), 'GO decision must not emit a gate field');
    // Each new full-mode axis (#7-#12) must be evaluated and present.
    for (const id of [7, 8, 9, 10, 11, 12]) {
      assert.ok(result.axes[String(id)], `axis #${id} missing from full result`);
    }
  } finally {
    cleanup(dir);
  }
});
