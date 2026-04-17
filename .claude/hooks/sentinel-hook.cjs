#!/usr/bin/env node
'use strict';

/**
 * sentinel-hook.cjs — PreToolUse:Agent guard for pipeline-orchestrator.
 *
 * Protocol:
 *   - Exit 0 with no stdout → allow (silent pass)
 *   - Exit 0 with stderr WARN → allow + operator-visible advisory (e.g. unknown schema_version)
 *   - Exit 0 with hookSpecificOutput deny → deny this tool call, reason fed to Claude
 *   - Exit 0 with hookSpecificOutput allow + additionalContext → allow with warning in Claude context
 *   - Exit 2 with stderr → hard block, stderr fed to Claude (circuit breaker)
 *
 * Auto-discovers sentinel-state.json from .pipeline/docs/Pre-*-action/.
 * Falls back to PIPELINE_DOC_PATH env var if set.
 * NEVER spawns agents, writes files, or emits visual output.
 *
 * TRUST ASSUMPTION (v3.4.0, SEC-2):
 * The hook treats `sentinel-state.json` as trusted input from the pipeline
 * controller. It does NOT verify integrity, authorship, or freshness beyond
 * a stale timestamp warning and a schema_version check. Consequences:
 *   - Any actor with write access to PIPELINE_DOC_PATH can neutralize the
 *     sentinel by setting `pipeline_active: false` or writing an unknown
 *     `schema_version` (the hook emits stderr WARN for the latter, but still
 *     allows for backwards compat).
 *   - Concurrent pipelines sharing a PIPELINE_DOC_PATH race on the counter.
 * Mitigations that are OUT OF SCOPE here (handled by the controller):
 *   - Integrity tokens / session IDs in the state file.
 *   - File locking for concurrent pipelines.
 *   - Validation that reviewed artifacts never land at PIPELINE_DOC_PATH.
 * If the state file is untrusted, the controller must refuse to proceed —
 * the hook cannot recover from an adversarial state file and is NOT the
 * last line of defense against controller compromise.
 */

const fs = require('fs');
const path = require('path');

// ── Auto-Discovery ──────────────────────────────────────────────────────────

// Find the most recent sentinel-state.json without depending on env vars.
// Priority 1: PIPELINE_DOC_PATH env var (backwards compatible override)
// Priority 2: Scan .pipeline/docs/Pre-{level}-action/{session}/sentinel-state.json by mtime
// Returns: absolute path to sentinel-state.json, or null if not found.
function discoverStatePath() {
  // Priority 1: explicit env var (backwards compatible)
  const envPath = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (envPath) {
    const candidate = path.join(envPath, 'sentinel-state.json');
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }

  // Priority 2: auto-discovery from .pipeline/docs/
  const baseDir = path.join(process.cwd(), '.pipeline', 'docs');
  try {
    if (!fs.existsSync(baseDir)) return null;
  } catch {
    return null;
  }

  let newest = null;
  let newestMtime = 0;

  try {
    for (const level of fs.readdirSync(baseDir)) {
      const levelDir = path.join(baseDir, level);
      if (!level.startsWith('Pre-')) continue;
      try {
        if (!fs.statSync(levelDir).isDirectory()) continue;
      } catch { continue; }

      for (const session of fs.readdirSync(levelDir)) {
        const candidate = path.join(levelDir, session, 'sentinel-state.json');
        try {
          const stat = fs.statSync(candidate);
          if (stat.mtimeMs > newestMtime) {
            newestMtime = stat.mtimeMs;
            newest = candidate;
          }
        } catch { /* not found, skip */ }
      }
    }
  } catch { /* baseDir read error, return null */ }

  return newest;
}

// ── Main Handler ────────────────────────────────────────────────────────────

function handleInput(raw) {
  // 1. Parse stdin (tool_input from Claude Code)
  let input;
  try {
    if (!raw || !raw.trim()) return process.exit(0); // empty stdin → allow
    input = JSON.parse(raw.trim());
  } catch {
    return process.exit(0); // unparseable → allow (fail-open)
  }

  // 2. Extract agent identity from tool_input
  // Guard against type confusion — only strings participate in routing.
  // Numeric, array, object, null, undefined → treat as unknown, allow.
  const toolInput = input.tool_input || {};
  const agentType = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type : '';

  // Only validate pipeline-orchestrator agents — allow all others
  if (!agentType || !agentType.startsWith('pipeline-orchestrator:')) {
    return process.exit(0); // not a pipeline agent, don't interfere
  }

  // "pipeline-orchestrator:core:sentinel" → "sentinel"
  const agentName = agentType.split(':').pop();

  // 3. Anti-loop: sentinel itself always passes
  if (agentName === 'sentinel') {
    return process.exit(0);
  }

  // 4. Discover state file (auto-discovery + env var fallback)
  const stateFilePath = discoverStatePath();

  // 5. No state file found — hybrid fail
  if (!stateFilePath) {
    // Bootstrap whitelist: these agents can run before state file exists
    const BOOTSTRAP_AGENTS = ['task-orchestrator'];

    if (BOOTSTRAP_AGENTS.includes(agentName)) {
      return process.exit(0); // fail-open: bootstrap permitted
    }

    // Fail-closed: any other pipeline-orchestrator agent without state file
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'SENTINEL: No sentinel-state.json found.\n' +
          `Agent "${agentName}" requires an active pipeline with state tracking.\n\n` +
          'ACTION REQUIRED: Create sentinel-state.json before spawning pipeline agents.\n' +
          'If this is a new pipeline, spawn task-orchestrator first (it bootstraps the state file).\n' +
          'If resuming, use /pipeline continue to restore state.'
      }
    };
    console.log(JSON.stringify(output));
    return process.exit(0);
  }

  // 6. Read and parse state file
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
  } catch {
    // State file corrupted → fail-open (recovery scenario)
    return process.exit(0);
  }

  // 7. Schema version check (SEC-3, v3.4.0)
  // Unknown schema_version is allowed for backwards compatibility, but the hook
  // now emits a stderr WARN so operators can detect version mismatches or state
  // file corruption. Silent allow was a safety-defeating default pre-v3.4.0.
  // Normalize to Number so string "1" matches (SEC-B3-01, Batch 3 round 2).
  const schemaVersionNum = Number(state.schema_version);
  if (schemaVersionNum !== 1) {
    process.stderr.write(
      `SENTINEL WARN: unknown schema_version=${JSON.stringify(state.schema_version)} in ${stateFilePath}. ` +
      `Treating as non-enforcing (silent allow) for backwards compat. Expected schema_version=1.\n`
    );
    return process.exit(0);
  }

  // 8. Pipeline inactive? → silent pass
  if (!state.pipeline_active) {
    return process.exit(0);
  }

  // 9. Stale state detection (collected, NOT early-return — divergence check must ALWAYS run)
  const STALE_THRESHOLD_MS = 300_000; // 300 seconds (5 minutes) — opus agents can take >60s per spawn
  const lastUpdated = state.last_updated ? new Date(state.last_updated).getTime() : 0;
  const elapsed = Date.now() - lastUpdated;
  let staleWarning = null;

  if (lastUpdated > 0 && elapsed > STALE_THRESHOLD_MS) {
    const elapsedSec = Math.round(elapsed / 1000);
    const thresholdSec = Math.round(STALE_THRESHOLD_MS / 1000);
    staleWarning =
      `SENTINEL WARNING: State file is ${elapsedSec}s old (threshold: ${thresholdSec}s). ` +
      `The controller may have forgotten to update sentinel-state.json before this spawn. ` +
      `expected_next="${state.expected_next || '?'}" may be stale. ` +
      `Verify that you updated the state file via Write tool BEFORE this Agent call.`;
  }

  // 10. Circuit breaker: 3+ consecutive corrections
  if ((state.consecutive_corrections || 0) >= 3) {
    process.stderr.write(
      'SENTINEL CIRCUIT_BREAKER: 3 consecutive corrections without PASS. ' +
      'Pipeline needs manual intervention. ' +
      'Options: (a) Spawn sentinel agent with mode SEQUENCE_VALIDATION for diagnosis, ' +
      '(b) Ask the user to resolve, (c) Cancel pipeline.'
    );
    return process.exit(2); // hard block — stderr fed to Claude
  }

  // 11. Compare target vs expected_next (ALWAYS runs, even if stale)
  const expected = (state.expected_next || '').toLowerCase();
  const target = agentName.toLowerCase();

  if (target === expected) {
    // MATCH → allow (with stale warning if applicable)
    if (staleWarning) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          additionalContext: staleWarning
        }
      };
      console.log(JSON.stringify(output));
    }
    return process.exit(0);
  }

  // 12. Check if this is a known alias or partial match
  if (expected && agentType.toLowerCase().endsWith(expected)) {
    return process.exit(0); // suffix match → allow
  }

  // 13. DIVERGENCE — deny with reason
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `SENTINEL DIVERGENCE DETECTED.\n` +
        `  Attempted: "${agentName}"\n` +
        `  Expected:  "${state.expected_next}" (Phase ${state.current_phase || '?'}, Variant: ${state.variant || '?'})\n\n` +
        `ACTION REQUIRED: Spawn the sentinel agent (subagent_type: "pipeline-orchestrator:core:sentinel") ` +
        `with mode SEQUENCE_VALIDATION to diagnose and auto-correct.\n` +
        `Pass these parameters in the prompt:\n` +
        `  - mode: SEQUENCE_VALIDATION\n` +
        `  - state_file_path: ${stateFilePath}\n` +
        `  - trigger: hook_deny\n` +
        `  - deny_reason: Attempted "${agentName}" but expected "${state.expected_next}"`
    }
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

// Cross-platform stdin reading (works on Windows + Unix)
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => handleInput(input));
