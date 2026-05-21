'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// ============================================================================
// Patch 2 — state-file-hard precondition (Phase 0 hardening)
//
// ATDD / BDD scenario:
//
//   GIVEN a fresh pipeline invocation and PIPELINE_DOC_PATH is created
//     AND the controller attempts to write {PIPELINE_DOC_PATH}/sentinel-state.json
//   WHEN the Write fails for any reason (permission, disk full, invalid path,
//        symlink rejection, read-only filesystem)
//   THEN the controller MUST emit gate STATE_FILE_INIT_FAIL (hardness
//        CIRCUIT_BREAKER) and abort the pipeline BEFORE any Agent spawn
//        (no DISPATCH_REQUEST is emitted)
//     AND the gate appears in the authoritative inline-invariants list of
//        pipeline-controller.md
//     AND the gate is registered in references/gates.md with correct hardness
//     AND the gate is mandatory for SIMPLES, MEDIA and COMPLEXA (Phase 0 is
//        unconditional)
//
// Domain boundary (DDD): this rule belongs in the pipeline-controller domain
// (phase-0 init). The IO can raise from lib/sentinel-state-signer.cjs, but
// translating it into a CIRCUIT_BREAKER gate and halting before agent spawn
// is the controller's responsibility, not the signer's.
// ============================================================================

const PC = fs.readFileSync('agents/core/pipeline-controller.md', 'utf8');
const GATES = fs.readFileSync('references/gates.md', 'utf8');

test('Patch 2 — STATE_FILE_INIT_FAIL is documented in pipeline-controller.md', () => {
  assert.match(PC, /STATE_FILE_INIT_FAIL/);
});

test('Patch 2 — STATE_FILE_INIT_FAIL is classified as CIRCUIT_BREAKER in inline invariants', () => {
  // The "Inline Invariants (authoritative)" block lists gates grouped by
  // hardness. STATE_FILE_INIT_FAIL must appear in the CIRCUIT_BREAKER group.
  const block = PC.match(/Inline Invariants[\s\S]{0,2000}?CIRCUIT_BREAKER[\s\S]{0,500}/);
  assert.ok(block, 'Inline Invariants block with CIRCUIT_BREAKER group not found');
  assert.match(block[0], /STATE_FILE_INIT_FAIL/);
});

test('Patch 2 — Sentinel State File section describes abort-before-spawn on Write failure', () => {
  const section = PC.match(/### Sentinel State File[\s\S]*?(?=\n## |\n### )/);
  assert.ok(section, 'Sentinel State File section not found');
  assert.match(section[0], /STATE_FILE_INIT_FAIL/);
  assert.match(section[0], /abort|halt|stop the pipeline/i);
  assert.match(section[0], /before .*(Agent|DISPATCH_REQUEST|spawn|first dispatch)/i);
});

test('Patch 2 — STATE_FILE_INIT_FAIL is in the Gate Registry of references/gates.md', () => {
  // Registry uses a Markdown table with hardness column.
  const row = GATES.match(/\|\s*STATE_FILE_INIT_FAIL\s*\|[^\n]+/);
  assert.ok(row, 'STATE_FILE_INIT_FAIL row not found in Gate Registry');
  assert.match(row[0], /CIRCUIT_BREAKER/);
});

test('Patch 2 — STATE_FILE_INIT_FAIL is mandatory in SIMPLES, MEDIA and COMPLEXA', () => {
  const table = GATES.match(/## Mandatory Gates by Complexity[\s\S]*?(?=\n## )/);
  assert.ok(table, 'Mandatory Gates by Complexity table not found');
  const row = table[0].match(/\|\s*STATE_FILE_INIT_FAIL\s*\|[^\n]+/);
  assert.ok(row, 'STATE_FILE_INIT_FAIL not in Mandatory Gates table');
  const checkmarks = (row[0].match(/✓/g) || []).length;
  assert.ok(
    checkmarks >= 3,
    `STATE_FILE_INIT_FAIL must be mandatory in all 3 complexity buckets, got ${checkmarks} checkmark(s)`
  );
});

// ---------------------------------------------------------------------------
// Adversarial review followups (CRITICAL/HIGH from compound-engineering review):
// 1. Post-write verify requirement — happy path PASS entry — retry guidance
// 5. Signer must not emit gate-decisions (DDD bounded-context preservation)
// ---------------------------------------------------------------------------

test('Patch 2 — happy path emits PASS entry in gate-decisions.jsonl (no fidelity haircut)', () => {
  // Adversarial finding HIGH #3: STATE_FILE_INIT_FAIL is mandatory across all
  // complexities, but only fires on FAILURE. The prose must require a PASS
  // entry on the successful Write+verify path so the fidelity reporter sees
  // the gate as triggered on every healthy run.
  const section = PC.match(/#### STATE_FILE_INIT_FAIL gate[\s\S]*?(?=\n#### |\n### |\n## )/);
  assert.ok(section, 'STATE_FILE_INIT_FAIL section not found');
  assert.match(section[0], /Happy path|PASS|decision:\s*"PASS"/i);
  assert.match(section[0], /sentinel-state\.json verified ok|verified ok/);
});

test('Patch 2 — post-write verification is required (partial-write defense)', () => {
  // Adversarial finding CRITICAL #1: a Write that succeeds but produces a
  // truncated/empty file would slip past the gate. The prose must require an
  // immediate re-read + signature verification after Write.
  const section = PC.match(/#### STATE_FILE_INIT_FAIL gate[\s\S]*?(?=\n#### |\n### |\n## )/);
  assert.ok(section, 'STATE_FILE_INIT_FAIL section not found');
  assert.match(section[0], /re-read|readVerifiedState|verif(y|ication|ied)/i);
  assert.match(section[0], /signature|integrity|truncated|empty/i);
});

test('Patch 2 — retry guidance is documented (CIRCUIT_BREAKER latch)', () => {
  // Adversarial finding CRITICAL #2: CIRCUIT_BREAKER taxonomy requires explicit
  // reset. v7.1.2 ships behavioral retry guidance in prose pending programmatic
  // latch in v7.1.3+. The prose must at minimum tell the user not to retry
  // without fixing the root cause.
  const section = PC.match(/#### STATE_FILE_INIT_FAIL gate[\s\S]*?(?=\n#### |\n### |\n## )/);
  assert.ok(section, 'STATE_FILE_INIT_FAIL section not found');
  assert.match(section[0], /Retry guidance|CIRCUIT_BREAKER latch|Do NOT immediately re-run/i);
});

test('Patch 2 — signer must NOT emit gate-decisions (DDD bounded-context invariant)', () => {
  // Adversarial finding LOW #7: lib/sentinel-state-signer.cjs is the IO layer.
  // It must remain free of gate-emission logic — only the controller writes
  // to gate-decisions.jsonl. This test guards against a future refactor that
  // would leak the gate-emission concern into the signer.
  const signer = fs.readFileSync('lib/sentinel-state-signer.cjs', 'utf8');
  assert.doesNotMatch(
    signer,
    /gate-decisions\.jsonl|STATE_FILE_INIT_FAIL/,
    'lib/sentinel-state-signer.cjs leaked gate-emission concern — DDD violation'
  );
});
