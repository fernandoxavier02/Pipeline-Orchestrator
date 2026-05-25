'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  classifyPath,
  assertWritable,
  PROTECTED_ORIGINAL_SURFACES,
} = require('../../src/config/protected-surfaces.cjs');

const adaptationRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(adaptationRoot, '..');

assert.ok(PROTECTED_ORIGINAL_SURFACES.includes('lib'));
assert.ok(PROTECTED_ORIGINAL_SURFACES.includes('.claude-plugin'));

assert.equal(
  classifyPath({
    absolutePath: path.join(repoRoot, 'lib', 'run-log.cjs'),
    repoRoot,
    adaptationRoot,
  }),
  'original-protected'
);

assert.equal(
  classifyPath({
    absolutePath: path.join(repoRoot, '.claude-plugin', 'plugin.json'),
    repoRoot,
    adaptationRoot,
  }),
  'original-protected'
);

assert.equal(
  classifyPath({
    absolutePath: path.join(adaptationRoot, 'src', 'config', 'protected-surfaces.cjs'),
    repoRoot,
    adaptationRoot,
  }),
  'adaptation-owned'
);

assert.equal(
  classifyPath({
    absolutePath: path.join(repoRoot, 'scratch', 'note.md'),
    repoRoot,
    adaptationRoot,
  }),
  'consumer-project'
);

assert.equal(
  classifyPath({ absolutePath: 'relative/file.js', repoRoot, adaptationRoot }),
  'unknown'
);

const deniedOriginal = assertWritable({
  absolutePath: path.join(repoRoot, 'agents', 'quality', 'plan-architect.md'),
  repoRoot,
  adaptationRoot,
});
assert.equal(deniedOriginal.ok, false);
assert.equal(deniedOriginal.origin, 'original-protected');
assert.match(deniedOriginal.reason, /protected original/i);

const deniedUnknown = assertWritable({
  absolutePath: 'relative/file.js',
  repoRoot,
  adaptationRoot,
});
assert.equal(deniedUnknown.ok, false);
assert.equal(deniedUnknown.origin, 'unknown');

const allowedAdaptation = assertWritable({
  absolutePath: path.join(adaptationRoot, 'src', 'state', 'index.cjs'),
  repoRoot,
  adaptationRoot,
});
assert.equal(allowedAdaptation.ok, true);
assert.equal(allowedAdaptation.origin, 'adaptation-owned');

const misplacedAdaptationRoot = path.join(repoRoot, 'lib', 'opencode-adaptation');
const deniedMisplacedAdaptation = assertWritable({
  absolutePath: path.join(misplacedAdaptationRoot, 'src', 'index.cjs'),
  repoRoot,
  adaptationRoot: misplacedAdaptationRoot,
});
assert.equal(deniedMisplacedAdaptation.ok, false);
assert.equal(deniedMisplacedAdaptation.origin, 'original-protected');

console.log('protected surfaces policy OK');
