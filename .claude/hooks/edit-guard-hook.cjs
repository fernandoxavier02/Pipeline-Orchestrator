// .claude/hooks/edit-guard-hook.cjs
const fs = require('node:fs');
const path = require('node:path');

const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_TTL_MINUTES = 60;
const OPENED_AT_SKEW_MS = 5000; // tolerate 5s clock skew for opened_at sanity check
const PAIRING_TOLERANCE_MS = 60000; // NI-3: +/- 60s audit-log timestamp tolerance
// Defense-in-depth: even if session-lock-hook's GC pass has not yet run,
// reject locks whose last_seen_at heartbeat is older than this. Locks lacking
// last_seen_at (legacy/pre-patch format) bypass this check and continue to
// rely on expires_at + Stop-hook cleanup, preserving backwards compatibility.
const STALE_HEARTBEAT_MS = 10 * 60 * 1000;

function getActiveLock(pipelineDir) {
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.lock'));
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
            now - lock.last_seen_at > STALE_HEARTBEAT_MS) {
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
  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.exec-window'));
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
  const norm = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s;
  const nf = norm(normalizedFile);
  const np = norm(pipelinePath);
  const isInsidePipeline = nf === np || nf.startsWith(np + path.sep);

  if (isInsidePipeline) return { block: false };

  // F-001: exec-window cooperative authorization for N2 executor agents.
  // When an active, non-expired exec-window exists for the locked session_id,
  // allow Edit/Write outside .pipeline/. Controller is responsible for
  // opening/closing the window around N2 spawns.
  const execWindow = getActiveExecWindow(pipelineDir, lock.session_id);
  if (execWindow) {
    return { block: false, reason: 'exec_window_active', execWindow, lock };
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

function handlePreToolUse(payload) {
  if (!['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(payload.tool_name)) {
    return { decision: 'allow' };
  }
  const filePath = payload.tool_input?.file_path;
  if (!filePath) return { decision: 'allow' };

  const result = shouldBlock(filePath, payload.cwd);
  if (result.block) {
    return {
      decision: 'block',
      reason: result.reason,
    };
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
      process.stderr.write(`edit-guard-hook error: ${err.message}\n`);
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'edit-guard-hook internal error — failing closed',
        },
      }));
      process.exit(0);
    }
  });
}

module.exports = { shouldBlock, buildBlockMessage, handlePreToolUse, getActiveExecWindow, openExecWindow, closeExecWindow, findPairingEntry, appendAuditEntry, MAX_TTL_MINUTES, PAIRING_TOLERANCE_MS, STALE_HEARTBEAT_MS };
