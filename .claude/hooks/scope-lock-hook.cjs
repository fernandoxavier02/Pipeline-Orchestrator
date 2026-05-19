// .claude/hooks/scope-lock-hook.cjs
//
// PreToolUse:Write|Edit|MultiEdit|NotebookEdit hook that enforces the active
// CHANGE_CONTRACT.forbidden_files allowlist at the JS runtime layer.
//
// Defense-in-depth pair with the prose-level SCOPE LOCK CHECK in
// agents/executor/executor-implementer-task.md. The prose-level check relies
// on the LLM cooperating; this hook is a backstop that denies tool calls
// regardless of LLM behavior.
//
// Introduced 2026-05-19 per SEC-5 consensus finding from the v6.3.0 final
// adversarial review. The finding was: "SCOPE LOCK CHECK is prose-only. A
// prompt-injection payload that bypasses ANTI-PROMPT-INJECTION would allow
// unrestricted writes with zero hook-level backstop."
//
// Behavior:
//   - Reads {pipelineDir}/.pipeline/sessions/<active-session>.lock to find
//     the active CHANGE_CONTRACT (written there by the pipeline-controller
//     when a plan is approved).
//   - If no active contract exists (no active session, legacy mode, no
//     CHANGE_CONTRACT in the plan), the hook is permissive — backward compat.
//   - If a contract exists, checks the Write/Edit target path against:
//       * forbidden_files (denylist — always blocks)
//       * allowed_files / allowed_new_files (allowlist — must be present)
//   - Bootstrap exception: if the contract has bootstrap.active === true,
//     the hook is permissive (matches the bootstrap design — see
//     references/implementation-discipline.md § "Bootstrap & Self-Applying
//     Behavior"). The F15 regression test pins that bootstrap.active === true
//     is only legitimate in the historical v6.3.0 plan archive.
//
// IRON LAW: this hook never deletes, never moves, never writes anything to
// disk. It only inspects tool input and emits permissionDecision.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// IRON LAW: this hook never writes, never deletes. Only reads + emits
// permissionDecision. (READ_ONLY phantom constant removed per QUAL-2 attempt 2;
// the guarantee is enforced by the test asserting absence of writeFileSync /
// unlinkSync in the source. See __tests__/scope-lock-hook.test.cjs.)

const TOOL_NAMES_LOCKED = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// SEC-A attempt-2 hardening: cap pattern length to prevent ReDoS in the regex
// fallback. A malicious lock file with a pathological glob (e.g.,
// `'a*a*a*a*a*a*b'`) tested against a long non-matching path can hang the
// hook process and cause the harness to time out. Length cap blocks the
// pattern class that produces super-linear backtracking.
const MAX_PATTERN_LENGTH = 200;

// SEC-C attempt-2 hardening: cap the number of lock candidates scanned per
// PreToolUse invocation. A sessions dir with thousands of stale locks would
// cause sustained hook latency that could trip a harness timeout (fail-open).
const MAX_LOCK_CANDIDATES = 32;

function getPipelineDocPath() {
  // Convention across hooks: PIPELINE_DOC_PATH points at the active session's
  // pipeline doc folder. Fallback to PIPELINE_DIR for backwards compat with
  // earlier env-var naming, then to cwd. (ARCH-2 attempt-2 fix.)
  return process.env.PIPELINE_DOC_PATH || process.env.PIPELINE_DIR || process.cwd();
}

function readActiveContract(pipelineDir) {
  // The pipeline-controller writes the active contract into the session lock
  // when a plan is approved. We probe sessions/*.lock and return the contract
  // from the newest active lock that carries an `active_change_contract` field.
  //
  // ARCH-1 attempt-2: this scanner intentionally lives separately from
  // edit-guard-hook's lock scanner. The two hooks have distinct concerns
  // (session lifecycle vs. scope enforcement); sharing a lib would couple
  // them. Tradeoff accepted: heartbeat enforcement here is best-effort, and
  // edit-guard-hook owns the strict heartbeat path.
  const sessionsDir = path.join(pipelineDir, '.pipeline', 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;

  let files;
  try {
    files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.lock'));
  } catch (_) { return null; }

  // SEC-C attempt-2: cap candidates by mtime BEFORE parsing JSON to bound
  // the worst-case latency on dirs with many stale locks.
  if (files.length > MAX_LOCK_CANDIDATES) {
    files = files
      .map((f) => {
        try {
          const st = fs.statSync(path.join(sessionsDir, f));
          return { f, mtime: st.mtimeMs };
        } catch (_) { return { f, mtime: 0 }; }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, MAX_LOCK_CANDIDATES)
      .map((entry) => entry.f);
  }

  const now = Date.now();
  const candidates = [];
  for (const f of files) {
    try {
      const lock = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
      if (
        typeof lock.expires_at === 'number' &&
        lock.expires_at > now &&
        lock.status === 'active' &&
        lock.active_change_contract &&
        typeof lock.active_change_contract === 'object'
      ) {
        candidates.push(lock);
      }
    } catch (_) { /* skip malformed */ }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aC = typeof a.created_at === 'number' ? a.created_at : 0;
    const bC = typeof b.created_at === 'number' ? b.created_at : 0;
    return bC - aC;
  });
  return candidates[0].active_change_contract;
}

function normalisePath(p) {
  // Cross-platform path normalisation: convert ALL slash styles to forward,
  // regardless of the host OS path.sep. SEC-B attempt-2 fix: splitting on
  // `path.sep` left Windows-authored backslashes unchanged on Linux CI,
  // silently breaking pattern matching. Use a regex that handles both.
  if (typeof p !== 'string') return '';
  return p.split(/[\\/]/).join('/').toLowerCase();
}

function matchesPattern(target, pattern) {
  // Pattern semantics: support trailing `/*` (one level), `/**` (recursive),
  // bare exact match (with optional trailing-segment shorthand), and a
  // regex-fallback for simple globs.
  //
  // SEC-A attempt-2 hardening: length cap on patterns before any regex
  // construction prevents ReDoS via pathological glob.
  // SEC-B attempt-2 fix: normalisePath now handles both slash styles.
  // QUAL-1 attempt-2 fix: `/**` branch now asserts the prefix boundary
  //   (exact-match OR followed by `/`) — previously a pattern `agents/**`
  //   would over-block `agents-extra/foo`.
  // RISK-3 attempt-2 fix: the regex fallback now uses `[^/]*` so a `*`
  //   inside a path does NOT cross directory boundaries (`config/*.json`
  //   matches `config/a.json` but not `config/sub/a.json`). Use `.*` ONLY
  //   for explicit `**`-style patterns (which already have their own branch).
  if (typeof target !== 'string' || typeof pattern !== 'string') return false;
  if (pattern.length > MAX_PATTERN_LENGTH) return false;

  const t = normalisePath(target);
  const p = normalisePath(pattern);

  if (p.endsWith('/**')) {
    const prefix = p.slice(0, -3);
    // QUAL-1 fix: enforce directory boundary on the prefix.
    return t === prefix || t.startsWith(prefix + '/');
  }
  if (p.endsWith('/*')) {
    const prefix = p.slice(0, -2);
    return t.startsWith(prefix + '/') && t.indexOf('/', prefix.length + 1) === -1;
  }
  if (p.includes('*')) {
    // RISK-3 fix: `*` does NOT cross directory boundaries. Use `[^/]*`.
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    const re = new RegExp('^' + escaped + '$');
    return re.test(t);
  }
  return t === p || t.endsWith('/' + p);
}

function checkScope(toolName, toolInput, contract) {
  // contract may be null (no active contract → permissive)
  if (!contract) return { allow: true };

  // Bootstrap exception
  if (contract.bootstrap && contract.bootstrap.active === true) {
    return { allow: true, reason: 'bootstrap.active=true (audit logged)' };
  }

  // Extract target path from tool input (Write uses file_path, Edit uses file_path, MultiEdit uses file_path)
  const targetPath =
    (toolInput && (toolInput.file_path || toolInput.notebook_path || toolInput.path)) || null;
  if (!targetPath) return { allow: true, reason: 'no target path resolvable' };

  // forbidden_files takes precedence over allowed_files.
  const forbidden = Array.isArray(contract.forbidden_files) ? contract.forbidden_files : [];
  for (const pattern of forbidden) {
    if (matchesPattern(targetPath, pattern)) {
      return {
        allow: false,
        reason: `SCOPE LOCK violation — target "${targetPath}" matches forbidden_files pattern "${pattern}". ` +
                'See references/implementation-discipline.md § "Scope Control Rules". ' +
                'To proceed legitimately, return status=QUESTIONS with question.context=scope_lock_violation and let the user expand the contract.',
      };
    }
  }

  // allowed_files / allowed_new_files allowlist check (only when populated).
  // Empty arrays are interpreted as "no positive allowance" — but for backward
  // compat we treat ZERO-LENGTH arrays as "not configured" (permissive) so
  // legacy plans don't break. The fail-closed semantics for zero come from
  // diff_budget (max_files_expected: 0), not from these allowlists.
  const allowed = Array.isArray(contract.allowed_files) ? contract.allowed_files : [];
  const allowedNew = Array.isArray(contract.allowed_new_files) ? contract.allowed_new_files : [];
  if (allowed.length === 0 && allowedNew.length === 0) {
    return { allow: true, reason: 'no allowlist configured (legacy/permissive)' };
  }

  // Combined allowlist match.
  const combined = allowed.concat(allowedNew);
  for (const pattern of combined) {
    if (matchesPattern(targetPath, pattern)) return { allow: true };
  }

  return {
    allow: false,
    reason: `SCOPE LOCK violation — target "${targetPath}" is not in CHANGE_CONTRACT.allowed_files or allowed_new_files. ` +
            'See references/implementation-discipline.md § "Scope Control Rules". ' +
            'To proceed legitimately, return status=QUESTIONS with question.context=scope_lock_violation.',
  };
}

function main() {
  // PreToolUse hooks receive { tool_name, tool_input } on stdin.
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (_) {
    // No stdin — nothing to check, pass through.
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
    return;
  }

  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch (_) {
    // Malformed input — fail open (other hooks will see same input).
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
    return;
  }

  const toolName = parsed.tool_name || '';
  if (!TOOL_NAMES_LOCKED.has(toolName)) {
    process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
    return;
  }

  const contract = readActiveContract(getPipelineDocPath());
  const result = checkScope(toolName, parsed.tool_input || {}, contract);

  if (result.allow) {
    process.stdout.write(JSON.stringify({
      permissionDecision: 'allow',
      ...(result.reason ? { reason: result.reason } : {}),
    }));
    return;
  }

  process.stdout.write(JSON.stringify({
    permissionDecision: 'deny',
    reason: result.reason,
  }));
}

// Export for tests; main() runs only when invoked as a script.
module.exports = {
  checkScope,
  matchesPattern,
  normalisePath,
  readActiveContract,
};

if (require.main === module) {
  main();
}
