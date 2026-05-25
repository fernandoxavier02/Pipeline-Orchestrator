'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { isInsideDirectory } = require('../runtime/prompt-runner.cjs');

const REQUIRED_PROMPT_FIELDS = Object.freeze([
  'prompt',
  'expectedOutput',
  'actualOutput',
  'rawLogPath',
  'target',
  'environment',
  'timestamp',
  'verdict',
]);

function validatePromptEvidence(event) {
  if (!event || event.type !== 'prompt.recorded') {
    return { ok: false, code: 'PROMPT_EVIDENCE_MISSING' };
  }
  if (event.payload && event.payload.fabricated) {
    return { ok: false, code: 'FABRICATED_PROMPT_EVIDENCE' };
  }
  for (const field of REQUIRED_PROMPT_FIELDS) {
    if (!event.payload || typeof event.payload[field] === 'undefined') {
      return { ok: false, code: 'PROMPT_EVIDENCE_FIELD_MISSING', field };
    }
  }
  const adaptationRoot = path.resolve(__dirname, '..', '..');
  if (!isInsideDirectory(event.payload.target, adaptationRoot)) {
    return { ok: false, code: 'PROMPT_TARGET_NOT_ADAPTATION' };
  }
  if (!isAllowedPromptTarget(event.payload.target, adaptationRoot)) {
    return { ok: false, code: 'PROMPT_TARGET_TYPE_NOT_ALLOWED' };
  }
  if (!isReadableNonEmptyFile(event.payload.rawLogPath)) {
    return { ok: false, code: 'PROMPT_RAW_LOG_MISSING' };
  }
  return { ok: true };
}

function isReadableNonEmptyFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && fs.readFileSync(filePath, 'utf8').length > 0;
  } catch (_error) {
    return false;
  }
}

function isAllowedPromptTarget(target, adaptationRoot) {
  const relative = path.relative(adaptationRoot, path.resolve(target)).replace(/\\/g, '/');
  return relative.startsWith('.opencode/skills/')
    || relative.startsWith('.opencode/agents/')
    || relative.startsWith('.opencode/plugins/')
    || relative === 'src/opencode/tool-adapter.cjs';
}

module.exports = { validatePromptEvidence, isAllowedPromptTarget, isReadableNonEmptyFile };
