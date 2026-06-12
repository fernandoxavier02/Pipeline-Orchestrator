# Tasks: Claude Code Loop Hardening

Status: DRAFT
Runtime target: Claude Code by Anthropic
Execution mode: Claude Code Go mode

## Global execution protocol

These tasks must be executed in order. Each group is a loop-engineered delivery unit.

For every group:

1. Read this group's requirements and acceptance criteria.
2. Write or update ATDD scenarios first.
3. Define DDD vocabulary and invariants before coding.
4. Write BDD behavior scenarios for Claude Code runtime behavior.
5. Write failing TDD tests before implementation.
6. Implement the smallest coherent change.
7. Run the group's tests.
8. Run an isolated adversarial review.
9. If the adversarial review finds problems, send findings back to implementer or bugfix agent.
10. Re-run tests and review.
11. Stop the same approach after the third failed review.
12. If the third review still finds problems, create `alternative_approach.md` for that group and implement a materially different approach.
13. Record evidence under `.pipeline/reviews/<group-id>/`.

Loop cap:

```text
max_adversarial_fix_loops_per_group = 3
```

Required evidence after each group:

```text
.pipeline/reviews/<group-id>/tests.md
.pipeline/reviews/<group-id>/adversarial-review-attempt-1.md
.pipeline/reviews/<group-id>/adversarial-review-attempt-2.md        optional if attempt 1 is clean
.pipeline/reviews/<group-id>/adversarial-review-attempt-3.md        optional if attempt 1 or 2 is clean
.pipeline/reviews/<group-id>/alternative_approach.md                required only after third failed review
```

## Group G0: Claude Code scope lock and implementation setup

Goal: prevent the remediation from drifting into Codex or unrelated architecture work.

### Explicit corrections

- Add a short implementation note that Claude Code is the runtime target.
- Identify files that are Claude Code runtime surfaces.
- Identify Codex-specific files as non-primary.
- Create a working branch for implementation.
- Do not touch marketplace release refs until tests and watchdog pass.

### ATDD

Scenario: Claude Code primary scope

```gherkin
Given the implementation agent reads the remediation spec
When it selects files to modify
Then Claude Code manifests, hooks, agents, skills and commands are prioritized
And Codex-specific files are not treated as primary runtime behavior
```

### DDD

Vocabulary:

- `ClaudeCodeRuntime`: the Anthropic Claude Code plugin execution environment.
- `PluginRuntimeSurface`: manifests, hooks, commands, skills, agents and libs consumed by Claude Code.
- `CompatibilityConsumer`: any non-Claude-Code path that imports shared libraries.

Invariant:

- A compatibility consumer may be updated only to consume a shared fix, not to redefine the product direction.

### BDD

```gherkin
Feature: Runtime target clarity
  Scenario: Implementation plan is inspected by a reviewer
    Given the reviewer opens the spec files
    Then the target runtime is Claude Code
    And the implementation does not instruct the agent to rebuild around Codex
```

### TDD

Add a static spec test if the repo has spec validation infrastructure. Otherwise add a release checklist assertion in the watchdog:

- Fail if release notes describe the fix as Codex-first.
- Fail if Claude Code manifest verification is missing.

### Adversarial review prompt

Review whether any task or code change makes Codex the primary target. Flag any drift as HIGH.

## Group G1: Version source of truth and release metadata

Goal: eliminate version drift across repo, marketplace and runtime exports.

### Explicit corrections

- Create a single version source of truth.
- Update `package.json` version strategy.
- Update `.claude-plugin/plugin.json` version strategy.
- Update `.claude-plugin/marketplace.json` plugin version and description strategy.
- Update README badge or README version text.
- Update `lib/index.cjs` exported `version` so it no longer says an old version.
- Update hook banners that announce old versions.
- Add `scripts/sync-version.cjs` or equivalent.
- Add `tests/regression/version-sync` or `tests/unit/version-sync`.

### ATDD

```gherkin
Feature: Version consistency
  Scenario: A marketplace user installs the plugin
    Given the repo has release version X
    When the plugin is installed through Claude Code marketplace
    Then plugin metadata reports version X
    And the runtime export reports version X
    And README reports version X
```

### DDD

Vocabulary:

- `ReleaseVersion`: semantic version for the plugin release.
- `VersionSurface`: every file that displays or exports the plugin version.
- `MarketplaceRef`: immutable ref used by marketplace users to receive the release.

Invariants:

- Every `VersionSurface` must equal `ReleaseVersion`.
- Marketplace metadata must not contain a stale version.

### BDD

```gherkin
Feature: Version sync command
  Scenario: Developer changes the version
    Given VERSION is set to 7.13.0
    When scripts/sync-version.cjs runs
    Then package.json version is 7.13.0
    And .claude-plugin/plugin.json version is 7.13.0
    And lib/index.cjs exports 7.13.0
```

### TDD

Write failing tests first:

- Test `readVersionSurfaces()` returns all required files.
- Test mismatch between `package.json` and `lib/index.cjs` fails.
- Test README badge mismatch fails.
- Test hook banner mismatch fails if banners include versions.

### Implementation tasks

1. Decide source of truth: `VERSION` file or `package.json.version`.
2. Implement version reader.
3. Implement sync script.
4. Replace hardcoded export in `lib/index.cjs`.
5. Shorten marketplace description if needed so release notes are not the description body.
6. Add test runner inclusion.
7. Run version tests.

### Adversarial review prompt

Review for hidden version strings, stale changelog-as-description, marketplace ref mismatch and untested surfaces. If any untested version surface remains, return findings.

## Group G2: Claude Code hook manifest and packaging coherence

Goal: ensure Claude Code installs all active hooks and package allowlist includes them.

### Explicit corrections

- Determine which manifest Claude Code consumes for plugin hooks.
- Make one hook manifest canonical.
- Generate or validate any compatibility manifest.
- Ensure `package.json.files` includes the canonical hook manifest and all referenced hooks.
- Add packaging smoke test.
- Fail if `.claude/settings.json` registers only Stop while another manifest registers security hooks and that other manifest is not shipped.

### ATDD

```gherkin
Feature: Claude Code hook installation
  Scenario: Plugin is installed through marketplace
    Given the plugin package has been built
    When Claude Code loads the plugin
    Then sentinel hook is registered
    And edit guard hook is registered
    And scope lock hook is registered
    And session lock hook is registered
    And stop hook is registered
```

### DDD

Vocabulary:

- `HookManifest`: the file Claude Code reads to register hooks.
- `HookTarget`: a script referenced by a hook command.
- `PackagedRuntimeFile`: a file included in the installable plugin artifact.

Invariants:

- Every `HookTarget` must be a `PackagedRuntimeFile`.
- The canonical manifest must be discoverable from the installed plugin root.

### BDD

```gherkin
Feature: Hook manifest validation
  Scenario: A hook is referenced but missing from the package
    Given hook manifest references .claude/hooks/sentinel-hook.cjs
    And package files exclude .claude/hooks
    When packaging validation runs
    Then validation fails
```

### TDD

Write failing tests first:

- Parse canonical manifest and list hook command paths.
- Assert every command path exists in repo.
- Assert every command path is included by package allowlist.
- Assert no hook manifest drift between canonical and compatibility copy.
- Assert install simulation can resolve `${CLAUDE_PLUGIN_ROOT}` commands.

### Implementation tasks

1. Inspect Claude Code plugin docs or installed behavior if available locally.
2. Select canonical manifest.
3. Move or generate manifests as needed.
4. Update `package.json.files`.
5. Add `scripts/validate-hook-manifest.cjs`.
6. Add `tests/packaging/hook-manifest.test.cjs`.
7. Run packaging tests.

### Adversarial review prompt

Review whether a real Claude Code marketplace install would miss any security hook. Treat missing `PreToolUse` protection as CRITICAL.

## Group G3: Sentinel HMAC enforcement

Goal: make sentinel integrity real, enforced and tested.

### Explicit corrections

- Replace shallow canonicalization with recursive stable canonicalization.
- Remove hardcoded obsolete plugin version from HMAC key path.
- Integrate signed writes into all Claude Code sentinel state writers.
- Integrate signature verification into `sentinel-hook.cjs`.
- Add strict mode default for new active states.
- Add migration mode only if required, with auditable warning.
- Ensure tampering with nested objects changes signature.
- Ensure malformed or unsigned active state fails closed in strict mode.

### ATDD

```gherkin
Feature: Sentinel tamper protection
  Scenario: Active sentinel state is tampered
    Given a signed active sentinel-state.json
    When expected_next is changed without re-signing
    Then sentinel-hook denies protected Agent dispatch

  Scenario: Nested metadata is tampered
    Given a signed active sentinel-state.json with nested metadata
    When nested metadata is changed without re-signing
    Then signature verification fails
```

### DDD

Vocabulary:

- `SignedSentinelState`: sentinel state with valid `__signature`.
- `TrustedActiveState`: signed state that is active and schema-valid.
- `MigrationState`: unsigned legacy state allowed only under explicit migration mode.
- `TamperedState`: state whose signature does not match canonical body.

Invariants:

- `TrustedActiveState` requires a valid signature.
- `expected_next`, `pipeline_active`, `schema_version`, `run_id`, `pipeline_doc_path` and nested fields are signature-protected.
- A hook must not use active state for enforcement if verification fails.

### BDD

```gherkin
Feature: Sentinel hook verification
  Scenario: Unsigned state in strict mode
    Given PIPELINE_HMAC_STRICT=true
    And an active sentinel-state.json has no signature
    When a pipeline-orchestrator Agent is spawned
    Then the hook denies the spawn
    And the denial reason mentions unsigned state
```

### TDD

Write failing tests first:

- `canonicalize()` sorts nested object keys recursively.
- `canonicalize()` preserves array order.
- `signState()` excludes `__signature` only.
- `verifyState()` rejects tampered nested fields.
- `verifyState()` handles signature length mismatch safely.
- `sentinel-hook` denies invalid signature in strict mode.
- `sentinel-hook` warns but allows only when explicit migration env is set.

### Implementation tasks

1. Add `stableCanonicalize` to `lib/sentinel-state-signer.cjs` or new shared module.
2. Fix `timingSafeEqual` length mismatch behavior.
3. Replace hardcoded version path with current plugin version or plugin root derived key path.
4. Identify all Claude Code writers of `sentinel-state.json`.
5. Route those writers through `writeSignedState` or equivalent.
6. Update `sentinel-hook.cjs` to call `readVerifiedState` before state checks.
7. Add strict/migration env behavior.
8. Add tests and fixtures.

### Adversarial review prompt

Try to bypass sentinel by editing `pipeline_active`, `schema_version`, `expected_next`, nested metadata, key path and signature length. Flag any fail-open path as CRITICAL.

## Group G4: Controller tools and prompt consistency

Goal: remove contradictions between Claude Code agent frontmatter and prompt text.

### Explicit corrections

- Remove `Bash` from `pipeline-controller` if the prompt says Bash is unavailable.
- Scan all agents for similar contradictions.
- Align tool names in docs: do not say `TaskCreate` or `TaskUpdate` unless those are real Claude Code tools.
- Ensure `TodoWrite`, `Task` or actual progress tool naming is consistent.
- Add a static frontmatter-prompt consistency test.

### ATDD

```gherkin
Feature: Tool permission honesty
  Scenario: Agent says it cannot use Bash
    Given an agent prompt says Bash is unavailable
    When frontmatter is parsed
    Then Bash is not listed in tools
```

### DDD

Vocabulary:

- `DeclaredTool`: tool listed in frontmatter.
- `PromptCapabilityClaim`: prompt statement about available or unavailable tools.
- `ToolContradiction`: a mismatch between declaration and claim.

Invariant:

- No `ToolContradiction` may exist for mutating or shell tools.

### BDD

```gherkin
Feature: Controller does not have undeclared shell power
  Scenario: Pipeline controller runs in Claude Code
    Given pipeline-controller is spawned
    Then it cannot directly run Bash unless the design explicitly allows it
```

### TDD

Write failing tests first:

- Parse agent frontmatter tools.
- Scan prompt body for phrases like `do not have Bash`, `cannot use Bash`, `no Bash tool`.
- Fail if the same tool is listed.
- Scan docs for non-existent progress tool names.

### Implementation tasks

1. Remove or justify `Bash` from controller frontmatter.
2. Fix prompt text if shell access is truly intended.
3. Normalize progress tool names to actual Claude Code tooling.
4. Add static test coverage.
5. Run agent manifest tests.

### Adversarial review prompt

Review whether any agent has more tool power than its prompt claims. Treat shell and write tool mismatches as HIGH.

## Group G5: Session lock entry point registry

Goal: ensure every Claude Code slash command that starts a pipeline opens a session lock.

### Explicit corrections

- Replace hand-maintained regex with generated or shared entrypoint registry.
- Include central, thin, light and heavy variants.
- Include hyphenated aliases such as `user-story` and `ux-sim`.
- Include legacy aliases only if still supported.
- Add tests for uppercase and mixed-case invocations.

### ATDD

```gherkin
Feature: Session lock coverage
  Scenario Outline: Pipeline entry point is invoked
    Given the user submits "<command> do work"
    When UserPromptSubmit hook runs
    Then a session lock is created or refreshed

    Examples:
      | command |
      | /pipeline-orchestrator:pipeline |
      | /pipeline-orchestrator:bugfix-light |
      | /pipeline-orchestrator:feature-heavy |
      | /pipeline-orchestrator:user-story |
      | /pipeline-orchestrator:user-story-heavy |
      | /pipeline-orchestrator:audit-light |
      | /pipeline-orchestrator:ux-sim-heavy |
      | /pipeline-orchestrator:spec-light |
```

### DDD

Vocabulary:

- `PipelineEntryPoint`: slash command that can start protected pipeline work.
- `LockProtectedInvocation`: prompt submission that must create a lock.
- `AliasEntryPoint`: legacy or convenience command resolving to canonical entry point.

Invariant:

- Every `PipelineEntryPoint` is a `LockProtectedInvocation`.

### BDD

```gherkin
Feature: Thin skill cannot bypass lock
  Scenario: User invokes a light skill directly
    Given the command is /pipeline-orchestrator:feature-light
    When the hook processes the prompt
    Then edit protection is active before implementation begins
```

### TDD

Write failing tests first:

- Test existing uncovered commands fail under current regex.
- Test generated registry includes all skills under `skills/*/SKILL.md` that are pipeline entry points.
- Test case-insensitive matching.
- Test non-pipeline command does not create lock.

### Implementation tasks

1. Build entrypoint registry from skill manifests or define shared registry in `lib/pipeline-entrypoints.cjs`.
2. Update `session-lock-hook.cjs` to use registry.
3. Update `force-pipeline-agents.cjs` if it has parallel command detection.
4. Add regression tests.
5. Add docs explaining aliases.

### Adversarial review prompt

Try to invoke a pipeline-changing command without creating a lock. Include hyphen variants, uppercase and direct thin skills. Flag bypass as CRITICAL.

## Group G6: Gate decision vocabulary and prompt scan

Goal: make documented gate decisions match the canonical writer.

### Explicit corrections

- Replace non-canonical `decision: FORCE_VARIANT_OVERRIDDEN` with canonical decision plus detail.
- Scan all prompts, docs, tests and fixtures for `decision:` values.
- Update examples to use only canonical decisions.
- Keep richer semantics in `detail` or protocol events.

### ATDD

```gherkin
Feature: Gate decision vocabulary is canonical
  Scenario: Prompt instructs a gate log write
    Given a prompt contains a gate decision example
    When the static scanner runs
    Then every decision value is canonical
```

### DDD

Vocabulary:

- `CanonicalDecision`: one of the eight allowed machine decisions.
- `DecisionNarrative`: human-readable reason stored outside the decision field.
- `GateEvent`: structured audit event for a named gate.

Invariant:

- `GateEvent.decision` must be a `CanonicalDecision`.

### BDD

```gherkin
Feature: Strict Spec rejection event
  Scenario: STRICT_SPEC overrides forced spec variant
    Given STRICT_SPEC rejects ambiguous Spec detection
    When the controller logs STRICT_SPEC_REJECTION
    Then decision is TRIGGERED
    And detail includes FORCE_VARIANT_OVERRIDDEN
```

### TDD

Write failing tests first:

- Scan `agents/**/*.md`, `commands/**/*.md`, `skills/**/*.md`, `references/**/*.md` for `decision:` examples.
- Fail on values not in canonical set.
- Runtime writer still throws on invalid direct input.
- Fidelity reporter still accepts canonical set from writer.

### Implementation tasks

1. Add static scanner script or test.
2. Replace non-canonical prompt examples.
3. Update tests/fixtures if they assert old values.
4. Run writer and reporter tests.

### Adversarial review prompt

Search for hidden non-canonical decisions and paths that bypass `gate-decision-writer`. Flag any first-party invalid decision as HIGH.

## Group G7: Unified JSONL writer with concurrency protection

Goal: make audit logs robust under parallel Claude Code agent activity.

### Explicit corrections

- Create a safe JSONL writer with lock and stale lock recovery.
- Route `safeAppendJsonl` through the new writer or upgrade it directly.
- Route protocol event writes away from raw `fs.appendFileSync` in Claude Code runtime paths.
- Update comments that claim exclusive file lock where none existed.
- Keep run-log writer behavior but dedupe shared logic where practical.

### ATDD

```gherkin
Feature: Concurrent JSONL audit writes
  Scenario: Multiple hooks append at the same time
    Given 20 concurrent append requests
    When they write to gate-decisions.jsonl
    Then the file contains 20 parseable JSON lines
    And no line is interleaved or truncated
```

### DDD

Vocabulary:

- `JsonlRecord`: one newline-delimited JSON object.
- `JsonlWriter`: component that serializes, validates and appends records.
- `WriterLock`: exclusive file lock with stale recovery.

Invariants:

- Every `JsonlRecord` is parseable.
- Free-text fields cannot create extra JSONL rows.
- A stale lock cannot block future writes indefinitely.

### BDD

```gherkin
Feature: Protocol event safety
  Scenario: Protocol detail contains newline and quotes
    Given a protocol event detail contains untrusted text
    When it is appended
    Then the JSONL file remains parseable
    And the detail is sanitized
```

### TDD

Write failing tests first:

- Append with newline injection.
- Append with control characters.
- Append concurrently.
- Simulate stale lock.
- Confirm unknown fields are handled according to per-log schema.
- Confirm protocol events use the writer.

### Implementation tasks

1. Add `lib/jsonl-writer.cjs` or strengthen `lib/jsonl-sanitizer.cjs`.
2. Move lock logic into shared helper.
3. Update `gate-decision-writer.cjs`.
4. Update protocol event append paths.
5. Update run-log writer only if shared lock can be adopted safely.
6. Update comments and docs.
7. Add tests.

### Adversarial review prompt

Attempt JSONL injection, concurrent corruption and stale lock denial of service. Flag corruptible JSONL as CRITICAL.

## Group G8: Test runner completeness and timeout

Goal: make `npm test` actually cover all required Claude Code safety surfaces.

### Explicit corrections

- Add unit tests to default discovery.
- Add compat tests where relevant.
- Add packaging tests.
- Add watchdog tests.
- Add per-test timeout to runner.
- Add category flags.
- Fail if expected category folder exists but is not included.

### ATDD

```gherkin
Feature: Complete test suite
  Scenario: Unit test exists
    Given tests/unit/example.test.cjs exists
    When npm test runs
    Then that test is executed
```

### DDD

Vocabulary:

- `TestCategory`: unit, regression, hooks, compat, packaging, watchdog.
- `RequiredTestCategory`: category that must run in release validation.
- `TimedTestProcess`: child test process with timeout.

Invariant:

- `npm test` runs every `RequiredTestCategory`.

### BDD

```gherkin
Feature: Hung test handling
  Scenario: A test never exits
    Given a test process exceeds timeout
    When the runner observes timeout
    Then it kills the test
    And reports the suite as failed
```

### TDD

Write failing tests first:

- Unit category discovery.
- Compat category discovery.
- Packaging category discovery.
- Timeout behavior using a fixture test.
- Clear failure output.

### Implementation tasks

1. Refactor `scripts/run-tests.cjs` category discovery.
2. Add timeout with `spawn` or `spawnSync` timeout option.
3. Add CLI flags.
4. Add test category validation.
5. Update `package.json` scripts if needed.
6. Run full suite.

### Adversarial review prompt

Review whether a critical test folder can be silently skipped or a hung test can freeze the runner. Flag as HIGH.

## Group G9: Fidelity and audit semantics cleanup

Goal: prevent misleading audit metrics.

### Explicit corrections

- Clarify whether `fidelity_score` means gate coverage.
- Add `gate_coverage_score` if needed.
- Add or document `quality_outcome_score` or final decision distinction.
- Avoid coercing unknown audit values into zero unless zero is semantically true.
- Update reports and docs.

### ATDD

```gherkin
Feature: Audit score truthfulness
  Scenario: All gates are triggered but final decision is NO-GO
    Given gate coverage is complete
    And final decision is NO-GO
    When the report is generated
    Then gate coverage is high
    But quality outcome is not reported as successful
```

### DDD

Vocabulary:

- `GateCoverageScore`: percentage of expected mandatory gates that appeared.
- `QualityOutcome`: GO, CONDITIONAL or NO-GO result.
- `UnknownMetric`: value not available from evidence.

Invariant:

- `UnknownMetric` must not be silently converted to zero.

### BDD

```gherkin
Feature: Unknown duration
  Scenario: Start timestamp lacks time component
    Given run start timestamp is date-only
    When run-log entry is built
    Then duration_seconds is null or unknown
    And it is not written as 0 unless documented as zero duration
```

### TDD

Write failing tests first:

- NO-GO with complete gate coverage does not imply quality success.
- Unknown expected gates remain unknown.
- Unknown duration remains unknown.
- Report labels are clear.

### Implementation tasks

1. Decide naming: keep `fidelity_score` with clearer docs or introduce `gate_coverage_score`.
2. Update reporter JSON schema.
3. Update Markdown report wording.
4. Update run-log normalization if needed.
5. Update tests and docs.

### Adversarial review prompt

Review whether audit output can mislead a user into thinking a failed run was high quality. Flag ambiguity as MEDIUM or HIGH depending on severity.

## Group G10: Claude Code marketplace release and GitHub publication

Goal: publish the corrected plugin so marketplace users receive it.

### Explicit corrections

- Update `.claude-plugin/marketplace.json` plugin entry to new version and release ref.
- Update `.claude-plugin/plugin.json` version and concise description.
- Ensure package allowlist includes release-critical files.
- Commit and push implementation branch.
- Open or update PR.
- After merge, create a release tag.
- Update marketplace ref to tag or immutable commit if required by release process.
- Verify users installing from marketplace receive the new ref.

### ATDD

```gherkin
Feature: Marketplace users receive update
  Scenario: Marketplace metadata is consumed
    Given marketplace source.ref points to vX
    When a user installs or updates the plugin
    Then Claude Code resolves plugin version X
```

### DDD

Vocabulary:

- `ReleaseRef`: immutable tag or commit used by marketplace.
- `MarketplacePluginEntry`: plugin object in `.claude-plugin/marketplace.json`.
- `PublishedPluginVersion`: version available to marketplace users.

Invariant:

- `MarketplacePluginEntry.version` and `ReleaseRef` must describe the same release.

### BDD

```gherkin
Feature: GitHub release
  Scenario: Release is complete
    Given all tests and watchdog pass
    When the agent publishes the release
    Then GitHub has the commit
    And marketplace metadata points to the release ref
```

### TDD

Write failing tests first:

- Marketplace metadata version equals source-of-truth version.
- Marketplace source ref equals expected tag pattern.
- Package files include marketplace and hook files.

### Implementation tasks

1. Update metadata only after implementation tests pass.
2. Commit changes with clear message.
3. Push branch.
4. Create PR or update existing PR.
5. Merge only after tests pass.
6. Tag release.
7. Push tag.
8. Verify default branch marketplace metadata.

### Adversarial review prompt

Review whether marketplace users would receive a stale version, moving ref, missing hook or broken package. Flag release ambiguity as HIGH.

## Group G11: Drive D repository sync and global Claude Code availability

Goal: ensure the separate drive D repo and global Claude Code installation see the corrected plugin.

### Explicit corrections

- Detect the drive D repository safely.
- Verify its Git remote matches this repository.
- Fetch and checkout the released ref.
- Do not hard reset or clean destructively without backup.
- Refresh global Claude Code plugin installation using official mechanism where available.
- If filesystem sync is required, backup the prior global plugin directory.
- Verify from a different project directory that Claude Code can see the plugin.

### ATDD

```gherkin
Feature: Global Claude Code availability
  Scenario: Plugin is synced globally
    Given the corrected release exists
    When the drive D repo and global Claude Code plugin are refreshed
    Then a project outside the repo can invoke the plugin
    And it reports the corrected version
```

### DDD

Vocabulary:

- `DriveDRepo`: local repository clone on drive D.
- `GlobalClaudeCodeInstall`: plugin installation visible to all Claude Code projects.
- `GlobalAvailabilityProof`: evidence captured outside the implementation repo.

Invariant:

- Global sync must never target an unverified path.

### BDD

```gherkin
Feature: Safe local sync
  Scenario: Multiple drive D candidates exist
    Given two folders on D: have matching repo names
    When the sync detector runs
    Then it stops and reports candidates
    And does not overwrite either
```

### TDD

Write failing tests first where feasible:

- Remote verification logic.
- Multiple candidate detection.
- Backup path generation.
- Version verification after sync.

### Implementation tasks

1. Add or document sync script, for example `scripts/sync-global-claude-code-plugin.cjs`.
2. Detect `PIPELINE_ORCHESTRATOR_D_REPO` first.
3. Verify Git remote.
4. Fetch and checkout release ref.
5. Use official Claude Code plugin update command if available.
6. If filesystem sync is used, backup current target first.
7. Verify from outside repo.
8. Write proof to watchdog output.

### Adversarial review prompt

Review path handling, accidental overwrite risk, wrong repo risk and false success reporting. Flag unsafe sync as CRITICAL.

## Group G12: Watchdog final verification

Goal: prove the remediation ran according to the spec.

### Explicit corrections

- Add a watchdog script or documented watchdog command.
- Verify version sync.
- Verify hook manifest packaging.
- Verify HMAC sentinel enforcement.
- Verify session lock entrypoints.
- Verify gate decision scan.
- Verify JSONL concurrency behavior.
- Verify tests ran.
- Verify adversarial evidence exists per group.
- Verify marketplace ref.
- Verify drive D and global Claude Code availability.

### ATDD

```gherkin
Feature: Watchdog blocks incomplete release
  Scenario: A task group lacks adversarial review evidence
    Given implementation code changed group G5
    And no adversarial-review-attempt file exists for G5
    When watchdog runs
    Then watchdog fails
```

### DDD

Vocabulary:

- `WatchdogCheck`: final verification assertion.
- `EvidenceArtifact`: file proving a task, test or review occurred.
- `ReleaseBlocker`: missing evidence or failed check that blocks release.

Invariant:

- Missing evidence is a `ReleaseBlocker`.

### BDD

```gherkin
Feature: Watchdog release gate
  Scenario: All checks pass
    Given implementation tests passed
    And adversarial reviews are clean
    And marketplace metadata points to release ref
    And global Claude Code install reports the new version
    When watchdog runs
    Then it writes PASS report
```

### TDD

Write failing tests first:

- Missing review evidence fails.
- Missing marketplace ref fails.
- Missing global availability proof fails.
- Version mismatch fails.
- Hook manifest missing file fails.

### Implementation tasks

1. Implement `scripts/watchdog-cloudcode-hardening.cjs`.
2. Add `tests/watchdog/cloudcode-hardening-watchdog.test.cjs`.
3. Define JSON and Markdown output schema.
4. Run watchdog locally.
5. Add watchdog to release script.

### Adversarial review prompt

Try to fake success by leaving missing evidence, stale marketplace ref, skipped tests or local-only install. Flag false PASS as CRITICAL.

## Group G13: Final release execution

Goal: execute release only after all prior groups pass.

### Explicit corrections

- Run full test suite.
- Run watchdog.
- Confirm no unreviewed changes remain.
- Push to GitHub.
- Update marketplace.
- Tag release.
- Verify global Claude Code availability.

### ATDD

```gherkin
Feature: Release only after verification
  Scenario: Watchdog fails
    Given watchdog status is FAIL
    When release script is invoked
    Then release script stops before publishing marketplace update
```

### DDD

Vocabulary:

- `ReleaseGate`: required condition before publication.
- `PublishedRef`: ref visible to marketplace users.
- `ReleaseEvidence`: tests, watchdog, PR, tag and marketplace proof.

Invariant:

- No release without passing `ReleaseGate`.

### BDD

```gherkin
Feature: Safe release
  Scenario: Release succeeds
    Given tests pass
    And watchdog passes
    When release is published
    Then GitHub contains the release ref
    And marketplace users can install it
    And global Claude Code can use it from any project
```

### TDD

Write failing tests or release dry-run checks:

- Release script refuses dirty working tree unless allowed by CI.
- Release script refuses missing tag.
- Release script refuses marketplace version mismatch.

### Implementation tasks

1. Run `npm test`.
2. Run packaging tests.
3. Run watchdog.
4. Commit final changes.
5. Push branch.
6. Open PR with task group evidence summary.
7. Merge after review.
8. Create release tag.
9. Update marketplace source ref if tag created after merge.
10. Verify marketplace install.
11. Sync drive D repo.
12. Refresh global Claude Code plugin.
13. Verify plugin from another project.
14. Write final release evidence under `.pipeline/release/`.

### Adversarial review prompt

Review the final release path for stale refs, missing global sync, skipped watchdog and accidental publication of incomplete metadata. Flag any issue as release-blocking.

## Final completion criteria

The remediation is complete only when all conditions below are true:

- All task groups G0 through G13 have test evidence.
- Every group has adversarial review evidence.
- No group has unresolved critical or high findings.
- Any group that reached three failed loops has an alternative approach artifact.
- Full test suite passes.
- Watchdog passes.
- GitHub has the release branch, PR or merged commit.
- Marketplace metadata points to the release ref.
- Drive D repo is synchronized to the release ref.
- Global Claude Code installation reports the released version from outside the repo.

If any item is missing, the agent must report `RELEASE_BLOCKED` and list the missing evidence.
