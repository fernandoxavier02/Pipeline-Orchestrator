#!/usr/bin/env node
'use strict';

// =============================================================================
// H1 (v8.28.0) — Session deadlock harness (spec workflow-audit-remediation, S7).
// =============================================================================
// DELIVERABLE-IS-TESTS. Requirement 5.3 asks the regression suite to consolidate a
// harness of session scenarios that REPLAYS the historical deadlocks the plugin has
// already fixed, guaranteeing none of them silently regress. Five classes are named:
//   (1) orphan arming marker,            (2) fail-open stop-trap,
//   (3) plan deadlock,                   (4) pending-dispatch deadlock,
//   (5) phantom CONTINUE run.
//
// PROOF MECHANISM — shadow-overlay / proof-by-fix-reversion (design.md, DeadlockHarness).
// Each scenario runs the REAL lock executable (the actual hook, via a separate process
// — NOT an in-process import) TWICE, against two code overlays built in throwaway temp
// dirs (the real working tree is NEVER touched):
//   * PRE-FIX overlay — a byte copy of .claude/hooks/ + lib/ with ONLY the scenario's
//     target file reverted to `git show <fix-commit>^:<path>` (the content from BEFORE
//     the fix landed). Running the scenario against it MUST REPRODUCE the deadlock.
//     This is the RED-with-teeth half: the behavioural assertion FAILS against pre-fix
//     code, which is what proves the test can actually catch a regression.
//   * HEAD overlay — a clean byte copy of the CURRENT code. The same scenario MUST NOT
//     reproduce the deadlock (the fix holds). This is the GREEN half.
//
// A scenario is only meaningful if BOTH halves hold: pre-fix reproduces the deadlock
// (teeth) AND HEAD is clean (fix present). If the pre-fix overlay did NOT reproduce the
// deadlock, the scenario would be decorative (it would pass no matter what) — so the
// harness ASSERTS that the pre-fix half reproduces it.
//
// SCOPE OF THIS FILE:
//   * harness scaffold + in-file shared signed-state setup/teardown utilities
//     (info-gate note 2: utilities live INSIDE the harness file — no separate module);
//   * scenario 1 (orphan arm-marker) — pre-tester task T1 (RED authoring);
//   * scenarios 2-5 (fail-open stop-trap, plan deadlock, pending-dispatch deadlock,
//     phantom CONTINUE run) — executor-controller GREEN tasks T2-T5. Each is a full
//     dual-run (RED against its pre-fix overlay + GREEN against HEAD) with the SAME
//     shadow-overlay mechanism.
//
// PRODUCTION CODE IS NOT MODIFIED by this file: it only copies + invokes existing hooks
// as black boxes.
// =============================================================================

// A stable HMAC secret so the sentinel signer is deterministic across this process
// (in-process seeding) AND the spawned hooks (they inherit it via env). Set BEFORE the
// signer is require()'d so the key resolution sees it.
process.env.PIPELINE_HMAC_SECRET = 'h1-session-deadlock-harness-stable-secret-0123456789';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Repo root = three levels up from tests/regression/v8.28.0/.
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Signer + arm lib are require()'d from the REAL tree ONLY to SEED on-disk state
// (a signed sentinel-state, an unsigned arm marker). Seeding is format-stable and both
// overlays read the same bytes; the *behaviour under test* is always the spawned hook.
const signer = require(path.join(REPO_ROOT, 'lib/sentinel-state-signer.cjs'));
const { writeSignedState } = signer;

// The directories an overlay must contain for the hooks' relative require()s
// (`../../lib/...`, `./edit-guard-hook.cjs`) to resolve. Confirmed by a scan: no hook on
// any scenario path reaches outside these two trees (no references/ / agents/ deps).
const OVERLAY_TREES = ['.claude/hooks', 'lib'];

// -----------------------------------------------------------------------------
// Shared signed-state setup / teardown utilities (in-file per info-gate note 2).
// -----------------------------------------------------------------------------

// Fresh throwaway PROJECT root (this is the `cwd` the hooks operate on; all .pipeline/
// writes land here, never in the overlay code tree or the real working tree).
function makeProjectRoot(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `h1-${tag}-proj-`));
}

// Seed a signed sentinel-state + active-run pointer for an INACTIVE (deliberately
// closable) run. Mirrors the seed shape of tests/regression/v8.19.1/F1.
function seedInactiveRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r1',
    pipeline_active: false,
    pipeline_doc_path: docDir,
    state_version: 1,
    current_phase: '3-closure',
    workflow: 'FULL',
    pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r1', updated_at: new Date().toISOString() }, null, 2),
  );
  return { docDir, statePath };
}

// Seed a signed sentinel-state for an ACTIVE, INCOMPLETE run (armed → the Stop gate
// blocks unless it can advance/terminate). Mirrors tests/regression/v8.20.0/F1 seedRun.
function seedActiveIncompleteRun(root, extra) {
  const docDir = path.join(root, '.pipeline', 'docs', 'run');
  fs.mkdirSync(docDir, { recursive: true });
  const statePath = path.join(docDir, 'sentinel-state.json');
  writeSignedState(statePath, Object.assign({
    run_id: 'r1',
    pipeline_active: true,
    pipeline_doc_path: docDir,
    state_version: 1,
    current_phase: '2-execution',
    pending_dispatches: {},
  }, extra || {}));
  fs.writeFileSync(
    path.join(root, '.pipeline', 'active-run.json'),
    JSON.stringify({ pipeline_doc_path: docDir, run_id: 'r1', updated_at: new Date().toISOString() }, null, 2),
  );
  return { docDir, statePath };
}

// Seed the arm-pending marker (enforcement CONTROL state the /pipeline wiring writes at
// invocation). Unsigned + well-formed + fresh timestamp = a live, tolerated marker.
// `sessionId` stamps session ownership (session isolation, v8.18.0).
function seedArmMarker(root, sessionId) {
  const p = path.join(root, '.pipeline', 'pipeline-arm-pending.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const m = { requested_at: new Date().toISOString(), workflow: 'FULL', mode: 'FULL' };
  if (sessionId) m.session_id = sessionId;
  fs.writeFileSync(p, JSON.stringify(m, null, 2));
  return p;
}

function cleanup(dir) {
  if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

// Classify a FAILED `git show` as infrastructure-unavailable (→ SKIP) vs a genuine defect
// (→ FAIL). Infrastructure = the git binary is absent (spawn ENOENT) OR the ref/object is
// not present in THIS clone (a shallow clone that lacks the pre-fix commit: "bad revision",
// "unknown revision", "invalid object name", "does not exist in"). A git-show that fails in
// a healthy tree where the ref EXISTS does NOT match these signals, so it stays a genuine
// FAIL — never a silent skip. (Preserves the teeth: only real unavailability skips.)
function gitShowUnavailable(g) {
  if (g.error && g.error.code === 'ENOENT') return true; // git binary not on PATH
  const err = String(g.stderr || '');
  return /bad revision|unknown revision|invalid object name|does not exist in|no such path|not a tree object|Not a git repository/i.test(err);
}

// Build a code overlay in a throwaway temp dir. Copies OVERLAY_TREES byte-for-byte, then
// (for the pre-fix overlay) overwrites ONLY `targetRel` with the pre-fix content pulled
// from git. Returns the overlay root. NEVER writes into the real working tree. On ANY
// throw after the temp dir is created (git-show failure, teeth-sanity assert, write error)
// the overlay is cleaned up before the error propagates (no leaked temp dir). A throw whose
// `.skip` is true means infrastructure is unavailable (caller SKIPs); otherwise it is a
// genuine failure (caller FAILs).
//   targetRel  — repo-relative path of the single reverted file (null = clean HEAD copy)
//   preFixRef  — a git ref that resolves to the pre-fix content (e.g. '<fix-sha>^')
function buildOverlay(tag, targetRel, preFixRef) {
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), `h1-${tag}-overlay-`));
  try {
    for (const tree of OVERLAY_TREES) {
      fs.cpSync(path.join(REPO_ROOT, tree), path.join(overlay, tree), { recursive: true });
    }
    if (targetRel && preFixRef) {
      const g = spawnSync('git', ['show', `${preFixRef}:${targetRel}`], {
        cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      });
      if (g.status !== 0) {
        // Include g.error so a missing git binary (ENOENT, status null) is diagnosable.
        const detail = g.stderr || g.error || g.status;
        const e = new Error(`git show ${preFixRef}:${targetRel} failed: ${detail}`);
        if (gitShowUnavailable(g)) e.skip = true;
        throw e;
      }
      fs.writeFileSync(path.join(overlay, targetRel), g.stdout);
      // Teeth sanity: the reverted file MUST differ from HEAD, else the pre-fix overlay is
      // identical to HEAD and the RED half would be vacuous. (A failure here is a genuine
      // test defect, NOT infrastructure — it throws WITHOUT `.skip`, so the caller FAILs.)
      const headContent = fs.readFileSync(path.join(REPO_ROOT, targetRel), 'utf8');
      assert.notEqual(g.stdout, headContent,
        `pre-fix overlay of ${targetRel} is byte-identical to HEAD — the RED half would have no teeth`);
    }
    return overlay;
  } catch (e) {
    cleanup(overlay); // never leak the temp overlay on a throw
    throw e;
  }
}

// Invoke a hook executable FROM the overlay (separate process, real CLI contract).
function runHook(overlay, hookRel, payload, envExtra) {
  const base = { ...process.env };
  // Clear operator escapes so the hooks run under their SHIPPED default posture (deny).
  for (const k of ['PIPELINE_ARM_ENFORCEMENT', 'PIPELINE_CHAIN_ENFORCEMENT',
    'PIPELINE_STOP_BLOCK_ENFORCEMENT', 'PIPELINE_E2E_EVAL_ENFORCEMENT',
    'PIPELINE_SUBAGENTSTOP_ENFORCEMENT', 'PIPELINE_HMAC_STRICT',
    'PIPELINE_DISPATCH_INLINE_ENFORCEMENT']) {
    delete base[k];
  }
  return spawnSync(process.execPath, [path.join(overlay, hookRel)], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...base, PIPELINE_HMAC_SECRET: process.env.PIPELINE_HMAC_SECRET, ...(envExtra || {}) },
  });
}

// Parse a PreToolUse hook result into { deny, reason }.
function armGateVerdict(r) {
  let out;
  try { out = JSON.parse(r.stdout || '{}'); } catch { return { deny: false, reason: '' }; }
  const hso = out && out.hookSpecificOutput;
  if (hso && hso.permissionDecision === 'deny') return { deny: true, reason: String(hso.permissionDecisionReason || '') };
  return { deny: false, reason: '' };
}

// Parse a Stop-family hook result into its `decision` string (block | allow | undefined).
function stopDecision(r) {
  try { return JSON.parse(r.stdout || '{}').decision; } catch { return undefined; }
}

// Make the signed-state ATOMIC REWRITE fail while plain READS keep working — the exact
// shape of the "prisão sem saída" stop-trap (2026-07-02 hook audit). persist() does
// tmp-write + renameSync(tmp, state):
//   - Windows: renameSync over a READ-ONLY target throws EPERM → chmod the file.
//   - POSIX: a READ-ONLY DIRECTORY makes the tmp writeFileSync throw EACCES.
// Probe on a sacrificial file so the real state is never clobbered. Returns
// { restore, effective }; `effective:false` when the platform ignores the trap (root:
// chmod bits are inert) — the scenario then SKIPs rather than false-failing.
// Copied verbatim in shape from tests/regression/v8.20.0/F1_stop_trap_failopen.cjs.
function makeStateUnwritable(statePath) {
  const dir = path.dirname(statePath);
  const probe = path.join(dir, 'unwritable-probe.json');
  fs.writeFileSync(probe, 'p');
  fs.chmodSync(probe, 0o444);
  const probeTmp = `${probe}.tmp`;
  fs.writeFileSync(probeTmp, 'q');
  let renameOverReadonlyFails = false;
  try { fs.renameSync(probeTmp, probe); } catch { renameOverReadonlyFails = true; try { fs.unlinkSync(probeTmp); } catch { /* */ } }
  try { fs.chmodSync(probe, 0o666); fs.unlinkSync(probe); } catch { /* */ }

  if (renameOverReadonlyFails) {
    fs.chmodSync(statePath, 0o444);
    return { restore: () => { try { fs.chmodSync(statePath, 0o666); } catch { /* */ } }, effective: true };
  }
  fs.chmodSync(dir, 0o555);
  let effective = true;
  try {
    const rootProbe = path.join(dir, 'root-probe.tmp');
    fs.writeFileSync(rootProbe, 'r');
    fs.unlinkSync(rootProbe);
    effective = false; // write inside the "read-only" dir still succeeded → root → inert
  } catch { /* write really blocked → trap effective */ }
  return { restore: () => { try { fs.chmodSync(dir, 0o755); } catch { /* */ } }, effective };
}

// -----------------------------------------------------------------------------
// Scenario harness plumbing.
// -----------------------------------------------------------------------------
let pass = 0, fail = 0, skipped = 0;
const failed = [];

function scenario(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

function skipScenario(name, note) {
  console.log(`  [SKIP] ${name} — ${note}`);
  skipped++;
}

// Run one scenario's whole dual-run in isolation. A throw that escapes the scenario's own
// setup (e.g. buildOverlay: a missing git ref or the teeth-sanity assert) is contained HERE
// so it kills ONLY this scenario, not the whole file — the remaining scenarios still run.
// Infrastructure-unavailable throws (`.skip`) become a [SKIP]; every other throw becomes a
// genuine [FAIL] (counted → non-zero exit at the end). Behavioural asserts inside the
// scenario keep flowing through scenario()/skipScenario() as before.
function runScenarioSafely(label, fn) {
  try {
    fn();
  } catch (e) {
    if (e && e.skip) {
      skipScenario(label, `infrastructure unavailable — ${e.message}`);
    } else {
      console.log(`  [FAIL] ${label}\n         ${e && e.message ? e.message : e}`);
      fail++;
      failed.push(label);
    }
  }
}

// =============================================================================
// Scenario 1 — orphan arming marker must not deadlock the next task.
// =============================================================================
// STORY (Given/When/Then):
//   GIVEN a code-mutating pipeline run armed the session (a live pipeline-arm-pending
//         marker on disk, stamped with this session) and then closed DELIBERATELY
//         (an inactive/terminal Stop),
//   WHEN  the very next non-pipeline task (a Bash command) is attempted in the SAME
//         session with no pipeline actually active,
//   THEN  that task must NOT be blocked — the marker must have been consumed on the
//         clean close (or, if genuinely abandoned, expire on its own TTL).
//
// TARGET FILE (the one file reverted for the pre-fix overlay): the Stop-event terminal
// owner .claude/hooks/stop-gate-hook.cjs. The v8.19.1 fix added the marker-consume calls
// (closeArmMarker → lib/pipeline-arm.cjs::clearArmPendingForSession) there. Reverting that
// single file removes every consume call, so the marker lingers → the arm-gate (unchanged,
// HEAD in both halves) then denies the next task with PIPELINE_NOT_ARMED = the historical
// deadlock.
//
// SESSION NOTE (why same-session, not "a new session"): session isolation (v8.18.0)
// already fail-opens a marker owned by a DIFFERENT session, so a cross-session replay
// would NOT reproduce the deadlock against pre-fix code — it would be a vacuous RED. The
// genuine deadlock the fix repaired is the SAME-session lingering marker, so the marker,
// the Stop close and the next task all carry session 'S'. This is the only shape with
// RED teeth. (Documented in 06-pre-tester.md.)
const SCENARIO_1 = {
  targetRel: '.claude/hooks/stop-gate-hook.cjs',
  // v8.19.1 — "consume arm-marker on deliberate run close (deadlock fix)".
  fixCommit: 'a421710d7dea1875982c5ca267985597acb12b16',
  stopHookRel: '.claude/hooks/stop-gate-hook.cjs',
  armGateRel: '.claude/hooks/pipeline-arm-gate.cjs',
  session: 'session-S',
};

// Run one half of scenario 1 against a given overlay. Returns observed facts.
function playScenario1(overlay) {
  const root = makeProjectRoot('s1');
  try {
    const { docDir } = seedInactiveRun(root);
    const markerPath = seedArmMarker(root, SCENARIO_1.session);

    // Step A — the prior run closes deliberately (Stop event, same session).
    const stop = runHook(overlay, SCENARIO_1.stopHookRel,
      { hook_event_name: 'Stop', cwd: root, session_id: SCENARIO_1.session },
      { PIPELINE_DOC_PATH: docDir });
    assert.equal(stop.status, 0, `stop-gate hook crashed: ${stop.stderr || stop.status}`);
    const markerSurvivedClose = fs.existsSync(markerPath);

    // Step B — the next non-pipeline task (Bash) in the SAME session.
    const arm = runHook(overlay, SCENARIO_1.armGateRel, {
      hook_event_name: 'PreToolUse', tool_name: 'Bash',
      tool_input: { command: 'echo next-task' }, cwd: root, session_id: SCENARIO_1.session,
    }, { PIPELINE_DOC_PATH: docDir });
    assert.equal(arm.status, 0, `arm-gate hook crashed: ${arm.stderr || arm.status}`);
    const verdict = armGateVerdict(arm);

    return {
      markerSurvivedClose,
      nextTaskBlocked: verdict.deny,
      notArmedReason: /NOT_ARMED/.test(verdict.reason),
    };
  } finally {
    cleanup(root);
  }
}

function runScenario1() {
  let preFixOverlay = null, headOverlay = null;
  try {
    preFixOverlay = buildOverlay('s1-red', SCENARIO_1.targetRel, `${SCENARIO_1.fixCommit}^`);
    headOverlay = buildOverlay('s1-green', null, null);
    // ---- RED half (pre-fix overlay): the deadlock MUST reproduce -------------
    scenario('S1-RED [pre-fix overlay] orphan marker lingers and deadlocks the next task', () => {
      const red = playScenario1(preFixOverlay);
      assert.equal(red.markerSurvivedClose, true,
        'pre-fix stop-gate does NOT consume the marker → it must still be on disk after a clean close');
      assert.equal(red.nextTaskBlocked, true,
        'pre-fix: the next task must be BLOCKED (the historical deadlock)');
      assert.equal(red.notArmedReason, true,
        'pre-fix: the block must be PIPELINE_NOT_ARMED (the orphan-marker deadlock, not another cause)');
    });

    // ---- GREEN half (HEAD overlay): the fix holds ---------------------------
    scenario('S1-GREEN [HEAD overlay] marker consumed on close, next task not blocked', () => {
      const green = playScenario1(headOverlay);
      assert.equal(green.markerSurvivedClose, false,
        'HEAD: a deliberate close must CONSUME the same-session marker');
      assert.equal(green.nextTaskBlocked, false,
        'HEAD: with the marker gone, the next task must NOT be blocked (no deadlock)');
    });
  } finally {
    cleanup(preFixOverlay);
    cleanup(headOverlay);
  }
}

// =============================================================================
// Scenario 2 — fail-open stop-trap: an impersistible continuity counter must
//              FAIL OPEN, never block the teardown forever.
// =============================================================================
// STORY (Given/When/Then):
//   GIVEN an armed, active, incomplete pipeline run whose signed sentinel-state
//         CANNOT be rewritten (a read-only file/dir — signer commit fails at write),
//   WHEN  the session tries to close (a Stop event) and the Stop gate wants to bump
//         the continuity counter toward its 3-cap to convert the block into a terminal,
//   THEN  because the counter can never advance, the cap can never fire; the gate MUST
//         fail OPEN (allow, with a breadcrumb) instead of blocking every teardown
//         indefinitely. The only pre-fix exits were an env escape or a session restart.
//
// TARGET FILE: .claude/hooks/stop-gate-hook.cjs — the v8.20.0 fix made persist()/
// withSignedState() report real commit success and each block call site fail-open when
// the counter bump could not be persisted. Reverting that single file restores the trap.
//
// PLATFORM NOTE: the trap is simulated with chmod (read-only file/dir). Under root, chmod
// bits are inert (CI containers) — the scenario SKIPs rather than false-failing. This
// harness runs as a non-root uid, so the trap is effective here.
const SCENARIO_2 = {
  targetRel: '.claude/hooks/stop-gate-hook.cjs',
  // v8.20.0 — "enforcement unblocking pack — stop-trap fail-open …".
  fixCommit: 'c723ac4c7c4de4b1326a0fbaf72ee20c96c57114',
  stopHookRel: '.claude/hooks/stop-gate-hook.cjs',
};

// Run one half of scenario 2 against a given overlay. Applies the unwritable-state trap,
// invokes the Stop gate, and returns { decision, skip }. `skip:true` when the platform
// cannot simulate the trap (root). Restores permissions before cleanup.
function playScenario2(overlay) {
  const root = makeProjectRoot('s2');
  let restore = null;
  try {
    const { docDir, statePath } = seedActiveIncompleteRun(root);
    const trap = makeStateUnwritable(statePath);
    restore = trap.restore;
    if (!trap.effective) return { skip: true };

    const stop = runHook(overlay, SCENARIO_2.stopHookRel,
      { hook_event_name: 'Stop', cwd: root }, { PIPELINE_DOC_PATH: docDir });
    assert.equal(stop.status, 0, `stop-gate hook crashed: ${stop.stderr || stop.status}`);
    return { decision: stopDecision(stop) };
  } finally {
    if (restore) { try { restore(); } catch { /* */ } }
    cleanup(root);
  }
}

function runScenario2() {
  let preFixOverlay = null, headOverlay = null;
  try {
    preFixOverlay = buildOverlay('s2-red', SCENARIO_2.targetRel, `${SCENARIO_2.fixCommit}^`);
    headOverlay = buildOverlay('s2-green', null, null);
    // Probe once for platform capability, so RED and GREEN skip together (never a
    // half-scenario that lies about teeth).
    const redProbe = playScenario2(preFixOverlay);
    if (redProbe.skip) {
      skipScenario('S2-RED [pre-fix overlay] unpersistable counter blocks forever',
        'unwritable-state trap not simulable on this platform (root: chmod inert)');
      skipScenario('S2-GREEN [HEAD overlay] unpersistable counter fails open',
        'unwritable-state trap not simulable on this platform (root: chmod inert)');
      return;
    }

    // ---- RED half (pre-fix overlay): the infinite block MUST reproduce -------
    scenario('S2-RED [pre-fix overlay] unpersistable continuity counter blocks the teardown forever', () => {
      assert.equal(redProbe.decision, 'block',
        'pre-fix: the counter never persists → the cap never fires → the Stop gate blocks (the deadlock)');
    });

    // ---- GREEN half (HEAD overlay): the fix holds (fail OPEN) ----------------
    scenario('S2-GREEN [HEAD overlay] unpersistable continuity counter fails OPEN (allow)', () => {
      const green = playScenario2(headOverlay);
      if (green.skip) throw new Error('trap became ineffective mid-scenario — cannot assert GREEN');
      assert.notEqual(green.decision, 'block',
        'HEAD: with the counter impersistible the gate must fail OPEN (allow), never an infinite block');
    });
  } finally {
    cleanup(preFixOverlay);
    cleanup(headOverlay);
  }
}

// =============================================================================
// Scenario 3 — plan deadlock: the Plan-Mode lock must NOT block writing the plan
//              file itself.
// =============================================================================
// STORY (Given/When/Then):
//   GIVEN an armed MEDIA/COMPLEXA run in Phase 1.5 whose deterministic Plan-Mode gate
//         blocks production writes until the plan is approved,
//   WHEN  the agent writes the Plan-Mode plan file itself (in ~/.claude/plans or
//         $CLAUDE_CONFIG_DIR/plans) — which happens DURING planning, before approval,
//   THEN  that write must be ALLOWED (exempt like .pipeline/), else the gate deadlocks
//         Plan Mode in every real pipeline run. Production code stays blocked (narrow).
//
// TARGET FILE: .claude/hooks/edit-guard-hook.cjs — the v8.2.1 fix added isPlanFile/
// isExemptPath so the plan directory is exempt. Reverting that single file (to v8.2.0)
// restores the deadlock: the plan file is treated as ordinary production code → blocked.
const SCENARIO_3 = {
  targetRel: '.claude/hooks/edit-guard-hook.cjs',
  // v8.2.1 — "Plan-Mode gate deadlocked Plan Mode (plan file blocked)".
  fixCommit: 'ea5ca4875d6933a543b714f774e6da62fa0393a8',
  editGuardRel: '.claude/hooks/edit-guard-hook.cjs',
};

// Seed an armed Phase-1.5 run (unsigned state, mirroring the v8.2.1 exemption test).
function seedArmedPlanRun(root) {
  const runDir = path.join(root, '.pipeline', 'docs', 'Pre-Heavy-action', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify({
    schema_version: 2, run_id: 'run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '1.5',
    phase_1_5_plan: { required: true, executed: false, approved: false, decision: null, approved_at: null },
  }, null, 2));
}

// Run one half of scenario 3: invoke the edit-guard on a Write to `filePath`.
function playScenario3(overlay, filePath) {
  const root = makeProjectRoot('s3');
  try {
    seedArmedPlanRun(root);
    const r = runHook(overlay, SCENARIO_3.editGuardRel, {
      hook_event_name: 'PreToolUse', tool_name: 'Write',
      tool_input: { file_path: filePath.replace('<ROOT>', root) }, cwd: root,
    });
    assert.equal(r.status, 0, `edit-guard hook crashed: ${r.stderr || r.status}`);
    return armGateVerdict(r);
  } finally {
    cleanup(root);
  }
}

function runScenario3() {
  const planFile = path.join('<ROOT>', '.claude', 'plans', 'my-plan.md');
  const prodFile = path.join('<ROOT>', 'src', 'foo.cjs');
  let preFixOverlay = null, headOverlay = null;
  try {
    preFixOverlay = buildOverlay('s3-red', SCENARIO_3.targetRel, `${SCENARIO_3.fixCommit}^`);
    headOverlay = buildOverlay('s3-green', null, null);
    // ---- RED half (pre-fix overlay): the plan-file write MUST be blocked -----
    scenario('S3-RED [pre-fix overlay] Plan-Mode lock blocks writing the plan file (deadlock)', () => {
      const red = playScenario3(preFixOverlay, planFile);
      assert.equal(red.deny, true,
        'pre-fix: the plan file is treated as production code → Plan Mode is deadlocked (block)');
    });

    // ---- GREEN half (HEAD overlay): plan file exempt, production still blocked
    scenario('S3-GREEN [HEAD overlay] plan file exempt (allow) while production code still blocked', () => {
      const green = playScenario3(headOverlay, planFile);
      assert.equal(green.deny, false,
        'HEAD: the plan file must be exempt so Plan Mode can write the plan (no deadlock)');
      // Narrow-exemption guard: the exemption must NOT leak to production code.
      const guard = playScenario3(headOverlay, prodFile);
      assert.equal(guard.deny, true,
        'HEAD: a production-code write under the armed plan gate must STILL be blocked (exemption is plan-file only)');
    });
  } finally {
    cleanup(preFixOverlay);
    cleanup(headOverlay);
  }
}

// =============================================================================
// Scenario 4 — pending-dispatch deadlock: a genuinely-dispatched target must
//              exempt the subagent's own Bash.
// =============================================================================
// STORY (Given/When/Then):
//   GIVEN a live DISPATCH_REQUEST pending_block whose target subagent was GENUINELY
//         spawned (dispatch-record-hook persisted pending_dispatches[…] with a matching
//         subagent_type and created_at >= the request's emitted_at),
//   WHEN  work (a Bash command) is attempted — subagents share the parent session, so
//         the session-wide pending lock also covers the dispatched subagent's OWN work
//         and the exec-window open script that is the designed way out,
//   THEN  the pending-dispatch gate must NOT deny it (the request is satisfied by the
//         spawn). The gate STILL blocks between REQUEST and spawn, and a spawn of a
//         DIFFERENT/older target does NOT satisfy the request (narrow exemption).
//
// TARGET FILE: .claude/hooks/edit-guard-hook.cjs — the SSOT predicate findLivePendingBlock
// gained the already-dispatched exemption across TWO companion commits (T1 c9f6207 +
// next-action-contract Batch 3 wiring). Reverting the file to BEFORE the earlier of the
// two (c9f6207^) removes the whole exemption, so findLivePendingBlock reports the block
// as live → dispatch-pending-gate (HEAD, requiring the reverted edit-guard) denies Bash.
const SCENARIO_4 = {
  targetRel: '.claude/hooks/edit-guard-hook.cjs',
  // v8.22.0 T1 — "isenção 'já despachado' no predicado de pendência viva" (earlier of the
  // 2 companion commits; c9f6207^ predates both, reverting the whole exemption).
  fixCommit: 'c9f62073b8f4ea2bc5404fe2f64cc89969824691',
  gateRel: '.claude/hooks/dispatch-pending-gate.cjs',
  executor: 'pipeline-orchestrator:executor:executor-controller',
  otherAgent: 'pipeline-orchestrator:quality:plan-architect',
};

function isoAge(ms) { return new Date(Date.now() - ms).toISOString(); }

// Seed a live (mtime-discovery, unsigned → not corrupt) state carrying a DISPATCH_REQUEST
// pending_block and, optionally, a spawn record for `recordAgent` at `recordAgeMs`.
// Mirrors tests/regression/v8.22.0/F1 setupLive/pendingRequest/spawnRecord.
function seedPendingDispatchRun(root, opts) {
  const runDir = path.join(root, '.pipeline', 'docs', 'Pre-Heavy-action', '2026-07-04-run');
  fs.mkdirSync(runDir, { recursive: true });
  const state = {
    schema_version: 1, run_id: '2026-07-04-run', pipeline_doc_path: runDir,
    pipeline_active: true, current_phase: '2',
    pending_blocks: [{
      block_type: 'DISPATCH_REQUEST',
      dispatch_id: 'phase-2-executor-controller',
      emitted_at: isoAge(60_000),
    }],
  };
  if (opts && opts.recordAgent) {
    state.pending_dispatches = {
      toolu_h1_test: {
        dispatch_id: 'toolu_h1_test',
        run_id: '2026-07-04-run',
        subagent_type: opts.recordAgent,
        target_agent_type: opts.recordAgent,
        agent_type: opts.recordAgent,
        status: 'pending',
        correction_attempts: 0,
        created_at: isoAge(opts.recordAgeMs),
      },
    };
  }
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(state, null, 2));
}

// Run one half of scenario 4: invoke the REAL dispatch-pending-gate on a Bash command
// against a state seeded per `opts`. Returns { deny }.
function playScenario4(overlay, opts) {
  const root = makeProjectRoot('s4');
  try {
    seedPendingDispatchRun(root, opts);
    const r = runHook(overlay, SCENARIO_4.gateRel, {
      hook_event_name: 'PreToolUse', tool_name: 'Bash',
      tool_input: { command: 'node scripts/run-tests.cjs' }, cwd: root,
    });
    assert.equal(r.status, 0, `dispatch-pending-gate crashed: ${r.stderr || r.status}`);
    return armGateVerdict(r);
  } finally {
    cleanup(root);
  }
}

function runScenario4() {
  // The 2026-07-04 repro: request 60s old, matching target genuinely spawned 30s ago.
  const dispatched = { recordAgent: SCENARIO_4.executor, recordAgeMs: 30_000 };
  let preFixOverlay = null, headOverlay = null;
  try {
    preFixOverlay = buildOverlay('s4-red', SCENARIO_4.targetRel, `${SCENARIO_4.fixCommit}^`);
    headOverlay = buildOverlay('s4-green', null, null);
    // ---- RED half (pre-fix overlay): the dispatched subagent is deadlocked ---
    scenario('S4-RED [pre-fix overlay] dispatched subagent Bash denied by the live pending lock (deadlock)', () => {
      const red = playScenario4(preFixOverlay, dispatched);
      assert.equal(red.deny, true,
        'pre-fix: the pending lock stays live after the spawn → the subagent\'s own Bash is DENIED (the deadlock)');
    });

    // ---- GREEN half (HEAD overlay): exemption holds, block-side preserved ----
    scenario('S4-GREEN [HEAD overlay] genuinely-dispatched target exempts Bash while pre-spawn/wrong-target still block', () => {
      const green = playScenario4(headOverlay, dispatched);
      assert.equal(green.deny, false,
        'HEAD: a genuinely-dispatched target satisfies the request → Bash must NOT be denied (no deadlock)');
      // Narrow-exemption guards: the block-side must survive at HEAD.
      const preSpawn = playScenario4(headOverlay, null); // no spawn record yet
      assert.equal(preSpawn.deny, true,
        'HEAD: between REQUEST and spawn (no record) the gate must STILL deny (lock preserved)');
      const wrongTarget = playScenario4(headOverlay, { recordAgent: SCENARIO_4.otherAgent, recordAgeMs: 30_000 });
      assert.equal(wrongTarget.deny, true,
        'HEAD: a spawn of a DIFFERENT agent must NOT satisfy the request → Bash still denied (exemption is target-scoped)');
    });
  } finally {
    cleanup(preFixOverlay);
    cleanup(headOverlay);
  }
}

// =============================================================================
// Scenario 5 — phantom CONTINUE run: a CONTINUE cited in subagent prose must NOT
//              arm a live phantom run.
// =============================================================================
// STORY (Given/When/Then):
//   GIVEN a UserPromptSubmit turn whose ONLY /pipeline invocation is QUOTED inside a
//         <teammate-message>/<agent-message> envelope (a subagent report echoing a
//         "/pipeline … continue" recommendation — not a genuine user command),
//   WHEN  the arm-writer classifies the prompt to decide whether to arm the pipeline,
//   THEN  it must NOT write an arm-pending marker (a phantom CONTINUE arm bricks
//         Bash/PowerShell/Agent for the whole session until the TTL). A genuine user
//         invocation still arms (positional model preserved).
//
// TARGET FILE: lib/pipeline-arm.cjs — the v8.20.0 fix added teammate-message +
// agent-message to HARNESS_OPEN_TAG so userPromptSegment cuts the prompt at the envelope
// opening tag, keeping the quoted command out of the classifier. Reverting that single
// lib file lets the quoted command leak → the arm-writer arms workflow=CONTINUE.
// The behaviour under test is exercised through the REAL UserPromptSubmit hook executable
// (pipeline-arm-writer.cjs, HEAD in both halves), which require()s the reverted lib.
const SCENARIO_5 = {
  targetRel: 'lib/pipeline-arm.cjs',
  // v8.20.0 — "…teammate-envelope no-arm…".
  fixCommit: 'c723ac4c7c4de4b1326a0fbaf72ee20c96c57114',
  armWriterRel: '.claude/hooks/pipeline-arm-writer.cjs',
  session: 'session-S',
  // The subagent-report shape: the ONLY /pipeline command is quoted INSIDE the envelope.
  teammatePrompt:
    '<teammate-message teammate_id="hook-auditor" color="green">\n' +
    '{"type":"idle_notification","from":"hook-auditor"}\n' +
    'Relatorio do subagente: recomendo `/pipeline-orchestrator:pipeline continue` para seguir.\n' +
    '</teammate-message>',
  // A genuine user invocation (no envelope) — the arm MUST still fire (positional guard).
  genuinePrompt: '/pipeline-orchestrator:pipeline conserte o bug do login',
};

// Run scenario 5 against an overlay with a given prompt. Returns { armed, workflow }.
function playScenario5(overlay, prompt) {
  const root = makeProjectRoot('s5');
  try {
    fs.mkdirSync(path.join(root, '.pipeline'), { recursive: true });
    const r = runHook(overlay, SCENARIO_5.armWriterRel,
      { hook_event_name: 'UserPromptSubmit', prompt, cwd: root, session_id: SCENARIO_5.session });
    assert.equal(r.status, 0, `arm-writer hook crashed: ${r.stderr || r.status}`);
    const markerPath = path.join(root, '.pipeline', 'pipeline-arm-pending.json');
    const armed = fs.existsSync(markerPath);
    let workflow = null;
    if (armed) { try { workflow = JSON.parse(fs.readFileSync(markerPath, 'utf8')).workflow; } catch { /* */ } }
    return { armed, workflow };
  } finally {
    cleanup(root);
  }
}

function runScenario5() {
  let preFixOverlay = null, headOverlay = null;
  try {
    preFixOverlay = buildOverlay('s5-red', SCENARIO_5.targetRel, `${SCENARIO_5.fixCommit}^`);
    headOverlay = buildOverlay('s5-green', null, null);
    // ---- RED half (pre-fix overlay): the phantom arm MUST reproduce ----------
    scenario('S5-RED [pre-fix overlay] quoted CONTINUE in a teammate envelope arms a phantom run (deadlock)', () => {
      const red = playScenario5(preFixOverlay, SCENARIO_5.teammatePrompt);
      assert.equal(red.armed, true,
        'pre-fix: the quoted command leaks past HARNESS_OPEN_TAG → a phantom arm-pending marker is written (the deadlock)');
    });

    // ---- GREEN half (HEAD overlay): no phantom arm, genuine invocation intact
    scenario('S5-GREEN [HEAD overlay] quoted CONTINUE does NOT arm while a genuine invocation still arms', () => {
      const green = playScenario5(headOverlay, SCENARIO_5.teammatePrompt);
      assert.equal(green.armed, false,
        'HEAD: userPromptSegment cuts at the envelope → no phantom CONTINUE arm (no deadlock)');
      // Positional guard: a real user /pipeline invocation must STILL arm.
      const genuine = playScenario5(headOverlay, SCENARIO_5.genuinePrompt);
      assert.equal(genuine.armed, true,
        'HEAD: a genuine user invocation (no envelope) must STILL arm (the fix is envelope-scoped, not a blanket no-arm)');
    });
  } finally {
    cleanup(preFixOverlay);
    cleanup(headOverlay);
  }
}

// =============================================================================
// Driver.
// =============================================================================
console.log('=== H1 v8.28.0 — Session deadlock harness (S7 / DeadlockHarness) ===');
console.log('--- Scenario 1: orphan arming marker (dual-run overlay) ---');
runScenarioSafely('Scenario 1 setup (orphan arming marker)', runScenario1);
console.log('--- Scenario 2: fail-open stop-trap (dual-run overlay) ---');
runScenarioSafely('Scenario 2 setup (fail-open stop-trap)', runScenario2);
console.log('--- Scenario 3: plan deadlock (dual-run overlay) ---');
runScenarioSafely('Scenario 3 setup (plan deadlock)', runScenario3);
console.log('--- Scenario 4: pending-dispatch deadlock (dual-run overlay) ---');
runScenarioSafely('Scenario 4 setup (pending-dispatch deadlock)', runScenario4);
console.log('--- Scenario 5: phantom CONTINUE run (dual-run overlay) ---');
runScenarioSafely('Scenario 5 setup (phantom CONTINUE run)', runScenario5);

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${skipped} skipped / ${pass + fail + skipped} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
