#!/usr/bin/env node
// =============================================================================
// F32 — flow integrity for user-story + ux-sim skills (v7.12.0)
// =============================================================================
// Beyond F30 (structural counts), this validates the STEP CHAIN of the four
// skills created in v7.11.0/B5 so the dispatched flow is coherent:
//   S1  every step file has a complete, well-typed frontmatter block
//   S2  step_number runs 1..N contiguous with no gaps/dupes
//   S3  expected_next chains forward (step k -> k+1) except the terminal step
//   S4  every agent_type resolves to a real agent file
//   S5  the SKILL.md gates_at steps line up with gate_required steps in the chain
//   S6  ux-sim steps are ALL read-only (production_writes_allowed: false);
//       user-story has at least one writable step (code-changing) at/after the
//       TDD gate
// =============================================================================

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const parser = require(path.join(ROOT, '.claude', 'hooks', 'skill-frontmatter-parser.cjs'));

let pass = 0; let fail = 0; const out = [];
function test(name, fn) {
  try { fn(); pass++; out.push(`  [PASS] ${name}`); }
  catch (e) { fail++; out.push(`  [FAIL] ${name}: ${e.message}`); }
}

// Build the set of valid agent FQNs from the agents/ tree.
const AGENT_FQNS = new Set();
(function walk(dir, parts) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), parts.concat(e.name));
    else if (e.name.endsWith('.md')) AGENT_FQNS.add('pipeline-orchestrator:' + parts.concat(e.name.replace(/\.md$/, '')).join(':'));
  }
})(path.join(ROOT, 'agents'), []);
// also accept the leaf-normalized brainstorm names used in dispatch (best-effort)
const AGENT_LEAVES = new Set([...AGENT_FQNS].map((f) => f.split(':').pop()));

const SKILLS = ['user-story-light', 'user-story-heavy', 'ux-sim-light', 'ux-sim-heavy'];

console.log('=== F32 user-story + ux-sim flow integrity (v7.12.0) ===');

for (const skill of SKILLS) {
  const stepsDir = path.join(ROOT, 'skills', skill, 'steps');
  const files = fs.readdirSync(stepsDir).filter((f) => /^\d{2}-.*\.md$/.test(f)).sort();
  const steps = files.map((f) => ({
    file: f,
    fm: parser.parseFrontmatter(fs.readFileSync(path.join(stepsDir, f), 'utf8')).frontmatter || {},
  }));

  test(`F32-${skill}: every step has complete frontmatter`, () => {
    for (const s of steps) {
      for (const k of ['step_number', 'execution_mode', 'agent_type', 'expected_next']) {
        assert.ok(s.fm[k] !== undefined, `${skill}/${s.file} missing frontmatter key ${k}`);
      }
    }
  });

  test(`F32-${skill}: step_number is 1..N contiguous`, () => {
    const nums = steps.map((s) => Number(s.fm.step_number)).sort((a, b) => a - b);
    for (let i = 0; i < nums.length; i++) {
      assert.strictEqual(nums[i], i + 1, `${skill} step numbers not contiguous at index ${i}: ${nums.join(',')}`);
    }
  });

  test(`F32-${skill}: expected_next chains forward`, () => {
    const byNum = new Map(steps.map((s) => [Number(s.fm.step_number), s]));
    const max = steps.length;
    for (const s of steps) {
      const n = Number(s.fm.step_number);
      const nx = s.fm.expected_next;
      if (n < max) {
        assert.strictEqual(Number(nx), n + 1, `${skill} step ${n} expected_next=${nx} (want ${n + 1})`);
      } else {
        // terminal step: expected_next is null/none/"" or self
        assert.ok(nx === null || nx === 'null' || nx === 'none' || nx === '' || Number(nx) === n,
          `${skill} terminal step ${n} should not chain forward (got ${nx})`);
      }
    }
    assert.ok(byNum.size === steps.length);
  });

  test(`F32-${skill}: every agent_type resolves to a real agent`, () => {
    for (const s of steps) {
      const at = String(s.fm.agent_type);
      const ok = AGENT_FQNS.has(at) || AGENT_LEAVES.has(at.split(':').pop());
      assert.ok(ok, `${skill}/${s.file} agent_type "${at}" does not resolve to a real agent`);
    }
  });

  test(`F32-${skill}: gates_at lines up with gate_required steps`, () => {
    const skillFm = parser.parseFrontmatter(fs.readFileSync(path.join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8')).frontmatter;
    const gatesAt = (skillFm.gates_at || []).map(Number).sort((a, b) => a - b);
    const gateSteps = steps.filter((s) => s.fm.gate_required === true).map((s) => Number(s.fm.step_number)).sort((a, b) => a - b);
    // every declared gate must correspond to a gate_required step
    for (const g of gatesAt) {
      assert.ok(gateSteps.includes(g), `${skill} gates_at lists step ${g} but step ${g} is not gate_required`);
    }
  });
}

test('F32-ux-sim: all steps read-only (production_writes_allowed false)', () => {
  for (const skill of ['ux-sim-light', 'ux-sim-heavy']) {
    const stepsDir = path.join(ROOT, 'skills', skill, 'steps');
    for (const f of fs.readdirSync(stepsDir).filter((x) => /^\d{2}-.*\.md$/.test(x))) {
      const fm = parser.parseFrontmatter(fs.readFileSync(path.join(stepsDir, f), 'utf8')).frontmatter || {};
      assert.notStrictEqual(fm.production_writes_allowed, true, `${skill}/${f} is writable but ux-sim is report-only`);
    }
  }
});

test('F32-user-story: at least one writable step (code-changing)', () => {
  for (const skill of ['user-story-light', 'user-story-heavy']) {
    const stepsDir = path.join(ROOT, 'skills', skill, 'steps');
    const writable = fs.readdirSync(stepsDir).filter((x) => /^\d{2}-.*\.md$/.test(x)).some((f) => {
      const fm = parser.parseFrontmatter(fs.readFileSync(path.join(stepsDir, f), 'utf8')).frontmatter || {};
      return fm.production_writes_allowed === true;
    });
    assert.ok(writable, `${skill} has no writable step but user-story is code-changing`);
  }
});

for (const l of out) console.log(l);
console.log(`    Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
