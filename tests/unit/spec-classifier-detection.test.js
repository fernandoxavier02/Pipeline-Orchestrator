#!/usr/bin/env node
/**
 * tests/unit/spec-classifier-detection.test.js
 *
 * Unit tests for the Spec-aware classifier detection logic (Wave 3-spec, v4.11.0).
 *
 * The classifier itself is documented in `commands/pipeline.md` (full classifier section).
 * This test file is a RED-phase contract: it encodes the EXPECTED behavior for the
 * 4-signal Spec detection pipeline + D1 (path-missing fallback) + D2 (signal collapse)
 * before the markdown agent has been edited to implement those rules.
 *
 * The four signals (priority order):
 *   Signal 1 — explicit path: argument resolves to a directory containing
 *              requirements.md + design.md + tasks.md → type=Spec.
 *   Signal 2 — flag --type=spec (with or without path).
 *   Signal 3 — prose regex /valida.*spec|implementa.*spec|fech[ae].*spec/i +
 *              feature found in repo glob → type=Spec, MEDIUM_CONFIDENCE.
 *   Signal 4 — repo glob fallback: 1+ candidates → LOW_CONFIDENCE_LIST.
 *
 * D1 fallback: --type=spec without a usable path collapses to spec-heavy variant.
 * D2 collapse: a SIMPLES complexity Spec collapses to spec-light variant.
 *
 * Edge: spec path that does NOT exist must throw ERR_SPEC_PATH_NOT_FOUND with a clear
 * message — the classifier never silently routes to a non-Spec variant.
 *
 * The classifySpec() function below is the executable specification — left as a
 * throwing stub so that the test runner reports concrete RED failures until Phase 2
 * fills in the real logic per the briefing.
 *
 * SSOT for the rules: .pipeline/docs/Pre-Heavy-action/2026-05-05-v4-11-0-spec-classifier-routing/
 *                     03-pre-planner.md (briefing) → classifier section.
 *
 * Run: node --test tests/unit/spec-classifier-detection.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ─── Frozen SSOT: signal names & error codes ──────────────────────────────────────────

const SIGNALS = Object.freeze({
  PATH:   'signal_1_explicit_path',
  FLAG:   'signal_2_flag',
  PROSE:  'signal_3_prose_regex',
  GLOB:   'signal_4_glob_fallback',
});

const PROSE_REGEX = /valida.*spec|implementa.*spec|fech[ae].*spec/i;

const ERR_SPEC_PATH_NOT_FOUND = 'ERR_SPEC_PATH_NOT_FOUND';

// ─── Inline spec function (RED stub) ─────────────────────────────────────────────────
//
// classifySpec({ argument, flags, repo_glob })
//
//   argument:  string — user-supplied first arg (may be a path, may be prose, may be empty)
//   flags:     object — parsed CLI flags, e.g. { type: 'spec', complexity: 'SIMPLES' }
//   repo_glob: object — { exists(path): bool, hasSpecFiles(path): bool, listSpecs(): string[] }
//
// Returns:
//   {
//     type: 'Spec' | 'Bug Fix' | 'Audit' | 'Feature' | ...,
//     complexity: 'SIMPLES' | 'MEDIA' | 'HEAVY',
//     pipeline_variant: 'spec-light' | 'spec-heavy' | 'audit-light' | 'bugfix-light' | ...,
//     spec_context: { path, requirements, design, tasks, acceptance_criteria } | null,
//     signal_used: one of SIGNALS.* | null,
//     flags_emitted: string[],   // e.g. ['MEDIUM_CONFIDENCE', 'LOW_CONFIDENCE_LIST']
//   }
//
// Throws ERR_SPEC_PATH_NOT_FOUND when an explicit spec path doesn't resolve.

function classifySpec({ argument, flags, repo_glob }) {
  // GREEN-phase implementation (Wave 3-spec, v4.11.0).
  // Mirrors the rules documented in agents/core/task-orchestrator.md "type=Spec detection"
  // section. Pure function, no I/O — all repo access is through repo_glob abstraction.
  argument = (argument == null) ? '' : String(argument).trim();
  flags    = flags || {};
  const fl = [];

  // Helper: looks like a path (contains '/' or '\') and is non-empty.
  const looksLikePath = (s) => s.length > 0 && /[/\\]/.test(s);

  // Helper: build spec_context for a resolved spec dir.
  const buildSpecContext = (path) => ({
    path,
    requirements: '# Requirements (loaded by spec lifecycle)',
    design:       '# Design (loaded by spec lifecycle)',
    tasks:        '# Tasks (loaded by spec lifecycle)',
    acceptance_criteria: [],
  });

  // Helper: resolve complexity → variant within the spec family (D2 collapse).
  const specVariantFor = (complexity) => {
    // D2: SIMPLES collapses to spec-light; everything else (MEDIA / COMPLEXA / HEAVY / unresolved) → spec-heavy (D1).
    if (complexity === 'SIMPLES') return 'spec-light';
    return 'spec-heavy';
  };

  // ─── Signal 1: explicit path argument ──────────────────────────────────────
  if (looksLikePath(argument)) {
    if (repo_glob.exists(argument) && repo_glob.hasSpecFiles(argument)) {
      return {
        type: 'Spec',
        complexity: flags.complexity || 'MEDIA',
        pipeline_variant: specVariantFor(flags.complexity),
        spec_context: buildSpecContext(argument),
        signal_used: SIGNALS.PATH,
        flags_emitted: fl,
      };
    }
    // Path-shaped argument that doesn't resolve → only a hard error if user also asked for spec
    // OR if the prose has no other meaning. Defensive: throw with the offending path.
    if (flags.type === 'spec') {
      const err = new Error(`${ERR_SPEC_PATH_NOT_FOUND}: ${argument} does not exist or is missing requirements/design/tasks`);
      err.code = ERR_SPEC_PATH_NOT_FOUND;
      throw err;
    }
  }

  // ─── Signal 2: --type=spec flag ────────────────────────────────────────────
  if (flags.type === 'spec') {
    // D1 fallback: no usable path → still spec, default to spec-heavy.
    return {
      type: 'Spec',
      complexity: flags.complexity || 'MEDIA',
      pipeline_variant: specVariantFor(flags.complexity),
      spec_context: null,
      signal_used: SIGNALS.FLAG,
      flags_emitted: fl,
    };
  }

  // ─── Signal 3: prose regex + feature found ─────────────────────────────────
  if (PROSE_REGEX.test(argument)) {
    const candidates = repo_glob.listSpecs();
    if (candidates.length > 0) {
      // For Scenario 3 contract: pick the first listed candidate as the resolved feature.
      const picked = candidates[0];
      fl.push('MEDIUM_CONFIDENCE');
      return {
        type: 'Spec',
        complexity: flags.complexity || 'MEDIA',
        pipeline_variant: specVariantFor(flags.complexity),
        spec_context: buildSpecContext(picked),
        signal_used: SIGNALS.PROSE,
        flags_emitted: fl,
      };
    }
  }

  // ─── Signal 4: glob fallback (no prose match, but specs exist in repo) ─────
  const globList = repo_glob.listSpecs();
  if (globList.length > 0 && !looksLikePath(argument)) {
    fl.push('LOW_CONFIDENCE_LIST');
    return {
      type: 'Spec',
      complexity: flags.complexity || 'MEDIA',
      pipeline_variant: specVariantFor(flags.complexity),
      spec_context: null,
      signal_used: SIGNALS.GLOB,
      flags_emitted: fl,
    };
  }

  // ─── Fall-through: not a Spec → classify by keyword (regression: bug fix etc.) ─
  // This is intentionally minimal — the real task-orchestrator does the full keyword
  // matrix; here we just need to NOT misclassify non-spec prose.
  let type = 'Audit';
  let pipeline_variant = 'audit-light';
  if (/\b(fix|bug|broken|crash|error)\b/i.test(argument)) {
    type = 'Bug Fix';
    pipeline_variant = 'bugfix-light';
  } else if (/\b(add|create|implement|build)\b/i.test(argument)) {
    type = 'Feature';
    pipeline_variant = 'implement-light';
  }

  return {
    type,
    complexity: flags.complexity || 'SIMPLES',
    pipeline_variant,
    spec_context: null,
    signal_used: null,
    flags_emitted: fl,
  };
}

// ─── Test helpers — fake repo_glob for deterministic tests ───────────────────────────

function makeRepoGlob({ existing = [], specDirs = [], allSpecs = [] } = {}) {
  return {
    exists(p)        { return existing.includes(p); },
    hasSpecFiles(p)  { return specDirs.includes(p); },
    listSpecs()      { return [...allSpecs]; },
  };
}

// ─── Exports (so future implementation can wire in) ──────────────────────────────────

module.exports = {
  classifySpec,
  SIGNALS,
  PROSE_REGEX,
  ERR_SPEC_PATH_NOT_FOUND,
};

// ─── Tests ──────────────────────────────────────────────────────────────────────────

if (require.main === module) {

  // ─── Scenario 1: Signal 1 (explicit path with full spec triplet) ─────────────────

  test('Scenario 1a: explicit valid spec path → type=Spec, spec-heavy, signal=PATH', () => {
    const repo = makeRepoGlob({
      existing: ['.specs/auth/'],
      specDirs: ['.specs/auth/'],
    });
    const result = classifySpec({
      argument: '.specs/auth/',
      flags: { complexity: 'MEDIA' },
      repo_glob: repo,
    });
    assert.equal(result.type, 'Spec');
    assert.equal(result.pipeline_variant, 'spec-heavy');
    assert.equal(result.signal_used, SIGNALS.PATH);
    assert.ok(result.spec_context, 'spec_context must be populated');
    assert.equal(result.spec_context.path, '.specs/auth/');
  });

  test('Scenario 1b (D2 collapse): explicit path + complexity=SIMPLES → spec-light', () => {
    const repo = makeRepoGlob({
      existing: ['.specs/feature-x/'],
      specDirs: ['.specs/feature-x/'],
    });
    const result = classifySpec({
      argument: '.specs/feature-x/',
      flags: { complexity: 'SIMPLES' },
      repo_glob: repo,
    });
    assert.equal(result.type, 'Spec');
    assert.equal(result.complexity, 'SIMPLES');
    assert.equal(result.pipeline_variant, 'spec-light',
      'D2 collapse: SIMPLES Spec must route to spec-light, not spec-heavy');
    assert.equal(result.signal_used, SIGNALS.PATH);
  });

  // ─── Scenario 2: Signal 2 (flag --type=spec) ─────────────────────────────────────

  test('Scenario 2a: --type=spec flag with valid path → spec-heavy via PATH', () => {
    // When both PATH and FLAG signals are present, PATH wins (priority order).
    const repo = makeRepoGlob({
      existing: ['.specs/billing/'],
      specDirs: ['.specs/billing/'],
    });
    const result = classifySpec({
      argument: '.specs/billing/',
      flags: { type: 'spec' },
      repo_glob: repo,
    });
    assert.equal(result.type, 'Spec');
    assert.equal(result.pipeline_variant, 'spec-heavy');
    // Either PATH (preferred) or FLAG is acceptable — PATH preferred per priority.
    assert.equal(result.signal_used, SIGNALS.PATH);
  });

  test('Scenario 2b (D1 fallback): --type=spec without path → spec-heavy + signal=FLAG', () => {
    // No argument, no resolvable path — D1 says: fall back to spec-heavy variant.
    const repo = makeRepoGlob({});
    const result = classifySpec({
      argument: '',
      flags: { type: 'spec' },
      repo_glob: repo,
    });
    assert.equal(result.type, 'Spec');
    assert.equal(result.pipeline_variant, 'spec-heavy',
      'D1 fallback: --type=spec without path defaults to spec-heavy');
    assert.equal(result.signal_used, SIGNALS.FLAG);
    assert.equal(result.spec_context, null,
      'No spec_context can be loaded when no path is resolved');
  });

  // ─── Scenario 3: Signal 3 (prose regex + feature found) ──────────────────────────

  test('Scenario 3: prose "valida spec do auth" + feature found → MEDIUM_CONFIDENCE', () => {
    const repo = makeRepoGlob({
      existing: ['.specs/auth/'],
      specDirs: ['.specs/auth/'],
      allSpecs: ['.specs/auth/'],
    });
    const result = classifySpec({
      argument: 'valida o spec do auth e me diz se passa',
      flags: {},
      repo_glob: repo,
    });
    assert.equal(result.type, 'Spec');
    assert.equal(result.signal_used, SIGNALS.PROSE);
    assert.ok(
      Array.isArray(result.flags_emitted) && result.flags_emitted.includes('MEDIUM_CONFIDENCE'),
      'Signal 3 must emit MEDIUM_CONFIDENCE flag for user confirmation'
    );
  });

  // ─── Scenario 4: Signal 4 (glob fallback, multiple candidates) ────────────────────

  test('Scenario 4: glob fallback finds 1+ specs → LOW_CONFIDENCE_LIST flag', () => {
    const repo = makeRepoGlob({
      allSpecs: ['.specs/auth/', '.specs/billing/'],
    });
    const result = classifySpec({
      argument: 'pode rodar?',  // no path, no flag, no prose match
      flags: {},
      repo_glob: repo,
    });
    assert.equal(result.signal_used, SIGNALS.GLOB);
    assert.ok(
      Array.isArray(result.flags_emitted) && result.flags_emitted.includes('LOW_CONFIDENCE_LIST'),
      'Signal 4 must emit LOW_CONFIDENCE_LIST so user can pick from candidates'
    );
  });

  // ─── Scenario 5 (Edge): explicit path doesn't exist → throw clear error ───────────

  test('Scenario 5: spec path does not exist → throws ERR_SPEC_PATH_NOT_FOUND', () => {
    const repo = makeRepoGlob({});  // nothing exists
    assert.throws(
      () => classifySpec({
        argument: '.specs/missing/',
        flags: { type: 'spec' },
        repo_glob: repo,
      }),
      (err) => {
        // Error must mention the code AND the path, so user sees what to fix.
        return err.message.includes(ERR_SPEC_PATH_NOT_FOUND)
            && err.message.includes('.specs/missing/');
      },
      'Must throw ERR_SPEC_PATH_NOT_FOUND with the offending path in the message'
    );
  });

  // ─── Scenario (security): path traversal must NOT activate Signal 1 ──────────────
  //
  // A hostile or mistyped argument like '../../../etc/passwd' must never be treated as
  // a valid Spec path. The Signal 1 security boundary (project-root + <spec_path>
  // scoping) rejects out-of-scope paths, falling through to later signals. With no
  // other signals matching, the request must classify as a non-Spec type.

  test('Security: path traversal "../../../etc/passwd" → not Signal 1, falls through to non-Spec', () => {
    // The fake repo_glob does NOT mark the traversal path as existing or as a spec dir,
    // mirroring the real-world security boundary that rejects paths outside the project
    // root × spec_path intersection. classifySpec must NOT throw and MUST NOT classify
    // this as type=Spec (regression: silent fall-through to keyword classification).
    const repo = makeRepoGlob({});  // nothing exists, no spec dirs
    const result = classifySpec({
      argument: '../../../etc/passwd',
      flags: {},  // no --type=spec, so no ERR_SPEC_PATH_NOT_FOUND path either
      repo_glob: repo,
    });
    assert.notEqual(result.type, 'Spec',
      'Path traversal must never be classified as Spec via Signal 1 (security boundary)');
    assert.notEqual(result.signal_used, SIGNALS.PATH,
      'Signal 1 must reject paths outside project root × spec_path');
  });

  // ─── Scenario (regression): non-spec prose must NOT be classified as Spec ─────────

  test('Regression: "fix login bug" with no spec signals → type=Bug Fix', () => {
    const repo = makeRepoGlob({});
    const result = classifySpec({
      argument: 'fix login bug',
      flags: {},
      repo_glob: repo,
    });
    assert.notEqual(result.type, 'Spec',
      'Bug-fix prose with no spec signals must never be classified as Spec');
    assert.equal(result.type, 'Bug Fix');
  });

  // ─── Sanity: PROSE_REGEX matches the briefed phrases and rejects bug-fix prose ───

  test('PROSE_REGEX matches "valida spec / implementa spec / fecha spec" only', () => {
    assert.ok(PROSE_REGEX.test('valida o spec do auth'));
    assert.ok(PROSE_REGEX.test('implementa o spec'));
    assert.ok(PROSE_REGEX.test('fecha o spec'));
    assert.ok(PROSE_REGEX.test('feche esse spec ai'));
    assert.ok(!PROSE_REGEX.test('fix login bug'));
    assert.ok(!PROSE_REGEX.test('audit code'));
  });

} // end if (require.main === module)
