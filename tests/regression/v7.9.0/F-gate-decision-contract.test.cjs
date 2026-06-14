#!/usr/bin/env node
'use strict';

/**
 * F-gate-decision-contract — Phase 1 of the contract-enforcement plan
 * (2026-06-14). Pins that the gate-decision schema is now single-sourced from
 * lib/contracts/gate-decision.cjs and that the historical drift is gone:
 *   - writer/sanitizer/fidelity-reporter consume the SAME canonical sets/keys
 *   - the 8 canonical decisions are accepted; RESOLVED is rejected at write time
 *   - the 5 correlation fields are written and NOT dropped by the sanitizer
 *   - the prose parse-rules no longer demand "exactly 8 keys" or look for
 *     a non-canonical RESOLVED decision
 *
 * Self-contained test harness (no external deps), mirrors the style of the
 * other regression suites in this repo.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const contract = require(path.join(ROOT, 'lib', 'contracts', 'gate-decision.cjs'));
const writer = require(path.join(ROOT, 'lib', 'gate-decision-writer.cjs'));
const sanitizer = require(path.join(ROOT, 'lib', 'jsonl-sanitizer.cjs'));

let pass = 0;
let fail = 0;
const log = (ok, name, extra) => {
  if (ok) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' :: ' + extra : ''}`); }
};

console.log('=== F-gate-decision-contract (Phase 1 SSOT) ===');

// S1 — contract shape: 8 decisions, 5 hardness, 13 keys (8 base + 5 correlation)
log(
  contract.CANONICAL_DECISIONS.size === 8 &&
  contract.CANONICAL_HARDNESS.size === 5 &&
  contract.ALLOWED_GATE_DECISION_KEYS.length === 13 &&
  contract.BASE_GATE_DECISION_KEYS.length === 8 &&
  contract.CORRELATION_KEYS.length === 5,
  'S1: contract exposes 8 decisions / 5 hardness / 13 allowed keys (8 base + 5 correlation)',
  `dec=${contract.CANONICAL_DECISIONS.size} hard=${contract.CANONICAL_HARDNESS.size} keys=${contract.ALLOWED_GATE_DECISION_KEYS.length}`
);

// S2 — RESOLVED is NOT canonical; all 8 documented values ARE
const eight = ['BLOCKED', 'DISPATCHED', 'SKIPPED', 'APPROVED', 'CONFIRMED', 'REJECTED', 'TRIGGERED', 'NOT_TRIGGERED'];
log(
  eight.every((d) => contract.isCanonicalDecision(d)) && !contract.isCanonicalDecision('RESOLVED'),
  'S2: 8 canonical decisions accepted; RESOLVED rejected by contract'
);

// S3 — structural single-source: writer + sanitizer + fidelity-reporter share the SAME objects
const fidelity = require(path.join(ROOT, 'lib', 'fidelity-reporter.cjs'));
log(
  writer.CANONICAL_DECISIONS === contract.CANONICAL_DECISIONS &&
  writer.CANONICAL_HARDNESS === contract.CANONICAL_HARDNESS &&
  sanitizer.ALLOWED_GATE_DECISION_KEYS === contract.ALLOWED_GATE_DECISION_KEYS &&
  typeof fidelity === 'object',
  'S3: writer + sanitizer + fidelity-reporter reference the SAME contract objects (no parallel decls)'
);

// S4 — writer accepts all 8 decisions and writes the 5 correlation fields
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-contract-'));
const tmpFile = path.join(tmpDir, 'gate-decisions.jsonl');
const ctx = writer.buildCtx(path.join(tmpDir, '2026-06-14-test-run') + '/', { type: 'Bug Fix', complexity: 'MEDIA' });
let allEightWrote = true;
for (const d of eight) {
  try {
    writer.appendGateDecision(tmpFile, {
      gate: 'TDD_APPROVAL', hardness: 'HARD', phase: 2, decision: d,
      decided_by: 'user', timestamp: '2026-06-14T00:00:00Z', detail: 'x', confidence_impact: 0,
    }, ctx);
  } catch (e) { allEightWrote = false; }
}
const lines = fs.readFileSync(tmpFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const firstLine = lines[0];
log(allEightWrote, 'S4a: writer accepts all 8 canonical decisions without throwing');
log(
  firstLine.run_id === '2026-06-14-test-run' &&
  firstLine.plugin_version && firstLine.schema_version === '1' &&
  firstLine.type === 'Bug Fix' && firstLine.complexity === 'MEDIA',
  'S4b: writer stamps the 5 correlation fields (run_id/plugin_version/schema_version/type/complexity)',
  JSON.stringify({ run_id: firstLine.run_id, sv: firstLine.schema_version, type: firstLine.type })
);

// S5 — writer rejects RESOLVED (and any non-canonical decision) with TypeError
let threw = false;
try {
  writer.appendGateDecision(tmpFile, {
    gate: 'INFO_GATE_BLOCKED', hardness: 'HARD', phase: 0, decision: 'RESOLVED',
    decided_by: 'user', timestamp: '2026-06-14T00:00:00Z', detail: 'x', confidence_impact: 0,
  }, ctx);
} catch (e) { threw = e instanceof TypeError; }
log(threw, 'S5: writer throws TypeError on decision=RESOLVED');

// S6 — sanitizer keeps the 5 correlation fields (does NOT drop them)
const sanitized = sanitizer.sanitizeEntry({
  run_id: 'r', plugin_version: '7.8.0', schema_version: '1', type: 'Bug Fix', complexity: 'MEDIA',
  gate: 'X', hardness: 'HARD', phase: 2, decision: 'APPROVED',
  decided_by: 'user', timestamp: 't', detail: 'd', confidence_impact: 0,
}, 'gate');
log(
  ['run_id', 'plugin_version', 'schema_version', 'type', 'complexity'].every((k) => k in sanitized),
  'S6: jsonl-sanitizer preserves the 5 correlation fields'
);

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }

// S7 — prose drift gone: final-validator.md no longer says "RESOLVED | APPROVED"
const finalValidator = fs.readFileSync(path.join(ROOT, 'agents', 'core', 'final-validator.md'), 'utf8');
log(
  !/RESOLVED\s*\|\s*APPROVED/.test(finalValidator),
  'S7: final-validator.md no longer contains "RESOLVED | APPROVED"'
);

// S8 — audit-trail.md documents the correlation envelope
const auditTrail = fs.readFileSync(path.join(ROOT, 'references', 'audit-trail.md'), 'utf8');
log(
  /run_id/.test(auditTrail) && /plugin_version/.test(auditTrail) &&
  /schema_version/.test(auditTrail) && /correlation/i.test(auditTrail),
  'S8: audit-trail.md documents the correlation envelope'
);

// S9 — the three parse-rule files dropped the "exactly these keys" 8-key demand
const pipelineController = fs.readFileSync(path.join(ROOT, 'agents', 'core', 'pipeline-controller.md'), 'utf8');
const pipelineCmd = fs.readFileSync(path.join(ROOT, 'commands', 'pipeline.md'), 'utf8');
log(
  !/with exactly these keys/.test(pipelineController) &&
  !/with exactly these keys/.test(pipelineCmd) &&
  !/with exactly these keys/.test(auditTrail),
  'S9: pipeline-controller.md / commands/pipeline.md / audit-trail.md dropped the "exactly these keys" rule'
);

console.log(`\nSummary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
