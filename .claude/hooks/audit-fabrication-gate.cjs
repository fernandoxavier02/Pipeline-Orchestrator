#!/usr/bin/env node
'use strict';

// =============================================================================
// audit-fabrication-gate.cjs — v8.23.0 (PreToolUse Write|Edit|MultiEdit)
// =============================================================================
// Write-time anti-fabrication guard for the run's audit trail. Intercepts a
// Write/Edit/MultiEdit whose target is gate-decisions.jsonl or sentinel-state.json
// INSIDE a run dir, inspects the INCOMING content against the run's own trail via
// the pure brain lib/audit-forgery-guard.cjs, and DENIES (default) when it carries
// a forgery signature — running BEFORE the PostToolUse autosign, so a forged entry
// never gets laundered into a valid signature.
//
//   default deny; escape PIPELINE_AUDIT_FABRICATION_ENFORCEMENT=warn.
//   backdating threshold override: PIPELINE_BACKFILL_THRESHOLD_MS (floor 1000).
//   high-severity AUDIT event → protocol-events.jsonl on every block/warn.
//
// FAIL-OPEN (never block a healthy run): not our tool/file, not a run dir, the
// incoming content is unreadable, or the brain throws → allow. The two deliberate
// non-fail-open exceptions match the user's intent and are enforced in the brain:
// a GO/completed with an absent gate trail, and a decided_by:user with an absent
// protocol trail, are the forgery signatures themselves — not "healthy absence".
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let guard = null;
try { guard = require('../../lib/audit-forgery-guard.cjs'); } catch { guard = null; }

const TOOL_RE = /^(Write|Edit|MultiEdit)$/;
const TARGET = new Set(['gate-decisions.jsonl', 'sentinel-state.json']);

function isRunDirPath(p) {
  if (typeof p !== 'string' || !p) return false;
  const norm = p.replace(/\\/g, '/');
  return /\/\.pipeline\/docs\//.test(norm) || /\/pipeline-runs\//.test(norm);
}

function applyEdit(text, oldStr, newStr) {
  if (oldStr === '') return text + newStr;              // append/create semantics
  const idx = text.indexOf(oldStr);
  if (idx === -1) return text + '\n' + newStr;          // not found (Edit would fail) → inspect conservatively
  return text.slice(0, idx) + newStr + text.slice(idx + oldStr.length);
}

// The FULL RESULTING file content after this tool call — not just the fragment.
// Inspecting the result (not new_string in isolation) closes the value-only Edit
// bypass: `Edit(old="PENDING", new="GO")` on a state file yields the whole file
// with "final_decision":"GO", which parses and is detected; the fragment "GO"
// alone would not.
function resultingContent(tool, input, existingContent) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : null;
  const base = existingContent || '';
  if (tool === 'Edit') {
    if (typeof input.new_string !== 'string' || typeof input.old_string !== 'string') return null;
    return applyEdit(base, input.old_string, input.new_string);
  }
  if (tool === 'MultiEdit') {
    if (!Array.isArray(input.edits)) return null;
    let cur = base;
    for (const e of input.edits) {
      if (!e || typeof e.new_string !== 'string' || typeof e.old_string !== 'string') continue;
      cur = applyEdit(cur, e.old_string, e.new_string);
    }
    return cur;
  }
  return null;
}

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

function sanitize(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '').slice(0, 200);
}

function thresholdMs() {
  const v = parseInt(process.env.PIPELINE_BACKFILL_THRESHOLD_MS || '', 10);
  return Number.isFinite(v) && v >= 1000 ? v : undefined; // undefined → brain default (5 min)
}

function appendAudit(runDir, findings, mode) {
  try {
    const ev = {
      event: 'AUDIT_TRAIL_FABRICATION_BLOCKED',
      severity: 'high',
      decision: mode === 'warn' ? 'WARNED' : 'BLOCKED',
      cases: findings.map((f) => f.case),
      detail: sanitize(findings.map((f) => `${f.case}: ${f.detail}`).join(' | ')),
      ts: new Date().toISOString(),
    };
    fs.appendFileSync(path.join(runDir, 'protocol-events.jsonl'), JSON.stringify(ev) + '\n');
  } catch { /* audit is best-effort; it must never change the gate outcome */ }
}

function decide(payload) {
  if (!guard || typeof guard.analyze !== 'function') return { decision: 'allow' };
  if (!payload || typeof payload !== 'object') return { decision: 'allow' };
  const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '';
  if (!TOOL_RE.test(tool)) return { decision: 'allow' };
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const filePath = typeof input.file_path === 'string' ? input.file_path : '';
  if (!filePath) return { decision: 'allow' };
  const filename = path.basename(filePath).toLowerCase(); // case-insensitive FS parity
  if (!TARGET.has(filename)) return { decision: 'allow' };
  if (!isRunDirPath(filePath)) return { decision: 'allow' };

  const runDir = path.dirname(filePath);
  const existingContent = readSafe(filePath) || '';
  const incoming = resultingContent(tool, input, existingContent);
  if (typeof incoming !== 'string') return { decision: 'allow' }; // can't inspect → fail-open
  const gateDecisionsText = filename === 'gate-decisions.jsonl'
    ? existingContent
    : (readSafe(path.join(runDir, 'gate-decisions.jsonl')) || '');
  const protocolRaw = readSafe(path.join(runDir, 'protocol-events.jsonl'));

  let res;
  try {
    res = guard.analyze({
      filename,
      incomingContent: incoming,
      existingContent,
      gateDecisionsText,
      protocolPresent: protocolRaw !== null,
      protocolText: protocolRaw || '',
      nowMs: Date.now(),
      thresholdMs: thresholdMs(),
    });
  } catch { return { decision: 'allow' }; } // our own bug must never block a healthy run

  const findings = (res && res.findings) || [];
  if (!findings.length) return { decision: 'allow' };

  const mode = String(process.env.PIPELINE_AUDIT_FABRICATION_ENFORCEMENT || 'deny').toLowerCase() === 'warn' ? 'warn' : 'deny';
  appendAudit(runDir, findings, mode);
  if (mode === 'warn') return { decision: 'allow', warn: true };

  return {
    decision: 'block',
    reason:
      `AUDIT_TRAIL_FABRICATION_BLOCKED: esta escrita em ${filename} carrega entrada(s) que não ` +
      `conferem com o resto do run (${findings.map((f) => f.case).join(', ')}). A assinatura garante ` +
      'integridade, não veracidade — por isso a escrita é bloqueada no ato. Detalhe: ' +
      sanitize(findings.map((f) => f.detail).join(' | ')) +
      '. Se a retro-datação for legítima, inclua o marcador BACKFILLED no campo detail; para ' +
      'promover a GO/completed, registre a cadeia de fechamento antes; para decided_by:user, ' +
      'garanta o protocol-event correspondente. Escape auditado: PIPELINE_AUDIT_FABRICATION_ENFORCEMENT=warn.',
  };
}

if (require.main === module) {
  let s = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try {
      const out = decide(JSON.parse(s || '{}'));
      if (out && out.decision === 'block') {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: out.reason,
          },
        }));
      }
    } catch (e) {
      process.stderr.write('audit-fabrication-gate error: ' + e.message + '\n');
    }
    process.exit(0);
  });
}

module.exports = { decide, isRunDirPath, resultingContent, applyEdit, appendAudit };
