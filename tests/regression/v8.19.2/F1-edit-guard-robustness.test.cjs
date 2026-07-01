#!/usr/bin/env node
'use strict';

// =============================================================================
// F1 — edit-guard-hook robustness (Claude-Code-scoped)
// =============================================================================
// The gate must NEVER crash the whole PreToolUse into the opaque external catch
// ("edit-guard-hook internal error — failing closed") because of an unreadable
// .pipeline/sessions entry or a malformed CLI payload — and when it genuinely
// MUST fail closed, it should say WHY.
//
// Scope note: this exercises ONLY the hook's own robustness in the Claude Code
// runtime. It deliberately does NOT teach the hook any foreign tool-name
// vocabulary — that is a different runtime's concern and out of scope here.
//
//   1. getActiveLock returns null (never throws) when .pipeline/sessions is
//      present-but-unreadable (a FILE where a dir is expected → ENOTDIR).
//   2. getActiveExecWindow does the same.
//   3. handlePreToolUse over a normal Edit payload whose cwd has that broken
//      sessions entry returns {decision:'allow'} without throwing.
//   4. The CLI external catch reports the REAL (sanitized) error, not the opaque
//      "internal error" — a genuine failure stays fail-closed but debuggable.
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..', '..');
const hookPath = path.join(root, '.claude', 'hooks', 'edit-guard-hook.cjs');
const eg = require(hookPath);

let failures = 0;
function check(label, got, exp) {
  const ok = got === exp;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} | exp=${exp} got=${got} | ${label}`);
}
function noThrow(label, fn) {
  try { const v = fn(); console.log(`OK   | no-throw | ${label}`); return v; }
  catch (e) { failures++; console.log(`FAIL | threw ${(e && (e.code || e.message)) || e} | ${label}`); return undefined; }
}

// ---- setup: a project dir whose .pipeline/sessions is a FILE (unreadable dir) --
const td = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-robust-'));
fs.mkdirSync(path.join(td, '.pipeline'), { recursive: true });
fs.writeFileSync(path.join(td, '.pipeline', 'sessions'), 'not-a-dir'); // readdirSync → ENOTDIR

// ---- 1. getActiveLock: null, no throw ---------------------------------------
const lock = noThrow('getActiveLock survives unreadable sessions dir', () => eg.getActiveLock(td));
check('getActiveLock returns null', lock, null);

// ---- 2. getActiveExecWindow: null, no throw ---------------------------------
const win = noThrow('getActiveExecWindow survives unreadable sessions dir', () => eg.getActiveExecWindow(td, 'sess-1'));
check('getActiveExecWindow returns null', win, null);

// ---- 3. handlePreToolUse Edit: allow, no throw ------------------------------
const res = noThrow('handlePreToolUse survives unreadable sessions dir', () => eg.handlePreToolUse({
  tool_name: 'Edit',
  tool_input: { file_path: path.join(td, 'src', 'x.js') },
  cwd: td,
}));
check('handlePreToolUse decision=allow', res && res.decision, 'allow');

// ---- 4. CLI external catch reports the REAL error ---------------------------
const cli = spawnSync(process.execPath, [hookPath], { input: 'this is not json{', encoding: 'utf8' });
let reason = '';
try { reason = JSON.parse(cli.stdout).hookSpecificOutput.permissionDecisionReason; } catch (_) { /* leave empty */ }
check('CLI still fails closed (deny) on malformed stdin', /failing closed/.test(reason), true);
check('CLI reason now carries the real error detail', /internal error:\s*\S/.test(reason), true);

// ---- cleanup ----------------------------------------------------------------
try { fs.rmSync(td, { recursive: true, force: true }); } catch (_) { /* best-effort */ }

console.log(failures === 0 ? '\n>>> F1 PASS' : `\n>>> F1 ${failures} FALHAS`);
process.exit(failures ? 1 : 0);
