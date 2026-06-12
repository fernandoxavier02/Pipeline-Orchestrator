#!/usr/bin/env node
// =============================================================================
// F34 — STEP 1.7 closed branch vocabulary + canonical mapping (v7.14.0 B0 → B1)
// =============================================================================
// The 2026-06-12 audit caught a STEP_1_7_ROUTING entry with an out-of-vocabulary
// value ("SKIPPED" written raw as the branch). This suite pins the new
// lib/step-1-7-routing.cjs (B1, does NOT exist yet -> RED) so the branch
// identity lives in a CLOSED set and maps to the existing 8-value canonical
// gate-decision vocabulary (D1) without inventing a 9th value.
//
// D1 canonical mapping (branch -> gate-decision `decision`):
//   dispatch-brainstorm -> DISPATCHED
//   load-existing       -> CONFIRMED
//   no-prep-override    -> SKIPPED
//   simples-bypass      -> NOT_TRIGGERED
// The branch identity itself is preserved verbatim in the `detail` field.
//
//   S1  module loads and exports appendStep17Routing + BRANCH_VALUES
//   S2  BRANCH_VALUES is the exact closed set of 4
//   S3  a raw out-of-vocabulary branch ("SKIPPED") throws TypeError
//   S4  each of the 4 valid branches is accepted (no throw)
//   S5  the canonical `decision` is the D1 mapping for each branch
//   S6  the branch identity appears in the `detail` field of the written entry
//   S7  an arbitrary garbage branch ("brainstorm-ish") throws TypeError
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
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'f34-'));
  _tmp.push(d);
  return d;
}

// Read back the gate-decisions.jsonl entries written by appendStep17Routing.
function entries(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch { return []; }
}

// Attempt to load the (not-yet-existing) module. A load failure is itself a
// legitimate RED state — every scenario records FAIL with the load error.
let mod = null; let loadErr = null;
try { mod = require(MOD); } catch (e) { loadErr = e; }

// ARCH-RR-1: pin the branch->canonical map to the REAL SSOT export instead of a
// local copy. A future wrong change to the module's BRANCH_TO_CANONICAL must now
// break this suite (it could pass against a stale local copy before). If the
// module fails to load or omits the export, CANONICAL stays empty and the
// scenarios below record FAIL via the loadErr/no-entry paths — never a silent
// green.
const CANONICAL = (mod && mod.BRANCH_TO_CANONICAL) ? mod.BRANCH_TO_CANONICAL : {};
const VALID_BRANCHES = Object.keys(CANONICAL);

console.log('=== F34 STEP 1.7 closed vocabulary + canonical mapping (v7.14.0 B0) ===');

// Build a ctx the writer can use (mirrors gate-decision-writer.buildCtx shape).
function makeCtx() {
  try {
    const { buildCtx } = require(path.join(ROOT, 'lib', 'gate-decision-writer.cjs'));
    return buildCtx('/tmp/2026-06-12-f34-run', { type: 'Feature', complexity: 'COMPLEXA' });
  } catch {
    return { run_id: 'f34-run', plugin_version: 'test', schema_version: '1', type: 'Feature', complexity: 'COMPLEXA' };
  }
}

// Helper: call appendStep17Routing for one branch, return {threw, entry}.
function callBranch(branch) {
  const dir = makeDir();
  const fp = path.join(dir, 'gate-decisions.jsonl');
  let threw = null;
  try {
    mod.appendStep17Routing(fp, {
      branch,
      prep_run_id: branch === 'dispatch-brainstorm' ? 'prep-001' : null,
      phase: '1.7',
      decided_by: 'pipeline-controller',
      timestamp: new Date().toISOString(),
    }, makeCtx());
  } catch (e) { threw = e; }
  const es = entries(fp);
  return { threw, entry: es[es.length - 1] || null };
}

// S1 — module loads with the expected exports
{
  const ok = !loadErr && mod && typeof mod.appendStep17Routing === 'function' && mod.BRANCH_VALUES;
  record('F34-S1: lib/step-1-7-routing.cjs loads + exports appendStep17Routing/BRANCH_VALUES', ok,
    loadErr ? `load error: ${loadErr.message}` : `exports=${mod ? Object.keys(mod).join(',') : '(none)'}`);
}

// S2 — BRANCH_VALUES is exactly the closed set of 4
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && mod.BRANCH_VALUES) {
    const got = Array.from(mod.BRANCH_VALUES).sort();
    const want = VALID_BRANCHES.slice().sort();
    ok = got.length === want.length && got.every((v, i) => v === want[i]);
    why = `got=${got.join(',')}`;
  }
  record('F34-S2: BRANCH_VALUES is the exact closed set of 4', ok, why);
}

// S3 — raw out-of-vocabulary branch "SKIPPED" throws TypeError
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.appendStep17Routing === 'function') {
    const { threw } = callBranch('SKIPPED');
    ok = !!threw && threw instanceof TypeError;
    why = threw ? `threw ${threw.constructor.name}` : 'did NOT throw';
  }
  record('F34-S3: raw "SKIPPED" branch (canonical value, not a branch) throws TypeError', ok, why);
}

// S4 — each of the 4 valid branches is accepted (no throw)
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  // ARCH-RR-1: require the real SSOT map to be present + non-empty so a missing
  // BRANCH_TO_CANONICAL export can never produce a vacuous (empty-loop) pass.
  if (mod && typeof mod.appendStep17Routing === 'function' && VALID_BRANCHES.length === 4) {
    const results = VALID_BRANCHES.map((b) => callBranch(b));
    ok = results.every((r) => r.threw === null);
    why = results.map((r, i) => `${VALID_BRANCHES[i]}:${r.threw ? 'threw' : 'ok'}`).join(' ');
  }
  record('F34-S4: all 4 valid branches accepted (no throw)', ok, why);
}

// S5 — canonical `decision` matches the D1 mapping for each branch
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.appendStep17Routing === 'function' && VALID_BRANCHES.length === 4) {
    const checks = VALID_BRANCHES.map((b) => {
      const { entry } = callBranch(b);
      return entry && entry.decision === CANONICAL[b];
    });
    ok = checks.every(Boolean);
    why = VALID_BRANCHES.map((b) => {
      const { entry } = callBranch(b);
      return `${b}->${entry ? entry.decision : 'NO-ENTRY'} (want ${CANONICAL[b]})`;
    }).join('; ');
  }
  record('F34-S5: canonical decision matches D1 mapping per branch', ok, why);
}

// S6 — branch identity appears verbatim in the `detail` field
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.appendStep17Routing === 'function' && VALID_BRANCHES.length === 4) {
    const checks = VALID_BRANCHES.map((b) => {
      const { entry } = callBranch(b);
      return entry && typeof entry.detail === 'string' && entry.detail.includes(b);
    });
    ok = checks.every(Boolean);
    why = VALID_BRANCHES.map((b) => {
      const { entry } = callBranch(b);
      return `${b}:detail=${entry ? JSON.stringify(entry.detail) : 'NO-ENTRY'}`;
    }).join('; ');
  }
  record('F34-S6: branch identity preserved in detail field', ok, why);
}

// S7 — arbitrary garbage branch throws TypeError
{
  let ok = false; let why = loadErr ? `load error: ${loadErr.message}` : '';
  if (mod && typeof mod.appendStep17Routing === 'function') {
    const { threw } = callBranch('brainstorm-ish');
    ok = !!threw && threw instanceof TypeError;
    why = threw ? `threw ${threw.constructor.name}` : 'did NOT throw';
  }
  record('F34-S7: arbitrary garbage branch throws TypeError', ok, why);
}

for (const d of _tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* */ } }
for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
