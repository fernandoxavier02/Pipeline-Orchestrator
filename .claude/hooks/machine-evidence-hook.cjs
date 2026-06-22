#!/usr/bin/env node
'use strict';

// =============================================================================
// machine-evidence-hook.cjs — v8.10.0 (PostToolUse:Bash|PowerShell) — T15
// (REQ-MACHINE-EVIDENCE)
// =============================================================================
// A telemetry-grade collector that records the REAL outcome of a Bash/PowerShell
// command (defensive exit-code read, normalized command, truncated stdout/stderr)
// into a run-dir evidence ledger under the shipped exclusive lock. The honest
// machine source the DEFER'd evidence consumer (DoD#7) and the green-close producer
// (T20) read instead of agent prose. NEVER blocks — always exits 0; an ungoverned /
// absent run records nothing.
//
// Defensive read (HF:28): the documented PostToolUse:Bash tool_output carries exit
// code + stdout + stderr, but the exact key is read tolerantly
//   (tool_output.exit_code ?? tool_output.exitCode ?? tool_output.code ?? null).
// Git family (diff/status/show/...) ⇒ parse stdout into changed_files + git_observed:
// true; every other command ⇒ git_observed:false EXPLICITLY (so a consumer can tell
// "no git seen" from "git ran, zero changes").
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

let eg = null;
try { eg = require('./edit-guard-hook.cjs'); } catch { eg = null; }
let lock = null;
try { lock = require('../../lib/exclusive-lock.cjs'); } catch { lock = null; }

// Byte cap for stored stdout/stderr. Generous for a real build/test log, well under
// an oversize blob; over it we store a truncated prefix + set truncated:true.
const MAX_STREAM_BYTES = 16 * 1024;
const LEDGER_FILE = 'machine-evidence.jsonl';
const ID_FALLBACK = 'MACHINE_EVIDENCE_ID_FALLBACK';

function resolveDocDir(pipelineDir) {
  try {
    if (eg && typeof eg.discoverStatePath === 'function') {
      const { statePath } = eg.discoverStatePath(pipelineDir);
      if (statePath) return path.dirname(statePath);
    }
  } catch { /* fall through */ }
  return null;
}

// Defensive exit-code read across the tolerated key spellings. Returns a number when
// one is present, else null (never fabricated as 0).
function readExitCode(toolOutput) {
  if (!toolOutput || typeof toolOutput !== 'object') return null;
  const candidates = [toolOutput.exit_code, toolOutput.exitCode, toolOutput.code, toolOutput.status];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return null;
}

// Truncate a string to the byte cap. Returns { value, truncated }.
function truncateStream(s) {
  const str = typeof s === 'string' ? s : '';
  if (Buffer.byteLength(str, 'utf8') <= MAX_STREAM_BYTES) return { value: str, truncated: false };
  // Slice by characters down to the cap (UTF-8 safe-ish for ASCII logs; for the
  // common ASCII case length≈bytes, and a multibyte tail is harmless when stored).
  return { value: str.slice(0, MAX_STREAM_BYTES), truncated: true };
}

// Is this command a git command whose stdout we parse for changed files?
function isGitCommand(command) {
  const c = String(command || '').trim();
  // Match a leading `git ` (optionally via env/quoting prefixes are out of scope —
  // the harness passes the literal tool_input.command). A bare `git` alone counts.
  return /(^|[;&|]\s*)git(\s|$)/.test(c);
}

// Parse a git stdout into changed file paths. Handles `--name-only` (one path per
// line) and porcelain/status lines (status prefix + path). Best-effort, never throws.
function parseChangedFiles(stdout) {
  const out = [];
  const lines = String(stdout || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line) continue;
    // `git status --porcelain` / `git status -s`: 2-char status + space + path.
    const m = line.match(/^[ MADRCU?!]{1,2}\s+(.+)$/);
    if (m && m[1]) { out.push(m[1].trim()); continue; }
    // `git diff --name-only` / `git show --name-only`: a bare path.
    // Skip obvious non-path noise (diff headers, hashes-only lines).
    if (/^(commit |Author:|Date:|diff --git|index |---|\+\+\+|@@)/.test(line)) continue;
    out.push(line);
  }
  return out;
}

function appendLedger(ledgerPath, entry) {
  const line = JSON.stringify(entry) + '\n';
  const doAppend = () => { try { fs.appendFileSync(ledgerPath, line); } catch { /* best-effort */ } };
  try {
    if (lock && typeof lock.withLock === 'function') lock.withLock(ledgerPath, doAppend);
    else doAppend();
  } catch { /* persistence best-effort; never crash */ }
}

// Pure-ish collector. Records into the ledger as a side effect; returns nothing the
// harness acts on (this hook never blocks).
function collect(payload) {
  if (!payload || typeof payload !== 'object') return;
  const toolName = payload.tool_name;
  if (toolName !== 'Bash' && toolName !== 'PowerShell') return;

  const pipelineDir = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

  // Discover the active run. Ungoverned / absent / corrupt → record nothing.
  let state = null;
  try { state = eg && eg.findActiveSentinelState(pipelineDir); } catch { state = null; }
  if (!state || (eg && state === eg.CORRUPT_SENTINEL)) return;
  if (typeof state !== 'object' || state.pipeline_active !== true) return;

  const docDir = resolveDocDir(pipelineDir);
  if (!docDir) return;

  const ti = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const command = typeof ti.command === 'string' ? ti.command : '';
  // LIVE-PROBE FINDING (2026-06-21): the REAL PostToolUse field is `tool_response`,
  // NOT the docs' `tool_output`; and the Bash tool_response shape is
  // {stdout, stderr, interrupted, isImage, noOutputExpected} — it carries NO
  // structured exit code. So exit_code stays best-effort-null (never fabricated to 0),
  // and `interrupted` is the deterministic failure signal the harness DOES expose.
  const outRaw = payload.tool_response && typeof payload.tool_response === 'object'
    ? payload.tool_response
    : (payload.tool_output && typeof payload.tool_output === 'object' ? payload.tool_output : {});
  const exitCode = readExitCode(outRaw);
  const interrupted = outRaw.interrupted === true;
  const stdoutT = truncateStream(outRaw.stdout);
  const stderrT = truncateStream(outRaw.stderr);

  const evidenceId = (typeof payload.tool_use_id === 'string' && payload.tool_use_id)
    ? payload.tool_use_id
    : `${ID_FALLBACK}-${Date.now().toString(36)}`;

  const git = isGitCommand(command);
  const entry = {
    evidence_id: evidenceId,
    run_id: typeof state.run_id === 'string' ? state.run_id : null,
    tool_name: toolName,
    command: command.replace(/\r?\n/g, ' ').trim(),
    exit_code: exitCode,
    stdout: stdoutT.value,
    stderr: stderrT.value,
    truncated: stdoutT.truncated || stderrT.truncated,
    interrupted: interrupted,
    git_observed: git,
    changed_files: git ? parseChangedFiles(outRaw.stdout) : [],
    recorded_at: new Date().toISOString(),
  };

  appendLedger(path.join(docDir, LEDGER_FILE), entry);
}

if (require.main === module) {
  let s = '';
  process.stdin.on('data', (c) => { s += c; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(String(s).trim() || '{}');
      collect(payload);
    } catch (e) {
      process.stderr.write('machine-evidence-hook error: ' + (e && e.message ? e.message : e) + '\n');
    }
    // NEVER blocks: no decision output, always exit 0.
    process.exit(0);
  });
}

module.exports = { collect, readExitCode, parseChangedFiles, isGitCommand, truncateStream, MAX_STREAM_BYTES, LEDGER_FILE };
