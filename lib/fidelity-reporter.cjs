#!/usr/bin/env node
'use strict';

/**
 * fidelity-reporter.cjs — Per-run fidelity score + report generator.
 *
 * Consumes:
 *   - {pipelineDocPath}/gate-decisions.jsonl  (per-run gate log)
 *   - <repoRoot>/.pipeline/run-log.jsonl      (cross-run accumulated log)
 *
 * Produces:
 *   - {pipelineDocPath}/fidelity-report.md
 *   - {pipelineDocPath}/fidelity-report.json
 *
 * Schema: see references/fidelity-report-schema.md.
 * Mandatory gate set: see references/gates.md "Mandatory Gates by Complexity".
 *
 * SOFT-fail policy: any unexpected error returns { ok: false, error } so the
 * pipeline-controller can warn without aborting. Empty input is NOT an error
 * — it returns ok=true with fidelityScore=null.
 */

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeDetail } = require('./jsonl-sanitizer.cjs');
const { readRunLog } = require('./run-log.cjs');

const SCHEMA_VERSION = '1.0.0';

// SEC-3 / SEC-7: enums for the fields we render into Markdown tables and JSON.
// Unknown values are replaced with the sentinel '(invalid)' rather than echoed
// verbatim, so a hand-crafted gate-decisions.jsonl line cannot inject MD or
// pivot a table cell.
//
// v7.1.0 widening + structural SSOT (post-final-adversarial CLAR-1 fix):
// VALID_DECISION and VALID_HARDNESS now REFERENCE the canonical sets exported
// by lib/gate-decision-writer.cjs — they are the same Set object, not parallel
// declarations. Adding a 9th canonical value in the writer automatically
// propagates here; drift between writer and reader becomes structurally
// impossible. v7.1.0 also threads a `warnings` array through validate* so
// historical/external values previously masked as silent '(invalid)' surface
// in fidelity-report.{json,md} for operator review.
const { CANONICAL_DECISIONS, CANONICAL_HARDNESS } = require('./gate-decision-writer.cjs');
const VALID_HARDNESS = CANONICAL_HARDNESS;
const VALID_DECISION = CANONICAL_DECISIONS;
const VALID_COMPLEXITY = new Set(['SIMPLES', 'MEDIA', 'COMPLEXA']);

function validateHardness(v, warnings, gateContext) {
  if (v == null) return null;
  if (typeof v !== 'string') {
    if (Array.isArray(warnings)) {
      warnings.push(`hardness non-string for gate ${gateContext || '?'} — normalized to (invalid)`);
    }
    return '(invalid)';
  }
  if (VALID_HARDNESS.has(v)) return v;
  if (Array.isArray(warnings)) {
    warnings.push(`hardness "${v}" not in canonical set for gate ${gateContext || '?'} — normalized to (invalid)`);
  }
  return '(invalid)';
}
function validateDecision(v, warnings, gateContext) {
  if (v == null) return null;
  if (typeof v !== 'string') {
    if (Array.isArray(warnings)) {
      warnings.push(`decision non-string for gate ${gateContext || '?'} — normalized to (invalid)`);
    }
    return '(invalid)';
  }
  if (VALID_DECISION.has(v)) return v;
  if (Array.isArray(warnings)) {
    warnings.push(`decision "${v}" not in canonical set for gate ${gateContext || '?'} — normalized to (invalid)`);
  }
  return '(invalid)';
}
// SEC-3: escape `|` so a sanitized free-text field can't pivot the column.
// `sanitizeDetail` already strips newlines + control chars; this just neuters
// the table-cell delimiter.
function escapeMdCell(v) {
  if (v == null) return '';
  return String(v).replace(/\|/g, '\\|');
}

/**
 * Mandatory gate sets by complexity. The COMPLEXA set is the structural
 * superset (16 gates). MEDIA is a subset of COMPLEXA. SIMPLES is a subset of
 * MEDIA. SPEC is additive (+6) regardless of complexity, applied only when
 * type === 'Spec'.
 *
 * This constant MUST stay in sync with references/gates.md
 * "## Mandatory Gates by Complexity" — the F1 regression parses the table
 * and counts checkmarks per column, then compares with these array lengths.
 */
const MANDATORY_GATES_BY_COMPLEXITY = Object.freeze({
  SIMPLES: Object.freeze([
    'INFO_GATE_BLOCKED',
    'TDD_APPROVAL',
    'CHECKPOINT_FAIL',
    'COMPLEXITY_GATE',
    'CLOSEOUT_CONFIRM',
  ]),
  MEDIA: Object.freeze([
    // SIMPLES base
    'INFO_GATE_BLOCKED',
    'TDD_APPROVAL',
    'CHECKPOINT_FAIL',
    'COMPLEXITY_GATE',
    'CLOSEOUT_CONFIRM',
    // MEDIA additions
    'PLAN_REJECTED',
    'MICRO_GATE_GAP',
    'ADVERSARIAL_GATE',
    'ADVERSARIAL_BLOCK',
    'STOP_RULE',
  ]),
  COMPLEXA: Object.freeze([
    // SIMPLES base
    'INFO_GATE_BLOCKED',
    'TDD_APPROVAL',
    'CHECKPOINT_FAIL',
    'COMPLEXITY_GATE',
    'CLOSEOUT_CONFIRM',
    // MEDIA additions
    'PLAN_REJECTED',
    'MICRO_GATE_GAP',
    'ADVERSARIAL_GATE',
    'ADVERSARIAL_BLOCK',
    'STOP_RULE',
    // COMPLEXA additions
    'FINAL_ADVERSARIAL_GATE',
    'FINAL_ADVERSARIAL_REWORK',
    'FIX_LOOP_EXHAUSTED',
    'ADVERSARIAL_GATE_MANDATORY',
    'SSOT_CONFLICT',
    'STALE_CONTEXT',
  ]),
  SPEC: Object.freeze([
    'SPEC_ARTIFACT_MISSING',
    'SPEC_FORMAT_GATE_FAIL',
    'SPEC_CONTENT_REVIEW_NOGO',
    'SPEC_AC_TRACEABILITY_GAP',
    'SPEC_POST_IMPL_FAIL',
    'ADVERSARIAL_LOOP_CHECKPOINT',
  ]),
});

// Decision values that count as "the gate fired in some form" (vs. absent).
// We accept any non-empty string decision — the only "not fired" state is
// "no log entry at all for that gate name".
function mandatorySetFor(complexity, type) {
  const base = MANDATORY_GATES_BY_COMPLEXITY[complexity] || [];
  const out = base.slice();
  if (type === 'Spec') {
    for (const g of MANDATORY_GATES_BY_COMPLEXITY.SPEC) {
      if (!out.includes(g)) out.push(g);
    }
  }
  return out;
}

function readJsonlLines(filePath) {
  // Returns { lines: string[], existed: boolean }.
  if (!fs.existsSync(filePath)) return { lines: [], existed: false };
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { lines: [], existed: true };
  }
  return {
    lines: raw.split(/\r?\n/).filter((l) => l.trim().length > 0),
    existed: true,
  };
}

function parseGateDecisions(filePath) {
  const { lines, existed } = readJsonlLines(filePath);
  const warnings = [];
  const entries = [];
  if (!existed) {
    return { entries, warnings, existed: false, total: 0 };
  }
  let idx = 0;
  for (const line of lines) {
    idx += 1;
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        warnings.push(`line ${idx}: not a JSON object — skipped`);
        continue;
      }
      if (typeof parsed.gate !== 'string' || !parsed.gate) {
        warnings.push(`line ${idx}: missing "gate" field — skipped`);
        continue;
      }
      entries.push(parsed);
    } catch (_err) {
      // Intentionally do NOT echo the parser error message — it can quote
      // the raw malformed payload back into our warnings array, which would
      // then leak into fidelity-report.json (defeating the sanitization
      // guarantee around the JSONL log).
      warnings.push(`line ${idx}: malformed JSON — skipped`);
    }
  }
  return { entries, warnings, existed: true, total: lines.length };
}

function computeGlobalFidelityPct(repoRoot) {
  // Mean of fidelity_score for runs in the last 30 days. Null when no data.
  const all = readRunLog(repoRoot);
  if (!all.length) return null;
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const scores = [];
  for (const entry of all) {
    if (entry == null || typeof entry !== 'object') continue;
    if (entry.fidelity_score === null || entry.fidelity_score === undefined) continue;
    const n = Number(entry.fidelity_score);
    if (!Number.isFinite(n)) continue;
    const ts = entry.timestamp_end ? Date.parse(entry.timestamp_end) : NaN;
    if (Number.isFinite(ts) && ts < cutoff) continue;
    scores.push(n);
  }
  if (!scores.length) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(mean * 10000) / 100; // 2-decimal percentage
}

function buildJsonReport({
  runId, pipelineDocPath, type, complexity, variant,
  mandatorySet, mandatoryGatesData, otherGates, fidelityScore,
  mandatoryTriggered, mandatoryExpected, globalFidelityPct, warnings,
}) {
  return {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    pipeline_doc_path: pipelineDocPath,
    type,
    complexity,
    variant: variant || null,
    mandatory_triggered: mandatoryTriggered,
    mandatory_expected: mandatoryExpected,
    fidelity_score: fidelityScore === null
      ? null
      : Math.round(fidelityScore * 10000) / 10000,
    global_fidelity_pct: globalFidelityPct,
    mandatory_gates: mandatorySet.map((gate) => {
      const found = mandatoryGatesData[gate];
      return {
        gate,
        hardness: found ? (found.hardness || null) : null,
        expected: true,
        triggered: !!found,
        decision: found ? (found.decision || null) : null,
      };
    }),
    other_gates: otherGates,
    warnings: warnings.slice(),
    generated_at: new Date().toISOString(),
  };
}

function buildMarkdownReport(jsonReport) {
  const j = jsonReport;
  const scoreStr = j.fidelity_score === null
    ? 'n/a (no gate data)'
    : j.fidelity_score.toFixed(4);
  const globalStr = j.global_fidelity_pct === null
    ? 'n/a (no historical run data in the last 30 days)'
    : `${j.global_fidelity_pct.toFixed(2)}%`;

  // SEC-3: every cell escaped with escapeMdCell so a sanitized-but-piped
  // string can't pivot the table column.
  const mandatoryRows = j.mandatory_gates.map((g) => {
    return `| ${escapeMdCell(g.gate)} | ${escapeMdCell(g.hardness || '—')} | yes | ${g.triggered ? 'yes' : 'NO'} | ${escapeMdCell(g.triggered ? (g.decision || '—') : '—')} |`;
  }).join('\n');

  const otherRows = j.other_gates.length
    ? j.other_gates.map((g) => `| ${escapeMdCell(g.gate)} | ${escapeMdCell(g.hardness || '—')} | ${escapeMdCell(g.decision || '—')} | ${escapeMdCell(g.detail || '')} |`).join('\n')
    : '| — | — | — | (none) |';

  const warningsBlock = j.warnings.length
    ? j.warnings.map((w) => `- ${w}`).join('\n')
    : '- (none)';

  return [
    `# Fidelity Report — ${j.run_id}`,
    '',
    '> Per-run fidelity snapshot. Higher is better. `null` means "no gate data was found, so the score is not defined" (NOT zero).',
    '',
    '## Summary',
    '',
    `- **Run ID:** ${j.run_id}`,
    `- **Pipeline doc:** ${j.pipeline_doc_path}`,
    `- **Type / Complexity / Variant:** ${j.type} / ${j.complexity} / ${j.variant || '—'}`,
    `- **Mandatory gates triggered:** ${j.mandatory_triggered} / ${j.mandatory_expected}`,
    `- **Fidelity score:** ${scoreStr}`,
    `- **Global fidelity (cross-run, last 30 days):** ${globalStr} — sourced from \`.pipeline/run-log.jsonl\``,
    '',
    '## Mandatory Gates Coverage',
    '',
    '| Gate | Hardness | Expected? | Triggered? | Decision |',
    '|------|----------|-----------|------------|----------|',
    mandatoryRows || '| — | — | — | — | — |',
    '',
    '## Non-Mandatory Gates Observed',
    '',
    '| Gate | Hardness | Decision | Detail (truncated) |',
    '|------|----------|----------|--------------------|',
    otherRows,
    '',
    '## Warnings',
    '',
    warningsBlock,
    '',
    '## See Also',
    '',
    '- `gate-decisions.jsonl` — raw per-run gate log',
    '- `.pipeline/run-log.jsonl` — cross-run accumulated log',
    '- `references/gates.md` — gates registry + mandatory-by-complexity table',
    '',
  ].join('\n');
}

/**
 * Generate per-run fidelity report.
 *
 * @param {object} opts
 * @param {string} opts.pipelineDocPath - absolute path to the run's doc folder
 * @param {string} opts.complexity - SIMPLES | MEDIA | COMPLEXA
 * @param {string} opts.type - classification (Feature | Bug Fix | Spec | ...)
 * @param {string} opts.repoRoot - absolute path to repo root (for run-log.jsonl)
 * @param {string} [opts.variant] - variant name (advisory)
 * @param {string} [opts.runId] - run identifier (defaults to basename of pipelineDocPath)
 * @returns {{
 *   ok: boolean, error?: string,
 *   fidelityScore: number|null,
 *   mandatoryTriggered: number,
 *   mandatoryExpected: number,
 *   globalFidelityPct: number|null,
 *   mdPath: string, jsonPath: string,
 *   warnings: string[]
 * }}
 */
function generateFidelityReport(opts) {
  try {
    if (!opts || typeof opts !== 'object') {
      return { ok: false, error: 'opts object required' };
    }
    const {
      pipelineDocPath, complexity, type, repoRoot,
      variant = null, runId,
    } = opts;
    if (!pipelineDocPath || typeof pipelineDocPath !== 'string') {
      return { ok: false, error: 'pipelineDocPath required' };
    }
    if (!complexity || typeof complexity !== 'string') {
      return { ok: false, error: 'complexity required' };
    }
    if (!type || typeof type !== 'string') {
      return { ok: false, error: 'type required' };
    }
    if (!repoRoot || typeof repoRoot !== 'string') {
      return { ok: false, error: 'repoRoot required' };
    }
    // SEC-1: refuse relative paths. Same guard as lib/run-log.cjs and
    // lib/pipeline-local-parser.cjs:38-51.
    if (!path.isAbsolute(repoRoot)) {
      return { ok: false, error: 'path-traversal: repoRoot must be absolute' };
    }
    // SEC-2: pipelineDocPath must resolve inside repoRoot. Otherwise the
    // reporter could be coerced into writing fidelity-report.* outside the
    // sandboxed run directory.
    const resolvedRepo = path.resolve(repoRoot);
    const resolvedDoc = path.resolve(pipelineDocPath);
    // Ensure prefix containment (with separator boundary to avoid
    // "/repofoo".startsWith("/repo") false positive).
    const repoWithSep = resolvedRepo.endsWith(path.sep)
      ? resolvedRepo
      : resolvedRepo + path.sep;
    if (resolvedDoc !== resolvedRepo && !resolvedDoc.startsWith(repoWithSep)) {
      return { ok: false, error: 'path-traversal: pipelineDocPath outside repoRoot' };
    }
    // DEAD-1: complexity must be a known enum. Without this guard,
    // mandatorySetFor() silently returns [] for typos like 'SIMPLE',
    // producing fidelityScore=null with no signal to the caller.
    if (!VALID_COMPLEXITY.has(complexity)) {
      return { ok: false, error: `invalid complexity: ${complexity}` };
    }

    const mandatorySet = mandatorySetFor(complexity, type);
    const mandatoryExpected = mandatorySet.length;

    const gateLogPath = path.join(pipelineDocPath, 'gate-decisions.jsonl');
    const { entries, warnings, existed } = parseGateDecisions(gateLogPath);
    // DEAD-1 (secondary): if the complexity is in VALID_COMPLEXITY but its
    // MANDATORY_GATES_BY_COMPLEXITY entry is somehow undefined (mismatched
    // edit between the enum and the table), surface a warning rather than
    // silently scoring null.
    if (MANDATORY_GATES_BY_COMPLEXITY[complexity] === undefined) {
      warnings.push(`mandatory-gates table has no entry for complexity=${complexity}`);
    }

    // Build the data maps. mandatoryGatesData[gate] = { hardness, decision }
    // captures the LATEST decision encountered for that gate.
    const mandatorySetIndex = new Set(mandatorySet);
    const mandatoryGatesData = Object.create(null);
    const otherGatesMap = new Map();

    for (const e of entries) {
      // SEC-3 / SEC-7: every text-ish field that we will render into a
      // Markdown table or echo into the JSON report is sanitized + validated.
      // gate stays free-text-but-sanitized (sanitizeDetail collapses ctrl
      // chars / newlines / over-length); hardness + decision are enum-checked.
      const gateName = sanitizeDetail(e.gate);
      // QUAL-1 (post-final-adversarial): validate once and reuse. The previous
      // implementation called validateHardness/validateDecision twice for non-
      // mandatory gates, doubling warning emissions on invalid values.
      const record = {
        hardness: validateHardness(e.hardness, warnings, e.gate),
        decision: validateDecision(e.decision, warnings, e.gate),
      };
      if (mandatorySetIndex.has(e.gate)) {
        // Index by the raw gate name (already validated against mandatorySet
        // membership) but write the sanitized form into the report payload.
        mandatoryGatesData[e.gate] = record;
      } else {
        otherGatesMap.set(e.gate, {
          gate: gateName,
          hardness: record.hardness,
          decision: record.decision,
          detail: sanitizeDetail(e.detail) || '',
        });
      }
    }

    const mandatoryTriggered = Object.keys(mandatoryGatesData).length;

    // Score policy: null when file did not exist OR existed but yielded zero
    // parseable entries (empty file). Otherwise mandatoryTriggered / expected.
    let fidelityScore;
    if (!existed || entries.length === 0) {
      fidelityScore = null;
    } else if (mandatoryExpected === 0) {
      fidelityScore = null;
    } else {
      fidelityScore = mandatoryTriggered / mandatoryExpected;
    }

    const globalFidelityPct = computeGlobalFidelityPct(repoRoot);

    const otherGates = Array.from(otherGatesMap.values());
    const resolvedRunId = runId
      || path.basename(pipelineDocPath.replace(/[\\/]+$/, ''))
      || 'unknown-run';

    const jsonReport = buildJsonReport({
      runId: resolvedRunId,
      pipelineDocPath,
      type,
      complexity,
      variant,
      mandatorySet,
      mandatoryGatesData,
      otherGates,
      fidelityScore,
      mandatoryTriggered,
      mandatoryExpected,
      globalFidelityPct,
      warnings,
    });
    const markdownReport = buildMarkdownReport(jsonReport);

    if (!fs.existsSync(pipelineDocPath)) {
      fs.mkdirSync(pipelineDocPath, { recursive: true });
    }
    const mdPath = path.join(pipelineDocPath, 'fidelity-report.md');
    const jsonPath = path.join(pipelineDocPath, 'fidelity-report.json');
    fs.writeFileSync(mdPath, markdownReport, { encoding: 'utf8' });
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2) + '\n', { encoding: 'utf8' });

    return {
      ok: true,
      fidelityScore,
      mandatoryTriggered,
      mandatoryExpected,
      globalFidelityPct,
      mdPath,
      jsonPath,
      warnings,
    };
  } catch (err) {
    return { ok: false, error: `generateFidelityReport: ${err.message}` };
  }
}

module.exports = {
  generateFidelityReport,
  MANDATORY_GATES_BY_COMPLEXITY,
  SCHEMA_VERSION,
};
