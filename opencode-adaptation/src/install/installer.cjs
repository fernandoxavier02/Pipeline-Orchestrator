'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function installArtifacts({ sourceRoot, targetRoot, adaptationRoot, artifacts, protectedRoots }) {
  if (protectedRoots.some((root) => isInside(targetRoot, root) || isInside(adaptationRoot, root))) {
    return { ok: false, code: 'INSTALL_TARGET_PROTECTED' };
  }

  const manifestPath = path.join(targetRoot, 'install-manifest.json');
  if (!isInside(manifestPath, adaptationRoot)) {
    return { ok: false, code: 'MANIFEST_OUTSIDE_ADAPTATION' };
  }

  const installed = [];
  for (const artifact of artifacts) {
    const source = path.join(sourceRoot, artifact.relativePath);
    const target = path.join(targetRoot, artifact.relativePath);
    if (!isInside(target, adaptationRoot)) {
      return { ok: false, code: 'INSTALL_TARGET_OUTSIDE_ADAPTATION', attempted: target };
    }
    if (protectedRoots.some((root) => isInside(target, root))) {
      return { ok: false, code: 'INSTALL_TARGET_PROTECTED', attempted: target };
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    installed.push({
      relativePath: artifact.relativePath,
      owner: 'opencode-adaptation',
      target,
    });
  }

  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    artifacts: installed,
  }, null, 2) + '\n');

  return { ok: true, manifestPath, artifacts: installed };
}

module.exports = { installArtifacts, isInside };
