// .claude/hooks/cleanup-orphan-sentinel-state-hook.cjs
//
// Patch 5 (Phase 0 hardening) — SessionStart hook that automatically archives
// orphan sentinel-state.json files left over from prior pipeline runs.
//
// An orphan is a file under .pipeline/docs/** with:
//   - `pipeline_active: true`
//   - `last_updated` older than 24h (STALE_CONTEXT threshold per
//     references/stale-thresholds.md) OR missing entirely (treated as orphan
//     defensively)
//
// On match, the hook RENAMES the file to `sentinel-state.archived-<ts>.json`
// in the same directory. This removes it from the sentinel-hook scan path
// (which only looks for `sentinel-state.json` by name) while preserving the
// evidence for forensic post-hoc analysis. The rename is atomic.
//
// Why rename instead of mutate pipeline_active=false: the existing
// sentinel-hook treats `pipeline_active: false` as "no active pipeline" and
// silently allows downstream agents through. If we just mutated the field,
// the residual session would have NO sequence enforcement on any agent — a
// worse fail-open than the original orphan-blocks-bootstrap bug. Renaming
// makes the orphan invisible to the scan, restoring the bootstrap-whitelist
// behavior the sentinel-hook expects when no state file exists.
//
// Closes Achado B1-001 (CRITICAL, 2026-05-15): a 9-day-old wave8-spec
// sentinel-state.json blocked a fresh v5.3.0 audit run.
//
// Adversarial review followups addressed:
//   ADV-1 (race) — partial: stat-before-rename check (mtime CAS); concurrent
//                  multi-session edits remain a documented limitation.
//   ADV-2 (silent-fail-open downstream) — fixed: rename instead of mutate.
//   ADV-3 (path traversal) — fixed: cwd sandbox deny-list + realpath check.
//   ADV-4 (DoS via symlink/deep recursion) — fixed: MAX_WALK_DEPTH + symlink
//                  skip in findStateFiles.
//   ADV-6 (LIVE preservation not logged) — fixed: stderr summary always
//                  emitted, even when archived=0.
//
// DDD bounded context: this hook is OBSERVABILITY/MAINTENANCE on the state
// store. It does NOT emit gates and does NOT write to gate-decisions.jsonl —
// the per-run gate emission stays the controller's responsibility.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STALE_HOURS = 24;
const STALE_MS = STALE_HOURS * 60 * 60 * 1000;
const MAX_WALK_DEPTH = 10;

// Deny-list: cwd values that should never be scanned. Best-effort sandbox.
const SYSTEM_PATH_PREFIXES = [
  '/etc', '/sys', '/proc', '/dev', '/usr', '/bin', '/sbin', '/var',
  '/Library', '/System',
  'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
];

// ─── Pure functions (exported for unit testing) ────────────────────────────

function isCwdSandboxOk(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return false;
  let resolved;
  try {
    resolved = fs.realpathSync(cwd);
  } catch {
    // cwd does not resolve — treat as non-sandbox-ok (skip hook)
    return false;
  }
  const norm = resolved.toLowerCase();
  for (const prefix of SYSTEM_PATH_PREFIXES) {
    if (norm.startsWith(prefix.toLowerCase())) return false;
  }
  return true;
}

function findStateFiles(rootDir, opts) {
  const maxDepth = (opts && typeof opts.maxDepth === 'number') ? opts.maxDepth : MAX_WALK_DEPTH;
  const out = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      // ADV-4: skip symlinks entirely to prevent loops + cross-tree mutation.
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && entry.name === 'sentinel-state.json') {
        out.push(full);
      }
    }
  }

  walk(rootDir, 0);
  return out;
}

/**
 * Inspect a single sentinel-state.json file. Return one of:
 *   'live'              — active, recent — left alone
 *   'archived'          — active, stale — renamed to sentinel-state.archived-<ts>.json
 *   'already-inactive'  — pipeline_active was already false/missing — left alone
 *   'malformed'         — JSON parse error — left alone
 *   'invalid'           — parsed but not an object — left alone
 *   'read-error'        — could not read file — left alone
 *   'skip'              — not a regular file — left alone
 *   'stale-read'        — file changed between read and rename — left alone
 */
function cleanupOrphan(stateFile) {
  let stat;
  try {
    stat = fs.lstatSync(stateFile);
  } catch {
    return 'read-error';
  }
  if (!stat.isFile()) return 'skip';

  const readMtimeMs = stat.mtimeMs;

  let raw;
  try {
    raw = fs.readFileSync(stateFile, 'utf8');
  } catch {
    return 'read-error';
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return 'malformed';
  }

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return 'invalid';
  }

  if (state.pipeline_active !== true) return 'already-inactive';

  const lastUpdated = state.last_updated ? Date.parse(state.last_updated) : NaN;
  const ageMs = Number.isFinite(lastUpdated)
    ? Date.now() - lastUpdated
    : Number.POSITIVE_INFINITY;

  if (ageMs < STALE_MS) return 'live';

  // ADV-1 (race): re-stat before rename. If mtime changed, another writer
  // touched the file between our read and now — abort.
  let stat2;
  try {
    stat2 = fs.lstatSync(stateFile);
  } catch {
    return 'read-error';
  }
  if (stat2.mtimeMs !== readMtimeMs) {
    return 'stale-read';
  }

  // ORPHAN — rename (atomic on POSIX + NTFS for same-volume targets)
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const archivedPath = path.join(
    path.dirname(stateFile),
    `sentinel-state.archived-${ts}.json`
  );
  try {
    fs.renameSync(stateFile, archivedPath);
  } catch {
    return 'read-error';
  }
  return 'archived';
}

function handleSessionStart(payload) {
  const summary = {
    scanned: 0, archived: 0, live: 0,
    already_inactive: 0, malformed: 0, invalid: 0,
    stale_read: 0, errors: 0,
    skipped_reason: null,
  };
  if (!payload || typeof payload !== 'object') {
    summary.skipped_reason = 'no_payload';
    return summary;
  }

  const { cwd } = payload;
  // ADV-3: sandbox check.
  if (!isCwdSandboxOk(cwd)) {
    summary.skipped_reason = 'cwd_not_sandbox_ok';
    return summary;
  }

  const docsDir = path.join(cwd, '.pipeline', 'docs');
  if (!fs.existsSync(docsDir)) {
    summary.skipped_reason = 'no_docs_dir';
    return summary;
  }

  const stateFiles = findStateFiles(docsDir);
  summary.scanned = stateFiles.length;

  for (const stateFile of stateFiles) {
    try {
      const result = cleanupOrphan(stateFile);
      if (result === 'archived') summary.archived++;
      else if (result === 'live') summary.live++;
      else if (result === 'already-inactive') summary.already_inactive++;
      else if (result === 'malformed') summary.malformed++;
      else if (result === 'invalid') summary.invalid++;
      else if (result === 'stale-read') summary.stale_read++;
    } catch (err) {
      summary.errors++;
      process.stderr.write(
        `cleanup-orphan-sentinel-state-hook: ${stateFile}: ${err.message}\n`
      );
    }
  }

  // ADV-6: always emit summary, not just when archived > 0.
  if (summary.scanned > 0) {
    process.stderr.write(
      `cleanup-orphan-sentinel-state-hook: scanned=${summary.scanned} archived=${summary.archived} live=${summary.live} stale_read=${summary.stale_read} malformed=${summary.malformed} invalid=${summary.invalid} errors=${summary.errors}\n`
    );
  }

  return summary;
}

// ─── Entry point: read JSON payload from stdin ─────────────────────────────

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      payload = {};
    }
    handleSessionStart(payload);
    process.exit(0);
  });
  process.stdin.on('error', () => { process.exit(0); });
}

module.exports = {
  STALE_HOURS,
  STALE_MS,
  MAX_WALK_DEPTH,
  SYSTEM_PATH_PREFIXES,
  isCwdSandboxOk,
  findStateFiles,
  cleanupOrphan,
  handleSessionStart,
};
