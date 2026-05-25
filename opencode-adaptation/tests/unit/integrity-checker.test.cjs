'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { snapshotProtectedSurfaces, compareSnapshots } = require('../../src/state/integrity-checker.cjs');

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'po-open-code-integrity-repo-'));
fs.mkdirSync(path.join(repoRoot, 'lib'), { recursive: true });
fs.mkdirSync(path.join(repoRoot, 'agents'), { recursive: true });
fs.writeFileSync(path.join(repoRoot, 'lib', 'runtime.cjs'), 'original runtime');
fs.writeFileSync(path.join(repoRoot, 'agents', 'worker.md'), 'original agent');

const before = snapshotProtectedSurfaces({ repoRoot });
assert.equal(before.status, 'ok');
assert.equal(before.files.length, 2);

fs.writeFileSync(path.join(repoRoot, 'lib', 'runtime.cjs'), 'changed runtime');
const afterChange = snapshotProtectedSurfaces({ repoRoot });
const changed = compareSnapshots({ before, after: afterChange });
assert.equal(changed.status, 'changed');
assert.equal(changed.findings.length, 1);
assert.equal(changed.findings[0].relativePath, 'lib/runtime.cjs');
assert.equal(changed.findings[0].kind, 'changed');

fs.unlinkSync(path.join(repoRoot, 'agents', 'worker.md'));
const afterMissing = snapshotProtectedSurfaces({ repoRoot });
const missing = compareSnapshots({ before, after: afterMissing });
assert.equal(missing.status, 'changed');
assert.ok(missing.findings.some((finding) => finding.kind === 'missing'));

const incomplete = snapshotProtectedSurfaces({ repoRoot: path.join(repoRoot, 'does-not-exist') });
assert.equal(incomplete.status, 'incomplete');
const incompleteReport = compareSnapshots({ before, after: incomplete });
assert.equal(incompleteReport.status, 'incomplete');

console.log('integrity checker OK');
