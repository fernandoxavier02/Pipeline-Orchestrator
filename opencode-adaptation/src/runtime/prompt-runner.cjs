'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { appendEvidence } = require('../state/evidence-writer.cjs');

function isProtectedOriginalTarget(target) {
  return path.resolve(target).split(path.sep).includes('Pipeline-Orchestrator');
}

function isInsideDirectory(target, directory) {
  const relative = path.relative(directory, path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function runPrompt({ stateRoot, runId, batchId, sliceId, prompt, expectedOutput, target, environment, fabricated, execute }) {
  if (fabricated) {
    return { ok: false, code: 'FABRICATED_PROMPT_REJECTED' };
  }
  const adaptationRoot = path.resolve(__dirname, '..', '..');
  if (!isInsideDirectory(target, adaptationRoot)) {
    if (isProtectedOriginalTarget(target)) {
      return { ok: false, code: 'PROTECTED_ORIGINAL_TARGET' };
    }
    return { ok: false, code: 'TARGET_OUTSIDE_ADAPTATION' };
  }

  const output = execute({ prompt, target, environment });
  if (output.fabricated) {
    return { ok: false, code: 'FABRICATED_PROMPT_REJECTED' };
  }

  const actualOutput = output.actualOutput || '';
  const verdict = actualOutput === expectedOutput ? 'pass' : 'fail';
  const rawLogPath = path.join(stateRoot, 'runs', runId, 'prompt-logs', `${sliceId}.log`);
  fs.mkdirSync(path.dirname(rawLogPath), { recursive: true });
  fs.writeFileSync(rawLogPath, output.rawLog || actualOutput);

  appendEvidence({
    stateRoot,
    runId,
    batchId,
    sliceId,
    type: 'prompt.recorded',
    artifactOrigin: 'adaptation-owned',
    payload: {
      prompt,
      expectedOutput,
      actualOutput,
      rawLogPath,
      target,
      environment,
      timestamp: new Date().toISOString(),
      verdict,
    },
  });

  return { ok: true, verdict, rawLogPath };
}

module.exports = { runPrompt, isProtectedOriginalTarget, isInsideDirectory };
