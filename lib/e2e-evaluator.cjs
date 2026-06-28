#!/usr/bin/env node
'use strict';

/**
 * e2e-evaluator.cjs — deterministic, AI-free engine for the self-improvement loop.
 *
 * Compares, step-by-step, what a run was SUPPOSED to do against what it actually
 * did, produces an `e2e_score` (0-100, higher = better execution), and lists
 * every glitch. It is a JOIN over data the pipeline ALREADY records, never an
 * LLM call:
 *   expected = step-ledger STEP_MANIFESTS  +  fidelity-reporter mandatory gates
 *   actual   = sentinel-state.step_ledger  +  gate-decisions.jsonl
 *            + protocol-events.jsonl (hygiene)  +  verifyChainOrder (order)
 *
 * Produces:
 *   - {pipelineDocPath}/e2e-eval.json   (machine-readable)
 *   - {pipelineDocPath}/e2e-eval.md     (human-readable)
 *   - <repoRoot>/.pipeline/eval-log.jsonl  (cross-run dataset — the "large data")
 *
 * SOFT-fail policy (parity with fidelity-reporter): any unexpected error returns
 * { ok:false, error } so the Stop hook can skip silently and never block teardown.
 *
 * The proposal/fix half (LLM, human-gated) lives in commands/self-eval.md +
 * agents/quality/e2e-evaluator-diagnostic.md — this module is the cheap half that
 * runs on EVERY pipeline close.
 *
 * Created 2026-06-26 (plan: reactive-purring-yao).
 */

const fs = require('node:fs');
const path = require('node:path');

const { sanitizeDetail } = require('./jsonl-sanitizer.cjs');
const { withLock } = require('./exclusive-lock.cjs');
const ledger = require('./step-ledger.cjs');
const { generateFidelityReport, mandatorySetFor } = require('./fidelity-reporter.cjs');
const C = require('./contracts/e2e-eval.cjs');

const EVAL_LOG_REL_DIR = '.pipeline';
const EVAL_LOG_FILENAME = 'eval-log.jsonl';

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ---------------------------------------------------------------------------
// Reading the run's truth (immutable trace).
// ---------------------------------------------------------------------------

// Classification can be stamped under several historical field names. Read
// defensively; never throw. Returns { type, complexity, variant }.
function readClassification(state) {
  const s = state && typeof state === 'object' ? state : {};
  const od = s.orchestrator_decision && typeof s.orchestrator_decision === 'object' ? s.orchestrator_decision : {};
  const cl = s.classification && typeof s.classification === 'object' ? s.classification : {};
  const pick = (...cands) => {
    for (const c of cands) if (typeof c === 'string' && c.trim()) return c.trim();
    return null;
  };
  return {
    type: pick(s.task_type, s.type, od.task_type, od.type, cl.type),
    complexity: pick(s.complexity, od.complexity, cl.complexity),
    variant: pick(s.variant, s.pipeline_variant, s.workflow_variant, s.current_skill),
  };
}

// Read gate-decisions.jsonl → set of gate names that fired (any decision counts),
// plus whether the file existed and the line count. Never throws.
function readGatesFired(pipelineDocPath) {
  const filePath = path.join(pipelineDocPath, 'gate-decisions.jsonl');
  const out = { gatesFired: new Set(), existed: false, total: 0 };
  if (!fs.existsSync(filePath)) return out;
  out.existed = true;
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return out; }
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    out.total += 1;
    try {
      const ev = JSON.parse(line);
      if (ev && typeof ev === 'object' && typeof ev.gate === 'string' && ev.gate) {
        out.gatesFired.add(ev.gate.trim().normalize('NFC'));
      }
    } catch { /* skip malformed line */ }
  }
  return out;
}

// Read protocol-events.jsonl → array of { event, detail }. Never throws.
function readProtocolEvents(pipelineDocPath) {
  const filePath = path.join(pipelineDocPath, 'protocol-events.jsonl');
  const out = [];
  if (!fs.existsSync(filePath)) return out;
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return out; }
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const ev = JSON.parse(line);
      if (ev && typeof ev === 'object') {
        const name = typeof ev.event === 'string' ? ev.event : (typeof ev.gate === 'string' ? ev.gate : '');
        if (name) out.push({ event: name.trim(), detail: ev.detail || ev.reason || '' });
      }
    } catch { /* skip malformed line */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Expected vs actual.
// ---------------------------------------------------------------------------

function buildExpectedSet(state) {
  const workflowKey = ledger.resolveWorkflowKey(state);
  const expectedSteps = ledger.agentStepsFor(workflowKey); // ordered agent-steps
  const { type, complexity, variant } = readClassification(state);
  const expectedGates = mandatorySetFor(complexity, type, variant);
  return { workflowKey, expectedSteps, expectedGates, type, complexity, variant };
}

// ---------------------------------------------------------------------------
// Scoring (pure-ish: reads the trace, writes nothing here).
// ---------------------------------------------------------------------------

// AUDIT-006 (v8.17.0): tight predicate for the aborted-run short-circuit. Both
// signals required so a single stray field cannot suppress real scoring on a
// normal run.
function isAbortedRun(state) {
  if (!state || typeof state !== 'object') return false;
  const reason = state.abort_reason;
  if (typeof reason !== 'string' || !reason.trim()) return false;
  const outcome = state.pipeline_outcome;
  if (typeof outcome !== 'string') return false;
  return outcome.startsWith('ABORTED_');
}

// Build the aborted-run scoreRun result. Mirrors the normal scoreRun output
// shape so writers / consumers do not need a special path.
function buildAbortedScore({ state, pipelineDocPath, expected }) {
  const { workflowKey, expectedSteps, expectedGates, type, complexity, variant } = expected;
  const stampedSteps = Array.isArray(state.step_ledger) ? state.step_ledger.slice() : [];

  const abortGlitch = {
    kind: C.GLITCH_KINDS.HYGIENE_VIOLATION,
    target: 'PIPELINE_ABORTED',
    expected: false,
    actual: true,
    severity: 'high',
    weight: 1.0,
    evidence: 'sentinel-state.json: abort_reason + pipeline_outcome',
    detail: sanitizeDetail(`run aborted before workflow scoring: ${state.abort_reason} (${state.pipeline_outcome})`),
  };

  // ProcessHygiene is the only remaining sub-score; PIPELINE_ABORTED weight=1.0
  // pushes the term toward 0. Renormalization over a single applicable sub-score
  // makes the final e2e_score equal to processHygiene * 100.
  const processHygiene = 1 - Math.min(1, 1.0 / C.HYGIENE_SEVERITY_CAP);

  return {
    ok: true,
    schema_version: C.SCHEMA_VERSION,
    run_id: state.run_id || path.basename(pipelineDocPath.replace(/[\\/]+$/, '')) || 'unknown-run',
    pipeline_doc_path: pipelineDocPath,
    workflow_key: workflowKey,
    type: type || null,
    complexity: complexity || null,
    variant: variant || null,
    e2e_score: Math.round(processHygiene * 100),
    subscores: {
      step_completion: null,
      gate_coverage: null,
      order_integrity: null,
      process_hygiene: processHygiene,
    },
    fidelity_score: null,
    expected: { steps: expectedSteps, gates: expectedGates },
    actual: { steps: stampedSteps, gates_fired: [] },
    glitches: [abortGlitch],
    glitch_count: 1,
    aborted: true,
    abort_reason: state.abort_reason,
    pipeline_outcome: state.pipeline_outcome,
    generated_at: new Date().toISOString(),
  };
}

function scoreRun(opts) {
  if (!opts || typeof opts !== 'object') return { ok: false, error: 'opts object required' };
  const { pipelineDocPath, repoRoot } = opts;
  const state = opts.state && typeof opts.state === 'object' ? opts.state : {};
  if (!pipelineDocPath || typeof pipelineDocPath !== 'string') {
    return { ok: false, error: 'pipelineDocPath required' };
  }

  // AUDIT-006 (v8.17.0): evaluator-abort-blindspot.
  //
  // A run that aborted before it really started (user pressed escape during
  // classify; deterministic precondition rejected the prompt; etc.) is NOT a
  // run that failed its workflow — there was no workflow yet to fail. Without
  // this branch the evaluator scored aborted runs as if they had missed every
  // expected step + every mandatory gate, producing scores near zero and a
  // wall of `missing_step` / `missing_gate` noise that buried real findings.
  //
  // Trigger: `state.abort_reason` is a non-empty string AND
  // `state.pipeline_outcome` starts with `ABORTED_` (closed prefix). Both must
  // match — a lone abort_reason without an ABORTED_* outcome could be a
  // forensic field a normal run filled in, so we keep the existing path.
  //
  // Effect: drop StepCompletion / GateCoverage / OrderIntegrity (null →
  // renormalized over ProcessHygiene only); emit exactly one AUDIT-class
  // hygiene_violation named PIPELINE_ABORTED with severity high so the run
  // still surfaces in the cross-run dataset as an abort.
  if (isAbortedRun(state)) {
    return buildAbortedScore({ state, pipelineDocPath, expected: buildExpectedSet(state) });
  }

  const expected = buildExpectedSet(state);
  const { workflowKey, expectedSteps, expectedGates, type, complexity, variant } = expected;

  const stampedSteps = Array.isArray(state.step_ledger) ? state.step_ledger.slice() : [];
  const stampedSet = new Set(stampedSteps);
  const { gatesFired, existed: gateExisted } = readGatesFired(pipelineDocPath);
  const protocolEvents = readProtocolEvents(pipelineDocPath);

  // Step / order sub-scores only apply when the run was actually agent-ledger
  // tracked (FULL/brainstorm with at least one stamped step). Skill-dispatched
  // report-only runs (Audit/UX) stamp nothing here — their step/order are N/A
  // (dropped + renormalized), so they are NOT falsely penalized. This is what
  // lets "always evaluate" hold for every run type without false glitches.
  const hasAgentLedger = expectedSteps.length > 0 && stampedSteps.length > 0;

  const glitches = [];

  // --- StepCompletion + missing_step ---
  let stepCompletion = null;
  if (hasAgentLedger) {
    const done = expectedSteps.filter((s) => stampedSet.has(s));
    stepCompletion = done.length / expectedSteps.length;
    for (const s of expectedSteps) {
      if (!stampedSet.has(s)) {
        glitches.push({
          kind: C.GLITCH_KINDS.MISSING_STEP,
          target: s,
          expected: true,
          actual: false,
          severity: 'high',
          weight: 1.0,
          evidence: 'sentinel-state.json:step_ledger',
          detail: `expected agent-step '${s}' (${workflowKey}) was never stamped`,
        });
      }
    }
  }

  // --- OrderIntegrity + out_of_order ---
  let orderIntegrity = null;
  if (hasAgentLedger) {
    const order = ledger.verifyChainOrder(state, workflowKey);
    if (order.valid) {
      orderIntegrity = 1;
    } else {
      let prefix = 0;
      for (const s of expectedSteps) { if (stampedSet.has(s)) prefix += 1; else break; }
      orderIntegrity = expectedSteps.length ? prefix / expectedSteps.length : 1;
      glitches.push({
        kind: C.GLITCH_KINDS.OUT_OF_ORDER,
        target: order.brokenAt,
        expected: true,
        actual: false,
        severity: 'high',
        weight: 1.0,
        evidence: 'sentinel-state.json:step_ledger',
        detail: `chain order broken at '${order.brokenAt}' — a later step was stamped before it`,
      });
    }
  }

  // --- GateCoverage (reuse fidelity_score SSOT) + missing_gate ---
  // Call generateFidelityReport for the canonical fidelity_score AND to write the
  // fidelity-report artifact idempotently. Fall back to our own identical ratio if
  // its strict guards (e.g. unknown complexity) reject the run.
  let fidelityScore = null;
  let fidelityOk = false;
  if (repoRoot && typeof repoRoot === 'string') {
    try {
      const fr = generateFidelityReport({
        pipelineDocPath, type: type || 'Unknown', complexity, variant, repoRoot,
        runId: state.run_id || path.basename(pipelineDocPath.replace(/[\\/]+$/, '')),
      });
      if (fr && fr.ok) { fidelityScore = fr.fidelityScore; fidelityOk = true; }
    } catch { /* fall through to local computation */ }
  }
  const triggeredMandatory = expectedGates.filter((g) => gatesFired.has(g)).length;
  if (!fidelityOk) {
    fidelityScore = (gateExisted && expectedGates.length > 0)
      ? triggeredMandatory / expectedGates.length
      : null;
  }
  const gateCoverage = fidelityScore; // null → N/A (dropped + renormalized)

  if (expectedGates.length > 0) {
    if (!gateExisted) {
      glitches.push({
        kind: C.GLITCH_KINDS.MISSING_GATE,
        target: '(no gate-decisions logged)',
        expected: true,
        actual: false,
        severity: 'high',
        weight: 1.0,
        evidence: 'gate-decisions.jsonl (absent/empty)',
        detail: `run logged zero gate decisions; ${expectedGates.length} mandatory gate(s) expected`,
      });
    } else {
      for (const g of expectedGates) {
        if (!gatesFired.has(g)) {
          glitches.push({
            kind: C.GLITCH_KINDS.MISSING_GATE,
            target: g,
            expected: true,
            actual: false,
            severity: 'high',
            weight: 1.0,
            evidence: 'gate-decisions.jsonl',
            detail: `mandatory gate '${g}' never fired`,
          });
        }
      }
    }
  }

  // --- ProcessHygiene + hygiene_violation (always applicable) ---
  let severitySum = 0;
  for (const ev of protocolEvents) {
    const w = C.severityForEvent(ev.event);
    severitySum += w;
    glitches.push({
      kind: C.GLITCH_KINDS.HYGIENE_VIOLATION,
      target: ev.event,
      expected: false,
      actual: true,
      severity: C.severityLabel(w),
      weight: w,
      evidence: `protocol-events.jsonl: ${ev.event}`,
      detail: sanitizeDetail(ev.detail) || `audit event '${ev.event}' recorded during the run`,
    });
  }
  const processHygiene = 1 - Math.min(1, severitySum / C.HYGIENE_SEVERITY_CAP);

  // --- Combine (renormalize over applicable sub-scores) ---
  const subs = { stepCompletion, gateCoverage, orderIntegrity, processHygiene };
  let wsum = 0, acc = 0;
  for (const key of Object.keys(C.SCORE_WEIGHTS)) {
    const v = subs[key];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const w = C.SCORE_WEIGHTS[key];
    wsum += w;
    acc += w * clamp01(v);
  }
  const e2eScore = wsum > 0 ? Math.round((acc / wsum) * 100) : null;

  return {
    ok: true,
    schema_version: C.SCHEMA_VERSION,
    run_id: state.run_id || path.basename(pipelineDocPath.replace(/[\\/]+$/, '')) || 'unknown-run',
    pipeline_doc_path: pipelineDocPath,
    workflow_key: workflowKey,
    type: type || null,
    complexity: complexity || null,
    variant: variant || null,
    e2e_score: e2eScore,
    subscores: {
      step_completion: stepCompletion,
      gate_coverage: gateCoverage,
      order_integrity: orderIntegrity,
      process_hygiene: processHygiene,
    },
    fidelity_score: fidelityScore,
    expected: { steps: expectedSteps, gates: expectedGates },
    actual: { steps: stampedSteps, gates_fired: Array.from(gatesFired) },
    glitches,
    glitch_count: glitches.length,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Writing the artifacts.
// ---------------------------------------------------------------------------

function fmtScore(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  return (Math.round(v * 10000) / 10000).toString();
}
function escapeMdCell(v) {
  if (v == null) return '';
  return String(v).replace(/\|/g, '\\|');
}

function buildMarkdown(ev) {
  const s = ev.subscores;
  const glitchRows = ev.glitches.length
    ? ev.glitches.map((g) => `| ${escapeMdCell(g.kind)} | ${escapeMdCell(g.target)} | ${escapeMdCell(g.severity)} | ${escapeMdCell(g.detail)} |`).join('\n')
    : '| — | — | — | (no glitches — clean run) |';
  return [
    `# E2E Self-Evaluation — ${ev.run_id}`,
    '',
    '> How faithfully this run executed its intended workflow. Higher score = better. The fix proposals (human-gated) are produced by `/pipeline-orchestrator:self-eval`.',
    '',
    '## Score',
    '',
    `- **E2E score:** ${ev.e2e_score === null ? 'n/a' : ev.e2e_score + ' / 100'}`,
    `- **Type / Complexity / Variant:** ${ev.type || '—'} / ${ev.complexity || '—'} / ${ev.variant || '—'} (workflow: ${ev.workflow_key})`,
    `- **Glitches found:** ${ev.glitch_count}`,
    '',
    '### Sub-scores (n/a = not applicable to this workflow; dropped + renormalized)',
    '',
    '| Sub-score | Value | Weight |',
    '|-----------|-------|--------|',
    `| StepCompletion | ${fmtScore(s.step_completion)} | ${C.SCORE_WEIGHTS.stepCompletion} |`,
    `| GateCoverage (fidelity) | ${fmtScore(s.gate_coverage)} | ${C.SCORE_WEIGHTS.gateCoverage} |`,
    `| OrderIntegrity | ${fmtScore(s.order_integrity)} | ${C.SCORE_WEIGHTS.orderIntegrity} |`,
    `| ProcessHygiene | ${fmtScore(s.process_hygiene)} | ${C.SCORE_WEIGHTS.processHygiene} |`,
    '',
    '## Glitches',
    '',
    '| Kind | Target | Severity | Detail |',
    '|------|--------|----------|--------|',
    glitchRows,
    '',
    '## See Also',
    '',
    '- `e2e-eval.json` — machine-readable version of this report',
    '- `fidelity-report.json` — the gate-coverage component',
    '- `.pipeline/eval-log.jsonl` — cross-run evaluation dataset',
    '',
  ].join('\n');
}

function writeEval(pipelineDocPath, ev) {
  if (!pipelineDocPath || typeof pipelineDocPath !== 'string') {
    return { ok: false, error: 'pipelineDocPath required' };
  }
  try {
    if (!fs.existsSync(pipelineDocPath)) fs.mkdirSync(pipelineDocPath, { recursive: true });
    const jsonPath = path.join(pipelineDocPath, 'e2e-eval.json');
    const mdPath = path.join(pipelineDocPath, 'e2e-eval.md');
    fs.writeFileSync(jsonPath, JSON.stringify(ev, null, 2) + '\n', { encoding: 'utf8' });
    fs.writeFileSync(mdPath, buildMarkdown(ev), { encoding: 'utf8' });
    return { ok: true, jsonPath, mdPath };
  } catch (err) {
    return { ok: false, error: `writeEval: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Cross-run dataset (the "large data") — mirrors lib/run-log.cjs append policy.
// ---------------------------------------------------------------------------

function evalLogPath(repoRoot) {
  return path.join(repoRoot, EVAL_LOG_REL_DIR, EVAL_LOG_FILENAME);
}

function buildEvalLogEntry(ev) {
  const byKind = { missing_step: 0, missing_gate: 0, out_of_order: 0, hygiene_violation: 0 };
  for (const g of ev.glitches) { if (byKind[g.kind] !== undefined) byKind[g.kind] += 1; }
  return {
    schema_version: C.SCHEMA_VERSION,
    run_id: sanitizeDetail(ev.run_id),
    type: ev.type,
    complexity: ev.complexity,
    variant: ev.variant,
    workflow_key: ev.workflow_key,
    e2e_score: ev.e2e_score,
    fidelity_score: ev.fidelity_score,
    glitch_count: ev.glitch_count,
    glitches_by_kind: byKind,
    pipeline_doc_path: sanitizeDetail(ev.pipeline_doc_path),
    generated_at: ev.generated_at,
  };
}

function appendEvalLog(repoRoot, ev) {
  if (typeof repoRoot !== 'string' || !repoRoot) {
    return { ok: false, error: 'appendEvalLog: repoRoot must be a non-empty string' };
  }
  if (!path.isAbsolute(repoRoot)) {
    return { ok: false, error: 'path-traversal: repoRoot must be absolute' };
  }
  let line;
  try { line = JSON.stringify(buildEvalLogEntry(ev)); } catch (err) {
    return { ok: false, error: `JSON.stringify failed: ${err.message}` };
  }
  try { JSON.parse(line); } catch (err) {
    return { ok: false, error: `round-trip parse failed: ${err.message}` };
  }
  const file = evalLogPath(repoRoot);
  try {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    withLock(file, () => { fs.appendFileSync(file, line + '\n', { encoding: 'utf8' }); });
  } catch (err) {
    return { ok: false, error: `append failed: ${err.message}` };
  }
  return { ok: true };
}

function readEvalLog(repoRoot) {
  if (typeof repoRoot !== 'string' || !repoRoot || !path.isAbsolute(repoRoot)) return [];
  const file = evalLogPath(repoRoot);
  if (!fs.existsSync(file)) return [];
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) out.push(parsed);
    } catch { /* skip */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// One-call orchestration for the Stop hook: score → write → append.
// ---------------------------------------------------------------------------

function evaluateRun(opts) {
  const ev = scoreRun(opts);
  if (!ev.ok) return ev;
  writeEval(opts.pipelineDocPath, ev);            // best-effort
  if (opts.repoRoot) appendEvalLog(opts.repoRoot, ev); // best-effort
  return ev;
}

module.exports = {
  readClassification,
  readGatesFired,
  readProtocolEvents,
  buildExpectedSet,
  scoreRun,
  buildMarkdown,
  writeEval,
  buildEvalLogEntry,
  appendEvalLog,
  readEvalLog,
  evalLogPath,
  evaluateRun,
};
