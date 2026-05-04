#!/usr/bin/env node
'use strict';

/**
 * skill-frontmatter-parser.cjs — Shared module for SKILL.md frontmatter enforcement (v4.8.0).
 *
 * Used by:
 *   - sentinel-hook.cjs   → validates sentinel_checkpoints
 *   - dispatch-guard.cjs  → validates agent_type per step
 *   - force-pipeline-agents.cjs → enforces gates_at AskUserQuestion logging
 *
 * Public API:
 *   - parseYaml(text) → object
 *   - parseFrontmatter(text) → { ok, frontmatter, error }
 *   - readSkillFrontmatter(skillName, repoRoot) → { ok, frontmatter, source, error }
 *   - getCurrentSkill(state) → { skill, step, expected_next } | null
 *   - getEnforcementMode(today) → "warn" | "deny"
 *   - logEnforcementDecision(repoRoot, decision) → boolean (success)
 *
 * NEVER throws — always returns { ok, error } shape so callers handle gracefully.
 */

const fs = require('fs');
const path = require('path');

// ── YAML parser (subset sufficient for SKILL.md frontmatter) ───────────────
//
// Reused logic from tests/compat/runner.cjs (v4.6.0+). Handles:
//   - flat scalars (string, number, bool, null)
//   - lists ([a, b, c] inline OR - item block)
//   - nested objects via 2-space indent
//   - quoted strings ('...' or "...")
//   - inline objects ({ k: v, k2: v2 })
//
// Does NOT handle: anchors, multi-line strings (|, >), flow sequences with
// nested objects. Sufficient for SKILL.md and step file frontmatter shapes.

function parseYaml(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s*#.*$/, ''))
    .filter((l) => l.trim().length > 0);

  const root = {};
  const stack = [{ indent: -1, value: root, type: 'object' }];

  function coerce(v) {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    if (t === '') return null;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null' || t === '~') return null;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const indent = raw.match(/^(\s*)/)[1].length;
    const line = raw.trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const top = stack[stack.length - 1];

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim();
      if (top.type !== 'array') continue;
      if (item.startsWith('{') && item.endsWith('}')) {
        const obj = {};
        item.slice(1, -1).split(',').map((p) => p.trim()).filter((p) => p.length > 0 && p.includes(':')).forEach((p) => {
          const colonIdx = p.indexOf(':');
          const k = p.slice(0, colonIdx).trim();
          const v = p.slice(colonIdx + 1).trim();
          if (k.length > 0) obj[k] = coerce(v);
        });
        top.value.push(obj);
      } else {
        top.value.push(coerce(item));
      }
      continue;
    }

    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();

    // Inline list: gates_at: [3, 7, 9, 10]
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value.slice(1, -1).split(',').map((s) => coerce(s.trim())).filter((s) => s !== null && s !== '');
      top.value[key] = items;
    } else if (value.length === 0) {
      const next = lines[i + 1];
      if (next && next.trim().startsWith('- ')) {
        const arr = [];
        top.value[key] = arr;
        stack.push({ indent, value: arr, type: 'array' });
      } else {
        const child = {};
        top.value[key] = child;
        stack.push({ indent, value: child, type: 'object' });
      }
    } else {
      top.value[key] = coerce(value);
    }
  }

  return root;
}

// ── Frontmatter extraction ─────────────────────────────────────────────────

function parseFrontmatter(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: 'input is not a string' };
  }
  // SKILL.md frontmatter is the first --- ... --- block at top of file.
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!m) {
    return { ok: false, error: 'no frontmatter block found' };
  }
  try {
    const frontmatter = parseYaml(m[1]);
    return { ok: true, frontmatter };
  } catch (e) {
    return { ok: false, error: `yaml parse failed: ${e.message}` };
  }
}

function readSkillFrontmatter(skillName, repoRoot) {
  if (!skillName || typeof skillName !== 'string') {
    return { ok: false, error: 'invalid skill name' };
  }
  const skillPath = path.join(repoRoot, 'skills', skillName, 'SKILL.md');
  let text;
  try {
    text = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    return { ok: false, error: `cannot read ${skillPath}: ${e.code || e.message}` };
  }
  const result = parseFrontmatter(text);
  if (!result.ok) return result;
  return { ok: true, frontmatter: result.frontmatter, source: skillPath };
}

// ── State file consumer ────────────────────────────────────────────────────

function getCurrentSkill(state) {
  if (!state || typeof state !== 'object') return null;
  const skill = state.current_skill;
  if (!skill || typeof skill !== 'string') return null;
  return {
    skill,
    step: typeof state.current_step === 'number' ? state.current_step : null,
    expected_next: state.expected_next || null,
  };
}

// ── Mode toggle (warn vs deny based on date) ───────────────────────────────
//
// Roll-out plan: warn mode until 2026-05-17, deny mode after.
// Date hardcoded — controller owners can override via env var PIPELINE_ENFORCEMENT for testing.

const DENY_MODE_START_ISO = '2026-05-17';

function getEnforcementMode(today) {
  const override = (process.env.PIPELINE_ENFORCEMENT || '').toLowerCase();
  if (override === 'warn' || override === 'deny') return override;
  const now = today instanceof Date ? today : new Date();
  const denyStart = new Date(DENY_MODE_START_ISO + 'T00:00:00Z');
  return now >= denyStart ? 'deny' : 'warn';
}

// ── Decision logging ───────────────────────────────────────────────────────

function logEnforcementDecision(repoRoot, decision) {
  // decision = { mode, hook, skill, step, violation, detail, pipeline_doc_path }
  const stateDir = decision.pipeline_doc_path;
  if (!stateDir) return false;
  const logPath = path.join(stateDir, 'gate-decisions.jsonl');
  const entry = {
    gate: decision.mode === 'deny' ? 'ENFORCEMENT_DENY' : 'ENFORCEMENT_WARN',
    hardness: 'AUDIT',
    phase: 'enforcement',
    decision: decision.mode === 'deny' ? 'BLOCKED' : 'WARNED',
    decided_by: decision.hook,
    timestamp: new Date().toISOString(),
    detail: String(decision.detail || decision.violation || '').slice(0, 200).replace(/[\n\r]/g, ' '),
    confidence_impact: decision.mode === 'deny' ? -0.1 : -0.05,
  };
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  parseYaml,
  parseFrontmatter,
  readSkillFrontmatter,
  getCurrentSkill,
  getEnforcementMode,
  logEnforcementDecision,
  DENY_MODE_START_ISO,
};
