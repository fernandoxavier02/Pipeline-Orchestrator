'use strict';

const lockManager = require('./lock-manager.cjs');
const runStore = require('./run-store.cjs');
const evidenceWriter = require('./evidence-writer.cjs');
const integrityChecker = require('./integrity-checker.cjs');
const resumeSnapshot = require('./resume-snapshot.cjs');

const STATE_LAYER = 'state';

module.exports = {
  STATE_LAYER,
  ...lockManager,
  ...runStore,
  ...evidenceWriter,
  ...integrityChecker,
  ...resumeSnapshot,
};
