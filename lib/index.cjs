'use strict';

/**
 * @fx-studio-ai/pipeline-orchestrator — public API surface.
 *
 * The plugin's primary distribution is via Claude Code marketplace
 * (`/plugin install pipeline-orchestrator`). This npm package exposes
 * the three security libraries as reusable Node modules, plus the
 * TRACE.md validator as a CLI binary (`pipeline-orchestrator-validate-trace`).
 *
 * Use cases:
 *   - Integrate JSONL sanitization or HMAC signing in external tooling
 *   - Validate TRACE.md files in CI without cloning the full plugin
 *   - Build a custom CLI that wraps the validators
 *
 * @example Sanitize a gate-decisions entry before append
 *   const { safeAppendJsonl } = require('@fx-studio-ai/pipeline-orchestrator/jsonl-sanitizer');
 *   safeAppendJsonl('./gate-decisions.jsonl', { gate: 'SSOT_CONFLICT', ... });
 *
 * @example Sign a sentinel-state object
 *   const { signState, verifyState } = require('@fx-studio-ai/pipeline-orchestrator/sentinel-state-signer');
 *   const signed = signState({ pipeline_active: true, ... });
 *
 * @example Parse a pipeline.local.md safely
 *   const { parsePipelineLocalFile } = require('@fx-studio-ai/pipeline-orchestrator/pipeline-local-parser');
 *   const result = parsePipelineLocalFile('./.claude/pipeline.local.md');
 *   if (!result.ok) console.error('violations:', result.violations);
 */

const jsonlSanitizer = require('./jsonl-sanitizer.cjs');
const sentinelStateSigner = require('./sentinel-state-signer.cjs');
const pipelineLocalParser = require('./pipeline-local-parser.cjs');
const codexOperationalRuntime = require('./codex-operational-runtime.cjs');

module.exports = {
  // Re-export all three libs as named groups
  jsonlSanitizer,
  sentinelStateSigner,
  pipelineLocalParser,
  codexOperationalRuntime,

  // Convenience flat re-exports (most common)
  safeAppendJsonl: jsonlSanitizer.safeAppendJsonl,
  sanitizeDetail: jsonlSanitizer.sanitizeDetail,
  signState: sentinelStateSigner.signState,
  verifyState: sentinelStateSigner.verifyState,
  parsePipelineLocal: pipelineLocalParser.parsePipelineLocal,
  parsePipelineLocalFile: pipelineLocalParser.parsePipelineLocalFile,
  runOperationalPipeline: codexOperationalRuntime.runOperationalPipeline,
  createFakeAgentAdapter: codexOperationalRuntime.createFakeAgentAdapter,

  // Metadata
  version: '8.5.0',
};
