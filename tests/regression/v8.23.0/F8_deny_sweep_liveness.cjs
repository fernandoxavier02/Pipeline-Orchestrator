#!/usr/bin/env node
'use strict';

// =============================================================================
// F8 (v8.23.0) — static liveness sweep over every deny/block site in
// .claude/hooks/*.cjs (T2.1 of loops/next-action-contract/LOOP_PLAN.md)
// =============================================================================
// PURPOSE (AUDIT-REPORT.md §4 P1/CR6): every security block must carry an
// executable next action for BOTH possible readers — a parent (has Agent/
// AskUserQuestion/EnterPlanMode) or a dispatched subagent (Achado #7: does
// NOT have any of those 3 tools; retains Bash/PowerShell/Edit/Write/
// NotebookEdit/MultiEdit/Read/Glob/Grep, and — per Batch 3's investigation —
// Skill).
//
// A block/deny site needs the subagent-fallback treatment ONLY when BOTH:
//   (a) REACHABLE — a subagent can actually trigger the hook that emits it
//       (per its hooks.json matcher — a subagent structurally cannot call
//       Agent/AskUserQuestion/EnterPlanMode, so PreToolUse hooks matched
//       EXCLUSIVELY on those tools are exempt by construction), AND
//   (b) TOOL-SPECIFIC — the message actually instructs the reader to use
//       Agent/AskUserQuestion/EnterPlanMode by name (a message that only
//       says e.g. "restore a valid run state" makes no such assumption and
//       is equally actionable by either reader).
//
// This is a CURATED ledger, not a generic AST parser — every entry below was
// individually verified by reading the real source during Batches 3-4 (see
// each entry's evidence). Three safety nets keep the ledger honest as the code
// evolves: (1) SITE-COUNT DRIFT — for every audited file, this test greps the
// CURRENT source for real (non-comment) decision/permissionDecision
// literals and fails if the count no longer matches the ledger (a new or
// removed site must be re-classified, not silently pass); (2) MATCHER DRIFT —
// for every file classified EXEMPT because a subagent can't reach it, this
// test re-reads hooks/hooks.json LIVE and fails if the registered matcher
// widened to include a subagent-retained tool; (3) COMPLETENESS (Part 4) —
// globs .claude/hooks/*.cjs and fails if ANY file with a real deny/block site
// is in NONE of Part 1 / Part 2 / Part 4, so a NEW hook added on a
// subagent-reachable event cannot slip through the sweep silently.
//
// D1 (loops/next-action-contract/LOOP_PLAN.md "Descobertas do loop"):
// subagent-stop-commit-hook.cjs's SUBAGENTSTOP_STATE_CORRUPT site is a KNOWN,
// DEFERRED gap (architecturally distinct fix needed — a SubagentStop block
// re-runs the SAME subagent rather than handing off to the parent, so the
// established "emit a block and end turn" pattern doesn't apply). It is
// listed here explicitly so it stays visible, not silently missing.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const HOOKS_DIR = path.join(ROOT, '.claude/hooks');

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

// ---- shared helpers ---------------------------------------------------------

function readHooksJson() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks/hooks.json'), 'utf8'));
}

// Every registration (event + matcher) for a given hook filename, across the
// whole hooks.json (a file can be registered more than once).
function registrationsFor(hookFile) {
  const j = readHooksJson();
  const out = [];
  for (const [event, groups] of Object.entries(j.hooks)) {
    for (const g of groups) {
      for (const h of g.hooks) {
        if (typeof h.command === 'string' && h.command.includes(`/${hookFile}"`)) {
          out.push({ event, matcher: g.matcher });
        }
      }
    }
  }
  return out;
}

// Tools Achado #7 removes from a dispatched subagent. Everything else
// (Bash/PowerShell/Edit/Write/NotebookEdit/MultiEdit/Read/Glob/Grep/Skill) it
// retains, per docs/findings/achado-7-subagent-runtime.md + Batch 3's
// live-reproduced confirmation that Skill is NOT one of the 3 removed tools.
const SUBAGENT_LACKS = new Set(['Agent', 'AskUserQuestion', 'EnterPlanMode']);

// A PreToolUse matcher is subagent-reachable when it is '' (fires
// unconditionally) or '.*' (catch-all) or contains at least one token a
// subagent retains. A matcher made up EXCLUSIVELY of tokens in
// SUBAGENT_LACKS is unreachable — the subagent has no way to trigger the
// PreToolUse event that matcher is gated on.
function preToolUseMatcherIsSubagentReachable(matcher) {
  if (matcher === '' || matcher === '.*') return true;
  const tokens = matcher.split('|');
  return tokens.some((t) => !SUBAGENT_LACKS.has(t));
}

// Real (non-comment) occurrences of a literal decision/permissionDecision
// site in a hook's source. Strips full-line `//` comments (this codebase's
// dominant comment style) before counting — good enough to avoid the
// comment-text false positive found during Batch 5's own investigation
// (corrective-dispatch-gate.cjs's docstring mentions the literal string with
// zero real sites).
function countRealSites(hookFile) {
  const src = fs.readFileSync(path.join(HOOKS_DIR, hookFile), 'utf8');
  const codeOnly = src.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const matches = codeOnly.match(/decision:\s*['"]block['"]|permissionDecision:\s*['"]deny['"]/g);
  return matches ? matches.length : 0;
}

// Real CALL sites of a helper function name — excludes the function's own
// `function <name>(...)` declaration line, which otherwise self-matches a
// naive `<name>\(` regex (bit a first draft of this file).
function callSiteCount(src, fnName) {
  const codeOnly = src.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const re = new RegExp(`(?<!function )${fnName}\\(`, 'g');
  const matches = codeOnly.match(re);
  return matches ? matches.length : 0;
}

console.log('=== F8 v8.23.0 — static deny/block liveness sweep ===');

// ---- Part 1: files with real, individually-audited sites -------------------
// Each entry: expected real-site count (drift guard) + evidence that the
// COVERED sub-count still carries the fallback wiring.

const AUDITED_FILES = [
  {
    // 2 semantic sites (INLINE_WORK_BLOCKED, DISPATCH_PENDING_STATE_CORRUPT) +
    // 1 CLI-wrapper re-serialization of whichever fired into the
    // hookSpecificOutput envelope (same pattern as subagent-stop-commit-hook.cjs
    // below) — 3 real literal occurrences, 2 semantic sites, both COVERED.
    file: 'dispatch-pending-gate.cjs',
    expectedSites: 3,
    evidence: () => {
      const src = fs.readFileSync(path.join(HOOKS_DIR, 'dispatch-pending-gate.cjs'), 'utf8');
      assert.equal(callSiteCount(src, 'subagentFallbackSuffix'), 2, 'expected exactly 2 call sites (Batch 3 F4)');
    },
  },
  {
    file: 'edit-guard-hook.cjs',
    expectedSites: 8,
    evidence: () => {
      const src = fs.readFileSync(path.join(HOOKS_DIR, 'edit-guard-hook.cjs'), 'utf8');
      // 5 COVERED (buildBlockMessage, buildDispatchBlockMessage, buildPlanGateMessage,
      // + 2 shell-write inline duplicates) + 3 NO_TOOL_ASSUMPTION (corruptResult,
      // 2x "invalid payload" fail-closed one-liners that give no tool-specific
      // instruction at all — nothing to fall back FROM).
      assert.equal(callSiteCount(src, 'subagentFallbackSuffix'), 5, 'expected exactly 5 call sites (Batch 3 F5)');
    },
  },
  {
    file: 'dispatch-guard.cjs',
    expectedSites: 8,
    evidence: () => {
      const src = fs.readFileSync(path.join(HOOKS_DIR, 'dispatch-guard.cjs'), 'utf8');
      // COVERED (6): buildDenyReason (Skill "is an Agent"), BRAINSTORM_BYPASS,
      // SPEC_CONTRACT_DISCIPLINE_MISSING, PLUS the three sentinel-state fail
      // sites that Batch 5's round-1 architecture reviewer reclassified from
      // NO_TOOL_ASSUMPTION → COVERED: the BRAINSTORM unreadable-state catch,
      // the BRAINSTORM HMAC-fail-under-STRICT branch, and the SPEC_CONTRACT
      // unreadable-state catch. All six are reachable via the Skill branch of
      // handleInput (handleBrainstormDispatch / handleSealedSpecImplementation
      // are called from BOTH the Agent and Skill branches); their prescribed
      // underlying action (restore / re-sign the run state before dispatching)
      // is only practically reachable via dispatch, so a subagent reader needs
      // the clause exactly like the named-tool siblings.
      // EXEMPT_AGENT_ONLY (2): handleAgentEnforcement (ENFORCEMENT) +
      // handlePlanModeDispatch (PLAN_MODE_BYPASS) — called ONLY from the
      // tool_name==='Agent' branch of handleInput, structurally unreachable by
      // a subagent (which has no Agent tool, Achado #7); no clause needed.
      assert.equal(callSiteCount(src, 'subagentFallbackSuffix'), 6, 'expected exactly 6 call sites (Batch 3 F6/F6b + Batch 5 MEDIUM)');
    },
  },
  {
    file: 'audit-read-budget-gate.cjs',
    expectedSites: 1,
    evidence: () => {
      // The reason text is built in lib/audit-read-budget.cjs, not this hook
      // file directly — the hook only forwards result.reason.
      const src = fs.readFileSync(path.join(ROOT, 'lib/audit-read-budget.cjs'), 'utf8');
      assert.ok(callSiteCount(src, 'subagentFallbackSuffix') >= 1, 'buildAuditInlineReason must carry the fallback clause (Batch 3 F7)');
      // Checked against CODE only (comments legitimately explain the OLD
      // phrase as history — see the Batch 3 comment right above
      // buildAuditInlineReason — so a raw src.match would false-positive on
      // its own explanation, exactly as this test's first draft did).
      const codeOnly = src.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
      assert.doesNotMatch(codeOnly, /write the signed sentinel-state/i, 'must never re-introduce the self-write-recipe removed in Batch 3 (in actual code, not a comment)');
    },
  },
  {
    // 6 raw literal matches = 5 real decideArmGate() block-decision sites
    // (MARKER_TAMPERED, CORRUPT_STATE, NOT_ARMED-generic, the ctx.runActive
    // forward, the fail-safe branch) + 1 in toHookOutput() — a GENERIC later-
    // stage serializer that forwards whatever `result` decideArmGate already
    // produced into the final stdout envelope; it is not itself a NEW
    // decision site, so it legitimately has no `corrective` of its own to
    // populate (by design: `corrective` is drained separately, on disk, by
    // lib/corrective-dispatch.cjs via emitCorrectiveTrigger() — a SEPARATE,
    // pre-existing async channel from Spec 006/v8.12.0, not the live
    // permissionDecisionReason prose; confirmed by reading handlePreToolUse
    // during Batch 5 — this is NOT a live-prose corrective omission bug).
    file: 'pipeline-arm-gate.cjs',
    expectedSites: 6,
    evidence: () => {
      const src = fs.readFileSync(path.join(HOOKS_DIR, 'pipeline-arm-gate.cjs'), 'utf8');
      const codeOnly = src.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
      const correctiveSuppliers = (codeOnly.match(/corrective:\s*buildCorrectiveDescriptor\(/g) || []).length
        + (codeOnly.match(/corrective:\s*g\.corrective/g) || []).length
        + (codeOnly.match(/^\s*corrective,\s*$/gm) || []).length;
      assert.equal(correctiveSuppliers, 5,
        `expected exactly 5 real decideArmGate() block sites to supply 'corrective' ` +
        `(MARKER_TAMPERED/CORRUPT_STATE/NOT_ARMED/runActive-forward/fail-safe), found ${correctiveSuppliers} — Batch 2's fix`);
    },
  },
  {
    file: 'scope-lock-hook.cjs',
    expectedSites: 0, // uses emitDecision(decision, reason) — a PARAMETRIZED call, not a literal 'block'/'deny' — see Part 3.
    evidence: () => {
      const src = fs.readFileSync(path.join(HOOKS_DIR, 'scope-lock-hook.cjs'), 'utf8');
      // NO_TOOL_ASSUMPTION: neither the REFACTOR_SCOPE_LOCK reason nor the two
      // "SCOPE LOCK violation" (forbidden_files / allowed_files) reasons name
      // Agent/AskUserQuestion/EnterPlanMode — resolution is "run the gate" /
      // "return status=QUESTIONS", both equally actionable by either reader.
      assert.doesNotMatch(src, /via Agent tool|via AskUserQuestion|Enter Plan Mode/i,
        'scope-lock-hook.cjs reasons must stay tool-name-agnostic, or Part 1 needs a new COVERED entry');
    },
  },
  {
    file: 'spec-seal-guard.cjs',
    expectedSites: 1,
    evidence: () => {
      const src = fs.readFileSync(path.join(HOOKS_DIR, 'spec-seal-guard.cjs'), 'utf8');
      assert.doesNotMatch(src, /via Agent tool|via AskUserQuestion|Enter Plan Mode/i,
        'spec-seal-guard.cjs SPEC_AUTHORING_INCOMPLETE reason must stay tool-name-agnostic, or Part 1 needs a new COVERED entry');
    },
  },
  {
    file: 'subagent-stop-commit-hook.cjs',
    expectedSites: 3, // 2 semantic sites (SUBAGENTSTOP_STATE_CORRUPT, SUBAGENTSTOP_RESULT_MISSING) + 1 CLI re-serialization of whichever fired.
    evidence: () => {
      const src = fs.readFileSync(path.join(HOOKS_DIR, 'subagent-stop-commit-hook.cjs'), 'utf8');
      // SUBAGENTSTOP_RESULT_MISSING: NO_TOOL_ASSUMPTION — tells the subagent
      // to re-emit its OWN final message in a format, no tool named.
      assert.match(src, /SUBAGENTSTOP_RESULT_MISSING/);
      // SUBAGENTSTOP_STATE_CORRUPT: D1, KNOWN DEFERRED GAP — reachable by the
      // subagent whose own SubagentStop is blocked, tells it to act "pelo
      // controller" (needs Agent tool it doesn't have) — but a SubagentStop
      // block RE-RUNS THE SAME SUBAGENT (v8.10.0 live-probe finding) rather
      // than handing off to the parent, so the standard "emit a block and end
      // turn" fallback clause does not fit; needs its own design (deferred,
      // see loops/next-action-contract/LOOP_PLAN.md D1). This assertion keeps
      // the gap visible — it intentionally does NOT require a fix here.
      assert.match(src, /SUBAGENTSTOP_STATE_CORRUPT/, 'D1 (deferred) — if this text moves/disappears, re-check LOOP_PLAN.md D1 is still accurate');
    },
  },
];

for (const entry of AUDITED_FILES) {
  record(`Part1 [${entry.file}] real-site count matches the audited ledger (drift guard)`, () => {
    const actual = countRealSites(entry.file);
    assert.equal(actual, entry.expectedSites,
      `${entry.file}: expected ${entry.expectedSites} real decision/permissionDecision sites, found ${actual} — ` +
      `a site was added or removed since this ledger was verified; re-audit and update F8's ledger`);
  });
  record(`Part1 [${entry.file}] fallback/exemption evidence still holds`, entry.evidence);
}

// ---- Part 2: files exempt because a subagent structurally cannot trigger
// the PreToolUse:Agent event they're matched on ---------------------------

const AGENT_ONLY_EXEMPT_FILES = [
  'sentinel-hook.cjs',
  'dispatch-record-hook.cjs',
  'audit-dispatch-marker.cjs',
  'parallel-dispatch-gate.cjs',
  'step-ledger-gate.cjs',
  'gate-log-gate.cjs',
  'batch-review-gate.cjs',
  'checkpoint-verdict-gate.cjs',
  'phase-verdict-gate.cjs',
];

for (const file of AGENT_ONLY_EXEMPT_FILES) {
  record(`Part2 [${file}] hooks.json matcher is STILL exactly "Agent" (matcher-drift guard)`, () => {
    const regs = registrationsFor(file).filter((r) => r.event === 'PreToolUse');
    assert.ok(regs.length >= 1, `${file} must have at least one PreToolUse registration in hooks.json`);
    for (const r of regs) {
      assert.equal(r.matcher, 'Agent',
        `${file}'s PreToolUse matcher widened from "Agent" to "${r.matcher}" — it may now be subagent-reachable ` +
        `(Skill/Bash/etc. are NOT removed from a subagent) and needs Part 1 treatment, not exemption`);
    }
  });
}

// ---- Part 3: cross-check the reachability RULE itself, and the one
// parametrized-decision file (scope-lock-hook.cjs's emitDecision helper) --

record('Part3 [reachability rule] a subagent-retained-tool matcher IS classified reachable', () => {
  assert.equal(preToolUseMatcherIsSubagentReachable('Edit|Write|NotebookEdit|MultiEdit'), true);
  assert.equal(preToolUseMatcherIsSubagentReachable('Bash|PowerShell'), true);
  assert.equal(preToolUseMatcherIsSubagentReachable('Skill|Agent'), true); // Skill retained -> reachable overall
  assert.equal(preToolUseMatcherIsSubagentReachable('.*'), true);
  assert.equal(preToolUseMatcherIsSubagentReachable(''), true);
});

record('Part3 [reachability rule] an Agent/AskUserQuestion/EnterPlanMode-only matcher is classified UNREACHABLE', () => {
  assert.equal(preToolUseMatcherIsSubagentReachable('Agent'), false);
  assert.equal(preToolUseMatcherIsSubagentReachable('AskUserQuestion'), false);
});

record('Part3 [scope-lock-hook.cjs] emitDecision(decision, reason) call sites use a variable, not a literal — Part 1 covers this file by content check, not site-count', () => {
  const src = fs.readFileSync(path.join(HOOKS_DIR, 'scope-lock-hook.cjs'), 'utf8');
  // Documents WHY this file's expectedSites is 0 in Part 1: its deny path is
  // emitDecision('deny', reason) — a function call with a literal first
  // ARGUMENT, not `decision:'block'`/`permissionDecision:'deny'` object-literal
  // shape the regex in countRealSites looks for. Confirms the shape exists so
  // this documented exception doesn't silently rot if the file is refactored.
  assert.match(src, /function emitDecision\(decision, reason\)/);
  assert.match(src, /emitDecision\('deny'/, 'expected at least one real emitDecision(\'deny\', ...) call site to exist');
});

// ---- Part 4: completeness — every hook file with real deny/block sites must be
// classified SOMEWHERE, or a new hook silently bypasses the whole sweep.
// (Round-1 architecture reviewer finding: e2e-eval-gate.cjs,
// enforcement-surface-verify-hook.cjs and stop-gate-hook.cjs each carry real
// deny sites but were absent from BOTH Part 1 and Part 2 because they live on
// SessionStart/Stop/SessionEnd/StopFailure events that only the PARENT process
// fires. They are legitimately exempt — but the sweep never SAID so, so a NEW
// hook added on a subagent-reachable event would slip through identically. This
// part closes that hole: glob .claude/hooks/*.cjs, keep files with real sites,
// fail if any is neither Part-1-audited, Part-2-Agent-only-exempt, nor
// Part-4-parent-only-exempt.)
//
// LIMITATION: countRealSites matches only the LITERAL `decision:'block'` /
// `permissionDecision:'deny'` object shape. A hook that emits its deny via a
// PARAMETRIZED helper (scope-lock-hook.cjs's emitDecision('deny', reason)) reads
// as 0 sites here and is handled by its Part 1 entry + Part 3 shape-check
// instead. A brand-new hook using that parametrized pattern on a
// subagent-reachable event would not be caught by Part 4 — closing that would
// need a real AST parser, out of scope for this curated sweep.

// Events only the top-level parent process fires. A dispatched subagent (Achado
// #7) shares the session_id but does NOT start or end a session, and its own
// stop is a SubagentStop (a different event with its own hook in Part 1). So a
// hook registered ONLY on these events is structurally never reached by a
// subagent's tool call.
const PARENT_ONLY_EVENTS = new Set(['SessionStart', 'Stop', 'SessionEnd', 'StopFailure']);

// A hook file is parent-only-exempt when it has at least one registration and
// EVERY registration is on a PARENT_ONLY_EVENTS event. (A file with ZERO
// registrations is NOT exempt — an unregistered file carrying real deny sites
// is suspect and must be classified explicitly, not silently tolerated.)
function isParentOnlyExempt(hookFile) {
  const regs = registrationsFor(hookFile);
  return regs.length > 0 && regs.every((r) => PARENT_ONLY_EVENTS.has(r.event));
}

record('Part4 [completeness] every hook with real deny/block sites is classified (Part 1 / Part 2 / Part 4 parent-only) — no silent gap', () => {
  const part1 = new Set(AUDITED_FILES.map((e) => e.file));
  const part2 = new Set(AGENT_ONLY_EXEMPT_FILES);
  const allHooks = fs.readdirSync(HOOKS_DIR).filter((f) => f.endsWith('.cjs'));
  const unclassified = [];
  for (const f of allHooks) {
    if (countRealSites(f) === 0) continue;          // no deny/block site → nothing to classify
    if (part1.has(f) || part2.has(f)) continue;     // already audited / Agent-only-exempt
    if (isParentOnlyExempt(f)) continue;            // structurally parent-only (never a subagent reader)
    unclassified.push(f);
  }
  assert.equal(unclassified.length, 0,
    `${unclassified.length} hook file(s) with real deny/block sites are NOT classified in ANY part of this sweep ` +
    `(Part 1 audited / Part 2 Agent-only-exempt / Part 4 parent-only-exempt): [${unclassified.join(', ')}] — ` +
    `classify them, or this sweep is silently blind to them (exactly the gap a new hook would slip through).`);
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
