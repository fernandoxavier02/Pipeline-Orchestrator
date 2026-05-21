'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// ============================================================================
// Patch 3 — PROTOCOL_HANDSHAKE_TIMEOUT (Phase 0 hardening)
//
// ATDD / BDD scenario:
//
//   GIVEN information-gate (or any subagent following the GATE_REQUEST
//         protocol) emits `=== GATE_REQUEST v1 ===` with STATUS:
//         AWAITING_GATE_RESPONSES
//     AND records the emission in sentinel-state.json `pending_blocks`
//         with `emitted_at` timestamp
//   WHEN the response is not received within 30 minutes (default; configurable
//         via PIPELINE_HANDSHAKE_TIMEOUT_MS env var)
//   THEN the pipeline-controller emits gate PROTOCOL_HANDSHAKE_TIMEOUT
//         (hardness HARD) to gate-decisions.jsonl, returns a partial PIPELINE
//         COMPLETE block to the parent, and exits with non-zero status
//     AND the user sees a clear message indicating the protocol deadlocked
//         (parent did not parse GATE_REQUEST, missing AskUserQuestion handler,
//         abandoned session, etc.)
//
// Why this matters: Achado #7 made AskUserQuestion/Agent/EnterPlanMode
// invisible inside subagent runtimes. Subagents emit GATE_REQUEST blocks
// expecting the parent to parse, ask the user, and re-dispatch. If the parent
// doesn't implement the protocol, the subagent waits forever — the OBZ
// COMPLEX 20/03 run pattern (only 00-orchestrator.md exists, no
// 01-information-gate.md, no further artifacts) is consistent with this
// silent deadlock.
//
// DDD bounded context: timeout detection lives in the pipeline-controller
// (the dispatcher), not in information-gate (the emitter). information-gate
// only emits the block; the controller observes pending_blocks aging out.
// ============================================================================

const PC = fs.readFileSync('agents/core/pipeline-controller.md', 'utf8');
const GATES = fs.readFileSync('references/gates.md', 'utf8');
const PROTOCOL = fs.readFileSync('references/gate-request-protocol.md', 'utf8');
const IG = fs.readFileSync('agents/core/information-gate.md', 'utf8');

test('Patch 3 — PROTOCOL_HANDSHAKE_TIMEOUT is in the Gate Registry of references/gates.md', () => {
  const row = GATES.match(/\|\s*PROTOCOL_HANDSHAKE_TIMEOUT\s*\|[^\n]+/);
  assert.ok(row, 'PROTOCOL_HANDSHAKE_TIMEOUT row not found in Gate Registry');
  assert.match(row[0], /HARD/);
});

test('Patch 3 — PROTOCOL_HANDSHAKE_TIMEOUT is classified HARD in inline invariants', () => {
  const block = PC.match(/Inline Invariants[\s\S]{0,2000}?HARD[\s\S]{0,1500}/);
  assert.ok(block, 'Inline Invariants HARD group not found');
  assert.match(block[0], /PROTOCOL_HANDSHAKE_TIMEOUT/);
});

test('Patch 3 — gate-request-protocol.md documents timeout convention (30min default)', () => {
  assert.match(PROTOCOL, /PROTOCOL_HANDSHAKE_TIMEOUT/);
  assert.match(PROTOCOL, /timeout|deadlock/i);
  assert.match(PROTOCOL, /30\s*(min|minute|minutes)|30\s*\*\s*60|1800000/i);
});

test('Patch 3 — gate-request-protocol.md documents PIPELINE_HANDSHAKE_TIMEOUT_MS env override', () => {
  assert.match(PROTOCOL, /PIPELINE_HANDSHAKE_TIMEOUT_MS/);
});

test('Patch 3 — pipeline-controller.md documents pending_blocks age check', () => {
  // The controller is the dispatcher — it must observe pending_blocks aging.
  // The prose should describe checking emitted_at on each re-entry and
  // emitting PROTOCOL_HANDSHAKE_TIMEOUT if stale.
  assert.match(PC, /pending_blocks?[\s\S]{0,400}(emitted_at|aged|stale|timeout)/i);
  assert.match(PC, /PROTOCOL_HANDSHAKE_TIMEOUT/);
});

test('Patch 3 — information-gate.md instructs subagent on AWAITING_GATE_RESPONSES timeout expectation', () => {
  // The emitter should make the contract visible — if the parent doesn't
  // re-dispatch within the timeout window, the next attempt at this gate
  // will be treated as PROTOCOL_HANDSHAKE_TIMEOUT.
  assert.match(IG, /AWAITING_GATE_RESPONSES/);
  // Either the agent mentions the timeout convention OR the protocol file
  // (already required above). We require at minimum a pointer to the
  // protocol's timeout section so the agent doesn't spin without context.
  assert.match(IG, /timeout|PROTOCOL_HANDSHAKE_TIMEOUT|handshake/i);
});

test('Patch 3 — gate row in registry has HARD hardness and clear recovery action', () => {
  const row = GATES.match(/\|\s*PROTOCOL_HANDSHAKE_TIMEOUT\s*\|[^\n]+/);
  assert.ok(row);
  // Should mention user / re-invoke / fix parent handler in the recovery
  // column — concrete action, not just "investigate".
  assert.match(row[0], /re-invoke|parent|handler|user/i);
});
