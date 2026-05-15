#!/usr/bin/env node
'use strict';

/**
 * Regression tests for I4 (HMAC), I5 (JSONL sanitizer), I6 (pipeline.local parser).
 *
 * Each module ships as a stand-alone lib in /lib/, ready to be wired into hooks
 * in a future commit. These tests exercise the contract directly.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const jsonl = require(path.join(ROOT, 'lib/jsonl-sanitizer.cjs'));
const signer = require(path.join(ROOT, 'lib/sentinel-state-signer.cjs'));
const parser = require(path.join(ROOT, 'lib/pipeline-local-parser.cjs'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== I5 jsonl-sanitizer ===');

test('sanitizeDetail strips newlines and tabs', () => {
  assert.equal(jsonl.sanitizeDetail('a\nb\tc\r\nd'), 'a b c d');
});

test('sanitizeDetail truncates to 200 chars with ellipsis', () => {
  const long = 'x'.repeat(300);
  const result = jsonl.sanitizeDetail(long);
  assert.ok(result.length <= 200);
  assert.ok(result.endsWith('...'));
});

test('safeAppendJsonl round-trips with quotes in detail (H6-001 fix)', () => {
  const tmpFile = path.join(os.tmpdir(), `i5-test-${process.pid}.jsonl`);
  try { fs.unlinkSync(tmpFile); } catch {}
  const PAYLOAD = 'detail with "quote" and \n newline and {"fake_gate":"INJECTED"}';
  const result = jsonl.safeAppendJsonl(tmpFile, {
    gate: 'TEST',
    hardness: 'SOFT',
    phase: 'audit',
    decision: 'PASS',
    decided_by: 'test',
    timestamp: '2026-05-15T00:00:00Z',
    detail: PAYLOAD,
    confidence_impact: 0,
  });
  assert.ok(result.ok);
  // Critical: line MUST parse back as one valid JSON object
  const line = fs.readFileSync(tmpFile, 'utf8').trim();
  const parsed = JSON.parse(line);
  assert.equal(parsed.gate, 'TEST');
  assert.ok(!parsed.detail.includes('\n'));
  assert.ok(!parsed.detail.includes('"fake_gate":"INJECTED"') || typeof parsed.detail === 'string',
    'detail must be a string field, not a parsed object');
  fs.unlinkSync(tmpFile);
});

test('safeAppendJsonl drops unknown keys', () => {
  const tmpFile = path.join(os.tmpdir(), `i5-test2-${process.pid}.jsonl`);
  try { fs.unlinkSync(tmpFile); } catch {}
  const result = jsonl.safeAppendJsonl(tmpFile, {
    gate: 'TEST',
    hardness: 'SOFT',
    phase: 'audit',
    decision: 'PASS',
    decided_by: 'test',
    timestamp: '2026-05-15T00:00:00Z',
    malicious_extra_key: 'attacker payload',
    override_gate_registry: ['DROP_TABLE'],
  });
  assert.deepEqual(result.unknownKeysDropped.sort(), ['malicious_extra_key', 'override_gate_registry']);
  assert.ok(!('malicious_extra_key' in result.parsed));
  fs.unlinkSync(tmpFile);
});

console.log('');
console.log('=== I4 sentinel-state-signer ===');

test('signState adds __signature field with HMAC-SHA256', () => {
  const state = { schema_version: 1, pipeline_active: true, pipeline_id: 'test-1' };
  const signed = signer.signState(state, 'test-key-32-bytes-long-padding-x');
  assert.equal(signed.__signature.algorithm, 'sha256');
  assert.ok(/^[a-f0-9]{64}$/.test(signed.__signature.value), 'signature must be 64-char hex');
});

test('verifyState detects tampering', () => {
  const key = 'test-key-32-bytes-long-padding-x';
  const state = { schema_version: 1, pipeline_active: true, pipeline_id: 'test-2' };
  const signed = signer.signState(state, key);
  // Tamper: change pipeline_active
  signed.pipeline_active = false;
  const result = signer.verifyState(signed, { key, strict: true });
  assert.equal(result.valid, false);
  assert.ok(result.reason.includes('mismatch'));
});

test('verifyState accepts valid signature', () => {
  const key = 'test-key-32-bytes-long-padding-x';
  const state = { schema_version: 1, pipeline_active: true, pipeline_id: 'test-3' };
  const signed = signer.signState(state, key);
  const result = signer.verifyState(signed, { key, strict: true });
  assert.equal(result.valid, true);
});

test('verifyState in non-strict allows unsigned state (migration period)', () => {
  const state = { schema_version: 1, pipeline_active: true };
  const result = signer.verifyState(state, { strict: false });
  assert.equal(result.valid, true);
  assert.ok(result.unsigned);
});

test('verifyState in strict rejects unsigned state', () => {
  const state = { schema_version: 1, pipeline_active: true };
  const result = signer.verifyState(state, { strict: true });
  assert.equal(result.valid, false);
});

console.log('');
console.log('=== I6 pipeline-local-parser ===');

test('parsePipelineLocal accepts canonical file', () => {
  const valid = `---
doc_path: ".pipeline/docs"
build_command: "npm run build"
test_command: "npm test"
spec_path: "specs/"
patterns_file: "PATTERNS.md"
---

# Body content (ignored)
Some prose.
`;
  const result = parser.parsePipelineLocal(valid);
  assert.equal(result.ok, true);
  assert.equal(result.config.doc_path, '.pipeline/docs');
  assert.equal(result.config.build_command, 'npm run build');
});

test('parsePipelineLocal rejects shell injection in build_command (H6-002 fix)', () => {
  const malicious = `---
doc_path: ".pipeline/docs"
build_command: "echo PWNED && rm -rf /"
test_command: "test"
spec_path: "specs/"
patterns_file: "PATTERNS.md"
---
`;
  const result = parser.parsePipelineLocal(malicious);
  assert.equal(result.ok, false);
  const violation = result.violations.find(v => v.kind === 'shell_injection');
  assert.ok(violation, 'must detect shell_injection');
  assert.equal(violation.key, 'build_command');
  assert.ok(!('build_command' in result.config),
    'malicious command must NOT appear in config');
});

test('parsePipelineLocal drops unknown keys', () => {
  const withExtra = `---
doc_path: ".pipeline/docs"
malicious_extra_key: "should be ignored"
override_gate_registry: "DROP_TABLE"
---
`;
  const result = parser.parsePipelineLocal(withExtra);
  assert.ok(result.dropped_keys.includes('malicious_extra_key'));
  assert.ok(result.dropped_keys.includes('override_gate_registry'));
});

test('parsePipelineLocal rejects path traversal', () => {
  const traversal = `---
doc_path: "../../../etc"
build_command: "test"
test_command: "test"
spec_path: "specs/"
patterns_file: "PATTERNS.md"
---
`;
  const result = parser.parsePipelineLocal(traversal);
  assert.equal(result.ok, false);
  assert.ok(result.violations.find(v => v.kind === 'path_traversal'));
});

test('parsePipelineLocal rejects no frontmatter', () => {
  const noFrontmatter = `# Just a markdown file\nNo YAML here.`;
  const result = parser.parsePipelineLocal(noFrontmatter);
  assert.equal(result.ok, false);
  assert.ok(result.violations.find(v => v.kind === 'no_frontmatter'));
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
