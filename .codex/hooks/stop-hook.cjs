#!/usr/bin/env node
'use strict';

/**
 * stop-hook.cjs — v7.1.0 Stop event hook.
 *
 * Fires on Claude Code session end (including normal exit, crashes, and
 * aborts). Locates the most recently updated pipeline run folder under
 * .pipeline/docs/Pre-*-action/<slug>/, reads sentinel-state.json + session.json
 * to assemble the 12 REQUIRED_FIELDS for lib/run-log.cjs::appendRunLog, and
 * appends one summary line to <repoRoot>/.pipeline/run-log.jsonl.
 *
 * Closes Finding #6 (telemetry hygiene): 19/20 historical runs were missing
 * from run-log.jsonl because Phase 3 closer was the only writer and it never
 * fired on crash paths. The Stop event fires on every session teardown
 * including crashes, so this hook becomes the primary run-log writer; the
 * agent-driven Step 3b-fidelity path remains as belt-and-suspenders.
 *
 * SOFT-fail contract: every error is caught and swallowed. The hook NEVER
 * exits non-zero. Failure modes (missing state file, malformed JSON, lock
 * contention) write a single line to stderr and exit 0, so Claude Code
 * session teardown is never blocked by this hook.
 *
 * Schema follows lib/run-log.cjs REQUIRED_FIELDS (v6.0.0+):
 *   run_id, timestamp_start, timestamp_end, type, complexity, variant,
 *   total_gates_triggered, total_gates_expected, fidelity_score,
 *   duration_seconds, final_decision, pipeline_doc_path.
 *
 * Fields not available at exit time fall back to null. appendRunLog
 * sanitizes nulls into the JSONL line so the row is still well-formed.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

// Plugin root resolution (hook lives at <plugin_root>/<channel>/hooks/<file>).
const PLUGIN_ROOT_STOP = path.resolve(__dirname, '..', '..');

// Shared trace-carrier SSOT (v7.3.0 fix-loop 1: ARCH-3 / RISK-1) — provides
// canonical SPAN_PREFIX/TRACE_PREFIX/getSpanPath/getTracePath so the cleanup
// glob below stays in sync with what langfuse-hook.cjs writes.
// v8.20.0-glm port: Langfuse foi removido; require é fail-open com fallback
// para os mesmos prefixos literais ('langfuse-trace-' e 'langfuse-span-'),
// garantindo que arquivos temp órfãos de runs anteriores ainda sejam limpos.
let carrierLib;
try {
  carrierLib = require(path.join(PLUGIN_ROOT_STOP, 'lib', 'langfuse-carrier.cjs'));
} catch (_e) {
  carrierLib = { TRACE_PREFIX: 'langfuse-trace-', SPAN_PREFIX: 'langfuse-span-' };
}

// Stdin cap — defense against unbounded buffering (SEC-4 from Batch 3
// adversarial). 1 MiB is far above any realistic Stop-event payload but
// prevents a runaway producer from exhausting memory.
const MAX_STDIN_BYTES = 1 * 1024 * 1024;

// Flush timeout for Langfuse pending events at session end (FR-5, design §4.3).
// 3000ms ceiling per spec; configurable via env for tests.
const LANGFUSE_FLUSH_TIMEOUT_MS = (() => {
  const raw = parseInt(process.env.LANGFUSE_FLUSH_TIMEOUT_MS || '', 10);
  if (Number.isFinite(raw) && raw > 0 && raw <= 30000) return raw;
  return 3000;
})();

function warn(msg) {
  try { process.stderr.write(`stop-hook: ${msg}\n`); } catch (_e) { /* ignore */ }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    // SEC-3 (Batch 3): log only the basename + error name. Echoing the full
    // path leaks layout, and echoing e.message leaks parsed JSON content
    // when the JSON parser includes a snippet of the offending input.
    warn(`readJsonSafe(${path.basename(filePath)}) failed: ${e.name || 'ParseError'}`);
    return null;
  }
}

// Inline AUDIT emitter (v7.5.0). Dedupe by event-key to avoid stderr flooding
// when a hook invokes findActiveRunFolder multiple times in a single session.
const _emittedAuditsStop = new Set();
function emitAuditStop(name, fields, dedupeKey) {
  if (dedupeKey) {
    if (_emittedAuditsStop.has(dedupeKey)) return;
    _emittedAuditsStop.add(dedupeKey);
  }
  try {
    process.stderr.write(JSON.stringify({
      audit_event: name,
      ts: new Date().toISOString(),
      ...fields,
    }) + '\n');
  } catch (_e) { /* never throw */ }
}

function readStateRunIdFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const body = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (body && typeof body.run_id === 'string') return body.run_id;
    return null;
  } catch (_e) {
    return null;
  }
}

/**
 * Find the active pipeline run folder beneath cwd/.pipeline/docs/.
 * Returns absolute path or null if none found.
 *
 * Selection precedence (v7.5.0):
 *   1. If PIPELINE_RUN_ID is set, return the folder whose sentinel-state.json
 *      carries run_id === PIPELINE_RUN_ID (REQ-C-1, REQ-C-2).
 *   2. Otherwise (or no match) fall back to mtime-newest with an AUDIT
 *      breadcrumb (REQ-C-3).
 *
 * v7.1.0 hardening: path.resolve() containment guard prevents symlink/`..`
 * escapes outside docsRoot (SEC-2). Preserved unchanged.
 */
function findActiveRunFolder(cwd) {
  try {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null;

    // Priority 0 (AUDIT-005, v7.11.0): deterministic pointer file written by the
    // controller at run creation — `<cwd>/.pipeline/active-run.json` with
    // { pipeline_doc_path, run_id, updated_at }. Beats every scan: it survives
    // cwd ambiguity, is refreshed per run, and self-invalidates (stale >24h or
    // pipeline_active=false in the pointed state -> fall through to the scans).
    try {
      const ptrPath = path.join(cwd, '.pipeline', 'active-run.json');
      if (fs.existsSync(ptrPath)) {
        // SEC-4 (v7.11.0): size cap — a valid pointer is ~200 bytes; reject blobs.
        if (fs.statSync(ptrPath).size > 4096) throw new Error('pointer too large');
        const ptr = JSON.parse(fs.readFileSync(ptrPath, 'utf8'));
        const docPath = ptr && typeof ptr.pipeline_doc_path === 'string' ? ptr.pipeline_doc_path : '';
        // SEC-2 (v7.11.0): uncomputable age = STALE (fail-closed), not fresh-forever.
        const age = ptr && typeof ptr.updated_at === 'string' ? (Date.now() - Date.parse(ptr.updated_at)) : NaN;
        const freshEnough = Number.isFinite(age) && age >= 0 && age < 24 * 3600 * 1000;
        // SEC-1 (v7.11.0): containment — the pointer may only target a folder INSIDE
        // the project tree (same guard family as the docsRoot scan below). Rejects
        // absolute escapes, UNC shares and .. traversal.
        const cwdGuard = path.resolve(cwd) + path.sep;
        const resolvedDoc = docPath ? path.resolve(docPath) : '';
        const contained = resolvedDoc !== '' && resolvedDoc.startsWith(cwdGuard);
        // Concurrency guard: when PIPELINE_RUN_ID is set, the pointer must agree.
        const envRunId = (process.env.PIPELINE_RUN_ID || '').trim();
        const runIdOk = !envRunId || (ptr && ptr.run_id === envRunId);
        let reason = '';
        if (!docPath) reason = 'no_doc_path';
        else if (!contained) reason = 'outside_project';
        else if (!freshEnough) reason = 'age';
        else if (!runIdOk) reason = 'run_id_mismatch';
        if (!reason) {
          const sf = path.join(resolvedDoc, 'sentinel-state.json');
          if (fs.existsSync(sf)) {
            const st = JSON.parse(fs.readFileSync(sf, 'utf8'));
            if (!st || st.pipeline_active !== false) return resolvedDoc;
            // v8.4.0 (W2): a SEALED spec-authoring run lives OUTSIDE .pipeline/docs/
            // (under pipeline-runs/) and finishes with pipeline_active:false. It
            // must still be logged ONCE — so when the pointer targets a path that
            // is NOT inside .pipeline/docs/, return it even though it is inactive.
            // Runs inside .pipeline/docs/ keep the byte-identical legacy behavior
            // (inactive -> fall through to the docs scan). Existing run-log dedup
            // (shouldAppendRunLogEntry by run_id) guarantees "once".
            const docsRootResolved = path.resolve(path.join(cwd, '.pipeline', 'docs')) + path.sep;
            if (!resolvedDoc.startsWith(docsRootResolved)) return resolvedDoc;
            reason = 'inactive';
          } else { reason = 'broken_path'; }
        }
        // SEC-3 (v7.11.0): reason-tagged audit so operators can tell age vs broken vs inactive.
        emitAuditStop('DISCOVERY_POINTER_STALE', { pointer: ptrPath, reason },
          `DISCOVERY_POINTER_STALE:stop:${ptrPath}`);
      }
    } catch (_e) { /* pointer unreadable — fall through to scans */ }

    const docsRoot = path.resolve(path.join(cwd, '.pipeline', 'docs'));
    if (!fs.existsSync(docsRoot)) return null;
    const docsRootGuard = docsRoot + path.sep;
    const buckets = fs.readdirSync(docsRoot, { withFileTypes: true });

    const candidates = []; // { runPath, statePath, mtimeMs }
    for (const b of buckets) {
      if (!b.isDirectory()) continue;
      const bucketPath = path.resolve(path.join(docsRoot, b.name));
      if (!bucketPath.startsWith(docsRootGuard)) continue;
      let runs;
      try { runs = fs.readdirSync(bucketPath, { withFileTypes: true }); }
      catch (_e) { continue; }
      for (const r of runs) {
        if (!r.isDirectory()) continue;
        const runPath = path.resolve(path.join(bucketPath, r.name));
        if (!runPath.startsWith(docsRootGuard)) continue;
        const stateFile = path.join(runPath, 'sentinel-state.json');
        try {
          const st = fs.statSync(stateFile);
          candidates.push({ runPath, statePath: stateFile, mtimeMs: st.mtimeMs });
        } catch (_e) { /* skip */ }
      }
    }
    if (candidates.length === 0) return null;

    // Priority 1: PIPELINE_RUN_ID match.
    const runId = (process.env.PIPELINE_RUN_ID || '').trim();
    if (runId) {
      for (const c of candidates) {
        if (readStateRunIdFromFile(c.statePath) === runId) return c.runPath;
      }
      emitAuditStop('DISCOVERY_RUN_ID_NO_MATCH',
        { runId, candidates: candidates.length },
        `DISCOVERY_RUN_ID_NO_MATCH:stop:${runId}`);
    }

    // Priority 2: mtime fallback.
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const picked = candidates[0].runPath;
    if (candidates.length > 1) {
      emitAuditStop('DISCOVERY_MTIME_FALLBACK', {
        reason: runId ? 'no-match' : 'env-absent',
        picked,
        total: candidates.length,
      }, `DISCOVERY_MTIME_FALLBACK:stop:${picked}`);
    }
    return picked;
  } catch (e) {
    warn(`findActiveRunFolder failed: ${e.message}`);
    return null;
  }
}

/**
 * Count gate triggers in gate-decisions.jsonl. Returns 0 on any failure.
 */
function countGateTriggers(runFolder) {
  try {
    const filePath = path.join(runFolder, 'gate-decisions.jsonl');
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.split(/\r?\n/).filter(l => l.trim().length > 0).length;
  } catch (e) {
    warn(`countGateTriggers failed: ${e.message}`);
    return 0;
  }
}

/**
 * Read the last `n` non-empty lines of a file. Soft-fail: returns [] on any
 * error (missing file, read failure). Mirrors the countGateTriggers template.
 */
function readTailLines(filePath, n) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.split(/\r?\n/).filter(l => l.trim()).slice(-n);
  } catch (_e) { return []; }
}

/**
 * FIX-K (v8.4.0): authoring-variant trust gate.
 *
 * FIX-A made the teardown path honor a ROOT-level `pipeline_variant` to pick the
 * (smaller) AUTHORING yardstick — only 2 mandatory gates instead of the full
 * processing set. But the sentinel is read with raw JSON (no HMAC check), so a
 * forged/unsigned sentinel could set `pipeline_variant:'spec-authoring'` purely
 * to SHRINK a real processing run's mandatory gate count and inflate fidelity.
 *
 * Defense: a `pipeline_variant` is only allowed to REDUCE the mandatory set (the
 * authoring set) when the sentinel's HMAC signature VERIFIES. Legit authoring
 * runs always write a SIGNED sentinel (run-directory bridge + sealSpecRun via
 * writeSignedState), so they still verify and keep the 2-gate set. On verify
 * failure (or unsigned), the authoring variant is DROPPED and the run falls back
 * to the legacy type/complexity classification — the larger, SAFE set.
 *
 * Backward-compatible + soft-fail: if the signer module or key is unavailable,
 * we PRESERVE current behavior (return true) rather than hard-fail the hook —
 * the broader stop-hook contract is that teardown never blocks.
 */
function authoringVariantAllowed(sentinel) {
  try {
    const signerPath = path.join(PLUGIN_ROOT_STOP, 'lib', 'sentinel-state-signer.cjs');
    if (!fs.existsSync(signerPath)) return true; // signer unavailable — preserve behavior
    let verifyState, readHmacKey;
    // eslint-disable-next-line global-require
    try { ({ verifyState, readHmacKey } = require(signerPath)); } catch (_e) { return true; }
    if (typeof verifyState !== 'function' || typeof readHmacKey !== 'function') return true;
    const key = readHmacKey();
    if (!key) return true; // no key available — cannot verify; preserve behavior
    const res = verifyState(sentinel, { key, strict: false });
    // Only a POSITIVELY-valid signature unlocks the authoring downgrade. An
    // unsigned state (res.unsigned) or a key-unavailable advisory pass does NOT
    // count — those must fall back to the safe legacy set.
    return !!(res && res.valid === true && !res.unsigned && !res.key_unavailable);
  } catch (e) {
    // FIX-Q (v8.4.0): an UNEXPECTED exception in the trust check fails CLOSED.
    // Previously this returned true, silently granting the authoring downgrade
    // (smaller mandatory-gate set) whenever the verify path threw for a reason we
    // did not anticipate — a fail-OPEN security hole. We now drop the authoring
    // variant (return false → safe legacy/larger set) and surface the error.
    // NOTE: the documented keyless / unsigned / key-unavailable fallbacks above
    // intentionally still return true to preserve behavior on installs without an
    // HMAC key; only this genuine-unexpected-exception branch flips to false.
    warn(`authoringVariantAllowed unexpected error (failing closed): ${e && e.message ? e.message : 'unknown'}`);
    return false;
  }
}

/**
 * Read classification (type/complexity/variant) from a sentinel object.
 *
 * SSOT for the sentinel-derived part of the D2 classification cascade:
 *   orchestrator_decision.* > classification_post_orchestrator/classification.*
 * The session.* fallback is applied by the CALLER on top of this result, so
 * the full precedence stays od.* > cl.* > session.* exactly as before.
 *
 * Pure: no fs, no I/O. Returns nulls when nothing is found.
 *
 * FIX-K (v8.4.0): when `trustAuthoring` is false, a ROOT-level authoring
 * `pipeline_variant` (the only variant that shrinks the yardstick) is dropped so
 * an unverified sentinel cannot downgrade the mandatory gate count. The
 * non-root variant sources (orchestrator_decision / classification) are not
 * dropped: they are part of the legacy classification and do not, on their own,
 * select the authoring set without ALSO being an authoring string — and the only
 * production writer of an authoring variant is the SIGNED root field.
 */
function readClassification(sentinel, trustAuthoring = true) {
  const s = sentinel || {};
  const od = s.orchestrator_decision || {};
  const cl = s.classification_post_orchestrator || s.classification || {};
  // FIX-A.1 (v8.4.0): a SEALED spec-authoring run carries `pipeline_variant` at
  // the ROOT of the sentinel (written by lib/run-seal.cjs sealSpecRun) and
  // `controller_type='spec'` in the manifest notes — NOT under
  // orchestrator_decision/classification. Without a root-level fallback the
  // authoring variant was invisible at teardown, so the authoring yardstick
  // never fired on the production stop-hook path (the core bug). Read the root
  // `pipeline_variant` last, after the existing precedence, so processing runs
  // are unchanged.
  const type = od.type || od.task_type || cl.type
    || s.type || null;
  const complexity = od.complexity || cl.complexity
    || (typeof s.complexity === 'string' ? s.complexity : null)
    || null;
  // FIX-K: only consider the root pipeline_variant when the sentinel is trusted.
  const rootVariant = (trustAuthoring && typeof s.pipeline_variant === 'string')
    ? s.pipeline_variant : null;
  const variant = od.pipeline_variant || od.variant || cl.pipeline_variant || cl.variant
    || rootVariant
    || null;
  return { type, complexity, variant };
}

/**
 * v7.9.3 BUG 2 — generate the per-run fidelity-report.json idempotently at
 * session teardown, BEFORE buildRunLogEntry reads it, so the run-log entry
 * carries a numeric fidelity_score instead of the historical null. The report
 * was previously only generated from Step 3d of the pipeline-controller — a
 * path that almost never completes.
 *
 * Contract (mirrors tests/regression/v7.9.3/F16):
 *   - idempotent: if fidelity-report.json already exists, do nothing.
 *   - gated: if gate-decisions.jsonl is absent, skip silently, create nothing.
 *   - soft-fail: ANY error is caught + warned, never thrown — teardown reaches
 *     exit 0. generateFidelityReport itself returns { ok:false, error } on bad
 *     input (e.g. invalid complexity) rather than throwing; we just warn.
 *
 * The reporter is lazy-required via the hook's own PLUGIN_ROOT_STOP (NOT the
 * payload cwd), matching the run-log + MANDATORY_GATES require pattern.
 */
function ensureFidelityReport(runFolder, repoRoot, sentinel) {
  try {
    const reportPath = path.join(runFolder, 'fidelity-report.json');
    const mdPath = path.join(runFolder, 'fidelity-report.md');

    const gdPath = path.join(runFolder, 'gate-decisions.jsonl');
    if (!fs.existsSync(gdPath)) return; // no gate data — skip, create nothing

    // AUDIT-004 (v7.11.0) — KEEP-MAX instead of never-overwrite. The historical
    // `if exists return` froze the FIRST teardown's (often undercounted) score
    // forever; multi-session runs could never raise it. New contract: regenerate,
    // keep whichever report has the HIGHER mandatory_triggered; never downgrade.
    let prior = null; let priorJsonText = null; let priorMdText = null;
    if (fs.existsSync(reportPath)) {
      try {
        priorJsonText = fs.readFileSync(reportPath, 'utf8');
        prior = JSON.parse(priorJsonText);
      } catch (_e) { prior = null; priorJsonText = null; }
      try { priorMdText = fs.readFileSync(mdPath, 'utf8'); } catch (_e) { priorMdText = null; }
    }

    // FIX-A.2 (v8.4.0): thread `variant` so generateFidelityReport applies the
    // authoring yardstick on the production teardown path. Previously only
    // type+complexity were extracted, so a sealed spec-authoring run was scored
    // against the legacy processing SPEC set even though its sentinel carries
    // the authoring variant.
    // FIX-K (v8.4.0): the authoring variant is only honored when the sentinel's
    // HMAC verifies; a forged/unsigned sentinel cannot shrink the yardstick.
    const { type, complexity, variant } = readClassification(sentinel, authoringVariantAllowed(sentinel));

    const fidelityReporterPath = path.join(PLUGIN_ROOT_STOP, 'lib', 'fidelity-reporter.cjs');
    if (!fs.existsSync(fidelityReporterPath)) return;
    let generateFidelityReport;
    // eslint-disable-next-line global-require
    try { ({ generateFidelityReport } = require(fidelityReporterPath)); } catch (_e) { return; }
    if (typeof generateFidelityReport !== 'function') return;

    const res = generateFidelityReport({
      pipelineDocPath: runFolder,
      complexity,
      type,
      repoRoot,
      variant,
      runId: path.basename(runFolder),
    });
    if (res && res.ok !== true) {
      warn(`ensureFidelityReport: generator returned not-ok: ${res && res.error ? res.error : 'unknown'}`);
      // Generator failed AFTER a prior report existed — restore the PAIR
      // untouched (SEC-2 follow-up: the generator writes .md before .json, so a
      // mid-write failure can leave a fresh .md orphaned next to the prior .json).
      if (priorJsonText !== null) {
        try {
          if (!fs.existsSync(reportPath)) fs.writeFileSync(reportPath, priorJsonText);
          if (priorMdText !== null) {
            fs.writeFileSync(mdPath, priorMdText);
          } else {
            // SEC-NEW-1 (v7.11.0): prior pair had no .md — drop any fresh .md
            // the generator wrote before failing (it writes .md before .json).
            try { fs.rmSync(mdPath, { force: true }); } catch (_e2) { /* soft */ }
          }
        } catch (_e) { /* soft */ }
      }
      return;
    }

    // KEEP-MAX arbitration (AUDIT-004): if the prior report counted MORE
    // mandatory triggers than the fresh one, the prior is the high-watermark —
    // restore it (a restart session with a truncated gate log must not erase
    // real history). A prior report without a numeric mandatory_triggered is
    // treated as 0 (legacy frozen reports get healed by the fresh count).
    if (priorJsonText !== null) {
      const fresh = readJsonSafe(reportPath);
      const priorT = prior && Number.isFinite(Number(prior.mandatory_triggered))
        ? Number(prior.mandatory_triggered) : 0;
      const freshT = fresh && Number.isFinite(Number(fresh.mandatory_triggered))
        ? Number(fresh.mandatory_triggered) : 0;
      if (priorT > freshT) {
        try {
          fs.writeFileSync(reportPath, priorJsonText);
          if (priorMdText !== null) {
            fs.writeFileSync(mdPath, priorMdText);
          } else {
            // SEC-2 (v7.11.0): prior pair had no .md — remove the freshly
            // generated .md so the restored .json never sits next to a
            // contradictory lower-count narrative.
            try { fs.rmSync(mdPath, { force: true }); } catch (_e2) { /* soft */ }
          }
        } catch (_e) { /* soft */ }
      }
    }
  } catch (e) {
    warn(`ensureFidelityReport failed (soft): ${e && e.message ? e.message : 'unknown'}`);
  }
}

/**
 * Build the 12-field RunLog payload from state files. Any missing field
 * falls back to null; appendRunLog handles null-fill safely.
 */
function buildRunLogEntry(runFolder, repoRoot) {
  const sentinel = readJsonSafe(path.join(runFolder, 'sentinel-state.json')) || {};
  const session = readJsonSafe(path.join(runFolder, 'session.json')) || {};

  // D2 — classification SSOT: read orchestrator_decision first, then the legacy
  // classification_post_orchestrator / classification shapes (via the shared
  // readClassification helper), then session as the final fallback. Precedence
  // stays byte-equivalent to the prior inline chain: od.* > cl.* > session.*.
  // FIX-K (v8.4.0): the authoring variant is only honored when the sentinel's
  // HMAC verifies, so total_gates_expected cannot be shrunk by a forged sentinel
  // (and stays in lockstep with the same gate in fidelity-report.json).
  const cls = readClassification(sentinel, authoringVariantAllowed(sentinel));
  const type = cls.type || session.type || null;
  const complexity = cls.complexity || session.complexity || null;
  const variant = cls.variant || session.variant || null;

  // D1 — gates expected: use the SAME yardstick the fidelity-report uses, so the
  // run-log's total_gates_expected can never disagree with fidelity-report.json.
  // FIX-A.3 (v8.4.0): the prior code recomputed the gate count locally from
  // MANDATORY_GATES_BY_COMPLEXITY and IGNORED the variant, so an authoring run
  // got the full processing count here while fidelity-report.json (which threads
  // the variant) got the 2-gate authoring count. Reuse mandatorySetFor —
  // exported from lib/fidelity-reporter.cjs as the SSOT — with the threaded
  // variant. Lazy-required relative to the plugin root, soft-fail to null.
  // (`variant` is the threaded classification variant resolved above.)
  const fidelityReporterPath = path.join(PLUGIN_ROOT_STOP, 'lib', 'fidelity-reporter.cjs');
  let mandatorySetFor = null;
  if (fs.existsSync(fidelityReporterPath)) {
    // eslint-disable-next-line global-require
    try { ({ mandatorySetFor } = require(fidelityReporterPath)); } catch (_e) { /* soft-fail */ }
  }
  let gatesExpected = null;
  if (typeof mandatorySetFor === 'function') {
    const set = mandatorySetFor(complexity, type, variant);
    // FIX-N (v8.4.0): an EMPTY yardstick is a bug (unknown complexity, no
    // authoring variant), NOT a run that legitimately expects 0 gates — so an
    // empty set reads as "expected unknown" (null), never literal 0. A non-empty
    // set (including the authoring set) keeps its real length.
    gatesExpected = set && set.length > 0 ? set.length : null;
  }

  // D1 — fidelity score: read from persisted fidelity-report.json. null when
  // absent or non-numeric.
  const fidelityJson = readJsonSafe(path.join(runFolder, 'fidelity-report.json'));
  const fidelityScore = (fidelityJson && typeof fidelityJson.fidelity_score === 'number')
    ? fidelityJson.fidelity_score : null;

  // D4 — duration: a date-only "YYYY-MM-DD" started_at has no time component, so
  // Date.parse would assume UTC-midnight and inflate the duration. Guard -> null.
  // AUDIT-010 (v7.11.0): third fallback — derive the start from the sentinel
  // pipeline_id ISO prefix ("<ISO>_<variant>"), the one timestamp every run has
  // stamped at creation. Fixes the timestamp_start=null pattern in all
  // multi-session runs since 2026-06-05.
  let pipelineIdStart = null;
  if (typeof sentinel.pipeline_id === 'string') {
    const m = sentinel.pipeline_id.match(/^(\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?)/);
    // SEC-4 (v7.11.0): the regex is syntactic only — reject semantically invalid
    // timestamps (month 13, hour 25, ...) so the run-log never persists an
    // ISO-looking-but-unparseable timestamp_start.
    if (m && Number.isFinite(Date.parse(m[1]))) pipelineIdStart = m[1];
  }
  const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
  // SEC-5 (v7.11.0): prefer the first candidate that carries a TIME component —
  // a date-only created_at must not mask a full ISO start in pipeline_id.
  const startCandidates = [session.started_at, sentinel.created_at, pipelineIdStart];
  const startedAt = startCandidates.find((v) => typeof v === 'string' && v.trim() && !DATE_ONLY_RE.test(v.trim()))
    || startCandidates.find((v) => typeof v === 'string' && v.trim())
    || null;
  const endedAt = new Date().toISOString();
  let durationSec = null;
  if (startedAt && DATE_ONLY_RE.test(startedAt.trim())) {
    durationSec = null; // cannot compute — no time component
  } else if (startedAt) {
    const t1 = Date.parse(startedAt);
    const t2 = Date.parse(endedAt);
    if (Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1) {
      durationSec = Math.floor((t2 - t1) / 1000);
    } else if (Number.isFinite(t1) && Number.isFinite(t2) && t2 < t1) {
      // AUDIT-010 (v7.11.0): clock-skew guard — end before start. Keep both
      // timestamps for forensics, null the duration, and surface a warning
      // instead of writing a silently incoherent entry.
      warn(`buildRunLogEntry: timestamp_end (${endedAt}) precedes timestamp_start (${startedAt}) — clock skew; duration_seconds=null`);
    }
  }

  const totalTriggered = countGateTriggers(runFolder);
  const relPipelineDocPath = path.relative(repoRoot, runFolder).replace(/\\/g, '/') + '/';

  return {
    run_id: path.basename(runFolder),
    timestamp_start: startedAt,
    timestamp_end: endedAt,
    type,
    complexity,
    variant,
    total_gates_triggered: totalTriggered,
    total_gates_expected: gatesExpected,
    fidelity_score: fidelityScore,
    duration_seconds: durationSec,
    // D3 — final_decision cascade: session.status -> sentinel.final_decision ->
    // tail-scan gate-decisions.jsonl for CLOSEOUT_CONFIRM / PA_DE_CAL -> UNKNOWN.
    final_decision: (() => {
      if (session.status) return session.status;
      if (sentinel.final_decision) return sentinel.final_decision;
      const gdPath = path.join(runFolder, 'gate-decisions.jsonl');
      const tail = readTailLines(gdPath, 50).reverse();
      const DECISION_MAP = { CONFIRMED: 'GO', APPROVED: 'GO', BLOCKED: 'NO-GO', REJECTED: 'NO-GO' };
      for (const line of tail) {
        try {
          const ev = JSON.parse(line);
          if (ev && (ev.gate === 'CLOSEOUT_CONFIRM' || ev.gate === 'PA_DE_CAL')) {
            return DECISION_MAP[ev.decision] || ev.decision || 'UNKNOWN';
          }
        } catch (_e) { /* skip malformed line */ }
      }
      return 'UNKNOWN';
    })(),
    pipeline_doc_path: relPipelineDocPath,
  };
}

// v7.9.3 BUG 1 — run-log de-duplication.
// On 2026-06-01 a single run accumulated 31 run-log entries with only ~5
// distinct material signatures: the Stop hook re-appended an identical line on
// every session teardown. This pure guard compares only the MATERIAL fields of
// the candidate against the most-recent prior entry for the same run_id and
// reports whether the candidate is worth appending. Excluded from the
// comparison are the fields that ALWAYS change between teardowns
// (timestamp_start, timestamp_end, duration_seconds).
//
// SSOT for the material-field list. run_id identifies the run (not compared).
// Subset of lib/run-log.cjs REQUIRED_FIELDS. Intentionally omits timestamp_start,
// timestamp_end, duration_seconds (they differ between teardowns by construction).
// If REQUIRED_FIELDS gains a new material field, add it here too.
const RUNLOG_MATERIAL_FIELDS = [
  'type',
  'complexity',
  'variant',
  'total_gates_triggered',
  'total_gates_expected',
  'fidelity_score',
  'final_decision',
  'pipeline_doc_path',
];

// Null/undefined-aware equality: null, undefined and null-vs-undefined all count
// as equal to each other (covers legacy entries with absent fields, since `== null`
// matches both null and undefined); strict === otherwise.
function _materialEq(a, b) {
  return a === b || (a == null && b == null);
}

/**
 * Decide whether `candidate` should be appended to the run-log.
 *
 * @param {object} candidate       a run-log entry (12-field buildRunLogEntry shape)
 * @param {Array<object>} existingEntries  previously-written entries, in file order
 * @param {object} [sentinel]      optional sentinel state. Accepted per the F15 API
 *                                 contract but NOT consulted (see note at end of body).
 * @returns {boolean} true => append; false => skip (materially-identical duplicate)
 *
 * Pure: no fs, no I/O. Scans existingEntries from the end to find the LAST
 * entry whose run_id === candidate.run_id.
 */
function shouldAppendRunLogEntry(candidate, existingEntries, sentinel) {
  // Rule 1: first-ever entry for this run is always appended. This covers an
  // empty / non-array log AND a log that holds only OTHER runs.
  if (!Array.isArray(existingEntries) || existingEntries.length === 0) return true;

  let prior = null;
  for (let i = existingEntries.length - 1; i >= 0; i--) {
    const e = existingEntries[i];
    if (e && candidate && e.run_id === candidate.run_id) { prior = e; break; }
  }
  if (!prior) return true; // no prior entry for this run_id

  // Rule 2: compare only the material fields against the most-recent prior entry.
  let identical = true;
  for (const f of RUNLOG_MATERIAL_FIELDS) {
    if (!_materialEq(candidate[f], prior[f])) { identical = false; break; }
  }
  // Any material field differs => material change => append.
  if (!identical) return true;

  // Materially identical => skip.
  // `sentinel` is accepted per the API contract (CHANGE_CONTRACT + F15-S6) but is
  // intentionally not consulted: when the candidate is materially identical the skip
  // is already unconditional, so a sentinel-gated branch could never change the
  // outcome (it would be dead code). Reserved for a future fast-path.
  return false;
}

// v7.1.0 hardening (post-final-adversarial): single-call guard prevents the
// stdin-timeout race from invoking handleStop twice (SEC-3 / CLAR-4 race fix).
// v7.3.0 fix-loop 1 (SEC-4): companion _flushed guard for the langfuse-flush
// path so the two stdin completion branches (end vs timeout) can't double-fire.
let _handled = false;
let _flushed = false;

function handleStop(payload) {
  if (_handled) return;
  _handled = true;
  try {
    if (!payload || typeof payload !== 'object') return;
    const { session_id: sessionId, cwd } = payload;
    if (typeof sessionId === 'string' && !SESSION_ID_RE.test(sessionId)) {
      warn(`bogus session_id: ${sessionId}`);
      return;
    }
    if (typeof cwd !== 'string' || cwd.length === 0) {
      warn('missing cwd in payload');
      return;
    }
    if (!path.isAbsolute(cwd)) {
      // SEC-1 hardening: never join an untrusted relative cwd with module paths.
      warn(`refusing non-absolute cwd: ${cwd}`);
      return;
    }

    const runFolder = findActiveRunFolder(cwd);
    if (!runFolder) {
      // No active run — nothing to append. Not an error; happens on first session.
      return;
    }

    // Read the sentinel ONCE up front: it feeds both the fidelity-report
    // generation below and the dedup guard further down.
    const sentinel = readJsonSafe(path.join(runFolder, 'sentinel-state.json')) || {};

    // v7.9.3 BUG 2: generate the fidelity-report idempotently BEFORE building
    // the entry, so buildRunLogEntry can read a real numeric fidelity_score.
    ensureFidelityReport(runFolder, cwd, sentinel);

    const entry = buildRunLogEntry(runFolder, cwd);

    // RISK-1 / SEC-1 hardening: resolve lib/run-log.cjs relative to __dirname
    // (the hook's own location: <plugin>/.claude/hooks/) NOT the payload's cwd
    // (which is the user's project, where lib/run-log.cjs does NOT exist).
    // Using __dirname makes the resolution deterministic, install-layout-agnostic,
    // and unreachable by attacker-controlled payload data.
    const pluginRoot = path.resolve(__dirname, '..', '..');
    const runLogModule = path.join(pluginRoot, 'lib', 'run-log.cjs');
    if (!fs.existsSync(runLogModule)) {
      warn(`lib/run-log.cjs not found at ${runLogModule}`);
      return;
    }
    // eslint-disable-next-line global-require
    const { appendRunLog, readRunLog } = require(runLogModule);

    // v7.9.3 BUG 1 — pre-append dedup guard. Wrapped in its own try/catch: ANY
    // error inside the guard falls through to the current behavior (append) so
    // a guard bug can never silently swallow a legitimate run-log line.
    try {
      const existing = readRunLog(cwd); // soft-fails to [] internally
      if (shouldAppendRunLogEntry(entry, existing, sentinel) === false) {
        warn(`run-log dedup: skipping materially-identical entry for ${entry.run_id}`);
        return; // do NOT call appendRunLog
      }
    } catch (e) {
      warn(`run-log dedup guard error (falling through to append): ${e.message}`);
    }

    const result = appendRunLog(cwd, entry);
    if (!result || result.ok !== true) {
      warn(`appendRunLog failed: ${result && result.error ? result.error : 'unknown'}`);
    } else {
      // AUDIT-001 (v8.17.0): write-verify. Read the tail back and warn if the
      // run_id we just wrote is NOT the tail's run_id (the central log lost a
      // race, was truncated by a concurrent writer, or our entry was silently
      // dropped). Soft-fail by contract: any read/parse trouble is a no-op so
      // the teardown never blocks. The mismatch warn is the auditable signal
      // operators search for ('run-log verify mismatch').
      try { verifyRunLogAppend(cwd, entry.run_id); } catch (_e) { /* soft */ }
    }
  } catch (e) {
    warn(`top-level error swallowed: ${e.message}`);
  }
}

/**
 * AUDIT-001 (v8.17.0): tail-read verify for appendRunLog.
 *
 * Reads <repoRoot>/.pipeline/run-log.jsonl, takes the LAST non-empty line,
 * parses it, and compares its `run_id` against the one the stop-hook just
 * persisted. If they differ, emits ONE warn line that operators can grep:
 *   `run-log verify mismatch: expected <X> got <Y>`
 *
 * SOFT-fail contract: missing file, unreadable file, malformed tail line, or
 * any other error degrades to a silent no-op. NEVER throws. The verify is a
 * forensic guard — it must never become a new failure mode for teardown.
 */
function verifyRunLogAppend(repoRoot, expectedRunId) {
  try {
    if (typeof repoRoot !== 'string' || !repoRoot) return;
    if (typeof expectedRunId !== 'string' || !expectedRunId) return;
    const logPath = path.join(repoRoot, '.pipeline', 'run-log.jsonl');
    if (!fs.existsSync(logPath)) return; // missing -> soft pass
    let raw;
    try { raw = fs.readFileSync(logPath, 'utf8'); } catch (_e) { return; }
    const tailLines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (tailLines.length === 0) return;
    const last = tailLines[tailLines.length - 1];
    let parsed;
    try { parsed = JSON.parse(last); } catch (_e) {
      // Malformed tail: a concurrent writer mid-flight or a truncated row.
      // Not a forensic mismatch by contract — soft pass without warn.
      return;
    }
    const gotRunId = parsed && typeof parsed.run_id === 'string' ? parsed.run_id : '(none)';
    if (gotRunId !== expectedRunId) {
      warn(`run-log verify mismatch: expected ${expectedRunId} got ${gotRunId}`);
    }
  } catch (_e) { /* soft */ }
}

/**
 * langfuseFlushAndCleanup — invoke client.flushAsync() against a hard timeout
 * race, then clean up any leftover /tmp/langfuse-{trace,span}-<PPID>.json
 * files for the current process tree. Soft-fail: never propagates.
 *
 * Implements FR-5 / design §4.3. The 3s timeout is the contract; on hang we
 * log flush_timeout and continue. The mock SDK in F9-S7 hangs forever via
 * MOCK_HANG_FLUSH=1, which exercises this race directly.
 *
 * v7.3.0 fix-loop 1 (SEC-4): protected by _flushed guard so concurrent
 * invocations from the stdin-end + stdin-timeout branches do not race
 * each other on the SDK flush.
 */
async function langfuseFlushAndCleanup() {
  if (_flushed) return;
  _flushed = true;
  let isEnabledFn, getClientFn, logErrorFn;
  try {
    const clientLib = require(path.join(PLUGIN_ROOT_STOP, 'lib', 'langfuse-client.cjs'));
    isEnabledFn = clientLib.isEnabled;
    getClientFn = clientLib.getClient;
    logErrorFn = clientLib.logError;
  } catch (_e) {
    return; // langfuse-client not installed yet — nothing to do.
  }

  let timedOut = false;
  try {
    if (typeof isEnabledFn === 'function' && isEnabledFn()) {
      const client = typeof getClientFn === 'function' ? getClientFn() : null;
      if (client && typeof client.flushAsync === 'function') {
        const flushPromise = Promise.resolve().then(() => client.flushAsync());
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => { timedOut = true; resolve(); }, LANGFUSE_FLUSH_TIMEOUT_MS);
        });
        await Promise.race([flushPromise, timeoutPromise]).catch((e) => {
          try { logErrorFn && logErrorFn('sdk_throw', `flush threw: ${e && e.message}`, { hook_name: 'stop-hook' }); }
          catch (_e2) { /* swallow */ }
        });
        if (timedOut) {
          try { logErrorFn && logErrorFn('flush_timeout', `Langfuse flush exceeded ${LANGFUSE_FLUSH_TIMEOUT_MS}ms`, { hook_name: 'stop-hook' }); }
          catch (_e2) { /* swallow */ }
        }
      } else if (client && typeof client.flush === 'function') {
        try { client.flush(); } catch (_e2) { /* swallow */ }
      }
    }
  } catch (e) {
    try { logErrorFn && logErrorFn('unknown', `flush block error: ${e && e.message}`, { hook_name: 'stop-hook' }); }
    catch (_e2) { /* swallow */ }
  }

  // Cleanup leftover tmp carrier files for current process tree (PID + PPID).
  // Constants come from lib/langfuse-carrier.cjs so a rename there propagates
  // here automatically — no string-literal drift across modules.
  try {
    const dir = os.tmpdir();
    const pids = [process.pid, process.ppid].filter((p) => Number.isFinite(p) && p > 0);
    for (const pid of pids) {
      for (const prefix of [carrierLib.TRACE_PREFIX, carrierLib.SPAN_PREFIX]) {
        const p = path.join(dir, `${prefix}${pid}.json`);
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_e) { /* swallow */ }
      }
    }
  } catch (_e) { /* swallow */ }
}

// CLI entry point — stdin contains JSON payload from Claude Code Stop event.
if (require.main === module) {
  let stdin = '';
  let stdinOverflowed = false;
  process.stdin.on('data', (chunk) => {
    // SEC-4 (Batch 3): cap stdin at MAX_STDIN_BYTES. If a producer pumps
    // more, we discard the accumulated buffer and continue to drain so
    // the producer doesn't block on backpressure.
    if (stdinOverflowed) return;
    if (stdin.length + chunk.length > MAX_STDIN_BYTES) {
      warn(`stdin exceeded ${MAX_STDIN_BYTES} bytes; discarding payload`);
      stdin = '';
      stdinOverflowed = true;
      return;
    }
    stdin += chunk;
  });
  process.stdin.on('end', async () => {
    try {
      const payload = !stdinOverflowed && stdin.trim() ? JSON.parse(stdin) : {};
      handleStop(payload);
    } catch (e) {
      warn(`payload parse failed: ${e.message}`);
    }
    try { await langfuseFlushAndCleanup(); } catch (_e) { /* swallow */ }
    process.exit(0); // SOFT-fail: always exit 0
  });
  // Stdin-timeout fallback. RISK-3 (Batch 3): in the previous version this
  // path called handleStop({}), which is a guaranteed no-op (empty payload
  // fails the cwd check inside handleStop) — silently hiding the failure.
  // Now we log a single warn line and exit 0; absence of a payload after
  // 5s is documented as a skip, not a fake success.
  setTimeout(async () => {
    if (!stdin) {
      warn('stdin timeout after 5000ms with no payload; skipping run-log + langfuse flush');
      process.exit(0);
    }
  }, 5000).unref();
}

module.exports = { handleStop, buildRunLogEntry, ensureFidelityReport, readClassification, authoringVariantAllowed, shouldAppendRunLogEntry, findActiveRunFolder, langfuseFlushAndCleanup, verifyRunLogAppend };
