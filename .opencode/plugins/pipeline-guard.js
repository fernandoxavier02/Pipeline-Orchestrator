import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPipelineGuardHooks } = require('./pipeline-guard-runtime.cjs');

export const PipelineGuard = async function pipelineGuardPlugin(_input = {}, options = {}) {
  return createPipelineGuardHooks({
    getActiveRun: options.getActiveRun || (() => null),
    audit: options.audit || (() => {}),
  });
};

export default PipelineGuard;
