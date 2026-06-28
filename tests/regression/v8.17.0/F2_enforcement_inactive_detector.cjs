#!/usr/bin/env node
'use strict';

// =============================================================================
// F2 — v8.17.0 — AUDIT-004 — ENFORCEMENT_INACTIVE detector
// =============================================================================
// A new lib module `lib/enforcement-status.cjs` exports `detectEnforcementStatus`
// that probes whether the canonical execution-gate hook is present in the
// active install's hooks folder. When absent, the result carries the event
// name `ENFORCEMENT_INACTIVE` with severity `HIGH`. When present, the result
// reports `active`.
//
// Also: `lib/contracts/e2e-eval.cjs::HYGIENE_EVENT_SEVERITY` MUST contain
// `ENFORCEMENT_INACTIVE: 1.0` so the e2e-evaluator's ProcessHygiene applies
// the right weight when this event lands in protocol-events.jsonl.
//
// Edge cases (Scenario 5): missing hooks dir -> soft-fail, returns
// inactive + ENFORCEMENT_INACTIVE; NEVER throws.
// =============================================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

let failures = 0;
function check(label, cond) {
  if (!cond) { failures++; console.log(`FAIL | ${label}`); }
  else console.log(`OK   | ${label}`);
}

// --- Existence + shape ------------------------------------------------------
let statusLib;
try { statusLib = require(path.join(ROOT, 'lib', 'enforcement-status.cjs')); }
catch (e) { statusLib = null; }
check('lib/enforcement-status.cjs is requireable', !!statusLib);
check('exports detectEnforcementStatus function',
  statusLib && typeof statusLib.detectEnforcementStatus === 'function');

// --- Case 1: hook present -> active ----------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-status-'));
  const hooksDir = path.join(tmp, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(hooksDir, 'pipeline-arm-gate.cjs'), '// stub');
  const res = statusLib.detectEnforcementStatus({
    hooksDir, expectedCanonicalHook: 'pipeline-arm-gate.cjs',
  });
  check('Case1: hook present -> active=true', res && res.active === true);
  check('Case1: hook present -> event is null or omitted',
    !res.event || res.event !== 'ENFORCEMENT_INACTIVE');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// --- Case 2: hook ABSENT in existing hooks dir -> ENFORCEMENT_INACTIVE HIGH -
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-status-'));
  const hooksDir = path.join(tmp, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  // other hooks present, the canonical one is missing
  fs.writeFileSync(path.join(hooksDir, 'irrelevant.cjs'), '// stub');
  const res = statusLib.detectEnforcementStatus({
    hooksDir, expectedCanonicalHook: 'pipeline-arm-gate.cjs',
  });
  check('Case2: hook absent -> active=false', res && res.active === false);
  check('Case2: hook absent -> event=ENFORCEMENT_INACTIVE', res && res.event === 'ENFORCEMENT_INACTIVE');
  check('Case2: hook absent -> severity HIGH', res && res.severity === 'HIGH');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// --- Case 3 (scenario 5): hooks dir missing -> soft-fail, NEVER throws -----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f2-status-'));
  const hooksDir = path.join(tmp, 'does', 'not', 'exist');
  let threw = false;
  let res;
  try { res = statusLib.detectEnforcementStatus({ hooksDir, expectedCanonicalHook: 'pipeline-arm-gate.cjs' }); }
  catch (e) { threw = true; }
  check('Case3: missing hooks dir -> does not throw', !threw);
  check('Case3: missing hooks dir -> active=false', res && res.active === false);
  check('Case3: missing hooks dir -> event=ENFORCEMENT_INACTIVE', res && res.event === 'ENFORCEMENT_INACTIVE');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// --- Case 4: contract HYGIENE_EVENT_SEVERITY has ENFORCEMENT_INACTIVE = 1.0 -
{
  const C = require(path.join(ROOT, 'lib', 'contracts', 'e2e-eval.cjs'));
  check('Case4: HYGIENE_EVENT_SEVERITY.ENFORCEMENT_INACTIVE === 1.0',
    C.HYGIENE_EVENT_SEVERITY && C.HYGIENE_EVENT_SEVERITY.ENFORCEMENT_INACTIVE === 1.0);
  check('Case4: severityForEvent(ENFORCEMENT_INACTIVE) === 1.0',
    typeof C.severityForEvent === 'function' && C.severityForEvent('ENFORCEMENT_INACTIVE') === 1.0);
}

// --- Case 5: bad input is handled gracefully, never throws ------------------
{
  let threw = false; let res;
  try { res = statusLib.detectEnforcementStatus(); } catch (e) { threw = true; }
  check('Case5: undefined opts -> does not throw', !threw);
  check('Case5: undefined opts -> active=false', res && res.active === false);
}

process.exit(failures > 0 ? 1 : 0);
