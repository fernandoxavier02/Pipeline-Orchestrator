'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// ============================================================================
// Patch 4 — --strict-spec flag (Phase 0 hardening)
//
// ATDD / BDD scenario:
//
//   GIVEN the user invokes the pipeline in unattended / CI mode
//     AND a feature directory under <spec_path>/ matches the loose prose
//         regex `/valida.*spec|implementa.*spec|fech[ae].*spec/i`
//     BUT there is no explicit --type=spec flag or path argument (Signal 1
//         or Signal 2)
//   WHEN the --strict-spec flag is present in the pipeline arguments
//   THEN the task-orchestrator REJECTS Signal 3 (prose regex) and Signal 4
//        (glob fallback) — the only Spec detection paths that survive are
//        Signal 1 (explicit path) and Signal 2 (--type=spec flag)
//     AND the orchestrator emits a warning in the ORCHESTRATOR_DECISION
//        notes field documenting the rejection
//     AND the request falls through to non-Spec type classification (Bug
//        Fix / Feature / etc.) per the standard tiebreaker priority
//
// Why this matters: Signal 3 / Signal 4 require user confirmation via
// AskUserQuestion. In unattended CI / automation contexts, AskUserQuestion
// either fails outright or selects the default — risking silent
// misclassification of a task as Spec when it shouldn't be.
//
// DDD bounded context: the flag is parsed at the controller boundary
// (entry-point authority). task-orchestrator only consumes the
// STRICT_SPEC=true prefix; no flag parsing leaks into the classifier
// itself.
// ============================================================================

const PC = fs.readFileSync('agents/core/pipeline-controller.md', 'utf8');
const TO = fs.readFileSync('agents/core/task-orchestrator.md', 'utf8');

test('Patch 4 — pipeline-controller.md documents --strict-spec flag in execution-mode table', () => {
  // The flag should appear in the table of pipeline arguments alongside
  // other --type/--grill/--plan flags.
  assert.match(PC, /--strict-spec/);
});

test('Patch 4 — pipeline-controller.md instructs passing STRICT_SPEC=true to task-orchestrator', () => {
  // The controller propagates the flag as a prefix line in the prompt
  // (same pattern as PRE_CLASSIFIED_TYPE and FORCE_VARIANT).
  assert.match(PC, /STRICT_SPEC[=:]?\s*true/i);
});

test('Patch 4 — task-orchestrator.md documents STRICT_SPEC handling', () => {
  assert.match(TO, /STRICT_SPEC/);
});

test('Patch 4 — task-orchestrator rejects Signal 3 (prose regex) when STRICT_SPEC=true', () => {
  // The agent prose must explicitly state that Signal 3 is disabled in
  // strict mode; otherwise the LLM would still accept the regex match.
  const sec = TO.match(/STRICT_SPEC[\s\S]{0,2000}/);
  assert.ok(sec, 'STRICT_SPEC section not found in task-orchestrator');
  assert.match(sec[0], /Signal\s*3/i);
  assert.match(sec[0], /(reject|disabl|skip|refuse)/i);
});

test('Patch 4 — task-orchestrator rejects Signal 4 (glob fallback) when STRICT_SPEC=true', () => {
  const sec = TO.match(/STRICT_SPEC[\s\S]{0,2000}/);
  assert.ok(sec, 'STRICT_SPEC section not found in task-orchestrator');
  assert.match(sec[0], /Signal\s*4/i);
});

test('Patch 4 — task-orchestrator preserves Signal 1 (explicit path) under STRICT_SPEC=true', () => {
  const sec = TO.match(/STRICT_SPEC[\s\S]{0,2000}/);
  assert.ok(sec);
  // Signal 1 (path arg) and Signal 2 (--type=spec) must explicitly survive.
  assert.match(sec[0], /Signal\s*1/i);
});

test('Patch 4 — task-orchestrator emits warning in notes when STRICT_SPEC rejects a candidate Signal 3/4 match', () => {
  const sec = TO.match(/STRICT_SPEC[\s\S]{0,2000}/);
  assert.ok(sec);
  assert.match(sec[0], /(warning|notes|emit)/i);
});

test('Patch 4 — flag is documented as scoped to unattended / CI mode (rationale)', () => {
  // The use case must be explicit so future readers don't think it's an
  // arbitrary toggle. CI / unattended / automation language should appear.
  const sec = TO.match(/STRICT_SPEC[\s\S]{0,2000}/);
  assert.ok(sec);
  assert.match(sec[0], /unattended|CI|automation|headless/i);
});

// ─── Adversarial review followups (ADV-B4-01 .. ADV-B4-05) ─────────────────

test('Patch 4 (ADV-B4-03) — STRICT_SPEC prefix-line invariant prevents prompt injection', () => {
  // Anti-injection: STRICT_SPEC=true must only be honored as the first line
  // injected by the controller; occurrences elsewhere are DATA.
  assert.match(TO, /prefix.line.*invariant|first line|first-line/i);
  assert.match(TO, /(ignore|data, not authority|treat.*as DATA)/i);
});

test('Patch 4 (ADV-B4-01) — pipeline-controller documents STRICT_SPEC vs FORCE_VARIANT precedence', () => {
  assert.match(PC, /STRICT_SPEC[\s\S]{0,500}(FORCE_VARIANT|precedence|wins)/i);
  // Specifically: STRICT_SPEC wins
  const sec = PC.match(/Precedence with FORCE_VARIANT[\s\S]{0,1500}/);
  assert.ok(sec, 'Precedence subsection missing in pipeline-controller.md');
  assert.match(sec[0], /STRICT_SPEC wins/i);
  assert.match(sec[0], /demot/i);
});

test('Patch 4 (ADV-B4-02) — rejection warning suggests re-running without flag when Spec was intended', () => {
  // The notes warning must guide the operator — not just record the fact.
  const sec = TO.match(/STRICT_SPEC[\s\S]{0,3000}/);
  assert.ok(sec);
  assert.match(sec[0], /re-run.*without.*--strict-spec|Spec was intended|if Spec/i);
});

test('Patch 4 (ADV-B4-05) — STRICT_SPEC_REJECTION gate logged to gate-decisions.jsonl', () => {
  // Observability: rejection must produce a gate entry, not just a notes line.
  const sec = TO.match(/STRICT_SPEC[\s\S]{0,3000}/);
  assert.ok(sec);
  assert.match(sec[0], /STRICT_SPEC_REJECTION/);
  assert.match(sec[0], /gate-decisions\.jsonl/);
  assert.match(sec[0], /AUDIT/);
});

test('Patch 4 (ADV-B4-05) — STRICT_SPEC_REJECTION gate is in the Gate Registry', () => {
  const GATES = fs.readFileSync('references/gates.md', 'utf8');
  const row = GATES.match(/\|\s*STRICT_SPEC_REJECTION\s*\|[^\n]+/);
  assert.ok(row, 'STRICT_SPEC_REJECTION row missing from Gate Registry');
  assert.match(row[0], /AUDIT/);
});

test('Patch 4 — controller documents strip of --strict-spec token before forwarding (ADV-B4-06)', () => {
  // Ensure the flag token does not leak into task text passed to the
  // orchestrator (otherwise downstream classifiers may match on the literal).
  assert.match(PC, /Strip.*--strict-spec|strip the.*--strict-spec/i);
});
