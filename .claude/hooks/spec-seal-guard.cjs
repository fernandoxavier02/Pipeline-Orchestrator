#!/usr/bin/env node
'use strict';

// =============================================================================
// spec-seal-guard.cjs — gate the spec-authoring SEAL (v8.5.0, B1 — P1)
// =============================================================================
// PROBLEM: `node lib/run-seal.cjs <runDir> --variant spec-authoring` would seal
// a spec-authoring run even when the review loop had not converged
// (spec_review_done not set). lib/run-seal.cjs now has the runtime pre-conditions
// (B1) — this hook is the defense-in-depth layer that can DENY the Bash/PowerShell
// invocation BEFORE the seal process even runs.
//
// PreToolUse:Bash|PowerShell. While a `run-seal.cjs` invocation is detected,
// the hook:
//   1. Extracts the runDir as the first non-flag positional argument from the
//      shell command. If no runDir can be parsed → FAIL-OPEN (allow, exit 0).
//   2. Reads <runDir>/sentinel-state.json and verifies its HMAC signature. If the
//      sentinel is missing / unreadable / unverifiable → FAIL-OPEN (allow).
//   3. DENIES only when the sentinel is readable + signed AND
//      notes.options.spec_review_done !== true, emitting an AUDIT event
//      SPEC_AUTHORING_INCOMPLETE into <runDir>/protocol-events.jsonl.
//
// Default = `deny` (OBRIGA the review loop). Escape:
//   PIPELINE_SPEC_AUTHORING_ENFORCEMENT=warn  → emit AUDIT, allow.
//
// Protocol (mirrors dispatch-pending-gate.cjs / dispatch-guard.cjs):
//   - exit 0 with no stdout            → allow (silent pass / fail-open)
//   - exit 0 with permissionDecision   → deny this call; reason fed to Claude
//   - NEVER exits non-zero — a misfire must not hard-block the user.
//
// ARCH-3 — DUAL-CHECK / DEFENSE-IN-DEPTH: this hook reads the SENTINEL
// (sentinel-state.json), while the authoritative gate lib/run-seal.cjs reads the
// MANIFEST (manifest.yaml). Reading two independent surfaces is INTENTIONAL —
// each must independently carry spec_review_done, so forging only one does not
// pass the seal. The hook is best-effort (fail-open on no evidence); the lib is
// the hard backstop (fail-closed on data-integrity failure, after BL-1/BL-2).
//
// INPUT-1 / INJ-1 — KNOWN HOOK BYPASS VECTORS (cannot be closed in the hook):
//   • shell expansion: `node lib/run-seal.cjs $RUNDIR` or `$(echo /path)` — the
//     command string the hook sees is pre-expansion, so the runDir token is a
//     variable/subshell, not a path → extractRunDir returns it verbatim and the
//     sentinel read fails → fail-open.
//   • symlink / rename: invoking a renamed copy of run-seal.cjs, or a symlink,
//     dodges RUN_SEAL_RE.
//   • npm/alias indirection: `npm run seal`, a shell alias, or a wrapper script
//     never literally contains `run-seal.cjs`.
// These are ACCEPTED at the hook layer. The authoritative net is the runtime
// gate in lib/run-seal.cjs (hardened by BL-1/BL-2 to fail-closed), which runs
// inside the seal process itself and cannot be bypassed by shell-level tricks.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

// HMAC verification is loaded defensively: if the signer lib is unavailable the
// guard degrades to fail-open (it can no longer prove the sentinel is authentic,
// so it must not deny on an unverifiable state).
let stateSigner = null;
try { stateSigner = require('../../lib/sentinel-state-signer.cjs'); } catch { /* fail-open */ }

// ARCH-1 — reuse the canonical notes string-vs-object coercion (SSOT) instead of
// re-implementing it. Loaded defensively (try/catch → null) exactly like the
// signer; if unavailable, specReviewDone() falls back to a local minimal coercion.
let notesToObject = null;
try { ({ notesToObject } = require('../../lib/run-manifest.cjs')); } catch { /* fall back */ }

// RUN_SEAL_RE also catches a couple of obvious aliases (npm script / a `seal`
// wrapper that still names the script). This is a courtesy widening only — see
// the INPUT-1/INJ-1 note above; lib/run-seal.cjs is the authoritative backstop.
const RUN_SEAL_RE = /run-seal\.cjs/;

// Extract the runDir: the FIRST non-flag positional token AFTER the run-seal.cjs
// reference on the command line. Flags (--variant, --grade, ...) and their values
// are skipped; a leading `node`/path-to-run-seal.cjs is consumed as the script
// token. Returns null when no positional runDir can be parsed (→ fail-open).
function extractRunDir(command) {
  if (typeof command !== 'string' || !command) return null;
  // Take everything AFTER the run-seal.cjs reference; if there is nothing after
  // it (e.g. `cat foo | node lib/run-seal.cjs`), there is no runDir → fail-open.
  const m = command.match(/run-seal\.cjs(.*)$/s);
  if (!m) return null;
  const tail = m[1];
  // Tokenize the tail, honoring simple single/double quotes so a quoted path with
  // spaces stays one token.
  const tokens = tail.match(/"[^"]*"|'[^']*'|\S+/g);
  if (!tokens || tokens.length === 0) return null;
  for (let i = 0; i < tokens.length; i += 1) {
    let tok = tokens[i];
    if (tok.startsWith('--')) {
      // `--flag value` form: skip the following value token too (unless --flag=value).
      if (!tok.includes('=') && i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        i += 1;
      }
      continue;
    }
    if (tok.startsWith('-')) continue; // short flag
    // Strip surrounding quotes.
    if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
      tok = tok.slice(1, -1);
    }
    if (!tok) continue;
    // INJ-2 (v8.5.0): the runDir MUST be an absolute path — this mirrors
    // lib/run-seal.cjs's own absolute-path requirement (FIX-L/FIX-P). A
    // relative token (e.g. a shell variable that didn't expand, a `./x` path,
    // or a traversal fragment) must NOT be used to locate + read a sentinel or
    // to write an audit; treat it as "no extractable runDir" → fail-open.
    if (!path.isAbsolute(tok)) return null;
    return tok;
  }
  return null;
}

// Read + HMAC-verify the sentinel-state. Returns the verified state object, or
// null when the sentinel is missing / unreadable / unparseable / unverifiable
// (all of which mean "no deterministic evidence" → fail-open).
//
// CRYPTO-1 (v8.5.0): the signer's verifyState() returns { valid:true, unsigned:true }
// for a sentinel with NO __signature whenever PIPELINE_HMAC_STRICT is unset
// (migration-period leniency). That leniency is fine for "is this state trusted
// enough to ACT on", but it is NOT proof of review: a forged UNSIGNED sentinel
// carrying spec_review_done:true would otherwise let this guard ALLOW the seal.
// The seal-guard's decision to ALLOW hinges on review being PROVABLE, so we
// require a genuine signature here: reject when the state is unsigned (or carries
// no __signature field). Returning null here means "no provable evidence" — the
// caller falls open (it cannot CONCLUDE review_done), which is correct: an
// unsigned claim is not the same as "cannot find the run". A genuinely missing /
// unreadable sentinel also returns null (the legitimate fail-open path).
function readVerifiedSentinel(runDir) {
  try {
    if (!stateSigner || typeof stateSigner.readVerifiedState !== 'function') return null;
    const sentinelPath = path.join(runDir, 'sentinel-state.json');
    if (!fs.existsSync(sentinelPath)) return null;
    const { state, verification } = stateSigner.readVerifiedState(sentinelPath);
    if (!verification || verification.valid !== true) return null; // cannot trust → fail-open
    // CRYPTO-1: an unsigned state is "valid" only under migration leniency — it is
    // NOT cryptographically proven. The guard must not treat it as proof of review.
    if (verification.unsigned === true) return null;
    if (!state || typeof state !== 'object') return null;
    if (!state[stateSigner.SIGNATURE_FIELD]) return null; // defensive: require a signature field
    return state;
  } catch (_e) {
    return null;
  }
}

// notes.options.spec_review_done — sentinel may carry notes as object or as a
// JSON string. ARCH-1: delegate the string-vs-object coercion to the canonical
// notesToObject (lib/run-manifest.cjs) so the duality lives in ONE place; if the
// lib is unavailable, fall back to a local minimal coercion (mirrors it).
// Returns true ONLY when the flag is strictly true.
function specReviewDone(state) {
  const rawNotes = state && state.notes;
  let notes;
  if (typeof notesToObject === 'function') {
    notes = notesToObject(rawNotes); // always a plain object ({} on anything unusable)
  } else {
    notes = rawNotes;
    if (typeof notes === 'string') {
      try { notes = JSON.parse(notes); } catch (_e) { notes = null; }
    }
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) notes = {};
  }
  const opts = notes.options;
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return false;
  return opts.spec_review_done === true;
}

// Best-effort AUDIT append into <runDir>/protocol-events.jsonl. Never throws.
// ARCH-2: the timestamp field uses the canonical key `ts`, matching
// dispatch-guard.cjs's protocol-events writer so all three hooks agree on the
// schema. TODO(v8.6.0+): extract a shared lib/protocol-event-writer.cjs so the
// three hooks share one append implementation instead of each re-deriving it.
// Returns true on a successful write, false otherwise (so the caller can fall
// back to stderr — BL-3 — and never silently lose a warn-mode audit).
function appendAudit(runDir, detail) {
  try {
    const line = JSON.stringify({
      event: 'SPEC_AUTHORING_INCOMPLETE',
      agent: 'spec-seal-guard',
      phase: 'pre-tool',
      detail: String(detail || '').replace(/[\r\n]+/g, ' ').slice(0, 200),
      decided_by: 'spec-seal-guard',
      ts: new Date().toISOString(),
    }).replace(/[\r\n]+/g, ' ');
    fs.appendFileSync(path.join(runDir, 'protocol-events.jsonl'), line + '\n');
    return true;
  } catch { /* never throw from audit */ return false; }
}

// Pure decision: { decision: 'allow' | 'deny', runDir?, reason? }.
function decideSealGate(payload) {
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '';
  if (tool !== 'Bash' && tool !== 'PowerShell') return { decision: 'allow' };

  const ti = payload.tool_input || {};
  const command = typeof ti.command === 'string' ? ti.command : '';
  if (!RUN_SEAL_RE.test(command)) return { decision: 'allow' }; // not a seal call

  const runDir = extractRunDir(command);
  if (!runDir) return { decision: 'allow' }; // cannot locate run → fail-open (S8)

  const state = readVerifiedSentinel(runDir);
  if (!state) return { decision: 'allow' }; // unreadable / unverifiable → fail-open (S6)

  if (specReviewDone(state)) return { decision: 'allow' }; // converged → allow

  // Deterministic evidence the review loop did not converge.
  return {
    decision: 'deny',
    runDir,
    reason:
      'SPEC_AUTHORING_INCOMPLETE: spec_review_done is not set on this run — the spec ' +
      'review loop did not converge. Complete the review loop (zero CRITICAL/HIGH) and ' +
      'record spec_review_done before sealing the contract.',
  };
}

function handlePreToolUse(payload) {
  return decideSealGate(payload);
}

if (require.main === module) {
  let stdin = '';
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(stdin);
      const result = decideSealGate(payload);
      if (result.decision === 'deny') {
        // Always record the AUDIT event in the run's protocol-events.jsonl.
        const audited = appendAudit(result.runDir, result.reason);
        // BL-3: .trim() so a value like '  warn  ' (stray whitespace from an env
        // export) is still recognised — without it, the trailing space would fall
        // through to the default deny path.
        const enforce = String(process.env.PIPELINE_SPEC_AUTHORING_ENFORCEMENT || 'deny').trim().toLowerCase();
        if (enforce === 'warn') {
          // Escape hatch: audited above, allow the seal.
          // BL-3: if the file audit failed, surface the audit on stderr so a
          // warn-mode allow is NEVER audit-silent (the only record otherwise).
          if (!audited) {
            try {
              process.stderr.write('[SPEC_SEAL_AUDIT_FALLBACK] ' + JSON.stringify({
                event: 'SPEC_AUTHORING_INCOMPLETE',
                agent: 'spec-seal-guard',
                runDir: result.runDir,
                detail: String(result.reason || '').replace(/[\r\n]+/g, ' ').slice(0, 200),
                ts: new Date().toISOString(),
              }) + '\n');
            } catch { /* never throw from the fallback */ }
          }
          process.stderr.write('[SPEC_SEAL_WARN] spec-seal-guard: spec_review_done not set ' +
            '(default is now deny; this warn fired because PIPELINE_SPEC_AUTHORING_ENFORCEMENT=warn)\n');
          process.exit(0);
        }
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: result.reason,
          },
        }));
      }
      process.exit(0);
    } catch (err) {
      // Parse / internal failure → FAIL-OPEN (never hard-block the harness).
      process.stderr.write(`spec-seal-guard error: ${err && err.message ? err.message : String(err)}\n`);
      process.exit(0);
    }
  });
}

module.exports = { decideSealGate, handlePreToolUse, extractRunDir, specReviewDone };
