'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PROTECTED_ORIGINAL_SURFACES } = require('../config/protected-surfaces.cjs');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walkFiles(root, base = root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return [{ relativePath: path.relative(base, root).replace(/\\/g, '/'), hash: hashFile(root) }];
  }
  if (!stat.isDirectory()) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(fullPath, base));
    if (entry.isFile()) out.push({
      relativePath: path.relative(base, fullPath).replace(/\\/g, '/'),
      hash: hashFile(fullPath),
    });
  }
  return out;
}

function snapshotProtectedSurfaces({ repoRoot }) {
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot) || !fs.existsSync(repoRoot)) {
    return { status: 'incomplete', checkedAt: new Date().toISOString(), files: [], reason: 'repo-root-unavailable' };
  }

  try {
    const files = [];
    for (const surface of PROTECTED_ORIGINAL_SURFACES) {
      const surfacePath = path.join(repoRoot, surface);
      for (const file of walkFiles(surfacePath, repoRoot)) {
        files.push(file);
      }
    }
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return { status: 'ok', checkedAt: new Date().toISOString(), files };
  } catch (err) {
    return { status: 'incomplete', checkedAt: new Date().toISOString(), files: [], reason: err.message };
  }
}

function compareSnapshots({ before, after }) {
  if (!before || !after || before.status !== 'ok' || after.status !== 'ok') {
    return { status: 'incomplete', findings: [{ kind: 'incomplete', relativePath: null }] };
  }

  const beforeByPath = new Map(before.files.map((file) => [file.relativePath, file.hash]));
  const afterByPath = new Map(after.files.map((file) => [file.relativePath, file.hash]));
  const findings = [];

  for (const [relativePath, hash] of beforeByPath) {
    if (!afterByPath.has(relativePath)) {
      findings.push({ kind: 'missing', relativePath });
    } else if (afterByPath.get(relativePath) !== hash) {
      findings.push({ kind: 'changed', relativePath });
    }
  }
  for (const relativePath of afterByPath.keys()) {
    if (!beforeByPath.has(relativePath)) {
      findings.push({ kind: 'added', relativePath });
    }
  }

  return { status: findings.length ? 'changed' : 'clean', findings };
}

module.exports = { snapshotProtectedSurfaces, compareSnapshots };
