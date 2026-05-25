'use strict';

const protectedSurfaces = require('./protected-surfaces.cjs');
const opencodeCapabilities = require('./opencode-capabilities.cjs');

const ADAPTATION_NAME = 'pipeline-orchestrator-opencode-adaptation';

module.exports = { ADAPTATION_NAME, ...protectedSurfaces, ...opencodeCapabilities };
