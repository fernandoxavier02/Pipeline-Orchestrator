'use strict';
//
// Snapshot test: a freshly-allocated run-dir matches the v5.1.0 layout
// committed in tests/snapshot/golden/run-dir-empty.txt. If RunDirectory
// allocates new subfolders or files (e.g. introduces 04-…/) this test must
// be updated together with the golden.
//
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RunDirectory } = require('../../lib/run-directory.cjs');

function listTree(root) {
  const out = [];
  function walk(d, rel) {
    const entries = fs.readdirSync(d, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push(e.isDirectory() ? `${r}/` : r);
      if (e.isDirectory()) walk(path.join(d, e.name), r);
    }
  }
  walk(root, '');
  return out.join('\n') + '\n';
}

test('freshly allocated run-dir matches golden tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-rd-'));
  try {
    const rd = RunDirectory.allocate(root, 'snapshot test');
    const actual = listTree(rd.absPath);
    const goldenPath = path.resolve(__dirname, 'golden', 'run-dir-empty.txt');
    const golden = fs.readFileSync(goldenPath, 'utf8');
    assert.equal(actual, golden);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
