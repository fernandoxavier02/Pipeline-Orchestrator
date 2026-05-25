'use strict';

const dryRun = require('./dry-run.cjs');

const INSTALL_LAYER = 'install';

module.exports = { INSTALL_LAYER, ...dryRun };
