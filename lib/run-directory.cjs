'use strict';

// =============================================================================
// run-directory.cjs — concurrent-safe run directory allocator (v7.5.0+).
// =============================================================================
// Spec: .kiro/specs/tracing-concurrent-execution-id/
//
// Each successful allocate() creates ONE exclusive directory under rootDir and
// publishes the resulting runId on process.env.PIPELINE_RUN_ID so descendant
// processes (langfuse-hook, sentinel-hook, stop-hook) can key per-run state
// off the env-var instead of process.ppid or mtime-newest heuristics.
//
// runId format: `${displayOrdinal}-${uniqueId}-${baseSlug}`
//   displayOrdinal : 3-digit zero-padded counter (human display only)
//   uniqueId       : Date.now()-base36 + crypto.randomBytes(6).toString('hex')
//                    — sortable, collision-resistant, ~21 chars
//   baseSlug       : kebab-case slug from the prompt (<= 5 words)
//
// Allocation discipline:
//   - rootDir is created idempotently (mkdirSync {recursive:true}) once
//   - the per-run directory is created EXCLUSIVELY (mkdirSync {recursive:false})
//     so concurrent allocations cannot silently overwrite each other
//   - on EEXIST a new uniqueId is generated and the attempt is retried up to
//     MAX_ALLOCATE_ATTEMPTS times, mirroring the openSync('wx') retry loop in
//     lib/run-log.cjs — same pattern, applied to a directory.
// =============================================================================

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { RunManifest } = require('./run-manifest.cjs');

const MAX_ALLOCATE_ATTEMPTS = 6;
const RETRY_DELAY_MAX_MS = 50;

function emitAudit(name, fields) {
  try {
    const line = JSON.stringify({
      audit_event: name,
      ts: new Date().toISOString(),
      ...fields,
    });
    process.stderr.write(line + '\n');
  } catch (_e) {
    /* swallow — audit must never break the caller */
  }
}

function slugify(prompt, maxWords = 5) {
  const ascii = (prompt || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = ascii.split(' ').filter(w => w && !['a','an','the','of','for','to','in','on'].includes(w));
  const slug = words.slice(0, maxWords).join('-');
  return slug || 'run';
}

function nextRunNumber(rootDir) {
  if (!fs.existsSync(rootDir)) return '001';
  const entries = fs.readdirSync(rootDir).filter(d => /^\d{3}-/.test(d));
  if (entries.length === 0) return '001';
  const max = Math.max(...entries.map(d => parseInt(d.slice(0, 3), 10)));
  return String(max + 1).padStart(3, '0');
}

function generateUniqueId() {
  const time = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex'); // 12 hex chars
  return `${time}${rand}`;
}

function sleepBusy(maxMs) {
  const target = Date.now() + Math.floor(Math.random() * maxMs);
  while (Date.now() < target) { /* spin */ }
}

class RunDirectory {
  constructor(rootDir, runNumber, uniqueId, slug) {
    this._rootDir = rootDir;
    this._runNumber = runNumber;
    this._uniqueId = uniqueId;
    this._slug = slug;
  }
  get runNumber() { return this._runNumber; }
  get uniqueId() { return this._uniqueId; }
  get slug() { return this._slug; }
  get runId() { return `${this._runNumber}-${this._uniqueId}-${this._slug}`; }
  get absPath() { return path.join(this._rootDir, this.runId); }

  static allocate(rootDir, prompt) {
    fs.mkdirSync(rootDir, { recursive: true });
    const displayOrdinal = nextRunNumber(rootDir);
    const baseSlug = slugify(prompt);

    for (let attempt = 0; attempt < MAX_ALLOCATE_ATTEMPTS; attempt += 1) {
      const uniqueId = generateUniqueId();
      const candidateId = `${displayOrdinal}-${uniqueId}-${baseSlug}`;
      const absPath = path.join(rootDir, candidateId);

      try {
        fs.mkdirSync(absPath, { recursive: false });
      } catch (err) {
        if (err && err.code === 'EEXIST') {
          emitAudit('RUN_DIR_COLLISION_RETRY', {
            attempt: attempt + 1,
            displayOrdinal,
            uniqueId,
            slug: baseSlug,
          });
          if (attempt < MAX_ALLOCATE_ATTEMPTS - 1) {
            sleepBusy(RETRY_DELAY_MAX_MS);
            continue;
          }
        }
        throw err;
      }

      for (const sub of ['00-brainstorm', '01-spec', '02-validations', '03-execution', 'attachments']) {
        fs.mkdirSync(path.join(absPath, sub), { recursive: true });
      }
      const rd = new RunDirectory(rootDir, displayOrdinal, uniqueId, baseSlug);
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const manifest = RunManifest.fromObject({
        schema_version: 1, run_id: rd.runId, created_at: now, updated_at: now,
        status: 'ready', phase: 0, step_completed: null,
        type: 'Unknown', complexity: 'unknown',
        brainstorm_completed: false, spec_lifecycle_completed: false,
        handoff_decision: null, linked_pipeline_doc_path: null, notes: '',
      });
      fs.writeFileSync(path.join(rd.absPath, 'manifest.yaml'), manifest.toYaml());
      process.env.PIPELINE_RUN_ID = rd.runId;
      return rd;
    }
    throw new Error(
      `RunDirectory.allocate: ${MAX_ALLOCATE_ATTEMPTS} attempts exhausted for displayOrdinal=${displayOrdinal} slug=${baseSlug}`
    );
  }
}

module.exports = { RunDirectory, generateUniqueId };
