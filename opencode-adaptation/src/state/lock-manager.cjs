'use strict';

const fs = require('node:fs');
const path = require('node:path');

function acquireLock(lockPath, metadata = {}) {
  if (typeof lockPath !== 'string' || !path.isAbsolute(lockPath)) {
    return { ok: false, reason: 'lock-path-not-absolute' };
  }

  const parent = path.dirname(lockPath);
  if (!fs.existsSync(parent)) {
    return { ok: false, reason: 'lock-parent-missing' };
  }

  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
    const payload = JSON.stringify({
      createdAt: new Date().toISOString(),
      metadata,
    });
    fs.writeFileSync(fd, payload);
    return { ok: true, lockPath, fd };
  } catch (err) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_closeErr) { /* ignore close failure */ }
    }
    if (err && err.code === 'EEXIST') {
      return { ok: false, reason: 'lock-unavailable', lockPath };
    }
    return { ok: false, reason: 'lock-error', error: err.message, lockPath };
  }
}

function releaseLock(lock) {
  if (!lock || lock.ok !== true || typeof lock.lockPath !== 'string') {
    return { ok: false, reason: 'invalid-lock' };
  }

  try {
    if (typeof lock.fd === 'number') {
      fs.closeSync(lock.fd);
    }
  } catch (_err) {
    // Continue to unlink; a closed descriptor should not leave stale locks.
  }

  try {
    fs.unlinkSync(lock.lockPath);
    return { ok: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true };
    return { ok: false, reason: 'unlock-error', error: err.message };
  }
}

module.exports = { acquireLock, releaseLock };
