'use strict';

// =============================================================================
// lib/checkpoint-verdict-producer.cjs — T20 (REQ-GREEN-CLOSE-PRODUCER), v8.10.0.
// =============================================================================
// The producer that closes the run-001 C1 hole: it derives `last_checkpoint_verdict`
// ('pass'|'fail') from REAL machine evidence (a process exit code — sourced from the
// T15 machine-evidence ledger / the checkpoint command's actual exit code), NOT from
// agent prose, and writes it into the SIGNED sentinel-state under the shipped
// exclusive lock + HMAC re-sign by delegating to the shipped
// scripts/record-step.cjs::recordCheckpointVerdict (which owns the locked write).
//
// The consumer side already ships: .claude/hooks/checkpoint-verdict-gate.cjs reads
// state.last_checkpoint_verdict and DENIES an armed code-changing close when it is
// 'fail'. Without THIS producer the field stayed perpetually null and the fail-block
// was unenforceable — the C1 lesson. The gate stays DEFAULT-OFF
// (PIPELINE_REQUIRE_GREEN_CLOSE is the arm switch); arming a default-on green-close
// still waits on live proof the producer fires before close (same discipline as T13).
//
// PURE intent: zero side effects at require time. The only side effect is the signed
// state write performed by the shipped recorder when produce() is called.
// =============================================================================

const path = require('node:path');

let recorder = null;
try { recorder = require('../scripts/record-step.cjs'); } catch { recorder = null; }

// Derive the verdict from REAL machine evidence (the T15 ledger entry shape, or a
// compatible object). Returns 'pass' | 'fail' | null (null = no usable machine signal,
// never fabricated).
//
// LIVE-PROBE FINDING (2026-06-21): the Claude Code Bash tool_response carries NO
// structured exit code — so the original exit-code derivation could never fire. The
// real deterministic signals the harness DOES expose are `interrupted` and the command
// stdout. So the order of authority is now:
//   1. a numeric exit_code IF a future runtime ever exposes one (forward-compat);
//   2. a pre-resolved verdict string;
//   3. `interrupted === true` ⇒ 'fail' (hard failure the harness reports);
//   4. the test runner's OWN summary line parsed from stdout
//      ("Summary: P passed / F failed ...") ⇒ 'fail' when F>0, else 'pass';
//   5. a clean "build ok" with no test summary ⇒ 'pass'.
// NOTE: with pre-existing env test failures present, (4) yields 'fail' — which is the
// correct conservative behavior for a green-close gate (don't close green while ANY
// test fails); the operator clears them before arming PIPELINE_REQUIRE_GREEN_CLOSE.
function verdictFromEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  const candidates = [evidence.exit_code, evidence.exitCode, evidence.code, evidence.status];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c === 0 ? 'pass' : 'fail';
  }
  if (typeof evidence.verdict === 'string') {
    const v = evidence.verdict.trim().toLowerCase();
    if (v === 'pass' || v === 'fail') return v;
  }
  if (evidence.interrupted === true) return 'fail';
  const out = typeof evidence.stdout === 'string' ? evidence.stdout : '';
  // 4a. The project runner's own summary line (most specific, kept first).
  const re = /Summary:\s*\d+\s*(?:passed|pass)\s*\/\s*(\d+)\s*(?:failed|fail)/ig;
  let m, last = null;
  while ((m = re.exec(out)) !== null) last = m;
  if (last) return Number(last[1]) > 0 ? 'fail' : 'pass';
  // 4b. Common runner summaries (conservative — ANY reported failure ⇒ fail):
  //   pytest "5 failed, 3 passed" / "10 passed in 0.4s"
  //   jest   "Tests: 2 failed, 10 passed" / "Test Suites: 1 failed, 2 passed"
  //   node   "# fail 2" / "# pass 10"
  const mFailed = /(\d+)\s+failed\b/i.exec(out) || /#\s*fail\s+(\d+)/i.exec(out);
  if (mFailed) return Number(mFailed[1]) > 0 ? 'fail' : 'pass';
  if (/\b\d+\s+passed\b/i.test(out) || /#\s*pass\s+\d+/i.test(out)) return 'pass';
  // 4c. go test: a FAIL line ⇒ fail; an `ok `/PASS with no FAIL ⇒ pass.
  if (/(^|\n)\s*(FAIL|--- FAIL)\b/.test(out)) return 'fail';
  if (/(^|\n)\s*ok\s+\S/.test(out) || /(^|\n)\s*PASS\b/.test(out)) return 'pass';
  // 5. A clean "build ok" with no test summary ⇒ pass.
  if (/\bbuild ok\b/i.test(out) && !/\bbuild (failed|error)\b/i.test(out)) return 'pass';
  return null;
}

// produceCheckpointVerdict(pipelineDocPath, evidence) → result.
// Derives the verdict from the REAL exit code in `evidence` and persists it into the
// signed sentinel-state via the shipped locked + HMAC-re-signing recorder. Best-effort
// + honest: an evidence object with no usable exit code records nothing (no fabricated
// verdict), so the gate never blocks over a value the machine did not produce.
function produceCheckpointVerdict(pipelineDocPath, evidence) {
  const verdict = verdictFromEvidence(evidence);
  if (verdict !== 'pass' && verdict !== 'fail') {
    return { ok: true, skipped: 'no-machine-signal' };
  }
  if (typeof pipelineDocPath !== 'string' || !pipelineDocPath) {
    return { ok: false, error: 'pipelineDocPath required' };
  }
  if (!recorder || typeof recorder.recordCheckpointVerdict !== 'function') {
    return { ok: false, error: 'recordCheckpointVerdict unavailable' };
  }
  // Delegate the SIGNED, locked write to the shipped recorder (SSOT). Passing the
  // normalized verdict string keeps the machine-derived fact authoritative.
  // {countFailure:false}: feed last_checkpoint_verdict (green-close A1) ONLY — the
  // A2/A3 consecutive-failure counter stays owned by the agent checkpoint path, so one
  // red checkpoint is never double-counted across the two producers.
  return recorder.recordCheckpointVerdict(path.normalize(pipelineDocPath), verdict, { countFailure: false });
}

module.exports = {
  produceCheckpointVerdict,
  verdictFromEvidence,
  // alias the contract test tolerates
  produce: produceCheckpointVerdict,
};
