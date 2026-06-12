# Requirements: Claude Code Loop Hardening

Status: DRAFT
Runtime target: Claude Code by Anthropic
Implementation mode: Go mode with engineering loop enforcement

## Requirement levels

The terms MUST, SHOULD and MAY are used deliberately.

- MUST means the implementation is incomplete without it.
- SHOULD means required unless the agent documents a safer equivalent.
- MAY means optional and non-blocking.

## R1. Claude Code runtime primacy

R1.1 The implementation MUST target Claude Code by Anthropic as the primary runtime.

R1.2 Codex-specific files MUST NOT define primary behavior for this remediation.

R1.3 If a shared library is consumed by both Claude Code and Codex paths, changes MUST be justified by the Claude Code behavior they protect.

R1.4 Documentation MUST use `Claude Code` consistently. The term `CloudCode` MAY appear only as an alias in notes when referencing the user's wording.

Acceptance criteria:

- Given a user installs the plugin through the Claude Code marketplace, all hooks required by this remediation are available and active.
- Given a developer reads the spec, they cannot reasonably conclude that Codex is the target runtime.
- Given Codex files exist in the repo, their presence does not redirect implementation priorities away from Claude Code.

## R2. Version and release source of truth

R2.1 There MUST be one version source of truth.

R2.2 The following files MUST agree on the same plugin version after implementation:

- `package.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- README visible version badge or version text
- `lib/index.cjs` exported version
- hook startup banners or version notices
- any version-sync test fixture

R2.3 Version text in long descriptions SHOULD be shortened so marketplace metadata is readable and not a changelog landfill.

R2.4 CI or local tests MUST fail on version drift.

Acceptance criteria:

- A `version-sync` test fails before correction and passes after correction.
- The version displayed to a Claude Code user equals the version in `package.json`.
- Marketplace metadata points to the release ref that contains the same version.

## R3. Hook manifest and package coherence

R3.1 There MUST be a single canonical hook manifest for Claude Code installation.

R3.2 If multiple manifest files remain for compatibility, one MUST be generated from the canonical source or tested against it.

R3.3 All hooks referenced by the Claude Code manifest MUST be included in the distributed package.

R3.4 The package file allowlist MUST include every runtime file used by Claude Code hooks and commands.

R3.5 A packaging smoke test MUST simulate the installed package layout and assert that every referenced hook path exists.

Acceptance criteria:

- Given a clean marketplace install, `sentinel-hook`, `edit-guard-hook`, `scope-lock-hook`, `session-lock-hook`, `dispatch-guard`, `langfuse-hook`, cleanup hooks and `stop-hook` are present if referenced.
- No active hook is referenced only from an unshipped file.
- The Stop hook is not the only active security hook unless the design explicitly proves another Claude Code manifest activates the others.

## R4. Sentinel integrity enforcement

R4.1 `sentinel-state.json` MUST be signed when written during active pipeline runs.

R4.2 `sentinel-hook.cjs` MUST verify signatures before trusting active sentinel state.

R4.3 The signing implementation MUST use recursive canonicalization, not shallow `JSON.stringify` with top-level key sorting only.

R4.4 Strict mode MUST reject unsigned or tampered active states.

R4.5 Migration mode MAY allow unsigned legacy states, but it MUST emit an auditable warning and MUST NOT be the final default for this remediation.

R4.6 HMAC key storage MUST not be hardcoded to an obsolete plugin version.

R4.7 If signature verification cannot be performed, the hook MUST fail closed for active protected pipeline operations.

Acceptance criteria:

- Tampering with `pipeline_active`, `expected_next`, nested metadata or `schema_version` is detected.
- Unsigned active states are rejected when strict mode is on.
- The signer path works in the Claude Code installed plugin layout.
- Tests prove nested-object tampering changes the signature.

## R5. Controller tool permissions and prompt truthfulness

R5.1 Agent frontmatter MUST match the text of the agent prompt.

R5.2 `pipeline-controller` MUST NOT be granted `Bash` if its prompt says it cannot run Bash.

R5.3 Any tool that can mutate the filesystem MUST be granted only where a hook or explicit contract controls its use.

R5.4 Tool names in docs and prompts MUST match actual Claude Code tool names.

Acceptance criteria:

- A frontmatter consistency test catches a prompt that says a tool is absent while the tool is granted.
- `pipeline-controller` has only the tools required for Claude Code orchestration.
- Progress tools named in docs are either actual tools or are replaced by the correct Claude Code tool name.

## R6. Session lock coverage for every Claude Code entry point

R6.1 Session lock detection MUST cover every supported `/pipeline-orchestrator:*` entry point.

R6.2 The command list MUST include central and thin skills, including bugfix, feature, user story, audit, UX simulation and spec variants.

R6.3 The lock detector SHOULD be generated from skill manifests or a shared registry, not manually drift-prone regex.

R6.4 Case-insensitive invocation MUST be covered.

Acceptance criteria:

- Every supported slash command that can initiate a pipeline creates or refreshes a lock.
- Light/heavy variants cannot bypass edit protection.
- Tests cover `user-story` and `ux-sim` naming, including hyphenated and legacy aliases.

## R7. Gate decision vocabulary coherence

R7.1 The documented gate decision examples MUST use only canonical writer decisions.

R7.2 Non-canonical semantics MUST be represented through `detail`, `reason`, `metadata` or protocol event fields, not through `decision`.

R7.3 `STRICT_SPEC_REJECTION` and variant override cases MUST use a canonical decision.

Acceptance criteria:

- Static tests scan prompts and docs for `decision:` values outside the canonical set.
- Runtime tests prove invalid decisions throw in writer tests but are absent in first-party prompts.
- Fidelity reporter and gate writer share the same decision vocabulary.

## R8. Unified JSONL writer and concurrency safety

R8.1 Gate decisions, protocol events and run logs MUST be written through a safe writer or a clearly separated safe writer family.

R8.2 The writer MUST sanitize free-text fields, serialize with `JSON.stringify`, round-trip parse and use a lock or equivalent concurrency control.

R8.3 Comments MUST not claim exclusive locking where none exists.

R8.4 Lock files MUST include stale recovery or bounded retry behavior.

R8.5 `protocol-events.jsonl` MUST not use raw append in Claude Code runtime paths.

Acceptance criteria:

- Concurrent appends from multiple workers produce parseable JSONL with no interleaved lines.
- Malformed text, newline injection and control characters cannot break JSONL parsing.
- Tests prove stale locks are handled without hanging indefinitely.

## R9. Test suite completeness

R9.1 `npm test` MUST run all required test categories for Claude Code plugin correctness.

Required categories:

- Unit tests
- Hook tests
- Regression tests
- Compatibility tests where relevant to Claude Code behavior
- Packaging smoke tests
- Watchdog tests

R9.2 Test runner MUST have per-test timeout.

R9.3 Test output MUST identify failed suite names clearly.

R9.4 CI or local release script MUST fail on missing test categories.

Acceptance criteria:

- A test placed in `tests/unit` is executed by default.
- A hung test is terminated and reported.
- Packaging tests prove marketplace installability.

## R10. Fidelity and audit semantics

R10.1 The system MUST distinguish gate coverage from quality outcome.

R10.2 If `fidelity_score` remains, docs MUST define exactly what it means.

R10.3 Unknown values MUST remain null or unknown where semantically unknown, not be coerced to zero unless zero is true.

Acceptance criteria:

- Reports label gate coverage separately from final quality outcome.
- Run-log fields do not convert unknown duration or unknown expected gates into misleading zero values unless explicitly documented.
- Watchdog can detect a run with all gates triggered but a failed outcome.

## R11. Adversarial review loop requirement

R11.1 Every task group MUST end with an adversarial review.

R11.2 The adversarial reviewer MUST receive only the diff, relevant tests, acceptance criteria and task group scope.

R11.3 If findings are returned, implementation MUST loop back to implementer or bugfix.

R11.4 A maximum of three review-fix loops is allowed per group.

R11.5 If findings persist after the third loop, the agent MUST stop the current approach and create a new approach before proceeding.

Acceptance criteria:

- Each task group records review attempt count.
- Attempt 3 failure creates an `alternative_approach` note before further code changes.
- The watchdog rejects a final run missing adversarial review evidence.

## R12. Release, marketplace and global Claude Code availability

R12.1 The final implementation MUST be pushed to GitHub.

R12.2 The marketplace metadata MUST be updated so marketplace users receive the new plugin ref.

R12.3 The release process MUST create or update the appropriate GitHub tag or release ref.

R12.4 The local repository located on drive D, or the configured separate plugin repository path, MUST be synchronized with the final repository state.

R12.5 The global Claude Code installation on the current machine MUST be refreshed so the plugin is available in any project.

R12.6 The implementation MUST verify availability from outside the repo where the implementation happened.

Acceptance criteria:

- A fresh project can invoke the plugin after global sync.
- Marketplace `source.ref` points to the released tag or commit.
- The watchdog captures the release ref, installed plugin version and global invocation proof.

## R13. Safety and rollback

R13.1 Destructive local operations MUST be avoided.

R13.2 Any sync into global Claude Code directories MUST create a backup or use an official Claude Code install/update command.

R13.3 If a release step fails, the agent MUST stop before publishing partial marketplace metadata.

R13.4 If local global installation fails, the GitHub release may remain valid but the watchdog MUST mark local-global availability as failed.

Acceptance criteria:

- The release checklist includes rollback instructions.
- Global sync reports source path, target path, version before and after, and verification command output.
