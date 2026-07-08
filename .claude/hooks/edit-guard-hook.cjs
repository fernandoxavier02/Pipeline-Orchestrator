// .claude/hooks/edit-guard-hook.cjs
const fs = require('node:fs');
const path = require('node:path');
const signer = require('../../lib/sentinel-state-signer.cjs');
const os = require('node:os');

const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_TTL_MINUTES = 60;
const OPENED_AT_SKEW_MS = 5000; // tolerate 5s clock skew for opened_at sanity check
const PAIRING_TOLERANCE_MS = 60000; // NI-3: +/- 60s audit-log timestamp tolerance
// STALE_HEARTBEAT_THRESHOLD_MS — 10 minutes (v5.3.0+ canonical name).
//
// Defense-in-depth: even if session-lock-hook's GC pass has not yet run,
// reject locks whose last_seen_at heartbeat is older than this. Locks lacking
// last_seen_at (legacy/pre-patch format) bypass this check and continue to
// rely on expires_at + Stop-hook cleanup, preserving backwards compatibility.
//
// NOMENCLATURE (per references/stale-thresholds.md):
//   - STALE_SPAWN (5 min, sentinel-hook): controller forgot Write between spawns
//   - STALE_HEARTBEAT (10 min, THIS file + session-lock-hook): lock owner is dead
//   - STALE_CONTEXT (24 h, gate registry): /pipeline continue on old context
// Three distinct concepts. See references/stale-thresholds.md for decision tree.
//
// Backwards compat: STALE_HEARTBEAT_MS exported as alias for one release.
const STALE_HEARTBEAT_THRESHOLD_MS = 10 * 60 * 1000;
const STALE_HEARTBEAT_MS = STALE_HEARTBEAT_THRESHOLD_MS; // deprecated alias, do not use in new code

// --- Dispatch-pending preventive lock (Fase 1, docs/plans/2026-06-17-dispatch-pending-lock.md) ---
// A pending DISPATCH_REQUEST/GATE_REQUEST/PLAN_MODE_REQUEST in sentinel-state means the
// controller asked the parent to dispatch/ask and is AWAITING_* a re-dispatch. Until that
// handshake is honored, the parent must NOT write production code (the Achado #7 failure mode
// that broke the Clínica Companion run). Blocks older than the handshake timeout are treated as
// dead (cleanup-orphan hook recovers them) so the lock never deadlocks forever.
const HANDSHAKE_TIMEOUT_FLOOR_MS = 60_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_HANDSHAKE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // SEC-4: ceiling — no env can hold the lock open for years
const PENDING_BLOCK_TYPES = new Set(['DISPATCH_REQUEST', 'GATE_REQUEST', 'PLAN_MODE_REQUEST']);

function getActiveLock(pipelineDir) {
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  // sessions present but unreadable (a file where a dir is expected → ENOTDIR, or
  // EACCES) must NOT crash the whole gate — treat as "no lock" and fail open here.
  let files;
  try { files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.lock')); }
  catch (_) { return null; }
  const now = Date.now();
  const candidates = [];
  for (const f of files) {
    try {
      const lock = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
      if (
        typeof lock.session_id === 'string' &&
        SESSION_ID_RE.test(lock.session_id) &&
        typeof lock.expires_at === 'number' &&
        lock.expires_at > now &&
        lock.status === 'active'
      ) {
        // Stale-heartbeat skip: if the lock advertises last_seen_at, enforce it.
        // Missing last_seen_at means pre-patch lock — fall through to legacy path.
        if (typeof lock.last_seen_at === 'number' &&
            now - lock.last_seen_at > STALE_HEARTBEAT_THRESHOLD_MS) {
          continue;
        }
        candidates.push(lock);
      }
    } catch (_) { /* skip malformed */ }
  }
  if (candidates.length === 0) return null;
  // Pick newest by created_at DESC; locks without created_at sort as 0 (oldest).
  candidates.sort((a, b) => {
    const aC = typeof a.created_at === 'number' ? a.created_at : 0;
    const bC = typeof b.created_at === 'number' ? b.created_at : 0;
    return bC - aC;
  });
  return candidates[0];
}


function findPairingEntry(pipelineDir, sessionId, openedAt) {
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return null;
  if (typeof openedAt !== 'number' || !Number.isFinite(openedAt)) return null;
  const docsRoot = path.join(pipelineDir, '.pipeline', 'docs');
  if (!fs.existsSync(docsRoot)) return null;
  let preDirs;
  try {
    preDirs = fs.readdirSync(docsRoot).filter((d) => /^Pre-.*-action$/.test(d));
  } catch (_) { return null; }

  // Collect ALL entries (OPEN and CLOSE) for this session across all gate-decisions.jsonl files.
  // NI-3 fix pass 1 (concern #3 stale-OPEN reuse): we must be able to tell if an OPEN
  // was already consumed by a subsequent CLOSE before the window's opened_at. If so,
  // the OPEN cannot pair with a new window — an attacker could otherwise re-use a
  // legitimate OPEN timestamp within the +/-60s tolerance after its session was closed.
  const allEntries = [];
  for (const preDir of preDirs) {
    const preDirPath = path.join(docsRoot, preDir);
    let subdirs;
    try {
      subdirs = fs.readdirSync(preDirPath, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch (_) { continue; }
    for (const sub of subdirs) {
      const jsonlPath = path.join(preDirPath, sub, 'gate-decisions.jsonl');
      if (!fs.existsSync(jsonlPath)) continue;
      let fileContent;
      try { fileContent = fs.readFileSync(jsonlPath, 'utf8'); } catch (_) { continue; }
      const lines = fileContent.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        let entry;
        try { entry = JSON.parse(line); } catch (_) { continue; }
        if (
          entry &&
          (entry.gate === 'EXEC_WINDOW_OPEN' || entry.gate === 'EXEC_WINDOW_CLOSE') &&
          typeof entry.session_id === 'string' &&
          entry.session_id === sessionId &&
          typeof entry.timestamp === 'number' &&
          Number.isFinite(entry.timestamp)
        ) {
          allEntries.push(entry);
        }
      }
    }
  }

  if (allEntries.length === 0) return null;
  allEntries.sort((a, b) => a.timestamp - b.timestamp);

  // Candidates: OPENs within +/-60s of openedAt
  const candidates = allEntries.filter((e) =>
    e.gate === 'EXEC_WINDOW_OPEN' &&
    Math.abs(e.timestamp - openedAt) <= PAIRING_TOLERANCE_MS
  );

  // Reject OPENs that were consumed by a CLOSE strictly after them and on/before openedAt.
  for (const open of candidates) {
    const consumed = allEntries.some((e) =>
      e.gate === 'EXEC_WINDOW_CLOSE' &&
      e.timestamp > open.timestamp &&
      e.timestamp <= openedAt
    );
    if (!consumed) return open;
  }
  return null;
}

function appendAuditEntry(pipelineDir, gate, sessionId, detail) {
  const docsRoot = path.join(pipelineDir, '.pipeline', 'docs');
  // NI-3 fix pass 1 (concern #7 pollution): fail closed when there is no real
  // Pre-*-action/*/ folder. Synthesizing a fake "auto-exec-window" folder would
  // pollute the docs tree and confuse pipeline reporting/validators. Callers
  // must only open/close exec-windows within an active pipeline context.
  if (!fs.existsSync(docsRoot)) {
    throw new Error('no Pre-*-action folder found: .pipeline/docs/ does not exist (not in an active pipeline context)');
  }
  let bestDir = null;
  let bestMtime = -1;
  let preDirs = [];
  try {
    preDirs = fs.readdirSync(docsRoot).filter((d) => /^Pre-.*-action$/.test(d));
  } catch (_) {}
  for (const preDir of preDirs) {
    const preDirPath = path.join(docsRoot, preDir);
    let subdirs;
    try {
      subdirs = fs.readdirSync(preDirPath, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch (_) { continue; }
    for (const sub of subdirs) {
      const fullPath = path.join(preDirPath, sub.name);
      try {
        const st = fs.statSync(fullPath);
        if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; bestDir = fullPath; }
      } catch (_) {}
    }
  }
  if (!bestDir) {
    throw new Error('no Pre-*-action folder found (active pipeline must exist before opening exec-window)');
  }
  const jsonlPath = path.join(bestDir, 'gate-decisions.jsonl');
  const safeDetail = String(detail || '').slice(0, 200).replace(/[\r\n]/g, ' ');
  const entry = { gate, hardness: 'AUDIT', session_id: sessionId, timestamp: Date.now(), detail: safeDetail };
  fs.appendFileSync(jsonlPath, JSON.stringify(entry) + '\n');
  return entry;
}

function getActiveExecWindow(pipelineDir, lockSessionId) {
  // Cooperative authorization: when a pipeline-controller spawns N2 executor agents,
  // it writes .pipeline/sessions/{session_id}.exec-window to temporarily authorize
  // Edit/Write outside .pipeline/. This is NOT cryptographic protection — see
  // CHANGELOG/MIGRATION security disclaimer.
  //
  // v4.1.3: opened_at is derived from fs.statSync(file).mtimeMs, the filesystem's
  // authoritative timestamp. JSON.opened_at and JSON.expires_at are IGNORED for
  // validation (LLM-fabricated, unreliable). This removes the failure mode where
  // a controller LLM with a stale internal clock would write opened_at far in the
  // past or future, making the window appear permanently expired or pre-armed.
  // Effective TTL is derived from JSON.ttl_minutes (preferred), or back-derived
  // from JSON.expires_at - JSON.opened_at (legacy compat), or defaults to 5.
  if (typeof lockSessionId !== 'string' || !SESSION_ID_RE.test(lockSessionId)) return null;
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  // As in getActiveLock: an unreadable sessions dir must not crash the gate.
  let files;
  try { files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.exec-window')); }
  catch (_) { return null; }
  const now = Date.now();
  for (const f of files) {
    const filePath = path.join(sessionsDir, f);
    try {
      const win = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (
        typeof win.session_id !== 'string' ||
        !SESSION_ID_RE.test(win.session_id) ||
        win.session_id !== lockSessionId
      ) continue;

      // Authoritative opened_at: filesystem mtime (not the LLM-supplied JSON field).
      let openedAt;
      try {
        openedAt = fs.statSync(filePath).mtimeMs;
      } catch (_) {
        continue;
      }

      // Effective TTL minutes: prefer ttl_minutes; else back-derive from legacy
      // expires_at - opened_at; else default 5.
      let ttlMinutes;
      if (typeof win.ttl_minutes === 'number' && Number.isFinite(win.ttl_minutes) && win.ttl_minutes > 0) {
        ttlMinutes = win.ttl_minutes;
      } else if (
        typeof win.expires_at === 'number' &&
        typeof win.opened_at === 'number' &&
        win.expires_at > win.opened_at
      ) {
        ttlMinutes = (win.expires_at - win.opened_at) / 60000;
      } else {
        ttlMinutes = 5;
      }
      if (ttlMinutes > MAX_TTL_MINUTES) {
        process.stderr.write('edit-guard: skipping window with effective TTL > ' + MAX_TTL_MINUTES + 'min (file=' + f + ')\n');
        continue;
      }

      const effectiveExpiresAt = openedAt + ttlMinutes * 60 * 1000;
      if (effectiveExpiresAt <= now) {
        // Window expired by filesystem clock; ignore.
        continue;
      }

      // Pairing accepts a match against either the filesystem mtime (authoritative)
      // OR the JSON.opened_at field (LLM-fabricated, may be skewed). Accepting both
      // covers the common case where the controller LLM writes a stale-clock
      // timestamp consistently into BOTH the exec-window and the audit-log entry —
      // they pair against each other even though both disagree with the wall clock.
      // Defense-in-depth (forging only ONE of the two) remains: forging just the
      // window without a matching audit entry still fails.
      let pairing = findPairingEntry(pipelineDir, win.session_id, openedAt);
      if (!pairing && typeof win.opened_at === 'number' && Number.isFinite(win.opened_at)) {
        pairing = findPairingEntry(pipelineDir, win.session_id, win.opened_at);
      }
      if (!pairing) {
        process.stderr.write('edit-guard: skipping window without paired EXEC_WINDOW_OPEN audit entry (file=' + f + ')\n');
        continue;
      }

      // Return the window object with normalized timestamps so callers see the
      // values the hook actually used for the authorization decision.
      return Object.assign({}, win, {
        opened_at: openedAt,
        expires_at: effectiveExpiresAt,
        ttl_minutes: ttlMinutes,
      });
    } catch (_) { /* skip malformed */ }
  }
  return null;
}


/**
 * Opens an exec-window authorizing Edit/Write outside .pipeline/ for a given session.
 * Called by the pipeline-controller agent BEFORE spawning an N2 executor agent.
 *
 * @param {string} pipelineDir - The project cwd (parent of .pipeline/)
 * @param {string} sessionId - Current pipeline session_id (must match the lock's session_id)
 * @param {object} [opts]
 * @param {number} [opts.ttl_minutes=5] - window lifetime in minutes (default 5, was 30 prior to v4.1)
 * @param {string} [opts.purpose] - human-readable reason, surfaces in audit log
 * @param {string} [opts.spawning_agent] - N2 agent subagent_type about to be spawned
 * @returns {object} the window metadata written to disk
 * @throws if sessionId fails regex validation
 */
function openExecWindow(pipelineDir, sessionId, opts = {}) {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error('invalid session_id');
  }
  // Defense-in-depth: refuse to create orphan exec-window without an active
  // matching lock. Without this, a compromised caller could create a window
  // that lingers with no lock, a surface the hook would honor.
  const lock = getActiveLock(pipelineDir);
  if (!lock || lock.session_id !== sessionId) {
    throw new Error('no active lock for session ' + sessionId);
  }
  const ttlMinutes = opts.ttl_minutes ?? 5;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error('ttl_minutes must be a finite number > 0');
  }
  if (ttlMinutes > MAX_TTL_MINUTES) {
    throw new Error(`ttl_minutes must be <= ${MAX_TTL_MINUTES}`);
  }
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const now = Date.now();
  // v4.1.3: ttl_minutes is the authoritative TTL field consumed by the hook.
  // opened_at/expires_at are kept for backward-compat with legacy readers but
  // are IGNORED by getActiveExecWindow (which uses mtime + ttl_minutes).
  const window = {
    session_id: sessionId,
    ttl_minutes: ttlMinutes,
    opened_at: now,
    expires_at: now + ttlMinutes * 60 * 1000,
    purpose: opts.purpose || '',
    spawning_agent: opts.spawning_agent || '',
  };
  const finalPath = path.join(sessionsDir, `${sessionId}.exec-window`);
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(window, null, 2));
    fs.renameSync(tmpPath, finalPath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
    throw err;
  }
  try {
    appendAuditEntry(pipelineDir, 'EXEC_WINDOW_OPEN', sessionId, opts.purpose || '');
  } catch (err) {
    // NI-3 fix pass 1 (concern #7): if audit append fails (e.g. no Pre-*-action
    // folder), roll back the window write and propagate. An unpaired window
    // would be rejected by the hook anyway (see findPairingEntry), and leaving
    // it on disk is confusing. Fail closed instead.
    process.stderr.write('edit-guard: appendAuditEntry(EXEC_WINDOW_OPEN) failed: ' + err.message + '\n');
    try { fs.unlinkSync(finalPath); } catch (_) { /* ignore */ }
    throw err;
  }
  return window;
}

/**
 * Closes an exec-window for a given session. Idempotent: no error if window doesn't exist.
 * Called by the pipeline-controller agent AFTER an N2 executor agent returns.
 *
 * @param {string} pipelineDir - The project cwd
 * @param {string} sessionId - Current pipeline session_id
 * @returns {boolean} true if a window was deleted, false if none existed
 */
function closeExecWindow(pipelineDir, sessionId) {
  if (!SESSION_ID_RE.test(sessionId)) {
    return false;
  }
  const windowPath = path.join(pipelineDir, '.pipeline', 'sessions', `${sessionId}.exec-window`);
  let existed = false;
  try { fs.statSync(windowPath); existed = true; } catch (_) { /* no window */ }
  if (existed) {
    try {
      appendAuditEntry(pipelineDir, 'EXEC_WINDOW_CLOSE', sessionId, '');
    } catch (err) {
      process.stderr.write('edit-guard: appendAuditEntry(EXEC_WINDOW_CLOSE) failed: ' + err.message + '\n');
    }
  }
  try {
    fs.unlinkSync(windowPath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

function shouldBlock(filePath, pipelineDir) {
  if (typeof filePath !== 'string' || typeof pipelineDir !== 'string') {
    return { block: true, reason: 'PIPELINE_LOCK_ACTIVE: invalid payload (failing closed)' };
  }
  const lock = getActiveLock(pipelineDir);
  if (!lock) return { block: false };

  const normalizedFile = path.resolve(pipelineDir, filePath);
  const pipelinePath = path.resolve(path.join(pipelineDir, '.pipeline'));
  // v5.1.0: per-run directory pipeline-runs/<NNN>-<slug>/ is whitelisted
  // alongside .pipeline/ — controllers and executor agents need to write
  // 00-brainstorm/, 01-spec/, 02-validations/, 03-execution/ artifacts.
  const pipelineRunsPath = path.resolve(path.join(pipelineDir, 'pipeline-runs'));
  const norm = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  const nf = norm(normalizedFile);
  const np = norm(pipelinePath);
  const npr = norm(pipelineRunsPath);
  const isInsidePipeline = nf === np || nf.startsWith(np + path.sep);
  const isInsidePipelineRuns = nf === npr || nf.startsWith(npr + path.sep);

  if (isInsidePipeline || isInsidePipelineRuns) return { block: false };

  // F-001: exec-window cooperative authorization for N2 executor agents.
  // When an active, non-expired exec-window exists for the locked session_id,
  // allow Edit/Write outside .pipeline/. Controller is responsible for
  // opening/closing the window around N2 spawns.
  const execWindow = getActiveExecWindow(pipelineDir, lock.session_id);
  if (execWindow) {
    return { block: false, reason: 'exec_window_active', execWindow, lock };
  }

  // SEC-1 (F4/S1): shouldBlock is the FIRST gate in handlePreToolUse and returns IMMEDIATELY, so the
  // spec-artifact exemption the later gates honor (through isExemptPath) is unreachable from here. A
  // real /spec run arms a session-lock for the 'spec' entry point, but the spec-controller writes its
  // .kiro/specs/** artifacts DIRECTLY and never opens an exec-window — so without this branch the very
  // first spec-artifact write of a locked Spec run hits PIPELINE_LOCK_ACTIVE (the 2026-06-29 deadlock
  // this slice exists to close). Release ONLY the exact verified-spec-artifact case (same PRESENT+VALID
  // HMAC gate as the isExemptPath grant point, target anchored repo-relative inside the run's OWN spec
  // folder). PIPELINE_LOCK_ACTIVE still holds for everything else — production code, cross-spec targets,
  // non-Spec runs, and unsigned/invalid/key-unavailable state.
  if (isVerifiedSpecArtifactWrite(filePath, pipelineDir)) {
    return { block: false, reason: 'spec_artifact_exempt', lock };
  }

  return {
    block: true,
    reason: `PIPELINE_LOCK_ACTIVE: ${buildBlockMessage(filePath, lock.session_id)}`,
    lock,
  };
}

function buildBlockMessage(filePath, sessionId) {
  return (
    `Pipeline session ${sessionId} is active. Direct edits to ${filePath} are blocked. ` +
    `Spawn Agent(subagent_type: "pipeline-orchestrator:core:pipeline-controller", ...) to orchestrate changes. ` +
    `If this edit is being performed by a pipeline-controller-spawned executor agent, ensure the controller ` +
    `opened an exec-window via Write to .pipeline/sessions/${sessionId}.exec-window before the edit. ` +
    `To resume this session, run /pipeline-orchestrator:pipeline continue. ` +
    `The lock is released automatically when Claude Code stops (Stop hook cleanup). ` +
    `As a last resort only, you may manually delete .pipeline/sessions/${sessionId}.lock.`
  );
}

function resolveHandshakeTimeoutMs() {
  const raw = process.env.PIPELINE_HANDSHAKE_TIMEOUT_MS;
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= HANDSHAKE_TIMEOUT_FLOOR_MS) return Math.min(n, MAX_HANDSHAKE_TIMEOUT_MS);
  if (Number.isFinite(n) && n > 0) return HANDSHAKE_TIMEOUT_FLOOR_MS; // honor floor for tiny overrides
  return DEFAULT_HANDSHAKE_TIMEOUT_MS;
}

// Sentinel returned by findActiveSentinelState when an AUTHORITATIVELY-discovered run state
// exists on disk but is unreadable/corrupt → callers must fail CLOSED (block).
const CORRUPT_SENTINEL = '__CORRUPT_SENTINEL_STATE__';

// Discover the active run's sentinel-state.json path with canonical precedence (mirrors
// sentinel-hook, closing the mtime-substitution hole). `authoritative` is true when the path
// came from an explicit pointer (env / active-run.json / run id) rather than the mtime fallback.
//   1. PIPELINE_DOC_PATH env  — only if it resolves INSIDE this project's .pipeline/
//   2. <cwd>/.pipeline/active-run.json pointer (pipeline_doc_path, contained)
//   3. PIPELINE_RUN_ID env matched to a Pre-*-action/<run>/ folder
//   4. most-recently-modified Pre-*-action/*/sentinel-state.json  (NON-authoritative fallback)
function discoverStatePath(pipelineDir) {
  const norm = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  const base = path.resolve(path.join(pipelineDir, '.pipeline'));
  const contained = (p) => {
    const r = norm(path.resolve(p));
    return r === norm(base) || r.startsWith(norm(base) + path.sep);
  };
  const docsRoot = path.join(pipelineDir, '.pipeline', 'docs');

  // 1. PIPELINE_DOC_PATH (use the RESOLVED path, not the raw env string — CLAR-1 fix)
  const docPathEnv = process.env.PIPELINE_DOC_PATH;
  if (typeof docPathEnv === 'string' && docPathEnv.trim()) {
    const resolved = path.resolve(docPathEnv);
    if (contained(resolved)) return { statePath: path.join(resolved, 'sentinel-state.json'), authoritative: true };
  }
  // 2. active-run.json pointer
  try {
    const ptr = JSON.parse(fs.readFileSync(path.join(pipelineDir, '.pipeline', 'active-run.json'), 'utf8'));
    if (ptr && typeof ptr.pipeline_doc_path === 'string' && contained(ptr.pipeline_doc_path)) {
      return { statePath: path.join(path.resolve(ptr.pipeline_doc_path), 'sentinel-state.json'), authoritative: true };
    }
  } catch (_) { /* no pointer */ }
  // 3. PIPELINE_RUN_ID
  const runId = process.env.PIPELINE_RUN_ID;
  if (typeof runId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(runId)) {
    try {
      for (const preDir of fs.readdirSync(docsRoot).filter((d) => /^Pre-.*-action$/.test(d))) {
        const cand = path.join(docsRoot, preDir, runId, 'sentinel-state.json');
        if (fs.existsSync(cand)) return { statePath: cand, authoritative: true };
      }
    } catch (_) { /* */ }
  }
  // 4. mtime fallback (non-authoritative)
  const walked = [];
  try {
    for (const preDir of fs.readdirSync(docsRoot).filter((d) => /^Pre-.*-action$/.test(d))) {
      const preDirPath = path.join(docsRoot, preDir);
      let subs;
      try { subs = fs.readdirSync(preDirPath, { withFileTypes: true }).filter((e) => e.isDirectory()); }
      catch (_) { continue; }
      for (const sub of subs) {
        const p = path.join(preDirPath, sub.name, 'sentinel-state.json');
        try { walked.push({ p, mtime: fs.statSync(p).mtimeMs }); } catch (_) { /* */ }
      }
    }
  } catch (_) { /* no docs root */ }
  walked.sort((a, b) => b.mtime - a.mtime);
  if (walked.length) return { statePath: walked[0].p, authoritative: false };
  return { statePath: null, authoritative: false };
}

// Returns the parsed state object, null (absent / non-authoritative-unreadable → fail-open),
// or CORRUPT_SENTINEL (authoritatively-pointed run whose state is unreadable → fail-closed).
function findActiveSentinelState(pipelineDir) {
  const { statePath, authoritative } = discoverStatePath(pipelineDir);
  if (!statePath) return null;
  let raw;
  try { raw = fs.readFileSync(statePath, 'utf8'); }
  catch (_) { return authoritative ? CORRUPT_SENTINEL : null; }
  let state;
  try { state = JSON.parse(raw); }
  catch (_) { return authoritative ? CORRUPT_SENTINEL : null; }
  if (!state || typeof state !== 'object') return authoritative ? CORRUPT_SENTINEL : null;
  // SEC-1: for an AUTHORITATIVELY-pointed run, reject a PRESENT-but-INVALID signature (tampering on
  // disk). Unsigned states and an unavailable key are tolerated (migration / read-only) unless
  // PIPELINE_HMAC_STRICT. mtime-fallback (non-authoritative) is advisory and not verified here.
  if (authoritative) {
    let v;
    try { v = signer.verifyState(state, { key: signer.readHmacKey() }); }
    catch (_) { v = { valid: true }; }
    if (!v.valid && !v.unsigned && !v.key_unavailable) return CORRUPT_SENTINEL;
  }
  return state;
}

// v8.22.0 (T1, loop hook-unblock): 'already dispatched' exemption. dispatch-record-hook.cjs
// (PreToolUse:Agent) persists pending_dispatches[tool_use_id] = { subagent_type, created_at, ... }
// into the SAME signed state the gates read — on-disk proof that the pending DISPATCH_REQUEST's
// target was genuinely spawned. Subagents share the parent session, so keeping the block live
// after the spawn denies the dispatched subagent's own Bash/Write — the egg-and-chicken deadlock
// that killed run 2026-07-04-e2e-ruler-recalibration-s2 (even the exec-window open script was
// denied by the very gate it unblocks). Target matching mirrors isResolutionAgent
// (dispatch-pending-gate.cjs): exact id or leaf containment.
function dispatchTargetMatches(dispatchId, subagentType) {
  if (typeof dispatchId !== 'string' || !dispatchId) return false;
  if (typeof subagentType !== 'string' || !subagentType) return false;
  if (dispatchId === subagentType) return true;
  const leaf = subagentType.split(':').pop();
  return !!leaf && (dispatchId.includes(leaf) || leaf.includes(dispatchId));
}

// A DISPATCH_REQUEST pending block is satisfied-by-spawn when a pending_dispatches record
// matches its target AND was created at/after the request (>= inclusive; an OLD spawn of the
// same target does NOT satisfy a NEW request). GATE_REQUEST/PLAN_MODE_REQUEST are resolved by
// the user, never by a spawn — out of scope. Shape-guarded: pending_dispatches must be a plain
// object (the dispatch-record-hook contract); an array or malformed record never exempts.
function pendingAlreadyDispatched(state, block) {
  if (!state || typeof state !== 'object') return false;
  if (!block || typeof block !== 'object') return false;
  if (block.block_type !== 'DISPATCH_REQUEST') return false;
  if (typeof block.dispatch_id !== 'string' || !block.dispatch_id) return false;
  const emitted = typeof block.emitted_at === 'string' ? Date.parse(block.emitted_at)
    : typeof block.emitted_at === 'number' ? block.emitted_at : NaN;
  if (!Number.isFinite(emitted)) return false;
  const pd = state.pending_dispatches;
  if (!pd || typeof pd !== 'object' || Array.isArray(pd)) return false;
  for (const key of Object.keys(pd)) {
    const rec = pd[key];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    const created = typeof rec.created_at === 'string' ? Date.parse(rec.created_at)
      : typeof rec.created_at === 'number' ? rec.created_at : NaN;
    if (!Number.isFinite(created) || created < emitted) continue;
    if (dispatchTargetMatches(block.dispatch_id, rec.subagent_type)) return true;
  }
  return false;
}

// v8.22.0 (T4, loop hook-unblock): disk-truth resolution. A DISPATCH_REQUEST whose id
// already has a matching DISPATCH_RESULT recorded in the run's protocol-events.jsonl
// (at/after the request) is RESOLVED — even when the PostToolUse clear (T3) never ran
// (prior session, crash mid-run). This is what the sentinel proved BY HAND to clear the
// false 482-minute PROTOCOL_HANDSHAKE_TIMEOUT on 2026-07-04. Scope: DISPATCH_REQUEST
// only (GATE/PLAN_MODE are resolved by the user, not by an event append). Bounded tail
// read; an absent/unreadable events file keeps the current behavior (still live).
const PROTOCOL_EVENTS_TAIL_BYTES = 262144;
function pendingResolvedByEvents(state, block, docDir) {
  if (!block || typeof block !== 'object') return false;
  if (block.block_type !== 'DISPATCH_REQUEST') return false;
  if (typeof block.dispatch_id !== 'string' || !block.dispatch_id) return false;
  const emitted = typeof block.emitted_at === 'string' ? Date.parse(block.emitted_at)
    : typeof block.emitted_at === 'number' ? block.emitted_at : NaN;
  if (!Number.isFinite(emitted)) return false;
  const dir = (typeof docDir === 'string' && docDir) ? docDir
    : (state && typeof state.pipeline_doc_path === 'string' ? state.pipeline_doc_path : '');
  if (!dir) return false;
  let raw;
  try {
    const evPath = path.join(dir, 'protocol-events.jsonl');
    const st = fs.statSync(evPath);
    const start = st.size > PROTOCOL_EVENTS_TAIL_BYTES ? st.size - PROTOCOL_EVENTS_TAIL_BYTES : 0;
    const fd = fs.openSync(evPath, 'r');
    try {
      const len = st.size - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      raw = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return false; }
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.indexOf('DISPATCH_RESULT') === -1) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; } // truncated tail head → skip
    if (!ev || ev.event !== 'DISPATCH_RESULT' || ev.id !== block.dispatch_id) continue;
    const ts = typeof ev.timestamp === 'string' ? Date.parse(ev.timestamp) : NaN;
    if (Number.isFinite(ts) && ts >= emitted) return true;
  }
  return false;
}

function findLivePendingBlock(state, timeoutMs) {
  if (!state || !Array.isArray(state.pending_blocks)) return null;
  const now = Date.now();
  for (const b of state.pending_blocks) {
    if (!b || typeof b !== 'object') continue;
    if (!PENDING_BLOCK_TYPES.has(b.block_type)) continue;
    const emitted = typeof b.emitted_at === 'string' ? Date.parse(b.emitted_at)
      : typeof b.emitted_at === 'number' ? b.emitted_at : NaN;
    if (!Number.isFinite(emitted)) continue;
    // age > timeout → dead handshake (recovery via cleanup-orphan); negative age (future skew)
    // is treated as live (0) so a fabricated future emitted_at cannot dodge the lock.
    if (now - emitted > timeoutMs) continue;
    // v8.22.0: a DISPATCH_REQUEST whose target was already spawned (recorded in this same
    // state by dispatch-record-hook) is satisfied — not live. The gate keeps blocking
    // between REQUEST and spawn; the CORRUPT (tampered) branch never reaches here.
    if (pendingAlreadyDispatched(state, b)) continue;
    // v8.22.0 (T4): a request whose RESULT is already on disk is resolved, not live.
    if (pendingResolvedByEvents(state, b)) continue;
    return b;
  }
  return null;
}

function isInsidePipelineDirs(filePath, pipelineDir) {
  const normalizedFile = path.resolve(pipelineDir, filePath);
  const pipelinePath = path.resolve(path.join(pipelineDir, '.pipeline'));
  const pipelineRunsPath = path.resolve(path.join(pipelineDir, 'pipeline-runs'));
  const norm = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  const nf = norm(normalizedFile);
  const np = norm(pipelinePath);
  const npr = norm(pipelineRunsPath);
  return nf === np || nf.startsWith(np + path.sep) || nf === npr || nf.startsWith(npr + path.sep);
}

// v8.2.1: the harness Plan-Mode plan file lives in the user config dir (~/.claude/plans or
// $CLAUDE_CONFIG_DIR/plans), OUTSIDE .pipeline/. Writing the plan IS planning, not production
// code — so the gate must exempt it, or it deadlocks Plan Mode itself (the gate arms in Phase 0,
// then blocks the plan file the controller must write in Phase 1.5). Found by live dogfood.
function isPlanFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false;
  let resolved;
  try { resolved = path.resolve(filePath); } catch (_) { return false; }
  const norm = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const candidates = [];
  if (process.env.CLAUDE_CONFIG_DIR) candidates.push(path.resolve(process.env.CLAUDE_CONFIG_DIR, 'plans'));
  try { candidates.push(path.resolve(os.homedir(), '.claude', 'plans')); } catch (_) {}
  for (const c of candidates) {
    const nc = process.platform === 'win32' ? c.toLowerCase() : c;
    if (norm === nc || norm.startsWith(nc + path.sep)) return true;
  }
  // generic fallback: any path segment that STARTS WITH `.claude` immediately
  // followed by a `plans` segment — covers nonstandard config dirs like
  // `.claude-conta2`. LIVE DOGFOOD (chain-tied enforcement build, 2026-06-26):
  // $CLAUDE_CONFIG_DIR was `.claude-conta2`; the old hardcoded `${sep}.claude${sep}plans`
  // segment missed it and the session-lock/edit-guard deadlocked Plan Mode's own
  // plan file — the harness could not write the approved plan it required.
  const segs = norm.split(path.sep);
  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i].startsWith('.claude') && segs[i + 1] === 'plans') return true;
  }
  return false;
}

// v8.21.0 (F4 / Slice S1): normalize a forward-or-back-slash path (relative to the shared repo
// root) into resolved segments — dropping leading './' and resolving '.'/'..' — so targetPath and
// spec_path are anchored against the SAME base and compared by path-SEGMENT containment rather than
// raw string-prefix (the OVER-EXEMPTION / FALSE-NEGATIVE hazard the F4 header pins).
//
// CASE-SENSITIVITY (CLAR-1, deliberate): the segments produced here are compared CASE-SENSITIVELY by
// isUnderKiroSpecs and by the containment loop in isSpecArtifactWrite — a deliberate break from the
// win32-lowercase normalization the rest of this file uses (isInsidePipelineDirs, isPlanFile,
// discoverStatePath). The difference is intentional because those predicates DENY/contain, whereas
// this one GRANTS an access exemption: lowercasing would only LOOSEN the match (hand the exemption to
// case-variant targets like '.Kiro/Specs/…'), the opposite of the hardening this slice is about, and
// would make an otherwise-pure predicate platform-dependent. Kiro emits spec paths with consistent
// casing, so there is no real false-negative. Pinned by test F4-5.6 so a refactor cannot silently flip
// this predicate to case-insensitive without updating the contract.
function specPathSegments(p) {
  if (typeof p !== 'string') return [];
  const normalized = path.posix.normalize(p.replace(/\\/g, '/'));
  return normalized.split('/').filter((s) => s && s !== '.');
}

// A segment list is inside .kiro/specs/<run>/… only when it starts with those two segments AND
// carries at least a named run folder beneath them. Guards the empty/root spec_path over-exemption
// (a spec_path of '.' or '/' must NOT turn every .kiro/specs write into a spec-artifact write).
function isUnderKiroSpecs(segs) {
  return Array.isArray(segs) && segs.length >= 3 && segs[0] === '.kiro' && segs[1] === 'specs';
}

// A Write/Edit that lands INSIDE .kiro/specs/** is a legitimate spec-artifact write — exempt from
// the production-code locks — ONLY when the active run is a verified Spec-authoring run and the
// target lives INSIDE that run's OWN spec folder. Pure and fail-closed: anything it cannot
// positively vouch for (no run / CORRUPT_SENTINEL / wrong type / empty spec_path / cross-spec
// target / production path) returns false, leaving the write subject to the gate.
function isSpecArtifactWrite(targetPath, signedState) {
  // (a) a real, verified state object — the CORRUPT_SENTINEL string and null fail closed (5.4).
  if (typeof signedState !== 'object' || signedState === null) return false;
  // (b) target normalized inside .kiro/specs/<run>/… (5.2c: production paths outside → false).
  const targetSegs = specPathSegments(targetPath);
  if (!isUnderKiroSpecs(targetSegs)) return false;
  // (c) a Spec-authoring run that declares its own non-empty spec folder (5.2b: type !== 'Spec').
  const decision = signedState.orchestrator_decision;
  if (!decision || typeof decision !== 'object') return false;
  if (decision.type !== 'Spec') return false;
  const specPath = decision.spec_context && decision.spec_context.spec_path;
  if (typeof specPath !== 'string' || !specPath.trim()) return false;
  const specSegs = specPathSegments(specPath);
  if (!isUnderKiroSpecs(specSegs)) return false;
  // (d) path-SEGMENT containment (not raw string-prefix): the target must sit STRICTLY inside the
  //     run's own spec folder — a sibling like .kiro/specs/foo-2/ must NOT match .kiro/specs/foo/
  //     (5.2a: cross-spec target → false).
  if (targetSegs.length <= specSegs.length) return false;
  for (let i = 0; i < specSegs.length; i++) {
    if (targetSegs[i] !== specSegs[i]) return false;
  }
  return true;
}

// SEC-1 / QUAL-1 (F4/S1): the SINGLE source of truth for "is this an exemptible spec-artifact write
// for the active, cryptographically-VERIFIED Spec run?". Shared by BOTH isExemptPath (the dispatch/
// plan/corrupt gates) AND shouldBlock (the first lock gate) so the two can never diverge — before
// this extraction shouldBlock had no spec-artifact path at all, making the exemption dead code
// whenever a session-lock was active with no exec-window (the real /spec deadlock).
//
// HIGH-2 (forge-deny): GRANTING the exemption is an ACCESS grant, so it demands a cryptographically
// VERIFIED run state — stricter than the migration-tolerant fail-closed posture the rest of the hook
// uses. findActiveSentinelState returns the mtime-fallback state RAW (never signature-checked) and
// tolerates unsigned authoritative states for migration; either would let an attacker plant a FORGED
// unsigned sentinel-state (type=Spec, arbitrary spec_path) under .pipeline/docs/Pre-*-action/<forged>/
// and be handed an exemption over an unrelated .kiro/specs target. Re-verify here and require a
// signature that is PRESENT and VALID: null / CORRUPT_SENTINEL / unsigned / invalid / key-unavailable
// all → do NOT grant. This only HARDENS: a genuinely signed run still verifies regardless of how its
// state was discovered.
function isVerifiedSpecArtifactWrite(filePath, pipelineDir) {
  if (typeof filePath !== 'string' || typeof pipelineDir !== 'string') return false;
  const state = findActiveSentinelState(pipelineDir);
  if (!state || typeof state !== 'object') return false; // null and the CORRUPT_SENTINEL string
  let v;
  try { v = signer.verifyState(state, { key: signer.readHmacKey() }); }
  catch (_) { return false; }
  if (!v || v.valid !== true || v.unsigned === true || v.key_unavailable === true) return false;
  // HIGH-1 (dead-feature fix): tool_input.file_path is ABSOLUTE in Claude Code but
  // decision.spec_context.spec_path is repo-relative. Anchor the target on the SAME base (repo-
  // relative) — exactly as isInsidePipelineDirs does — so both feed specPathSegments as .kiro/specs/…
  // segments. Passing the raw absolute path made specPathSegments()[0] the drive/root, so
  // isUnderKiroSpecs was always false and the exemption never fired.
  const repoRelativeTarget = path.relative(pipelineDir, path.resolve(pipelineDir, filePath));
  return isSpecArtifactWrite(repoRelativeTarget, state);
}

// A write is exempt from the preventive locks when it targets the run's .pipeline/ dirs, the
// harness Plan-Mode plan file, OR a spec-artifact write for the active verified Spec run (the
// signedState is derived internally from the run dir). Production code outside these stays subject
// to the gate. CORRUPT_SENTINEL → isVerifiedSpecArtifactWrite returns false, so corruptResult still
// blocks.
function isExemptPath(filePath, pipelineDir) {
  // SEC-3/QUAL-2: guard FIRST — isInsidePipelineDirs and isPlanFile call path.resolve, which throws a
  // TypeError on a non-string filePath. Bailing here keeps the predicate total.
  if (typeof filePath !== 'string' || typeof pipelineDir !== 'string') return false;
  if (isInsidePipelineDirs(filePath, pipelineDir) || isPlanFile(filePath)) return true;
  return isVerifiedSpecArtifactWrite(filePath, pipelineDir);
}

// Shared fail-closed result for an authoritatively-corrupt run state.
function corruptResult(filePath, pipelineDir) {
  if (isExemptPath(filePath, pipelineDir)) return { block: false };
  const lock = getActiveLock(pipelineDir);
  if (lock && getActiveExecWindow(pipelineDir, lock.session_id)) return { block: false };
  return { block: true, reason: 'PIPELINE_STATE_CORRUPT: active run state is unreadable — failing closed. Restore or archive the corrupt sentinel-state before writing code.' };
}

// Heuristic: does a shell command write to a file? Conservative on purpose — while a lock is
// armed the agent should not be writing code via the terminal at all (closes the Bash bypass).
function detectShellWrite(command) {
  if (typeof command !== 'string' || !command) return false;
  // Strip quoted substrings so a '>' inside quotes (grep 'a>b', echo "x > y") is NOT read as a
  // redirect — fixes the false-positive that blocked benign reads. Redirect check runs on stripped.
  const stripped = command.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  // Redirect to a path. Left side `[^&]` excludes only fd-dups (`>&`); a numbered redirect to a file
  // (`2> f`, `1> f`) IS a write and is caught (v8.2.2 — back-port of the OpenCode A1 fix). Right side
  // `[^&\s|>]` still excludes `2>&1`.
  if (/[^&]>>?\|?[ \t]*[^&\s|>]/.test(stripped)) return true;
  // Heredoc on the RAW command (quote-stripping would erase a quoted delimiter like <<'EOF').
  if (/<<-?[ \t]*['"]?[A-Za-z_]/.test(command)) return true;
  // Write-capable command verbs (on the STRIPPED string, so a verb inside quotes is not a false
  // positive — e.g. echo "cp x"). Includes file-creating verbs, download-to-file, archive extract,
  // VCS overwrite, interpreter -e/-c/-m evals, and PowerShell write cmdlets.
  const WRITE_CMDS = [
    /\btee\b/,
    /\bsed\b[^|;]*\s-i\b/,
    /\b(cp|mv|dd|truncate|install|rsync|ln|touch|mkdir|rm|rmdir|unlink|shred)\b/,
    /\b(curl|wget)\b[^|;]*\s-{1,2}[oO]\b/,
    /\btar\b[^|;]*\s-?-?x/,
    /\b(unzip|gunzip|bsdtar|7z)\b/,
    /\bgit\b[^|;]*\s(checkout|apply|stash|restore|clean|reset)\b/,
    /\b[gm]?awk\b[^|;]*-i[ \t]*inplace/,
    /\bnode\b[^|;]*\s(?:-e|--eval)\b/,
    /\bpython[0-9.]*\b[^|;]*\s-(?:[ecrI]|m)\b/,
    /\b(?:perl|ruby|php)\b[^|;]*\s-[ecrI]\b/,
    /\b(?:Set-Content|Out-File|Add-Content|New-Item|Set-Item|Start-Process|Invoke-Expression|iex|Remove-Item)\b/i,
    /\[\s*IO\.File\s*\]::Write/i,
    /\beval\b/,
    /\bBASH_ENV\b/,
  ];
  return WRITE_CMDS.some((re) => re.test(stripped));
}

// State-only checks (no path) used by the terminal-write guard.
function isDispatchPending(pipelineDir) {
  const state = findActiveSentinelState(pipelineDir);
  if (state === CORRUPT_SENTINEL) return true;
  if (!state) return false;
  return !!findLivePendingBlock(state, resolveHandshakeTimeoutMs());
}

// Is the Plan-Mode gate armed for this state? Armed when: corrupt-authoritative; OR a plan field
// says required && !approved; OR there is NO plan field but the run is schema>=2 AND active
// (fail-safe — a new run that never recorded an approved plan must not write code, even if the
// controller forgot to arm). Legacy schema-1 runs without the field stay allowed (transition).
function planGateArmedFromState(state) {
  if (state === CORRUPT_SENTINEL) return true;
  if (!state || typeof state !== 'object') return false;
  const plan = state.phase_1_5_plan;
  if (plan && typeof plan === 'object') {
    if (plan.required !== true) return false;
    return plan.approved !== true;
  }
  return Number(state.schema_version) >= 2 && state.pipeline_active !== false;
}

function isPlanGateArmed(pipelineDir) {
  return planGateArmedFromState(findActiveSentinelState(pipelineDir));
}

function buildDispatchBlockMessage(blockType, dispatchId) {
  return (
    `Há um ${blockType} pendente e não-resolvido no sentinel-state (id: ${dispatchId}). ` +
    `Atenda o protocolo ANTES de escrever código de produção: para um DISPATCH_REQUEST, ` +
    `despache o alvo via Agent tool e re-invoque o controller (chamada Agent() NOVA) com DISPATCH_RESULTS prependado; ` +
    `para um GATE_REQUEST, colete a resposta via AskUserQuestion e re-invoque com GATE_RESPONSES. ` +
    `NÃO conduza o trabalho inline. Re-dispatch NÃO usa SendMessage. ` +
    `Se o handshake morreu, o cleanup-orphan hook o expira automaticamente.`
  );
}

// Preventive lock: block production-code writes while a protocol block is pending+live and the
// parent has not honored the handshake. Robust to the pipeline_active=false escape (only
// pending_blocks + age matter). Writes inside .pipeline/ and a legitimate exec-window are allowed.
function shouldBlockOnPendingDispatch(filePath, pipelineDir) {
  if (typeof filePath !== 'string' || typeof pipelineDir !== 'string') return { block: false };
  const state = findActiveSentinelState(pipelineDir);
  if (state === CORRUPT_SENTINEL) return corruptResult(filePath, pipelineDir);
  if (!state) return { block: false };
  const pending = findLivePendingBlock(state, resolveHandshakeTimeoutMs());
  if (!pending) return { block: false };
  if (isExemptPath(filePath, pipelineDir)) return { block: false };
  const lock = getActiveLock(pipelineDir);
  if (lock && getActiveExecWindow(pipelineDir, lock.session_id)) return { block: false };
  const id = (typeof pending.gate_id === 'string' && pending.gate_id) ||
    (typeof pending.dispatch_id === 'string' && pending.dispatch_id) ||
    (typeof pending.plan_id === 'string' && pending.plan_id) || '(unknown)';
  return {
    block: true,
    reason: `DISPATCH_LOCK_ACTIVE: ${buildDispatchBlockMessage(pending.block_type, id)}`,
    pending,
  };
}

function buildPlanGateMessage() {
  return (
    'This pipeline run requires an APPROVED plan before any production code is written, ' +
    'and no approved plan is registered in the run state (phase_1_5_plan.approved !== true). ' +
    'Enter Plan Mode, get the plan approved by the user, and record the approval before writing code. ' +
    'Do NOT skip planning. Writes inside .pipeline/ remain allowed.'
  );
}

// Deterministic Plan-Mode gate (Batch B-core): block production-code writes when the active run
// REQUIRES a plan and no approved plan is registered. Universal across workflows. Legacy state
// (schema 1, no phase_1_5_plan) is allowed for transition; runs that don't require a plan
// (required !== true) are allowed; writes inside .pipeline/ and a valid exec-window are allowed.
function shouldBlockWithoutApprovedPlan(filePath, pipelineDir) {
  if (typeof filePath !== 'string' || typeof pipelineDir !== 'string') return { block: false };
  const state = findActiveSentinelState(pipelineDir);
  if (state === CORRUPT_SENTINEL) return corruptResult(filePath, pipelineDir);
  if (!state) return { block: false };
  if (!planGateArmedFromState(state)) return { block: false };
  if (isExemptPath(filePath, pipelineDir)) return { block: false };
  const lock = getActiveLock(pipelineDir);
  if (lock && getActiveExecWindow(pipelineDir, lock.session_id)) return { block: false };
  return { block: true, reason: `PLAN_GATE_ACTIVE: ${buildPlanGateMessage()}` };
}

function handlePreToolUse(payload) {
  // Terminal-write guard (closes the Bash/PowerShell bypass): shell commands can write code,
  // dodging the Edit/Write matcher. While a lock is armed, deny write-commands. No env-var
  // off-switch (the old PIPELINE_DISPATCH_LOCK=warn escape is removed).
  if (payload.tool_name === 'Bash' || payload.tool_name === 'PowerShell') {
    const command = payload.tool_input?.command;
    if (!command || !detectShellWrite(command)) return { decision: 'allow' };
    const dir = payload.cwd;
    if (typeof dir !== 'string') return { decision: 'block', reason: 'PIPELINE_GUARD: invalid payload (failing closed)' };
    const lock = getActiveLock(dir);
    if (lock && getActiveExecWindow(dir, lock.session_id)) return { decision: 'allow' };
    if (isDispatchPending(dir)) return { decision: 'block', reason: 'DISPATCH_LOCK_ACTIVE: shell write blocked while a protocol handshake is pending. Resolve the dispatch before writing code via the terminal.' };
    if (isPlanGateArmed(dir)) return { decision: 'block', reason: 'PLAN_GATE_ACTIVE: shell write blocked — no approved plan registered. Get the plan approved before writing code via the terminal.' };
    return { decision: 'allow' };
  }
  if (!['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(payload.tool_name)) {
    return { decision: 'allow' };
  }
  const filePath = payload.tool_input?.file_path;
  if (!filePath) return { decision: 'allow' };

  const result = shouldBlock(filePath, payload.cwd);
  if (result.block) {
    return { decision: 'block', reason: result.reason };
  }
  // Dispatch-pending preventive lock (deny-only; no env-var off-switch).
  const dispatch = shouldBlockOnPendingDispatch(filePath, payload.cwd);
  if (dispatch.block) {
    return { decision: 'block', reason: dispatch.reason };
  }
  // Deterministic Plan-Mode gate (Batch B-core): no production code without an approved plan.
  const planGate = shouldBlockWithoutApprovedPlan(filePath, payload.cwd);
  if (planGate.block) {
    return { decision: 'block', reason: planGate.reason };
  }
  return { decision: 'allow' };
}

// CLI entry point
if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      const result = handlePreToolUse(payload);
      if (result.decision === 'block') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.reason },
        }));
      }
      process.exit(0);
    } catch (err) {
      const rawMsg = err && err.message ? err.message : String(err);
      process.stderr.write(`edit-guard-hook error: ${rawMsg}\n`);
      // Surface the REAL reason (sanitized: single line, printable ASCII, capped)
      // so a genuine failure is debuggable instead of an opaque "internal error".
      // Posture is UNCHANGED — still fail-closed (deny) when the guard cannot evaluate.
      const safeMsg = String(rawMsg).replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7E]/g, '').slice(0, 200);
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `edit-guard-hook internal error: ${safeMsg} — failing closed`,
        },
      }));
      process.exit(0);
    }
  });
}

module.exports = { shouldBlock, buildBlockMessage, handlePreToolUse, getActiveExecWindow, getActiveLock, openExecWindow, closeExecWindow, findPairingEntry, appendAuditEntry, shouldBlockOnPendingDispatch, buildDispatchBlockMessage, findActiveSentinelState, discoverStatePath, findLivePendingBlock, dispatchTargetMatches, pendingAlreadyDispatched, pendingResolvedByEvents, resolveHandshakeTimeoutMs, shouldBlockWithoutApprovedPlan, buildPlanGateMessage, planGateArmedFromState, detectShellWrite, isDispatchPending, isPlanGateArmed, isPlanFile, isExemptPath, isSpecArtifactWrite, isVerifiedSpecArtifactWrite, CORRUPT_SENTINEL, MAX_TTL_MINUTES, PAIRING_TOLERANCE_MS, STALE_HEARTBEAT_THRESHOLD_MS, STALE_HEARTBEAT_MS /* deprecated alias, removal scheduled for v5.4.0 */ };
