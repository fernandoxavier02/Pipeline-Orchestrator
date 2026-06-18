#!/usr/bin/env node
'use strict';

/**
 * run-seal.cjs — Seal a spec-authoring run (v8.4.0, W3).
 *
 * The /pipeline-orchestrator:spec authoring workflow runs under
 * pipeline-runs/<run_id>/ and STOPS at a contract SEAL (no implementation
 * handoff). Sealing leaves a measurable, discoverable telemetry trail so the
 * run-log + Langfuse + fidelity-reporter pipeline can account for it ONCE:
 *
 *   - manifest.yaml      — status=sealed, phase:3, step_completed:9,
 *                          spec_lifecycle_completed:true, type:'Spec',
 *                          notes.options.{spec_sealed, controller_type}.
 *   - sentinel-state.json — re-signed with pipeline_active:false, type:'Spec',
 *                          pipeline_variant, final_decision:'SEALED' (other
 *                          fields preserved). pipeline_active:false is what makes
 *                          the pointer fast-path treat the run as a sealed run.
 *   - gate-decisions.jsonl — one SPEC_SEALED / CONFIRMED / AUDIT line.
 *
 * IDEMPOTENT: a second seal must not duplicate the SPEC_SEALED gate line.
 * FAIL-SAFE: returns { ok:false, error } on any failure rather than throwing,
 * mirroring the SOFT-fail contract of the telemetry layer.
 */

const fs = require('node:fs');
const path = require('node:path');
const { RunManifest, notesToObject } = require('./run-manifest.cjs');
const {
  writeSignedState,
  readVerifiedState,
} = require('./sentinel-state-signer.cjs');

// safeAppendJsonl is preferred (sanitizes + round-trips + locks). Fall back to a
// plain append only if the sanitizer module is unavailable, so the seal still
// records its gate line in a degraded environment. sanitizeDetail is used to
// neutralize newline/control-char injection in variant/grade BEFORE they reach
// the no-sanitizer fallback appendFileSync path (FIX-F).
let _safeAppendJsonl = null;
let _sanitizeDetail = null;
try {
  ({ safeAppendJsonl: _safeAppendJsonl, sanitizeDetail: _sanitizeDetail } = require('./jsonl-sanitizer.cjs'));
} catch (_e) { _safeAppendJsonl = null; _sanitizeDetail = null; }

// Local fallback sanitizer (FIX-F): if jsonl-sanitizer is unavailable, still
// strip the line-breaking characters that could inject a forged JSONL line via
// the plain appendFileSync path. Mirrors the newline/tab handling of the real
// sanitizeDetail; intentionally minimal.
function sanitizeForDetail(value) {
  if (value == null) return null;
  if (typeof _sanitizeDetail === 'function') return _sanitizeDetail(value);
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\t\n\r]/g, ' ').replace(/[\x00-\x1F\x7F]/g, '').trim();
}

// Inline AUDIT emitter (FIX-G) — mirrors the emitAudit style used across the
// telemetry layer (lib/run-directory.cjs). Single stderr JSON line; never throws.
function emitAudit(name, fields) {
  try {
    process.stderr.write(JSON.stringify({
      audit_event: name,
      ts: new Date().toISOString(),
      ...fields,
    }) + '\n');
  } catch (_e) { /* swallow — audit must never break the caller */ }
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

// FIX-H (v8.4.0): the notes string-vs-object coercion is now owned by
// lib/run-manifest.cjs (notesToObject), imported above, so the duality is
// encapsulated in one place instead of re-implemented per consumer.

/**
 * Recover classification fields from a manifest object (FIX-G). Used when the
 * prior sentinel-state could not be read/verified, so the re-signed sentinel
 * does not silently drop the orchestrator classification.
 *
 * FIX-O (v8.4.0): returns `{}` SILENTLY on ANY error — a missing manifest, a
 * corrupt/unparseable manifest.yaml, or a read failure all collapse to the empty
 * object. This is intentional best-effort recovery (the caller already audited
 * the sentinel read failure that led here); it never throws and never surfaces
 * the manifest error, so a corrupt manifest degrades to "no classification
 * recovered" rather than aborting the seal.
 */
function classificationFromManifest(runDir) {
  try {
    const manifestPath = path.join(runDir, 'manifest.yaml');
    if (!fs.existsSync(manifestPath)) return {};
    const m = RunManifest.fromYaml(fs.readFileSync(manifestPath, 'utf8')).toObject();
    const out = {};
    for (const k of ['run_id', 'schema_version', 'created_at', 'type', 'complexity']) {
      if (m[k] !== undefined && m[k] !== null) out[k] = m[k];
    }
    return out;
  } catch (_e) {
    return {};
  }
}

/**
 * Whether gate-decisions.jsonl already carries a SPEC_SEALED line (idempotency).
 */
function alreadySealed(gatePath) {
  try {
    if (!fs.existsSync(gatePath)) return false;
    const raw = fs.readFileSync(gatePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try { if (JSON.parse(t).gate === 'SPEC_SEALED') return true; } catch (_e) { /* skip */ }
    }
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Seal a spec-authoring run.
 *
 * @param {string} runDir - absolute path to the run directory (pipeline-runs/<id>)
 * @param {object} [opts]
 * @param {string} [opts.variant]  - the authoring variant (e.g. 'spec-author')
 * @param {string} [opts.grade]    - spec grade label (advisory; recorded in detail)
 * @param {string} [opts.decision] - terminal decision label (default 'SEALED')
 * @returns {{ ok:boolean, error?:string, sealed?:boolean, runDir?:string }}
 */
function sealSpecRun(runDir, opts = {}) {
  try {
    if (typeof runDir !== 'string' || !runDir) {
      return { ok: false, error: 'sealSpecRun: runDir must be a non-empty string' };
    }
    // FIX-P (v8.4.0): reject a relative runDir at the LIBRARY surface too, before
    // any existsSync/filesystem touch. FIX-L added this guard only to the CLI entry,
    // so programmatic callers of sealSpecRun() could still pass a relative path that
    // resolves against an arbitrary CWD. Same path-traversal floor as the CLI.
    if (!path.isAbsolute(runDir)) {
      return { ok: false, error: 'runDir must be absolute' };
    }
    if (!fs.existsSync(runDir)) {
      return { ok: false, error: `sealSpecRun: runDir does not exist: ${runDir}` };
    }
    // FIX-F: sanitize variant + grade up front. Both flow into the `detail`
    // string of the SPEC_SEALED gate line; the no-sanitizer fallback uses a
    // plain appendFileSync, so an un-sanitized newline in variant/grade could
    // inject a forged JSONL line. Sanitize once here so BOTH the safeAppendJsonl
    // and the fallback path are protected, and so the value re-signed into the
    // sentinel cannot carry control chars either.
    const variant = typeof opts.variant === 'string' ? sanitizeForDetail(opts.variant) : null;
    const grade = typeof opts.grade === 'string' ? sanitizeForDetail(opts.grade) : null;
    const decision = typeof opts.decision === 'string' && opts.decision
      ? sanitizeForDetail(opts.decision) : 'SEALED';
    const ts = nowIso();

    // ---- 1) manifest.yaml ---------------------------------------------------
    const manifestPath = path.join(runDir, 'manifest.yaml');
    if (fs.existsSync(manifestPath)) {
      const man = RunManifest.fromYaml(fs.readFileSync(manifestPath, 'utf8'));
      const m = man.toObject();
      const notes = notesToObject(m.notes);
      notes.options = (notes.options && typeof notes.options === 'object' && !Array.isArray(notes.options))
        ? notes.options : {};
      notes.options.spec_sealed = true;
      notes.options.controller_type = 'spec';
      const sealedManifest = RunManifest.fromObject({
        ...m,
        status: 'sealed',
        phase: 3,
        step_completed: 9,
        spec_lifecycle_completed: true,
        type: 'Spec',
        updated_at: ts,
        notes,
      });
      fs.writeFileSync(manifestPath, sealedManifest.toYaml());
    }

    // ---- 2) sentinel-state.json (re-sign, preserve other fields) -----------
    const sentinelPath = path.join(runDir, 'sentinel-state.json');
    if (fs.existsSync(sentinelPath)) {
      let prior = {};
      try {
        ({ state: prior } = readVerifiedState(sentinelPath));
      } catch (err) {
        // FIX-G: a read/parse/verify failure used to silently fall back to {},
        // dropping the orchestrator classification (run_id/type/complexity/...)
        // from the re-signed sentinel. Audit the failure AND recover the
        // classification fields from manifest.yaml so the sealed sentinel stays
        // self-describing.
        emitAudit('SEAL_SENTINEL_READ_FAILED', {
          runId: path.basename(runDir),
          error: err && err.message ? err.message : String(err),
        });
        prior = classificationFromManifest(runDir);
      }
      // Drop the prior signature so it is recomputed over the sealed body.
      const { __signature: _omit, ...rest } = (prior && typeof prior === 'object') ? prior : {};
      writeSignedState(sentinelPath, {
        ...rest,
        pipeline_active: false,
        type: 'Spec',
        pipeline_variant: variant,
        final_decision: decision,
        updated_at: ts,
      });
    }

    // ---- 3) gate-decisions.jsonl (idempotent SPEC_SEALED line) -------------
    const gatePath = path.join(runDir, 'gate-decisions.jsonl');
    if (!alreadySealed(gatePath)) {
      const detailParts = [];
      if (variant) detailParts.push(`variant=${variant}`);
      if (grade) detailParts.push(`grade=${grade}`);
      // NOTE: use the canonical `timestamp` key (NOT `ts`) — safeAppendJsonl
      // filters against ALLOWED_GATE_DECISION_KEYS (lib/contracts/gate-decision.cjs),
      // which silently drops any non-canonical key. `ts` would be discarded.
      const entry = {
        gate: 'SPEC_SEALED',
        timestamp: ts,
        run_id: path.basename(runDir),
        hardness: 'AUDIT',
        decision: 'CONFIRMED',
        decided_by: 'spec-controller',
        detail: detailParts.join(' ') || 'spec contract sealed',
      };
      if (typeof _safeAppendJsonl === 'function') {
        _safeAppendJsonl(gatePath, entry, { kind: 'gate' });
      } else {
        fs.appendFileSync(gatePath, JSON.stringify(entry) + '\n', { encoding: 'utf8' });
      }
    }

    return { ok: true, sealed: true, runDir };
  } catch (err) {
    return { ok: false, error: `sealSpecRun: ${err && err.message ? err.message : String(err)}` };
  }
}

module.exports = { sealSpecRun, classificationFromManifest };

// ---- CLI entry (FIX-C) ------------------------------------------------------
// The spec-controller Step 9 prose calls this via:
//   node lib/run-seal.cjs <runDir> [--variant <v>] [--grade <g>] [--decision <d>]
// Without this entry point the controller's `node lib/run-seal.cjs ...` call was
// a silent no-op (the module only exported a function). Prints the JSON result
// and exits non-zero on { ok:false } so a failed seal is observable to the caller.
if (require.main === module) {
  const argv = process.argv.slice(2);
  let runDir = null;
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--variant') { opts.variant = argv[++i]; }
    else if (a === '--grade') { opts.grade = argv[++i]; }
    else if (a === '--decision') { opts.decision = argv[++i]; }
    else if (a.startsWith('--variant=')) { opts.variant = a.slice('--variant='.length); }
    else if (a.startsWith('--grade=')) { opts.grade = a.slice('--grade='.length); }
    else if (a.startsWith('--decision=')) { opts.decision = a.slice('--decision='.length); }
    else if (!a.startsWith('--') && runDir === null) { runDir = a; }
    // FIX-O (v8.4.0): an unrecognized --flag (e.g. a spec-controller typo like
    // `--varaint`) used to be silently ignored, so a misspelled variant became a
    // null variant with no signal. Emit a warn-style stderr line so the typo is
    // observable; do NOT hard-fail (the seal still proceeds with what parsed).
    else if (a.startsWith('--')) { emitAudit('SEAL_CLI_UNRECOGNIZED_FLAG', { flag: a.split('=')[0] }); }
  }
  let result;
  if (runDir === null) {
    result = { ok: false, error: 'run-seal CLI: missing <runDir> argument' };
  } else if (!path.isAbsolute(runDir)) {
    // FIX-L (v8.4.0): reject a relative runDir before touching the filesystem.
    // Same path-traversal floor as lib/run-log.cjs / fidelity-reporter — the seal
    // must never resolve a relative path against an arbitrary CWD.
    result = { ok: false, error: 'runDir must be absolute' };
  } else {
    result = sealSpecRun(runDir, opts);
  }
  try { process.stdout.write(JSON.stringify(result) + '\n'); } catch (_e) { /* ignore */ }
  process.exit(result && result.ok ? 0 : 1);
}
