#!/usr/bin/env node
'use strict';

/**
 * F03 (v7.13.0) — R5: agent frontmatter `tools:` MUST match prompt text.
 *
 * A static scanner over agents/**.md that flags a ToolContradiction: the prose
 * states a (shell/mutating) tool is unavailable while the frontmatter grants it.
 * Plus a hard pin on pipeline-controller: it must NOT list Bash (prose says it
 * has no Bash tool) nor Task (per Achado #7 + Visible Progress Protocol the Task
 * tools live in the PARENT session, not the subagent controller), while keeping
 * the tools it genuinely needs.
 *
 * Pure Node + node:assert/strict + counter + process.exit.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '../../..');
const AGENTS_DIR = path.join(ROOT, 'agents');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  [PASS] ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}\n         ${e.message}`); fail++; }
}

console.log('=== F03 v7.13.0 agent frontmatter <-> prompt consistency ===');

// Sensitive tools whose grant must never contradict a prose denial.
const SENSITIVE_TOOLS = ['Bash', 'Task', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

function listAgentFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listAgentFiles(full));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function parseFrontmatter(rawInput) {
  const raw = String(rawInput).replace(/\r\n/g, '\n'); // tolerate CRLF (Windows checkouts)
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { tools: [], body: raw };
  const fm = m[1];
  const body = m[2];
  const toolsLine = fm.split('\n').find((l) => /^tools\s*:/.test(l));
  let tools = [];
  if (toolsLine) {
    tools = toolsLine.replace(/^tools\s*:/, '').trim()
      .replace(/^\[|\]$/g, '')
      .split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return { tools, body };
}

// Lines whose subject is ANOTHER actor (the parent / caller / main LLM) do not
// constrain THIS agent's own tool grants — e.g. "your caller (main LLM) does
// not have Write permissions" is true and not a contradiction of the agent
// having scoped Write. Skip such lines so the scanner judges self-claims only.
const OTHER_ACTOR = /\b(caller|main[\s-]?llm|main agent|main loop|parent|the user|your caller|controller-spawned)\b/i;

// A prose "denial" of a tool: explicit statement that the AGENT ITSELF lacks it.
function deniesTool(body, tool) {
  const t = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    // "(?!\s+to\b)" distinguishes "does not have X" (lacks X) from
    // "does not have to X" (not obligated to X) — the latter is not a denial.
    new RegExp(`(you\\s+)?(don't|do not|does not|doesn't|cannot|can't|won't)\\s+(have|use|run)(?!\\s+to\\b)\\b[^.\\n]{0,30}\\b${t}\\b`, 'i'),
    new RegExp(`(you )?(don't|do not) have( the)?\\s+\\(?\\b${t}\\b\\s*tool`, 'i'),
    new RegExp(`\\bno\\s+${t}\\s+tool\\b`, 'i'),
    new RegExp(`\\b${t}\\b[^.\\n]{0,40}\\b(stripped|removed|unavailable|not available)\\b`, 'i'),
    // Deliberately scoped to ABSENCE-OF-POSSESSION phrasings. "must not / may
    // not / forbidden to use X" are USE RESTRICTIONS, not denials of the tool —
    // an agent may legitimately hold Write while being told "must not Write
    // outside .pipeline/" (R5.3: mutating tools granted only where a hook scopes
    // them). Including those phrasings produced false positives on the scope
    // rules of pipeline-controller / brainstorm-controller, so they are excluded.
    new RegExp(`\\bnever\\s+(granted|given|provided)\\b[^.\\n]{0,20}\\b${t}\\b`, 'i'),
    new RegExp(`\\b${t}\\b[^.\\n]{0,25}\\b(is\\s+)?(not granted|absent|not provided)\\b`, 'i'),
  ];
  // Judge line-by-line so a negation's subject stays local; drop other-actor lines.
  for (const line of body.split('\n')) {
    if (OTHER_ACTOR.test(line)) continue;
    if (patterns.some((re) => re.test(line))) return true;
  }
  return false;
}

const agentFiles = listAgentFiles(AGENTS_DIR);

test(`scanner runs over a non-trivial agent roster (got ${agentFiles.length})`, () => {
  assert.ok(agentFiles.length >= 15, `expected >=15 agent files, got ${agentFiles.length}`);
});

test('no agent grants a sensitive tool its prose says it does NOT have', () => {
  const contradictions = [];
  for (const file of agentFiles) {
    const raw = fs.readFileSync(file, 'utf8');
    const { tools, body } = parseFrontmatter(raw);
    for (const tool of SENSITIVE_TOOLS) {
      if (tools.includes(tool) && deniesTool(body, tool)) {
        contradictions.push(`${path.relative(ROOT, file)} grants ${tool} but prose denies it`);
      }
    }
  }
  assert.equal(contradictions.length, 0,
    `ToolContradiction(s):\n  - ${contradictions.join('\n  - ')}`);
});

// --- hard pins on pipeline-controller -----------------------------------
const controllerPath = path.join(AGENTS_DIR, 'core', 'pipeline-controller.md');
const controller = parseFrontmatter(fs.readFileSync(controllerPath, 'utf8'));

test('pipeline-controller frontmatter does NOT grant Bash', () => {
  assert.ok(!controller.tools.includes('Bash'),
    `frontmatter tools must not include Bash (prose: "you don't have Bash tool"); got [${controller.tools.join(', ')}]`);
});

test('pipeline-controller frontmatter does NOT grant Task', () => {
  assert.ok(!controller.tools.includes('Task'),
    `frontmatter tools must not include Task (Achado #7: Task tools live in the PARENT session); got [${controller.tools.join(', ')}]`);
});

test('pipeline-controller keeps the tools it actually needs', () => {
  for (const need of ['Read', 'Write', 'Glob', 'Grep', 'Agent', 'AskUserQuestion']) {
    assert.ok(controller.tools.includes(need),
      `pipeline-controller must keep ${need}; got [${controller.tools.join(', ')}]`);
  }
});

console.log('');
console.log(`Summary: ${pass} pass / ${fail} fail / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
