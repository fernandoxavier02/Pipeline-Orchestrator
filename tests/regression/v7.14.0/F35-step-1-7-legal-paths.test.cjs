#!/usr/bin/env node
// =============================================================================
// F35 — STEP 1.7 legal escape paths not regressed (v7.14.0 B0 → B1)
// =============================================================================
// STEP 1.7 has two LEGAL ways to NOT run a brainstorm:
//   (a) --no-prep override: the user explicitly opts out -> branch
//       `no-prep-override` is recorded AND an audit entry is appended to
//       .pipeline/state/no-prep-overrides.jsonl (so an opt-out is never silent).
//   (b) SIMPLES classification: brainstorm is not applicable -> branch
//       `simples-bypass`.
// This suite pins those legal paths against the new lib/step-1-7-routing.cjs
// (B1, does NOT exist yet -> RED). Enforcement must NOT punish a legal opt-out:
// both paths flow through the SAME closed vocabulary, so the bypass hook (F33)
// sees a valid step_1_7 block and emits ZERO BRAINSTORM_BYPASS.
//
//   S1  module exports recordNoPrepOverride (or appendStep17Routing handles it)
//   S2  --no-prep path -> branch no-prep-override accepted, decision SKIPPED
//   S3  --no-prep path -> an entry is appended to no-prep-overrides.jsonl
//   S4  the no-prep audit entry carries the run/branch context (not empty)
//   S5  SIMPLES path -> branch simples-bypass accepted, decision NOT_TRIGGERED
//   S6  a no-prep state block built by the helper is shaped for the sentinel
//       (decision == 'no-prep-override') so the F33 hook treats it as valid
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MOD = path.join(ROOT, 'lib', 'step-1-7-routing.cjs');

let pass = 0; let fail = 0; const out = [];
function record(name, ok, why) {
  if (ok) { pass++; out.push(`  [PASS] ${name}`); }
  else { fail++; out.push(`  [FAIL] ${name}: ${why}`); }
}

const _tmp = [];
function makeDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f35-'));
  _tmp.push(d);
  return d;
}

function readJsonl(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch { return []; }
}

console.log('=== F35 STEP 1.7 legal escape paths not regressed (v7.14.0 B0) ===');

let mod = null; let loadErr = null;
try { mod = require(MOD); } catch (e) { loadErr = e; }

function makeCtx(runId) {
  try {
    const { buildCtx } = require(path.join(ROOT, 'lib', 'gate-decision-writer.cjs'));
    return buildCtx(`/tmp/${runId}`, { type: 'Feature', complexity: 'MEDIA' });
  } catch {
    return { run_id: runId, plugin_version: 'test', schema_version: '1', type: 'Feature', complexity: 'MEDIA' };
  }
}

// S1 — the dedicated no-prep override recorder is exported. DEAD-1/TEST-2: assert
// recordNoPrepOverride directly (not the weaker "recorder OR appendStep17Routing"
// disjunction). The contract is that recordNoPrepOverride is the SSOT for the
// no-prep audit line; a missing export must fail LOUDLY here rather than silently
// fall through to a non-existent appendStep17Routing overrides_path side effect.
{
  const ok = !loadErr && !!mod && typeof mod.recordNoPrepOverride === 'function';
  record('F35-S1: module exports recordNoPrepOverride (the no-prep audit SSOT)', ok,
    loadErr ? `load error: ${loadErr.message}` : `exports=${mod ? Object.keys(mod).join(',') : '(none)'}`);
}

// S2 — --no-prep path: branch no-prep-override accepted, gate decision SKIPPED
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.appendStep17Routing === 'function') {
    const dir = makeDir();
    const fp = path.join(dir, 'gate-decisions.jsonl');
    let threw = null;
    try {
      mod.appendStep17Routing(fp, {
        branch: 'no-prep-override', prep_run_id: null, phase: '1.7',
        decided_by: 'pipeline-controller', timestamp: new Date().toISOString(),
      }, makeCtx('2026-06-12-noprep'));
    } catch (e) { threw = e; }
    const es = readJsonl(fp);
    const last = es[es.length - 1];
    ok = threw === null && last && last.decision === 'SKIPPED';
    why = threw ? `threw ${threw.message}` : `decision=${last ? last.decision : 'NO-ENTRY'}`;
  }
  record('F35-S2: --no-prep -> branch no-prep-override accepted, decision SKIPPED', ok, why);
}

// S3 — --no-prep path appends an entry to no-prep-overrides.jsonl
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.recordNoPrepOverride === 'function') {
    const stateDir = makeDir(); // stands in for .pipeline/state/
    const overridesPath = path.join(stateDir, 'no-prep-overrides.jsonl');
    const ctx = makeCtx('2026-06-12-noprep-audit');
    let threw = null;
    try {
      mod.recordNoPrepOverride(overridesPath, { reason: 'user passed --no-prep', decided_by: 'pipeline-controller', timestamp: new Date().toISOString() }, ctx);
    } catch (e) { threw = e; }
    const lines = readJsonl(overridesPath);
    ok = threw === null && lines.length >= 1;
    why = threw ? `threw ${threw.message}` : `overrides lines=${lines.length}`;
  }
  record('F35-S3: --no-prep appends an entry to no-prep-overrides.jsonl', ok, why);
}

// S4 — the no-prep audit entry carries context (run_id or branch, not empty)
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.recordNoPrepOverride === 'function') {
    const stateDir = makeDir();
    const overridesPath = path.join(stateDir, 'no-prep-overrides.jsonl');
    const ctx = makeCtx('2026-06-12-noprep-ctx');
    try {
      mod.recordNoPrepOverride(overridesPath, { reason: 'user passed --no-prep', decided_by: 'pipeline-controller', timestamp: new Date().toISOString() }, ctx);
    } catch (_e) { /* recorded as fail below */ }
    const lines = readJsonl(overridesPath);
    const e = lines[lines.length - 1];
    ok = !!e && (typeof e.run_id === 'string' && e.run_id.length > 0
      || (typeof e.branch === 'string' && e.branch.includes('no-prep'))
      || (typeof e.reason === 'string' && e.reason.length > 0));
    why = e ? `entry=${JSON.stringify(e).slice(0, 80)}` : 'no entry written';
  }
  record('F35-S4: no-prep audit entry carries run/branch/reason context', ok, why);
}

// S5 — SIMPLES path: branch simples-bypass accepted, decision NOT_TRIGGERED
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.appendStep17Routing === 'function') {
    const dir = makeDir();
    const fp = path.join(dir, 'gate-decisions.jsonl');
    let threw = null;
    try {
      mod.appendStep17Routing(fp, {
        branch: 'simples-bypass', prep_run_id: null, phase: '1.7',
        decided_by: 'pipeline-controller', timestamp: new Date().toISOString(),
      }, makeCtx('2026-06-12-simples'));
    } catch (e) { threw = e; }
    const es = readJsonl(fp);
    const last = es[es.length - 1];
    ok = threw === null && last && last.decision === 'NOT_TRIGGERED';
    why = threw ? `threw ${threw.message}` : `decision=${last ? last.decision : 'NO-ENTRY'}`;
  }
  record('F35-S5: SIMPLES -> branch simples-bypass accepted, decision NOT_TRIGGERED', ok, why);
}

// S6 — buildStep17StateBlock yields a sentinel block the F33 hook treats as valid
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.buildStep17StateBlock === 'function') {
    let block = null; let threw = null;
    try { block = mod.buildStep17StateBlock('no-prep-override', null); } catch (e) { threw = e; }
    ok = !threw && block && block.decision === 'no-prep-override';
    why = threw ? `threw ${threw.message}` : `block=${JSON.stringify(block)}`;
  } else {
    why = loadErr ? why : 'buildStep17StateBlock not exported';
  }
  record('F35-S6: buildStep17StateBlock produces a valid sentinel step_1_7 block', ok, why);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
