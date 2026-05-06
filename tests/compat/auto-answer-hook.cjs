#!/usr/bin/env node
/**
 * tests/compat/auto-answer-hook.cjs — PreToolUse auto-answer hook for compat regression
 *
 * Issue #11 (v4.16.0). Satisfies AskUserQuestion in headless `claude -p` mode by emitting
 * the official `permissionDecision: "allow"` + `updatedInput.answers` shape introduced in
 * Claude Code v2.1.85+ (verified 2026-05-06 against code.claude.com/docs/en/hooks
 * "PreToolUse decision control" section).
 *
 * ─── Contract ──────────────────────────────────────────────────────────────────────────
 *
 * STDIN (PreToolUse event from Claude Code, JSON):
 *   {
 *     "session_id": "...",
 *     "transcript_path": "...",
 *     "cwd": "...",
 *     "hook_event_name": "PreToolUse",
 *     "tool_name": "AskUserQuestion",
 *     "tool_input": {
 *       "questions": [
 *         {
 *           "question": "Which framework?",
 *           "header": "Framework",
 *           "multiSelect": false,
 *           "options": [{ "label": "React", "description": "..." }, { "label": "Vue", ... }]
 *         },
 *         ...
 *       ]
 *     }
 *   }
 *
 * STDOUT (our response, JSON to satisfy the question):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "PreToolUse",
 *       "permissionDecision": "allow",
 *       "updatedInput": {
 *         "questions": [<echo original array unchanged>],
 *         "answers": { "<question.question text>": "<chosen option.label>", ... }
 *       }
 *     }
 *   }
 *
 * ─── Decision logic ────────────────────────────────────────────────────────────────────
 *
 *   1. For each question in tool_input.questions:
 *        a. Look up override by `question.header` in answers-overrides.json
 *           (path = env.COMPAT_OVERRIDES_PATH || ./tests/compat/v4-baseline/answers-overrides.json).
 *           If hit AND the override label matches some option.label, use it.
 *        b. Otherwise, default = options[0].label (the "Recomendado" convention from CLAUDE.md
 *           regra mestra: "primeira opção é a recomendação").
 *        c. If multiSelect=true, support comma-separated labels in override; for default,
 *           pick options[0].label only (single-pick semantics).
 *        d. If options is missing or empty (defensive), set null answer + emit a warning to stderr.
 *   2. Build answers map keyed by `question.question` (full text — that's what the docs require).
 *   3. Echo `questions` array back unchanged (docs requirement).
 *
 *   When tool_name !== "AskUserQuestion": exit 0 with empty stdout. The hook is a no-op for
 *   non-AskUserQuestion calls; the matcher in settings.json should already scope us, but this
 *   defensive check protects against misconfiguration.
 *
 *   On any internal error: exit 0 with `{ "continue": true }` (let the original tool call run
 *   without our interference). Failing-closed (deny) would block the entire pipeline; failing-
 *   open (continue) means worst-case the user prompt re-appears and CI hangs — visible failure.
 *
 * ─── Iron Law ──────────────────────────────────────────────────────────────────────────
 *
 *   This file lives under tests/ — it is test infrastructure, NOT plugin runtime.
 *   It is invoked ONLY when runner.cjs writes a settings.json that points to it. Production
 *   pipelines never load this hook.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_OVERRIDES_PATH = path.join(
  __dirname,
  'v4-baseline',
  'answers-overrides.json'
);

function readStdin() {
  // Synchronous stdin read — hooks are short-lived, no async needed.
  let data = '';
  try {
    data = fs.readFileSync(0, 'utf8');
  } catch (e) {
    // No stdin available (e.g., test invocation without piping). Return empty.
    return '';
  }
  return data;
}

function loadOverrides() {
  const overridesPath = process.env.COMPAT_OVERRIDES_PATH || DEFAULT_OVERRIDES_PATH;
  if (!fs.existsSync(overridesPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    // Strip the documentation key — it's not an actual override.
    if (raw && typeof raw === 'object' && '_doc' in raw) {
      const { _doc, ...rest } = raw;
      return rest;
    }
    return raw || {};
  } catch (e) {
    process.stderr.write(`auto-answer-hook: failed to parse ${overridesPath}: ${e.message}\n`);
    return {};
  }
}

function pickAnswer(question, overrides) {
  const opts = Array.isArray(question.options) ? question.options : [];
  const override = question.header && overrides[question.header];

  if (override) {
    if (question.multiSelect === true && typeof override === 'string') {
      // Validate every comma-separated label exists in options.
      const labels = override.split(',').map((l) => l.trim()).filter(Boolean);
      const valid = labels.every((l) => opts.some((o) => o && o.label === l));
      if (valid) return labels.join(',');
      process.stderr.write(
        `auto-answer-hook: override "${override}" for header "${question.header}" has labels not in options; falling back to default\n`
      );
    } else if (typeof override === 'string') {
      const exists = opts.some((o) => o && o.label === override);
      if (exists) return override;
      process.stderr.write(
        `auto-answer-hook: override "${override}" for header "${question.header}" not in options; falling back to default\n`
      );
    }
  }

  if (opts.length === 0) {
    process.stderr.write(
      `auto-answer-hook: question "${question.question}" has no options; emitting null answer\n`
    );
    return null;
  }
  return opts[0].label || null;
}

function buildResponse(toolInput, overrides) {
  const questions = Array.isArray(toolInput && toolInput.questions) ? toolInput.questions : [];
  const answers = {};
  for (const q of questions) {
    if (!q || typeof q.question !== 'string') continue;
    answers[q.question] = pickAnswer(q, overrides);
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: {
        questions, // echo unchanged per docs
        answers,
      },
    },
  };
}

function main() {
  let payload;
  try {
    const raw = readStdin();
    if (!raw.trim()) {
      // No input — nothing to do.
      process.stdout.write(JSON.stringify({ continue: true }));
      process.exit(0);
    }
    payload = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`auto-answer-hook: stdin parse failed: ${e.message}\n`);
    process.stdout.write(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  // Defensive: only act on AskUserQuestion.
  if (!payload || payload.tool_name !== 'AskUserQuestion') {
    process.stdout.write(JSON.stringify({ continue: true }));
    process.exit(0);
  }

  const overrides = loadOverrides();
  const response = buildResponse(payload.tool_input || {}, overrides);
  process.stdout.write(JSON.stringify(response));
  process.exit(0);
}

// Export for unit tests; only auto-run when invoked directly.
if (require.main === module) {
  main();
} else {
  module.exports = { buildResponse, pickAnswer, loadOverrides };
}
