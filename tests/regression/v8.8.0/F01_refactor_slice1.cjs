#!/usr/bin/env node
'use strict';

/**
 * F01 (v8.8.0) — Refactor workflow, Slice 1 (additive new task type).
 *
 * TDD RED phase. This single file holds all 8 user-APPROVED scenarios as
 * labeled sub-checks, in the repo's F-test style (pure Node, node:assert,
 * process.exit(1) on any failure).
 *
 * ============================================================================
 * EXPECTED RED SPLIT — read before running.
 * ============================================================================
 * Slice 1 introduces a new `Refactor` task type with `refactor-light` /
 * `refactor-heavy` variants across the 9 lockstep surfaces. The scenarios come
 * in two flavors:
 *
 *   NEW-BEHAVIOR (must FAIL now, on assertions — valid RED):
 *     S1  entry-points sync (refactor names in json + cjs, no drift)
 *     S2  routing matrix Refactor row
 *     S3  refactor-light / refactor-heavy SKILL.md exist + frontmatter +
 *         light has NO final-adversarial step, heavy HAS one
 *     S4a gates.md REFACTOR_SCOPE_LOCK row (HARD)
 *     S5a pre-tester.md "characterization" mode subsection
 *     S7  lockstep completeness across ALL NINE surfaces (ship-blocker guard)
 *     S8  paperclip mirror (workflow ref + slash command)
 *
 *   INVARIANT-GUARD (PASS now, must STAY passing — green-throughout by design):
 *     S4b Mandatory Gates by Complexity table UNCHANGED (sha256 baseline)
 *     S5b pre-tester RED invariant text UNCHANGED ("tests MUST FAIL"/"RED phase")
 *     S6  plugin manifests stay 8.7.0 (no mid-slice bump) + the two hooks
 *         byte-unchanged (sha256 baseline)
 *
 * So a correct RED run = the NEW-BEHAVIOR checks FAIL and the INVARIANT-GUARD
 * checks PASS. Do NOT contort the guards to fail; they detect drift, not
 * absence. After Slice 1 is implemented the NEW-BEHAVIOR checks flip GREEN and
 * the guards stay GREEN.
 *
 * Each check is tagged [NEW] or [GUARD] in its name so the split is visible in
 * the runner output.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

// tests/regression/v8.8.0/ -> repo root is three levels up.
const ROOT = path.resolve(__dirname, '../../..');

// ---- paths --------------------------------------------------------------
const ENTRY_POINTS_JSON = path.join(ROOT, 'references', 'entry-points.json');
const ENTRY_POINTS_CJS = path.join(ROOT, 'lib', 'entry-points.cjs');
const COMPLEXITY_MATRIX = path.join(ROOT, 'references', 'complexity-matrix.md');
const GATES_MD = path.join(ROOT, 'references', 'gates.md');
const PRE_TESTER = path.join(ROOT, 'agents', 'quality', 'pre-tester.md');
const PIPELINE_MD = path.join(ROOT, 'commands', 'pipeline.md');
const TEAM_REGISTRY = path.join(ROOT, 'references', 'team-registry.md');
const HELP_MD = path.join(ROOT, 'commands', 'help.md');
const CLAUDE_PLUGIN = path.join(ROOT, '.claude-plugin', 'plugin.json');
const CURSOR_PLUGIN = path.join(ROOT, '.cursor-plugin', 'plugin.json');
const HOOK_FORCE = path.join(ROOT, '.claude', 'hooks', 'force-pipeline-agents.cjs');
const HOOK_DISPATCH = path.join(ROOT, '.claude', 'hooks', 'dispatch-guard.cjs');
const SKILL_LIGHT = path.join(ROOT, 'skills', 'refactor-light', 'SKILL.md');
const SKILL_HEAVY = path.join(ROOT, 'skills', 'refactor-heavy', 'SKILL.md');
const PAPERCLIP_WORKFLOW = path.join(ROOT, 'references', 'paperclip', 'PAPERCLIP-REFACTOR-WORKFLOW.md');
const PAPERCLIP_CMD = path.join(ROOT, 'commands', 'paperclip-refactor.md');
const PIPELINE_CONTROLLER = path.join(ROOT, 'agents', 'core', 'pipeline-controller.md');
const STEP_17_ENFORCEMENT = path.join(ROOT, 'references', 'step-1-7-enforcement.json');

// ---- baselines captured 2026-06-19 against the live repo (pre-Slice-1) --
// S4b: sha256 of the "Mandatory Gates by Complexity" block, from the
//   "## Mandatory Gates by Complexity" heading through (exclusive) the line
//   "**Cumulative rule:**", with CRLF normalized to LF. Slice 1's new gate is
//   AUDIT/HARD-registered but is NOT in this mandatory table, so the table must
//   not change. Drift here = the slice touched the Iron Law table by mistake.
const MANDATORY_TABLE_SHA256 = '77213f530ece8eb0ffbcb680406125ad87ff69d1efced5446786ed54d1ffd895';
// S6: the two hooks must be byte-identical after the slice (Slice 1 is docs +
//   registry + skills only; it does not touch enforcement hook code).
const HOOK_FORCE_SHA256 = '92d331524fb2110a5a56ebbcbcd8aee00174944fda0063554e8ebefd1955aa7e';
// Batch 3 (loop/next-action-contract, AUDIT-REPORT.md §4 P1 / CR6): updated —
// this guard's job is catching the ORIGINAL concern (Refactor Slice 1, a
// long-completed docs/registry/skills-only slice, accidentally touching
// enforcement hook code). A LEGITIMATE, unrelated enforcement change to
// dispatch-guard.cjs (buildDenyReason's Skill-tool deny now offers a
// subagent-reachable exit) is exactly the case this pin must be updated for,
// not bypassed — re-verify intentionality, then re-pin (like any golden-hash
// test). `node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('.claude/hooks/dispatch-guard.cjs')).digest('hex'))"`.
// Re-pinned a 2nd time (round-2 adversarial review, HIGH finding): the
// BRAINSTORM/SPEC_CONTRACT Skill-path deny sites also needed the fallback
// clause — same legitimate-change rule applies.
// Re-pinned a 3rd time (round-2-v2 confirmation review, LOW-MEDIUM finding):
// this file's subagentFallbackSuffix() wrapper was missing the leading ' '
// the other 3 copies have, gluing the clause onto the prior sentence.
// Re-pinned a 4th time (Batch 5, round-1 adversarial review, MEDIUM finding):
// the HMAC-fail-under-STRICT deny site (handleBrainstormDispatch) and the
// unreadable-state deny site (handleSealedSpecImplementation) also needed the
// fallback clause — their prescribed action (restore/re-sign state before
// dispatching) is only practically reachable via dispatch, same shape as the
// sibling denies that already carry the clause — same legitimate-change rule.
// Re-pinned a 5th time (Batch 5, round-2 adversarial review): the HMAC-fail
// reason's state-forgery recipe ("Re-sign the state (writeSignedState)") was
// removed (tool-agnostic "restore via the pipeline-controller" instead — MEDIUM
// security finding, S3), and the subagentFallbackSuffix() wrapper's silent
// error-swallow gained a one-line stderr trail (LOW observability finding, S5;
// fail-open posture unchanged) — both touch this file's bytes; same
// legitimate-change rule applies.
// Re-pinned a 6th time (Batch 5, round-3 adversarial review, N2): the wrapper's
// stderr trail gained a nested try/catch so an exotic synchronous stderr throw
// can never escape the catch and convert the fail-closed deny into a silent
// allow (defense-in-depth; same legitimate-change rule applies).
const HOOK_DISPATCH_SHA256 = '8628dbf8a2c9ceb84503dac59937b4b72c198284644b0a778051e9b175834de1';
// S6: the lockstep bump happens at slice close. The v8.8.0 determinism-
// enforcement-hardening release (AUDIT-001..007, B6) is that slice close, so the
// manifests now legitimately read 8.8.0; the hook byte-identity guard below is
// unaffected (Slice 1 still did not touch enforcement hook code).
const PINNED_VERSION = '8.28.0';

// The three refactor entry-point names that Slice 1 introduces.
const REFACTOR_NAMES = ['refactor', 'refactor-light', 'refactor-heavy'];

// ---- harness ------------------------------------------------------------
let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}
function read(p) { return fs.readFileSync(p, 'utf8'); }
function sha256Norm(p) {
  const s = read(p).replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function sha256Bytes(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
/** Extract the Mandatory Gates table block (heading .. before Cumulative rule). */
function mandatoryTableBlock() {
  const md = read(GATES_MD);
  const startIdx = md.indexOf('## Mandatory Gates by Complexity');
  assert.ok(startIdx !== -1, 'Mandatory Gates by Complexity section must exist');
  const after = md.slice(startIdx);
  const endIdx = after.indexOf('**Cumulative rule:**');
  assert.ok(endIdx !== -1,
    'terminator "**Cumulative rule:**" must exist in the Mandatory Gates block ' +
    '(a missing terminator must fail loudly, not silently hash the whole tail)');
  return after.slice(0, endIdx).replace(/\r\n/g, '\n');
}

console.log('=== F01 v8.8.0 — Refactor workflow Slice 1 (RED: NEW fail, GUARD pass) ===');

// =========================================================================
// MAIN
// =========================================================================

// ---- S1 [NEW] entry-points sync, no drift between json and cjs ----------
test('S1 [NEW] refactor names present in entry-points.json AND lib/entry-points.cjs with no drift', () => {
  const json = JSON.parse(read(ENTRY_POINTS_JSON));
  const declared = new Set((json.entry_points || []).map((e) => String(e).toLowerCase()));
  for (const n of REFACTOR_NAMES) {
    assert.ok(declared.has(n), `references/entry-points.json entry_points must include "${n}"`);
  }
  // The cjs holds an embedded FALLBACK_ENTRY_POINTS that must stay in sync with
  // the JSON (the drift guard the file's own comment promises). Assert both the
  // live registry (loadRegistry reads the JSON) and the embedded fallback list.
  const mod = require(ENTRY_POINTS_CJS);
  const fallback = new Set((mod.FALLBACK_ENTRY_POINTS || []).map((e) => String(e).toLowerCase()));
  for (const n of REFACTOR_NAMES) {
    assert.ok(fallback.has(n), `lib/entry-points.cjs FALLBACK_ENTRY_POINTS must include "${n}" (no drift vs JSON)`);
    assert.ok(mod.isPipelineEntryPoint(`/pipeline-orchestrator:${n}`),
      `lib/entry-points.cjs must recognize /pipeline-orchestrator:${n} as a pipeline entry point`);
  }
  // No-drift, both directions: the set of refactor-related names must match
  // exactly between the JSON entry_points and the embedded fallback.
  const jsonRefactor = [...declared].filter((n) => n.startsWith('refactor')).sort();
  const cjsRefactor = [...fallback].filter((n) => n.startsWith('refactor')).sort();
  assert.deepEqual(cjsRefactor, jsonRefactor,
    `refactor entries must match between JSON (${jsonRefactor.join(',')}) and cjs fallback (${cjsRefactor.join(',')})`);
});

// ---- S2 [NEW] Pipeline Routing Matrix has a Refactor row ----------------
test('S2 [NEW] complexity-matrix Pipeline Routing Matrix has a Refactor -> refactor-light/refactor-heavy row', () => {
  const md = read(COMPLEXITY_MATRIX);
  const startIdx = md.indexOf('## Pipeline Routing Matrix');
  assert.ok(startIdx !== -1, 'Pipeline Routing Matrix section must exist');
  // Bound the search to the routing table block (until the next "## " heading).
  const after = md.slice(startIdx);
  const nextHeading = after.indexOf('\n## ', 3);
  const block = nextHeading !== -1 ? after.slice(0, nextHeading) : after;
  // A row whose label cell is "Refactor" and which routes to both variants.
  const refactorRow = block.split(/\r?\n/).find((l) => /^\|.*Refactor.*\|/.test(l));
  assert.ok(refactorRow, 'routing matrix must contain a Refactor row');
  assert.match(refactorRow, /refactor-light/, 'Refactor row must route MEDIA -> refactor-light');
  assert.match(refactorRow, /refactor-heavy/, 'Refactor row must route COMPLEXA -> refactor-heavy');
});

// ---- S3 [NEW] refactor skills exist, valid frontmatter, adversarial split -
test('S3 [NEW] refactor-light/heavy SKILL.md exist with sequence_lock + sequence; light has NO final-adversarial step, heavy HAS one', () => {
  assert.ok(fs.existsSync(SKILL_LIGHT), 'skills/refactor-light/SKILL.md must exist');
  assert.ok(fs.existsSync(SKILL_HEAVY), 'skills/refactor-heavy/SKILL.md must exist');

  const light = read(SKILL_LIGHT);
  const heavy = read(SKILL_HEAVY);

  for (const [label, body] of [['refactor-light', light], ['refactor-heavy', heavy]]) {
    assert.match(body, /^---/, `${label} SKILL.md must open with YAML frontmatter`);
    assert.match(body, /sequence_lock:\s*true/, `${label} frontmatter must declare sequence_lock: true`);
    assert.match(body, /^sequence:\s*\[/m, `${label} frontmatter must declare a sequence: [...] list`);
  }

  // The LIGHT variant must NOT carry a final-adversarial step; the HEAVY variant
  // MUST. We detect this via the steps list / a final-adversarial step file
  // reference (mirrors how bugfix-heavy names its adversarial step in the
  // steps table), tolerant of hyphen/underscore.
  const finalAdvRe = /final[-_ ]?adversarial|adversarial.{0,40}(review|security|architecture|quality)/i;
  assert.doesNotMatch(light, finalAdvRe,
    'refactor-light must NOT contain a final-adversarial step (lighter ceremony)');
  assert.match(heavy, finalAdvRe,
    'refactor-heavy MUST contain a final-adversarial step');

  // Stronger structural signal when the heavy skill ships a dedicated step file
  // for the adversarial review (as bugfix-heavy does). Tolerant: pass if either
  // a steps/*adversarial*.md reference exists OR the steps table names it.
  const heavyDir = path.dirname(SKILL_HEAVY);
  const stepsDir = path.join(heavyDir, 'steps');
  let heavyHasAdversarialStepFile = false;
  if (fs.existsSync(stepsDir)) {
    heavyHasAdversarialStepFile = fs.readdirSync(stepsDir).some((f) => /adversarial/i.test(f));
  }
  assert.ok(heavyHasAdversarialStepFile || /steps\/[^)\s]*adversarial[^)\s]*\.md/i.test(heavy),
    'refactor-heavy must reference a dedicated final-adversarial step (steps/*adversarial*.md)');
});

// =========================================================================
// REGRESSION
// =========================================================================

// ---- S4a [NEW] gates.md REFACTOR_SCOPE_LOCK row (HARD) ------------------
test('S4a [NEW] references/gates.md registers REFACTOR_SCOPE_LOCK with hardness HARD', () => {
  const md = read(GATES_MD);
  const row = md.split(/\r?\n/).find((l) => /REFACTOR_SCOPE_LOCK/.test(l));
  assert.ok(row, 'gates.md must contain a REFACTOR_SCOPE_LOCK row');
  // Same registry row shape as the other gates: | NAME | Hardness | ... | — the
  // hardness cell is bold (`**HARD**`) to match every other registry row's
  // convention (ARCH-3 fix); the optional `**` keeps this tolerant of either form.
  assert.match(row, /REFACTOR_SCOPE_LOCK\s*\|\s*(?:\*\*)?HARD(?:\*\*)?\s*\|/,
    `REFACTOR_SCOPE_LOCK must be registered with hardness HARD (row: ${row.trim()})`);
});

// ---- S4b [GUARD] Mandatory Gates by Complexity table UNCHANGED ----------
test('S4b [GUARD] Mandatory Gates by Complexity table is byte-stable vs the captured baseline', () => {
  const block = mandatoryTableBlock();
  const sha = crypto.createHash('sha256').update(block, 'utf8').digest('hex');
  assert.equal(sha, MANDATORY_TABLE_SHA256,
    'the Mandatory Gates by Complexity table changed — Slice 1 must NOT touch the Iron Law table ' +
    `(got ${sha}, expected ${MANDATORY_TABLE_SHA256})`);
  // Belt-and-suspenders: row count stays 24 (matches F6 v8.5.0 guard).
  const rows = block.split(/\n/).filter((l) => /^\|/.test(l) && /✓/.test(l));
  assert.equal(rows.length, 24, `expected exactly 24 mandatory-gate data rows, got ${rows.length}`);
});

// ---- S5a [NEW] pre-tester characterization mode added -------------------
test('S5a [NEW] agents/quality/pre-tester.md adds a "characterization" mode subsection (tests MUST PASS / public-surface)', () => {
  const md = read(PRE_TESTER);
  assert.match(md, /characterization/i,
    'pre-tester.md must add a characterization mode (refactor verifies behavior is preserved)');
  // The characterization mode inverts the default RED contract: its tests must
  // PASS (capture current behavior) over the public surface.
  assert.match(md, /tests MUST PASS|MUST PASS|public[- ]surface|public surface/i,
    'characterization subsection must state its tests MUST PASS / target the public surface');
});

// ---- S5b [GUARD] pre-tester RED invariant text UNCHANGED ----------------
test('S5b [GUARD] pre-tester.md still carries the unchanged RED invariant text ("tests MUST FAIL" / "RED phase")', () => {
  const md = read(PRE_TESTER);
  assert.match(md, /MUST FAIL/, 'the default RED contract text "MUST FAIL" must remain');
  assert.match(md, /RED phase/i, 'the "RED phase" wording must remain');
  // The header invariant rule must remain verbatim.
  assert.match(md, /\*\*Tests MUST FAIL\*\*\s*—\s*if they pass, report anomaly/,
    'the "Tests MUST FAIL — if they pass, report anomaly" constraint must remain intact');
});

// ---- S6 [GUARD] manifests stay 8.7.0 + hooks byte-unchanged -------------
test('S6 [GUARD] plugin manifests stay pinned at 8.7.0 (no mid-slice bump)', () => {
  const claude = JSON.parse(read(CLAUDE_PLUGIN));
  const cursor = JSON.parse(read(CURSOR_PLUGIN));
  assert.equal(claude.version, PINNED_VERSION,
    `.claude-plugin/plugin.json must stay ${PINNED_VERSION} mid-slice (got ${claude.version})`);
  assert.equal(cursor.version, PINNED_VERSION,
    `.cursor-plugin/plugin.json must stay ${PINNED_VERSION} mid-slice (got ${cursor.version})`);
});

test('S6 [GUARD] force-pipeline-agents.cjs and dispatch-guard.cjs are byte-unchanged vs baseline', () => {
  const force = sha256Bytes(HOOK_FORCE);
  const dispatch = sha256Bytes(HOOK_DISPATCH);
  assert.equal(force, HOOK_FORCE_SHA256,
    `.claude/hooks/force-pipeline-agents.cjs changed — Slice 1 must not touch enforcement hooks ` +
    `(got ${force})`);
  assert.equal(dispatch, HOOK_DISPATCH_SHA256,
    `.claude/hooks/dispatch-guard.cjs changed — Slice 1 must not touch enforcement hooks ` +
    `(got ${dispatch})`);
});

// =========================================================================
// EDGE
// =========================================================================

// ---- S7 [NEW] lockstep completeness across ALL lockstep surfaces -------
// Ship-blocker guard: "refactor" must be present on every lockstep surface, or
// on NONE. A partial rollout (present in some, missing in others) FAILS loudly.
// The base nine surfaces (entry-points, pipeline.md, complexity-matrix, the two
// skill dirs, team-registry, hooks-via-entry-points, plugin autoDiscover,
// help.md) are extended with two sub-checks (v8.8.0 adversarial fix) that the
// original S7 missed: the pipeline-controller Phase 2 dispatch block must
// enumerate BOTH refactor variants (else inline-executor fall-through bypasses
// REFACTOR_SCOPE_LOCK + characterization), and the STEP 1.7 enforcement roster
// must carry the "refactor-" skill prefix (else BRAINSTORM_BYPASS misses it).
test('S7 [NEW] "refactor" is present across ALL lockstep surfaces incl. controller dispatch + STEP-1.7 roster (ship-blocker; fails on partial rollout)', () => {
  const surfaces = {
    // 1. entry-points.json registry
    'entry-points.json': () => {
      const j = JSON.parse(read(ENTRY_POINTS_JSON));
      return (j.entry_points || []).some((e) => /^refactor/.test(String(e)));
    },
    // 2. pipeline.md classification table (the type enumeration line)
    'pipeline.md classification table': () => {
      const md = read(PIPELINE_MD);
      // The "type: Bug Fix | Feature | ... " enumeration must list Refactor.
      const typeLine = md.split(/\r?\n/).find((l) => /^- type:.*Bug Fix/.test(l));
      return !!typeLine && /Refactor/.test(typeLine);
    },
    // 3. complexity-matrix routing
    'complexity-matrix routing': () => {
      const md = read(COMPLEXITY_MATRIX);
      const i = md.indexOf('## Pipeline Routing Matrix');
      if (i === -1) return false;
      return /\|.*Refactor.*\|/.test(md.slice(i));
    },
    // 4 + 5. the two skill folders
    'skills/refactor-light': () => fs.existsSync(SKILL_LIGHT),
    'skills/refactor-heavy': () => fs.existsSync(SKILL_HEAVY),
    // 6. team-registry
    'team-registry.md': () => /refactor/i.test(read(TEAM_REGISTRY)),
    // 7. hooks (runtime) — asserted via the entry-points registry SSOT, since
    //    the hooks derive their matcher from lib/entry-points.cjs at runtime.
    'hooks via entry-points (runtime)': () => {
      const mod = require(ENTRY_POINTS_CJS);
      return REFACTOR_NAMES.every((n) => mod.isPipelineEntryPoint(`/pipeline-orchestrator:${n}`));
    },
    // 8. plugin manifests via autoDiscover -> assert the skills dir exists
    //    (autoDiscover picks up skills/*/SKILL.md, so a present skill dir = a
    //    discovered command surface).
    'plugin autoDiscover (skills dir)': () =>
      fs.existsSync(path.dirname(SKILL_LIGHT)) && fs.existsSync(path.dirname(SKILL_HEAVY)),
    // 9. help.md menu
    'help.md': () => /refactor/i.test(read(HELP_MD)),
    // 10. pipeline-controller Phase 2 dispatch block must enumerate BOTH
    //     refactor variants explicitly — without these the controller falls
    //     through to the inline executor and bypasses REFACTOR_SCOPE_LOCK +
    //     characterization tests (the gap the original S7 missed).
    'pipeline-controller dispatch (refactor-light + refactor-heavy)': () => {
      const md = read(PIPELINE_CONTROLLER);
      return /pipeline_variant\s*==\s*refactor-light/.test(md)
        && /pipeline_variant\s*==\s*refactor-heavy/.test(md)
        && /Skill\(skill:\s*"pipeline-orchestrator:refactor-light"\)/.test(md)
        && /Skill\(skill:\s*"pipeline-orchestrator:refactor-heavy"\)/.test(md);
    },
    // 11. STEP 1.7 brainstorm-enforcement roster (the runtime SSOT the
    //     dispatch-guard reads) must carry the "refactor-" skill prefix, or a
    //     Refactor run bypasses BRAINSTORM_BYPASS enforcement.
    'step-1-7-enforcement skill_prefixes ("refactor-")': () => {
      const j = JSON.parse(read(STEP_17_ENFORCEMENT));
      return Array.isArray(j.skill_prefixes) && j.skill_prefixes.includes('refactor-');
    },
  };

  const present = [];
  const missing = [];
  for (const [name, check] of Object.entries(surfaces)) {
    let ok = false;
    try { ok = !!check(); } catch (_) { ok = false; }
    (ok ? present : missing).push(name);
  }
  // The contract: all present, or all missing. A partial state is the bug.
  const allPresent = missing.length === 0;
  const allMissing = present.length === 0;
  assert.ok(allPresent || allMissing,
    `partial refactor rollout detected (ship-blocker). present=[${present.join(', ')}]; ` +
    `missing=[${missing.join(', ')}]`);
  // For RED we additionally require the END state (all NINE present). Pre-impl
  // this fails because all are missing; post-impl it must be all present.
  assert.ok(allPresent,
    `refactor not yet wired across all nine surfaces. missing=[${missing.join(', ')}]`);
});

// ---- S8 [NEW] paperclip mirror -----------------------------------------
test('S8 [NEW] paperclip refactor mirror exists (workflow ref + slash command), shaped like the bugfix mirror', () => {
  assert.ok(fs.existsSync(PAPERCLIP_WORKFLOW),
    'references/paperclip/PAPERCLIP-REFACTOR-WORKFLOW.md must exist');
  assert.ok(fs.existsSync(PAPERCLIP_CMD),
    'commands/paperclip-refactor.md must exist');

  const wf = read(PAPERCLIP_WORKFLOW);
  const cmd = read(PAPERCLIP_CMD);

  // Workflow doc mirrors the bugfix workflow header shape.
  assert.match(wf, /PAPERCLIP-REFACTOR-WORKFLOW/,
    'workflow doc must carry the PAPERCLIP-REFACTOR-WORKFLOW title');
  assert.match(wf, /[Rr]efactor/, 'workflow doc must describe the Refactor type');

  // Slash command mirrors the bugfix command shape: YAML frontmatter with
  // allowed-tools, a fixed Refactor type, and a confirmation gate.
  assert.match(cmd, /^---/, 'paperclip-refactor.md must open with YAML frontmatter');
  assert.match(cmd, /allowed-tools:/, 'paperclip-refactor.md frontmatter must declare allowed-tools');
  assert.match(cmd, /[Rr]efactor/, 'paperclip-refactor.md must target the Refactor type');
});

// ---- summary ------------------------------------------------------------
console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log(`Failed checks (expected RED for [NEW]; [GUARD] should NOT appear here):`);
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
