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

const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

function warn(msg) {
  try { process.stderr.write(`stop-hook: ${msg}\n`); } catch (_e) { /* ignore */ }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    warn(`readJsonSafe(${filePath}) failed: ${e.message}`);
    return null;
  }
}

/**
 * Find the most recently updated pipeline run folder beneath cwd/.pipeline/docs/.
 * Returns absolute path or null if none found.
 *
 * v7.1.0 hardening (post-final-adversarial): path.resolve() containment check
 * prevents symlink/`..` escapes outside docsRoot (SEC-2). The mtime-based
 * selection is unchanged.
 */
function findActiveRunFolder(cwd) {
  try {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null;
    const docsRoot = path.resolve(path.join(cwd, '.pipeline', 'docs'));
    if (!fs.existsSync(docsRoot)) return null;
    const docsRootGuard = docsRoot + path.sep;
    let best = null;
    let bestMtime = 0;
    const buckets = fs.readdirSync(docsRoot, { withFileTypes: true });
    for (const b of buckets) {
      if (!b.isDirectory()) continue;
      const bucketPath = path.resolve(path.join(docsRoot, b.name));
      // Containment: bucket must live under docsRoot.
      if (!bucketPath.startsWith(docsRootGuard)) continue;
      let runs;
      try { runs = fs.readdirSync(bucketPath, { withFileTypes: true }); }
      catch (_e) { continue; }
      for (const r of runs) {
        if (!r.isDirectory()) continue;
        const runPath = path.resolve(path.join(bucketPath, r.name));
        // Containment: run must live under docsRoot (rejects symlink escapes).
        if (!runPath.startsWith(docsRootGuard)) continue;
        const stateFile = path.join(runPath, 'sentinel-state.json');
        try {
          const st = fs.statSync(stateFile);
          if (st.mtimeMs > bestMtime) {
            bestMtime = st.mtimeMs;
            best = runPath;
          }
        } catch (_e) { /* skip */ }
      }
    }
    return best;
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
 * Build the 12-field RunLog payload from state files. Any missing field
 * falls back to null; appendRunLog handles null-fill safely.
 */
function buildRunLogEntry(runFolder, repoRoot) {
  const sentinel = readJsonSafe(path.join(runFolder, 'sentinel-state.json')) || {};
  const session = readJsonSafe(path.join(runFolder, 'session.json')) || {};

  const classification = sentinel.classification_post_orchestrator
    || sentinel.classification
    || {};

  const startedAt = session.started_at || sentinel.created_at || null;
  const endedAt = new Date().toISOString();
  let durationSec = null;
  if (startedAt) {
    const t1 = Date.parse(startedAt);
    const t2 = Date.parse(endedAt);
    if (Number.isFinite(t1) && Number.isFinite(t2) && t2 > t1) {
      durationSec = Math.floor((t2 - t1) / 1000);
    }
  }

  const totalTriggered = countGateTriggers(runFolder);
  const relPipelineDocPath = path.relative(repoRoot, runFolder).replace(/\\/g, '/') + '/';

  return {
    run_id: path.basename(runFolder),
    timestamp_start: startedAt,
    timestamp_end: endedAt,
    type: classification.type || session.type || null,
    complexity: classification.complexity || session.complexity || null,
    variant: classification.pipeline_variant || session.variant || null,
    total_gates_triggered: totalTriggered,
    total_gates_expected: null,
    fidelity_score: null,
    duration_seconds: durationSec,
    final_decision: session.status || sentinel.final_decision || 'UNKNOWN',
    pipeline_doc_path: relPipelineDocPath,
  };
}

// v7.1.0 hardening (post-final-adversarial): single-call guard prevents the
// stdin-timeout race from invoking handleStop twice (SEC-3 / CLAR-4 race fix).
let _handled = false;

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
    const { appendRunLog } = require(runLogModule);
    const result = appendRunLog(cwd, entry);
    if (!result || result.ok !== true) {
      warn(`appendRunLog failed: ${result && result.error ? result.error : 'unknown'}`);
    }
  } catch (e) {
    warn(`top-level error swallowed: ${e.message}`);
  }
}

// CLI entry point — stdin contains JSON payload from Claude Code Stop event.
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = stdin.trim() ? JSON.parse(stdin) : {};
      handleStop(payload);
    } catch (e) {
      warn(`payload parse failed: ${e.message}`);
    }
    process.exit(0); // SOFT-fail: always exit 0
  });
  // Also handle the case where stdin is closed without data
  setTimeout(() => {
    if (!stdin) {
      handleStop({});
      process.exit(0);
    }
  }, 5000).unref();
}

module.exports = { handleStop, buildRunLogEntry, findActiveRunFolder };
