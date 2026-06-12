'use strict';

/**
 * lib/entry-points.cjs — shared pipeline entry-point matcher (v7.13.0, R6).
 *
 * Single source of truth = references/entry-points.json. Both
 * .claude/hooks/session-lock-hook.cjs and .claude/hooks/force-pipeline-agents.cjs
 * derive their `/pipeline-orchestrator:<name>` detection from here, so the two
 * regexes can no longer drift (the old ones silently missed user-story, ux-sim,
 * spec and every -light/-heavy variant — letting those entry points start a
 * pipeline WITHOUT a session lock / without forced-agent behavior).
 *
 * Matching rules:
 *   - Anchored at the START of the (trimmed) prompt.
 *   - Case-insensitive.
 *   - Exact command-name match against the registry (no prefix over-match: an
 *     unknown `bugfix-foo` does NOT match `bugfix`). Add new variants to the JSON.
 *   - Legacy aliases (userstory, ux) normalize to their canonical name.
 */

const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_PATH = path.join(__dirname, '..', 'references', 'entry-points.json');

// Capture the command name (letters/digits/hyphens) right after the namespace.
const PREFIX_RE = /^\/pipeline-orchestrator:([a-z0-9][a-z0-9-]*)/i;

// Emergency fallback — used ONLY when references/entry-points.json is unreadable
// or malformed. Must stay in sync with the JSON `entry_points` / `legacy_aliases`
// (a drift guard test asserts this). Degrade SAFE: a corrupt registry must not
// silently disable locking; it falls back to COMPLETE coverage, not an empty set
// (which would be fail-open) nor the old incomplete regex.
const FALLBACK_ENTRY_POINTS = [
  'pipeline',
  'bugfix', 'bugfix-light', 'bugfix-heavy',
  'feature', 'feature-light', 'feature-heavy',
  'user-story', 'user-story-light', 'user-story-heavy',
  'audit', 'audit-light', 'audit-heavy',
  'ux-sim', 'ux-sim-light', 'ux-sim-heavy',
  'spec', 'spec-light', 'spec-heavy', 'spec-audit-only',
  'review',
];
const FALLBACK_ALIASES = { userstory: 'user-story', ux: 'ux-sim' };

let _cache = null;
let _fallbackWarned = false;

function buildRegistry(json) {
  const aliases = json.legacy_aliases || {};
  const names = new Set();
  for (const e of json.entry_points || []) names.add(String(e).toLowerCase());
  for (const a of Object.keys(aliases)) names.add(a.toLowerCase());
  return { json, names, aliases };
}

/**
 * Load the registry. Never throws — a missing/corrupt JSON degrades to the
 * complete embedded fallback (with a one-shot audit breadcrumb) instead of
 * failing open. `opts.path` overrides the source and bypasses the cache (test seam).
 */
function loadRegistry(opts = {}) {
  const useCache = !opts.path;
  if (useCache && _cache) return _cache;
  const src = opts.path || REGISTRY_PATH;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(src, 'utf8'));
  } catch (err) {
    if (!_fallbackWarned) {
      _fallbackWarned = true;
      process.stderr.write(JSON.stringify({
        audit_event: 'ENTRY_POINTS_REGISTRY_FALLBACK',
        ts: new Date().toISOString(),
        reason: String(err && err.message).slice(0, 120),
      }) + '\n');
    }
    json = { entry_points: FALLBACK_ENTRY_POINTS, legacy_aliases: FALLBACK_ALIASES };
  }
  const reg = buildRegistry(json);
  if (useCache) _cache = reg;
  return reg;
}

/**
 * @returns {string|null} the canonical entry-point name, or null if the text is
 * not a recognized pipeline entry point.
 */
function detectEntryPoint(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const m = text.trim().match(PREFIX_RE);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const { names, aliases } = loadRegistry();
  if (!names.has(name)) return null;
  return Object.prototype.hasOwnProperty.call(aliases, name) ? aliases[name] : name;
}

function isPipelineEntryPoint(text) {
  return detectEntryPoint(text) !== null;
}

/** All recognized command names (canonical + legacy aliases), lowercase. */
function entryPointNames() {
  return [...loadRegistry().names];
}

module.exports = {
  detectEntryPoint, isPipelineEntryPoint, entryPointNames, loadRegistry,
  PREFIX_RE, REGISTRY_PATH, FALLBACK_ENTRY_POINTS, FALLBACK_ALIASES,
};
