#!/usr/bin/env node
'use strict';
/**
 * preclassify.cjs — v8.29.0 — decision-model fast path for Phase 0a.
 *
 * Pre-classifies the user's prompt (type / complexity / needs-pipeline) with a
 * decision model (System One contract, e.g. Jev) through lib/decision-client.cjs,
 * and persists the verdict as a side-car file the pipeline-controller can consume
 * deterministically via `read`. Everything is behind DECISION_MODEL_ENABLED=1
 * (default OFF). On any error, timeout or low confidence the file records
 * `eligible:false` and callers fall back to the legacy task-orchestrator path.
 *
 * Questions live in references/decision-classificador.json (never duplicated here).
 *
 * CLI:  node lib/preclassify.cjs read --cwd <cwd> --session <id> --request "<args>"
 *       → {"match":true,"decision":{...}} | {"match":false,"reason":"..."}
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const QUESTIONS_PATH = path.join(__dirname, '..', 'references', 'decision-classificador.json');
const MAX_REQUEST_CHARS = 1200;
const MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_ENV = { DECISION_MODEL_TIMEOUT_MS: '2500', DECISION_MODEL_DEADLINE_MS: '4000' };

// Taxonomy mapping: decision-model labels → plugin labels (agents/core/task-orchestrator.md).
// `refactor`, `security` and `trivial` have no pipeline type/variant of their own → legacy path.
const TYPE_MAP = { bugfix: 'Bug Fix', feature: 'Feature', audit: 'Audit', hotfix: 'Bug Fix' };
const VARIANT_PREFIX = { 'Bug Fix': 'bugfix', Feature: 'feature', Audit: 'audit' };
const COMPLEXITY_MAP = { simples: 'SIMPLES', media: 'MEDIA', complexa: 'COMPLEXA' };
const SPEC_RE = /\.kiro[\\/]specs|\bspec\b/i;

function isEnabled(env = process.env) { return String(env.DECISION_MODEL_ENABLED || '') === '1'; }

/** Same normalization on both sides (hook: raw prompt; controller: $ARGUMENTS) so the hash matches. */
function normalizeRequest(prompt) {
  let s = String(prompt || '');
  s = s.replace(/<(tool_result|system-reminder|pasted_content)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/^\s*\/(pipeline-orchestrator:[\w-]+|pipeline)\b/i, ' ');
  s = s.replace(/(^|\s)--(simples|media|complexa|light|heavy|hotfix|grill|strict-spec|plan|force-level(=\S+)?)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, MAX_REQUEST_CHARS);
}

function hashRequest(request) { return crypto.createHash('sha256').update(String(request), 'utf8').digest('hex'); }

function loadQuestions() {
  const raw = fs.readFileSync(QUESTIONS_PATH, 'utf8');
  return { decision: JSON.parse(raw), version: crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16) };
}

function statePath(cwd, sessionId) {
  const sid = String(sessionId || 'nosession').replace(/[^\w.-]/g, '_').slice(0, 64);
  return path.join(cwd, '.pipeline', 'state', `preclassify-${sid}.json`);
}

/** Pure: answers (normalized by decision-client) → plugin decision. */
function mapDecision(answers, minConfidence = 0.7, request = '') {
  const np = answers.needs_pipeline && typeof answers.needs_pipeline.p === 'number' ? answers.needs_pipeline.p : null;
  const tt = answers.task_type || {};
  const cx = answers.complexity || {};
  const out = {
    needs_pipeline: np, task_type_raw: tt.choice || null, complexity_raw: cx.choice || null,
    type: null, complexity: null, severity: null, pipeline_variant: null,
    confidence: Math.min(np == null ? 0 : np, Number(tt.confidence) || 0, Number(cx.confidence) || 0),
    eligible: false, reason: null,
  };
  if (np == null || !tt.choice || !cx.choice) { out.reason = 'incomplete-answers'; return out; }
  if (!TYPE_MAP[tt.choice]) { out.reason = `type-not-fast-pathed:${tt.choice}`; return out; }
  if (!COMPLEXITY_MAP[cx.choice]) { out.reason = `complexity-not-fast-pathed:${cx.choice}`; return out; }
  out.type = TYPE_MAP[tt.choice];
  out.complexity = tt.choice === 'hotfix' ? 'COMPLEXA' : COMPLEXITY_MAP[cx.choice];
  out.severity = tt.choice === 'hotfix' ? 'Critical' : (/security|vulnerab|seguran/i.test(request) ? 'High' : 'Medium');
  out.pipeline_variant = `${VARIANT_PREFIX[out.type]}-${out.complexity === 'COMPLEXA' ? 'heavy' : 'light'}`;
  if (SPEC_RE.test(request)) { out.reason = 'spec-mentioned'; return out; }
  if (np < minConfidence) { out.reason = 'needs_pipeline-below-threshold'; return out; }
  if (out.confidence < minConfidence) { out.reason = 'confidence-below-threshold'; return out; }
  out.eligible = true;
  return out;
}

function writeState(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, file);
}

/** Called by the UserPromptSubmit hook. Never throws; returns the record written (or null when disabled). */
async function run({ prompt, cwd = process.cwd(), sessionId, env = process.env } = {}) {
  if (!isEnabled(env)) return null;
  const request = normalizeRequest(prompt);
  const file = statePath(cwd, sessionId);
  const base = {
    schema_version: 1, source: 'decision-model', provider: null, model: null, decision_version: null,
    session_id: sessionId || null, prompt_sha256: hashRequest(request), request_excerpt: request.slice(0, 200),
    ts: new Date().toISOString(),
  };
  let record;
  try {
    const { decision, version } = loadQuestions();
    base.decision_version = version;
    const client = require('./decision-client.cjs');
    const mergedEnv = Object.assign({}, DEFAULT_ENV, env);
    const res = await client.decide({ state: { request }, questions: decision.questions, cwd, decisionName: decision.name, env: mergedEnv });
    record = Object.assign(base, { provider: res.provider, model: res.model, ms: res.ms, input_tokens: res.usage && res.usage.input_tokens },
      mapDecision(res.answers, decision.min_confidence, request));
  } catch (err) {
    record = Object.assign(base, { needs_pipeline: null, type: null, complexity: null, severity: null, pipeline_variant: null, confidence: 0, eligible: false, reason: `error:${String(err && err.message || err).slice(0, 200)}` });
  }
  try { writeState(file, record); } catch { /* side-car only; never block the prompt */ }
  return record;
}

/** Called by the controller (deterministic). */
function read({ cwd = process.cwd(), sessionId, request, env = process.env, now = Date.now() } = {}) {
  if (!isEnabled(env)) return { match: false, reason: 'flag-off' };
  const file = statePath(cwd, sessionId);
  if (!fs.existsSync(file)) return { match: false, reason: 'no-preclassify-file' };
  let rec;
  try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { match: false, reason: 'unreadable' }; }
  if (!rec.eligible) return { match: false, reason: `not-eligible:${rec.reason || 'unknown'}` };
  if (rec.prompt_sha256 !== hashRequest(normalizeRequest(request))) return { match: false, reason: 'prompt-hash-mismatch' };
  if (!rec.ts || now - Date.parse(rec.ts) > MAX_AGE_MS) return { match: false, reason: 'stale' };
  let version = null;
  try { version = loadQuestions().version; } catch { return { match: false, reason: 'questions-unreadable' }; }
  if (rec.decision_version !== version) return { match: false, reason: 'decision-version-mismatch' };
  return { match: true, decision: rec };
}

function hintLine(record) {
  if (!record || !record.eligible) return null;
  return `PRECLASSIFY_HINT: type=${record.type} complexity=${record.complexity} confidence=${Number(record.confidence).toFixed(2)} (controller: Phase 0a-pre reads .pipeline/state/preclassify-<session_id>.json)`;
}

module.exports = { isEnabled, normalizeRequest, hashRequest, mapDecision, run, read, hintLine, statePath, QUESTIONS_PATH };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };
  if (argv[0] !== 'read') { process.stderr.write('usage: preclassify.cjs read --cwd <cwd> --session <id> --request "<args>"\n'); process.exit(2); }
  const out = read({ cwd: opt('--cwd') || process.cwd(), sessionId: opt('--session'), request: opt('--request') || '' });
  process.stdout.write(JSON.stringify(out) + '\n');
}
