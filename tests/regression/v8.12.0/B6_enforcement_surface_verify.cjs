#!/usr/bin/env node
'use strict';

// =============================================================================
// B6 (v8.12.0) — SPEC 006 Batch 6 — ASSURANCE: load-time self-verification of
// the enforcement surface (RED, TDD). Spec 006-enforcement-fail-closed-arming.
// Run: 2026-06-23-spec006-batch4-7.
// Evidence: .pipeline/docs/Pre-Complexa-action/2026-06-23-spec006-batch4-7/
//           06-batch6-tdd-scenarios.md (6 USER-APPROVED scenarios).
// =============================================================================
// WHAT THIS LOCKS. A NEW SessionStart OBSERVER hook
//   .claude/hooks/enforcement-surface-verify-hook.cjs
// that, at load time, self-verifies the enforcement surface is present:
//   - banner present  = a SessionStart type:"prompt" entry exists in hooks/hooks.json
//                       (plugin root resolved from the hook's own module location);
//   - gates loadable  = a pinned set of PreToolUse gate hook files exist on disk
//                       AND core enforcement lib modules are require-able
//                       (pipeline-arm-gate.cjs + lib/pipeline-arm.cjs +
//                        lib/step-ledger.cjs + lib/corrective-dispatch.cjs +
//                        lib/sentinel-state-signer.cjs);
//   - plugin present  = the hook's own plugin root resolves AND
//                       .claude-plugin/plugin.json is found there; ABSENT otherwise.
//
// BEHAVIOR (the 6 approved scenarios):
//   S1 surface present                            -> SILENT pass (no event, no
//                                                    block, continue, exit 0).
//   S2 surface missing + plugin present + WARN    -> emit EXACTLY ONE
//      (default / non-strict)                       ENFORCEMENT_SURFACE_UNVERIFIED
//                                                    to protocol-events.jsonl, NO
//                                                    block, continue, exit 0.
//   S3 plugin ABSENT                              -> warn-at-most, NEVER block,
//      (strict OR non-strict)                       even under strict; continue, exit 0.
//   S4 plugin present + gates missing + STRICT    -> BLOCK governed work (the ONLY
//      (PIPELINE_ENFORCEMENT_SURFACE_ENFORCEMENT=    block path) + record an
//       deny)                                        ENFORCEMENT_SURFACE_UNVERIFIED;
//                                                    scoped to substantive governed
//                                                    work (mirror the arm-gate
//                                                    ALWAYS_ALLOW carve-out).
//   S5 malformed/empty/missing payload            -> safe no-op (continue, exit 0,
//                                                    never throws, no fabricated block).
//   S6 real-process SessionStart smoke            -> registered under SessionStart
//                                                    in hooks/hooks.json; degraded
//                                                    run exits 0 + writes exactly one
//                                                    ENFORCEMENT_SURFACE_UNVERIFIED;
//                                                    healthy run exits 0 + writes none.
//
// ----------------------------------------------------------------------------
// CONTRACT THE GREEN IMPLEMENTER MUST SATISFY (pinned here, RED until built).
//
//   FILE — .claude/hooks/enforcement-surface-verify-hook.cjs (MUST be created).
//
//   PURE DECISION (the unit-testable brain S1-S5 call directly, NO I/O):
//     decideSurfaceVerify(ctx) -> {
//         decision:  'continue' | 'block',   // 'block' ONLY in the S4 strict path
//         warn:      boolean,                 // true IFF an ENFORCEMENT_SURFACE_UNVERIFIED
//                                             //   should be recorded (S2 + S4)
//         reason?:   string,                  // human-readable, names what is missing
//                                             //   (printable-ASCII, length-capped)
//         missing?:  string[],               // which surface pieces are absent
//       }
//     ctx = { bannerPresent:boolean, gatesLoadable:boolean, pluginPresent:boolean,
//             strict:boolean }
//
//   DECISION TABLE decideSurfaceVerify MUST honor:
//     bannerPresent && gatesLoadable  -> { decision:'continue', warn:false }   (S1 silent)
//     surface degraded + !pluginPresent -> { decision:'continue', warn:?? }     (S3 NEVER block)
//          (plugin absent is a legitimate uninstalled checkout; strict is IGNORED)
//     surface degraded + pluginPresent + !strict -> { decision:'continue', warn:true } (S2 WARN)
//     surface degraded + pluginPresent +  strict -> { decision:'block', warn:true }    (S4 BLOCK)
//
//   I/O PROBE + RECORDING (exercised by S6 real-process):
//     handleSessionStart(payload) reads the manifest + probes the surface, calls
//     decideSurfaceVerify, and on warn===true records EXACTLY ONE
//     ENFORCEMENT_SURFACE_UNVERIFIED line to protocol-events.jsonl via the
//     appendProtocolEvent idiom (canonical 'ts' key, decided_by naming this hook,
//     newline-stripped + length-capped detail, NEVER throws). It MUST be safe by
//     construction: malformed/empty/missing payload OR unreadable surrounding
//     files -> safe no-op, NEVER throws, NEVER fabricates a block from inability
//     to read. ALWAYS exit 0.
//
//   SESSIONSTART-BLOCK CONTRACT (the S4 GAP — RESOLVED with file evidence):
//     A SessionStart hook in THIS harness CANNOT deny. Both shipped SessionStart
//     hooks confirm it: pipeline-session-arm-hook.cjs (header: "SessionStart
//     CANNOT deny — this hook only WRITES the deterministic state the PreToolUse
//     arm-gate enforces") and cleanup-orphan-sentinel-state-hook.cjs (only writes
//     /archives, never denies). So the S4 BLOCK is NOT a SessionStart deny: the
//     decision brain RETURNS decision:'block' (the verdict the GREEN code records
//     as signed state for a PreToolUse consumer to enforce, EXACTLY the arm-gate
//     precedent). This test pins the BLOCK *verdict* from the pure brain (the
//     deterministic, harness-independent contract); whichever consumer the GREEN
//     implementer wires to actually stop work mirrors lib/pipeline-arm.cjs ->
//     pipeline-arm-gate.cjs. The pure brain is the SSOT the test binds to so S4
//     is provable without depending on the harness's SessionStart decision shape.
//
//   STRICT-MODE ENV VAR (RATIFIED): PIPELINE_ENFORCEMENT_SURFACE_ENFORCEMENT,
//     default = warn-only; '=deny' enables the block path (mirrors
//     PIPELINE_PARALLEL_ENFORCEMENT — warn-first, =deny blocks). The pure brain
//     takes `strict` as a boolean; handleSessionStart derives it from the env var.
//
//   EVENT: ENFORCEMENT_SURFACE_UNVERIFIED — AUDIT/WARN class, protocol-events.jsonl
//     ONLY (NOT a gate-decisions.jsonl row, NOT a new Mandatory/Registry gate).
// ----------------------------------------------------------------------------
//
// EXPECTED RED REASON: .claude/hooks/enforcement-surface-verify-hook.cjs does NOT
// exist yet. The optional require() yields an empty stub {}, so the unit
// assertions (S1-S5) fail on the MISSING decideSurfaceVerify / handleSessionStart
// exports — clean assertion failures, NOT harness/syntax/import crashes. S6's
// real-process spawn + the hooks/hooks.json SessionStart registration also fail
// RED until Batch 6 GREEN creates the hook and registers it third under SessionStart.
// =============================================================================

process.env.PIPELINE_HMAC_SECRET = 'b6-enforcement-surface-verify-stable-secret-0123456789ab';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK_PATH = path.join(ROOT, '.claude/hooks/enforcement-surface-verify-hook.cjs');
const HOOKS_JSON = path.join(ROOT, 'hooks/hooks.json');

const EVENTS_REL = 'protocol-events.jsonl';
const EVENT_NAME = 'ENFORCEMENT_SURFACE_UNVERIFIED';
const STRICT_ENV = 'PIPELINE_ENFORCEMENT_SURFACE_ENFORCEMENT';
// SEC (ESV-1): the injected `surface`/`pluginPresent` payload fields are a
// production BACKDOOR and are honored by the hook ONLY when this explicit opt-in
// env discriminator is '1'. The I/O-path checks below (S1b/S2b/S3c/S4c/S6) inject
// those fields to simulate a degraded/absent surface without mutating the real
// repo, so they must set this env. The pure-brain unit checks (which call
// decideSurfaceVerify directly) do NOT inject payload fields and do NOT need it.
const TEST_INJECT_ENV = 'PIPELINE_ENFORCEMENT_SURFACE_TEST_INJECT';

// The hook under construction (Batch 6 GREEN will create it). Optional require so a
// missing file degrades to an empty stub — assertions then fail on the missing
// exports (a clean RED), never an uncaught require() crash.
let hook = null;
try { hook = require(HOOK_PATH); } catch { hook = {}; }

// ---- ctx builders for the pure decision brain (S1-S5 unit-level) ------------
// A HEALTHY surface: banner present + gates loadable + plugin present.
function healthyCtx(over = {}) {
  return { bannerPresent: true, gatesLoadable: true, pluginPresent: true, strict: false, ...over };
}
// A DEGRADED surface: something is missing. Plugin presence + strict vary per scenario.
function degradedCtx(over = {}) {
  return { bannerPresent: true, gatesLoadable: false, pluginPresent: true, strict: false, ...over };
}

// ---- protocol-events helpers ------------------------------------------------
function readEvents(cwd) {
  const p = path.join(cwd, EVENTS_REL);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
}
function surfaceEventLines(cwd) {
  return readEvents(cwd)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e && e.event === EVENT_NAME);
}

let pass = 0, fail = 0; const failed = [];
function check(name, fn) {
  let tmp;
  try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b6-')); fn(tmp); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
  finally { if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} } }
}
function unit(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

// Per-test env management: the brain takes `strict` as a boolean, but
// handleSessionStart derives strict from STRICT_ENV. Keep both clean per test.
function withStrictEnv(value, fn) {
  const prev = process.env[STRICT_ENV];
  try {
    if (value === undefined) delete process.env[STRICT_ENV];
    else process.env[STRICT_ENV] = value;
    return fn();
  } finally {
    if (prev === undefined) delete process.env[STRICT_ENV];
    else process.env[STRICT_ENV] = prev;
  }
}

// SEC (ESV-1) ADDITIVE: scope the test-inject opt-in to exactly the checks that
// inject `surface`/`pluginPresent` payload fields, mirroring withStrictEnv's
// set-then-restore discipline. Additive only — does not change any assertion.
function withInjectEnv(fn) {
  const prev = process.env[TEST_INJECT_ENV];
  try {
    process.env[TEST_INJECT_ENV] = '1';
    return fn();
  } finally {
    if (prev === undefined) delete process.env[TEST_INJECT_ENV];
    else process.env[TEST_INJECT_ENV] = prev;
  }
}

console.log('=== B6 v8.12.0 — enforcement-surface self-verify (SessionStart observer: silent | warn | strict-block) ===');

// ---- handler presence -------------------------------------------------------
unit('hook exports the pure decideSurfaceVerify brain', () => {
  assert.equal(typeof hook.decideSurfaceVerify, 'function',
    `MISSING export: .claude/hooks/enforcement-surface-verify-hook.cjs must export decideSurfaceVerify(ctx) — RED until Batch 6 GREEN creates the hook file (${HOOK_PATH})`);
});
unit('hook exports the I/O handleSessionStart handler', () => {
  assert.equal(typeof hook.handleSessionStart, 'function',
    `MISSING export: .claude/hooks/enforcement-surface-verify-hook.cjs must export handleSessionStart(payload) — RED until Batch 6 GREEN creates the hook file (${HOOK_PATH})`);
});

// ===========================================================================
// S1 MAIN — surface present -> SILENT pass (no warn, no block, continue, exit 0).
//   No ENFORCEMENT_SURFACE_UNVERIFIED line; the decision is continue with warn:false.
// ===========================================================================
check('S1 MAIN: surface present -> silent pass (continue, no warn, no block, no event line)', (tmp) => {
  assert.equal(typeof hook.decideSurfaceVerify, 'function',
    'decideSurfaceVerify missing — RED (hook file not created yet)');

  // (a) pure brain: a healthy surface decides continue + warn:false (silent).
  const out = hook.decideSurfaceVerify(healthyCtx());
  assert.ok(out && typeof out === 'object', 'decideSurfaceVerify must return a descriptor object');
  assert.equal(out.decision, 'continue', 'a healthy surface must NOT block (decision:continue)');
  assert.equal(out.warn, false, 'a healthy surface must be SILENT (warn:false) — no event line written');

  // (b) I/O handler: even a healthy run writes NO ENFORCEMENT_SURFACE_UNVERIFIED line.
  assert.equal(typeof hook.handleSessionStart, 'function', 'handleSessionStart missing — RED');
  withStrictEnv(undefined, () => withInjectEnv(() => {
    const res = hook.handleSessionStart({ hook_event_name: 'SessionStart', cwd: tmp, surface: 'healthy' });
    assert.ok(res == null || res.continue !== false, 'the silent path must not signal a block (continue path)');
  }));
  const lines = surfaceEventLines(tmp);
  assert.equal(lines.length, 0,
    `a healthy surface must write ZERO ENFORCEMENT_SURFACE_UNVERIFIED lines, got ${lines.length} (silence-on-health)`);
});

// ===========================================================================
// S2 REGRESSION — surface missing + plugin present + non-strict (default) ->
//   exactly ONE ENFORCEMENT_SURFACE_UNVERIFIED, NO block, continue, exit 0.
// ===========================================================================
check('S2 REGRESSION: surface missing + plugin present + non-strict -> WARN (1 event), no block', (tmp) => {
  assert.equal(typeof hook.decideSurfaceVerify, 'function',
    'decideSurfaceVerify missing — RED (hook file not created yet)');

  // (a) pure brain: a degraded surface with the plugin present and NO strict ->
  //     continue + warn:true (the default warn posture), naming what is missing.
  const out = hook.decideSurfaceVerify(degradedCtx({ pluginPresent: true, strict: false }));
  assert.equal(out.decision, 'continue', 'the default (non-strict) posture must NOT block a degraded surface');
  assert.equal(out.warn, true, 'a degraded surface with the plugin present must WARN (warn:true)');
  assert.ok(Array.isArray(out.missing) && out.missing.length >= 1,
    'the warn verdict must name at least one missing surface piece in missing[]');

  // (b) I/O handler: exactly ONE ENFORCEMENT_SURFACE_UNVERIFIED line, no block signal.
  withStrictEnv(undefined, () => withInjectEnv(() => {
    const res = hook.handleSessionStart({ hook_event_name: 'SessionStart', cwd: tmp, surface: 'degraded', pluginPresent: true });
    assert.ok(res == null || res.continue !== false, 'the WARN path must not signal a block');
  }));
  const lines = surfaceEventLines(tmp);
  assert.equal(lines.length, 1,
    `surface missing + plugin present + non-strict must write EXACTLY ONE ENFORCEMENT_SURFACE_UNVERIFIED line, got ${lines.length}`);
  const ev = lines[0];
  assert.equal(ev.decided_by, 'enforcement-surface-verify-hook',
    'the event must be decided_by the self-verify hook');
  assert.ok(typeof ev.ts === 'string' && ev.ts, 'the event must carry the canonical ts key');
});

// ===========================================================================
// S3 REGRESSION — plugin ABSENT -> warn-at-most, NEVER block, even with
//   PIPELINE_ENFORCEMENT_SURFACE_ENFORCEMENT=deny set. Uninstalled env is legitimate.
// ===========================================================================
check('S3 REGRESSION: plugin absent -> warn-at-most, NEVER block even under strict (=deny)', (tmp) => {
  assert.equal(typeof hook.decideSurfaceVerify, 'function',
    'decideSurfaceVerify missing — RED (hook file not created yet)');

  // (a) pure brain: plugin absent + strict TRUE must STILL be continue (never block).
  const strictOut = hook.decideSurfaceVerify(degradedCtx({ pluginPresent: false, strict: true }));
  assert.equal(strictOut.decision, 'continue',
    'an ABSENT plugin must NEVER be escalated to a block, even under strict — uninstalled is a valid state (R7.2 false-block guardrail)');

  // (b) pure brain: plugin absent + strict FALSE is likewise continue.
  const nonStrictOut = hook.decideSurfaceVerify(degradedCtx({ pluginPresent: false, strict: false }));
  assert.equal(nonStrictOut.decision, 'continue',
    'an ABSENT plugin must not block when non-strict either');

  // (c) I/O handler: even with the env var literally set to deny, the absent-plugin
  //     real path must NOT signal a block.
  withStrictEnv('deny', () => withInjectEnv(() => {
    const res = hook.handleSessionStart({ hook_event_name: 'SessionStart', cwd: tmp, surface: 'degraded', pluginPresent: false });
    assert.ok(res == null || res.continue !== false || res.decision !== 'block',
      'an absent plugin under PIPELINE_ENFORCEMENT_SURFACE_ENFORCEMENT=deny must NEVER block (it never opted into enforcement)');
  }));
});

// ===========================================================================
// S4 EDGE — plugin present + gates missing + STRICT (=deny) -> BLOCK governed work
//   (the ONLY block path) + an ENFORCEMENT_SURFACE_UNVERIFIED recorded. The BLOCK is
//   the pure-brain VERDICT (the harness-independent SSOT — see the SessionStart-block
//   GAP resolution above). Scoped to substantive governed work (arm-gate carve-out
//   posture); the read-only/control carve-out is NOT the target.
// ===========================================================================
check('S4 EDGE: plugin present + gates missing + strict (=deny) -> BLOCK (the only block path) + event recorded', (tmp) => {
  assert.equal(typeof hook.decideSurfaceVerify, 'function',
    'decideSurfaceVerify missing — RED (hook file not created yet)');

  // (a) pure brain: plugin present + gates missing + strict TRUE -> the ONE block path.
  const out = hook.decideSurfaceVerify(degradedCtx({ gatesLoadable: false, pluginPresent: true, strict: true }));
  assert.equal(out.decision, 'block',
    'plugin present + gates missing + strict must BLOCK governed work (the single deliberate block path)');
  assert.equal(out.warn, true, 'the strict block must ALSO record an ENFORCEMENT_SURFACE_UNVERIFIED (auditable)');
  assert.ok(typeof out.reason === 'string' && out.reason.length > 0,
    'the block must carry a corrective reason naming the missing surface');
  // The reason must be printable-ASCII + length-capped (sanitizeForReason idiom).
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[^\x20-\x7E]/.test(out.reason), 'the block reason must be printable-ASCII only (sanitized)');

  // (b) banner-only degradation (gates loadable) — strict must still distinguish:
  //     the block is for MISSING GATES specifically, mirroring the spec wording
  //     "plugin present + gates missing + strict". A surface that is present
  //     (banner+gates) never blocks regardless of strict.
  const present = hook.decideSurfaceVerify(healthyCtx({ strict: true }));
  assert.equal(present.decision, 'continue',
    'a present surface must NEVER block even under strict (silence-on-health holds under strict)');

  // (c) I/O handler with the env var set to deny records exactly ONE event for the block.
  withStrictEnv('deny', () => withInjectEnv(() => {
    hook.handleSessionStart({ hook_event_name: 'SessionStart', cwd: tmp, surface: 'degraded', pluginPresent: true });
  }));
  const lines = surfaceEventLines(tmp);
  assert.equal(lines.length, 1,
    `the strict block must record EXACTLY ONE ENFORCEMENT_SURFACE_UNVERIFIED line, got ${lines.length}`);
});

// ===========================================================================
// S5 EDGE — malformed/empty/missing payload (or unreadable surrounding files) ->
//   safe no-op: never throws, returns continue, exits 0, no fabricated block, no
//   corrupted event. A failed self-check is "could not verify", NOT "surface broken".
// ===========================================================================
check('S5 EDGE: malformed/empty/missing payload -> safe no-op (no throw, no fabricated block, continue)', (tmp) => {
  assert.equal(typeof hook.handleSessionStart, 'function',
    'handleSessionStart missing — RED (hook file not created yet)');
  assert.equal(typeof hook.decideSurfaceVerify, 'function', 'decideSurfaceVerify missing — RED');

  // (a) a range of malformed payloads must NEVER throw and must NEVER signal a block.
  const malformed = [
    {},
    null,
    undefined,
    'not-an-object',
    42,
    { hook_event_name: 'SessionStart' },          // no cwd
    { cwd: 123 },                                  // wrong-typed cwd
    { hook_event_name: 'SessionStart', cwd: tmp, surface: null },
  ];
  for (const m of malformed) {
    let res;
    assert.doesNotThrow(() => { res = hook.handleSessionStart(m); },
      `handleSessionStart must never throw on malformed input: ${JSON.stringify(m)}`);
    assert.ok(res == null || res.decision !== 'block',
      `malformed input must never FABRICATE a block (could-not-verify != surface-broken): ${JSON.stringify(m)}`);
  }

  // (b) the pure brain must also degrade safely on a non-object ctx (could-not-verify).
  assert.doesNotThrow(() => {
    const out = hook.decideSurfaceVerify(undefined);
    assert.ok(out == null || out.decision !== 'block',
      'a non-object ctx must NEVER be coerced into a block (safe no-op)');
  }, 'decideSurfaceVerify must never throw on a non-object ctx');

  // (c) malformed input writes no ENFORCEMENT_SURFACE_UNVERIFIED line (no corrupted event).
  const lines = surfaceEventLines(tmp);
  assert.equal(lines.length, 0,
    `malformed/empty input must write ZERO event lines, got ${lines.length} (the watcher never becomes a new failure mode)`);
});

// ===========================================================================
// S6 SMOKE (real-process E2E) — the hook is registered under SessionStart in
//   hooks/hooks.json AND a real SessionStart payload piped on stdin to a freshly
//   spawned `node <hook>.cjs` -> exit 0 in BOTH states: the degraded run writes
//   exactly one ENFORCEMENT_SURFACE_UNVERIFIED line; the healthy run writes none.
//   Neither run blocks the harness and neither throws.
// ===========================================================================
check('S6 SMOKE: real spawned hook — registered under SessionStart; degraded writes 1 event, healthy writes 0; both exit 0', (tmp) => {
  // (a) the hook file must actually exist to spawn.
  assert.equal(fs.existsSync(HOOK_PATH), true,
    `MISSING hook file: ${HOOK_PATH} must exist for the real-process smoke — RED until Batch 6 GREEN`);

  // (b) it must be registered under the SessionStart event in hooks/hooks.json.
  const manifest = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const ss = (manifest && manifest.hooks && manifest.hooks.SessionStart) || [];
  const registered = ss.some((group) => Array.isArray(group.hooks)
    && group.hooks.some((h) => typeof h.command === 'string'
      && /enforcement-surface-verify-hook\.cjs/.test(h.command)));
  assert.equal(registered, true,
    'enforcement-surface-verify-hook.cjs must be registered under the SessionStart event in hooks/hooks.json — RED until Batch 6 GREEN wires it');

  // Spawn helper: real process, fresh tmp cwd, stdin JSON payload, never throws on exit 0.
  function spawnReal(payload, env) {
    try {
      const stdout = execFileSync('node', [HOOK_PATH], {
        input: JSON.stringify(payload),
        cwd: tmp,
        env: { ...process.env, ...(env || {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
      // The observer must NEVER emit a block decision on stdout.
      if (stdout && stdout.trim()) {
        let parsed = null;
        try { parsed = JSON.parse(stdout); } catch { parsed = null; }
        if (parsed) {
          assert.notEqual(parsed.decision, 'block',
            'the SessionStart observer must NEVER emit a block decision on stdout (SessionStart cannot deny in this harness)');
        }
      }
      return stdout;
    } catch (e) {
      throw new Error(`spawned hook must exit 0 (SessionStart observer never blocks); got error: ${e && e.message}`);
    }
  }

  // (c) DEGRADED real run -> exactly one ENFORCEMENT_SURFACE_UNVERIFIED line on disk.
  //     Drive the degraded surface WITHOUT mutating the real repo: a per-run env/payload
  //     contract the implementer must honor (a test-injectable degraded-surface signal).
  const before = surfaceEventLines(tmp).length;
  spawnReal(
    { hook_event_name: 'SessionStart', cwd: tmp, surface: 'degraded', pluginPresent: true },
    { [STRICT_ENV]: '', [TEST_INJECT_ENV]: '1' /* non-strict warn path + opt-in to honor injected surface */ }
  );
  const afterDegraded = surfaceEventLines(tmp);
  assert.equal(afterDegraded.length - before, 1,
    `the degraded real run must write EXACTLY ONE ENFORCEMENT_SURFACE_UNVERIFIED line, got ${afterDegraded.length - before}`);

  // (d) HEALTHY real run -> writes NO new ENFORCEMENT_SURFACE_UNVERIFIED line.
  const healthyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b6-healthy-'));
  try {
    execFileSync('node', [HOOK_PATH], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: healthyTmp, surface: 'healthy' }),
      cwd: healthyTmp,
      env: { ...process.env, [STRICT_ENV]: '', [TEST_INJECT_ENV]: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const healthyLines = surfaceEventLines(healthyTmp);
    assert.equal(healthyLines.length, 0,
      `the healthy real run must write ZERO ENFORCEMENT_SURFACE_UNVERIFIED lines, got ${healthyLines.length}`);
  } finally {
    try { fs.rmSync(healthyTmp, { recursive: true, force: true }); } catch {}
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
