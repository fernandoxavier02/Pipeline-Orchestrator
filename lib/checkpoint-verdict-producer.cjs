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

// Derive the verdict from REAL machine evidence. Accepts the T15 ledger entry shape
// (or a compatible object): an exit_code of 0 ⇒ 'pass'; any non-zero finite code ⇒
// 'fail'. Tolerates the alternate spellings the defensive collector uses. Returns
// 'pass' | 'fail' | null (null when no exit code is present — never fabricated).
function verdictFromEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return null;
  const candidates = [evidence.exit_code, evidence.exitCode, evidence.code, evidence.status];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c === 0 ? 'pass' : 'fail';
  }
  // A pre-normalized verdict string is also honored (e.g. a caller that already
  // resolved 'pass'/'fail' from the ledger) — but prose/unknown stays null.
  if (typeof evidence.verdict === 'string') {
    const v = evidence.verdict.trim().toLowerCase();
    if (v === 'pass' || v === 'fail') return v;
  }
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
    return { ok: true, skipped: 'no-machine-exit-code' };
  }
  if (typeof pipelineDocPath !== 'string' || !pipelineDocPath) {
    return { ok: false, error: 'pipelineDocPath required' };
  }
  if (!recorder || typeof recorder.recordCheckpointVerdict !== 'function') {
    return { ok: false, error: 'recordCheckpointVerdict unavailable' };
  }
  // Delegate the SIGNED, locked write to the shipped recorder (SSOT). Passing the
  // normalized verdict string keeps the machine-derived fact authoritative.
  return recorder.recordCheckpointVerdict(path.normalize(pipelineDocPath), verdict);
}

module.exports = {
  produceCheckpointVerdict,
  verdictFromEvidence,
  // alias the contract test tolerates
  produce: produceCheckpointVerdict,
};
