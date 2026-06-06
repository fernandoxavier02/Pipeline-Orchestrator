#!/usr/bin/env node
// =============================================================================
// F19 — pipeline-controller.md inline-plan enforcement (v7.9.4 BUG 1)
// =============================================================================
// TDD RED-phase suite for the PLAN_MODE_BYPASS enforcement paragraph added to
// agents/core/pipeline-controller.md (Task 4). When the controller receives a
// DISPATCH_RESULTS from plan-architect that carries an IMPLEMENTATION_PLAN but
// NO PLAN_MODE_REQUEST/PLAN_MODE_RESULTS for the cycle (i.e. plan-architect
// planned inline, bypassing the harness plan-mode boundary — audit B5-001), the
// controller must: (1) emit a `PLAN_MODE_BYPASS` AUDIT event to
// {PIPELINE_DOC_PATH}/protocol-events.jsonl (NOT a registered gate, NOT
// gate-decisions.jsonl — so the 35-gate registry accounting stays intact), and
// (2) re-dispatch plan-architect exactly once rather than hard-stopping.
//
// CONTRACT under test (from the approved IMPLEMENTATION_PLAN / 04-quality-gate):
//   S1: "PLAN_MODE_BYPASS" present in the file.
//   S2: "protocol-events.jsonl" near "PLAN_MODE_BYPASS" (same vicinity, +/-10
//       lines); PLAN_MODE_BYPASS NOT tied to a gate-decisions.jsonl context.
//   S3: "AUDIT" in the PLAN_MODE_BYPASS region; "HARD" NOT used as the hardness
//       label in that same region.
//   S4 (regression): every gate name from the inline-invariants list is still
//       present; "PLAN_MODE_BYPASS" is NOT inside that inline-invariants region.
//   S5 (regression): the existing Phase 1.5 Note — "plan-architect MUST itself
//       emit a `=== PLAN_MODE_REQUEST v1 ===` block" — is still present.
//   S6 (edge): the PLAN_MODE_BYPASS region describes re-dispatch behavior
//       (re-dispatch | redispatch | re-invoke), not a silent log-only / hard stop.
//
// RED-phase expectation (against CURRENT code, pre-fix — no PLAN_MODE_BYPASS
// paragraph exists yet):
//   FAIL now: S1 S2 S3 S6  (PLAN_MODE_BYPASS absent -> region empty/missing).
//   PASS now: S4 S5        (they assert PRESERVED content the fix must not break:
//             the inline-invariants gate list and the Phase 1.5 Note already
//             exist and contain no PLAN_MODE_BYPASS today).
//
// Region detection is keyword-anchored on PLAN_MODE_BYPASS occurrences (NOT line
// numbers) so the inserted paragraph may land anywhere after the Phase 1.5
// block. The inline-invariants gate list is parsed dynamically from the live
// "Gate names that must exist:" line, so the regression adapts to whatever the
// canonical list holds (it is NOT hardcoded to a stale count). Harness mold
// mirrors F15/F17. Auto-discovered by scripts/run-tests.cjs (v7.9.4 semver).
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTROLLER_PATH = path.join(ROOT, 'agents', 'core', 'pipeline-controller.md');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg}`); }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; } }

// ---------------------------------------------------------------------------
// Return a window of lines around every occurrence of `keyword`, joined. The
// window is +/- `radius` lines per occurrence, deduplicated by line index, so
// "near" assertions are evaluated against the same neighborhood a human reader
// would call "this paragraph". Line-number-free: keyed on the keyword text.
// ---------------------------------------------------------------------------
function vicinity(content, keyword, radius) {
  const lines = content.split(/\r?\n/);
  const keep = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(keyword)) {
      for (let j = Math.max(0, i - radius); j <= Math.min(lines.length - 1, i + radius); j++) {
        keep.add(j);
      }
    }
  }
  if (keep.size === 0) return null;
  return [...keep].sort((a, b) => a - b).map((k) => lines[k]).join('\n');
}

// Extract the gate-name tokens listed on the "Gate names that must exist:" line
// of the Inline Invariants region. Names are ALL_CAPS_WITH_UNDERSCORES wrapped
// in backticks in the live file; we read them dynamically rather than hardcode.
function inlineInvariantGateNames(content) {
  const lines = content.split(/\r?\n/);
  const line = lines.find((ln) => /Gate names that must exist:/.test(ln));
  if (!line) return null;
  const names = (line.match(/`([A-Z][A-Z0-9_]+)`/g) || []).map((s) => s.replace(/`/g, ''));
  return { line, names: [...new Set(names)] };
}

const content = safeRead(CONTROLLER_PATH);

console.log('=== F19 pipeline-controller.md inline-plan enforcement ===');

if (content === null) {
  record('F19 — file readable', false, `${CONTROLLER_PATH} missing/unreadable`);
} else {
  const bypassRegion = vicinity(content, 'PLAN_MODE_BYPASS', 10);

  // =========================================================================
  // S1 (main) — controller contains PLAN_MODE_BYPASS keyword.
  // =========================================================================
  {
    const present = content.includes('PLAN_MODE_BYPASS');
    record(
      'F19-S1: main — file contains "PLAN_MODE_BYPASS"',
      present,
      `'PLAN_MODE_BYPASS' present=${present} (want true)`
    );
  }

  // =========================================================================
  // S2 (main) — enforcement paragraph references protocol-events.jsonl in the
  // PLAN_MODE_BYPASS vicinity, and PLAN_MODE_BYPASS is NOT tied to a
  // gate-decisions.jsonl context (would corrupt the 35-gate registry).
  // =========================================================================
  {
    let ok = false, why = '';
    if (bypassRegion === null) {
      why = 'PLAN_MODE_BYPASS not present — cannot evaluate proximity to protocol-events.jsonl';
    } else {
      const protoNear = bypassRegion.includes('protocol-events.jsonl');
      const gateDecNear = bypassRegion.includes('gate-decisions.jsonl');
      ok = protoNear && !gateDecNear;
      why = `protocol-events.jsonl near=${protoNear} (want true), gate-decisions.jsonl near=${gateDecNear} (want false)`;
    }
    record('F19-S2: main — protocol-events.jsonl near PLAN_MODE_BYPASS, NOT gate-decisions.jsonl', ok, why);
  }

  // =========================================================================
  // S3 (main) — PLAN_MODE_BYPASS region marks hardness AUDIT, not HARD.
  // =========================================================================
  {
    let ok = false, why = '';
    if (bypassRegion === null) {
      why = 'PLAN_MODE_BYPASS not present — cannot evaluate hardness label';
    } else {
      const auditNear = bypassRegion.includes('AUDIT');
      // "HARD" must not be used as the hardness label in this region. Guard
      // against false positives from the word "HARD" embedded in other tokens
      // (e.g. HANDSHAKE has none; but be precise): treat a standalone HARD token
      // or "hardness ... HARD" as the failing case.
      const hardAsLabel = /\bHARD\b/.test(bypassRegion);
      ok = auditNear && !hardAsLabel;
      why = `AUDIT near=${auditNear} (want true), standalone HARD token near=${hardAsLabel} (want false)`;
    }
    record('F19-S3: main — PLAN_MODE_BYPASS region uses AUDIT hardness, not HARD', ok, why);
  }

  // =========================================================================
  // S4 (regression) — inline-invariants gate list intact; PLAN_MODE_BYPASS NOT
  // inside that region (CHANGE_CONTRACT forbids gate_registry_modification).
  // =========================================================================
  {
    let ok = false, why = '';
    const inv = inlineInvariantGateNames(content);
    if (inv === null) { why = '"Gate names that must exist:" line not found'; }
    else {
      // All canonical names parsed from the live line must still be present in
      // the file (sanity: the list line itself is in the file, so this is a
      // tautology unless the fix deleted the line — which is exactly what we
      // guard against). We additionally assert a healthy minimum count so a
      // truncated list is caught.
      const allPresent = inv.names.every((n) => content.includes(n));
      const enoughNames = inv.names.length >= 22; // canonical list is large (>=22)
      // PLAN_MODE_BYPASS must NOT have been spliced into the inline-invariants
      // gate list line (that would register it as a gate — forbidden).
      const bypassInList = inv.line.includes('PLAN_MODE_BYPASS');
      ok = allPresent && enoughNames && !bypassInList;
      why = `gate names parsed=${inv.names.length} (want >=22), allPresent=${allPresent}, PLAN_MODE_BYPASS in list line=${bypassInList} (want false)`;
    }
    record('F19-S4: regression — inline-invariants gate list intact; PLAN_MODE_BYPASS not in it', ok, why);
  }

  // =========================================================================
  // S5 (regression) — existing Phase 1.5 Note preserved.
  // =========================================================================
  {
    // The distinctive note fragment. Match case-insensitively on the leading
    // agent name (the live file capitalizes it "Plan-architect" mid-sentence;
    // the gate-router scenario quotes it lowercase). The load-bearing part is
    // "MUST itself emit a `=== PLAN_MODE_REQUEST v1 ===` block" — that is what
    // the fix must preserve verbatim; the leading capitalization is incidental.
    const noteFragment = 'lan-architect MUST itself emit a `=== PLAN_MODE_REQUEST v1 ===` block';
    const present = content.includes(noteFragment);
    record(
      'F19-S5: regression — Phase 1.5 Note (plan-architect MUST emit PLAN_MODE_REQUEST) preserved',
      present,
      `note fragment present=${present} (want true)`
    );
  }

  // =========================================================================
  // S6 (edge) — enforcement describes re-dispatch behavior, not a hard stop.
  // =========================================================================
  {
    let ok = false, why = '';
    if (bypassRegion === null) {
      why = 'PLAN_MODE_BYPASS not present — cannot evaluate re-dispatch behavior';
    } else {
      const redispatch = /re-?dispatch|re-?invoke/i.test(bypassRegion);
      ok = redispatch;
      why = `re-dispatch|redispatch|re-invoke present in region=${redispatch} (want true)`;
    }
    record('F19-S6: edge — PLAN_MODE_BYPASS region describes re-dispatch (not hard stop)', ok, why);
  }
}

// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nF19 — controller inline-plan enforcement: ${pass}/${pass + fail}`);
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
