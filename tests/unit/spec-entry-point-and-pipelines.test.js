#!/usr/bin/env node
/**
 * tests/unit/spec-entry-point-and-pipelines.test.js
 *
 * Wave 4-spec (v4.12.0) — validates:
 *
 *   1. The thin entry-point `skills/spec/SKILL.md` exists with the expected frontmatter
 *      contract (manual-only invocation, allowed-tools=Task, argument-hint, name=spec).
 *   2. The 3 pipeline composition refs (`references/pipelines/spec-light.md`,
 *      `spec-heavy.md`, `spec-audit-only.md`) each declare a step count that matches the
 *      SKILL.md `sequence` array length 1:1. SKILL.md is the SSOT for the workflow
 *      sequence; pipeline refs are reflexes (team composition + step-by-step flow).
 *   3. The 3 pipeline refs declare gate counts that match their SKILL.md `gates_at` arrays.
 *   4. plugin.json version is 4.12.0.
 *   5. Regression — existing entry-points (skills/bugfix/SKILL.md, skills/audit/SKILL.md,
 *      skills/feature/SKILL.md) and `commands/pipeline.md` still exist and parse.
 *
 * Run: node --test tests/unit/spec-entry-point-and-pipelines.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseFrontmatter } = require(
  path.join(__dirname, '..', '..', '.claude', 'hooks', 'skill-frontmatter-parser.cjs')
);

const REPO_ROOT = path.join(__dirname, '..', '..');

const SPEC_VARIANTS = [
  {
    variant: 'spec-light',
    skill: path.join(REPO_ROOT, 'skills', 'spec-light', 'SKILL.md'),
    pipeline: path.join(REPO_ROOT, 'references', 'pipelines', 'spec-light.md'),
    expected_steps: 6,
    expected_gates: 4,
  },
  {
    variant: 'spec-heavy',
    skill: path.join(REPO_ROOT, 'skills', 'spec-heavy', 'SKILL.md'),
    pipeline: path.join(REPO_ROOT, 'references', 'pipelines', 'spec-heavy.md'),
    expected_steps: 9,
    expected_gates: 5,
  },
  {
    variant: 'spec-audit-only',
    skill: path.join(REPO_ROOT, 'skills', 'spec-audit-only', 'SKILL.md'),
    pipeline: path.join(REPO_ROOT, 'references', 'pipelines', 'spec-audit-only.md'),
    expected_steps: 5,
    expected_gates: 3,
  },
];

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Returns the body section that comes after the "## Step-by-Step Flow" header.
 * The cross-ref test counts steps and gates from this canonical section only —
 * the Team Composition table may include Phase-0 wrapper rows (Step 0) that are
 * not part of the SKILL.md sequence_lock and would inflate counts.
 */
function extractStepByStepSection(content) {
  const m = content.match(/##\s+Step-by-Step Flow[\s\S]*?(?=\n##\s|\n---|\n$)/);
  return m ? m[0] : '';
}

/**
 * Counts "### Step N:" headers in the Step-by-Step Flow section.
 */
function countPipelineSteps(content) {
  const section = extractStepByStepSection(content);
  const matches = section.match(/^###\s+Step\s+(\d+)[:\s]/gmi) || [];
  const numbers = new Set(
    matches.map((m) => parseInt(m.match(/(\d+)/)[1], 10))
  );
  return numbers.size;
}

/**
 * Counts gate markers in "### Step N:" headers — gate steps end with `**[GATE]**`.
 */
function countPipelineGates(content) {
  const section = extractStepByStepSection(content);
  const matches = section.match(/^###\s+Step\s+\d+[:\s][^\n]*\*\*\[GATE\]\*\*/gmi) || [];
  return matches.length;
}

/**
 * Strip frontmatter and return the body of a SKILL.md (or any markdown with --- frontmatter).
 */
function stripFrontmatter(text) {
  const m = text.match(/^---[\s\S]*?\n---\n([\s\S]*)$/);
  return m ? m[1] : text;
}

// ----------------------------------------------------------------------
// Test 1 (HAPPY PATH): thin entry-point /spec exists with correct frontmatter
// ----------------------------------------------------------------------

test('happy: skills/spec/SKILL.md exists with valid manual-only frontmatter', () => {
  const file = path.join(REPO_ROOT, 'skills', 'spec', 'SKILL.md');
  assert.ok(fs.existsSync(file), 'skills/spec/SKILL.md must exist (Wave 4-spec deliverable)');

  const raw = fs.readFileSync(file, 'utf8');
  const parsed = parseFrontmatter(raw);

  assert.equal(parsed.ok, true, 'frontmatter must parse cleanly');
  assert.equal(parsed.frontmatter.name, 'spec', 'name must be "spec"');
  assert.equal(
    parsed.frontmatter['disable-model-invocation'],
    true,
    'disable-model-invocation must be true (manual-only routing)'
  );

  // The skill body must document --light / --heavy / --audit-only flag routing.
  const body = stripFrontmatter(raw);
  assert.match(body, /--light/, 'must document --light flag routing');
  assert.match(body, /--heavy/, 'must document --heavy flag routing');
  assert.match(body, /--audit-only/, 'must document --audit-only flag routing');
  assert.match(
    body,
    /pipeline-orchestrator:spec-(light|heavy|audit-only)/,
    'must reference target spec-* skills for flag dispatch'
  );
  assert.match(
    body,
    /PRE_CLASSIFIED_TYPE=Spec/,
    'must pre-classify type=Spec when delegating to pipeline-controller'
  );
});

// ----------------------------------------------------------------------
// Test 2-4 (CROSS-REF FIDELITY): 3 pipeline refs match their SKILL.md sequences 1:1
// ----------------------------------------------------------------------

for (const v of SPEC_VARIANTS) {
  test(`cross-ref: references/pipelines/${v.variant}.md step count matches skills/${v.variant}/SKILL.md`, () => {
    assert.ok(fs.existsSync(v.skill), `${v.skill} (SSOT) must exist`);
    assert.ok(fs.existsSync(v.pipeline), `${v.pipeline} must exist (Wave 4-spec deliverable)`);

    const skillRaw = fs.readFileSync(v.skill, 'utf8');
    const skillParsed = parseFrontmatter(skillRaw);
    assert.equal(skillParsed.ok, true, `${v.variant} SKILL.md frontmatter must parse`);

    const skillSequence = skillParsed.frontmatter.sequence;
    assert.ok(Array.isArray(skillSequence), `${v.variant} SKILL.md sequence must be an array`);
    assert.equal(
      skillSequence.length,
      v.expected_steps,
      `${v.variant} SKILL.md must declare ${v.expected_steps} steps in sequence`
    );

    const pipelineRaw = fs.readFileSync(v.pipeline, 'utf8');
    const pipelineSteps = countPipelineSteps(pipelineRaw);
    assert.equal(
      pipelineSteps,
      v.expected_steps,
      `references/pipelines/${v.variant}.md must declare ${v.expected_steps} steps to match SKILL.md sequence_lock`
    );
  });

  test(`cross-ref: references/pipelines/${v.variant}.md gate count matches skills/${v.variant}/SKILL.md gates_at`, () => {
    const skillRaw = fs.readFileSync(v.skill, 'utf8');
    const skillParsed = parseFrontmatter(skillRaw);
    const skillGates = skillParsed.frontmatter.gates_at;
    assert.ok(Array.isArray(skillGates), `${v.variant} SKILL.md gates_at must be an array`);
    assert.equal(
      skillGates.length,
      v.expected_gates,
      `${v.variant} SKILL.md must declare ${v.expected_gates} gates`
    );

    const pipelineRaw = fs.readFileSync(v.pipeline, 'utf8');
    const pipelineGates = countPipelineGates(pipelineRaw);
    assert.equal(
      pipelineGates,
      v.expected_gates,
      `references/pipelines/${v.variant}.md must mark ${v.expected_gates} [GATE] tokens to match SKILL.md gates_at`
    );
  });
}

// ----------------------------------------------------------------------
// Test 5 (EDGE): pipeline ref declares the correct backing skill name
// ----------------------------------------------------------------------

test('edge: each pipeline ref points to the matching skill name (no cross-wiring)', () => {
  for (const v of SPEC_VARIANTS) {
    const raw = fs.readFileSync(v.pipeline, 'utf8');
    assert.match(
      raw,
      new RegExp(`skills[\\\\/]${v.variant}[\\\\/]SKILL\\.md|pipeline-orchestrator:${v.variant}`),
      `${v.pipeline} must reference its backing skill (${v.variant})`
    );
  }
});

// ----------------------------------------------------------------------
// Test 6 (REGRESSION): existing entry-points + classifier remain intact
// ----------------------------------------------------------------------

test('regression: prior entry-points (bugfix/audit/feature) and commands/pipeline.md still exist', () => {
  const must_exist = [
    path.join(REPO_ROOT, 'skills', 'bugfix', 'SKILL.md'),
    path.join(REPO_ROOT, 'skills', 'audit', 'SKILL.md'),
    path.join(REPO_ROOT, 'skills', 'feature', 'SKILL.md'),
    path.join(REPO_ROOT, 'commands', 'pipeline.md'),
  ];
  for (const f of must_exist) {
    assert.ok(
      fs.existsSync(f),
      `${path.relative(REPO_ROOT, f)} must remain intact (Wave 4-spec is purely additive)`
    );
  }
});

// ----------------------------------------------------------------------
// Test 7 (VERSION BUMP): plugin.json reflects current release
// (Originally frozen to 4.12.0 for Wave 4-spec; bumped in Wave 5-spec / v4.13.0
// release-admin batch alongside plugin.json itself; bumped in Wave 6-spec / v4.14.0
// release-admin batch; bumped in Wave 8-pre / v4.16.0; bumped in Wave 8-spec /
// v4.17.0; promoted to v5.0.0 (same content as v5.0.0-rc.1); bumped to 5.1.0
// for the brainstorm-pipeline + Kiro skill clone release; bumped to 5.2.0-rc.2
// for Achados 1-7 reconciliation + GATE_REQUEST/DISPATCH_REQUEST protocol
// adoption across 5 SKILLs + brainstorm-controller step agents + 9
// pipeline-controller dispatch sites — version is a release-admin concern,
// not a Wave 4-spec content invariant.)
// ----------------------------------------------------------------------

test('version: .claude-plugin/plugin.json bumped to 5.2.0-rc.2', () => {
  const file = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
  const content = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(
    content.version,
    '5.2.0-rc.2',
    'plugin.json version must be 5.2.0-rc.2 for the v5.2.0-rc.2 release (Achado #7 protocol adoption expanded across 5 SKILLs + step agents + 9 dispatch sites)'
  );
});
