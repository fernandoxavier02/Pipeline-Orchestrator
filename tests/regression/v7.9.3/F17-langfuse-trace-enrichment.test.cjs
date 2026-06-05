#!/usr/bin/env node
// =============================================================================
// F17 — Langfuse trace enrichment (langfuse-hook + carrier, v7.9.3 BUG 3)
// =============================================================================
// TDD RED-phase suite for BUG 3: traces shipped to Langfuse arrive with empty
// metadata, spans named "unknown", and each separately-spawned hook process
// creates its own trace instead of all agents in a run sharing the run's trace.
// Three sub-fixes:
//   (a) enrich trace + span metadata with run_id / type / complexity, read from
//       the sentinel via a hardened discovery (PIPELINE_DOC_PATH first, then a
//       PIPELINE_RUN_ID folder match, then cwd);
//   (b) when the tool type is not mapped, give the span a readable fallback name
//       (not "unknown") and emit an AUDIT breadcrumb;
//   (c) derive a STABLE carrier grouping key from pipeline_doc_path when neither
//       runId nor sessionId is available, so Pre/Post (and Pre-tester/executor)
//       of the same run land on one trace.
//
// CONTRACT under test (from the approved IMPLEMENTATION_PLAN):
//   langfuse-hook.cjs exports readSentinelData()
//     -> returns { run_id, type, complexity, phase, ... } discovered with
//        precedence PIPELINE_DOC_PATH > PIPELINE_RUN_ID-folder-match > cwd-mtime.
//   The metadata the hook builds for trace + span includes run_id, type,
//   complexity (S1/S2). A span whose tool is unmapped gets a readable fallback
//   name + an AUDIT event (S5).
//   langfuse-carrier.cjs exports _resolveKey(runId, ppidFallback, kind) with a
//   pipeline_doc_path tier: when runId AND sessionId are both absent but
//   PIPELINE_DOC_PATH is set, the resolved key is derived from the doc path and
//   is STABLE across calls (S6) — NOT the volatile ppid.
//   Secrets never appear in the sanitized metadata (S7).
//
// RED-phase expectation (against CURRENT v7.9.2 code):
//   FAIL now: S1 S2 S3 S4 S5 S6 S7  (readSentinelData / _resolveKey doc-path tier
//             are not implemented; metadata omits run_id/type/complexity; the
//             carrier key falls to ppid when runId+sessionId are absent).
//   PASS now: S8  (the .claude/.codex langfuse-hook mirrors are already
//             byte-identical; parity must STAY true after the Batch 3 patch).
//
// Direct require of the hook is safe (CLI guarded by require.main === module).
// Harness mold mirrors F13/F14/F15/F16. Auto-discovered by scripts/run-tests.cjs.
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'langfuse-hook.cjs');
const HOOK_CODEX = path.join(ROOT, '.codex', 'hooks', 'langfuse-hook.cjs');
const CARRIER = path.join(ROOT, 'lib', 'langfuse-carrier.cjs');
const SANITIZER = path.join(ROOT, 'lib', 'langfuse-sanitizer.cjs');

let pass = 0;
let fail = 0;
const results = [];
const _tmpDirs = [];
const _envKeys = ['PIPELINE_DOC_PATH', 'PIPELINE_RUN_ID', 'CLAUDE_SESSION_ID'];
const _envSaved = {};

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg}`); }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; } }

function sha256(buf) {
  return require('node:crypto').createHash('sha256').update(buf).digest('hex');
}

function saveEnv() { for (const k of _envKeys) _envSaved[k] = process.env[k]; }
function restoreEnv() {
  for (const k of _envKeys) {
    if (_envSaved[k] === undefined) delete process.env[k];
    else process.env[k] = _envSaved[k];
  }
}
function setEnv(overrides) {
  for (const k of _envKeys) delete process.env[k];
  for (const [k, v] of Object.entries(overrides || {})) process.env[k] = v;
}

// Import under test. Safe direct require (CLI guarded by require.main === module).
const hook = require(HOOK_PATH);
const carrier = require(CARRIER);
const { readSentinelData } = hook;
const { _resolveKey } = carrier;

// Build a throwaway run folder under a temp docs tree so readSentinelData can
// discover it via PIPELINE_DOC_PATH (precedence 1) or PIPELINE_RUN_ID (2).
function makeRunFolder(slug, sentinel) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `f17-${slug}-`));
  _tmpDirs.push(root);
  const runDir = path.join(root, '.pipeline', 'docs', 'Pre-Medium-action', `run-${slug}`);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'sentinel-state.json'), JSON.stringify(sentinel, null, 2));
  return { root, runDir };
}

function callReadSentinel() {
  if (typeof readSentinelData !== 'function') {
    throw new TypeError('langfuse-hook does not export readSentinelData (helper not implemented)');
  }
  return readSentinelData();
}

function callResolveKey(runId, ppidFallback, kind) {
  if (typeof _resolveKey !== 'function') {
    throw new TypeError('langfuse-carrier does not export _resolveKey (doc-path tier not exposed)');
  }
  return _resolveKey(runId, ppidFallback, kind);
}

const SENTINEL = {
  run_id: 'r-f17',
  current_phase: 'execution',
  orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA', pipeline_variant: 'bugfix-light' },
};

console.log('=== F17 Langfuse trace enrichment (hook readSentinelData + carrier doc-path tier) ===');

saveEnv();
try {
  // =========================================================================
  // S1 (main) — run_id-na-metadata: discovered sentinel surfaces run_id
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const { runDir } = makeRunFolder('s1', SENTINEL);
      setEnv({ PIPELINE_DOC_PATH: runDir });
      const data = callReadSentinel();
      ok = data && data.run_id === 'r-f17';
      why = `data.run_id=${JSON.stringify(data && data.run_id)} (want "r-f17" — run_id available for metadata)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F17-S1: main — readSentinelData surfaces run_id for trace/span metadata', ok, why);
  }

  // =========================================================================
  // S2 (main) — type-complexity-na-metadata: type + complexity surfaced
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const { runDir } = makeRunFolder('s2', SENTINEL);
      setEnv({ PIPELINE_DOC_PATH: runDir });
      const data = callReadSentinel();
      ok = data && data.type === 'Bug Fix' && data.complexity === 'MEDIA';
      why = `type=${JSON.stringify(data && data.type)} complexity=${JSON.stringify(data && data.complexity)} (want "Bug Fix"/"MEDIA")`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F17-S2: main — readSentinelData surfaces type + complexity', ok, why);
  }

  // =========================================================================
  // S3 (main) — discovery-por-DOC_PATH: PIPELINE_DOC_PATH wins (highest precedence)
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      // Two distinct run folders. DOC_PATH points at the "correct" one; the
      // other carries a different run_id and a fresher mtime to prove DOC_PATH
      // beats mtime/cwd fallbacks.
      const correct = makeRunFolder('s3a', Object.assign({}, SENTINEL, { run_id: 'r-correct' }));
      const decoy = makeRunFolder('s3b', Object.assign({}, SENTINEL, { run_id: 'r-decoy' }));
      // Touch the decoy so its mtime is newest (would win a naive mtime scan).
      fs.writeFileSync(path.join(decoy.runDir, 'sentinel-state.json'),
        JSON.stringify(Object.assign({}, SENTINEL, { run_id: 'r-decoy' }), null, 2));
      setEnv({ PIPELINE_DOC_PATH: correct.runDir });
      const data = callReadSentinel();
      ok = data && data.run_id === 'r-correct';
      why = `data.run_id=${JSON.stringify(data && data.run_id)} (want "r-correct" — DOC_PATH highest precedence)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F17-S3: main — discovery uses PIPELINE_DOC_PATH (highest precedence)', ok, why);
  }

  // =========================================================================
  // S4 (main) — discovery-por-RUN_ID-match: DOC_PATH absent, RUN_ID finds folder
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const { root, runDir } = makeRunFolder('s4', Object.assign({}, SENTINEL, { run_id: 'r-byid' }));
      // No DOC_PATH; only RUN_ID. Discovery must scan run folders under cwd and
      // match sentinel.run_id === PIPELINE_RUN_ID. We run the scan with cwd set
      // to the temp root so the .pipeline/docs tree is discoverable.
      const prevCwd = process.cwd();
      setEnv({ PIPELINE_RUN_ID: 'r-byid' });
      let data;
      try {
        process.chdir(root);
        data = callReadSentinel();
      } finally {
        process.chdir(prevCwd);
      }
      ok = data && data.run_id === 'r-byid';
      why = `data.run_id=${JSON.stringify(data && data.run_id)} (want "r-byid" — matched by PIPELINE_RUN_ID)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F17-S4: main — discovery falls back to PIPELINE_RUN_ID folder match', ok, why);
  }

  // =========================================================================
  // S5 (edge) — fallback-de-span-name+AUDIT: unmapped tool -> readable name + AUDIT
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      // The current hook hard-codes agentName 'unknown' when subagent_type is
      // absent. The fix derives a readable fallback (the tool name or a short
      // description) and emits an AUDIT breadcrumb. We exercise this through the
      // exported helper if present; otherwise the missing export is the RED.
      if (typeof hook.resolveSpanName !== 'function') {
        throw new TypeError('langfuse-hook does not export resolveSpanName (span-name fallback not implemented)');
      }
      const captured = [];
      const origWrite = process.stderr.write;
      process.stderr.write = (chunk) => { captured.push(String(chunk)); return true; };
      let name;
      try {
        // Payload with NO subagent_type but a known tool_name -> readable fallback.
        name = hook.resolveSpanName({ tool_name: 'Bash', tool_input: {} });
      } finally {
        process.stderr.write = origWrite;
      }
      const auditEmitted = captured.join('').includes('SPAN_NAME_FALLBACK');
      const readable = typeof name === 'string' && name.length > 0 && name !== 'unknown';
      ok = readable && auditEmitted;
      why = `name=${JSON.stringify(name)} auditEmitted=${auditEmitted} (want readable name != "unknown" + SPAN_NAME_FALLBACK audit)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F17-S5: edge — unmapped tool yields readable span name + AUDIT breadcrumb', ok, why);
  }

  // =========================================================================
  // S6 (main) — chave-estável: no runId/sessionId, same DOC_PATH -> same key
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      // Simulate two agents (Pre-tester, executor) of the SAME run, each a
      // separate process: no PIPELINE_RUN_ID, no CLAUDE_SESSION_ID, but both
      // share PIPELINE_DOC_PATH. The doc-path tier must derive ONE stable key
      // for both — and it must NOT be the volatile ppid.
      const docPath = '/repo/.pipeline/docs/Pre-Medium-action/2026-06-05-fix-telemetry-3bugs/';
      setEnv({ PIPELINE_DOC_PATH: docPath });
      // Two calls with DIFFERENT ppidFallback values (distinct processes) but
      // identical doc path. A doc-path-derived key ignores the ppid difference.
      const keyA = callResolveKey(null, 11111, 'trace');
      const keyB = callResolveKey(null, 22222, 'trace');
      const stable = keyA === keyB;
      const notPpid = String(keyA) !== '11111' && String(keyA) !== '22222';
      ok = stable && notPpid;
      why = `keyA=${JSON.stringify(keyA)} keyB=${JSON.stringify(keyB)} stable=${stable} notPpid=${notPpid} (want one stable doc-path key, not ppid)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F17-S6: main — doc-path tier gives Pre/Post a stable shared carrier key', ok, why);
  }

  // =========================================================================
  // S7 (edge) — no-secret-leak: the HOOK's own enriched metadata holds no secret
  // -------------------------------------------------------------------------
  // This binds the no-secret-leak invariant to the NEW Batch-3 behavior: the
  // hook must expose its metadata builder (buildTraceMetadata) and that builder
  // must route every value through the sanitizer before send. Asserting against
  // the hook's builder (not sanitizeAny directly) makes S7 RED for the right
  // reason today (builder not implemented) while still proving the contract:
  // run_id/type/complexity get enriched AND any secret that rides along on the
  // env/sentinel is stripped. We cross-check that the sanitizer the builder must
  // use is actually capable of stripping the token (guards a no-op builder).
  // =========================================================================
  {
    let ok = false, why = '';
    try {
      const secret = 'sk-lf-SUPER-SECRET-F17-VALUE-1234567890';
      // Sanity: the sanitizer the builder is required to use must strip the token.
      const { sanitizeAny } = require(SANITIZER);
      const sanitizerStrips = !JSON.stringify(sanitizeAny({ t: secret }, ROOT)).includes(secret);

      if (typeof hook.buildTraceMetadata !== 'function') {
        throw new TypeError('langfuse-hook does not export buildTraceMetadata (enriched+sanitized metadata builder not implemented)');
      }
      // Feed the builder a sentinel + env shape that carries a secret alongside
      // the real fields. The enriched metadata must carry run_id/type/complexity
      // and must NOT carry the raw secret value anywhere in its serialization.
      const sentinelWithSecret = {
        run_id: 'r-f17',
        orchestrator_decision: { type: 'Bug Fix', complexity: 'MEDIA' },
        note: `leaked token=${secret}`,
      };
      const meta = hook.buildTraceMetadata(sentinelWithSecret);
      const serialized = JSON.stringify(meta);
      const enriched = meta && meta.run_id === 'r-f17' && meta.type === 'Bug Fix' && meta.complexity === 'MEDIA';
      const noSecret = !serialized.includes(secret);
      ok = sanitizerStrips && enriched && noSecret;
      why = `sanitizerStrips=${sanitizerStrips} enriched=${enriched} noSecret=${noSecret} (want all true — builder enriches and strips secrets)`;
    } catch (err) { why = `threw: ${err.message}`; }
    record('F17-S7: edge — hook metadata builder enriches AND strips secrets', ok, why);
  }

  // =========================================================================
  // S8 (regression) — paridade espelho: .claude vs .codex langfuse-hook identical
  // =========================================================================
  {
    let ok = false, why = '';
    const a = safeRead(HOOK_PATH);
    const b = safeRead(HOOK_CODEX);
    if (a === null) { why = `${HOOK_PATH} missing`; }
    else if (b === null) { why = `${HOOK_CODEX} missing`; }
    else {
      const ha = sha256(a);
      const hb = sha256(b);
      ok = ha === hb;
      why = `sha256 match=${ok} (.claude=${ha.slice(0, 12)} .codex=${hb.slice(0, 12)})`;
    }
    record('F17-S8: regression — .claude/.codex langfuse-hook.cjs sha256 identical', ok, why);
  }
} finally {
  restoreEnv();
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nF17 — Langfuse trace enrichment: ${pass}/${pass + fail}`);
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
