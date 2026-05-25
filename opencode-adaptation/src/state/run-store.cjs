'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function assertSafeRunId(runId) {
  if (typeof runId !== 'string' || runId.length === 0) throw new TypeError('runId is required');
  if (!/^[A-Za-z0-9._-]+$/.test(runId) || /[\\/]|\.\./.test(runId)) throw new Error('runId contains unsafe path characters');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertAbsolute(name, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path`);
  }
}

function sanitizePromptForManifest(input) {
  return String(input || '')
    .replace(/\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer REDACTED')
    .replace(/\b(token|secret|password|api[_-]?key)\s+[^\s,;]+/gi, '$1 REDACTED');
}

function slugify(input) {
  const slug = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-');
  return slug || 'run';
}

function nextOrdinal(runsRoot) {
  if (!fs.existsSync(runsRoot)) return '001';
  const ordinals = fs.readdirSync(runsRoot)
    .map((name) => name.match(/^(\d{3})-/))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  const max = ordinals.length ? Math.max(...ordinals) : 0;
  return String(max + 1).padStart(3, '0');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createRunId(runsRoot, prompt) {
  fs.mkdirSync(runsRoot, { recursive: true });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ordinal = nextOrdinal(runsRoot);
    const unique = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    const runId = `${ordinal}-${unique}-${slugify(prompt)}`;
    const runDir = path.join(runsRoot, runId);
    try {
      fs.mkdirSync(runDir, { recursive: false });
      return { runId, runDir };
    } catch (err) {
      if (err && err.code === 'EEXIST') continue;
      throw err;
    }
  }
  throw new Error('Unable to allocate unique run id');
}

function startRun({ stateRoot, prompt, batchId, sliceId, observableOutcome, allowedSurfaces }) {
  assertAbsolute('stateRoot', stateRoot);
  if (!Array.isArray(allowedSurfaces)) {
    throw new TypeError('allowedSurfaces must be an array');
  }

  const now = new Date().toISOString();
  if (!fs.existsSync(stateRoot)) throw new Error('stateRoot must exist before starting run');
  const realStateRoot = fs.realpathSync(stateRoot);
  const runsRoot = path.join(realStateRoot, 'runs');
  fs.mkdirSync(runsRoot, { recursive: true });
  const realRunsRoot = fs.realpathSync(runsRoot);
  if (!isInside(realStateRoot, realRunsRoot)) throw new Error('runs root must stay inside stateRoot');
  const { runId, runDir } = createRunId(realRunsRoot, 'run');
  const realRunDir = fs.realpathSync(runDir);
  if (!isInside(realRunsRoot, realRunDir)) throw new Error('run directory must stay inside runs root');
  const manifest = {
    schemaVersion: 1,
    runId,
    status: 'active',
    activeBatchId: batchId,
    activeSliceId: sliceId,
    prompt: sanitizePromptForManifest(prompt),
    createdAt: now,
    updatedAt: now,
    artifactOrigin: 'adaptation-owned',
  };
  const batch = {
    schemaVersion: 1,
    runId,
    batchId,
    status: 'active',
    sliceIds: [sliceId],
    createdAt: now,
    updatedAt: now,
  };
  const slice = {
    schemaVersion: 1,
    runId,
    batchId,
    sliceId,
    status: 'planned',
    observableOutcome,
    allowedSurfaces: [...allowedSurfaces],
    blockedFindings: [],
    warningFindings: [],
    evidenceRefs: [],
    createdAt: now,
    updatedAt: now,
  };

  writeJson(path.join(runDir, 'run.json'), manifest);
  writeJson(path.join(runDir, 'batches', `${batchId}.json`), batch);
  writeJson(path.join(runDir, 'slices', `${sliceId}.json`), slice);
  return manifest;
}

function loadRun({ stateRoot, runId }) {
  assertAbsolute('stateRoot', stateRoot);
  assertSafeRunId(runId);
  if (!fs.existsSync(stateRoot)) throw new Error('stateRoot must exist before loading run');
  const realStateRoot = fs.realpathSync(stateRoot);
  const runsRoot = path.join(realStateRoot, 'runs');
  const realRunsRoot = fs.realpathSync(runsRoot);
  if (!isInside(realStateRoot, realRunsRoot)) throw new Error('runs root must stay inside stateRoot');
  const runDir = path.join(realRunsRoot, runId);
  if (!isInside(realRunsRoot, runDir)) throw new Error('runId contains unsafe path characters');
  const realRunDir = fs.realpathSync(runDir);
  if (!isInside(realRunsRoot, realRunDir)) throw new Error('run directory must stay inside runs root');
  const run = readJson(path.join(runDir, 'run.json'));
  const batch = readJson(path.join(runDir, 'batches', `${run.activeBatchId}.json`));
  const slice = readJson(path.join(runDir, 'slices', `${run.activeSliceId}.json`));
  return { run, batch, slice };
}

module.exports = { startRun, loadRun };
