#!/usr/bin/env node
// =============================================================================
// F9 test harness wrapper — Windows-safe alternative to NODE_OPTIONS=--require
// =============================================================================
// PURPOSE
//   On Windows, passing `NODE_OPTIONS="--require <path>"` through env-var
//   inheritance and shell quoting strips/mangles backslashes in paths like
//   `C:\Users\...\AppData\Local\Temp\f9-mock-XYZ\preload.cjs`. The child node
//   process then fails with "Cannot find module" before the test scenario
//   even runs — producing spurious RED that does not reflect production
//   behavior.
//
//   This wrapper sidesteps NODE_OPTIONS entirely. The parent test process
//   spawns this script with two positional args:
//     argv[2] = absolute path to the preload (mock SDK installer)
//     argv[3] = absolute path to the script under test (hook or probe)
//
//   We:
//     1. require() the preload synchronously — this installs the mock
//        langfuse module in require.cache BEFORE any production code loads.
//     2. require() the target script — which then runs as if it were the
//        process entry point. Production code that does `require('langfuse')`
//        will resolve to the mock injected by step 1.
//
//   Both requires use absolute paths, so no shell quoting or path-resolution
//   ambiguity. The wrapper itself is loaded by node via a normal positional
//   argument (process.argv[1]), which is fully Windows-safe.
//
// CONTRACT
//   - argv[2] MUST be an absolute path to a CommonJS module that performs
//     mock-installation side effects on require()-time. It is loaded for its
//     side effects only; its exports are discarded.
//   - argv[3] MUST be an absolute path to a CommonJS module (hook or probe
//     script). It is loaded as if it were the process entry point. Any
//     errors it throws propagate naturally and are caught by node's default
//     unhandled-exception handler (exit code 1) — same as if node had been
//     spawned directly with that script.
//   - process.argv is rewritten so the target script sees itself as argv[1]
//     (matches the convention of `node target.cjs` — important for any
//     `require.main === module` guard in the target).
//
// SECURITY / SCOPE
//   - This is a TEST-ONLY helper. It MUST NOT be loaded by production code.
//   - It does no path validation beyond require()'s own — argv[2] and
//     argv[3] are assumed trusted (controlled by the test harness, not
//     user input).
// =============================================================================

'use strict';

if (process.argv.length < 4) {
  process.stderr.write(
    '_run-with-preload.cjs: expected 2 args (preload-path, target-script-path)\n'
  );
  process.exit(2);
}

const preloadPath = process.argv[2];
const targetScript = process.argv[3];

// Load the mock-installer for its require.cache side effects.
require(preloadPath);

// Make the target script see itself as the entry point. Drop our own argv[1]
// (this wrapper) and the two positional args so target sees a clean argv.
process.argv = [process.argv[0], targetScript];

// IMPORTANT: many hooks/probes guard their entry with
//   `if (require.main === module) main();`
// If we just `require(targetScript)`, the target sees itself as a child
// module of this wrapper — require.main points to the wrapper, the guard
// fails, and main() never runs. The target loads but does nothing,
// producing exit 0 with zero captured calls — exactly the failure mode
// observed on F9 RED runs.
//
// Fix: use Module.runMain() semantics — set process.mainModule and
// require.main to the target before loading it. We do this by creating
// the target Module instance manually and running its load() ourselves.
const Module = require('node:module');
const targetModule = new Module(targetScript, null);
targetModule.filename = targetScript;
targetModule.paths = Module._nodeModulePaths(require('node:path').dirname(targetScript));
require.main = targetModule;
process.mainModule = targetModule;
// Insert into the require cache BEFORE loading so any self-require
// (rare but possible) resolves to the same instance.
require.cache[targetScript] = targetModule;
// Load (compile + execute) the target. Throws propagate to node's default
// uncaught-exception handler (exit 1) — same behavior as `node <target>`.
targetModule.load(targetScript);
