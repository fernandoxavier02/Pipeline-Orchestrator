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
const { writeSignedState } = require('./sentinel-state-signer.cjs');

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

/**
 * v8.4.0 (W1) — publish the telemetry bridge for a freshly-allocated run.
 *
 * CONTRACT (FIX-E): `rootDir` MUST be the runs root whose basename is
 * `pipeline-runs` (e.g. `<project>/pipeline-runs`). `projectRoot` is derived as
 * its PARENT, so the pointer lands at `<project>/.pipeline/active-run.json` —
 * exactly where the stop-hook / langfuse-hook discovery looks first. If a caller
 * ever passes a rootDir with a different basename, the depth assumption
 * (projectRoot = dirname(rootDir)) would silently misdirect the pointer; this
 * function THROWS in that case so the violation is audited (the caller wraps it
 * in a try/catch that emits RUN_DIR_BRIDGE_FAILED) rather than writing a pointer
 * to the wrong project root.
 *
 * Writes two artefacts:
 *   1. <projectRoot>/.pipeline/active-run.json — { pipeline_doc_path, run_id, updated_at }
 *      written ATOMICALLY via temp-file + renameSync (FIX-D), so a concurrent
 *      allocation can never observe a partial/truncated pointer.
 *   2. <run absPath>/sentinel-state.json (signed) — pipeline_active:true with the
 *      classification fields copied from the manifest object. writeSignedState
 *      is already temp+rename atomic.
 *
 * Throws on any filesystem error; the caller (allocate) wraps this in try/catch
 * so a bridge failure never aborts the allocation.
 */
function writeTelemetryBridge(rootDir, rd, manifestObj, now) {
  // FIX-E: assert the documented depth contract before deriving projectRoot.
  if (path.basename(rootDir) !== 'pipeline-runs') {
    throw new Error(
      `writeTelemetryBridge: rootDir basename must be 'pipeline-runs' (got '${path.basename(rootDir)}') — `
      + 'projectRoot=dirname(rootDir) depth assumption violated'
    );
  }
  const projectRoot = path.dirname(rootDir);
  const absPath = rd.absPath;

  // 1) pointer file — atomic temp+rename so a partial write is never observable.
  const pipelineDir = path.join(projectRoot, '.pipeline');
  fs.mkdirSync(pipelineDir, { recursive: true });
  const pointer = {
    pipeline_doc_path: absPath,
    run_id: rd.runId,
    updated_at: now,
  };
  const pointerPath = path.join(pipelineDir, 'active-run.json');
  const tmpPointerPath = `${pointerPath}.${process.pid}.${Date.now()}.tmp`;
  // FIX-M (v8.4.0): if writeFileSync succeeds but renameSync throws, the temp
  // file would leak. try/finally removes the orphan `.tmp` on the error path
  // (renamed=false), mirroring sentinel-state-signer's cleanup. On success the
  // temp no longer exists, so the rmSync is a harmless no-op.
  let renamed = false;
  try {
    fs.writeFileSync(tmpPointerPath, JSON.stringify(pointer, null, 2));
    fs.renameSync(tmpPointerPath, pointerPath);
    renamed = true;
  } finally {
    if (!renamed) { try { fs.rmSync(tmpPointerPath, { force: true }); } catch (_e) { /* best-effort */ } }
  }

  // 2) active signed sentinel-state inside the run dir
  writeSignedState(path.join(absPath, 'sentinel-state.json'), {
    schema_version: 1,
    run_id: rd.runId,
    pipeline_doc_path: absPath,
    pipeline_active: true,
    type: manifestObj.type,
    complexity: manifestObj.complexity,
    created_at: now,
    updated_at: now,
    pending_blocks: [],
  });
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

      // v8.4.0 (W1) — telemetry bridge. Spec-authoring runs live under
      // pipeline-runs/<run_id>/, which the run-log + Langfuse + fidelity
      // discovery never scans (it only knows `.pipeline/active-run.json` ->
      // `sentinel-state.json` fast-path or the `.pipeline/docs/` fallback). Make
      // an allocated run discoverable by publishing BOTH:
      //   - <projectRoot>/.pipeline/active-run.json  (the pointer fast-path)
      //   - <absPath>/sentinel-state.json            (pipeline_active:true)
      // FAIL-SAFE: any error here is recorded via emitAudit and swallowed —
      // allocate() must never throw because of telemetry plumbing.
      try {
        writeTelemetryBridge(rootDir, rd, manifest.toObject(), now);
      } catch (err) {
        emitAudit('RUN_DIR_BRIDGE_FAILED', {
          runId: rd.runId,
          error: err && err.message ? err.message : String(err),
        });
      }
      return rd;
    }
    throw new Error(
      `RunDirectory.allocate: ${MAX_ALLOCATE_ATTEMPTS} attempts exhausted for displayOrdinal=${displayOrdinal} slug=${baseSlug}`
    );
  }
}

module.exports = { RunDirectory, generateUniqueId };
