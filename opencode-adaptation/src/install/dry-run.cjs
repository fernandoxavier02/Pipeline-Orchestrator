'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_RELATIVE_PATH = '.opencode/pipeline-orchestrator-adaptation.manifest.json';

const ADAPTATION_ASSETS = Object.freeze([
  { relativePath: '.opencode/agents', kind: 'directory' },
  { relativePath: '.opencode/skills', kind: 'directory' },
  { relativePath: '.opencode/plugins', kind: 'directory' },
  { relativePath: '.opencode/tools', kind: 'directory' },
  { relativePath: 'opencode.json', kind: 'file' },
  { relativePath: '.opencode/tests', kind: 'directory' },
  { relativePath: MANIFEST_RELATIVE_PATH, kind: 'file' },
]);

function requireAbsoluteDirectory(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path`);
  }
}

function readExistingVersion(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch (_err) {
    return null;
  }
}

function classifyOperation(targetProjectRoot, asset) {
  const targetPath = path.join(targetProjectRoot, asset.relativePath);
  if (!fs.existsSync(targetPath)) {
    return {
      action: 'create',
      status: 'planned',
      relativePath: asset.relativePath,
      targetPath,
    };
  }

  const stat = fs.statSync(targetPath);
  const matchesKind = asset.kind === 'directory' ? stat.isDirectory() : stat.isFile();
  if (!matchesKind) {
    return {
      action: 'refuse',
      status: 'refused',
      relativePath: asset.relativePath,
      targetPath,
      reason: `Existing target is not the expected ${asset.kind}.`,
    };
  }

  return {
    action: 'replace',
    status: 'planned',
    relativePath: asset.relativePath,
    targetPath,
  };
}

function planInstall({ targetProjectRoot, adaptationRoot, requestedVersion }) {
  requireAbsoluteDirectory('targetProjectRoot', targetProjectRoot);
  requireAbsoluteDirectory('adaptationRoot', adaptationRoot);
  if (typeof requestedVersion !== 'string' || requestedVersion.length === 0) {
    throw new TypeError('requestedVersion must be a non-empty string');
  }

  const manifestPath = path.join(targetProjectRoot, MANIFEST_RELATIVE_PATH);
  const existingVersion = readExistingVersion(manifestPath);

  return {
    mode: 'dry-run',
    writesToDisk: false,
    targetProjectRoot,
    adaptationRoot,
    requestedVersion,
    existingVersion,
    replacementRequiresConfirmation: Boolean(existingVersion && existingVersion !== requestedVersion),
    operations: ADAPTATION_ASSETS.map((asset) => classifyOperation(targetProjectRoot, asset)),
  };
}

module.exports = {
  ADAPTATION_ASSETS,
  MANIFEST_RELATIVE_PATH,
  planInstall,
};
