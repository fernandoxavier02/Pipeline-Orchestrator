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

// ARCH-B4-002 (v8.5.0): the required implementation-gate list is a DESIGN-FIXED
// constant. It used to be an inline literal at the injection site below, with a
// PROSE copy reproduced in a dispatch-guard.cjs comment — a drift risk if the two
// ever diverge. Promote it to a single exported, frozen constant so this module
// is the SSOT for the literal. The dispatch-guard hook still reads the ACTUAL
// list at runtime from the signed sentinel's implementation_contract (not from
// this constant) — this export is purely the anti-drift anchor for the literal
// that gets stamped into the contract at seal time.
const REQUIRED_IMPL_GATES = Object.freeze([
  'TDD_APPROVAL',
  'ADVERSARIAL_BLOCK',
  'ADVERSARIAL_LOOP_CHECKPOINT',
]);

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
const _VALID_COMPLEXITY = new Set(['SIMPLES', 'MEDIA', 'COMPLEXA', 'unknown']);

function classificationFromManifest(runDir) {
  try {
    const manifestPath = path.join(runDir, 'manifest.yaml');
    if (!fs.existsSync(manifestPath)) return {};
    const m = RunManifest.fromYaml(fs.readFileSync(manifestPath, 'utf8')).toObject();
    const out = {};
    for (const k of ['run_id', 'schema_version', 'created_at', 'type', 'complexity']) {
      if (m[k] !== undefined && m[k] !== null) out[k] = m[k];
    }
    // DATA-1 (v8.5.0): this recovery path runs after the sentinel read FAILED, so
    // the manifest we are reading here may itself be forged/tampered. Validate the
    // fields that get re-signed into the sealed sentinel before trusting them:
    //   - run_id MUST equal path.basename(runDir) (a divergent run_id in a forged
    //     manifest could re-key the sealed sentinel to impersonate another run).
    //   - complexity MUST be one of the canonical values; otherwise drop it rather
    //     than re-sign an arbitrary attacker-supplied string.
    // Emit an AUDIT on each divergence so the tamper attempt is observable.
    const expectedRunId = path.basename(runDir);
    if (out.run_id !== undefined && out.run_id !== expectedRunId) {
      emitAudit('SEAL_CLASSIFICATION_RUN_ID_DIVERGED', {
        runId: expectedRunId,
        manifestRunId: String(out.run_id),
      });
      out.run_id = expectedRunId;
    }
    if (out.complexity !== undefined && !_VALID_COMPLEXITY.has(out.complexity)) {
      emitAudit('SEAL_CLASSIFICATION_COMPLEXITY_INVALID', {
        runId: expectedRunId,
        complexity: String(out.complexity),
      });
      delete out.complexity;
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
 * @returns {{ ok:boolean, error?:string, missing?:string[], sealed?:boolean, runDir?:string }}
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

    // ---- 0) Spec-authoring pre-conditions (v8.5.0, B1 — P1 seal gate) -------
    // These gate the seal for a spec-authoring run BEFORE any state is mutated
    // (manifest / sentinel / gate-decisions). On a failed pre-condition the
    // function returns { ok:false, error, missing } and writes NOTHING.
    //
    // FAIL-OPEN for legacy/non-spec runs: a runDir with no manifest.yaml is not
    // a spec-authoring run, so the spec_review_done pre-condition does not apply
    // (B1-S7). The checks ALSO only engage once the manifest carries a
    // notes.options OBJECT — a legacy run allocated via RunDirectory.allocate
    // stores notes as an empty string (no options), and must keep sealing under
    // the existing behavior (preserves the v8.4.0 F6 telemetry-bridge contract).
    const _preManifestPath = path.join(runDir, 'manifest.yaml');
    if (fs.existsSync(_preManifestPath)) {
      let _preNotes = {};
      let _preType = null;
      try {
        const _preMan = RunManifest.fromYaml(fs.readFileSync(_preManifestPath, 'utf8'));
        const _preObj = _preMan.toObject();
        _preNotes = notesToObject(_preObj.notes);
        _preType = _preObj.type;
      } catch (_e) {
        // BL-1 / ERR-1 (v8.5.0): the manifest.yaml EXISTS but does not parse
        // (corrupt / truncated / tampered). This is a DATA-INTEGRITY failure, NOT
        // a genuine legacy run (those have NO manifest at all — handled by the
        // outer existsSync guard). Previously this silently set _preNotes=null,
        // which made _hasOptions false and skipped EVERY pre-condition — a silent
        // fail-OPEN that let an unverifiable run seal. Fail CLOSED instead, and
        // emit an AUDIT so the swallowed parse error is observable.
        emitAudit('SEAL_MANIFEST_UNREADABLE', {
          runId: path.basename(runDir),
          error: _e && _e.message ? _e.message : String(_e),
        });
        return {
          ok: false,
          error: 'manifest.yaml unreadable/corrupt — cannot verify seal preconditions',
        };
      }
      const _hasOptions = _preNotes
        && _preNotes.options
        && typeof _preNotes.options === 'object'
        && !Array.isArray(_preNotes.options);
      // Idempotency: a run already sealed (notes.options.spec_sealed === true)
      // skips the pre-conditions entirely. The seal itself stamps spec_sealed,
      // so a second seal must remain a no-op (B1 must not regress the existing
      // alreadySealed() idempotency contract — F6 S3b).
      const _alreadySealed = _hasOptions && _preNotes.options.spec_sealed === true;
      // BL-2 (v8.5.0): a Spec run whose manifest carries no notes.options OBJECT
      // (absent or non-object) used to skip ALL pre-conditions and seal. Use
      // manifest.type==='Spec' as a SECONDARY trigger: a real spec run with no
      // usable options is a data-integrity problem, not a legacy run, so it must
      // NOT pass through. Genuine non-spec/legacy runs (type!=='Spec', no options)
      // keep their existing fall-through behavior (F6 telemetry-bridge contract).
      if (_preType === 'Spec' && !_hasOptions && !_alreadySealed) {
        emitAudit('SEAL_PRECONDITION_SKIPPED', {
          runId: path.basename(runDir),
          reason: 'type=Spec but notes.options absent/non-object',
        });
        return {
          ok: false,
          error: 'sealSpecRun: Spec run is missing notes.options — cannot verify seal preconditions',
          missing: ['notes.options'],
        };
      }
      if (_hasOptions && !_alreadySealed) {
        const _opts = _preNotes.options;
        // Pre-condition 1: the review loop must have converged.
        if (_opts.spec_review_done !== true) {
          return {
            ok: false,
            error: 'sealSpecRun: spec_review_done not set — review loop did not converge',
            missing: ['spec_review_done'],
          };
        }
        // Pre-condition 2: the 4 core spec artifacts must exist and be non-empty
        // (spec.json must additionally parse as JSON).
        const specDir = path.join(runDir, '01-spec');
        const coreArtifacts = ['requirements.md', 'design.md', 'tasks.md', 'spec.json'];
        const missingCore = [];
        for (const name of coreArtifacts) {
          const ap = path.join(specDir, name);
          let ok = false;
          try {
            if (fs.existsSync(ap)) {
              const body = fs.readFileSync(ap, 'utf8');
              if (body && body.trim()) {
                if (name === 'spec.json') {
                  try { JSON.parse(body); ok = true; } catch (_e) { ok = false; }
                } else {
                  ok = true;
                }
              }
            }
          } catch (_e) { ok = false; }
          if (!ok) missingCore.push(name);
        }
        if (missingCore.length > 0) {
          return {
            ok: false,
            error: `sealSpecRun: missing required artifact(s): ${missingCore.join(', ')}`,
            missing: missingCore,
          };
        }
        // Pre-condition 3: research.md must exist (existence + non-empty; no
        // content heuristic — Step 8 writes a minimal stub when needed).
        const researchPath = path.join(specDir, 'research.md');
        let researchOk = false;
        try {
          if (fs.existsSync(researchPath)) {
            const rbody = fs.readFileSync(researchPath, 'utf8');
            if (rbody && rbody.trim()) researchOk = true;
          }
        } catch (_e) { researchOk = false; }
        if (!researchOk) {
          return {
            ok: false,
            error: 'sealSpecRun: research.md missing — Step 8 must write it before sealing',
            missing: ['research.md'],
          };
        }
        // Pre-condition 4 (v8.5.0, B3 — P3 seal gate): the review loop must have
        // CONVERGED (zero CRITICAL/HIGH on the final clean round). Convergence is
        // recorded by spec-controller Step 8 as `spec_review_converged === true`
        // in the SIGNED sentinel-state. Ordered LAST, consistently after the 3 B1
        // checks, and ONLY inside this spec-authoring pre-condition gate so legacy
        // / non-spec / already-sealed runs keep their existing seal behavior
        // (preserves the v8.4.0 F6 telemetry-bridge contract).
        //
        // SECURITY (honors the B1/B2 hardening — NO fail-OPEN on corrupt/unsigned
        // state): the flag is trusted ONLY when the sentinel's HMAC signature
        // VERIFIES. A corrupt, tampered, or unsigned sentinel MUST NOT pass as
        // converged — it is treated as "not converged" and blocks.
        //
        // FAIL-OPEN only for an UNREADABLE sentinel (absent / unparseable file):
        // readVerifiedState throws there, and the seal must not block on a
        // sentinel that cannot be read at all (B3-S5).
        const _convSentinelPath = path.join(runDir, 'sentinel-state.json');
        let _convVerifiable = false;
        let _convState = null;
        try {
          const { state: _s, verification: _v } = readVerifiedState(_convSentinelPath);
          // INT-2 (v8.5.0, B1 CRYPTO lesson applied UNIFORMLY): an unsigned
          // sentinel returns { valid:true, unsigned:true } under migration mode
          // (PIPELINE_HMAC_STRICT unset). Treating valid===true alone as
          // authoritative would let an UNSIGNED sentinel carrying
          // spec_review_converged:true PASS this gate — exactly the "never treat an
          // unsigned sentinel as authoritative" hole spec-seal-guard.cjs already
          // closes. Require valid===true AND unsigned!==true: a SIGNED+verified
          // state is the only authoritative source of convergence. An unsigned (or
          // tampered) state is treated as NOT-verifiably-converged → block, exactly
          // as the comment above (~lines 324-332) promises for corrupt/tampered/
          // unsigned state.
          if (_v && _v.valid === true && _v.unsigned !== true) {
            _convVerifiable = true;
            _convState = _s;
          } else {
            // Readable + parsed, but either the signature did not verify OR the
            // state is unsigned — do NOT trust the flag; treat as not converged →
            // block. (Unsigned is reported separately so the breadcrumb is honest.)
            _convVerifiable = true;
            _convState = null;
            emitAudit('SEAL_CONVERGENCE_STATE_UNVERIFIED', {
              runId: path.basename(runDir),
              reason: (_v && _v.unsigned === true)
                ? 'unsigned sentinel not authoritative for convergence'
                : (_v && _v.reason ? _v.reason : 'unverified'),
            });
          }
        } catch (_e) {
          // Unreadable sentinel (absent / unparseable) — fail OPEN.
          _convVerifiable = false;
        }
        if (_convVerifiable) {
          const _converged = _convState && _convState.spec_review_converged === true;
          if (!_converged) {
            return {
              ok: false,
              error: 'sealSpecRun: spec_review_converged not set — review loop must converge before sealing',
              missing: ['spec_review_converged'],
            };
          }
        }
      }
    }

    // BL-4 (v8.5.0) — ACCEPTED LIMITATION (TOCTOU): the pre-condition block above
    // reads manifest.yaml, then section (1) below re-reads + rewrites it. A
    // concurrent writer could mutate the manifest between the check and the write.
    // This is accepted: a seal runs single-process at the end of a spec-authoring
    // run (no concurrent sealer), and the sentinel re-sign in section (2) is the
    // authoritative integrity anchor. Documented rather than locked to keep the
    // seal dependency-free; revisit if seals ever run concurrently.

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
      let priorVerified = false;
      try {
        const { state: _s, verification: _v } = readVerifiedState(sentinelPath);
        prior = _s;
        // INT-2 (v8.5.0, B1 CRYPTO lesson applied UNIFORMLY): the contract is
        // derived ONLY from a SIGNED+verified prior. An unsigned sentinel reports
        // { valid:true, unsigned:true } in migration mode — that must NOT count as
        // "verified" for the purpose of stamping a contract, otherwise a contract
        // could be minted from an unsigned (forgeable) prior carrying
        // spec_review_converged:true. Require valid===true AND unsigned!==true.
        priorVerified = !!(_v && _v.valid === true && _v.unsigned !== true);
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
      const sealedBody = {
        ...rest,
        pipeline_active: false,
        type: 'Spec',
        pipeline_variant: variant,
        final_decision: decision,
        updated_at: ts,
      };

      // DETERMINISTIC implementation_contract injection (v8.5.0, B4 — D4).
      // ROOT FIX: the contract used to be prose-only in spec-controller.md — no
      // code ever produced it, so a sealed spec run handed nothing measurable to
      // the implementation phase. Inject it here, in the authoritative seal
      // re-sign, so the contract is part of the SIGNED body (tamper-evident) and
      // is CODE-produced rather than prose-promised.
      //
      // GUARDED (honors the B1 CRYPTO lesson — never inject on an illegitimate
      // seal): only stamp the contract when this run legitimately reached the
      // seal as a CONVERGED spec-authoring run, i.e.
      //   - the prior sentinel VERIFIED (HMAC valid) AND carried
      //     spec_review_converged === true, AND
      //   - the variant resolved to a spec-authoring variant.
      // The convergence pre-condition above already blocked an unconverged run,
      // but we re-check the VERIFIED flag here (not just "converged") so a
      // re-signed contract is never derived from an unverified/forged prior
      // state. INT-2: "verified" here means SIGNED+verified — an unsigned prior
      // (valid:true, unsigned:true under migration mode) is explicitly excluded by
      // priorVerified above, so no contract is minted from an unsigned sentinel.
      // Non-spec / legacy / unsigned / unverified runs get NO contract (back-compat:
      // the field is simply absent, preserving the v8.4.0 F6 telemetry contract).
      const _SPEC_AUTHORING_VARIANTS = new Set(['spec-authoring', 'spec-author']);
      const _isSpecAuthoring = variant != null && _SPEC_AUTHORING_VARIANTS.has(variant);
      const _converged = priorVerified
        && prior && typeof prior === 'object'
        && prior.spec_review_converged === true;
      if (_isSpecAuthoring && _converged) {
        // D4: the gate list is a DESIGN-FIXED constant — derived deterministically,
        // never read from prose or conditional state. ARCH-B4-002: use the single
        // exported REQUIRED_IMPL_GATES constant (SSOT) rather than an inline literal.
        // Copy the frozen array so the signed body owns a mutable plain array.
        sealedBody.implementation_contract = {
          sealed: true,
          ready_for_implementation: true,
          required_impl_gates: [...REQUIRED_IMPL_GATES],
          spec_dir: '01-spec',
        };
      }

      writeSignedState(sentinelPath, sealedBody);
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

module.exports = { sealSpecRun, classificationFromManifest, REQUIRED_IMPL_GATES };

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
