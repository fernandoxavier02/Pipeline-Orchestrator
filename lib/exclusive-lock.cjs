'use strict';

/**
 * lib/exclusive-lock.cjs — minimal cross-process exclusive file lock (v7.13.0, R8).
 *
 * Extracted from the inline mutex in lib/run-log.cjs so gate-decisions,
 * protocol-events and run-log can share ONE correct implementation instead of
 * each claiming "exclusive lock" in a comment while only some actually had one.
 *
 * Model: a sibling `<target>.lock` file created with O_EXCL ('wx'). Only one
 * process can create it; everyone else retries with a short busy-wait.
 *
 * STALE-ORPHAN RECOVERY (the piece run-log lacked): if the holder crashed
 * before releasing, the `.lock` lingers and would block ALL future writes
 * forever. So a lock file OLDER than `staleMs` is presumed orphaned, removed,
 * and the slot retried. This is the MUTEX recovery model (recover by age of the
 * orphan), deliberately NOT the session-lock multi-file heartbeat model — a
 * single short-lived lock has different semantics and copying the heartbeat
 * would risk deadlock.
 *
 * Race-safety: even if two processes both observe the lock as stale and both
 * unlink it, the subsequent `openSync(..., 'wx')` still admits exactly one
 * winner; the loser gets EEXIST and retries. No double-acquire.
 */

const fs = require('node:fs');

const DEFAULT_MAX_ATTEMPTS = 150; // generous under heavy multi-process contention
                                  // (~4s of Atomics.wait sleep, no CPU burn) — an
                                  // audit writer should persist, not drop a line.
const DEFAULT_RETRY_MS = 25;      // sleep between contended attempts
const DEFAULT_STALE_MS = 10000;   // a held lock older than this is orphaned (appends take ms)
const FUTURE_SKEW_MS = 5000;      // tolerate small forward clock skew; beyond it a future-dated lock is also stale

// Synchronous sleep that RELEASES the CPU (unlike a `while` spin). Under
// contention a spin loop starves the lock holder of CPU — the waiters burn the
// cores the holder needs to finish and release, which prolongs the hold and can
// time waiters out entirely. Atomics.wait on a throwaway SharedArrayBuffer parks
// the thread for `ms` without burning a core. Falls back to a spin only if
// SharedArrayBuffer is unavailable (very old/locked-down runtimes).
function busyWait(ms) {
  if (!(ms > 0)) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const target = Date.now() + ms;
    while (Date.now() < target) { /* spin fallback */ }
  }
}

/**
 * Acquire the lock at <lockPath>. Returns a release() function (idempotent).
 * Throws on persistent contention or a non-EEXIST filesystem error.
 */
function acquire(lockPath, opts = {}) {
  const maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const retryMs = opts.retryMs != null ? opts.retryMs : DEFAULT_RETRY_MS;
  const staleMs = opts.staleMs != null ? opts.staleMs : DEFAULT_STALE_MS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let lockFd = null;
    try {
      lockFd = fs.openSync(lockPath, 'wx');
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        // Stale-orphan recovery by age.
        let recovered = false;
        try {
          const st = fs.statSync(lockPath);
          const age = Date.now() - st.mtimeMs;
          // Reclaim if older than staleMs OR dated in the FUTURE beyond a small
          // skew tolerance. A future mtime (clock step-back, NTP correction,
          // backup/restore, container/fs clock skew) would otherwise make the
          // lock look "fresh" forever and block ALL appenders — the exact
          // crashed-holder DoS R8 set out to kill.
          if (age > staleMs || age < -FUTURE_SKEW_MS) {
            try { fs.unlinkSync(lockPath); recovered = true; } catch { /* someone else got it */ }
          }
        } catch {
          // Lock vanished between EEXIST and stat — treat as retryable.
          recovered = true;
        }
        if (recovered) continue;                 // retry immediately
        // Per-process jitter dessynchronizes contending waiters (avoids a
        // thundering herd all waking and racing on the same tick → starvation).
        if (attempt < maxAttempts - 1) { busyWait(retryMs + (process.pid % 16)); continue; }
        throw new Error(`exclusive-lock: could not acquire ${lockPath} after ${maxAttempts} attempts`);
      }
      throw err; // permission denied / read-only fs / etc. — not our retry case
    }

    // Acquired. Best-effort diagnostic payload (does not affect staleness — the
    // mtime is set at creation regardless).
    try { fs.writeSync(lockFd, JSON.stringify({ pid: process.pid, at: Date.now() })); } catch { /* ignore */ }

    let released = false;
    return function release() {
      if (released) return;
      released = true;
      try { fs.closeSync(lockFd); } catch { /* ignore */ }
      try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    };
  }
  throw new Error(`exclusive-lock: could not acquire ${lockPath}`);
}

/**
 * Run `fn()` while holding `<targetPath>.lock`; always releases, even on throw.
 * Returns whatever `fn()` returns.
 */
function withLock(targetPath, fn, opts = {}) {
  const release = acquire(`${targetPath}.lock`, opts);
  try {
    return fn();
  } finally {
    release();
  }
}

module.exports = {
  acquire,
  withLock,
  busyWait,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_MS,
  DEFAULT_STALE_MS,
};
