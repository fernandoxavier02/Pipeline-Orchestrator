#!/usr/bin/env node
// =============================================================================
// F18 — plan-architect.md plan-mode contract (v7.9.4 BUG 1)
// =============================================================================
// TDD RED-phase suite for the plan-mode contract fix in
// agents/quality/plan-architect.md. The file's PROCESS body contradicts its own
// Achado #7 RUNTIME PROTOCOL section at the top: Step 0 instructs "Call
// `EnterPlanMode` tool", Step 3 instructs "Use AskUserQuestion to present the
// plan", Step 4 instructs "Call `ExitPlanMode` tool", and the INTEGRATION footer
// advertises EnterPlanMode / ExitPlanMode / AskUserQuestion as "Tools required".
// All four tools are STRIPPED from the subagent runtime (Achado #7), so these
// instructions cause the documented silent fallback to inline planning (audit
// B5-001). The fix (T1-T3) rewrites Step 0/3/4 + the footer to emit
// PLAN_MODE_REQUEST / GATE_REQUEST blocks, aligning the body with the already-
// correct Achado #7 section — WITHOUT deleting the explanatory mentions of the
// stripped tools (which legitimately explain WHY they are stripped) and WITHOUT
// touching the USER INTERACTION PROTOCOL section (which describes the PARENT's
// job when it receives a GATE_REQUEST and is correct as-is).
//
// CONTRACT under test (from the approved IMPLEMENTATION_PLAN / 04-quality-gate):
//   PROCESS body:  no "Call `EnterPlanMode` tool" / "Call `ExitPlanMode` tool"
//                  / "Use AskUserQuestion to present the plan"
//   Step 0 body:   contains "PLAN_MODE_REQUEST"; does NOT contain "EnterPlanMode"
//   Step 3 body:   contains "GATE_REQUEST"
//   Step 4 body:   no "Call `ExitPlanMode` tool"
//   Tools footer:  the "Tools required:" line lists none of EnterPlanMode /
//                  ExitPlanMode / AskUserQuestion
//   PRESERVED:     Achado #7 section still has "=== PLAN_MODE_REQUEST v1 ==="
//                  and "NEVER write the plan inline"; USER INTERACTION PROTOCOL
//                  still mentions AskUserQuestion; EnterPlanMode still exists
//                  SOMEWHERE in the file (Achado #7 explanatory).
//
// RED-phase expectation (against CURRENT code, pre-fix):
//   FAIL now: S1 S3 S4 S5  (buggy instructional strings still present), and
//             S2          (Step 0 lacks PLAN_MODE_REQUEST — still the EnterPlanMode call).
//   PASS now: S6 S7 S8    (they assert PRESERVED content that the fix must not
//                          break; S8's "NOT in Step 0 body" half also passes
//                          today because today's Step 0 says "EnterPlanMode"
//                          NOT inside a fenced block — see S8 note). [See per-
//                          scenario note: S8 is expected to FAIL pre-fix because
//                          EnterPlanMode currently DOES appear in the Step 0 body.]
//
// Section extraction is heading-anchored (NOT line numbers) so the fix may shift
// lines freely. Harness mold mirrors F15/F17: record()/pass/fail/results,
// safeRead, process.exit. Auto-discovered by scripts/run-tests.cjs (v7.9.4
// matches the semver glob).
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AGENT_PATH = path.join(ROOT, 'agents', 'quality', 'plan-architect.md');

let pass = 0;
let fail = 0;
const results = [];

function record(scenario, ok, msg) {
  if (ok) { pass++; results.push(`  [PASS] ${scenario}`); }
  else { fail++; results.push(`  [FAIL] ${scenario}: ${msg}`); }
}

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; } }

// ---------------------------------------------------------------------------
// Heading-anchored section extraction. Returns the body text between a heading
// whose text matches `startRe` and the NEXT heading at the same-or-shallower
// markdown level (so a "### Step 0" body ends at the next "### " or "## ", and a
// "## PROCESS" body ends at the next "## "). Line-number-free: survives the fix.
//
// FENCE-AWARE (TEST-1 fix): heading detection is suppressed while inside a code
// fence. Step 2's IMPLEMENTATION_PLAN template embeds a ```markdown block whose
// content includes a literal "## IMPLEMENTATION PLAN" line; without fence
// tracking that line is mistaken for a real level-2 heading and prematurely ends
// the PROCESS body BEFORE Step 3/4, blinding the PROCESS-wide negative assertion
// (F18-S1) to a re-introduced "Call `EnterPlanMode` tool" in Step 3 or Step 4. We
// toggle an in-fence flag on any line whose trimmed start is a fence marker
// (``` or ~~~, with optional info string) and ignore headings while inFence.
// ---------------------------------------------------------------------------
function isFenceMarker(line) {
  return /^\s*(`{3,}|~{3,})/.test(line);
}

function sectionBody(content, startRe, opts) {
  opts = opts || {};
  const lines = content.split(/\r?\n/);
  let startIdx = -1;
  let startLevel = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceMarker(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = lines[i].match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (m && startRe.test(m[2])) { startIdx = i; startLevel = m[1].length; break; }
  }
  if (startIdx === -1) return null;
  let endIdx = lines.length;
  inFence = false;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (isFenceMarker(lines[j])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = lines[j].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= startLevel) { endIdx = j; break; }
  }
  const includeHeading = opts.includeHeading === true;
  return lines.slice(includeHeading ? startIdx : startIdx + 1, endIdx).join('\n');
}

// Extract the single line that begins (after optional list markers) with
// "**Tools required:**" or "Tools required:" — the INTEGRATION footer line.
function toolsRequiredLine(content) {
  const lines = content.split(/\r?\n/);
  for (const ln of lines) {
    if (/Tools required:/i.test(ln)) return ln;
  }
  return null;
}

const content = safeRead(AGENT_PATH);

console.log('=== F18 plan-architect.md plan-mode contract ===');

if (content === null) {
  record('F18 — file readable', false, `${AGENT_PATH} missing/unreadable`);
} else {
  // Pre-extract the sections used by multiple scenarios.
  const processBody = sectionBody(content, /^PROCESS\b/);
  const step0Body = sectionBody(content, /^Step 0\b/);
  const step3Body = sectionBody(content, /^Step 3\b/);
  const step4Body = sectionBody(content, /^Step 4\b/);
  const achado7 = sectionBody(content, /^ACHADO #7 RUNTIME PROTOCOL\b/);
  const userProto = sectionBody(content, /^USER INTERACTION PROTOCOL\b/);
  const toolsLine = toolsRequiredLine(content);

  // =========================================================================
  // S1 (main) — Step 0 no longer instructs calling EnterPlanMode.
  // PROCESS body must NOT contain "Call `EnterPlanMode` tool".
  // =========================================================================
  {
    let ok = false, why = '';
    if (processBody === null) { why = 'PROCESS section not found by heading anchor'; }
    else {
      const present = processBody.includes('Call `EnterPlanMode` tool');
      ok = !present;
      why = `"Call EnterPlanMode tool" present in PROCESS body=${present} (want false)`;
    }
    record('F18-S1: main — PROCESS body has NO "Call EnterPlanMode tool"', ok, why);
  }

  // =========================================================================
  // S2 (main) — Step 0 instructs emitting PLAN_MODE_REQUEST.
  // =========================================================================
  {
    let ok = false, why = '';
    if (step0Body === null) { why = '### Step 0 section not found by heading anchor'; }
    else {
      const present = step0Body.includes('PLAN_MODE_REQUEST');
      ok = present;
      why = `'PLAN_MODE_REQUEST' present in Step 0 body=${present} (want true)`;
    }
    record('F18-S2: main — Step 0 body contains "PLAN_MODE_REQUEST"', ok, why);
  }

  // =========================================================================
  // S3 (main) — Step 3 emits GATE_REQUEST, not AskUserQuestion direct call.
  // =========================================================================
  {
    let ok = false, why = '';
    if (step3Body === null) { why = '### Step 3 section not found by heading anchor'; }
    else {
      const askPresent = step3Body.includes('Use AskUserQuestion to present the plan');
      const gatePresent = step3Body.includes('GATE_REQUEST');
      ok = !askPresent && gatePresent;
      why = `askUQ present=${askPresent} (want false), GATE_REQUEST present=${gatePresent} (want true)`;
    }
    record('F18-S3: main — Step 3 drops AskUserQuestion call, adds GATE_REQUEST', ok, why);
  }

  // =========================================================================
  // S4 (main) — Tools required footer no longer lists stripped tools.
  // =========================================================================
  {
    let ok = false, why = '';
    if (toolsLine === null) { why = '"Tools required:" line not found in INTEGRATION footer'; }
    else {
      const enter = toolsLine.includes('EnterPlanMode');
      const exit = toolsLine.includes('ExitPlanMode');
      const ask = toolsLine.includes('AskUserQuestion');
      ok = !enter && !exit && !ask;
      why = `Tools line has EnterPlanMode=${enter} ExitPlanMode=${exit} AskUserQuestion=${ask} (want all false) | line="${toolsLine.trim()}"`;
    }
    record('F18-S4: main — Tools required line excludes EnterPlanMode/ExitPlanMode/AskUserQuestion', ok, why);
  }

  // =========================================================================
  // S5 (main) — Step 4 no longer instructs calling ExitPlanMode.
  // =========================================================================
  {
    let ok = false, why = '';
    if (step4Body === null) { why = '### Step 4 section not found by heading anchor'; }
    else {
      const present = step4Body.includes('Call `ExitPlanMode` tool');
      ok = !present;
      why = `"Call ExitPlanMode tool" present in Step 4 body=${present} (want false)`;
    }
    record('F18-S5: main — Step 4 body has NO "Call ExitPlanMode tool"', ok, why);
  }

  // =========================================================================
  // S6 (regression) — Achado #7 top section preserved (anti-overcorrection).
  // =========================================================================
  {
    let ok = false, why = '';
    if (achado7 === null) { why = 'ACHADO #7 RUNTIME PROTOCOL section not found'; }
    else {
      const blockPresent = achado7.includes('=== PLAN_MODE_REQUEST v1 ===');
      const neverInline = achado7.includes('NEVER write the plan inline');
      ok = blockPresent && neverInline;
      why = `'=== PLAN_MODE_REQUEST v1 ===' present=${blockPresent}, 'NEVER write the plan inline' present=${neverInline} (want both true)`;
    }
    record('F18-S6: regression — Achado #7 section preserved (block + "NEVER write the plan inline")', ok, why);
  }

  // =========================================================================
  // S7 (regression) — USER INTERACTION PROTOCOL section untouched (parent
  // handler — keeps AskUserQuestion legitimately).
  // =========================================================================
  {
    let ok = false, why = '';
    if (userProto === null) { why = 'USER INTERACTION PROTOCOL section not found'; }
    else {
      const present = userProto.includes('AskUserQuestion');
      ok = present;
      why = `'AskUserQuestion' present in USER INTERACTION PROTOCOL=${present} (want true — parent handler)`;
    }
    record('F18-S7: regression — USER INTERACTION PROTOCOL still mentions AskUserQuestion', ok, why);
  }

  // =========================================================================
  // S8 (edge) — EnterPlanMode survives globally (Achado #7 explanatory) but
  // is ABSENT from the ### Step 0 body. A naive replace-all would delete the
  // correct explanatory occurrences; the fix must distinguish position.
  // =========================================================================
  {
    let ok = false, why = '';
    const globalPresent = content.includes('EnterPlanMode');
    if (step0Body === null) { why = '### Step 0 section not found by heading anchor'; }
    else {
      const inStep0 = step0Body.includes('EnterPlanMode');
      ok = globalPresent && !inStep0;
      why = `EnterPlanMode global=${globalPresent} (want true), in Step 0 body=${inStep0} (want false)`;
    }
    record('F18-S8: edge — EnterPlanMode exists globally but NOT inside Step 0 body', ok, why);
  }
}

// ---------------------------------------------------------------------------
console.log(results.join('\n'));
console.log(`\nF18 — plan-architect plan-mode contract: ${pass}/${pass + fail}`);
console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
