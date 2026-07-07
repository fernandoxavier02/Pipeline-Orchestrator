#!/usr/bin/env node
'use strict';

// =============================================================================
// F4 (v8.21.0) — SpecArtifactExemption (Slice S1). TDD RED.
// =============================================================================
// GOAL: pin the contract of the NEW pure predicate `isSpecArtifactWrite(targetPath,
// signedState)` that subtask 2.2 will add and EXPORT from
// `.claude/hooks/edit-guard-hook.cjs`. The predicate decides whether a Write/Edit
// that lands inside `.kiro/specs/**` is a LEGITIMATE spec-artifact write for the
// CURRENT run (→ exempt from the production-code locks) or must stay subject to
// the gate (fail-closed on anything it cannot positively vouch for).
//
// WHY THIS IS A GENUINE RED (right reason): `isSpecArtifactWrite` does NOT exist
// yet — it is neither defined nor present in module.exports. Every one of the 6
// cases calls it, so each fails with `TypeError: ... is not a function` (a
// missing-implementation failure per the pre-tester RED matrix, NOT an import /
// syntax / file error). The require() of the hook module itself SUCCEEDS (the
// file exists and loads), so the failure is isolated to the un-implemented
// behaviour, exactly as TDD RED requires. After subtask 2.2 exports the real
// predicate these 6 cases go GREEN with zero test edits.
//
// -----------------------------------------------------------------------------
// PATH-RESOLUTION BASE (pinned explicitly — the design warns that getting this
// wrong yields either OVER-EXEMPTION or a FALSE-NEGATIVE):
//   * Both `targetPath` and `signedState.orchestrator_decision.spec_context.spec_path`
//     are treated as POSIX-normalized paths ANCHORED AT THE SAME repo root. The
//     test supplies them as forward-slash relative paths (e.g. '.kiro/specs/foo/x.md'
//     and '.kiro/specs/foo/'); the predicate is expected to normalize both against
//     ONE shared base before comparing.
//   * "targetPath falls INSIDE the run's spec folder" means PATH-SEGMENT
//     containment of targetPath under the folder resolved from spec_path — NOT raw
//     string-prefix (so a sibling like '.kiro/specs/foo-2/...' must NOT match a
//     spec_path of '.kiro/specs/foo/'). The 6 cases below fix the observable
//     true/false verdicts; the resolution base is documented here so subtask 2.2
//     implements against the base these assertions assume.
// -----------------------------------------------------------------------------
//
// CONTRACT (from the design) — `isSpecArtifactWrite(targetPath, signedState)` is
// PURE and returns `true` ONLY when ALL hold:
//   (a) typeof signedState === 'object' && signedState !== null;
//   (b) normalized targetPath is inside `.kiro/specs/**`;
//   (c) signedState.orchestrator_decision.spec_context.spec_path is present and
//       non-empty AND signedState.orchestrator_decision.type === 'Spec';
//   (d) targetPath falls INSIDE the run's own spec folder (resolved from spec_path).
// Fail-closed → false: null / CORRUPT_SENTINEL string / spec_path absent-or-empty /
// type !== 'Spec' / cross-spec target.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK_PATH = '../../../.claude/hooks/edit-guard-hook.cjs';
// require() must SUCCEED — if THIS throws, the RED is the WRONG kind (module/path
// error) and must be fixed before proceeding, per the pre-tester matrix.
const eg = require(HOOK_PATH);
const signer = require('../../../lib/sentinel-state-signer.cjs');

// --- shared fixtures ---------------------------------------------------------
// A valid signed-state shape for a Spec-authoring run whose spec folder is
// `.kiro/specs/workflow-audit-remediation/` (spec A).
function specStateA() {
  return {
    orchestrator_decision: {
      type: 'Spec',
      spec_context: { spec_path: '.kiro/specs/workflow-audit-remediation/' },
    },
  };
}

let pass = 0, fail = 0; const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e && e.message}`); fail++; failed.push(name); }
}

console.log('=== F4 v8.21.0 — SpecArtifactExemption: isSpecArtifactWrite(targetPath, signedState) [RED] ===');

// 5.1 — ALLOW (main happy path): valid Spec run, target inside the run's own
// spec folder → true.
test('F4-5.1 [MAIN] allow — Spec run writing inside its own spec folder → true', () => {
  const result = eg.isSpecArtifactWrite(
    '.kiro/specs/workflow-audit-remediation/design.md',
    specStateA(),
  );
  assert.equal(result, true,
    'a valid Spec run writing a design.md inside its own .kiro/specs/<run>/ folder must be recognized as a spec-artifact write');
});

// 5.2a — DENY (regression: cross-spec containment): same Spec state (spec A) but
// the target lives in a DIFFERENT spec folder → false. Guards the path-segment
// containment vs raw string-prefix hazard called out in the header.
test('F4-5.2a [REGRESSION] deny — cross-spec target (spec A state, spec B path) → false', () => {
  const result = eg.isSpecArtifactWrite(
    '.kiro/specs/outra-feature/tasks.md',
    specStateA(),
  );
  assert.equal(result, false,
    'writing into a DIFFERENT spec folder than the run owns must be denied (no cross-spec exemption)');
});

// 5.2b — DENY (regression: wrong run type): a code run (type != 'Spec') must not
// get the spec-artifact exemption even when the target is under .kiro/specs/**.
test('F4-5.2b [REGRESSION] deny — non-Spec run type (Feature) targeting .kiro/specs → false', () => {
  const state = specStateA();
  state.orchestrator_decision.type = 'Feature'; // a code run, not spec-authoring
  const result = eg.isSpecArtifactWrite(
    '.kiro/specs/workflow-audit-remediation/design.md',
    state,
  );
  assert.equal(result, false,
    'only a run whose orchestrator_decision.type === "Spec" earns the exemption; a Feature run must not');
});

// 5.2c — DENY (edge: production path inside a valid Spec run): a valid Spec state
// but the target is production code OUTSIDE .kiro/specs/** → false. Confirms the
// exemption never leaks onto real production writes.
test('F4-5.2c [EDGE] deny — valid Spec run but target is production code outside .kiro/specs → false', () => {
  const result = eg.isSpecArtifactWrite(
    '.claude/hooks/x.cjs',
    specStateA(),
  );
  assert.equal(result, false,
    'a production-code path outside .kiro/specs/** is never a spec-artifact write, even under a valid Spec run');
});

// 5.4a — DENY (edge, fail-closed on tamper): signedState is the CORRUPT_SENTINEL
// string (authoritatively-corrupt run state) → false, even for a target inside
// .kiro/specs/**.
test('F4-5.4a [EDGE] deny fail-closed — signedState === CORRUPT_SENTINEL → false', () => {
  assert.equal(typeof eg.CORRUPT_SENTINEL, 'string',
    'precondition: CORRUPT_SENTINEL must be exported as a string sentinel');
  const result = eg.isSpecArtifactWrite(
    '.kiro/specs/workflow-audit-remediation/design.md',
    eg.CORRUPT_SENTINEL,
  );
  assert.equal(result, false,
    'a corrupt/tampered run state must fail closed — no exemption granted');
});

// 5.4b — DENY (edge, fail-closed no run): signedState is null (no active governed
// run) → false, even for a target inside .kiro/specs/**.
test('F4-5.4b [EDGE] deny fail-closed — signedState === null (no run) → false', () => {
  const result = eg.isSpecArtifactWrite(
    '.kiro/specs/workflow-audit-remediation/design.md',
    null,
  );
  assert.equal(result, false,
    'with no signed run state there is nothing to vouch for the write — must fail closed');
});

// 5.5a — DENY (MEDIUM edge: empty explicit spec_path): a Spec run whose spec_path is
// the empty string must NOT turn every .kiro/specs write into an exemption.
test('F4-5.5a [EDGE] deny — explicit empty spec_path → false', () => {
  const state = specStateA();
  state.orchestrator_decision.spec_context.spec_path = '';
  const result = eg.isSpecArtifactWrite('.kiro/specs/workflow-audit-remediation/design.md', state);
  assert.equal(result, false, 'an empty spec_path is not a run-owned spec folder — no exemption');
});

// 5.5b — DENY (MEDIUM edge: '..' traversal escaping the run folder): a target that
// normalizes OUT of the run's own spec folder must not match via raw prefix.
test("F4-5.5b [EDGE] deny — targetPath with '..' escaping to a sibling spec → false", () => {
  const result = eg.isSpecArtifactWrite(
    '.kiro/specs/workflow-audit-remediation/../outra-feature/tasks.md',
    specStateA(),
  );
  assert.equal(result, false, "a '..' hop into a sibling spec folder must be denied after normalization");
});

// 5.5c — ALLOW (MEDIUM edge: '..' traversal that stays inside the run folder): normalization
// must not accidentally deny a legitimate in-folder path that contains a redundant '..'.
test("F4-5.5c [EDGE] allow — targetPath with in-folder '..' resolving back inside the run → true", () => {
  const result = eg.isSpecArtifactWrite(
    '.kiro/specs/workflow-audit-remediation/sub/../design.md',
    specStateA(),
  );
  assert.equal(result, true, "a '..' that resolves back inside the run's own spec folder is still a spec-artifact write");
});

// 5.6 — CASE-SENSITIVITY DECISION (pinned): isSpecArtifactWrite compares path SEGMENTS
// case-SENSITIVELY and does NOT lowercase on win32. This is a DELIBERATE choice for an
// access-GRANTING predicate: a case-variant target fails to match the run's declared spec_path
// and is DENIED (fail-closed). Lowercasing would only LOOSEN matching (grant the exemption to
// case-variant paths) — the opposite of the hardening this slice is about — and would make the
// pure predicate platform-dependent. Kiro spec paths are emitted with consistent casing in
// practice, so there is no real false-negative. Pinned so a future refactor cannot silently flip
// to case-insensitive without updating this contract.
//
// TEST-1 fix: the target MUST diverge from spec_path only in the RUN-NAME segment, keeping the
// '.kiro/specs' prefix lowercase — otherwise the deny happens at the isUnderKiroSpecs PREFIX gate
// and never exercises the case-sensitive containment LOOP this case claims to pin. Here the prefix
// matches (both '.kiro/specs'), so the ONLY thing that can deny is the segment-by-segment loop
// comparing 'Workflow-Audit-Remediation' against the run's 'workflow-audit-remediation'.
test('F4-5.6 [POLICY] deny — case-variant RUN NAME does NOT match run spec_path in the containment loop (case-sensitive by design) → false', () => {
  const result = eg.isSpecArtifactWrite('.kiro/specs/Workflow-Audit-Remediation/design.md', specStateA());
  assert.equal(result, false, 'case-sensitive segment comparison in the loop denies a case-variant run-name target (deliberate fail-closed posture)');
});

// -----------------------------------------------------------------------------
// INTEGRATION cases — exercise isExemptPath(filePath ABSOLUTE, pipelineDir) for real, through
// state discovery + HMAC verification (NOT just the pure predicate). These pin the two HIGH
// defects the 6 unit cases masked.
// -----------------------------------------------------------------------------

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}
// Run body with env vars controlled and restored — discovery reads process.env at call time.
function withEnv(overrides, body) {
  const saved = {};
  for (const k of Object.keys(overrides)) { saved[k] = process.env[k]; }
  for (const [k, val] of Object.entries(overrides)) {
    if (val === undefined) delete process.env[k]; else process.env[k] = val;
  }
  try { return body(); }
  finally {
    for (const k of Object.keys(overrides)) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

const HMAC_SECRET = 'F4-integration-hmac-secret-key-0123456789abcdef'; // >= 32 chars

// F4-INT-1 [HIGH-1] integration ALLOW: a SIGNED+VALID Spec run is active (discovered via the
// authoritative active-run.json pointer), and the target is an ABSOLUTE path inside the run's own
// .kiro/specs/<feature>/ folder → isExemptPath true. This catches HIGH-1: if isExemptPath passed
// the RAW absolute path to isSpecArtifactWrite, specPathSegments()[0] would be the drive/root and
// the exemption would be dead (false).
test('F4-INT-1 [HIGH-1] integration allow — signed Spec run, ABSOLUTE target inside own spec folder → true', () => {
  const dir = mkTmp('f4-int-allow-');
  try {
    const runDir = path.join(dir, '.pipeline', 'docs', 'Pre-Media-action', 'my-spec-run');
    fs.mkdirSync(runDir, { recursive: true });
    const state = {
      pipeline_active: true,
      orchestrator_decision: {
        type: 'Spec',
        spec_context: { spec_path: '.kiro/specs/workflow-audit-remediation/' },
      },
    };
    const signed = signer.signState(state, HMAC_SECRET);
    fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(signed, null, 2));
    // authoritative pointer (absolute path, contained inside <dir>/.pipeline)
    fs.writeFileSync(
      path.join(dir, '.pipeline', 'active-run.json'),
      JSON.stringify({ pipeline_doc_path: runDir }),
    );
    const absTarget = path.join(dir, '.kiro', 'specs', 'workflow-audit-remediation', 'design.md');
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: HMAC_SECRET, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, PIPELINE_HMAC_STRICT: undefined },
      () => eg.isExemptPath(absTarget, dir),
    );
    assert.equal(result, true,
      'a signed+valid active Spec run must exempt an ABSOLUTE write inside its own .kiro/specs/<run>/ folder (HIGH-1: absolute→relative anchoring)');
  } finally { rmTmp(dir); }
});

// F4-INT-2 [HIGH-2] integration FORGE-DENY: a FORGED, UNSIGNED sentinel-state (type=Spec, arbitrary
// spec_path) is discovered ONLY by the mtime fallback (no active-run.json, no env pointers). An
// ABSOLUTE target inside the forged spec_path's .kiro/specs/<target>/ → isExemptPath false. This
// catches HIGH-2: the unverified mtime-fallback / unsigned state must NOT grant an access exemption.
test('F4-INT-2 [HIGH-2] integration forge-deny — UNSIGNED forged Spec state via mtime fallback → false', () => {
  const dir = mkTmp('f4-int-forge-');
  try {
    const runDir = path.join(dir, '.pipeline', 'docs', 'Pre-Media-action', 'forged-run');
    fs.mkdirSync(runDir, { recursive: true });
    const forged = {
      pipeline_active: true,
      orchestrator_decision: {
        type: 'Spec',
        spec_context: { spec_path: '.kiro/specs/victim-feature/' },
      },
    }; // deliberately UNSIGNED (no __signature)
    fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(forged, null, 2));
    // NO active-run.json → discovery falls to the non-authoritative mtime walk.
    const absTarget = path.join(dir, '.kiro', 'specs', 'victim-feature', 'design.md');
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: HMAC_SECRET, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, PIPELINE_HMAC_STRICT: undefined },
      () => eg.isExemptPath(absTarget, dir),
    );
    assert.equal(result, false,
      'an UNSIGNED forged Spec state picked up by the mtime fallback must NOT grant a spec-artifact exemption (HIGH-2: access grant requires a present+valid signature)');
  } finally { rmTmp(dir); }
});

// F4-INT-3 [HIGH-2 corollary] integration TAMPER-DENY: a SIGNED-then-TAMPERED state (signature no
// longer matches the mutated body) must also be denied — present-but-invalid signature is evidence
// of tampering, never an exemption.
test('F4-INT-3 [HIGH-2] integration tamper-deny — signed state with mutated body (invalid signature) → false', () => {
  const dir = mkTmp('f4-int-tamper-');
  try {
    const runDir = path.join(dir, '.pipeline', 'docs', 'Pre-Media-action', 'tampered-run');
    fs.mkdirSync(runDir, { recursive: true });
    const state = {
      pipeline_active: true,
      orchestrator_decision: { type: 'Spec', spec_context: { spec_path: '.kiro/specs/victim-feature/' } },
    };
    const signed = signer.signState(state, HMAC_SECRET);
    // Tamper AFTER signing: repoint spec_path without re-signing.
    signed.orchestrator_decision.spec_context.spec_path = '.kiro/specs/attacker-feature/';
    fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(signed, null, 2));
    fs.writeFileSync(
      path.join(dir, '.pipeline', 'active-run.json'),
      JSON.stringify({ pipeline_doc_path: runDir }),
    );
    const absTarget = path.join(dir, '.kiro', 'specs', 'attacker-feature', 'design.md');
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: HMAC_SECRET, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, PIPELINE_HMAC_STRICT: undefined },
      () => eg.isExemptPath(absTarget, dir),
    );
    assert.equal(result, false,
      'a tampered signed state (body mutated, signature stale) must fail closed — no exemption');
  } finally { rmTmp(dir); }
});

// F4-INT-4 [TEST-2 / key_unavailable] integration KEY-DENY: a SIGNED state whose signature is PRESENT
// but for which NO HMAC key is available at verify time (no env secret, no key file under a redirected
// home) → verifyState reports key_unavailable, and GRANTING an access exemption requires a PRESENT+VALID
// signature, so isExemptPath must DENY. This pins the `v.key_unavailable === true` arm the 6 unit cases
// and the earlier INT cases never exercised (they always had the key).
test('F4-INT-4 [KEY-UNAVAILABLE] integration key-deny — signed state but no HMAC key at verify time → false', () => {
  const dir = mkTmp('f4-int-keyless-');
  try {
    const runDir = path.join(dir, '.pipeline', 'docs', 'Pre-Media-action', 'keyless-run');
    fs.mkdirSync(runDir, { recursive: true });
    const state = {
      pipeline_active: true,
      orchestrator_decision: { type: 'Spec', spec_context: { spec_path: '.kiro/specs/workflow-audit-remediation/' } },
    };
    const signed = signer.signState(state, HMAC_SECRET); // signature PRESENT
    fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(signed, null, 2));
    fs.writeFileSync(path.join(dir, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: runDir }));
    const absTarget = path.join(dir, '.kiro', 'specs', 'workflow-audit-remediation', 'design.md');
    // Redirect HOME/USERPROFILE to the fresh tmp dir so the signer finds NO key file there, and clear
    // the env secret → readHmacKey() returns null → verifyState → key_unavailable (non-strict: valid
    // but key_unavailable), which the exemption treats as a hard DENY.
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: undefined, PIPELINE_HMAC_STRICT: undefined, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, HOME: dir, USERPROFILE: dir },
      () => eg.isExemptPath(absTarget, dir),
    );
    assert.equal(result, false,
      'a present signature with no verification key available must NOT grant the access exemption (key_unavailable → deny)');
  } finally { rmTmp(dir); }
});

// F4-INT-5 [TEST-3 / mtime-signed positive] integration ALLOW-VIA-MTIME: a genuinely SIGNED+VALID Spec
// state discovered ONLY by the non-authoritative mtime fallback (no active-run.json, no env pointers)
// must still be exempted — verification is what grants, not the discovery channel. This is the positive
// counterpart to F4-INT-2 (unsigned via mtime → deny).
test('F4-INT-5 [MTIME-SIGNED] integration allow — signed+valid Spec state via mtime fallback → true', () => {
  const dir = mkTmp('f4-int-mtime-signed-');
  try {
    const runDir = path.join(dir, '.pipeline', 'docs', 'Pre-Media-action', 'mtime-run');
    fs.mkdirSync(runDir, { recursive: true });
    const state = {
      pipeline_active: true,
      orchestrator_decision: { type: 'Spec', spec_context: { spec_path: '.kiro/specs/workflow-audit-remediation/' } },
    };
    const signed = signer.signState(state, HMAC_SECRET);
    fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(signed, null, 2));
    // NO active-run.json and NO env pointers → discovery falls to the mtime walk.
    const absTarget = path.join(dir, '.kiro', 'specs', 'workflow-audit-remediation', 'design.md');
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: HMAC_SECRET, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, PIPELINE_HMAC_STRICT: undefined },
      () => eg.isExemptPath(absTarget, dir),
    );
    assert.equal(result, true,
      'a signed+valid Spec state must be exempted even when discovered via the mtime fallback (verification grants, not discovery)');
  } finally { rmTmp(dir); }
});

// -----------------------------------------------------------------------------
// INTEGRATION cases — exercise the FULL handlePreToolUse → shouldBlock path (SEC-1). shouldBlock is the
// FIRST gate in handlePreToolUse and returns immediately, so these pin that the spec-artifact exemption
// is actually REACHED there (the defect the isExemptPath-only unit + INT cases masked): a real /spec run
// arms a session-lock for the 'spec' entry point and the spec-controller writes .kiro/specs/** WITHOUT
// opening an exec-window, so the first spec-artifact write must NOT hit PIPELINE_LOCK_ACTIVE — while
// production code and cross-spec writes MUST still be blocked.
// -----------------------------------------------------------------------------

// Write an ACTIVE session-lock (the shape getActiveLock accepts) — no exec-window is created, so the
// only thing that can allow a write outside .pipeline/ is the SEC-1 spec-artifact exemption.
function writeActiveLock(dir, sessionId) {
  const sessionsDir = path.join(dir, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const now = Date.now();
  fs.writeFileSync(path.join(sessionsDir, `${sessionId}.lock`), JSON.stringify({
    session_id: sessionId,
    status: 'active',
    created_at: now,
    last_seen_at: now,
    expires_at: now + 60 * 60 * 1000,
  }));
}

// Set up a signed+valid Spec run (authoritative pointer) + an active lock + NO exec-window, then return
// the pipelineDir. spec_path is spec A ('.kiro/specs/workflow-audit-remediation/').
function setupLockedSpecRun(dir) {
  const runDir = path.join(dir, '.pipeline', 'docs', 'Pre-Media-action', 'locked-spec-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    pipeline_active: true,
    orchestrator_decision: { type: 'Spec', spec_context: { spec_path: '.kiro/specs/workflow-audit-remediation/' } },
  };
  const signed = signer.signState(state, HMAC_SECRET);
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(signed, null, 2));
  fs.writeFileSync(path.join(dir, '.pipeline', 'active-run.json'), JSON.stringify({ pipeline_doc_path: runDir }));
  writeActiveLock(dir, 'specsess01');
}

// F4-INT-6 [SEC-1] integration ALLOW via handlePreToolUse: session-lock ACTIVE + NO exec-window + signed
// Spec run + ABSOLUTE target inside the run's own .kiro/specs/<feature>/ → handlePreToolUse allows. This
// is THE case the earlier isExemptPath-only tests could not catch: shouldBlock returns FIRST, so if it
// never consulted the exemption the write would be denied with PIPELINE_LOCK_ACTIVE (the /spec deadlock).
test('F4-INT-6 [SEC-1] handlePreToolUse allow — locked Spec run, no exec-window, ABSOLUTE spec-artifact target → allow', () => {
  const dir = mkTmp('f4-int-shouldblock-allow-');
  try {
    setupLockedSpecRun(dir);
    const absTarget = path.join(dir, '.kiro', 'specs', 'workflow-audit-remediation', 'design.md');
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: HMAC_SECRET, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, PIPELINE_HMAC_STRICT: undefined },
      () => eg.handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: absTarget }, cwd: dir }),
    );
    assert.equal(result.decision, 'allow',
      'a spec-artifact write of a locked Spec run must pass shouldBlock even with an active lock and no exec-window (SEC-1)');
  } finally { rmTmp(dir); }
});

// F4-INT-7 [SEC-1] integration DENY-PROD via handlePreToolUse: SAME locked Spec run, but the target is
// production code OUTSIDE .kiro/specs → PIPELINE_LOCK_ACTIVE is preserved (the exemption must NOT leak).
test('F4-INT-7 [SEC-1] handlePreToolUse deny — locked Spec run, production-code target → PIPELINE_LOCK_ACTIVE', () => {
  const dir = mkTmp('f4-int-shouldblock-prod-');
  try {
    setupLockedSpecRun(dir);
    const absTarget = path.join(dir, '.claude', 'hooks', 'x.cjs'); // production code, outside .kiro/specs
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: HMAC_SECRET, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, PIPELINE_HMAC_STRICT: undefined },
      () => eg.handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: absTarget }, cwd: dir }),
    );
    assert.equal(result.decision, 'block', 'production-code writes must stay blocked under an active lock');
    assert.ok(/PIPELINE_LOCK_ACTIVE/.test(result.reason || ''),
      'the block reason must be PIPELINE_LOCK_ACTIVE (the lock, not the exemption, governs production code)');
  } finally { rmTmp(dir); }
});

// F4-INT-8 [SEC-1] integration DENY-CROSS-SPEC via handlePreToolUse: locked Spec run for feature A, target
// inside a DIFFERENT spec folder (feature B) → still PIPELINE_LOCK_ACTIVE (no cross-spec exemption).
test('F4-INT-8 [SEC-1] handlePreToolUse deny — locked Spec run for A, cross-spec target B → PIPELINE_LOCK_ACTIVE', () => {
  const dir = mkTmp('f4-int-shouldblock-cross-');
  try {
    setupLockedSpecRun(dir); // run owns spec A: workflow-audit-remediation
    const absTarget = path.join(dir, '.kiro', 'specs', 'outra-feature', 'tasks.md'); // spec B
    const result = withEnv(
      { PIPELINE_HMAC_SECRET: HMAC_SECRET, PIPELINE_DOC_PATH: undefined, PIPELINE_RUN_ID: undefined, PIPELINE_HMAC_STRICT: undefined },
      () => eg.handlePreToolUse({ tool_name: 'Write', tool_input: { file_path: absTarget }, cwd: dir }),
    );
    assert.equal(result.decision, 'block', 'a cross-spec write must stay blocked under an active lock');
    assert.ok(/PIPELINE_LOCK_ACTIVE/.test(result.reason || ''),
      'the block reason must be PIPELINE_LOCK_ACTIVE (no cross-spec exemption)');
  } finally { rmTmp(dir); }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
