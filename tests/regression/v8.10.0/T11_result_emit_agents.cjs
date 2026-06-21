#!/usr/bin/env node
'use strict';

// =============================================================================
// T11 (v8.10.0) — REQ-RESULT-EMIT: 9 governed agents emit PIPELINE_AGENT_RESULT_V1.
// TDD RED phase. This is the PRODUCER the SubagentStop commit (T13) gates its
// arming on. Each of the 9 governed agent .md files must gain (a) a closing
// instruction telling the agent to emit a fenced `=== PIPELINE_AGENT_RESULT_V1 ===`
// block as its final message, and (b) a SAMPLE block that the real parser
// (lib/contracts/pipeline-agent-result.cjs::parseResultBlock) accepts (ok:true) —
// proving the prose uses only the parser's KNOWN governance keys + closed status.
// Covers user-APPROVED scenarios T11-S1..S3.
//
// ----------------------------------------------------------------------------
// EXPECTED RED REASON — read before running.
// ----------------------------------------------------------------------------
// None of the 9 files contain the marker today (verified: grep finds zero). So:
//   T11-S1 — FAILS: the emission instruction / marker is absent in each file.
//   T11-S2 — FAILS: there is no embedded sample block to feed the parser.
//   T11-S3 — the mutation-verify: it strips the marker from an IN-MEMORY copy of
//            each file and asserts the same predicate the live test uses then
//            REJECTS it. This proves the live check is load-bearing (it FAILS the
//            moment the instruction is gone) rather than a permanently-true scan.
//            S3 PASSES even at RED (it tests the predicate, not the files) — it is
//            the guard that keeps S1 honest once the prose lands.
// The parser module IS shipped and required directly, so any failure here is a
// real content ASSERTION (marker missing / sample not ok:true), never an
// ImportError — a valid behavioral RED.
//
// run-001 C1 lesson honored: T13 will block over a value THIS produces. T11-S2
// confirms the produced sample is one the parser actually accepts, so T13 never
// asserts a value the system can't emit.
// =============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const { parseResultBlock, BEGIN, END } = require('../../../lib/contracts/pipeline-agent-result.cjs');

// The 9 governed agent files (tasks.md T11). Paths relative to repo root.
const AGENT_FILES = [
  'agents/core/task-orchestrator.md',
  'agents/core/information-gate.md',
  'agents/quality/plan-architect.md',
  'agents/quality/quality-gate-router.md',
  'agents/quality/pre-tester.md',
  'agents/executor/executor-controller.md',
  'agents/quality/review-orchestrator.md',
  'agents/core/sanity-checker.md',
  'agents/core/final-validator.md',
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// CRLF-safe extraction of the LAST complete BEGIN..END block in a file's text.
// (Mirrors the parser's own last-block-wins semantics, but here just to lift the
// raw sample out of the .md prose so we can feed it to the real parser.)
function extractSample(text) {
  const endIdx = text.lastIndexOf(END);
  if (endIdx < 0) return null;
  const beginIdx = text.lastIndexOf(BEGIN, endIdx - 1);
  if (beginIdx < 0) return null;
  // Return the full fenced block (BEGIN..END inclusive) so the parser sees a
  // complete, well-formed block exactly as the agent would emit it.
  return text.slice(beginIdx, endIdx + END.length);
}

// The predicate the LIVE T11-S1 applies: does this file text carry the emission
// instruction? Re-derived here so the mutation-verify (S3) mirror-checks it.
function hasEmissionInstruction(text) {
  // The instruction must reference the marker by name AND tell the agent to emit
  // it. We require the literal BEGIN marker to appear (the agent's sample/closing
  // instruction). A file with no marker at all cannot satisfy REQ-RESULT-EMIT.
  return text.includes(BEGIN) && text.includes(END);
}

let pass = 0, fail = 0;
const failed = [];
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; failed.push(name); }
}

console.log('=== T11 v8.10.0 — 9 agents emit PIPELINE_AGENT_RESULT_V1 (RED until the closing instruction + sample land) ===');

// ---- T11-S1 [main] every one of the 9 files contains the emission instruction
test('T11-S1 [main] each of the 9 governed agent files carries the PIPELINE_AGENT_RESULT_V1 emission instruction', () => {
  const missing = [];
  for (const rel of AGENT_FILES) {
    const txt = read(rel);
    if (!hasEmissionInstruction(txt)) missing.push(rel);
  }
  assert.equal(missing.length, 0,
    `these governed agent files lack the PIPELINE_AGENT_RESULT_V1 emission instruction (REQ-RESULT-EMIT, the RED): \n  - ` +
    missing.join('\n  - '));
});

// ---- T11-S2 [main] each embedded sample block parses ok:true ----------------
test('T11-S2 [main] the sample block in each of the 9 files is accepted by parseResultBlock (ok:true, known keys only)', () => {
  const problems = [];
  for (const rel of AGENT_FILES) {
    const txt = read(rel);
    const sample = extractSample(txt);
    if (sample === null) { problems.push(`${rel}: no embedded result block to validate`); continue; }
    const parsed = parseResultBlock(sample);
    if (!parsed || parsed.ok !== true) {
      problems.push(`${rel}: embedded sample REJECTED by parser → ${parsed && parsed.error ? parsed.error : '(no result)'}`);
    }
  }
  assert.equal(problems.length, 0,
    `these embedded result samples are not parser-valid (must use ONLY known governance keys + closed status vocab): \n  - ` +
    problems.join('\n  - '));
});

// ---- T11-S3 [deny-bad / mutation] removing the instruction is CAUGHT ---------
// The live S1 predicate must REJECT a file whose marker was deleted. We mutate an
// IN-MEMORY copy of EACH real file (strip every BEGIN/END marker) and assert the
// predicate flips to "missing" — proving the test cannot be made green by anything
// other than restoring the instruction. No file under agents/ is written; the
// mutation is a string transform, so the suite stays hermetic.
test('T11-S3 [mutation] stripping the emission instruction from any of the 9 files is detected by the live predicate', () => {
  for (const rel of AGENT_FILES) {
    const txt = read(rel);
    // Mutant: remove the marker lines entirely (the deletion the mutation models).
    const mutated = txt.split(BEGIN).join('__STRIPPED_BEGIN__').split(END).join('__STRIPPED_END__');
    assert.equal(hasEmissionInstruction(mutated), false,
      `the live emission-instruction predicate FAILED to notice the marker was stripped from ${rel} — ` +
      'a permanently-true scan that never fires would let REQ-RESULT-EMIT silently regress');
  }
  // And the inverse: a synthetic file WITH a minimal valid block satisfies BOTH
  // the presence predicate AND the parser (the contract the 9 files must meet).
  const goodSample =
    `${BEGIN}\n` +
    `{ "status": "completed", "summary": "ok", "next_agent": "review-orchestrator" }\n` +
    `${END}\n`;
  assert.equal(hasEmissionInstruction(goodSample), true, 'a file carrying the marker must satisfy the presence predicate');
  assert.equal(parseResultBlock(goodSample).ok, true, 'the minimal model sample must itself be parser-valid (sanity)');
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
if (failed.length) {
  console.log('Failed checks (expected RED until the 9 agents emit a PIPELINE_AGENT_RESULT_V1 block):');
  for (const n of failed) console.log(`  - ${n}`);
}
process.exit(fail > 0 ? 1 : 0);
