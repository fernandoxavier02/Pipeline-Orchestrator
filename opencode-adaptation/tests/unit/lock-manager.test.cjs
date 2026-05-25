'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acquireLock, releaseLock } = require('../../src/state/lock-manager.cjs');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-lock-'));
const lockPath = path.join(tmpRoot, 'run.lock');

const first = acquireLock(lockPath, { owner: 'first' });
assert.equal(first.ok, true);
assert.equal(fs.existsSync(lockPath), true);

const second = acquireLock(lockPath, { owner: 'second' });
assert.equal(second.ok, false);
assert.equal(second.reason, 'lock-unavailable');

const released = releaseLock(first);
assert.equal(released.ok, true);
assert.equal(fs.existsSync(lockPath), false);

const third = acquireLock(lockPath, { owner: 'third' });
assert.equal(third.ok, true);
releaseLock(third);

const invalid = acquireLock(path.join(tmpRoot, 'missing-parent', 'run.lock'), { owner: 'invalid' });
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, 'lock-parent-missing');

console.log('lock manager OK');
