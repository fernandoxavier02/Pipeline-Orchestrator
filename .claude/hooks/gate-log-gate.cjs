#!/usr/bin/env node
'use strict';

// =============================================================================
// gate-log-gate.cjs — v8.7.0 (PreToolUse:Agent)
// =============================================================================
// Enforces deterministic gate LOGGING before a phase-transition agent spawns:
// before a governed agent runs, the prior phase's REQUIRED gate decision(s) must
// already be present in {pipeline_doc_path}/gate-decisions.jsonl. The pure
// decision lives in lib/gate-log-guard.cjs; this is the thin I/O wrapper that
// reads the trail, parses the logged gate names, and calls decideGateLog with
// the spawned agent leaf. Mirrors step-ledger-gate.cjs.
//
// SAFE BY CONSTRUCTION:
//  - only acts on an ACTIVE run (pipeline_active === true);
//  - VERIFIES the signed sentinel-state (a present-but-invalid HMAC signature is
//    NOT trusted — matches the SEC-1 fix posture in step-ledger-stamp);
//  - ungoverned agents (those not in REQUIRED_GATES_BEFORE) always allowed;
//  - default enforcement = deny (escape to warn via PIPELINE_GATE_LOG_ENFORCEMENT=warn);
//  - missing trail file → fail-open (treated as no gates logged is NOT done; an
//    absent trail means we cannot prove the negative safely, so we fail-open);
//  - fail-open on missing/corrupt state or any error.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let guard = null;
try { guard = require('../../lib/gate-log-guard.cjs'); } catch { guard = null; }

function decide(payload) {
  if (!guard || typeof guard.decideGateLog !== 'function' || typeof guard.parseLoggedGates !== 'function') {
    return { decision: 'allow' };
  }
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  if (payload.tool_name !== 'Agent') return { decision: 'allow' };
  const dir = payload.cwd;
  if (typeof dir !== 'string' || !dir) return { decision: 'allow' };

  // findActiveSentinelState already VERIFIES the HMAC signature: a present-but-
  // invalid signature returns CORRUPT_SENTINEL (handled below as fail-open), so a
  // forged signed state cannot be laundered into a "valid active run" (SEC-1).
  let state;
  try { state = eg && eg.findActiveSentinelState(dir); } catch { return { decision: 'allow' }; }
  // Split the two cases (AUDIT-003, D3): a genuinely-ABSENT state means there is no
  // run → stay open. An authoritatively-CORRUPT state (unreadable / tampered HMAC)
  // must FAIL CLOSED for a GOVERNED leaf, mirroring batch-review-gate.cjs. The
  // present-but-invalid-signature case is already mapped to CORRUPT_SENTINEL by
  // findActiveSentinelState (so a forged signed state can't be laundered).
  if (!state) return { decision: 'allow' };

  const ti = payload.tool_input || {};
  const leaf = String(ti.subagent_type || '').split(':').pop();
  // SEC-5: an empty leaf (e.g. subagent_type "anything:" → leaf === "") is UNGOVERNED
  // by construction → allow. This guard runs BEFORE the corrupt-state branch, so an
  // ambiguous empty type cannot silently bypass the fail-closed path either: it is
  // explicitly allowed (no over-block), with unambiguous intent.
  if (!leaf) return { decision: 'allow' };

  const enforce = process.env.PIPELINE_GATE_LOG_ENFORCEMENT || 'deny';
  if (eg && state === eg.CORRUPT_SENTINEL) {
    // "GOVERNED" = the leaf has a required-before gate set. Ungoverned → never deadlock.
    const governed = guard.REQUIRED_GATES_BEFORE
      && Object.prototype.hasOwnProperty.call(guard.REQUIRED_GATES_BEFORE, leaf);
    if (!governed) return { decision: 'allow' };
    if (String(enforce).toLowerCase() === 'warn') return { decision: 'allow', warn: true };
    return {
      decision: 'block',
      reason:
        'GATE_LOG_STATE_CORRUPT: o sentinel-state assinado deste run não passa na ' +
        'verificação de integridade (HMAC), então a trilha de gates não é confiável e o ' +
        `spawn de ${leaf} é BLOQUEADO. Recrie/re-assine o estado pelo controller antes de avançar.`,
    };
  }
  if (state.pipeline_active !== true) return { decision: 'allow' };

  // Resolve the run dir to find gate-decisions.jsonl (PIPELINE_DOC_PATH wins).
  let docDir = (process.env.PIPELINE_DOC_PATH || '').trim();
  if (docDir) {
    docDir = path.isAbsolute(docDir) ? docDir : path.resolve(dir, docDir);
  } else if (typeof state.pipeline_doc_path === 'string' && state.pipeline_doc_path) {
    docDir = path.isAbsolute(state.pipeline_doc_path)
      ? state.pipeline_doc_path
      : path.resolve(dir, state.pipeline_doc_path);
  } else {
    return { decision: 'allow' }; // can't locate the trail → fail-open
  }

  let jsonlText = '';
  try { jsonlText = fs.readFileSync(path.join(docDir, 'gate-decisions.jsonl'), 'utf8'); }
  catch { return { decision: 'allow' }; } // absent/unreadable trail → fail-open

  const loggedGates = guard.parseLoggedGates(jsonlText);
  return guard.decideGateLog({
    agentLeaf: leaf,
    loggedGates,
    enforce: process.env.PIPELINE_GATE_LOG_ENFORCEMENT || 'deny',
  });
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try {
      const out = decide(JSON.parse(s));
      if (out && out.decision === 'block') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: out.reason },
        }));
      }
      process.exit(0);
    } catch (e) {
      process.stderr.write('gate-log-gate error: ' + e.message + '\n');
      process.exit(0);
    }
  });
}

module.exports = { decide };
