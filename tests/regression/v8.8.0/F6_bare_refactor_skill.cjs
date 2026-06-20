#!/usr/bin/env node
'use strict';

// =============================================================================
// F6 (v8.8.0) — B4: routing-only refactor skill (AUDIT-006).
//
// TDD RED phase. The four user-APPROVED B4 scenarios as labeled sub-checks.
//
// ----------------------------------------------------------------------------
// EXPECTED RED SPLIT — read before running.
// ----------------------------------------------------------------------------
// skills/refactor/SKILL.md does not exist yet. It must be created as a BARE
// routing skill (like skills/bugfix/SKILL.md): name=refactor, routes --light /
// --heavy to the sub-skills, delegates flagless input to the controller with
// PRE_CLASSIFIED_TYPE=Refactor, and has NO steps/ folder.
//
//   NEW-BEHAVIOR (must FAIL now — valid RED; file/dirs simply do not exist yet):
//     B4-MAIN   file exists + YAML frontmatter + name: refactor + --light/--heavy routing
//     B4-REG-1  PRE_CLASSIFIED_TYPE=Refactor delegation clause present
//     B4-REG-2  no steps/ subfolder (routing-only)
//     B4-EDGE   mirrors the bugfix routing skill shape (the 3 structural elements)
//
// Note: these are structural checks on a not-yet-created file, so they fail on
// assertions (existsSync false / regex no-match) — NOT on import/syntax errors.
// The bugfix skill IS read for the EDGE comparison and exists, so the file loads.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const REFACTOR_SKILL = path.join(ROOT, 'skills', 'refactor', 'SKILL.md');
const REFACTOR_STEPS = path.join(ROOT, 'skills', 'refactor', 'steps');
const BUGFIX_SKILL = path.join(ROOT, 'skills', 'bugfix', 'SKILL.md');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function frontmatter(md) {
  // Return the YAML frontmatter block (between the first two `---` fences) or ''.
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : '';
}
// Structural probes shared by MAIN and EDGE.
function hasName(md, name) {
  return new RegExp(`^name:\\s*${name}\\s*$`, 'm').test(frontmatter(md));
}
function hasLightHeavyRouting(md) {
  return /--light/.test(md) && /--heavy/.test(md)
    && /Skill\(skill:\s*["']pipeline-orchestrator:refactor-light["']\)/.test(md)
    && /Skill\(skill:\s*["']pipeline-orchestrator:refactor-heavy["']\)/.test(md);
}
function hasPreClassifiedRefactor(md) {
  return /PRE_CLASSIFIED_TYPE\s*=\s*Refactor/.test(md);
}

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== F6 v8.8.0 — B4 bare routing refactor skill (RED: all NEW, file not created yet) ===');

// ---- B4-MAIN [NEW] file exists + frontmatter + name + routing ---------------
test('B4-MAIN [NEW] skills/refactor/SKILL.md exists, has YAML frontmatter, name: refactor, and --light/--heavy routing branches', () => {
  assert.ok(fs.existsSync(REFACTOR_SKILL), 'skills/refactor/SKILL.md must exist');
  const md = read(REFACTOR_SKILL);
  assert.match(md, /^---\r?\n/, 'must open with YAML frontmatter');
  assert.ok(frontmatter(md).length > 0, 'frontmatter block must be non-empty');
  assert.ok(hasName(md, 'refactor'), 'frontmatter must declare name: refactor');
  assert.ok(hasLightHeavyRouting(md),
    'must route --light → Skill("pipeline-orchestrator:refactor-light") and --heavy → refactor-heavy');
});

// ---- B4-REG-1 [NEW] PRE_CLASSIFIED_TYPE=Refactor delegation -----------------
test('B4-REG-1 [NEW] skills/refactor/SKILL.md delegates flagless input to the controller with PRE_CLASSIFIED_TYPE=Refactor', () => {
  assert.ok(fs.existsSync(REFACTOR_SKILL), 'skills/refactor/SKILL.md must exist');
  const md = read(REFACTOR_SKILL);
  assert.ok(hasPreClassifiedRefactor(md),
    'must contain a PRE_CLASSIFIED_TYPE=Refactor delegation clause (the no-flag fallback path)');
  assert.match(md, /pipeline-orchestrator:core:pipeline-controller/,
    'the delegation must spawn the pipeline-controller');
});

// ---- B4-REG-2 [NEW] no steps/ folder (routing-only) ------------------------
test('B4-REG-2 [NEW] skills/refactor/ has NO steps/ subfolder (routing-only skill)', () => {
  assert.ok(!fs.existsSync(REFACTOR_STEPS),
    'skills/refactor/steps/ must NOT exist — the routing skill carries no implementation steps');
});

// ---- B4-EDGE [NEW] mirrors the bugfix routing skill shape ------------------
test('B4-EDGE [NEW] skills/refactor/SKILL.md mirrors skills/bugfix/SKILL.md routing shape (name + light/heavy + PRE_CLASSIFIED delegation)', () => {
  // The bugfix skill is the structural template and exists — assert it has the
  // three elements (anchors the comparison), then require refactor to match.
  const bug = read(BUGFIX_SKILL);
  assert.ok(hasName(bug, 'bugfix'), 'sanity: bugfix skill declares name: bugfix');
  assert.match(bug, /--light/, 'sanity: bugfix skill routes --light');
  assert.match(bug, /--heavy/, 'sanity: bugfix skill routes --heavy');
  assert.match(bug, /PRE_CLASSIFIED_TYPE=Bug Fix/, 'sanity: bugfix skill uses PRE_CLASSIFIED_TYPE=Bug Fix');

  assert.ok(fs.existsSync(REFACTOR_SKILL), 'skills/refactor/SKILL.md must exist to mirror the bugfix shape');
  const ref = read(REFACTOR_SKILL);
  assert.ok(hasName(ref, 'refactor'), 'refactor skill must declare name: refactor (mirrors bugfix)');
  assert.ok(hasLightHeavyRouting(ref), 'refactor skill must carry --light/--heavy routing (mirrors bugfix)');
  assert.ok(hasPreClassifiedRefactor(ref), 'refactor skill must carry a PRE_CLASSIFIED_TYPE=Refactor delegation (mirrors bugfix)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (all are [NEW]; expected RED until skills/refactor/SKILL.md is created):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
