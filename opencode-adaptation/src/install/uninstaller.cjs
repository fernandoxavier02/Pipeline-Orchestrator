'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isInside } = require('./installer.cjs');

const DELETABLE_OWNERS = new Set([
  'opencode-adaptation',
  'pipeline-orchestrator-opencode-adaptation',
]);

function getManifestEntries(manifest) {
  return Array.isArray(manifest.files) ? manifest.files : (manifest.artifacts || []);
}

function shouldDelete(entry) {
  if (!DELETABLE_OWNERS.has(entry.owner)) return false;
  return entry.uninstall === undefined || entry.uninstall === 'delete';
}

function uninstallArtifacts({ root, manifestPath }) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const removed = [];
  const skipped = [];
  for (const artifact of getManifestEntries(manifest)) {
    const target = path.join(root, artifact.relativePath);
    if (!isInside(target, root)) {
      return { ok: false, code: 'UNINSTALL_TARGET_OUTSIDE_ROOT', attempted: target };
    }
    if (!shouldDelete(artifact)) {
      skipped.push(artifact.relativePath);
      continue;
    }
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      removed.push(artifact.relativePath);
    }
  }
  return { ok: true, removed, skipped };
}

module.exports = { uninstallArtifacts, getManifestEntries, shouldDelete };
