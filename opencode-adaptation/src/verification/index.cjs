'use strict';

module.exports = {
  ...require('./atdd-suite.cjs'),
  ...require('./prompt-authenticity-suite.cjs'),
  ...require('./adversarial-fixture-suite.cjs'),
  ...require('./batch-transition-suite.cjs'),
};
