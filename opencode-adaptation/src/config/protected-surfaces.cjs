'use strict';

const path = require('node:path');

const PROTECTED_ORIGINAL_SURFACES = Object.freeze([
  '.claude',
  '.claude-plugin',
  'agents',
  'skills',
  'commands',
  'lib',
  'tests',
  'references',
  'docs',
  'package.json',
  'CHANGELOG.md',
  'README.md',
  'CLAUDE.md',
]);

function normalizeAbsolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return null;
  return path.resolve(value).replace(/\\/g, '/').toLowerCase();
}

function isInside(candidate, root) {
  if (!candidate || !root) return false;
  return candidate === root || candidate.startsWith(root + '/');
}

function protectedRootPaths(repoRoot) {
  const root = normalizeAbsolute(repoRoot);
  if (!root) return [];
  return PROTECTED_ORIGINAL_SURFACES.map((surface) => (
    normalizeAbsolute(path.join(repoRoot, surface))
  )).filter(Boolean);
}

function classifyPath({ absolutePath, repoRoot, adaptationRoot }) {
  const target = normalizeAbsolute(absolutePath);
  const repo = normalizeAbsolute(repoRoot);
  const adaptation = normalizeAbsolute(adaptationRoot);

  if (!target || !repo || !adaptation) return 'unknown';

  for (const protectedRoot of protectedRootPaths(repoRoot)) {
    if (isInside(target, protectedRoot)) return 'original-protected';
  }

  if (isInside(target, adaptation)) return 'adaptation-owned';

  if (isInside(target, repo)) return 'consumer-project';
  return 'unknown';
}

function assertWritable(input) {
  const origin = classifyPath(input);
  if (origin === 'original-protected') {
    return {
      ok: false,
      origin,
      reason: 'Refusing to write to a protected original plugin surface.',
    };
  }
  if (origin === 'unknown') {
    return {
      ok: false,
      origin,
      reason: 'Refusing to write because the artifact origin is unknown.',
    };
  }
  return { ok: true, origin };
}

module.exports = {
  PROTECTED_ORIGINAL_SURFACES,
  classifyPath,
  assertWritable,
};
