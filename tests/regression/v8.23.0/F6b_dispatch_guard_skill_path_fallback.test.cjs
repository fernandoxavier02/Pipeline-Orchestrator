#!/usr/bin/env node
'use strict';

// =============================================================================
// F6b (v8.23.0) — dispatch-guard.cjs: BRAINSTORM/SPEC_CONTRACT Skill-path fallback
// =============================================================================
// SOURCE: adversarial review round 2 of Batch 3 (architecture reviewer, HIGH
// finding). F6's original comment claimed BRAINSTORM and SPEC_CONTRACT denies
// are "Agent-tool-only" (unreachable by a subagent) — WRONG. Both
// handleBrainstormDispatch and handleSealedSpecImplementation are called from
// BOTH the Agent branch AND the Skill branch of handleInput (this file is
// registered on matcher "Skill|Agent" — ONE registration, both tool names hit
// the same handleInput). A subagent calling Skill('pipeline-orchestrator:
// feature-heavy', ...) without a recorded STEP 1.7 decision (or against an
// unsatisfied sealed-spec contract) reaches these exact deny sites via the
// Skill path — which a subagent CAN call (Achado #7 only removes Agent /
// AskUserQuestion / EnterPlanMode). Fixed: both deny sites now carry
// subagentFallbackSuffix() unconditionally (matching the rest of this batch's
// "always populate, never try to detect who's asking" posture).
//
// Fixtures mirror proven, pre-existing patterns: BRAINSTORM's Skill dispatch
// helper from tests/regression/v7.14.0/F33-brainstorm-bypass-hook.test.cjs
// (S8c scenario), SPEC_CONTRACT's signed-contract seeding from
// tests/regression/v8.5.0/F4-impl-contract-handoff.test.cjs (B4-S3 scenario).
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../..');
const HOOK = path.join(ROOT, '.claude/hooks/dispatch-guard.cjs');
const { writeSignedState } = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));

let pass = 0, fail = 0; const failed = [];
function record(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

const _tmp = [];
function mkTmp(prefix) { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); _tmp.push(d); return d; }

function dispatchSkill(docPath, skillName, env) {
  const payload = JSON.stringify({ tool_name: 'Skill', tool_input: { skill: skillName } });
  const res = spawnSync(process.execPath, [HOOK], {
    input: payload, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PIPELINE_DOC_PATH: docPath, PIPELINE_REPO_ROOT: ROOT, ...env },
  });
  let reason = null;
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j && j.hookSpecificOutput) reason = j.hookSpecificOutput.permissionDecisionReason; } catch { /* */ }
  }
  return reason;
}

console.log('=== F6b v8.23.0 — dispatch-guard.cjs BRAINSTORM/SPEC_CONTRACT Skill-path fallback ===');

// A shared invariant for every call site of the clause across all 4 wrapper
// copies: it must never be glued onto the prior sentence with no separator
// (round-2-v2 confirmation review, LOW-MEDIUM finding, live-reproduced: this
// file's own wrapper was missing the leading ' ' the other 3 files have,
// producing "...execution.Se você é..." — 2 of 3 real call sites affected).
function assertNoGluedWord(reason) {
  assert.doesNotMatch(reason, /[a-zà-ú).,;]Se você é um subagente/,
    `fallback clause must not be glued onto the prior sentence with no space: ${reason}`);
}

record('S1 [BRAINSTORM via Skill] deny includes the subagent-fallback clause', () => {
  const dp = mkTmp('f6b-brainstorm-');
  fs.writeFileSync(path.join(dp, 'sentinel-state.json'), JSON.stringify({
    orchestrator_decision: { type: 'Feature', complexity: 'COMPLEXA' },
  }));
  const reason = dispatchSkill(dp, 'pipeline-orchestrator:feature-heavy', { PIPELINE_BRAINSTORM_ENFORCEMENT: 'deny' });
  assert.ok(reason, 'expected a deny reason (fixture must reproduce the F33-S8c deny)');
  assert.match(reason, /\[BRAINSTORM\]/);
  assert.match(reason, /subagente sem a ferramenta Agent/i, `must offer a subagent-reachable exit: ${reason}`);
  assert.match(reason, /DISPATCH_REQUEST/);
  assertNoGluedWord(reason);
});

record('S2 [SPEC_CONTRACT via Skill] deny includes the subagent-fallback clause', () => {
  const dp = mkTmp('f6b-speccontract-');
  writeSignedState(path.join(dp, 'sentinel-state.json'), {
    run_id: 'f6b-run',
    implementation_contract: { sealed: true, required_impl_gates: ['TDD_APPROVAL'], spec_dir: '01-spec' },
  });
  fs.writeFileSync(path.join(dp, 'gate-decisions.jsonl'), JSON.stringify({ gate: 'SOME_OTHER', decision: 'CONFIRMED' }) + '\n');
  const reason = dispatchSkill(dp, 'pipeline-orchestrator:feature-heavy', {
    PIPELINE_SPEC_AUTHORING_ENFORCEMENT: 'deny',
    PIPELINE_BRAINSTORM_ENFORCEMENT: 'warn', // isolate: don't let the brainstorm handler's own deny fire first
    PIPELINE_PLAN_MODE_ENFORCEMENT: 'warn',
  });
  assert.ok(reason, 'expected a deny reason (fixture must reproduce the B4-S3 deny)');
  assert.match(reason, /\[SPEC_CONTRACT\]/);
  assert.match(reason, /subagente sem a ferramenta Agent/i, `must offer a subagent-reachable exit: ${reason}`);
  assert.match(reason, /DISPATCH_REQUEST/);
  assertNoGluedWord(reason);
});

// S4/S5 (v8.23.0 Batch 5, round-1 architecture reviewer MEDIUM finding): two DENY
// SITES inside handleBrainstormDispatch / handleSealedSpecImplementation — the
// HMAC-fail-under-STRICT branch and the unreadable-state branch — were initially
// read as "no tool-name assumption" (so left without the clause). But the underlying
// action each prescribes ("restore / re-sign the run state before dispatching") is
// only practically reachable via dispatch, exactly like their sibling denies that
// ALREADY carry the clause (BRAINSTORM_BYPASS, SPEC_CONTRACT_DISCIPLINE_MISSING,
// and the BRAINSTORM unreadable-state site on line ~649). A subagent reader with no
// Agent tool has no exit from these two either → both now carry
// subagentFallbackSuffix() for consistency (round-1 fix, re-confirmed round-2).

record('S4 [BRAINSTORM HMAC-fail under STRICT] deny includes the subagent-fallback clause', () => {
  const dp = mkTmp('f6b-brainstorm-hmac-');
  // Unsigned (but JSON-legible) sentinel-state under PIPELINE_HMAC_STRICT=true →
  // verifyState returns valid:false ("no signature present and strict mode enabled")
  // → the HMAC-fail deny site fires (NOT the unreadable catch: the JSON parses fine).
  fs.writeFileSync(path.join(dp, 'sentinel-state.json'), JSON.stringify({
    orchestrator_decision: { type: 'Feature', complexity: 'COMPLEXA' },
  }));
  const reason = dispatchSkill(dp, 'pipeline-orchestrator:feature-heavy', {
    PIPELINE_BRAINSTORM_ENFORCEMENT: 'deny',
    PIPELINE_HMAC_STRICT: 'true',
  });
  assert.ok(reason, 'expected a deny reason (fixture must reproduce the HMAC-fail site)');
  assert.match(reason, /\[BRAINSTORM\]/);
  assert.match(reason, /failed HMAC verification/);
  // S3 (round-2 security review, MEDIUM finding): the HMAC-fail reason must NOT
  // name the signing function (writeSignedState) or the signer lib path — that
  // is a state-forgery recipe a subagent with Bash could follow to mint a
  // validly-signed forged state and retry the dispatch, defeating the fail-closed
  // posture PIPELINE_HMAC_STRICT is meant to impose. The resolution must be
  // tool-agnostic (route via the pipeline-controller) + the legit operator escape.
  assert.doesNotMatch(reason, /writeSignedState|sentinel-state-signer/i,
    `HMAC-fail reason must NOT name the signing function/path (state-forgery recipe): ${reason}`);
  assert.match(reason, /via the pipeline-controller/i,
    `HMAC-fail reason must offer a tool-agnostic resolution via the controller: ${reason}`);
  assert.match(reason, /subagente sem a ferramenta Agent/i, `must offer a subagent-reachable exit: ${reason}`);
  assert.match(reason, /DISPATCH_REQUEST/);
  assertNoGluedWord(reason);
});

record('S5 [SPEC_CONTRACT unreadable-state] deny includes the subagent-fallback clause', () => {
  const dp = mkTmp('f6b-speccontract-unreadable-');
  // NO sentinel-state.json in the run dir → the read throws → the unreadable-state
  // deny site fires. PIPELINE_BRAINSTORM_ENFORCEMENT=warn isolates the path: the
  // brainstorm handler's own unreadable catch returns false (fail-open), so flow
  // reaches the SPEC_CONTRACT handler instead of short-circuiting on brainstorm.
  const reason = dispatchSkill(dp, 'pipeline-orchestrator:feature-heavy', {
    PIPELINE_SPEC_AUTHORING_ENFORCEMENT: 'deny',
    PIPELINE_BRAINSTORM_ENFORCEMENT: 'warn',
  });
  assert.ok(reason, 'expected a deny reason (fixture must reproduce the unreadable SPEC_CONTRACT site)');
  assert.match(reason, /\[SPEC_CONTRACT\]/);
  assert.match(reason, /unreadable\/corrupt/);
  assert.match(reason, /subagente sem a ferramenta Agent/i, `must offer a subagent-reachable exit: ${reason}`);
  assert.match(reason, /DISPATCH_REQUEST/);
  assertNoGluedWord(reason);
});

record('S6 [file-wide anti-recipe] no model-facing string in dispatch-guard.cjs names the signing function or signer lib path', () => {
  // Round-3 security review (N3): S4 pins ONLY the HMAC-fail site. A companion
  // FILE-WIDE guard ensures no deny reason ANYWHERE in the file re-introduces the
  // state-forgery recipe (writeSignedState / sentinel-state-signer) removed in
  // S3 — a future edit could regress a DIFFERENT site without tripping S4. The 2
  // LEGITIMATE occurrences of sentinel-state-signer live in a provenance comment
  // + the require() binding; both are stripped before the check, so only
  // model-facing string/code text is scanned.
  const src = fs.readFileSync(HOOK, 'utf8');
  const stripped = src.split(/\r?\n/)
    .filter((l) => !/^\s*\/\//.test(l))      // drop full-line comments (provenance note)
    .filter((l) => !/require\s*\(/.test(l))  // drop require/import lines (the lib binding)
    .join('\n');
  assert.doesNotMatch(stripped, /writeSignedState/i,
    'dispatch-guard.cjs: a model-facing string names writeSignedState — that is the state-forgery recipe removed in S3');
  assert.doesNotMatch(stripped, /sentinel-state-signer/i,
    'dispatch-guard.cjs: a model-facing string names the signer lib path — that is the state-forgery recipe removed in S3');
});

record('S3 [comment accuracy] buildDenyReason no longer lumps BRAINSTORM/SPEC_CONTRACT in with the Agent-only paths', () => {
  const src = fs.readFileSync(HOOK, 'utf8');
  // The corrected comment must explicitly say BRAINSTORM/SPEC_CONTRACT ARE reachable
  // via Skill — pin the language so a future edit can't silently revert the fix
  // while leaving the (now-wrong-again) old claim in place.
  assert.match(src, /BRAINSTORM.{0,400}called from BOTH the Agent branch AND the Skill branch/s,
    'the corrected comment explaining BRAINSTORM/SPEC_CONTRACT dual-reachability must be present');
});

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) { console.log('Failed:'); for (const n of failed) console.log(`  - ${n}`); }
process.exit(fail > 0 ? 1 : 0);
