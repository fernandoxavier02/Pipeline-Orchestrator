#!/usr/bin/env node
'use strict';

/**
 * D5 — quality-gate-router.md "Step 1b" non-spec ATDD/BDD activation.
 *
 * Covers (10 scenarios from QUALITY_GATE_APPROVED):
 *   - D5-S1  MAIN       Step 1b heading exists and appears AFTER Step 1a
 *   - D5-S2  MAIN       Step 1b activates for MEDIA + COMPLEXA, excludes spec-mode runs
 *   - D5-S3  MAIN       Step 1b explicitly bypasses SIMPLES complexity
 *   - D5-S4  MAIN       Output YAML has non_spec_atdd block with applied/scenario_count/ears_continuations_used
 *   - D5-S5  REGRESSION Step 1a (SPEC MODE) untouched — 4 key phrases verbatim
 *   - D5-S6  REGRESSION Existing OUTPUT YAML keys preserved
 *   - D5-S7  REGRESSION USER INTERACTION PROTOCOL + AskUserQuestion mandate preserved
 *   - D5-S8  EDGE       And/But EARS continuations mentioned inside Step 1b
 *   - D5-S9  EDGE       Step 1b bypass covers type=Spec runs
 *   - D5-S10 EDGE       non_spec_atdd appears AFTER spec_context_scenarios in OUTPUT
 *
 * Production code under test (NOT yet modified — these tests MUST FAIL):
 *   - agents/quality/quality-gate-router.md (Step 1b not yet inserted)
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const ROUTER_PATH = path.join(ROOT, 'agents/quality/quality-gate-router.md');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

function readRouter() {
  return fs.readFileSync(ROUTER_PATH, 'utf8');
}

console.log('=== D5 quality-gate-router non-spec ATDD/BDD Step 1b ===');

// ---------- MAIN scenarios ----------

test('D5-S1: Step 1b heading exists AND appears after Step 1a', () => {
  const content = readRouter();
  const step1aIdx = content.search(/####\s+Step\s+1a:/);
  const step1bIdx = content.search(/####\s+Step\s+1b:/);
  assert.ok(step1aIdx >= 0, 'Step 1a heading not found (sanity check)');
  assert.ok(step1bIdx >= 0, 'Step 1b heading missing — expected "#### Step 1b:" heading');
  assert.ok(
    step1bIdx > step1aIdx,
    `Step 1b must appear AFTER Step 1a (got 1a=${step1aIdx}, 1b=${step1bIdx})`,
  );
});

test('D5-S2: Step 1b activates for MEDIA and COMPLEXA, excludes spec-mode runs', () => {
  const content = readRouter();
  const block = extractStep1bBlock(content);
  assert.ok(block, 'Step 1b block not found');
  assert.ok(/MEDIA/.test(block), 'Step 1b block missing MEDIA activation trigger');
  assert.ok(/COMPLEXA/.test(block), 'Step 1b block missing COMPLEXA activation trigger');
  // Must explicitly mention that spec mode is excluded.
  assert.ok(
    /spec[\s\S]{0,40}(mode|context|run)/i.test(block) &&
      /(exclud|bypass|skip|not\s+apply|nao\s+aplica)/i.test(block),
    'Step 1b must explicitly exclude/bypass spec-mode runs',
  );
});

test('D5-S3: Step 1b explicitly bypasses SIMPLES complexity', () => {
  const content = readRouter();
  const block = extractStep1bBlock(content);
  assert.ok(block, 'Step 1b block not found');
  assert.ok(
    /SIMPLES/.test(block) && /(bypass|skip|not\s+apply|exclud|nao\s+aplica|nao\s+ativa)/i.test(block),
    'Step 1b must explicitly bypass SIMPLES complexity',
  );
});

test('D5-S4: OUTPUT YAML has non_spec_atdd block with required sub-keys', () => {
  const content = readRouter();
  const yaml = extractOutputYaml(content);
  assert.ok(yaml, 'OUTPUT YAML block not found');
  assert.ok(/non_spec_atdd\s*:/.test(yaml), 'non_spec_atdd field missing in OUTPUT YAML');
  // sub-keys must exist under the non_spec_atdd block
  const nonSpecBlock = extractYamlSubBlock(yaml, 'non_spec_atdd');
  assert.ok(nonSpecBlock, 'non_spec_atdd sub-block could not be extracted');
  assert.ok(/applied\s*:/.test(nonSpecBlock), 'non_spec_atdd.applied missing');
  assert.ok(/scenario_count\s*:/.test(nonSpecBlock), 'non_spec_atdd.scenario_count missing');
  assert.ok(
    /ears_continuations_used\s*:/.test(nonSpecBlock),
    'non_spec_atdd.ears_continuations_used missing',
  );
});

// ---------- REGRESSION scenarios ----------

test('D5-S5: Step 1a SPEC MODE block untouched (4 verbatim phrases)', () => {
  const content = readRouter();
  assert.ok(
    content.includes('Array.isArray(acs) && acs.length > 0'),
    'verbatim phrase "Array.isArray(acs) && acs.length > 0" removed from Step 1a',
  );
  assert.ok(
    content.includes('source_form: "EARS"'),
    'verbatim phrase \'source_form: "EARS"\' removed from Step 1a',
  );
  assert.ok(
    content.includes('bullet_normalized'),
    'verbatim phrase "bullet_normalized" removed from Step 1a',
  );
  assert.ok(
    content.includes('testable: false'),
    'verbatim phrase "testable: false" removed from Step 1a',
  );
});

test('D5-S6: Existing OUTPUT YAML keys preserved', () => {
  const content = readRouter();
  const yaml = extractOutputYaml(content);
  assert.ok(yaml, 'OUTPUT YAML block not found');
  assert.ok(/\bstatus\s*:/.test(yaml), 'OUTPUT.status missing');
  assert.ok(/\bscenarios\s*:/.test(yaml), 'OUTPUT.scenarios missing');
  assert.ok(/\buser_additions\s*:/.test(yaml), 'OUTPUT.user_additions missing');
  assert.ok(/\bapproval_timestamp\s*:/.test(yaml), 'OUTPUT.approval_timestamp missing');
  assert.ok(/spec_context_scenarios\s*:/.test(yaml), 'OUTPUT.spec_context_scenarios missing');
  const specBlock = extractYamlSubBlock(yaml, 'spec_context_scenarios');
  assert.ok(specBlock, 'spec_context_scenarios sub-block could not be extracted');
  assert.ok(/spec_mode\s*:/.test(specBlock), 'spec_context_scenarios.spec_mode missing');
  assert.ok(/acs_covered\s*:/.test(specBlock), 'spec_context_scenarios.acs_covered missing');
  assert.ok(
    /bullet_normalized\s*:/.test(specBlock),
    'spec_context_scenarios.bullet_normalized missing',
  );
  assert.ok(/warnings\s*:/.test(specBlock), 'spec_context_scenarios.warnings missing');
});

test('D5-S7: USER INTERACTION PROTOCOL and AskUserQuestion mandate preserved', () => {
  const content = readRouter();
  assert.ok(
    /##\s+USER INTERACTION PROTOCOL/.test(content),
    'USER INTERACTION PROTOCOL section removed',
  );
  assert.ok(
    /AskUserQuestion/.test(content),
    'AskUserQuestion mandate removed',
  );
});

// ---------- EDGE scenarios ----------

test('D5-S8: And/But EARS continuations mentioned inside Step 1b', () => {
  const content = readRouter();
  const block = extractStep1bBlock(content);
  assert.ok(block, 'Step 1b block not found');
  // Look for both And and But as continuation keywords.
  assert.ok(/\bAnd\b/.test(block), 'Step 1b must mention "And" EARS continuation');
  assert.ok(/\bBut\b/.test(block), 'Step 1b must mention "But" EARS continuation');
});

test('D5-S9: Step 1b bypass condition covers type=Spec runs', () => {
  const content = readRouter();
  const block = extractStep1bBlock(content);
  assert.ok(block, 'Step 1b block not found');
  // Must reference type=Spec (or equivalent) and indicate bypass/exclusion.
  assert.ok(
    /type\s*=\s*Spec|type:\s*Spec|type\s+Spec|spec\s+(mode|context|run|type)/i.test(block),
    'Step 1b must reference type=Spec / spec runs in its bypass condition',
  );
  assert.ok(
    /(bypass|skip|exclud|not\s+apply|do\s+not|nao\s+aplica)/i.test(block),
    'Step 1b bypass language missing for spec runs',
  );
});

test('D5-S10: non_spec_atdd appears AFTER spec_context_scenarios in OUTPUT', () => {
  const content = readRouter();
  const yaml = extractOutputYaml(content);
  assert.ok(yaml, 'OUTPUT YAML block not found');
  const specIdx = yaml.search(/spec_context_scenarios\s*:/);
  const nonSpecIdx = yaml.search(/non_spec_atdd\s*:/);
  assert.ok(specIdx >= 0, 'spec_context_scenarios not found in OUTPUT');
  assert.ok(nonSpecIdx >= 0, 'non_spec_atdd not found in OUTPUT');
  assert.ok(
    nonSpecIdx > specIdx,
    `non_spec_atdd must come AFTER spec_context_scenarios (got spec_context=${specIdx}, non_spec_atdd=${nonSpecIdx})`,
  );
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);

// ---------- helpers ----------

function extractStep1bBlock(md) {
  // Capture lines from "#### Step 1b" until the next "#### Step" or "### " heading.
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^####\s+Step\s+1b\b/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^####\s+Step\s+\S/.test(lines[i]) || /^###\s+\S/.test(lines[i]) || /^##\s+\S/.test(lines[i])) {
      end = i; break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function extractOutputYaml(md) {
  // Find "## OUTPUT" heading and the first fenced ```yaml block after it.
  const lines = md.split(/\r?\n/);
  let outIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+OUTPUT\s*$/.test(lines[i])) { outIdx = i; break; }
  }
  if (outIdx === -1) return '';
  let fenceStart = -1;
  for (let i = outIdx + 1; i < lines.length; i++) {
    if (/^```ya?ml\s*$/.test(lines[i])) { fenceStart = i; break; }
    if (/^##\s+\S/.test(lines[i])) return ''; // hit next section, no fence
  }
  if (fenceStart === -1) return '';
  let fenceEnd = lines.length;
  for (let i = fenceStart + 1; i < lines.length; i++) {
    if (/^```\s*$/.test(lines[i])) { fenceEnd = i; break; }
  }
  return lines.slice(fenceStart + 1, fenceEnd).join('\n');
}

function extractYamlSubBlock(yaml, keyName) {
  // Naive YAML sub-block extractor: find "<keyName>:" at any indent, capture
  // following lines that are more deeply indented than the key.
  const lines = yaml.split(/\r?\n/);
  let start = -1;
  let baseIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^(\\s*)${keyName}\\s*:`));
    if (m) { start = i; baseIndent = m[1].length; break; }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const indentMatch = lines[i].match(/^(\s*)\S/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    if (indent <= baseIndent) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}
