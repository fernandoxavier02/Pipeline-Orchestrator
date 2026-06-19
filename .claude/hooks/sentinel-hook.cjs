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
const enforcement = require('./skill-frontmatter-parser.cjs');
// v7.13.0 (R4): HMAC integrity verification of the active sentinel state.
// Loaded defensively — if the lib is unavailable the hook degrades to advisory
// (warn-first) and never crashes. Strict mode fails closed (PIPELINE_HMAC_STRICT).
let stateSigner = null;
try { stateSigner = require('../../lib/sentinel-state-signer.cjs'); } catch { /* advisory skip */ }

// ── v4.8.0 Skill Enforcement ────────────────────────────────────────────────

// Validates state against SKILL.md sentinel_checkpoints contract.
// Returns null when no enforcement needed (no skill, no contract, or step not at checkpoint).
// Returns { violation, hint } when contract is breached.
function enforceSkillContract(state) {
  // AUDIT-007 (v7.11.0): fall back to the pipeline_variant when no explicit
  // current_skill is set — inline-routed variants (audit-*, ux-sim-*,
  // user-story-*, feature-*) now have skill folders, so their sentinel_checkpoints
  // can be enforced too. getVariantSkill returns null when neither applies,
  // preserving the original advisory null-skip.
  const ctx = enforcement.getCurrentSkill(state) || enforcement.getVariantSkill(state);
  if (!ctx || !ctx.step) return null; // No skill/variant in flight → skip (preserves advisory mode)
  const repoRoot = process.env.PIPELINE_REPO_ROOT || process.cwd();
  const skillResult = enforcement.readSkillFrontmatter(ctx.skill, repoRoot);
  if (!skillResult.ok) return null; // Can't read skill → skip gracefully
  const fm = skillResult.frontmatter;
  if (!Array.isArray(fm.sentinel_checkpoints)) return null; // No checkpoints declared
  const stepLabel = `pre_${ctx.step}`;
  const stepInList = fm.sentinel_checkpoints.includes(ctx.step) || fm.sentinel_checkpoints.includes(stepLabel);
  if (!stepInList) return null; // Current step is not a checkpoint
  if (!state.expected_next || String(state.expected_next).trim() === '') {
    return {
      violation: `checkpoint ${stepLabel} reached but expected_next not set in state`,
      hint: 'Controller must set expected_next before spawning Agent at checkpoint steps',
    };
  }
  return null; // OK
}

function applyEnforcement(state) {
  let violation;
  try { violation = enforceSkillContract(state); } catch { return false; }
  if (!violation) return false;
  const mode = enforcement.getEnforcementMode();
  const docPath = state.pipeline_doc_path || (process.env.PIPELINE_DOC_PATH || '').trim();
  enforcement.logEnforcementDecision(docPath, {
    mode, hook: 'sentinel-hook', skill: state.current_skill, step: state.current_step,
    violation: violation.violation, detail: violation.hint, pipeline_doc_path: docPath,
  });
  if (mode === 'deny') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[ENFORCEMENT] ${violation.violation}. ${violation.hint}`,
      }
    }));
    return true; // signal to caller: exit
  }
  process.stderr.write(`[ENFORCEMENT_WARN] sentinel-hook: ${violation.violation}\n`);
  return false; // warn mode → continue with normal flow
}

// ── Auto-Discovery ──────────────────────────────────────────────────────────

// Inline AUDIT emitter (v7.5.0). Dedupe by (event,key) so repeated lookups in a
// single hook invocation only surface one breadcrumb per scenario.
const _emittedAuditsSentinel = new Set();
function emitAudit(name, fields, dedupeKey) {
  if (dedupeKey) {
    if (_emittedAuditsSentinel.has(dedupeKey)) return;
    _emittedAuditsSentinel.add(dedupeKey);
  }
  try {
    process.stderr.write(JSON.stringify({
      audit_event: name,
      ts: new Date().toISOString(),
      ...fields,
    }) + '\n');
  } catch (_e) { /* never throw from audit */ }
}

// Tolerant reader: returns the run_id field from a sentinel-state.json file,
// or null on any failure (missing file, parse error, missing field).
function readStateRunId(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const body = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (body && typeof body.run_id === 'string') return body.run_id;
    return null;
  } catch (_e) {
    return null;
  }
}

// List every <baseDir>/Pre-*/<session>/sentinel-state.json on disk.
function listSentinelStates(baseDir) {
  const out = [];
  try {
    if (!fs.existsSync(baseDir)) return out;
    for (const level of fs.readdirSync(baseDir)) {
      if (!level.startsWith('Pre-')) continue;
      const levelDir = path.join(baseDir, level);
      try {
        if (!fs.statSync(levelDir).isDirectory()) continue;
      } catch { continue; }
      let sessions;
      try { sessions = fs.readdirSync(levelDir); }
      catch { continue; }
      for (const session of sessions) {
        const candidate = path.join(levelDir, session, 'sentinel-state.json');
        try {
          if (fs.statSync(candidate).isFile()) out.push(candidate);
        } catch { /* not found, skip */ }
      }
    }
  } catch { /* baseDir read error */ }
  return out;
}

// Find the active sentinel-state.json.
// Priority 1: PIPELINE_DOC_PATH env var (backwards-compatible override).
// Priority 2: PIPELINE_RUN_ID match across all candidates (REQ-C-2, v7.5.0).
// Priority 3: mtime-newest fallback with AUDIT event (REQ-C-3).
function discoverStatePath() {
  // Priority 1: explicit env var (backwards compatible)
  const envPath = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (envPath) {
    const candidate = path.join(envPath, 'sentinel-state.json');
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }

  // Priority 1.5 (AUDIT-005, v7.11.0): deterministic pointer file written by
  // the controller at run creation — `<cwd>/.pipeline/active-run.json` with
  // { pipeline_doc_path, run_id, updated_at }. Closes the cwd-coupled
  // dual-location ambiguity (evt-002/evt-012 of the 2026-06-11 audit): the
  // pointer names the run folder explicitly instead of relying on mtime luck.
  // Self-invalidates: stale (>24h) or pipeline_active=false -> fall through.
  try {
    const ptrPath = path.join(process.cwd(), '.pipeline', 'active-run.json');
    if (fs.existsSync(ptrPath)) {
      // SEC-4 (v7.11.0): size cap — a valid pointer is ~200 bytes; reject blobs.
      if (fs.statSync(ptrPath).size > 4096) throw new Error('pointer too large');
      const ptr = JSON.parse(fs.readFileSync(ptrPath, 'utf8'));
      const docPath = ptr && typeof ptr.pipeline_doc_path === 'string' ? ptr.pipeline_doc_path : '';
      // SEC-2 (v7.11.0): uncomputable age = STALE (fail-closed), not fresh-forever.
      const age = ptr && typeof ptr.updated_at === 'string' ? (Date.now() - Date.parse(ptr.updated_at)) : NaN;
      const freshEnough = Number.isFinite(age) && age >= 0 && age < 24 * 3600 * 1000;
      // SEC-1 (v7.11.0): containment — the pointer may only target a folder INSIDE
      // the project tree (same guard family as the docsRoot scan). Rejects absolute
      // escapes, UNC shares and .. traversal.
      const cwdGuard = path.resolve(process.cwd()) + path.sep;
      const resolvedDoc = docPath ? path.resolve(docPath) : '';
      const contained = resolvedDoc !== '' && resolvedDoc.startsWith(cwdGuard);
      // Concurrency guard: when PIPELINE_RUN_ID is set, the pointer must agree.
      const envRunId = (process.env.PIPELINE_RUN_ID || '').trim();
      const runIdOk = !envRunId || (ptr && ptr.run_id === envRunId);
      let reason = '';
      if (!docPath) reason = 'no_doc_path';
      else if (!contained) reason = 'outside_project';
      else if (!freshEnough) reason = 'age';
      else if (!runIdOk) reason = 'run_id_mismatch';
      if (!reason) {
        const candidate = path.join(resolvedDoc, 'sentinel-state.json');
        if (fs.existsSync(candidate)) {
          const st = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          if (!st || st.pipeline_active !== false) return candidate;
          reason = 'inactive';
        } else { reason = 'broken_path'; }
      }
      // SEC-3 (v7.11.0): reason-tagged audit so operators can tell age vs broken vs inactive.
      emitAudit('DISCOVERY_POINTER_STALE', { pointer: ptrPath, reason },
        `DISCOVERY_POINTER_STALE:${ptrPath}`);
    }
  } catch { /* pointer unreadable — fall through to scans */ }

  const baseDir = path.join(process.cwd(), '.pipeline', 'docs');
  const candidates = listSentinelStates(baseDir);
  if (candidates.length === 0) return null;

  // Priority 2: PIPELINE_RUN_ID match (REQ-C-1, REQ-C-2).
  const runId = (process.env.PIPELINE_RUN_ID || '').trim();
  if (runId) {
    for (const candidate of candidates) {
      if (readStateRunId(candidate) === runId) return candidate;
    }
    emitAudit('DISCOVERY_RUN_ID_NO_MATCH',
      { runId, candidates: candidates.length },
      `DISCOVERY_RUN_ID_NO_MATCH:${runId}`);
  }

  // Priority 3: mtime-newest fallback (REQ-C-3).
  let newest = null;
  let newestMtime = 0;
  for (const candidate of candidates) {
    try {
      const st = fs.statSync(candidate);
      if (st.mtimeMs > newestMtime) {
        newestMtime = st.mtimeMs;
        newest = candidate;
      }
    } catch { /* skip */ }
  }
  if (newest && candidates.length > 1) {
    emitAudit('DISCOVERY_MTIME_FALLBACK', {
      reason: runId ? 'no-match' : 'env-absent',
      picked: newest,
      total: candidates.length,
    }, `DISCOVERY_MTIME_FALLBACK:${newest}`);
  }
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
    // Bootstrap whitelist: these agents can run before state file exists.
    // v4 entry point is `pipeline-controller` (spawned by skills/pipeline/SKILL.md),
    // which then writes sentinel-state.json before spawning task-orchestrator.
    // task-orchestrator remains in the whitelist for v3 backward-compat and for
    // controllers that delegate state-file creation to the orchestrator.
    const BOOTSTRAP_AGENTS = ['task-orchestrator', 'pipeline-controller'];

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
          'If this is a new pipeline, invoke /pipeline-orchestrator:pipeline (spawns pipeline-controller, which bootstraps the state file).\n' +
          'If resuming, use /pipeline continue to restore state.'
      }
    };
    console.log(JSON.stringify(output));
    return process.exit(0);
  }

  // 6. Read and parse state file
  // RISK-2 fix (v3.5.0): unparseable state file was silent fail-open pre-v3.5.
  // Now emits stderr WARN so operators detect corruption, partial writes, or
  // concurrent-write races. Still exits 0 for backwards compatibility — a
  // corrupted state file should not hard-block a user's pipeline.
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
  } catch (err) {
    // Sanitize output (SEC-1, v3.5.0 round 2): log only the basename — absolute
    // path may echo partial secrets if the file was mid-rotation; the error
    // message may leak JSON fragments around the parse failure.
    const basename = path.basename(stateFilePath);
    const errKind = err && err.name ? err.name : 'ParseError';
    // v7.13.0 (R4): in STRICT mode an unparseable active-pipeline state cannot be
    // HMAC-verified, so it MUST NOT be trusted. Corrupting the file is a STRONGER
    // attack than tampering (which strict already denies) — fail closed here too,
    // mirroring the missing-state-file deny. Warn mode keeps the legacy allow+WARN.
    if (process.env.PIPELINE_HMAC_STRICT === 'true') {
      process.stderr.write(JSON.stringify({
        audit_event: 'SENTINEL_HMAC_UNVERIFIED',
        ts: new Date().toISOString(),
        reason: `unparseable state (${errKind}) — strict fail-closed`,
        unsigned: false, strict: true, state_file: basename,
      }) + '\n');
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `SENTINEL: active sentinel-state.json is unparseable (${errKind}) and cannot be ` +
            'HMAC-verified. Strict mode (PIPELINE_HMAC_STRICT=true) refuses to trust it. Fix the ' +
            'state file (re-create via the controller / signer) or unset PIPELINE_HMAC_STRICT.',
        },
      }));
      return process.exit(0);
    }
    process.stderr.write(
      `SENTINEL WARN: failed to parse state file ${basename} (${errKind}). ` +
      `Treating as non-enforcing (silent allow) for backwards compat. Check for partial writes or concurrent pipelines.\n`
    );
    return process.exit(0);
  }

  // 6.5. HMAC integrity verification (v7.13.0 — R4)
  // Verify the active state's signature BEFORE trusting it for enforcement —
  // this is what closes the "write pipeline_active:false to neutralize the
  // sentinel" attack (the canonical body, incl. pipeline_active and nested
  // fields, is signature-protected via recursive canonicalization).
  // Warn-first (default): an unsigned/tampered state emits an auditable stderr
  // event and is ALLOWED (migration period). Strict (PIPELINE_HMAC_STRICT=true):
  // fail closed — deny the spawn. Read-only key lookup; the hook never writes.
  {
    const hmacStrict = process.env.PIPELINE_HMAC_STRICT === 'true';
    let verification;
    if (stateSigner && typeof stateSigner.verifyState === 'function') {
      try {
        verification = stateSigner.verifyState(state, {
          key: stateSigner.readHmacKey(),
          strict: hmacStrict,
        });
      } catch (err) {
        // R4.7: verification could not be performed → fail closed only in strict.
        verification = { valid: !hmacStrict, reason: `verify threw: ${err && err.message}` };
      }
    } else if (hmacStrict) {
      verification = { valid: false, reason: 'signer module unavailable (strict fail-closed)' };
    } else {
      verification = { valid: true, reason: 'signer unavailable — advisory skip' };
    }

    // Emit the auditable warning when the state is tampered/invalid OR merely
    // unsigned (R4.5: migration mode allows unsigned legacy states but MUST warn).
    if (!verification.valid || verification.unsigned) {
      process.stderr.write(JSON.stringify({
        audit_event: 'SENTINEL_HMAC_UNVERIFIED',
        ts: new Date().toISOString(),
        reason: String(verification.reason || '').slice(0, 200),
        unsigned: !!verification.unsigned,
        strict: hmacStrict,
        state_file: path.basename(stateFilePath),
      }) + '\n');
    }

    // Deny only when verification actually FAILED and strict mode is on. In
    // strict mode unsigned states already verify as invalid, so this covers them.
    if (!verification.valid && hmacStrict) {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              'SENTINEL: active sentinel-state.json failed HMAC integrity verification ' +
              `(${verification.reason}). Strict mode (PIPELINE_HMAC_STRICT=true) refuses to trust an ` +
              'unsigned or tampered active state. Re-sign the state via lib/sentinel-state-signer.cjs ' +
              '(writeSignedState), or unset PIPELINE_HMAC_STRICT to run in warn-first migration mode.',
          },
        }));
        return process.exit(0);
    }
    // Warn-first default: the warning is on the record; allow and continue.
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

  // 8.5. v4.8.0 Skill enforcement (sentinel_checkpoints)
  // Returns true only when deny was emitted; warn returns false and we continue.
  if (applyEnforcement(state)) return process.exit(0);

  // 9. STALE_SPAWN detection (collected, NOT early-return — divergence check must ALWAYS run)
  //
  // NOMENCLATURE (v5.3.0+ canonical per references/stale-thresholds.md):
  //   - STALE_SPAWN  (5 min, this hook): controller forgot to update state.json between spawns
  //   - STALE_HEARTBEAT (10 min, session-lock-hook + edit-guard-hook): lock owner is dead
  //   - STALE_CONTEXT (24 h, gate registry): /pipeline continue on old context
  // These are THREE DISTINCT concepts — see references/stale-thresholds.md for decision tree.
  //
  // Backwards compat: STALE_THRESHOLD_MS exported as alias for one release (v5.3.0 deprecated;
  // remove v5.4.0).
  const STALE_SPAWN_THRESHOLD_MS = 300_000; // 5 min — opus agents can take >60s per spawn
  const STALE_THRESHOLD_MS = STALE_SPAWN_THRESHOLD_MS; // deprecated alias, do not use in new code
  const lastUpdated = state.last_updated ? new Date(state.last_updated).getTime() : 0;
  const elapsed = Date.now() - lastUpdated;
  let staleWarning = null;

  if (lastUpdated > 0 && elapsed > STALE_SPAWN_THRESHOLD_MS) {
    const elapsedSec = Math.round(elapsed / 1000);
    const thresholdSec = Math.round(STALE_SPAWN_THRESHOLD_MS / 1000);
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

  // 11. Compare target vs expected_next (ALWAYS runs, even if stale).
  // expected_next may be a single agent (serial — the common case) OR an array
  // of agents (a SANCTIONED parallel fan-out, e.g. the final adversarial
  // reviewers which the spec REQUIRES to run simultaneously). A spawn is allowed
  // if it matches ANY entry (exact leaf or full-type suffix). Single-string
  // behavior is unchanged (the array is just [str]).
  const expectedList = (Array.isArray(state.expected_next) ? state.expected_next : [state.expected_next])
    .map((e) => String(e || '').toLowerCase())
    .filter((e) => e.length > 0);
  const target = agentName.toLowerCase();
  const agentTypeLc = agentType.toLowerCase();
  const matched = expectedList.some((exp) => target === exp || agentTypeLc.endsWith(exp));

  if (matched) {
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

// v7.5.0+: expose internals for tests; only auto-run when invoked as a hook.
module.exports = {
  discoverStatePath,
  readStateRunId,
  listSentinelStates,
};

if (require.main === module) {
  // Cross-platform stdin reading (works on Windows + Unix)
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => handleInput(input));
}
