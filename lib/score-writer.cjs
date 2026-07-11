#!/usr/bin/env node
'use strict';

/**
 * score-writer.cjs — emit 4-axis user scores to Langfuse for the current run.
 *
 * Implements the v7.6.0 user-score collection step invoked by final-validator
 * after the Pa de Cal decision. Each axis (plan, execution, review, result)
 * becomes one Langfuse Score attached to the run's traceId.
 *
 * Contract:
 *   writeScores({ scores, comments? }) -> { ok, written, skipped, reason? }
 *
 *   scores  : { plan, execution, review, result } — each is 1-5 integer OR
 *             null (meaning "not applicable for this run").
 *   comments: optional { plan?, execution?, review?, result? } strings.
 *
 *   Returns:
 *     ok=true  + written=[axis names]       — Langfuse enabled, scored axes sent.
 *     ok=true  + skipped=true + reason=...  — Langfuse disabled or no trace open
 *                                              (no-op, not an error).
 *     ok=false + reason=...                  — invalid input or SDK threw.
 *
 * Design choices:
 *   - 1-5 scale stored verbatim (Langfuse NUMERIC type). The "n/a" choice is
 *     represented by NOT sending a score for that axis; absence carries
 *     meaning (e.g., Audit runs have no review axis).
 *   - Each axis is a separate Langfuse Score (not bundled into one). This
 *     makes the LLM-as-judge phase (v7.7+) trivially correlate per-axis
 *     human grades with per-axis machine grades.
 *   - Score `name` follows convention `user.<axis>` so judges can use
 *     `judge.<axis>` later without collision.
 *   - All calls are fire-and-forget; failures are logged to the existing
 *     langfuse-errors.jsonl, never propagated to the controller.
 */

const ALLOWED_AXES = Object.freeze(['plan', 'execution', 'review', 'result']);
const MIN_VALUE = 1;
const MAX_VALUE = 5;
// QUAL-2 (v7.6.0): name the cap. Langfuse Score API accepts free-form comments;
// 500 chars accommodates a short justification while staying well under any
// payload limit. Matches the practical ceiling used by langfuse-sanitizer.
const COMMENT_MAX_CHARS = 500;

function validateScores(scores) {
  if (!scores || typeof scores !== 'object') {
    return { ok: false, reason: 'scores must be an object' };
  }
  for (const axis of ALLOWED_AXES) {
    const v = scores[axis];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      return { ok: false, reason: `${axis} must be integer or null, got ${typeof v}` };
    }
    if (v < MIN_VALUE || v > MAX_VALUE) {
      return { ok: false, reason: `${axis}=${v} outside [${MIN_VALUE},${MAX_VALUE}]` };
    }
  }
  // Reject unknown keys so callers catch typos early.
  for (const key of Object.keys(scores)) {
    if (!ALLOWED_AXES.includes(key)) {
      return { ok: false, reason: `unknown axis "${key}"; allowed: ${ALLOWED_AXES.join(', ')}` };
    }
  }
  return { ok: true };
}

function writeScores({ scores, comments } = {}) {
  const validation = validateScores(scores);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  // Lazy require so callers that never opt-in to Langfuse pay no load cost.
  // v8.20.0-glm port: Langfuse integration removed. client/carrier libs deleted;
  // sanitizer kept (generic payload sanitization). try-catch fail-open stays as
  // defense for any future restoration, but the missing-client path short-circuits
  // to a clean disabled state instead of erroring.
  let clientLib;
  let carrierLib;
  let sanitizer;
  try {
    sanitizer = require('./langfuse-sanitizer.cjs');
  } catch (e) {
    return { ok: false, reason: `failed to load sanitizer lib: ${e && e.message}` };
  }
  try {
    clientLib = require('./langfuse-client.cjs');
    carrierLib = require('./langfuse-carrier.cjs');
  } catch (_e) {
    // Langfuse removido neste port — retorna disabled sem propagar erro.
    return { ok: true, skipped: true, reason: 'langfuse_not_installed' };
  }

  if (!clientLib.isEnabled || !clientLib.isEnabled()) {
    return { ok: true, skipped: true, reason: 'langfuse_disabled' };
  }

  const carrier = carrierLib.readTraceCarrierForCurrentProcess();
  if (!carrier || !carrier.traceId) {
    // Trace was never opened for this run (hooks off, no agent dispatched yet,
    // or carrier was cleaned up early). Silently no-op rather than fail —
    // there is genuinely nowhere to attach the score.
    try {
      clientLib.logError && clientLib.logError(
        'unknown',
        'score-writer: no trace carrier for current process',
        { hook_name: 'score-writer' }
      );
    } catch (_e) { /* swallow */ }
    return { ok: true, skipped: true, reason: 'no_trace_open' };
  }

  const client = clientLib.getClient && clientLib.getClient();
  if (!client || typeof client.score !== 'function') {
    return { ok: true, skipped: true, reason: 'sdk_unavailable' };
  }

  const written = [];
  const c = comments || {};
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  for (const axis of ALLOWED_AXES) {
    const value = scores[axis];
    if (value === null || value === undefined) continue;
    try {
      // SEC-4 (v7.6.0): comment goes through the same 3-layer sanitizer that
      // every other Langfuse payload uses (length cap + path redaction + secret
      // redaction). Then bound to COMMENT_MAX_CHARS as the Langfuse Score API
      // cap. Without this, a user comment containing a path or env-var secret
      // would be sent verbatim to the Langfuse backend.
      const rawComment = typeof c[axis] === 'string' && c[axis].length > 0
        ? c[axis] : null;
      const safeComment = rawComment
        ? sanitizer.sanitizeSpanPayload(rawComment, pluginRoot).slice(0, COMMENT_MAX_CHARS)
        : undefined;

      // Fire-and-forget. The SDK queues internally; stop-hook flushes at session end.
      client.score({
        traceId: carrier.traceId,
        name: `user.${axis}`,
        value,
        dataType: 'NUMERIC',
        comment: safeComment,
      });
      written.push(axis);
    } catch (e) {
      try {
        clientLib.logError && clientLib.logError(
          'sdk_throw',
          `score-writer: client.score threw for axis=${axis}: ${e && e.message}`,
          { hook_name: 'score-writer' }
        );
      } catch (_e) { /* swallow */ }
      // Continue with remaining axes — one failure should not block the others.
    }
  }

  return { ok: true, written };
}

module.exports = {
  writeScores,
  ALLOWED_AXES,
  MIN_VALUE,
  MAX_VALUE,
  _internals: { validateScores },
};
