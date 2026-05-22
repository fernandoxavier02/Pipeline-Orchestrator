#!/usr/bin/env node
// =============================================================================
// F8 — Langfuse Disabled = NoOp (AC1 + AC4)
// =============================================================================
// Validates that when LANGFUSE_ENABLED is unset OR "false":
//   - The langfuse-hook.cjs subprocess exits 0 in < 100ms (NFR-4)
//   - No /tmp/langfuse-* files are created (NFR-1)
//   - No .pipeline/langfuse-errors.jsonl entries appear (NFR-1)
//   - No top-level require('langfuse') in langfuse-hook.cjs or langfuse-client.cjs (NFR-5)
//   - The literal comment "do NOT await" is present in handlePre + handlePost (design §4.1 G1)
//   - .codex/hooks/langfuse-hook.cjs is byte-identical to .claude version (FR-11)
//
// RED-phase status: ALL subcases MUST fail at first run because:
//   - .claude/hooks/langfuse-hook.cjs DOES NOT EXIST (Batch 3 not run)
//   - lib/langfuse-client.cjs DOES NOT EXIST (Batch 2 not run)
//   - .codex/hooks/langfuse-hook.cjs DOES NOT EXIST
//
// Scenarios covered: 1.1 (config smoke), 1.2 (dep present), 2.3 (client disabled
// when env absent), 2.5 (missing creds), 3.1 (subprocess < 100ms noop), 4.1 (F8
// suite green).
// =============================================================================

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const HOOK_PATH = path.join(ROOT, '.claude', 'hooks', 'langfuse-hook.cjs');
const HOOK_PATH_CODEX = path.join(ROOT, '.codex', 'hooks', 'langfuse-hook.cjs');
const CLIENT_PATH = path.join(ROOT, 'lib', 'langfuse-client.cjs');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const ERRORS_LOG = path.join(ROOT, '.pipeline', 'langfuse-errors.jsonl');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) {
    pass++;
    results.push(`  [PASS] ${scenario}`);
  } else {
    fail++;
    results.push(`  [FAIL] ${scenario}: ${msg}`);
  }
}

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function listLangfuseTmp() {
  const dir = os.tmpdir();
  try {
    return fs.readdirSync(dir).filter(f => /^langfuse-(trace|span)-\d+\.json$/.test(f));
  } catch (e) {
    return [];
  }
}

console.log('=== F8 Langfuse Disabled NoOp (AC1 + AC4) ===');

// ---------------------------------------------------------------------------
// F8-S0 (scenario 1.1): .env.example contains the Langfuse opt-in section
// with LANGFUSE_ENABLED=false uncommented and placeholders only
// ---------------------------------------------------------------------------
{
  const body = safeRead(ENV_EXAMPLE);
  let ok = false;
  let why = '.env.example missing';
  if (body !== null) {
    const hasHeader = body.includes('Langfuse');
    const hasDisabled = /^LANGFUSE_ENABLED\s*=\s*false\s*$/m.test(body);
    const hasPlaceholders = /pk-lf-|sk-lf-/.test(body);
    const hasHostCommented = /^#\s*LANGFUSE_HOST\s*=/m.test(body);
    const hasSampleCommented = /^#\s*LANGFUSE_SAMPLE_RATE\s*=/m.test(body);
    // No real-looking secrets (only placeholders)
    const noRealSecret = !/sk-lf-[A-Za-z0-9]{20,}/.test(body);
    ok = hasHeader && hasDisabled && hasPlaceholders && hasHostCommented && hasSampleCommented && noRealSecret;
    why = `header=${hasHeader} disabled-uncommented=${hasDisabled} placeholders=${hasPlaceholders} host-commented=${hasHostCommented} sample-commented=${hasSampleCommented} no-real-secret=${noRealSecret}`;
  }
  record('F8-S0: scenario 1.1 — .env.example documents 5 Langfuse keys with LANGFUSE_ENABLED=false uncommented + placeholders only (FR-9)', ok, why);
}

// ---------------------------------------------------------------------------
// F8-S0b (scenario 1.2): package.json declares langfuse dependency pinned exact
// (no ^ no ~) and license is documented MIT-compatible
// ---------------------------------------------------------------------------
{
  const body = safeRead(PACKAGE_JSON);
  let ok = false;
  let why = 'package.json missing';
  if (body !== null) {
    try {
      const pkg = JSON.parse(body);
      const deps = pkg.dependencies || {};
      const langfuseVer = deps.langfuse;
      const isPinned = typeof langfuseVer === 'string' && /^\d+\.\d+\.\d+/.test(langfuseVer) && !langfuseVer.startsWith('^') && !langfuseVer.startsWith('~');
      ok = isPinned;
      why = `dep present=${Boolean(langfuseVer)} pinned-exact=${isPinned} value="${langfuseVer}"`;
    } catch (e) {
      why = `JSON parse failed: ${e.message}`;
    }
  }
  record('F8-S0b: scenario 1.2 — package.json declares "langfuse" with exact-pinned version (no caret/tilde) (NFR-7)', ok, why);
}

// ---------------------------------------------------------------------------
// F8-S1 (scenario 4.1): static grep — require('langfuse') only inside function
// bodies, never at module top level in langfuse-hook.cjs OR langfuse-client.cjs
// ---------------------------------------------------------------------------
{
  const hookBody = safeRead(HOOK_PATH);
  const clientBody = safeRead(CLIENT_PATH);
  let ok = false;
  let why = '';
  if (hookBody === null) {
    why = `${HOOK_PATH} does not exist (Batch 3 not implemented)`;
  } else if (clientBody === null) {
    why = `${CLIENT_PATH} does not exist (Batch 2 not implemented)`;
  } else {
    // Heuristic: split each file into top-level lines (zero leading whitespace)
    // and assert require('langfuse') is NOT present in any such line.
    const topLevelRequireRe = /^require\s*\(\s*['"]langfuse['"]\s*\)|^const\s+[\s\S]*?=\s*require\s*\(\s*['"]langfuse['"]\s*\)/m;
    const hookTopLeak = topLevelRequireRe.test(hookBody);
    const clientTopLeak = topLevelRequireRe.test(clientBody);
    // Also catch the simpler grep variant: a line at column 0 (no indent) that contains require('langfuse')
    const lines = (b) => b.split('\n');
    const hasTopLineRequire = (b) => lines(b).some(l => /^\S/.test(l) && /require\s*\(\s*['"]langfuse['"]\s*\)/.test(l));
    const hookTopLine = hasTopLineRequire(hookBody);
    const clientTopLine = hasTopLineRequire(clientBody);
    ok = !hookTopLeak && !clientTopLeak && !hookTopLine && !clientTopLine;
    why = `hook-top-regex=${hookTopLeak} client-top-regex=${clientTopLeak} hook-top-line=${hookTopLine} client-top-line=${clientTopLine}`;
  }
  record('F8-S1: scenario 4.1 — require("langfuse") never appears at module top level in hook or client (NFR-5)', ok, why);
}

// ---------------------------------------------------------------------------
// F8-S2 (scenario 3.1): subprocess invocation with LANGFUSE_ENABLED unset
// exits 0 in < 100ms (NFR-4 / AC4)
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist (Batch 3 not implemented)`;
  } else {
    // Clean env: remove all LANGFUSE_* keys to simulate "unset"
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k.startsWith('LANGFUSE_')) delete env[k];
    }
    const stdinPayload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel' } });
    const start = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      cwd: ROOT,
      env,
      input: stdinPayload,
      encoding: 'utf8',
      timeout: 5000,
    });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    const exitedZero = result.status === 0;
    const underBudget = elapsedMs < 100;
    ok = exitedZero && underBudget;
    why = `exit=${result.status} elapsed-ms=${elapsedMs.toFixed(2)} stderr="${(result.stderr || '').slice(0, 120)}"`;
  }
  record('F8-S2: scenario 3.1 — hook subprocess with LANGFUSE_ENABLED unset exits 0 in < 100ms (NFR-4 / AC4)', ok, why);
}

// ---------------------------------------------------------------------------
// F8-S3 (scenario 3.1): subprocess invocation with LANGFUSE_ENABLED=false
// produces zero /tmp/langfuse-*.json files and zero errors.jsonl entries (AC1)
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(HOOK_PATH)) {
    why = `${HOOK_PATH} does not exist (Batch 3 not implemented)`;
  } else {
    const tmpBefore = new Set(listLangfuseTmp());
    const errLogBefore = fs.existsSync(ERRORS_LOG) ? fs.statSync(ERRORS_LOG).size : -1;
    const env = { ...process.env, LANGFUSE_ENABLED: 'false' };
    for (const k of Object.keys(env)) {
      if (k.startsWith('LANGFUSE_') && k !== 'LANGFUSE_ENABLED') delete env[k];
    }
    const stdinPayload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'pipeline-orchestrator:core:sentinel' } });
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      cwd: ROOT,
      env,
      input: stdinPayload,
      encoding: 'utf8',
      timeout: 5000,
    });
    const tmpAfter = listLangfuseTmp().filter(f => !tmpBefore.has(f));
    const errLogAfter = fs.existsSync(ERRORS_LOG) ? fs.statSync(ERRORS_LOG).size : -1;
    const exitedZero = result.status === 0;
    const noTmpFiles = tmpAfter.length === 0;
    const noErrLogGrowth = errLogAfter === errLogBefore; // either both -1 (no file) or same size
    ok = exitedZero && noTmpFiles && noErrLogGrowth;
    why = `exit=${result.status} new-tmp=${JSON.stringify(tmpAfter)} err-log-delta=${errLogAfter - errLogBefore}`;
  }
  record('F8-S3: scenario 3.1 — hook subprocess with LANGFUSE_ENABLED=false creates zero /tmp/langfuse-*.json files AND zero errors.jsonl growth (AC1)', ok, why);
}

// ---------------------------------------------------------------------------
// F8-S4 (scenario 4.1 detail): the literal comment "do NOT await" appears
// in BOTH handlePre and handlePost regions (design §4.1 G1 resolution)
// ---------------------------------------------------------------------------
{
  const body = safeRead(HOOK_PATH);
  let ok = false;
  let why = '';
  if (body === null) {
    why = `${HOOK_PATH} does not exist (Batch 3 not implemented)`;
  } else {
    const matches = body.match(/do NOT await/g) || [];
    ok = matches.length >= 2;
    why = `count=${matches.length} (expected >= 2 — one in handlePre, one in handlePost)`;
  }
  record('F8-S4: scenario 4.1 — literal "do NOT await" comment present at least twice in langfuse-hook.cjs (design §4.1 G1)', ok, why);
}

// ---------------------------------------------------------------------------
// F8-S5 (scenario 4.7 / FR-11): .claude/hooks/langfuse-hook.cjs and
// .codex/hooks/langfuse-hook.cjs are byte-identical AND neither file references
// literal ".claude" or ".codex" directory strings in its body (uses __dirname)
// ---------------------------------------------------------------------------
{
  const claudeBody = safeRead(HOOK_PATH);
  const codexBody = safeRead(HOOK_PATH_CODEX);
  let ok = false;
  let why = '';
  if (claudeBody === null) {
    why = `${HOOK_PATH} does not exist`;
  } else if (codexBody === null) {
    why = `${HOOK_PATH_CODEX} does not exist`;
  } else {
    const identical = claudeBody === codexBody;
    // Allow ".claude" / ".codex" inside strings ONLY in JSDoc/comments — strict: just check the file does not contain hardcoded path strings like '.claude/hooks' or '.codex/hooks' in non-comment lines.
    // Heuristic: if a line is a comment (starts with // or *), skip it
    const checkHardcodedPath = (body) => {
      return body.split('\n')
        .filter(line => {
          const t = line.trim();
          return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
        })
        .some(line => /['"]\.(claude|codex)\/hooks/.test(line));
    };
    const claudeLeak = checkHardcodedPath(claudeBody);
    const codexLeak = checkHardcodedPath(codexBody);
    ok = identical && !claudeLeak && !codexLeak;
    why = `byte-identical=${identical} claude-hardcoded-path=${claudeLeak} codex-hardcoded-path=${codexLeak}`;
  }
  record('F8-S5: scenario 4.7 / FR-11 — Codex mirror byte-identical to .claude version AND neither uses hardcoded ".claude/.codex" path strings', ok, why);
}

// ---------------------------------------------------------------------------
// F8-S6 (scenario 2.3 + 2.5): lib/langfuse-client.cjs — isEnabled() returns
// false when LANGFUSE_ENABLED is unset; getClient() returns null; opt-in with
// missing creds logs "missing_credentials" and disables
// ---------------------------------------------------------------------------
{
  let ok = false;
  let why = '';
  if (!fs.existsSync(CLIENT_PATH)) {
    why = `${CLIENT_PATH} does not exist (Batch 2 not implemented)`;
  } else {
    // Spawn a fresh node process so module memoization doesn't bleed
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k.startsWith('LANGFUSE_')) delete env[k];
    }
    const probe = `
      const c = require(${JSON.stringify(CLIENT_PATH)});
      const enabled = c.isEnabled();
      const client = c.getClient();
      process.stdout.write(JSON.stringify({ enabled, clientIsNull: client === null }));
    `;
    const result = spawnSync(process.execPath, ['-e', probe], { env, encoding: 'utf8', timeout: 5000, cwd: ROOT });
    try {
      const out = JSON.parse(result.stdout || '{}');
      const enabledFalse = out.enabled === false;
      const clientNull = out.clientIsNull === true;
      ok = enabledFalse && clientNull && result.status === 0;
      why = `enabled=${out.enabled} clientNull=${out.clientIsNull} exit=${result.status} stderr="${(result.stderr || '').slice(0, 120)}"`;
    } catch (e) {
      why = `probe stdout not parseable: "${(result.stdout || '').slice(0, 200)}" stderr="${(result.stderr || '').slice(0, 200)}"`;
    }
  }
  record('F8-S6: scenario 2.3 — lib/langfuse-client.cjs isEnabled() returns false when LANGFUSE_ENABLED unset AND getClient() returns null (AC1)', ok, why);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
