#!/usr/bin/env node
'use strict';

/**
 * sentinel-hook.cjs — PreToolUse:Agent guard for pipeline-orchestrator.
 *
 * Protocol:
 *   - Exit 0 with no stdout → allow (silent pass)
 *   - Exit 0 with hookSpecificOutput deny → deny this tool call, reason fed to Claude
 *   - Exit 0 with hookSpecificOutput allow + additionalContext → allow with warning
 *   - Exit 2 with stderr → hard block, stderr fed to Claude
 *
 * Auto-discovers sentinel-state.json from .pipeline/docs/Pre-*-action/.
 * Falls back to PIPELINE_DOC_PATH env var if set.
 * NEVER spawns agents, writes files, or emits visual output.
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
  const toolInput = input.tool_input || {};
  const fullAgentType = toolInput.subagent_type || '';

  // Only validate pipeline-orchestrator agents — allow all others
  if (!fullAgentType || !fullAgentType.startsWith('pipeline-orchestrator:')) {
    return process.exit(0); // not a pipeline agent, don't interfere
  }

  // "pipeline-orchestrator:core:sentinel" → "sentinel"
  const agentName = fullAgentType.split(':').pop();

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

  // 7. Schema version check
  if (state.schema_version !== 1) {
    return process.exit(0); // incompatible version → don't interfere
  }

  // 8. Pipeline inactive? → silent pass
  if (!state.pipeline_active) {
    return process.exit(0);
  }

  // 9. Stale state warning (passive — never blocks)
  const STALE_THRESHOLD_MS = 60_000; // 60 seconds
  const lastUpdated = state.last_updated ? new Date(state.last_updated).getTime() : 0;
  const elapsed = Date.now() - lastUpdated;

  if (lastUpdated > 0 && elapsed > STALE_THRESHOLD_MS) {
    const elapsedSec = Math.round(elapsed / 1000);
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext:
          `SENTINEL WARNING: State file is ${elapsedSec}s old (threshold: 60s). ` +
          `The controller may have forgotten to update sentinel-state.json before this spawn. ` +
          `expected_next="${state.expected_next || '?'}" may be stale. ` +
          `Verify that you updated the state file via Write tool BEFORE this Agent call.`
      }
    };
    console.log(JSON.stringify(output));
    return process.exit(0); // allow with warning
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

  // 11. Compare target vs expected_next
  const expected = (state.expected_next || '').toLowerCase();
  const target = agentName.toLowerCase();

  if (target === expected) {
    // MATCH → silent allow
    return process.exit(0);
  }

  // 12. Check if this is a known alias or partial match
  if (expected && fullAgentType.toLowerCase().endsWith(expected)) {
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
