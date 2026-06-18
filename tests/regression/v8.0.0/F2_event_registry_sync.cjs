#!/usr/bin/env node
'use strict';
// F2 (v8.0.0) — the 8 spec-authoring telemetry events are registered consistently
// across the gate SSOT and BOTH Inline-Invariants copies, with the registry count
// rolled to 47 in v8.5.0 (+4 spec-authoring enforcement AUDIT gates), and the
// Mandatory Gates by Complexity table left UNCHANGED (Iron Law).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../..');
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log(`  [PASS] ${name}`); pass++; } catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const EVENTS = ['IDEATION_PROPOSED', 'IDEATION_ACCEPTED', 'IDEATION_REJECTED', 'IDEATION_SKIPPED',
  'DESIGN_INTERROGATOR_FORCED', 'SPEC_REVIEW_FINDINGS', 'SPEC_SEALED', 'SPEC_AMENDED'];
const SURFACES = ['references/gates.md', 'commands/pipeline.md', 'agents/core/pipeline-controller.md'];

console.log('=== F2 v8.0.0 event-registry sync (35 -> 43 -> 47) ===');

for (const surface of SURFACES) {
  test(`${surface} registers all 8 spec-authoring events`, () => {
    const s = read(surface);
    for (const ev of EVENTS) assert.ok(s.includes(ev), `${surface} missing ${ev}`);
  });
}

test('the registry count moved to 47 in all three surfaces', () => {
  assert.match(read('references/gates.md'), /47-gate registry/, 'gates.md header = 47');
  assert.match(read('commands/pipeline.md'), /\(47 total/, 'pipeline.md inline = 47');
  assert.match(read('agents/core/pipeline-controller.md'), /\(47 total/, 'pipeline-controller.md inline = 47');
});

test('the new events are AUDIT/SOFT only — the Mandatory Gates by Complexity table is UNTOUCHED (Iron Law)', () => {
  const g = read('references/gates.md');
  // None of the 8 events may appear inside the Mandatory Gates by Complexity section.
  const mStart = g.indexOf('## Mandatory Gates by Complexity');
  assert.ok(mStart !== -1, 'Mandatory Gates by Complexity section must exist');
  const after = g.slice(mStart);
  // section ends at the next top-level "## " heading
  const nextH = after.slice(3).search(/\n##\s/);
  const mandatorySection = nextH === -1 ? after : after.slice(0, nextH + 3);
  for (const ev of EVENTS) assert.ok(!mandatorySection.includes(ev), `${ev} must NOT be in the Mandatory table`);
});

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
